// Server tĩnh nhỏ cho game Đập Chuột — chỉ dùng thư viện có sẵn của Node.js.
//   /            → app/      (index.html, style.css, game.js)
//   /design/...  → design/   (tokens.css mà app/style.css nạp qua ../design/)
//   /healthz     → "ok" (dùng cho kiểm tra sức khoẻ container)
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

const ROOTS = [
  { prefix: "/design/", dir: path.join(__dirname, "design") },
  { prefix: "/", dir: path.join(__dirname, "app") },
];

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, "Content-Type": "text/plain; charset=utf-8", ...headers });
  res.end(body);
}

// Tìm file ứng với URL; trả về null nếu không hợp lệ hoặc nằm ngoài thư mục được phép.
function resolveFile(urlPath) {
  const root = ROOTS.find((r) => urlPath.startsWith(r.prefix));
  if (!root) return null;
  let rel = urlPath.slice(root.prefix.length);
  if (rel === "" || rel.endsWith("/")) rel += "index.html";
  const full = path.resolve(root.dir, rel);
  if (full !== root.dir && !full.startsWith(root.dir + path.sep)) return null;   // chặn ../
  return full;
}

const server = http.createServer((req, res) => {
  const started = Date.now();
  res.on("finish", () => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url} ${res.statusCode} ${Date.now() - started}ms`);
  });

  if (req.method !== "GET" && req.method !== "HEAD") {
    return send(res, 405, "Method Not Allowed", { Allow: "GET, HEAD" });
  }

  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    return send(res, 400, "Bad Request");
  }
  if (urlPath.includes("\0")) return send(res, 400, "Bad Request");

  if (urlPath === "/healthz") return send(res, 200, "ok", { "Cache-Control": "no-store" });

  const file = resolveFile(urlPath);
  if (!file) return send(res, 404, "Not Found");

  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) return send(res, 404, "Not Found");
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": "no-cache",
      "Last-Modified": stat.mtime.toUTCString(),
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file)
      .on("error", () => res.destroy())
      .pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Đập Chuột đang chạy tại http://localhost:${PORT} (lắng nghe ${HOST}:${PORT})`);
});

// Dừng gọn khi Docker gửi tín hiệu tắt
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    console.log(`Nhận ${sig}, đang dừng server…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}

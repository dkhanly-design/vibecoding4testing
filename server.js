// Server cho game Đập Chuột.
//   /                    → app/      (game)
//   /design/...          → design/   (tokens.css)
//   /admin/login         → trang đăng nhập admin (S-08)
//   /admin, /admin/      → trang danh sách (S-09), chỉ khi đã đăng nhập
//   /admin/*.css, *.js   → tài nguyên tĩnh của trang admin
//   /api/...             → API (src/api.js)
//   /healthz             → "ok" nếu kết nối được database
"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { loadConfig } = require("./src/config");
const { createPool, waitForDb, migrate } = require("./src/db");
const { createApi } = require("./src/api");

const config = loadConfig();
if (config.errors.length) {
  for (const e of config.errors) console.error(`[config] ${e}`);
  console.error("[config] Máy chủ không khởi động. Kiểm tra file .env (xem .env.example).");
  process.exit(1);
}

const pool = createPool(config);
const api = createApi({ pool, config });

const DIRS = {
  app: path.join(__dirname, "app"),
  design: path.join(__dirname, "design"),
  admin: path.join(__dirname, "admin"),
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": [
    "default-src 'self'",
    "style-src 'self' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; "),
};

function sendText(res, status, body, headers = {}) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", ...headers });
  res.end(body);
}
function redirect(res, location) {
  res.writeHead(302, { Location: location, "Cache-Control": "no-store" });
  res.end();
}

// Phục vụ một file trong thư mục gốc cho phép; chặn ../
function serveFile(req, res, rootDir, rel, extraHeaders = {}) {
  const full = path.resolve(rootDir, rel || "index.html");
  if (full !== rootDir && !full.startsWith(rootDir + path.sep)) return sendText(res, 404, "Not Found");
  fs.stat(full, (err, stat) => {
    if (err || !stat.isFile()) return sendText(res, 404, "Not Found");
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(full).toLowerCase()] || "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": "no-cache",
      "Last-Modified": stat.mtime.toUTCString(),
      ...extraHeaders,
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(full).on("error", () => res.destroy()).pipe(res);
  });
}

async function handle(req, res) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);

  let url, pathname;
  try {
    url = new URL(req.url, "http://localhost");
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return sendText(res, 400, "Bad Request");
  }
  if (pathname.includes("\0")) return sendText(res, 400, "Bad Request");

  if (await api.handle(req, res, url)) return;

  if (req.method !== "GET" && req.method !== "HEAD") {
    return sendText(res, 405, "Method Not Allowed", { Allow: "GET, HEAD" });
  }

  if (pathname === "/healthz") {
    try {
      await pool.query("SELECT 1");
      return sendText(res, 200, "ok", { "Cache-Control": "no-store" });
    } catch {
      return sendText(res, 503, "database unavailable", { "Cache-Control": "no-store" });
    }
  }

  // Trang quản trị
  if (pathname === "/admin" || pathname === "/admin/" || pathname === "/admin/index.html") {
    if (!api.isAdmin(req)) return redirect(res, "/admin/login");
    if (pathname === "/admin") return redirect(res, "/admin/");
    return serveFile(req, res, DIRS.admin, "index.html", { "Cache-Control": "no-store" });
  }
  if (pathname === "/admin/login") {
    if (api.isAdmin(req)) return redirect(res, "/admin/");
    return serveFile(req, res, DIRS.admin, "login.html", { "Cache-Control": "no-store" });
  }
  if (pathname.startsWith("/admin/")) {
    const rel = pathname.slice("/admin/".length);
    if (!/^[\w-]+\.(css|js)$/.test(rel)) return sendText(res, 404, "Not Found");   // chỉ tài nguyên tĩnh
    return serveFile(req, res, DIRS.admin, rel);
  }

  if (pathname.startsWith("/design/")) return serveFile(req, res, DIRS.design, pathname.slice("/design/".length));

  const rel = pathname.slice(1);
  return serveFile(req, res, DIRS.app, rel === "" || rel.endsWith("/") ? rel + "index.html" : rel);
}

const server = http.createServer((req, res) => {
  const started = Date.now();
  res.on("finish", () => {
    // Không ghi query string (có thể chứa từ khoá tìm kiếm là email / SĐT) — F-31
    const p = String(req.url).split("?")[0];
    if (p !== "/healthz" || res.statusCode !== 200) {
      console.log(`${new Date().toISOString()} ${req.method} ${p} ${res.statusCode} ${Date.now() - started}ms`);
    }
  });
  handle(req, res).catch((err) => {
    console.error(`${new Date().toISOString()} [server] lỗi: ${err.message}`);
    if (!res.headersSent) sendText(res, 500, "Internal Server Error");
    else res.destroy();
  });
});

(async () => {
  try {
    await waitForDb(pool);
    await migrate(pool);
  } catch (err) {
    console.error(`[db] Không khởi động được: ${err.message}`);
    process.exit(1);
  }
  server.listen(config.port, config.host, () => {
    console.log(`Đập Chuột đang chạy tại http://localhost:${config.port} (lắng nghe ${config.host}:${config.port})`);
    console.log(`Trang quản trị: http://localhost:${config.port}/admin`);
  });
})();

// Dừng gọn khi Docker gửi tín hiệu tắt
for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => {
    console.log(`Nhận ${sig}, đang dừng server…`);
    server.close(() => pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}

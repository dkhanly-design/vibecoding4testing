"use strict";
// API máy chủ (docs/04 · mục 15).

const { LIMITS } = require("./config");
const V = require("./validate");
const { RateLimiter, LoginGuard, SessionStore, safeEqual, newPlayerToken, hashToken } = require("./security");
const { toCsv, fileStamp } = require("./csv");

const COOKIE = "dc_admin";
const SORTS = {
  full_name: "p.full_name", email: "p.email", phone: "p.phone",
  created_at: "p.created_at", updated_at: "p.updated_at",
  rounds_count: "rounds_count", best_score: "best_score", last_played_at: "last_played_at",
};

function createApi({ pool, config }) {
  const regLimiter = new RateLimiter(LIMITS.REGISTRATION_PER_HOUR, 60 * 60 * 1000);
  const roundLimiter = new RateLimiter(LIMITS.ROUNDS_PER_HOUR, 60 * 60 * 1000);
  const loginGuard = new LoginGuard();
  const sessions = new SessionStore();
  const sweeper = setInterval(() => {
    regLimiter.sweep(); roundLimiter.sweep(); loginGuard.sweep(); sessions.sweep();
  }, 60 * 1000);
  sweeper.unref();

  // ---------- Tiện ích HTTP ----------
  const clientIp = (req) => {
    if (config.trustProxy) {
      const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
      if (fwd) return fwd;
    }
    return req.socket.remoteAddress || "unknown";
  };
  const isHttps = (req) => config.trustProxy && String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https";

  function json(res, status, body, headers = {}) {
    const data = body === undefined ? "" : JSON.stringify(body);
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    });
    res.end(data);
  }
  const fail = (res, status, error, extra = {}) => json(res, status, { error, ...extra });

  function readJson(req) {
    return new Promise((resolve, reject) => {
      const type = String(req.headers["content-type"] || "");
      if (!type.startsWith("application/json")) return reject(Object.assign(new Error("unsupported_media_type"), { status: 415 }));
      let size = 0; const chunks = [];
      req.on("data", (c) => {
        size += c.length;
        if (size > LIMITS.JSON_BODY_MAX_BYTES) { reject(Object.assign(new Error("payload_too_large"), { status: 413 })); req.destroy(); return; }
        chunks.push(c);
      });
      req.on("end", () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "null")); }
        catch { reject(Object.assign(new Error("invalid_json"), { status: 400 })); }
      });
      req.on("error", reject);
    });
  }

  function parseCookies(req) {
    const out = {};
    for (const part of String(req.headers.cookie || "").split(";")) {
      const i = part.indexOf("=");
      if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
    return out;
  }
  const sessionId = (req) => parseCookies(req)[COOKIE];
  const isAdmin = (req) => sessions.touch(sessionId(req));

  function cookieHeader(req, value, maxAgeSec) {
    const parts = [`${COOKIE}=${value}`, "HttpOnly", "SameSite=Strict", "Path=/", `Max-Age=${maxAgeSec}`];
    if (isHttps(req)) parts.push("Secure");
    return parts.join("; ");
  }

  // R-27: yêu cầu thay đổi dữ liệu phải đến từ chính trang này
  function sameOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return false;
    const host = req.headers.host;
    try {
      const u = new URL(origin);
      if (u.host !== host) return false;
      const proto = isHttps(req) ? "https:" : null;
      return proto ? u.protocol === proto : (u.protocol === "http:" || u.protocol === "https:");
    } catch { return false; }
  }

  const audit = (event, req, extra = {}) => {
    const fields = Object.entries({ ip: clientIp(req), ...extra }).map(([k, v]) => `${k}=${v}`).join(" ");
    console.log(`${new Date().toISOString()} [admin] ${event} ${fields}`);
  };

  const bearer = (req) => {
    const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(String(req.headers.authorization || ""));
    return m ? m[1] : null;
  };

  // ---------- Người chơi ----------
  async function registerPlayer(req, res) {
    if (!regLimiter.take(clientIp(req))) return fail(res, 429, "rate_limited");
    const body = await readJson(req);
    const checked = V.checkRegistration(body);
    if (checked.fields) return fail(res, 422, "invalid_fields", { fields: checked.fields });
    const p = checked.value;
    const token = newPlayerToken();
    const oldToken = bearer(req);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // R-21: email đã có → cập nhật, giữ id và lịch sử
      const { rows } = await client.query(
        `INSERT INTO players (full_name, email, phone, search_text, consented_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (email) DO UPDATE SET
           full_name = EXCLUDED.full_name, phone = EXCLUDED.phone, search_text = EXCLUDED.search_text,
           consented_at = now(), updated_at = now()
         RETURNING id`,
        [p.fullName, p.email, p.phone, V.searchTextOf(p)]);
      const playerId = rows[0].id;
      // R-24a: máy này đăng ký lại → bỏ mã cũ của máy
      if (oldToken) await client.query("DELETE FROM player_devices WHERE token_hash = $1", [hashToken(oldToken)]);
      await client.query("INSERT INTO player_devices (token_hash, player_id) VALUES ($1, $2)", [hashToken(token), playerId]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
    return json(res, 200, { token, displayName: V.displayNameOf(p.fullName) });
  }

  async function submitRound(req, res) {
    const token = bearer(req);
    if (!token) return fail(res, 401, "unauthorized");
    const dev = await pool.query(
      "UPDATE player_devices SET last_used_at = now() WHERE token_hash = $1 RETURNING player_id", [hashToken(token)]);
    if (!dev.rowCount) return fail(res, 401, "unauthorized");
    const playerId = dev.rows[0].player_id;
    if (!roundLimiter.take(String(playerId))) return fail(res, 429, "rate_limited");
    const body = await readJson(req);
    const checked = V.checkRound(body);
    if (checked.error) return fail(res, 422, checked.error);
    const r = checked.value;
    const ins = await pool.query(
      `INSERT INTO rounds (player_id, round_id, score, hits, bombs_hit, missed, ended_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (player_id, round_id) DO NOTHING RETURNING id`,
      [playerId, r.roundId, r.score, r.hits, r.bombsHit, r.missed, r.endedAt]);
    return json(res, ins.rowCount ? 201 : 200, { ok: true });
  }

  // ---------- Admin ----------
  async function login(req, res) {
    const ip = clientIp(req);
    if (loginGuard.isLocked(ip)) { audit("login_locked", req); return fail(res, 429, "locked"); }
    if (!sameOrigin(req)) return fail(res, 403, "forbidden");
    const body = await readJson(req);
    const u = body && typeof body.username === "string" ? body.username : "";
    const pw = body && typeof body.password === "string" ? body.password : "";
    const ok = safeEqual(u, config.adminUsername) & safeEqual(pw, config.adminPassword);   // luôn so cả hai
    if (!ok) {
      loginGuard.fail(ip);
      audit("login_failed", req);
      return fail(res, 401, "invalid_credentials");
    }
    loginGuard.success(ip);
    const old = sessionId(req);
    if (old) sessions.destroy(old);
    const id = sessions.create();
    audit("login_ok", req);
    res.writeHead(204, { "Set-Cookie": cookieHeader(req, id, LIMITS.SESSION_ABSOLUTE_MS / 1000), "Cache-Control": "no-store" });
    res.end();
  }

  function logout(req, res) {
    if (!sameOrigin(req)) return fail(res, 403, "forbidden");
    const id = sessionId(req);
    if (id) sessions.destroy(id);
    audit("logout", req);
    res.writeHead(204, { "Set-Cookie": cookieHeader(req, "", 0), "Cache-Control": "no-store" });
    res.end();
  }

  // Điều kiện tìm kiếm + sắp xếp dùng chung cho danh sách và CSV (R-28)
  function buildQuery(params) {
    const q = String(params.get("q") || "").trim().slice(0, LIMITS.SEARCH_MAX_LENGTH);
    const sortKey = SORTS[params.get("sort")] ? params.get("sort") : "created_at";
    const dir = params.get("dir") === "asc" ? "ASC" : "DESC";
    const where = []; const args = [];
    if (q) {
      const esc = (s) => s.replace(/[\\%_]/g, (c) => "\\" + c);
      args.push(`%${esc(V.foldText(q))}%`);
      const conds = [`p.search_text LIKE $${args.length}`];
      if (/^[\d\s.+()-]+$/.test(q)) {
        const digits = V.normalizePhone(q);
        if (digits) { args.push(`%${esc(digits)}%`); conds.push(`p.phone LIKE $${args.length}`); }
      }
      where.push(`(${conds.join(" OR ")})`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const orderSql = `ORDER BY ${SORTS[sortKey]} ${dir} NULLS LAST, p.id ${dir}`;
    return { q, sortKey, dir, whereSql, orderSql, args };
  }
  const SELECT_LIST = `
    SELECT p.id, p.full_name, p.email, p.phone, p.created_at, p.updated_at,
           count(r.id)::int AS rounds_count, max(r.score) AS best_score, max(r.ended_at) AS last_played_at
    FROM players p LEFT JOIN rounds r ON r.player_id = p.id`;

  async function listPlayers(req, res, params) {
    const b = buildQuery(params);
    const pageSize = LIMITS.ADMIN_PAGE_SIZE;
    const total = (await pool.query(`SELECT count(*)::int AS n FROM players p ${b.whereSql}`, b.args)).rows[0].n;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(pages, Math.max(1, parseInt(params.get("page"), 10) || 1));
    const { rows } = await pool.query(
      `${SELECT_LIST} ${b.whereSql} GROUP BY p.id ${b.orderSql} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, b.args);
    return json(res, 200, {
      total, page, pages, pageSize, sort: b.sortKey, dir: b.dir.toLowerCase(),
      items: rows.map((r) => ({
        id: String(r.id), fullName: r.full_name, email: r.email, phone: V.formatPhone(r.phone),
        createdAt: r.created_at, updatedAt: r.updated_at,
        roundsCount: r.rounds_count, bestScore: r.best_score, lastPlayedAt: r.last_played_at,
      })),
    });
  }

  async function exportCsv(req, res, params) {
    const b = buildQuery(params);
    const { rows } = await pool.query(
      `${SELECT_LIST} ${b.whereSql} GROUP BY p.id ${b.orderSql} LIMIT ${LIMITS.CSV_MAX_ROWS}`, b.args);
    const csv = toCsv(rows);
    audit("export_csv", req, { rows: rows.length });
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="dap-chuot-nguoi-choi-${fileStamp()}.csv"`,
      "Cache-Control": "no-store",
    });
    res.end(csv);
  }

  async function deletePlayer(req, res, id) {
    if (!sameOrigin(req)) return fail(res, 403, "forbidden");
    if (!/^\d{1,18}$/.test(id)) return fail(res, 404, "not_found");
    const r = await pool.query("DELETE FROM players WHERE id = $1 RETURNING id", [id]);   // R-29: cascade
    if (!r.rowCount) return fail(res, 404, "not_found");
    audit("delete_player", req, { player_id: id });
    res.writeHead(204, { "Cache-Control": "no-store" });
    res.end();
  }

  // ---------- Bộ định tuyến API ----------
  // Trả về true nếu đã xử lý yêu cầu.
  async function handle(req, res, url) {
    const p = url.pathname;
    if (!p.startsWith("/api/")) return false;
    const m = req.method;
    try {
      if (p === "/api/players" && m === "POST") return await registerPlayer(req, res), true;
      if (p === "/api/rounds" && m === "POST") return await submitRound(req, res), true;
      if (p === "/api/admin/login" && m === "POST") return await login(req, res), true;
      if (p.startsWith("/api/admin/")) {
        if (!isAdmin(req)) return fail(res, 401, "unauthorized"), true;
        if (p === "/api/admin/logout" && m === "POST") return logout(req, res), true;
        if (p === "/api/admin/players" && m === "GET") return await listPlayers(req, res, url.searchParams), true;
        if (p === "/api/admin/players.csv" && m === "GET") return await exportCsv(req, res, url.searchParams), true;
        const del = /^\/api\/admin\/players\/([^/]+)$/.exec(p);
        if (del && m === "DELETE") return await deletePlayer(req, res, del[1]), true;
      }
      fail(res, 404, "not_found");
    } catch (err) {
      if (err.status) { if (!res.headersSent) fail(res, err.status, err.message); }
      else {
        console.error(`${new Date().toISOString()} [api] lỗi ${m} ${p}: ${err.message}`);
        if (!res.headersSent) fail(res, 500, "server_error");
      }
    }
    return true;
  }

  return { handle, isAdmin };
}

module.exports = { createApi };

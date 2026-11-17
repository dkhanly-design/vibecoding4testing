"use strict";
// Cấu hình đọc từ biến môi trường + hằng số (docs/04 · mục 16).

const LIMITS = Object.freeze({
  REGISTRATION_PER_HOUR: 10,     // / IP
  ROUNDS_PER_HOUR: 120,          // / người chơi
  LOGIN_MAX_FAILS: 5,            // trong 15 phút / IP
  LOGIN_WINDOW_MS: 15 * 60 * 1000,
  LOGIN_LOCK_MS: 15 * 60 * 1000,
  SESSION_ABSOLUTE_MS: 8 * 60 * 60 * 1000,
  SESSION_IDLE_MS: 30 * 60 * 1000,
  ADMIN_PAGE_SIZE: 20,
  CSV_MAX_ROWS: 50000,
  ROUND_MAX_OBJECTS: 150,
  JSON_BODY_MAX_BYTES: 16 * 1024,
  SEARCH_MAX_LENGTH: 100,
});

function loadConfig(env = process.env) {
  const errors = [];
  const adminUsername = (env.ADMIN_USERNAME || "").trim();
  const adminPassword = env.ADMIN_PASSWORD || "";
  if (!adminUsername) errors.push("Thiếu ADMIN_USERNAME");
  if (!adminPassword) errors.push("Thiếu ADMIN_PASSWORD");
  else if (adminPassword.length < 12) errors.push("ADMIN_PASSWORD phải có ít nhất 12 ký tự");
  if (!env.DATABASE_URL && !(env.PGHOST && env.PGUSER && env.PGPASSWORD && env.PGDATABASE)) {
    errors.push("Thiếu cấu hình database (DATABASE_URL hoặc PGHOST/PGUSER/PGPASSWORD/PGDATABASE)");
  }
  return {
    errors,
    port: Number(env.PORT) || 3000,
    host: env.HOST || "0.0.0.0",
    trustProxy: env.TRUST_PROXY === "1" || env.TRUST_PROXY === "true",
    adminUsername,
    adminPassword,
    databaseUrl: env.DATABASE_URL || null,
  };
}

module.exports = { LIMITS, loadConfig };

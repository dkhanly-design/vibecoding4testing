"use strict";
// Kết nối PostgreSQL và tự chạy migration khi khởi động (docs/04 · mục 14).

const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

function createPool(config) {
  // Không có DATABASE_URL → thư viện pg tự đọc PGHOST, PGUSER, PGPASSWORD, PGDATABASE
  const pool = new Pool(config.databaseUrl ? { connectionString: config.databaseUrl } : {});
  pool.on("error", (err) => console.error(`[db] lỗi kết nối nền: ${err.message}`));
  return pool;
}

async function waitForDb(pool, { attempts = 30, delayMs = 1000 } = {}) {
  for (let i = 1; i <= attempts; i++) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (err) {
      if (i === attempts) throw err;
      console.log(`[db] chưa kết nối được (${err.code || err.message}), thử lại ${i}/${attempts}…`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

async function migrate(pool, dir = path.join(__dirname, "..", "migrations")) {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(424242)");   // tránh 2 tiến trình migrate cùng lúc
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set((await client.query("SELECT version FROM schema_migrations")).rows.map((r) => r.version));
    const files = fs.readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = fs.readFileSync(path.join(dir, f), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [f]);
        await client.query("COMMIT");
        console.log(`[db] đã áp dụng migration ${f}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${f} lỗi: ${err.message}`);
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(424242)").catch(() => {});
    client.release();
  }
}

module.exports = { createPool, waitForDb, migrate };

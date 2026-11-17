"use strict";
// Giới hạn số lần (F-30), phiên admin (R-27), so sánh mật khẩu (R-26), mã người chơi (R-24).

const crypto = require("node:crypto");
const { LIMITS } = require("./config");

// ---------- Giới hạn theo cửa sổ thời gian ----------
class RateLimiter {
  constructor(limit, windowMs) {
    this.limit = limit; this.windowMs = windowMs; this.hits = new Map();
  }
  // true nếu còn được phép (và ghi nhận lần này)
  take(key, now = Date.now()) {
    const list = (this.hits.get(key) || []).filter((t) => now - t < this.windowMs);
    if (list.length >= this.limit) { this.hits.set(key, list); return false; }
    list.push(now); this.hits.set(key, list); return true;
  }
  sweep(now = Date.now()) {
    for (const [k, list] of this.hits) {
      const keep = list.filter((t) => now - t < this.windowMs);
      if (keep.length) this.hits.set(k, keep); else this.hits.delete(k);
    }
  }
}

// ---------- Khoá đăng nhập sau nhiều lần sai ----------
class LoginGuard {
  constructor() { this.fails = new Map(); this.lockedUntil = new Map(); }
  isLocked(ip, now = Date.now()) {
    const until = this.lockedUntil.get(ip);
    if (until && until > now) return true;
    if (until) this.lockedUntil.delete(ip);
    return false;
  }
  fail(ip, now = Date.now()) {
    const list = (this.fails.get(ip) || []).filter((t) => now - t < LIMITS.LOGIN_WINDOW_MS);
    list.push(now);
    this.fails.set(ip, list);
    if (list.length >= LIMITS.LOGIN_MAX_FAILS) {
      this.lockedUntil.set(ip, now + LIMITS.LOGIN_LOCK_MS);
      this.fails.delete(ip);
    }
  }
  success(ip) { this.fails.delete(ip); }
  sweep(now = Date.now()) {
    for (const [ip, until] of this.lockedUntil) if (until <= now) this.lockedUntil.delete(ip);
    for (const [ip, list] of this.fails) if (!list.some((t) => now - t < LIMITS.LOGIN_WINDOW_MS)) this.fails.delete(ip);
  }
}

// ---------- Phiên admin trong bộ nhớ ----------
class SessionStore {
  constructor() { this.sessions = new Map(); }
  create(now = Date.now()) {
    const id = crypto.randomBytes(32).toString("base64url");
    this.sessions.set(id, { createdAt: now, lastSeen: now });
    return id;
  }
  // Trả về true nếu phiên còn hiệu lực (và gia hạn thời gian không thao tác)
  touch(id, now = Date.now()) {
    if (!id) return false;
    const s = this.sessions.get(id);
    if (!s) return false;
    if (now - s.createdAt > LIMITS.SESSION_ABSOLUTE_MS || now - s.lastSeen > LIMITS.SESSION_IDLE_MS) {
      this.sessions.delete(id);
      return false;
    }
    s.lastSeen = now;
    return true;
  }
  destroy(id) { this.sessions.delete(id); }
  sweep(now = Date.now()) {
    for (const [id, s] of this.sessions) {
      if (now - s.createdAt > LIMITS.SESSION_ABSOLUTE_MS || now - s.lastSeen > LIMITS.SESSION_IDLE_MS) this.sessions.delete(id);
    }
  }
}

// So sánh thời gian cố định, không lộ độ dài
function safeEqual(a, b) {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

const newPlayerToken = () => crypto.randomBytes(32).toString("base64url");
const hashToken = (token) => crypto.createHash("sha256").update(token).digest();

module.exports = { RateLimiter, LoginGuard, SessionStore, safeEqual, newPlayerToken, hashToken };

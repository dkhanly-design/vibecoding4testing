"use strict";
// Chuẩn hoá và kiểm tra dữ liệu (docs/04 · R-17 → R-19, R-22, R-23, R-28).
// Máy chủ là nơi quyết định cuối cùng; trình duyệt có bản sao các quy tắc này trong app/game.js.

const { LIMITS } = require("./config");

const segmenter = new Intl.Segmenter("vi", { granularity: "grapheme" });
const graphemeCount = (s) => Array.from(segmenter.segment(s)).length;
const graphemes = (s) => Array.from(segmenter.segment(s), (x) => x.segment);

function cleanSpaces(s) {
  return String(s).normalize("NFC").replace(/\s+/gu, " ").trim();
}

// R-17 · Họ và tên
function checkFullName(raw) {
  if (typeof raw !== "string") return { error: "Vui lòng nhập họ và tên" };
  const v = cleanSpaces(raw);
  if (!v) return { error: "Vui lòng nhập họ và tên" };
  const n = graphemeCount(v);
  if (n < 2 || n > 50) return { error: "Họ tên từ 2 đến 50 ký tự" };
  if (!/^[\p{L}\p{M} '.\-]+$/u.test(v) || !/\p{L}/u.test(v)) return { error: "Họ tên chỉ gồm chữ cái và khoảng trắng" };
  return { value: v };
}

// R-18 · Email
const EMAIL_LOCAL = /^[a-z0-9._%+\-=']{1,64}$/;
const EMAIL_DOMAIN = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
function checkEmail(raw) {
  if (typeof raw !== "string" || !raw.trim()) return { error: "Vui lòng nhập email" };
  const v = raw.normalize("NFC").trim().toLowerCase();
  if (v.length > 254) return { error: "Email không hợp lệ" };
  const parts = v.split("@");
  if (parts.length !== 2) return { error: "Email không hợp lệ" };
  const [local, domain] = parts;
  if (!EMAIL_LOCAL.test(local) || local.startsWith(".") || local.endsWith(".") || local.includes("..")) {
    return { error: "Email không hợp lệ" };
  }
  if (!EMAIL_DOMAIN.test(domain)) return { error: "Email không hợp lệ" };
  return { value: v };
}

// R-19 · Số điện thoại di động Việt Nam
function normalizePhone(raw) {
  let v = String(raw).replace(/[\s.\-()]/g, "");
  if (v.startsWith("+84")) v = "0" + v.slice(3);
  else if (v.startsWith("84") && v.length === 11) v = "0" + v.slice(2);
  return v;
}
function checkPhone(raw) {
  if (typeof raw !== "string" || !raw.trim()) return { error: "Vui lòng nhập số điện thoại" };
  const v = normalizePhone(raw.trim());
  if (!/^0[35789]\d{8}$/.test(v)) return { error: "Số điện thoại không hợp lệ" };
  return { value: v };
}
const formatPhone = (p) => (/^\d{10}$/.test(p) ? `${p.slice(0, 4)} ${p.slice(4, 7)} ${p.slice(7)}` : p);

// R-17 → R-20 gộp lại
function checkRegistration(body) {
  const fields = {};
  const out = {};
  const name = checkFullName(body && body.fullName);
  if (name.error) fields.fullName = name.error; else out.fullName = name.value;
  const email = checkEmail(body && body.email);
  if (email.error) fields.email = email.error; else out.email = email.value;
  const phone = checkPhone(body && body.phone);
  if (phone.error) fields.phone = phone.error; else out.phone = phone.value;
  if (!body || body.consent !== true) fields.consent = "Vui lòng đồng ý để tiếp tục";
  return Object.keys(fields).length ? { fields } : { value: out };
}

// R-22 · Tên gọi
function displayNameOf(fullName) {
  const words = fullName.split(" ");
  return graphemes(words[words.length - 1]).slice(0, 12).join("");
}

// R-28 · Bỏ dấu tiếng Việt, chữ thường
function foldText(s) {
  return String(s).normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase();
}
const searchTextOf = ({ fullName, email, phone }) => foldText(`${fullName} ${email} ${phone}`);

// R-23 · Kiểm tra kết quả một lượt
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function checkRound(body, now = Date.now()) {
  if (!body || typeof body !== "object") return { error: "invalid_round" };
  const { roundId, score, hits, bombsHit, missed, endedAt } = body;
  const ints = [score, hits, bombsHit, missed];
  if (typeof roundId !== "string" || !UUID_RE.test(roundId)) return { error: "invalid_round" };
  if (!ints.every((n) => Number.isInteger(n) && n >= 0 && n <= 10000)) return { error: "invalid_round" };
  if (score > hits || score < hits - bombsHit) return { error: "invalid_round" };
  if (hits + bombsHit + missed > LIMITS.ROUND_MAX_OBJECTS) return { error: "invalid_round" };
  const t = typeof endedAt === "string" ? Date.parse(endedAt) : NaN;
  if (Number.isNaN(t) || t > now + 5 * 60 * 1000 || t < now - 7 * 24 * 60 * 60 * 1000) return { error: "invalid_round" };
  return { value: { roundId: roundId.toLowerCase(), score, hits, bombsHit, missed, endedAt: new Date(t) } };
}

module.exports = {
  checkRegistration, checkFullName, checkEmail, checkPhone, normalizePhone, formatPhone,
  displayNameOf, foldText, searchTextOf, checkRound,
};

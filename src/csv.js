"use strict";
// Xuất CSV theo docs/04 · R-30.

const { formatPhone } = require("./validate");

const TZ = "Asia/Ho_Chi_Minh";
const dtParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
function parts(d) {
  const o = {};
  for (const p of dtParts.formatToParts(d)) o[p.type] = p.value;
  return o;
}
// dd/mm/yyyy HH:mm theo giờ Việt Nam
function formatDateTime(d) {
  if (!d) return "";
  const p = parts(new Date(d));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}
// YYYYMMDD-HHmm cho tên file
function fileStamp(d = new Date()) {
  const p = parts(d);
  return `${p.year}${p.month}${p.day}-${p.hour}${p.minute}`;
}

// Bọc ô, chống chèn công thức
function cell(value) {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r\n]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

const HEADER = ["STT", "Họ tên", "Email", "Số điện thoại", "Ngày đăng ký", "Cập nhật gần nhất", "Số lượt chơi", "Điểm cao nhất", "Lần chơi gần nhất"];

function toCsv(rows) {
  const lines = [HEADER.map(cell).join(",")];
  rows.forEach((r, i) => {
    lines.push([
      i + 1, r.full_name, r.email, formatPhone(r.phone),
      formatDateTime(r.created_at), formatDateTime(r.updated_at),
      r.rounds_count, r.best_score ?? "", formatDateTime(r.last_played_at),
    ].map(cell).join(","));
  });
  return "﻿" + lines.join("\r\n") + "\r\n";
}

module.exports = { toCsv, fileStamp, formatDateTime };

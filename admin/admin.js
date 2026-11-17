// S-09 · Danh sách người chơi, S-10 · Xác nhận xoá (F-25 → F-29)
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const el = {
    q: $("q"), clearQ: $("btn-clear-q"), exportBtn: $("btn-export"), summary: $("summary"),
    rows: $("rows"), prev: $("btn-prev"), next: $("btn-next"), pageInfo: $("page-info"),
    logout: $("btn-logout"), dialog: $("confirm-delete"), delDesc: $("del-desc"),
    delOk: $("btn-del-ok"), delCancel: $("btn-del-cancel"), toast: $("toast"),
  };

  // Trạng thái lấy từ địa chỉ trang để tải lại vẫn giữ (F-27)
  const params = new URLSearchParams(location.search);
  const state = {
    q: params.get("q") || "",
    sort: params.get("sort") || "created_at",
    dir: params.get("dir") === "asc" ? "asc" : "desc",
    page: Math.max(1, parseInt(params.get("page"), 10) || 1),
    pages: 1,
  };
  el.q.value = state.q;

  const fmt = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const fmtDate = (iso) => (iso ? fmt.format(new Date(iso)).replace(",", "") : "—");

  function queryString(extra = {}) {
    const p = new URLSearchParams();
    if (state.q) p.set("q", state.q);
    p.set("sort", state.sort);
    p.set("dir", state.dir);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return p.toString();
  }
  function syncUrl() {
    const qs = queryString(state.page > 1 ? { page: state.page } : {});
    history.replaceState(null, "", `/admin/?${qs}`);
    el.exportBtn.href = `/api/admin/players.csv?${queryString()}`;
    el.clearQ.hidden = !state.q;
  }

  function sessionExpired() { location.replace("/admin/login?expired=1"); }

  let toastTimer = null;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.toast.hidden = true; }, 4000);
  }

  // ---------- Tải danh sách ----------
  let loadSeq = 0;
  async function load() {
    const seq = ++loadSeq;
    syncUrl();
    let res;
    try {
      res = await fetch(`/api/admin/players?${queryString({ page: state.page })}`, { credentials: "same-origin" });
    } catch {
      el.summary.textContent = "Không kết nối được máy chủ. Vui lòng thử lại.";
      return;
    }
    if (seq !== loadSeq) return;                 // đã có yêu cầu mới hơn
    if (res.status === 401) return sessionExpired();
    if (!res.ok) { el.summary.textContent = "Không tải được danh sách. Vui lòng thử lại."; return; }
    const data = await res.json();
    state.page = data.page; state.pages = data.pages;
    syncUrl();
    render(data);
  }

  function cell(text, cls) {
    const td = document.createElement("td");
    td.textContent = text;                        // luôn là văn bản thuần
    if (cls) td.className = cls;
    return td;
  }

  function render(data) {
    el.summary.textContent = `${data.total.toLocaleString("vi-VN")} người chơi`;
    el.rows.replaceChildren();
    if (!data.items.length) {
      const tr = document.createElement("tr");
      tr.className = "empty-row";
      const td = cell(state.q ? "Không tìm thấy người chơi phù hợp." : "Chưa có người chơi nào đăng ký.");
      td.colSpan = 9;
      tr.append(td);
      el.rows.append(tr);
    }
    for (const p of data.items) {
      const tr = document.createElement("tr");
      tr.append(
        cell(p.fullName), cell(p.email), cell(p.phone, "nowrap"),
        cell(fmtDate(p.createdAt), "nowrap"), cell(fmtDate(p.updatedAt), "nowrap"),
        cell(String(p.roundsCount), "num"), cell(p.bestScore === null ? "—" : String(p.bestScore), "num"),
        cell(fmtDate(p.lastPlayedAt), "nowrap"),
      );
      const td = document.createElement("td");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-sm btn-danger-soft";
      btn.textContent = "Xoá";
      btn.setAttribute("aria-label", `Xoá ${p.fullName}`);
      btn.addEventListener("click", () => askDelete(p));
      td.append(btn);
      tr.append(td);
      el.rows.append(tr);
    }
    el.pageInfo.textContent = `Trang ${data.page} / ${data.pages}`;
    el.prev.disabled = data.page <= 1;
    el.next.disabled = data.page >= data.pages;
    document.querySelectorAll("th[data-sort]").forEach((th) => {
      if (th.dataset.sort === data.sort) th.setAttribute("aria-sort", data.dir === "asc" ? "ascending" : "descending");
      else th.removeAttribute("aria-sort");
    });
  }

  // ---------- Tìm kiếm (F-27) ----------
  let searchTimer = null;
  function setQuery(q) {
    clearTimeout(searchTimer);
    if (q === state.q) return;
    state.q = q; state.page = 1;
    load();
  }
  el.q.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => setQuery(el.q.value.trim()), 300);
  });
  el.q.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); setQuery(el.q.value.trim()); } });
  el.clearQ.addEventListener("click", () => { el.q.value = ""; setQuery(""); el.q.focus(); });

  // ---------- Sắp xếp, phân trang (F-26) ----------
  document.querySelectorAll("th[data-sort] button").forEach((b) => {
    b.addEventListener("click", () => {
      const key = b.parentElement.dataset.sort;
      if (state.sort === key) state.dir = state.dir === "asc" ? "desc" : "asc";
      else { state.sort = key; state.dir = key === "full_name" || key === "email" ? "asc" : "desc"; }
      state.page = 1;
      load();
    });
  });
  el.prev.addEventListener("click", () => { if (state.page > 1) { state.page -= 1; load(); } });
  el.next.addEventListener("click", () => { if (state.page < state.pages) { state.page += 1; load(); } });

  // ---------- Xoá (F-28) ----------
  let pending = null;
  function askDelete(p) {
    pending = p;
    el.delDesc.textContent =
      `${p.fullName} · ${p.email}. Toàn bộ thông tin và ${p.roundsCount} lượt chơi sẽ bị xoá vĩnh viễn. Không thể hoàn tác.`;
    el.dialog.showModal();
    el.delCancel.focus();                         // mặc định ở nút an toàn
  }
  el.delCancel.addEventListener("click", () => el.dialog.close());
  el.dialog.addEventListener("close", () => { pending = null; });
  el.delOk.addEventListener("click", async () => {
    if (!pending) return;
    const p = pending;
    el.delOk.disabled = true;
    try {
      const res = await fetch(`/api/admin/players/${encodeURIComponent(p.id)}`, { method: "DELETE", credentials: "same-origin" });
      if (res.status === 401) return sessionExpired();
      el.dialog.close();
      if (res.status === 204) toast(`Đã xoá ${p.fullName}`);
      else if (res.status === 404) toast("Người chơi này không còn tồn tại.");
      else toast("Không xoá được, vui lòng thử lại.");
      load();
    } catch {
      toast("Không kết nối được máy chủ. Vui lòng thử lại.");
    } finally {
      el.delOk.disabled = false;
    }
  });

  // ---------- Xuất CSV (F-29) ----------
  el.exportBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(el.exportBtn.href, { credentials: "same-origin" });
      if (res.status === 401) return sessionExpired();
      if (!res.ok) { toast("Không xuất được file, vui lòng thử lại."); return; }
      const name = (/filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "") || [])[1] || "dap-chuot-nguoi-choi.csv";
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast(`Đã xuất ${name}`);
    } catch {
      toast("Không kết nối được máy chủ. Vui lòng thử lại.");
    }
  });

  // ---------- Đăng xuất (F-25) ----------
  el.logout.addEventListener("click", async () => {
    try { await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" }); } catch { /* vẫn về trang đăng nhập */ }
    location.replace("/admin/login");
  });

  // Quay lại trang này bằng nút Back sau khi đăng xuất → kiểm tra lại phiên
  window.addEventListener("pageshow", (e) => { if (e.persisted) load(); });

  load();
})();

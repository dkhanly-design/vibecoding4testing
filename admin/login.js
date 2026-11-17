// S-08 · Đăng nhập admin (F-24)
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const form = $("login-form"), err = $("login-error"), info = $("login-info"), submit = $("login-submit");

  if (new URLSearchParams(location.search).get("expired") === "1") {
    info.textContent = "Phiên đăng nhập đã hết, vui lòng đăng nhập lại";
    info.hidden = false;
  }
  $("username").focus();

  const showError = (msg) => { err.textContent = msg; err.hidden = !msg; };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    showError("");
    const username = $("username").value;
    const password = $("password").value;
    if (!username || !password) { showError("Vui lòng nhập tên đăng nhập và mật khẩu"); return; }
    submit.disabled = true;
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        credentials: "same-origin",
      });
      if (res.status === 204) { location.replace("/admin/"); return; }
      $("password").value = "";
      if (res.status === 429) showError("Thử lại sau 15 phút");
      else if (res.status === 401) showError("Sai tên đăng nhập hoặc mật khẩu");
      else showError("Không đăng nhập được, vui lòng thử lại.");
      $("password").focus();
    } catch {
      showError("Không kết nối được máy chủ. Vui lòng thử lại.");
    } finally {
      submit.disabled = false;
    }
  });
})();

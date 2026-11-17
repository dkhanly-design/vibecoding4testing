/* Đập Chuột — logic game.
   Tham chiếu: docs/02-chuc-nang.html (F-xx), docs/04-quy-tac-du-lieu.html (R-xx). */
(() => {
  "use strict";

  // ===================== Cấu hình (04 · mục 10) =====================
  const ROUND_SECONDS = 30;
  const COUNTDOWN_SECONDS = 3;
  const GRID_SIZE = 3;
  const WARNING_SECONDS = 5;
  const LEADERBOARD_SIZE = 5;
  const NAME_MAX_LENGTH = 12;
  const MAX_BOMB_STREAK = 2;
  const PHASES = [
    { from: 0,  showMs: 900, gapMs: [400, 700], bombRate: 0.10 },
    { from: 10, showMs: 700, gapMs: [300, 550], bombRate: 0.15 },
    { from: 20, showMs: 550, gapMs: [200, 400], bombRate: 0.20 },
  ];
  const ROUND_MS = ROUND_SECONDS * 1000;
  const FIRST_SPAWN_MS = 250;   // F-04: vật thể đầu tiên trong vòng 0,5 giây
  const GO_MS = 500;            // F-02: chữ "Bắt đầu!" 0,5 giây
  const RESULT_DELAY_MS = 500;  // F-12
  const CLOCK_STEP_MS = 50;     // nhịp cập nhật đồng hồ
  const KEY_TOP5 = "dapchuot.v1.top5";
  const KEY_SETTINGS = "dapchuot.v1.settings";

  // ===================== Tham số test: ?seed, ?debug (05 · mục 3) =====================
  const params = new URLSearchParams(location.search);
  const DEBUG = params.get("debug") === "1";
  const SEED = params.has("seed") ? (parseInt(params.get("seed"), 10) >>> 0) : null;
  let rng = SEED === null ? Math.random : mulberry32(SEED);
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const randInt = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

  // ===================== DOM =====================
  const $ = (id) => document.getElementById(id);
  const screens = {
    start: $("screen-start"), play: $("screen-play"),
    result: $("screen-result"), board: $("screen-board"),
  };
  const el = {
    sound: $("btn-sound"), start: $("btn-start"), viewBoard: $("btn-view-board"),
    miniBoard: $("mini-board"), miniEmpty: $("mini-empty"),
    score: $("score"), time: $("time"), timeBox: $("time-box"), pause: $("btn-pause"),
    progress: $("progress-fill"), phaseFlash: $("phase-flash"), phaseLabel: $("phase-label"),
    grid: $("grid"),
    ovCountdown: $("overlay-countdown"), countdownNum: $("countdown-num"),
    ovPause: $("overlay-pause"), pauseInfo: $("pause-info"), resume: $("btn-resume"), quit: $("btn-quit"),
    resScore: $("result-score"), resRecord: $("result-record"), resTop5: $("result-top5"),
    resNeed: $("result-need"), resDebug: $("result-debug"),
    stHits: $("st-hits"), stBombs: $("st-bombs"), stAcc: $("st-acc"),
    nameForm: $("name-form"), nameField: $("name-field"), nameInput: $("name-input"), nameHint: $("name-hint"),
    skip: $("btn-skip"), againResult: $("btn-again-result"), boardResult: $("btn-board-result"),
    fullBoard: $("full-board"), boardEmpty: $("board-empty"),
    againBoard: $("btn-again-board"), home: $("btn-home"), clear: $("btn-clear"),
    live: $("sr-live"), debug: $("debug-panel"),
  };
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

  // ===================== Lưu trữ (R-14, R-15) =====================
  const storage = (() => {
    let ok = true;
    try {
      const k = "dapchuot.v1.__test";
      localStorage.setItem(k, "1"); localStorage.removeItem(k);
    } catch { ok = false; }
    return {
      get ok() { return ok; },
      read(key) {
        if (!ok) return null;
        try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
      },
      write(key, value) {
        if (!ok) return false;
        try { localStorage.setItem(key, JSON.stringify(value)); return true; }
        catch { ok = false; return false; }
      },
    };
  })();

  // Tên (R-12)
  const segmenter = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter("vi", { granularity: "grapheme" }) : null;
  const graphemes = (s) => segmenter ? Array.from(segmenter.segment(s), (x) => x.segment) : Array.from(s);
  const normalizeName = (s) => String(s).normalize("NFC").replace(/\s+/g, " ").trim();
  function nameError(name) {
    if (name.length === 0) return "Vui lòng nhập tên";
    if (graphemes(name).length > NAME_MAX_LENGTH) return "Tên tối đa 12 ký tự";
    return "";
  }

  // Top 5 (R-11, R-15a)
  const byRank = (a, b) => (b.score - a.score) || (Date.parse(a.playedAt) - Date.parse(b.playedAt));
  function validEntry(e) {
    if (!e || typeof e !== "object") return null;
    if (typeof e.name !== "string") return null;
    const name = normalizeName(e.name);
    if (nameError(name)) return null;
    if (!Number.isInteger(e.score) || e.score < 1) return null;
    if (typeof e.playedAt !== "string" || Number.isNaN(Date.parse(e.playedAt))) return null;
    return { name, score: e.score, playedAt: e.playedAt };
  }
  function loadTop5() {
    const raw = storage.read(KEY_TOP5);
    if (!Array.isArray(raw)) return [];
    return raw.map(validEntry).filter(Boolean).sort(byRank).slice(0, LEADERBOARD_SIZE);
  }
  function loadSettings() {
    const raw = storage.read(KEY_SETTINGS);
    const s = { sound: true, lastName: "" };
    if (raw && typeof raw === "object") {
      if (typeof raw.sound === "boolean") s.sound = raw.sound;
      if (typeof raw.lastName === "string") {
        const n = normalizeName(raw.lastName);
        if (!nameError(n)) s.lastName = n;
      }
    }
    return s;
  }
  let top5 = loadTop5();          // nếu không lưu được, bảng chỉ giữ trong phiên (R-15b)
  const settings = loadSettings();
  const saveTop5 = () => { storage.write(KEY_TOP5, top5); updateStorageWarning(); };
  const saveSettings = () => { storage.write(KEY_SETTINGS, settings); updateStorageWarning(); };
  function updateStorageWarning() {
    document.querySelectorAll(".storage-warn").forEach((n) => { n.hidden = storage.ok; });
  }
  const qualifies = (score) => score > 0 && (top5.length < LEADERBOARD_SIZE || score > top5[top5.length - 1].score);
  const isRecord = (score) => score > 0 && (top5.length === 0 || score > top5[0].score);

  // ===================== Âm thanh (F-09, F-10) =====================
  const audio = (() => {
    let ctx = null;
    function ensure() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      }
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    }
    function tone(freq, start, dur, { type = "sine", gain = 0.18, toFreq = null } = {}) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, start);
      if (toFreq) o.frequency.exponentialRampToValueAtTime(toFreq, start + dur);
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(gain, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
      o.connect(g).connect(ctx.destination);
      o.start(start); o.stop(start + dur + 0.02);
    }
    function noise(start, dur, gain) {
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = buf; g.gain.value = gain;
      src.connect(g).connect(ctx.destination);
      src.start(start);
    }
    const sounds = {
      tick: (t) => tone(1000, t, 0.06, { type: "square", gain: 0.08 }),
      pop: (t) => tone(500, t, 0.12, { toFreq: 1300, gain: 0.25 }),
      boom: (t) => { tone(160, t, 0.35, { toFreq: 40, type: "triangle", gain: 0.35 }); noise(t, 0.3, 0.25); },
      end: (t) => [660, 523, 392].forEach((f, i) => tone(f, t + i * 0.16, 0.15, { type: "triangle", gain: 0.2 })),
      top5: (t) => [523, 659, 784].forEach((f, i) => tone(f, t + i * 0.14, 0.14, { type: "triangle", gain: 0.2 })),
    };
    return {
      unlock() { ensure(); },
      play(name) {
        if (!settings.sound || !ctx) return;   // chỉ phát sau thao tác đầu tiên của người dùng
        if (ctx.state === "suspended") ctx.resume();
        sounds[name](ctx.currentTime + 0.005);
      },
    };
  })();
  const unlockAudio = () => audio.unlock();
  window.addEventListener("pointerdown", unlockAudio, { capture: true });
  window.addEventListener("keydown", unlockAudio, { capture: true });

  function renderSoundButton() {
    el.sound.textContent = settings.sound ? "🔊" : "🔇";
    el.sound.setAttribute("aria-label", settings.sound ? "Tắt tiếng" : "Bật tiếng");
  }
  el.sound.addEventListener("click", () => {
    settings.sound = !settings.sound;
    saveSettings(); renderSoundButton();
  });

  // ===================== Lưới =====================
  const holes = [];
  for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "hole"; b.dataset.index = String(i);
    const c = document.createElement("span");
    c.className = "critter"; c.setAttribute("aria-hidden", "true");
    b.appendChild(c);
    // Ghi nhận ngay lúc chạm xuống (03 · Bố cục)
    b.addEventListener("pointerdown", (e) => { if (e.button === 0 || e.pointerType !== "mouse") whack(i); });
    // Click do bàn phím (Enter/Space khi hang đang focus) có detail = 0
    b.addEventListener("click", (e) => { if (e.detail === 0) whack(i); });
    el.grid.appendChild(b);
    holes.push(b);
  }
  el.grid.addEventListener("contextmenu", (e) => e.preventDefault());
  function setHoleLabel(i, what) {
    holes[i].setAttribute("aria-label", `Hang ${i + 1}, ${what}`);
  }
  holes.forEach((_, i) => setHoleLabel(i, "trống"));

  // ===================== Trạng thái (R-13) =====================
  // idle | countdown | playing | paused | ended
  let state = "idle";
  let round = null;
  let objTimer = null;     // bộ hẹn giờ duy nhất cho vật thể
  let clockTimer = null;   // bộ hẹn giờ duy nhất cho đồng hồ
  let uiTimer = null;      // đếm ngược / chờ hiện kết quả
  let flashTimer = null;   // nhãn "Nhanh hơn!"

  function clearAllTimers() {
    clearTimeout(objTimer); objTimer = null;
    clearTimeout(clockTimer); clockTimer = null;
    clearTimeout(uiTimer); uiTimer = null;
    clearTimeout(flashTimer); flashTimer = null;
  }

  function newRound() {
    return {
      score: 0, hits: 0, bombsHit: 0, missed: 0,
      elapsedBefore: 0,       // ms đã chơi trước đoạn hiện tại
      segmentStart: 0,        // performance.now() lúc bắt đầu đoạn đang chạy
      current: null,          // { hole, type, phase }
      lastHole: -1, spawned: 0, bombStreak: 0,
      phaseIdx: 0, shownSeconds: ROUND_SECONDS,
      stats: PHASES.map(() => ({ objects: 0, bombs: 0 })),
      endedAt: null,
    };
  }
  const elapsed = () => !round ? 0
    : round.elapsedBefore + (state === "playing" ? performance.now() - round.segmentStart : 0);
  const phaseAt = (ms) => {
    let idx = 0;
    PHASES.forEach((p, i) => { if (ms >= p.from * 1000) idx = i; });
    return idx;
  };

  function showScreen(name) {
    Object.entries(screens).forEach(([k, s]) => { s.hidden = k !== name; });
    document.body.classList.toggle("is-playing", name === "play");
  }
  function announce(text) {
    el.live.textContent = "";
    setTimeout(() => { el.live.textContent = text; }, 30);
  }

  // ---------- F-01 · Bắt đầu / F-15 · Chơi lại ----------
  function startRound() {
    if (state === "countdown" || state === "playing" || state === "paused") return;  // TC-03
    clearAllTimers();
    clearGrid();
    round = newRound();
    if (SEED !== null) rng = mulberry32(SEED);   // mỗi lượt lặp lại đúng chuỗi ngẫu nhiên
    if (DEBUG) debugLog.length = 0;
    el.score.textContent = "0";
    renderClock(ROUND_MS);
    el.phaseLabel.textContent = `Pha 1 / ${PHASES.length}`;
    el.phaseFlash.classList.remove("show");
    showScreen("play");
    runCountdown();
  }

  // ---------- F-02 · Đếm ngược ----------
  function runCountdown() {
    state = "countdown";
    el.ovPause.hidden = true;
    el.ovCountdown.hidden = false;
    el.grid.classList.remove("hidden-grid");
    el.grid.classList.add("dim");
    let n = COUNTDOWN_SECONDS;
    const step = () => {
      if (n > 0) {
        setCountdownText(String(n), false);
        audio.play("tick");
        n -= 1;
        uiTimer = setTimeout(step, 1000);
      } else {
        setCountdownText("Bắt đầu!", true);
        uiTimer = setTimeout(beginPlaying, GO_MS);
      }
    };
    step();
  }
  function setCountdownText(text, go) {
    const node = el.countdownNum;
    node.textContent = text;
    node.classList.toggle("go", go);
    node.style.animation = "none"; void node.offsetWidth; node.style.animation = "";
  }

  function beginPlaying() {
    uiTimer = null;
    el.ovCountdown.hidden = true;
    el.grid.classList.remove("dim");
    state = "playing";
    round.segmentStart = performance.now();
    objTimer = setTimeout(spawnNext, FIRST_SPAWN_MS);
    tick();
  }

  // ---------- F-03 · Đồng hồ ----------
  function tick() {
    clockTimer = null;
    if (state !== "playing") return;
    const t = elapsed();
    if (t >= ROUND_MS) { endRound(); return; }
    renderClock(ROUND_MS - t);
    const idx = phaseAt(t);
    if (idx !== round.phaseIdx) {           // F-05: đổi pha
      round.phaseIdx = idx;
      el.phaseLabel.textContent = `Pha ${idx + 1} / ${PHASES.length}`;
      el.phaseFlash.classList.add("show");
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => el.phaseFlash.classList.remove("show"), 1000);
    }
    if (DEBUG) renderDebug(t);
    clockTimer = setTimeout(tick, Math.max(1, Math.min(CLOCK_STEP_MS, ROUND_MS - t)));
  }
  function renderClock(remainingMs) {
    const secs = Math.max(0, Math.ceil(remainingMs / 1000));
    el.time.textContent = String(secs);
    el.progress.style.transform = `scaleX(${Math.max(0, remainingMs) / ROUND_MS})`;
    const warn = secs <= WARNING_SECONDS;
    el.timeBox.classList.toggle("warn", warn);
    el.progress.classList.toggle("warn", warn);
    if (round && state === "playing" && secs !== round.shownSeconds) {
      round.shownSeconds = secs;
      if (warn && secs > 0) audio.play("tick");
      if (warn || secs % 10 === 0) announce(`Còn ${secs} giây`);   // F-18
    }
  }

  // ---------- F-04, F-05, F-06 · Vật thể ----------
  function spawnNext() {
    objTimer = null;
    if (state !== "playing") return;
    const t = elapsed();
    const pIdx = phaseAt(t);
    const phase = PHASES[pIdx];
    if (ROUND_MS - t < phase.showMs) return;            // R-07a: không đủ thời gian hiện

    // R-03: hang khác hang trước đó
    const choices = [];
    for (let i = 0; i < holes.length; i++) if (i !== round.lastHole) choices.push(i);
    const hole = choices[Math.floor(rng() * choices.length)];

    // R-08, R-08a: con đầu tiên là chuột; không quá 2 bom liên tiếp
    let type = "mouse";
    if (round.spawned > 0 && round.bombStreak < MAX_BOMB_STREAK && rng() < phase.bombRate) type = "bomb";
    round.bombStreak = type === "bomb" ? round.bombStreak + 1 : 0;
    round.spawned += 1;
    round.lastHole = hole;
    round.stats[pIdx].objects += 1;
    if (type === "bomb") round.stats[pIdx].bombs += 1;
    if (DEBUG) debugLog.push(type === "bomb" ? "B" : "M");

    round.current = { hole, type, phase: pIdx };
    const h = holes[hole];
    h.querySelector(".critter").textContent = type === "bomb" ? "💣" : "🐭";
    h.classList.toggle("has-bomb", type === "bomb");
    h.classList.remove("squash");
    void h.offsetWidth;
    h.classList.add("up");
    setHoleLabel(hole, type === "bomb" ? "có bom" : "có chuột");
    objTimer = setTimeout(retractByTimeout, phase.showMs);   // R-07: giữ thông số pha lúc xuất hiện
  }

  function retractByTimeout() {
    objTimer = null;
    if (state !== "playing" || !round.current) return;
    if (round.current.type === "mouse") round.missed += 1;   // R-09: chuột bỏ lỡ
    hideCurrent();
    scheduleNext();
  }
  function scheduleNext() {
    const [lo, hi] = PHASES[phaseAt(elapsed())].gapMs;
    objTimer = setTimeout(spawnNext, randInt(lo, hi));
  }
  function hideCurrent() {
    if (!round || !round.current) return;
    const i = round.current.hole;
    holes[i].classList.remove("up", "has-bomb");
    setHoleLabel(i, "trống");
    round.current = null;
  }
  function clearGrid() {
    holes.forEach((h, i) => {
      h.classList.remove("up", "squash", "has-bomb", "flash-bomb", "press");
      h.querySelectorAll(".float-pts").forEach((n) => n.remove());
      setHoleLabel(i, "trống");
    });
    el.grid.classList.remove("shake");
  }

  // ---------- F-07, F-08 · Đập ----------
  function whack(i) {
    if (state !== "playing") return;
    if (elapsed() >= ROUND_MS) { endRound(); return; }       // TC-18
    const cur = round.current;
    const h = holes[i];
    if (!cur || cur.hole !== i) {                           // hang trống
      h.classList.add("press");
      setTimeout(() => h.classList.remove("press"), 120);
      return;
    }
    clearTimeout(objTimer); objTimer = null;
    round.current = null;                                   // mỗi vật thể chỉ tính 1 lần
    if (cur.type === "mouse") {
      round.score += 1; round.hits += 1;
      audio.play("pop");
      h.classList.add("squash");
      floatPoints(h, "+1", "plus");
      setTimeout(() => h.classList.remove("up", "squash"), 100);
    } else {
      round.score = Math.max(0, round.score - 1);           // R-09a
      round.bombsHit += 1;
      audio.play("boom");
      h.classList.remove("up");
      h.classList.add("flash-bomb");
      setTimeout(() => h.classList.remove("flash-bomb", "has-bomb"), 250);
      floatPoints(h, "−1", "minus");
      if (!reducedMotion.matches) {
        el.grid.classList.remove("shake"); void el.grid.offsetWidth; el.grid.classList.add("shake");
      }
    }
    setHoleLabel(i, "trống");
    el.score.textContent = String(round.score);
    announce(`Điểm ${round.score}`);
    scheduleNext();                                          // R-07b
  }
  function floatPoints(hole, text, cls) {
    if (reducedMotion.matches) return;                       // F-08: bỏ hiệu ứng bay
    const f = document.createElement("span");
    f.className = `float-pts ${cls}`;
    f.textContent = text;
    f.setAttribute("aria-hidden", "true");
    hole.appendChild(f);
    f.addEventListener("animationend", () => f.remove());
    setTimeout(() => f.remove(), 600);
  }

  // ---------- F-11 · Tạm dừng ----------
  function pause() {
    if (state === "playing") {
      round.elapsedBefore = elapsed();
    } else if (state !== "countdown") {
      return;
    }
    state = "paused";
    clearAllTimers();
    if (round.current) {                                     // chuột bị ẩn tính là bỏ lỡ
      if (round.current.type === "mouse") round.missed += 1;
      hideCurrent();
    }
    el.ovCountdown.hidden = true;
    el.grid.classList.remove("dim");
    el.grid.classList.add("hidden-grid");
    const secs = Math.max(0, Math.ceil((ROUND_MS - round.elapsedBefore) / 1000));
    el.pauseInfo.textContent = `Điểm: ${round.score} · Còn ${secs} giây`;
    el.ovPause.hidden = false;
    el.resume.focus();
  }
  function resume() {
    if (state !== "paused") return;
    runCountdown();
  }
  function quit() {
    if (state !== "paused") return;
    clearAllTimers();
    state = "idle";
    round = null;
    el.ovPause.hidden = true;
    clearGrid();
    goHome();
  }
  el.pause.addEventListener("click", pause);
  el.resume.addEventListener("click", resume);
  el.quit.addEventListener("click", quit);
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
  window.addEventListener("pagehide", pause);

  // ---------- F-12 · Kết thúc ----------
  function endRound() {
    if (state !== "playing") return;
    round.elapsedBefore = ROUND_MS;
    state = "ended";
    clearAllTimers();
    if (round.current) hideCurrent();
    renderClock(0);
    round.endedAt = new Date().toISOString();
    audio.play("end");
    if (DEBUG) renderDebug(ROUND_MS);
    uiTimer = setTimeout(showResult, RESULT_DELAY_MS);
  }

  function showResult() {
    uiTimer = null;
    const r = round;
    el.resScore.textContent = String(r.score);
    el.stHits.textContent = String(r.hits);
    el.stBombs.textContent = String(r.bombsHit);
    const seen = r.hits + r.missed;
    el.stAcc.textContent = seen === 0 ? "—" : `${Math.round((r.hits / seen) * 100)}%`;   // R-10

    const canSave = !DEBUG && qualifies(r.score);
    el.resRecord.hidden = DEBUG || !isRecord(r.score);
    el.resTop5.hidden = !canSave;
    el.resDebug.hidden = !DEBUG;
    el.nameForm.hidden = !canSave;
    el.boardResult.hidden = canSave;
    const full = top5.length >= LEADERBOARD_SIZE;
    if (!DEBUG && !canSave && full) {                       // R-11d
      const need = top5[top5.length - 1].score - r.score + 1;
      el.resNeed.textContent = `Cần thêm ${need} điểm để vào Top 5`;
      el.resNeed.hidden = false;
    } else {
      el.resNeed.hidden = true;
    }
    setNameError("");
    el.nameInput.value = settings.lastName;
    showScreen("result");
    if (canSave) {
      audio.play("top5");
      if (finePointer.matches) el.nameInput.focus(); else $("result-title").focus();
    } else {
      el.againResult.focus();
    }
  }

  // ---------- F-13 · Nhập tên ----------
  function setNameError(msg) {
    el.nameField.classList.toggle("is-error", !!msg);
    el.nameHint.textContent = msg || "Tối đa 12 ký tự";
    el.nameInput.setAttribute("aria-invalid", msg ? "true" : "false");
  }
  function limitNameLength() {                               // R-12a: không cho gõ quá 12 ký tự
    const g = graphemes(el.nameInput.value.normalize("NFC"));
    if (g.length > NAME_MAX_LENGTH) el.nameInput.value = g.slice(0, NAME_MAX_LENGTH).join("");
  }
  el.nameInput.addEventListener("input", (e) => {
    if (!e.isComposing) limitNameLength();
    if (el.nameField.classList.contains("is-error")) setNameError("");
  });
  el.nameInput.addEventListener("compositionend", limitNameLength);
  el.nameForm.addEventListener("submit", (e) => {
    e.preventDefault();
    if (state !== "ended" || !round) return;
    const name = normalizeName(el.nameInput.value);
    const err = nameError(name);
    if (err) { setNameError(err); el.nameInput.focus(); return; }
    const entry = { name, score: round.score, playedAt: round.endedAt };
    top5 = [...top5, entry].sort(byRank).slice(0, LEADERBOARD_SIZE);   // R-11a, R-11b
    settings.lastName = name;
    saveTop5(); saveSettings();
    round = null; state = "idle";
    showBoard(top5.indexOf(entry));
  });
  el.skip.addEventListener("click", () => { round = null; state = "idle"; showBoard(-1); });

  // ---------- F-14 · Bảng Top 5 ----------
  const MEDALS = ["🥇", "🥈", "🥉"];
  const fmtDate = (iso) => {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  function renderList(listEl, entries, highlight, withDate) {
    listEl.replaceChildren();
    entries.forEach((e, i) => {
      const li = document.createElement("li");
      if (i === highlight) li.className = "me";
      const rank = document.createElement("span");
      rank.className = "rank";
      rank.textContent = MEDALS[i] || `${i + 1}.`;
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = e.name;                             // R-12b: văn bản thuần
      const score = document.createElement("span");
      score.className = "score";
      score.textContent = String(e.score);
      li.append(rank, name, score);
      if (withDate) {
        const date = document.createElement("span");
        date.className = "date";
        date.textContent = fmtDate(e.playedAt);
        li.append(date);
      }
      listEl.append(li);
    });
  }
  function renderMini() {
    renderList(el.miniBoard, top5.slice(0, 3), -1, false);
    el.miniEmpty.hidden = top5.length > 0;
    el.miniBoard.hidden = top5.length === 0;
    el.viewBoard.hidden = top5.length === 0;
  }
  function showBoard(highlight) {
    renderList(el.fullBoard, top5, highlight, true);
    el.boardEmpty.hidden = top5.length > 0;
    el.fullBoard.hidden = top5.length === 0;
    el.clear.hidden = top5.length === 0;
    showScreen("board");
    $("board-title").focus();
  }
  function goHome() {
    renderMini();
    showScreen("start");
    $("start-title").focus();
  }

  // ---------- F-17 · Xoá bảng điểm ----------
  el.clear.addEventListener("click", () => {
    if (!window.confirm("Xoá toàn bộ bảng Top 5? Không thể hoàn tác.")) return;
    top5 = [];
    saveTop5();
    showBoard(-1);
  });

  // ---------- Nút điều hướng ----------
  el.start.addEventListener("click", startRound);
  el.againResult.addEventListener("click", () => { state = "idle"; startRound(); });
  el.againBoard.addEventListener("click", () => { state = "idle"; startRound(); });
  el.viewBoard.addEventListener("click", () => showBoard(-1));
  el.boardResult.addEventListener("click", () => { round = null; state = "idle"; showBoard(-1); });
  el.home.addEventListener("click", goHome);

  // ---------- F-16 · Bàn phím ----------
  const KEYMAP = {
    Numpad7: 0, Numpad8: 1, Numpad9: 2, Numpad4: 3, Numpad5: 4, Numpad6: 5, Numpad1: 6, Numpad2: 7, Numpad3: 8,
    KeyQ: 0, KeyW: 1, KeyE: 2, KeyA: 3, KeyS: 4, KeyD: 5, KeyZ: 6, KeyX: 7, KeyC: 8,
  };
  document.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (state === "playing" && (e.code === "Escape" || e.code === "KeyP")) {
      e.preventDefault(); pause(); return;
    }
    if (e.code in KEYMAP && state === "playing") {
      e.preventDefault();
      if (e.repeat) return;                                  // giữ phím chỉ tính 1 lần
      const i = KEYMAP[e.code];
      whack(i);
    }
  });

  // ---------- Debug ----------
  const debugLog = [];
  function renderDebug(t) {
    const p = PHASES[phaseAt(t)];
    const lines = [
      `seed: ${SEED === null ? "ngẫu nhiên" : SEED}   trạng thái: ${state}`,
      `t = ${(t / 1000).toFixed(3)} s   pha ${phaseAt(t) + 1}`,
      `hiện ${p.showMs} ms · nghỉ ${p.gapMs[0]}–${p.gapMs[1]} ms · bom ${Math.round(p.bombRate * 100)}%`,
      ...round.stats.map((s, i) => `pha ${i + 1}: ${s.objects} vật thể, ${s.bombs} bom`),
      `chuỗi: ${debugLog.join("")}`,
    ];
    el.debug.textContent = lines.join("\n");
  }
  if (DEBUG) {
    el.debug.hidden = false;
    el.debug.textContent = `debug bật · seed: ${SEED === null ? "ngẫu nhiên" : SEED}`;
    window.dapChuotDebug = {
      get state() { return state; },
      get round() { return round; },
      get log() { return debugLog.join(""); },
      PHASES,
    };
  }

  // ---------- Khởi động ----------
  renderSoundButton();
  updateStorageWarning();
  renderMini();
  showScreen("start");
})();

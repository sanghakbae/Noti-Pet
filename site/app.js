import { app, SDK, isLocal } from "./firebase.js?v=dev";
import { normalizeEmail } from "./admin/license.js?v=dev";

const $ = (s, el = document) => el.querySelector(s);

// ---------- 통계 (배포 주소에서만) ----------
let track = () => {};
if (!isLocal) {
  import(`${SDK}/firebase-analytics.js`).then(async ({ getAnalytics, logEvent, isSupported }) => {
    if (!(await isSupported())) return;
    const analytics = getAnalytics(app);
    track = (name, params) => logEvent(analytics, name, params);
  }).catch(() => {});
}

// ---------- 펫과 스프라이트 시트 ----------
// 시트 한 장에 31프레임: 걷기 0~11, 점프 12, 착지 13, 기쁨 14~21, 말하기 22~29, 잠 30
const F = { walk: 0, air: 12, land: 13, happy: 14, talk: 22, sleep: 30 };
const PETS = [
  ["cat", "고양이"], ["dog", "강아지"], ["bunny", "토끼"], ["chick", "병아리"], ["panda", "판다"],
  ["bear", "곰돌이"], ["fox", "여우"], ["penguin", "펭귄"], ["hamster", "햄스터"], ["pig", "아기돼지"],
  // 2.2.0에서 추가 (2점대 전용)
  ["koala", "코알라", true], ["frog", "개구리", true], ["sheep", "아기양", true], ["redPanda", "레서판다", true], ["dino", "아기공룡", true],
];
const sheet = (id) => `url(img/pets/${id}-sheet.webp)`;
const preload = (id) => { const i = new Image(); i.src = `img/pets/${id}-sheet.webp`; };

// 미리 보기 화면에 오는 알림들
const APPS = [
  { name: "메시지", c: "#34C759", title: "엄마", body: "저녁 먹으러 올 거지?" },
  { name: "카카오톡", c: "#F7D600", title: "민지", body: "점심 뭐 먹을래? 🍜" },
  { name: "슬랙", c: "#611F69", title: "#디자인", body: "새 시안 올렸어요! 확인 부탁드려요" },
  { name: "메일", c: "#0A84FF", title: "팀장님", body: "주간 보고서 잘 받았어요 👍" },
  { name: "캘린더", c: "#FF3B30", title: "10분 후", body: "디자인 리뷰 회의" },
  { name: "미리 알림", c: "#FF9500", title: "물 마시기", body: "한 컵 마실 시간이에요 💧" },
];

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ---------- 움직이는 미리 보기 ----------
const stage = $("#stage");
const layer = $("#pet-layer");
const petEl = $("#pet");
const dock = $("#dock");

APPS.forEach((a) => {
  const s = document.createElement("span");
  s.style.setProperty("--c", a.c);
  s.title = a.name;
  dock.append(s);
});

const look = { hue: 0, sat: 100, size: 100 };
const pet = {
  id: "cat", x: 60, dir: 1, mode: "walk", modeEnd: 0, frame: 0, step: 0, y: 0,
  bubble: null, nextNoti: 1.6, notiIndex: 0, sleepAt: 18,
};
let running = true;
let last = performance.now();
let clock = 0;

function setPet(id) {
  pet.id = id;
  petEl.style.backgroundImage = sheet(id);
}
setPet("cat");

function petSize() { return petEl.offsetWidth; }
function setMode(mode, seconds) { pet.mode = mode; pet.modeEnd = clock + seconds; pet.step = 0; }

function spawnHearts() {
  const size = petSize();
  for (let i = 0; i < 4; i++) {
    const h = document.createElement("span");
    h.className = "heart";
    h.textContent = "♥";
    h.style.left = `${pet.x + size * (0.3 + Math.random() * 0.4)}px`;
    h.style.bottom = `${parseFloat(getComputedStyle(petEl).bottom) + size * 0.8}px`;
    h.style.setProperty("--dx", `${(Math.random() - 0.5) * 50}px`);
    h.style.animationDelay = `${i * 0.12}s`;
    layer.append(h);
    setTimeout(() => h.remove(), 1500);
  }
}

petEl.addEventListener("click", () => {
  if (pet.bubble) return;
  setMode("happy", 1.6);
  spawnHearts();
  track("pet_pat", { pet: pet.id });
});

function closeBubble() {
  const b = pet.bubble;
  if (!b) return;
  pet.bubble = null;
  clearTimeout(b._timer);
  b.classList.add("out");
  setTimeout(() => b.remove(), 260);
  pet.nextNoti = clock + 5 + Math.random() * 3;
  setMode("walk", 4);
}

function showBubble(a) {
  const size = petSize();
  const W = stage.clientWidth;
  const bottom = parseFloat(getComputedStyle(petEl).bottom);
  const b = document.createElement("div");
  const width = W < 520 ? 210 : 250;
  // 앱처럼 펫 오른쪽 위, 자리가 없으면 왼쪽 위
  let left = pet.x + size * 0.62;
  const onLeft = left + width > W - 8;
  if (onLeft) left = pet.x + size * 0.38 - width;
  b.className = "bubble" + (onLeft ? " left" : "");
  b.style.left = `${Math.max(8, Math.min(W - width - 8, left))}px`;
  b.style.bottom = `${bottom + size * 0.92}px`;
  b.style.setProperty("--c", a.c);
  b.style.setProperty("--t", "5s");
  b.innerHTML = `<div class="top"><i></i>${a.name}<time>방금</time></div><b></b><p></p><div class="bar"></div><button class="x" type="button" aria-label="닫기">×</button>`;
  b.querySelector("b").textContent = a.title;
  b.querySelector("p").textContent = a.body;
  const arm = (ms) => { clearTimeout(b._timer); b._timer = setTimeout(closeBubble, ms); };
  b.addEventListener("mouseenter", () => clearTimeout(b._timer));
  b.addEventListener("mouseleave", () => arm(1500));
  b.querySelector(".x").addEventListener("click", (e) => { e.stopPropagation(); closeBubble(); });
  b.addEventListener("click", () => {
    const icon = dock.children[APPS.indexOf(a)];
    icon.classList.remove("bounce"); void icon.offsetWidth; icon.classList.add("bounce");
    track("demo_bubble_click", { app: a.name });
    closeBubble();
  });
  layer.append(b);
  pet.bubble = b;
  arm(5000);
}

function notify() {
  const a = APPS[pet.notiIndex++ % APPS.length];
  if (reduceMotion) { setMode("talk", 1.6); showBubble(a); return; }
  setMode("air", 0.42);
  pet._pending = a;
}

function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (running) {
    clock += dt;
    update(dt);
  }
  requestAnimationFrame(tick);
}

function update(dt) {
  const size = petSize();
  const maxX = stage.clientWidth - size - 6;
  let frame = F.walk;

  if (!pet.bubble && clock >= pet.nextNoti && ["walk", "idle", "sleep"].includes(pet.mode)) notify();

  switch (pet.mode) {
    case "walk": {
      pet.step += dt * 16;
      frame = F.walk + (Math.floor(pet.step) % 12);
      if (!reduceMotion) pet.x += pet.dir * 48 * dt;
      if (pet.x <= 6) { pet.x = 6; pet.dir = 1; }
      if (pet.x >= maxX) { pet.x = maxX; pet.dir = -1; }
      if (clock >= pet.modeEnd) {
        const r = Math.random();
        if (clock >= pet.sleepAt) { setMode("sleep", 3.5); pet.sleepAt = clock + 26; }
        else if (r < 0.35) setMode("idle", 1 + Math.random() * 1.5);
        else { if (r < 0.6) pet.dir *= -1; setMode("walk", 2 + Math.random() * 3); }
      }
      break;
    }
    case "idle":
      frame = F.walk;
      if (clock >= pet.modeEnd) setMode("walk", 2 + Math.random() * 3);
      break;
    case "sleep":
      frame = F.sleep;
      if (clock >= pet.modeEnd) setMode("walk", 3);
      break;
    case "air": {
      const p = 1 - (pet.modeEnd - clock) / 0.42;
      pet.y = Math.sin(Math.min(1, p) * Math.PI) * size * 0.55;
      frame = F.air;
      if (clock >= pet.modeEnd) { pet.y = 0; setMode("land", 0.14); }
      break;
    }
    case "land":
      frame = F.land;
      if (clock >= pet.modeEnd) {
        setMode("talk", 1.8);
        if (pet._pending) { showBubble(pet._pending); pet._pending = null; }
      }
      break;
    case "talk":
      pet.step += dt * 10;
      frame = clock < pet.modeEnd ? F.talk + (Math.floor(pet.step) % 8) : F.walk;
      break;
    case "happy":
      pet.step += dt * 10;
      frame = F.happy + (Math.floor(pet.step) % 8);
      if (clock >= pet.modeEnd) setMode("walk", 3);
      break;
  }

  pet.x = Math.max(6, Math.min(maxX, pet.x));
  petEl.style.backgroundPosition = `${-frame * size}px 0`;
  petEl.style.transform = `translate(${pet.x}px, ${-pet.y}px) scaleX(${pet.dir})`;
}

new IntersectionObserver(([e]) => { running = e.isIntersecting && !document.hidden; }).observe(stage);
document.addEventListener("visibilitychange", () => { running = !document.hidden; });
requestAnimationFrame(tick);

// 메뉴바 시계
const clockEl = $("#clock");
function paintClock() {
  const d = new Date();
  const day = "일월화수목금토"[d.getDay()];
  const h = d.getHours();
  clockEl.textContent = `(${day}) ${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")}`;
}
paintClock();
setInterval(paintClock, 20000);

// ---------- 펫 고르기 ----------
const grid = $("#pet-grid");
PETS.forEach(([id, name, isNew]) => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "pet-card";
  btn.setAttribute("aria-pressed", String(id === pet.id));
  btn.innerHTML = `<div class="sprite"></div><b>${name}</b>${isNew ? '<span class="new-badge">NEW · 2점대</span>' : ""}`;
  const sp = btn.firstElementChild;
  sp.style.backgroundImage = `url(img/pets/${id}.webp)`;
  sp.style.backgroundSize = "100% 100%";
  let timer = null;
  btn.addEventListener("mouseenter", () => {
    if (reduceMotion) return;
    sp.style.backgroundImage = sheet(id);
    sp.style.backgroundSize = "";
    let f = 0;
    const paint = () => { sp.style.backgroundPosition = `${-(F.happy + (f++ % 8)) * sp.offsetWidth}px 0`; };
    paint();
    timer = setInterval(paint, 100);
  });
  btn.addEventListener("mouseleave", () => {
    clearInterval(timer);
    sp.style.backgroundImage = `url(img/pets/${id}.webp)`;
    sp.style.backgroundSize = "100% 100%";
    sp.style.backgroundPosition = "0 0";
  });
  btn.addEventListener("click", () => {
    preload(id);
    setPet(id);
    grid.querySelectorAll(".pet-card").forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
    setMode("happy", 1.4);
    const r = stage.getBoundingClientRect();
    if (r.bottom < 60 || r.top > innerHeight - 60) stage.scrollIntoView({ behavior: "smooth", block: "center" });
    track("pet_select", { pet: id });
  });
  grid.append(btn);
});

// 색·크기 조정: 설정 창처럼 바로 반영
function applyLook() {
  grid.style.setProperty("--hue", `${look.hue}deg`);
  grid.style.setProperty("--sat", look.sat / 100);
  grid.style.setProperty("--scale", Math.min(look.size, 130) / 100);
  stage.style.setProperty("--pet-scale", Math.min(1.6, Math.max(0.6, look.size / 100)));
  petEl.style.filter = `hue-rotate(${look.hue}deg) saturate(${look.sat / 100}) drop-shadow(0 6px 6px rgba(30,50,110,.18))`;
}
for (const k of ["hue", "sat", "size"]) {
  const input = $(`#${k}`);
  input.addEventListener("input", () => { look[k] = +input.value; applyLook(); });
}
$("#random-color").addEventListener("click", () => {
  look.hue = Math.round(Math.random() * 360);
  look.sat = 60 + Math.round(Math.random() * 100);
  $("#hue").value = look.hue; $("#sat").value = look.sat;
  applyLook();
});
$("#reset-color").addEventListener("click", () => {
  Object.assign(look, { hue: 0, sat: 100, size: 100 });
  for (const k of ["hue", "sat", "size"]) $(`#${k}`).value = look[k];
  applyLook();
});

// ---------- 내려받기 목록 ----------
const REPO = "sanghakbae/Noti-Pet";
const DL = (v) => `https://github.com/${REPO}/releases/download/v${v}/NotiPet-${v}.dmg`;
// GitHub에 연결되지 않을 때 보여 줄 목록
const FALLBACK = [
  { v: "2.2.0", date: "2026-09-25", url: DL("2.2.0"), size: 1609260 },
  { v: "2.1.0", date: "2026-09-25", url: DL("2.1.0"), size: 1665460 },
  { v: "1.3.0", date: "2026-09-24", url: DL("1.3.0"), size: 1618356 },
  { v: "1.2.0", date: "2026-09-24", url: DL("1.2.0"), size: 1632413 },
];
const WHAT = {
  "2.2.0": "새 펫 5종: 코알라·개구리·아기양·레서판다·아기공룡 (2점대 전용)",
  "2.1.0": "키가 구매자 이메일에 묶여요. 입력 창에서 이메일과 키를 함께 넣어요",
  "1.3.0": "토끼 귀·병아리 깃털 끝이 잘려 보이던 문제를 고쳤어요",
  "1.2.0": "첫 공개 · 펫 10종, 펫 설정 창(종류·크기·색)",
};
const isPaid = (v) => parseInt(v, 10) >= 2;
const cmp = (a, b) => {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (y[i] || 0) - (x[i] || 0);
  return 0;
};
// 릴리스 설명의 "- 2.1.0: 바뀐 점" 줄을 읽는다
const whatFrom = (body, v) => (body || "").match(new RegExp(`^-\\s*${v.replace(/\./g, "\\.")}:\\s*(.+)$`, "m"))?.[1];

async function loadReleases() {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=50`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error(res.status);
    const list = (await res.json())
      .filter((r) => !r.draft && !r.prerelease)
      .map((r) => {
        const dmg = r.assets.find((a) => a.name.endsWith(".dmg"));
        if (!dmg) return null;
        const v = r.tag_name.replace(/^v/, "");
        return { v, date: r.published_at.slice(0, 10), url: dmg.browser_download_url, size: dmg.size, what: whatFrom(r.body, v) };
      })
      .filter(Boolean);
    return list.length ? list : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

const toast = document.createElement("div");
function showToast(html) {
  toast.className = "toast";
  toast.innerHTML = html;
  document.body.append(toast);
  clearTimeout(toast._t);
  toast.classList.remove("show"); void toast.offsetWidth; toast.classList.add("show");
  toast._t = setTimeout(() => toast.classList.remove("show"), 6000);
}

function onDownload(r, where) {
  track("notipet_download", { version: r.v, price: isPaid(r.v) ? "paid" : "free", where });
  showToast(isPaid(r.v)
    ? `<b>NotiPet ${r.v}을 내려받는 중이에요</b>2.0부터는 키가 필요해요. <a href="#buy">구매 신청</a>에 이메일을 남겨 주세요.`
    : `<b>NotiPet ${r.v}을 내려받는 중이에요</b>1점대는 키 없이 무료로 쓸 수 있어요.`);
}

function renderDownloads(rows) {
  rows.sort((a, b) => cmp(a.v, b.v));
  const list = $("#dl-list");
  list.textContent = "";
  rows.forEach((r, i) => {
    const paid = isPaid(r.v);
    const row = document.createElement("div");
    row.className = "dl-row" + (i === 0 ? " latest" : "");
    row.innerHTML = `
      <div class="dl-ver">${r.v}<small>${r.date}</small></div>
      <div><span class="tag ${paid ? "paid" : "free"}">${paid ? "유료 · 키 필요" : "무료"}</span>${i === 0 ? '<span class="tag new">최신</span>' : ""}</div>
      <div class="dl-what"></div>
      <a class="btn ${paid ? "primary" : "ghost"}" href="${r.url}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0-5-5m5 5 5-5M5 20h14"/></svg>내려받기</a>`;
    const what = row.querySelector(".dl-what");
    what.textContent = r.what || WHAT[r.v] || "";
    const small = document.createElement("small");
    small.textContent = `DMG · ${(r.size / 1048576).toFixed(1)}MB`;
    what.append(small);
    row.querySelector("a").addEventListener("click", () => onDownload(r, "list"));
    list.append(row);
  });

  // 히어로 버튼은 누르면 바로 내려받는다
  const paid = rows.find((r) => isPaid(r.v));
  const free = rows.find((r) => !isPaid(r.v));
  const cta = $("#cta-paid"), ctaFree = $("#cta-free");
  if (paid) {
    cta.href = paid.url;
    $("[data-latest-paid]").textContent = paid.v;
    cta.addEventListener("click", () => onDownload(paid, "hero"));
  }
  if (free) {
    ctaFree.href = free.url;
    $("[data-latest-free]").textContent = free.v;
    ctaFree.addEventListener("click", () => onDownload(free, "hero"));
  }
}

loadReleases().then(renderDownloads);

// ---------- 구매 신청: Firestore에 남기고, 웹훅 알림 허브를 거쳐 bae@sanghak.kr로 메일 ----------
// 허브의 「NotiPet 구매」 엔드포인트. 공개 폼이라 주소가 드러나도 되고, 메일은 bae@sanghak.kr로만 가요.
const HOOK = "https://webhook-alert.totoriverce.workers.dev/w/35bfef19380645d4a1152bbba135ff877ff7c45aed5e4ddbba915420e71aaa7d";
const buyForm = $("#buy");
const buyMsg = $("#buy-msg");
const say = (text, kind) => { buyMsg.hidden = false; buyMsg.className = `buy-msg ${kind || ""}`; buyMsg.textContent = text; };
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("timeout")), ms))]);
const kst = () => new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "medium", timeStyle: "short" });

buyForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(buyForm);
  if (fd.get("website")) return; // 사람 눈에 안 보이는 칸을 채운 건 봇
  const email = normalizeEmail(fd.get("email"));
  if (!email) {
    say("이메일 주소를 확인해 주세요. 키는 이 이메일로 보내 드리고, 앱에서도 이 이메일을 넣어요.", "error");
    buyForm.email.focus();
    return;
  }
  const name = String(fd.get("name") || "").trim().slice(0, 100);
  const memo = String(fd.get("memo") || "").trim().slice(0, 1000);
  const btn = $("#buy-btn");
  btn.disabled = true;
  say("보내는 중…");

  let orderId = "";
  try {
    const { getFirestore, collection, addDoc, serverTimestamp } = await import(`${SDK}/firebase-firestore.js`);
    const ref = await withTimeout(addDoc(collection(getFirestore(app), "orders"),
      { email, name, memo, status: "new", createdAt: serverTimestamp(), source: isLocal ? "localhost" : "site" }), 8000);
    orderId = ref.id;
  } catch (err) {
    console.warn("구매 신청 저장 실패", err);
  }

  let mailed = false;
  try {
    const text = [
      `${isLocal ? "[개발 서버 테스트] " : ""}NotiPet 구매 신청이 들어왔어요.`, "",
      `이메일: ${email}`, `이름: ${name || "-"}`, `메모: ${memo || "-"}`,
      `신청 시각: ${kst()}`, `신청 번호: ${orderId || "(저장 실패 — 이 메일로 처리해 주세요)"}`, "",
      "키 발급: https://notipet.sanghak.kr/admin/",
    ].join("\n");
    // text/plain 이면 CORS 사전 요청 없이 보내져요 (허브는 본문을 JSON으로 읽어요)
    await fetch(HOOK, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ source: "notipet-site", event: "purchase", email, name, memo, order_id: orderId, text }) });
    mailed = true;
  } catch (err) {
    console.warn("구매 알림 실패", err);
  }

  btn.disabled = false;
  if (orderId || mailed) {
    say(`신청이 접수됐어요. 확인 후 ${email} 로 키를 보내 드릴게요.`, "ok");
    buyForm.reset();
    track("purchase_request", {});
  } else {
    say("보내지 못했어요. 잠시 뒤 다시 시도해 주세요.", "error");
  }
});

// ---------- 홍보 영상: 화면에 보일 때만 재생 (자동 재생은 음소거여야 허용된다) ----------
const promo = $("#promo");
const unmute = $("#unmute");
if (promo) {
  new IntersectionObserver(([e]) => {
    if (e.isIntersecting) promo.play().catch(() => {});
    else promo.pause();
  }, { threshold: 0.4 }).observe(promo);
  unmute.addEventListener("click", () => {
    promo.muted = false;
    promo.currentTime = 0;
    promo.play().catch(() => {});
    unmute.hidden = true;
    track("promo_unmute", {});
  });
  promo.addEventListener("volumechange", () => { unmute.hidden = !promo.muted; });
}

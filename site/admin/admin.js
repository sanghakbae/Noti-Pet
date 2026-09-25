import { app } from "../firebase.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, collection, query, orderBy, onSnapshot, serverTimestamp, writeBatch, increment,
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import { normalizeEmail, parseSecret, secretToHex, makeKey, secretCheck, keyPrefix } from "./license.js";

const ADMIN = "totoriverce@gmail.com";
// 지금 앱에 들어간 비밀키의 확인값 (keygen.py check-value). 다른 비밀키로 만든 키는 앱에서 안 통한다.
const EXPECTED_CHECK = "b29dd98c";
const SITE = "https://notipet.sanghak.kr";
// 키 메일 발송 Worker (비공개 저장소 mailer/). 구매자 이메일로 bae@sanghak.kr 명의의 메일을 보낸다.
const MAILER = "https://notipet-mailer.totoriverce.workers.dev";

const $ = (s) => document.querySelector(s);
const auth = getAuth(app);
const db = getFirestore(app);

let user = null;
let secret = null;
let orders = [];
let licenses = [];
let unsubs = [];

// ---------- 공통 ----------
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (ts) => (ts?.toDate ? ts.toDate().toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" }) : "—");

function toast(text) {
  const t = $("#toast");
  t.textContent = text;
  t.hidden = false;
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.hidden = true; }, 2200);
}
async function copy(text, label = "복사했어요") {
  await navigator.clipboard.writeText(text);
  toast(label);
}
function banner(html) {
  const b = $("#banner");
  b.hidden = !html;
  b.innerHTML = html || "";
}
function explain(err) {
  const msg = String(err?.message || err);
  if (/does not exist|NOT_FOUND|not-found/i.test(msg) || err?.code === "not-found")
    return `Firestore 데이터베이스가 아직 없어요. <a href="https://console.firebase.google.com/project/notipet-d479d/firestore" target="_blank" rel="noopener">Firebase 콘솔</a>에서 만들어 주세요.`;
  if (err?.code === "permission-denied")
    return "권한이 없어요. Firestore 보안 규칙이 아직 적용되지 않았을 수 있어요.";
  return esc(msg);
}

function mailBody(email, key) {
  return [
    "안녕하세요, NotiPet을 구매해 주셔서 감사합니다 🐾", "",
    `이메일: ${email}`, `키: ${key}`, "",
    "NotiPet을 처음 열면 뜨는 키 입력 창에 위 이메일과 키를 그대로 넣어 주세요.",
    `내려받기: ${SITE}/#download`,
  ].join("\n");
}

/** 구매자에게 키 메일을 보내고 발송 기록을 남긴다 */
async function sendKeyMail(email, key) {
  const res = await fetch(`${MAILER}/send-key`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, key }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) throw new Error(data.error || `메일을 보내지 못했어요 (${res.status})`);
  await updateDoc(doc(db, "licenses", email), { mailedAt: serverTimestamp(), mailCount: increment(1) }).catch(() => {});
  return data;
}

// ---------- 로그인 ----------
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ login_hint: ADMIN, prompt: "select_account" });

$("#login-btn").addEventListener("click", async () => {
  $("#login-error").hidden = true;
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    if (err?.code === "auth/popup-closed-by-user") return;
    $("#login-error").hidden = false;
    $("#login-error").textContent = `로그인하지 못했어요: ${err?.code || err}`;
  }
});
$("#logout").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (u) => {
  unsubs.forEach((f) => f());
  unsubs = [];
  if (u && u.email !== ADMIN) {
    const who = u.email;
    // 관리자가 아닌 계정은 기록도 남기지 않는다
    await u.delete().catch(() => {});
    await signOut(auth).catch(() => {});
    $("#login-error").hidden = false;
    $("#login-error").textContent = `관리자 계정(${ADMIN})만 들어올 수 있어요. 방금 로그인한 계정: ${who}`;
    return;
  }
  user = u;
  $("#login").hidden = !!u;
  $("#tabs").hidden = !u;
  $("#account").hidden = !u;
  if (!u) {
    document.querySelectorAll(".panel").forEach((p) => (p.hidden = true));
    banner("");
    return;
  }
  $("#who").textContent = u.email;
  showTab(location.hash.slice(1) || "orders");
  await loadSecret();
  watch();
});

// ---------- 탭 ----------
function showTab(name) {
  if (!["orders", "issue", "history", "settings"].includes(name)) name = "orders";
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
  document.querySelectorAll(".panel").forEach((p) => (p.hidden = p.id !== `tab-${name}`));
  history.replaceState(null, "", `#${name}`);
  if (name === "issue") $("#issue-email").focus();
}
document.querySelectorAll("#tabs button").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));

// ---------- 비밀키 ----------
async function loadSecret() {
  try {
    const snap = await getDoc(doc(db, "config", "license"));
    secret = snap.exists() ? parseSecret(snap.data().secret) : null;
    paintSecret(secret ? await secretCheck(secret) : null);
  } catch (err) {
    secret = null;
    paintSecret(null);
    banner(explain(err));
  }
}

function paintSecret(check) {
  const s = $("#secret-status");
  if (!check) {
    s.innerHTML = `<b class="bad">등록 안 됨</b> · 비밀키를 등록해야 키를 만들 수 있어요.`;
    banner(`비밀키가 아직 등록되지 않았어요. <a href="#settings" data-go="settings">설정</a>에서 한 번 등록해 주세요.`);
  } else if (check !== EXPECTED_CHECK) {
    s.innerHTML = `<b class="bad">앱과 다름</b> · 확인값 ${check} (앱 ${EXPECTED_CHECK}). 이 비밀키로 만든 키는 앱에서 안 통해요.`;
    banner(`등록된 비밀키가 앱과 달라요. <a href="#settings" data-go="settings">설정</a>에서 다시 등록해 주세요.`);
  } else {
    s.innerHTML = `<b class="good">등록됨</b> · 확인값 ${check} — 앱에 들어간 비밀키와 같아요.`;
    banner("");
  }
}
document.addEventListener("click", (e) => {
  const go = e.target.closest("[data-go]");
  if (go) { e.preventDefault(); showTab(go.dataset.go); }
});

$("#secret-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#secret-error");
  err.hidden = true;
  const file = $("#secret-file").files[0];
  const text = file ? await file.text() : $("#secret-text").value;
  const bytes = parseSecret(text);
  if (!bytes) { err.hidden = false; err.textContent = "64자리 16진수 비밀키가 아니에요."; return; }
  const check = await secretCheck(bytes);
  if (check !== EXPECTED_CHECK) {
    err.hidden = false;
    err.textContent = `앱에 들어간 비밀키와 달라요 (확인값 ${check}, 앱 ${EXPECTED_CHECK}). ~/.notipet-keygen/secret.key 를 골라 주세요.`;
    return;
  }
  try {
    await setDoc(doc(db, "config", "license"), { secret: secretToHex(bytes), check, updatedAt: serverTimestamp(), updatedBy: user.email });
    secret = bytes;
    paintSecret(check);
    $("#secret-form").reset();
    toast("비밀키를 등록했어요");
  } catch (e2) {
    err.hidden = false;
    err.innerHTML = explain(e2);
  }
});

// ---------- 목록 실시간 ----------
function watch() {
  const fail = (err) => banner(explain(err));
  unsubs.push(onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc")), (snap) => {
    orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    paintOrders();
  }, fail));
  unsubs.push(onSnapshot(query(collection(db, "licenses"), orderBy("issuedAt", "desc")), (snap) => {
    licenses = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    paintHistory();
  }, fail));
}

// ---------- 발급 ----------
async function issue(rawEmail, memo, orderId) {
  const email = normalizeEmail(rawEmail);
  if (!email) throw new Error("이메일 주소를 확인해 주세요.");
  if (!secret) throw new Error("비밀키가 등록되지 않았어요. 설정에서 먼저 등록해 주세요.");
  const key = await makeKey(secret, email);
  const ref = doc(db, "licenses", email);
  const before = await getDoc(ref);
  const data = { email, key, updatedAt: serverTimestamp() };
  if (memo) data.memo = memo;
  if (orderId) data.orderId = orderId;
  if (!before.exists()) Object.assign(data, { issuedAt: serverTimestamp(), issuedBy: user.email, revoked: false, memo: memo || "" });
  const batch = writeBatch(db);
  batch.set(ref, data, { merge: true });
  if (orderId) batch.update(doc(db, "orders", orderId), { status: "issued", key, issuedAt: serverTimestamp() });
  await batch.commit();
  return { email, key, existed: before.exists() };
}

const MAIL_STATE = {
  sending: '<span class="pill new">메일 보내는 중…</span>',
  sent: '<span class="pill good">메일 발송 완료</span>',
  failed: '<span class="pill bad">메일 발송 실패</span>',
};

function showResult({ email, key, existed }, mail = null) {
  const r = $("#issue-result");
  r.hidden = false;
  r.innerHTML = `
    <span class="pill ${existed ? "new" : "good"}">${existed ? "이미 발급됨 · 같은 키" : "발급 완료"}</span>
    ${mail ? MAIL_STATE[mail.state] : ""}
    <span class="r-email">${esc(email)}</span>
    <code class="r-key">${esc(key)}</code>
    <span class="actions">
      <button type="button" class="btn sm" data-copy="key">키 복사</button>
      <button type="button" class="btn sm" data-copy="both">이메일+키 복사</button>
      <button type="button" class="btn sm" data-copy="mail">안내 문구 복사</button>
      <button type="button" class="btn sm primary" data-send ${mail?.state === "sending" ? "disabled" : ""}>${mail?.state === "sent" ? "메일 다시 보내기" : "메일 보내기"}</button>
    </span>
    ${mail?.state === "failed" ? `<span class="error r-error">${esc(mail.error)}</span>` : ""}`;
  r.querySelector('[data-copy="key"]').onclick = () => copy(key);
  r.querySelector('[data-copy="both"]').onclick = () => copy(`이메일: ${email}\n키: ${key}`);
  r.querySelector('[data-copy="mail"]').onclick = () => copy(mailBody(email, key), "안내 문구를 복사했어요");
  r.querySelector("[data-send]").onclick = () => mailAndShow({ email, key, existed });
}

/** 결과를 보여 주면서 구매자에게 메일을 보낸다 (발급하면 자동으로 부른다) */
async function mailAndShow(res) {
  showResult(res, { state: "sending" });
  try {
    await sendKeyMail(res.email, res.key);
    showResult(res, { state: "sent" });
    toast(`${res.email} 로 키 메일을 보냈어요`);
  } catch (err) {
    showResult(res, { state: "failed", error: err?.message || String(err) });
  }
}

$("#issue-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#issue-error");
  err.hidden = true;
  $("#issue-btn").disabled = true;
  try {
    const res = await issue($("#issue-email").value, $("#issue-memo").value.trim());
    $("#issue-form").reset();
    await mailAndShow(res);
  } catch (e2) {
    err.hidden = false;
    err.innerHTML = e2?.code ? explain(e2) : esc(e2.message);
  } finally {
    $("#issue-btn").disabled = false;
  }
});

// ---------- 구매 신청 ----------
$("#orders-new-only").addEventListener("change", paintOrders);
function paintOrders() {
  const pending = orders.filter((o) => o.status !== "issued");
  $("#count-orders").textContent = pending.length || "";
  const list = $("#orders-new-only").checked ? pending : orders;
  const body = $("#orders-body");
  if (!list.length) {
    body.innerHTML = `<tr><td colspan="6" class="empty">${orders.length ? "발급할 신청이 없어요" : "아직 구매 신청이 없어요"}</td></tr>`;
    return;
  }
  body.innerHTML = list.map((o) => `
    <tr data-id="${esc(o.id)}">
      <td>${fmt(o.createdAt)}</td>
      <td class="mono-ish">${esc(o.email)}</td>
      <td>${esc(o.name) || "—"}</td>
      <td class="remark">${esc(o.memo) || ""}</td>
      <td>${o.status === "issued" ? '<span class="pill good">발급됨</span>' : '<span class="pill new">새 신청</span>'}</td>
      <td>${o.status === "issued"
        ? `<button type="button" class="btn sm" data-act="show">키 보기</button>`
        : `<button type="button" class="btn sm primary" data-act="issue">키 발급</button>`}</td>
    </tr>`).join("");
}
$("#orders-body").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const o = orders.find((x) => x.id === btn.closest("tr").dataset.id);
  if (!o) return;
  btn.disabled = true;
  try {
    showTab("issue");
    if (btn.dataset.act === "issue") await mailAndShow(await issue(o.email, o.name ? `구매 신청 · ${o.name}` : "구매 신청", o.id));
    else showResult({ email: o.email, key: o.key, existed: true });
  } catch (e2) {
    toast(e2?.message || String(e2));
  } finally {
    btn.disabled = false;
  }
});

// ---------- 발급 이력 ----------
$("#history-search").addEventListener("input", paintHistory);
function paintHistory() {
  $("#count-history").textContent = licenses.length || "";
  const q = $("#history-search").value.trim().toLowerCase();
  const list = q ? licenses.filter((l) => `${l.email} ${l.key} ${l.memo || ""}`.toLowerCase().includes(q)) : licenses;
  const body = $("#history-body");
  body.innerHTML = list.length ? list.map((l) => `
    <tr data-id="${esc(l.id)}" class="${l.revoked ? "revoked-row" : ""}">
      <td>${fmt(l.issuedAt)}</td>
      <td>${esc(l.email)}</td>
      <td class="key">${esc(l.key)}</td>
      <td class="remark">${esc(l.memo || "")}</td>
      <td>${l.revoked ? '<span class="pill bad">폐기</span>' : '<span class="pill good">사용 중</span>'}</td>
      <td>${l.mailedAt ? `${fmt(l.mailedAt)}${l.mailCount > 1 ? ` · ${l.mailCount}회` : ""}` : '<span class="muted">안 보냄</span>'}</td>
      <td class="acts">
        <button type="button" class="btn sm" data-act="copy">복사</button>
        <button type="button" class="btn sm" data-act="mail">메일 발송</button>
        <button type="button" class="btn sm ${l.revoked ? "" : "danger"}" data-act="revoke">${l.revoked ? "복구" : "폐기"}</button>
      </td>
    </tr>`).join("") : `<tr><td colspan="7" class="empty">${licenses.length ? "찾는 키가 없어요" : "아직 발급한 키가 없어요"}</td></tr>`;

  const revoked = licenses.filter((l) => l.revoked);
  $("#revoked").hidden = !revoked.length;
  $("#revoked-code").textContent =
    `static let revokedKeyPrefixes: Set<String> = [${revoked.map((l) => `"${keyPrefix(l.key)}"`).join(", ")}]`;
}
$("#history-body").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const l = licenses.find((x) => x.id === btn.closest("tr").dataset.id);
  if (!l) return;
  if (btn.dataset.act === "copy") return copy(`이메일: ${l.email}\n키: ${l.key}`);
  if (btn.dataset.act === "mail") {
    if (!confirm(`${l.email} 로 키 메일을 보낼까요?`)) return;
    btn.disabled = true;
    try { await sendKeyMail(l.email, l.key); toast(`${l.email} 로 키 메일을 보냈어요`); }
    catch (e2) { toast(e2?.message || String(e2)); }
    finally { btn.disabled = false; }
    return;
  }
  if (!l.revoked && !confirm(`${l.email} 의 키를 폐기할까요?\n다음 앱 버전부터 이 키가 막혀요.`)) return;
  try {
    await updateDoc(doc(db, "licenses", l.id), { revoked: !l.revoked, updatedAt: serverTimestamp() });
  } catch (e2) {
    toast(e2?.message || String(e2));
  }
});
$("#copy-revoked").addEventListener("click", () => copy($("#revoked-code").textContent));

$("#export-csv").addEventListener("click", () => {
  const rows = [["email", "key", "memo", "issued_at", "revoked"],
    ...licenses.map((l) => [l.email, l.key, l.memo || "", l.issuedAt?.toDate?.().toISOString() || "", l.revoked ? "yes" : "no"])];
  const csv = "﻿" + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `notipet-keys-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
});

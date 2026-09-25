// NotiPet 라이선스 키 (이메일 방식, 2.1.0부터).
// 비공개 저장소의 keygen/keygen.py, Sources/NotiPet/NotiPetLicense.swift 와 똑같이 계산해야 해요.
//   이메일 정리  앞뒤 공백 제거 + 소문자 (영문 이메일만)
//   키          HMAC-SHA256(비밀키, "NotiPet-License-v2:" + 이메일)의 앞 30바이트 → Crockford Base32 48자
const DOMAIN = "NotiPet-License-v2:";
const CHECK_DOMAIN = "NotiPet-Secret-Check";
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;

/** 정리한 이메일, 이메일 모양이 아니면 null */
export function normalizeEmail(email) {
  const e = String(email ?? "").trim().toLowerCase();
  return /^[\x00-\x7f]*$/.test(e) && EMAIL_RE.test(e) ? e : null;
}

/** 64자리 16진수 비밀키 → 32바이트, 형식이 틀리면 null */
export function parseSecret(text) {
  const hex = String(text ?? "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return null;
  return Uint8Array.from(hex.match(/../g), (h) => parseInt(h, 16));
}

export const secretToHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text)));
}

function base32(bytes) {
  let out = "", buffer = 0, bits = 0;
  for (const b of bytes) {
    buffer = (buffer << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += CROCKFORD[(buffer >> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  return out;
}

/** 이메일(정리된 값)의 키 */
export async function makeKey(secret, email) {
  const raw = (await hmac(secret, DOMAIN + email)).slice(0, 30);
  return base32(raw).match(/.{6}/g).join("-");
}

/** 비밀키가 앱에 들어간 것과 같은지 비교하는 짧은 값 (비밀키는 드러나지 않음) */
export async function secretCheck(secret) {
  return secretToHex((await hmac(secret, CHECK_DOMAIN)).slice(0, 4));
}

/** 하이픈·공백을 빼고 대문자로, O/I/L은 0/1로 읽은 키 */
export const cleanKey = (key) =>
  String(key).replace(/[\s-]/g, "").toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1");

/** 폐기 목록에 넣는 키 앞부분 */
export const keyPrefix = (key) => cleanKey(key).slice(0, 12);

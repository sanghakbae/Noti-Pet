#!/usr/bin/env python3
"""NotiPet 라이선스 키 생성기.

키는 48자(Crockford Base32, 30바이트)예요.
  내용          버전 1바이트 + 일련번호 4바이트 (big-endian)
  바이트 0~24   서명: HMAC-SHA256(비밀키, "NotiPet-License-v1" + 내용)의 앞 25바이트
  바이트 25~29  내용 XOR HMAC-SHA256(비밀키, "NotiPet-Mask-v1" + 서명)의 앞 5바이트
                (키 전체가 무작위처럼 보이고 일련번호가 드러나지 않게 가려요)

앱 쪽 확인 코드는 NotiPetLicense.swift에 있어요. 한쪽을 바꾸면 다른 쪽도 같이 바꿔야 해요.
"""

from __future__ import annotations

import argparse
import base64
import csv
import datetime
import hashlib
import hmac
import os
import secrets
import sys
from pathlib import Path

VERSION = 1
DOMAIN = b"NotiPet-License-v1"
MASK_DOMAIN = b"NotiPet-Mask-v1"
TAG_LEN = 25
KEY_LEN = 48
GROUP = 6
MAX_SERIAL = 0xFFFFFFFF

CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
RFC4648 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
TO_CROCKFORD = str.maketrans(RFC4648, CROCKFORD)
FROM_CROCKFORD = str.maketrans(CROCKFORD, RFC4648)
LOOKALIKES = str.maketrans("OIL", "011")

DEFAULT_DIR = Path.home() / ".notipet-keygen"
LOG_FIELDS = ["serial", "key", "memo", "issued_at"]

SWIFT_TEMPLATE = """\
// keygen.py swift 로 만든 파일이에요. 손으로 고치지 마세요.
// 이 값이 새어 나가면 누구나 키를 만들 수 있어요. 공개 저장소에 올리지 마세요.
enum NotiPetLicenseSecret {{
    static let bytes: [UInt8] = [
{rows}
    ]
}}"""


def sign(secret: bytes, payload: bytes) -> bytes:
    return hmac.new(secret, DOMAIN + payload, hashlib.sha256).digest()[:TAG_LEN]


def mask(secret: bytes, tag: bytes, data: bytes) -> bytes:
    pad = hmac.new(secret, MASK_DOMAIN + tag, hashlib.sha256).digest()
    return bytes(a ^ b for a, b in zip(data, pad))


def make_key(secret: bytes, serial: int) -> str:
    payload = bytes([VERSION]) + serial.to_bytes(4, "big")
    tag = sign(secret, payload)
    text = base64.b32encode(tag + mask(secret, tag, payload)).decode().translate(TO_CROCKFORD)
    return "-".join(text[i:i + GROUP] for i in range(0, KEY_LEN, GROUP))


def read_serial(secret: bytes, key: str) -> int | None:
    """서명이 맞으면 일련번호, 아니면 None."""
    text = "".join(key.split()).replace("-", "").upper().translate(LOOKALIKES)
    if len(text) != KEY_LEN or any(c not in CROCKFORD for c in text):
        return None
    data = base64.b32decode(text.translate(FROM_CROCKFORD))
    tag = data[:TAG_LEN]
    payload = mask(secret, tag, data[TAG_LEN:])
    if payload[0] != VERSION or not hmac.compare_digest(sign(secret, payload), tag):
        return None
    return int.from_bytes(payload[1:], "big")


def load_secret(folder: Path) -> bytes:
    path = folder / "secret.key"
    if not path.exists():
        sys.exit(f"비밀키가 없어요: {path}\n먼저 'python3 keygen.py init'을 실행하세요.")
    try:
        secret = bytes.fromhex(path.read_text().strip())
    except ValueError:
        secret = b""
    if len(secret) != 32:
        sys.exit(f"비밀키 파일이 망가졌어요: {path}\n백업해 둔 파일로 바꿔 주세요.")
    return secret


def load_log(folder: Path) -> list[dict]:
    path = folder / "issued.csv"
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def cmd_init(args: argparse.Namespace) -> None:
    path = args.dir / "secret.key"
    if path.exists():
        sys.exit(f"이미 비밀키가 있어요: {path}\n"
                 "새로 만들면 지금까지 나눠 준 키를 모두 못 쓰게 돼서 덮어쓰지 않아요.")
    args.dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(secrets.token_bytes(32).hex() + "\n")
    print(f"비밀키를 만들었어요: {path}")
    print("이 파일은 꼭 백업해 두세요. 잃어버리면 지금 앱과 맞는 키를 더 만들 수 없어요.")
    print("다음: python3 keygen.py swift > <앱 소스 폴더>/NotiPetLicenseSecret.swift")


def cmd_swift(args: argparse.Namespace) -> None:
    secret = load_secret(args.dir)
    rows = ",\n".join(
        "        " + ", ".join(f"0x{b:02x}" for b in secret[i:i + 8])
        for i in range(0, len(secret), 8)
    )
    print(SWIFT_TEMPLATE.format(rows=rows + ","))


def cmd_new(args: argparse.Namespace) -> None:
    if args.count < 1:
        sys.exit("--count는 1 이상이어야 해요.")
    secret = load_secret(args.dir)
    first = max((int(r["serial"]) for r in load_log(args.dir)), default=0) + 1
    if first + args.count - 1 > MAX_SERIAL:
        sys.exit("일련번호를 다 썼어요.")

    now = datetime.datetime.now().isoformat(timespec="seconds")
    rows = [{"serial": s, "key": make_key(secret, s), "memo": args.memo, "issued_at": now}
            for s in range(first, first + args.count)]

    path = args.dir / "issued.csv"
    is_new = not path.exists()
    # 엑셀에서 한글이 깨지지 않게 새 파일에는 BOM을 붙여요.
    with path.open("a", newline="", encoding="utf-8-sig" if is_new else "utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=LOG_FIELDS)
        if is_new:
            writer.writeheader()
        writer.writerows(rows)

    for row in rows:
        print(row["key"])
    last = rows[-1]["serial"]
    span = f"{first}" if first == last else f"{first}~{last}"
    print(f"일련번호 {span}번 키 {len(rows)}개를 만들었어요. 기록: {path}", file=sys.stderr)


def cmd_check(args: argparse.Namespace) -> None:
    serial = read_serial(load_secret(args.dir), " ".join(args.key))
    if serial is None:
        print("올바르지 않은 키예요.")
        sys.exit(1)
    memo = next((r["memo"] for r in load_log(args.dir) if r["serial"] == str(serial)), None)
    if memo is None:
        print(f"올바른 키예요. 일련번호 {serial}번 (발급 기록에는 없어요)")
    else:
        print(f"올바른 키예요. 일련번호 {serial}번" + (f" · {memo}" if memo else ""))


def cmd_list(args: argparse.Namespace) -> None:
    log = load_log(args.dir)
    if not log:
        print("아직 만든 키가 없어요.")
    for r in log:
        print(f'{r["serial"]:>5}  {r["key"]}  {r["issued_at"]}  {r["memo"]}')


def main() -> None:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--dir", type=Path, default=DEFAULT_DIR,
                        help="비밀키와 발급 기록을 두는 폴더 (기본: ~/.notipet-keygen)")

    parser = argparse.ArgumentParser(description="NotiPet 라이선스 키 생성기")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("init", parents=[common],
                   help="비밀키를 처음 한 번 만들어요").set_defaults(func=cmd_init)
    sub.add_parser("swift", parents=[common],
                   help="앱에 넣을 NotiPetLicenseSecret.swift를 출력해요").set_defaults(func=cmd_swift)

    new = sub.add_parser("new", parents=[common], help="키를 새로 만들어요")
    new.add_argument("-n", "--count", type=int, default=1, help="만들 개수 (기본 1)")
    new.add_argument("-m", "--memo", default="", help="누구에게 준 키인지 적어 두는 메모")
    new.set_defaults(func=cmd_new)

    check = sub.add_parser("check", parents=[common], help="키가 올바른지 확인해요")
    check.add_argument("key", nargs="+", help="확인할 키")
    check.set_defaults(func=cmd_check)

    sub.add_parser("list", parents=[common],
                   help="지금까지 만든 키를 보여 줘요").set_defaults(func=cmd_list)

    args = parser.parse_args()
    args.dir = args.dir.expanduser()
    args.func(args)


if __name__ == "__main__":
    main()

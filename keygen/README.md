# NotiPet 키 생성기

DMG는 누구나 받을 수 있지만, **키가 있어야 실행되는** 버전을 만들 때 쓰는 도구예요.
이미 배포한 버전(1.3.0까지)은 그대로 키 없이 쓸 수 있어요.

```
RB304P-ESHFJX-7ZSQF9-CM0E29-S2CR30-171FE5-5BET80-TT0XF9
```

- **48자**예요. 하이픈은 읽기 좋으라고 넣은 거라서 빼고 입력해도 돼요.
- 헷갈리는 글자(I, L, O, U)는 쓰지 않아요. 대소문자도 가리지 않고, O를 0으로, I·L을 1로 알아서 읽어요.
- 키마다 일련번호가 숨어 있어서 누구에게 준 키인지 알 수 있어요.

| 파일 | 하는 일 |
| :-- | :-- |
| `keygen.py` | 키를 만들고 확인해요 (파이썬 3.9 이상, 추가 설치 없음) |
| `NotiPetLicense.swift` | 앱에 넣는 키 확인 코드와 입력 창 |
| `selftest/main.swift` | 앱 코드가 `keygen.py`와 같은 답을 내는지 확인 |

## 처음 한 번

**1. 비밀키 만들기**

```sh
python3 keygen.py init
```

`~/.notipet-keygen/secret.key`가 생겨요. **꼭 백업해 두세요.**
- 잃어버리면 이미 배포한 앱에 맞는 키를 더 만들 수 없어요.
- 새어 나가면 누구나 키를 만들 수 있어요.

**2. 앱에 비밀키 넣기**

```sh
python3 keygen.py swift > <앱 소스 폴더>/NotiPetLicenseSecret.swift
```

앱 소스가 공개 저장소에 있다면 이 파일은 그 저장소의 `.gitignore`에 넣으세요.

**3. 앱에 확인 코드 넣기**

`NotiPetLicense.swift`와 `NotiPetLicenseSecret.swift`를 Xcode 프로젝트에 추가하고,
`applicationDidFinishLaunching` **맨 앞**에서 한 줄을 불러요.

```swift
func applicationDidFinishLaunching(_ notification: Notification) {
    NotiPetLicense.requireActivation()
    // ... 원래 코드
}
```

올바른 키가 없으면 입력 창이 뜨고, **종료**를 누르면 앱이 꺼져요.
한 번 넣은 키는 저장돼서 다음부터는 묻지 않아요.

**4. 맥에서 셀프 테스트**

```sh
swiftc NotiPetLicense.swift selftest/main.swift -o /tmp/notipet-selftest && /tmp/notipet-selftest
```

`모두 통과했어요`가 나오면 앱 코드와 생성기가 같은 방식으로 동작하는 거예요.

## 키 나눠 주기

```sh
python3 keygen.py new -m "홍길동"          # 1개
python3 keygen.py new -n 10 -m "베타 테스터" # 10개
python3 keygen.py list                     # 지금까지 만든 키
python3 keygen.py check <키>               # 올바른 키인지, 누구에게 준 건지
```

만든 키는 `~/.notipet-keygen/issued.csv`에 메모와 함께 남아요. 엑셀로 열어도 한글이 깨지지 않아요.

## 키가 새어 나갔을 때

1. `python3 keygen.py check <키>`로 일련번호를 확인해요.
2. `NotiPetLicense.swift`의 `revokedSerials`에 그 번호를 넣어요.
   ```swift
   static let revokedSerials: Set<UInt32> = [7, 12]
   ```
3. 새 버전을 배포하면 그 키는 더 이상 쓸 수 없어요. 이미 받은 이전 버전에서는 계속 쓸 수 있어요.

## 얼마나 안전한가요?

- **키를 추측하거나 무작위로 대입해서 맞출 수는 없어요.** 서명이 200비트라서 경우의 수가 2²⁰⁰개예요.
- **비밀키 없이는 새 키를 만들 수 없어요.**
- 하지만 인터넷 없이 확인하는 방식이라 막을 수 없는 것도 있어요.
  - 앱 안에 비밀키가 들어 있어서, 앱을 뜯어 분석할 수 있는 사람은 비밀키를 꺼낼 수 있어요.
  - 앱을 고쳐서 키 확인을 아예 빼 버릴 수도 있어요.
  - 키 하나를 여러 명이 같이 쓰는 건 막을 수 없어요. 대신 위의 방법으로 다음 버전부터 막을 수 있어요.

  이건 키 길이와 상관없이 인터넷 없이 확인하는 모든 방식의 한계예요. 평범한 사용자가 키 없이 쓰는 걸 막는 용도로는 충분해요.
- 설정을 지우면(`defaults delete kr.sanghak.notipet`) 저장된 키도 지워져서 다시 입력해야 해요.

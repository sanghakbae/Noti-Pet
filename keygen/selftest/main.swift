// NotiPetLicense.swift가 keygen.py와 같은 답을 내는지 맥에서 확인해요.
//   cd keygen
//   swiftc NotiPetLicense.swift selftest/main.swift -o /tmp/notipet-selftest && /tmp/notipet-selftest
// 아래 키는 시험용 비밀키(0x00~0x1f)로 keygen.py가 만든 거예요. 진짜 비밀키와는 상관없어요.
import Foundation

enum NotiPetLicenseSecret {
    static let bytes: [UInt8] = Array(0..<32)
}

let cases: [(key: String, serial: UInt32?)] = [
    ("1VJN96-7NH2MS-T1T7J7-1VX7N0-JPRAX2-BE0Z2A-T0359X-X4R2W6", 1),
    ("1vjn967nh2mst1t7j71vx7n0jprax2be0z2at0359xx4r2w6", 1),                // 소문자, 하이픈 없이
    ("1VJN96 7NH2MS T1T7J7 1VX7N0 JPRAX2 BE0Z2A T0359X X4R2W6", 1),         // 공백으로 나눔
    ("DN278l-OKKCKD-YKWNlP-JW9YS7-34RTA7-7FlZX9-7lECFK-SR69T2", 3),         // 0→O, 1→l 로 잘못 읽은 입력
    ("85D38S-VYK7Z1-ZV3M15-4F8NND-TH64T1-ZW7Y1G-BC4E4A-CCRH21", 4_294_967_295),
    ("1VJN967NH2MST1T7J71VA7N0JPRAX2BE0Z2AT0359XX4R2W6", nil),              // 한 글자 바꿈
    ("1VJN967NH2MST1T7J71VX7N0JPRAX2BE0Z2AT0359XX4R2W", nil),               // 47자
    ("1VJN967NH2MST1T7J71VX7N0JPRAX2BE0Z2AT0359XX4R2W60", nil),             // 49자
    ("UUUUUU-UUUUUU-UUUUUU-UUUUUU-UUUUUU-UUUUUU-UUUUUU-UUUUUU", nil),        // 없는 글자
    ("", nil),
]

var failures = 0
for (key, serial) in cases {
    let got = NotiPetLicense.serial(of: key)
    if got != serial || NotiPetLicense.isValid(key) != (serial != nil) {
        print("실패: \"\(key)\" → \(String(describing: got)), 기대값 \(String(describing: serial))")
        failures += 1
    }
}
print(failures == 0 ? "모두 통과했어요 (\(cases.count)개)" : "\(failures)개 실패했어요")
exit(failures == 0 ? 0 : 1)

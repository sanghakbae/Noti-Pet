import AppKit
import CryptoKit

/// NotiPet 라이선스 키 확인.
///
/// 키는 48자(Crockford Base32, 30바이트)예요.
///   내용          버전 1바이트 + 일련번호 4바이트 (big-endian)
///   바이트 0~24   서명: HMAC-SHA256(비밀키, "NotiPet-License-v1" + 내용)의 앞 25바이트
///   바이트 25~29  내용 XOR HMAC-SHA256(비밀키, "NotiPet-Mask-v1" + 서명)의 앞 5바이트
///                 (키 전체가 무작위처럼 보이고 일련번호가 드러나지 않게 가려요)
///
/// 키는 keygen.py로 만들어요. 한쪽을 바꾸면 다른 쪽도 같이 바꿔야 해요.
/// 비밀키는 `keygen.py swift`가 만든 NotiPetLicenseSecret.swift에 있어요.
enum NotiPetLicense {
    /// 새어 나간 키의 일련번호를 넣으면 다음 버전부터 그 키가 막혀요.
    static let revokedSerials: Set<UInt32> = []

    private static let defaultsKey = "licenseKey"
    private static let version: UInt8 = 1
    private static let tagLength = 25
    private static let keyLength = 48
    private static let domain = Array("NotiPet-License-v1".utf8)
    private static let maskDomain = Array("NotiPet-Mask-v1".utf8)
    private static let alphabet = Array("0123456789ABCDEFGHJKMNPQRSTVWXYZ".unicodeScalars)

    /// 저장해 둔 키가 있고 올바르면 true.
    static var isActivated: Bool {
        guard let key = UserDefaults.standard.string(forKey: defaultsKey) else { return false }
        return isValid(key)
    }

    static func isValid(_ key: String) -> Bool {
        guard let serial = serial(of: key) else { return false }
        return !revokedSerials.contains(serial)
    }

    /// 키가 올바르면 저장하고 true.
    @discardableResult
    static func activate(_ key: String) -> Bool {
        guard isValid(key) else { return false }
        UserDefaults.standard.set(key, forKey: defaultsKey)
        return true
    }

    /// 서명이 맞으면 일련번호, 아니면 nil. 막힌 키인지는 보지 않아요.
    static func serial(of key: String) -> UInt32? {
        guard let bytes = decode(key) else { return nil }
        let secret = SymmetricKey(data: NotiPetLicenseSecret.bytes)
        let tag = Array(bytes[0..<tagLength])
        let pad = Array(HMAC<SHA256>.authenticationCode(for: maskDomain + tag, using: secret))
        let payload = (0..<5).map { bytes[tagLength + $0] ^ pad[$0] }
        guard payload[0] == version else { return nil }
        let mac = Array(HMAC<SHA256>.authenticationCode(for: domain + payload, using: secret))
        var diff: UInt8 = 0
        for i in 0..<tagLength { diff |= mac[i] ^ tag[i] }
        guard diff == 0 else { return nil }
        return payload[1...].reduce(UInt32(0)) { ($0 << 8) | UInt32($1) }
    }

    /// 앱을 켤 때 가장 먼저 불러요. 올바른 키가 없으면 입력 창을 띄우고, 종료를 누르면 앱을 끝내요.
    @MainActor
    static func requireActivation() {
        guard !isActivated else { return }
        var message = "받으신 48자 키를 입력해 주세요."
        var typed = ""
        while true {
            let alert = NSAlert()
            alert.messageText = "NotiPet 키 입력"
            alert.informativeText = message
            alert.addButton(withTitle: "확인")
            alert.addButton(withTitle: "종료")
            let field = KeyField(frame: NSRect(x: 0, y: 0, width: 440, height: 24))
            field.font = .monospacedSystemFont(ofSize: 13, weight: .regular)
            field.placeholderString = "XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX"
            field.stringValue = typed
            alert.accessoryView = field
            alert.window.initialFirstResponder = field
            NSApp.activate(ignoringOtherApps: true)
            guard alert.runModal() == .alertFirstButtonReturn else { exit(0) }
            typed = field.stringValue
            if activate(typed) { return }
            message = "키가 맞지 않아요. 한 글자씩 다시 확인해 주세요."
        }
    }

    /// 하이픈·공백은 건너뛰고 대소문자와 O/I/L은 가려 읽어요. 48자가 아니면 nil.
    private static func decode(_ key: String) -> [UInt8]? {
        var bytes: [UInt8] = []
        var buffer = 0
        var bits = 0
        var count = 0
        for scalar in key.uppercased().unicodeScalars {
            if scalar == "-" || CharacterSet.whitespacesAndNewlines.contains(scalar) { continue }
            let c: Unicode.Scalar
            switch scalar {
            case "O": c = "0"
            case "I", "L": c = "1"
            default: c = scalar
            }
            guard let value = alphabet.firstIndex(of: c), count < keyLength else { return nil }
            count += 1
            buffer = (buffer << 5) | value
            bits += 5
            if bits >= 8 {
                bits -= 8
                bytes.append(UInt8(buffer >> bits))
                buffer &= (1 << bits) - 1
            }
        }
        return count == keyLength ? bytes : nil
    }
}

/// 메뉴바 앱에는 편집 메뉴가 없어서 ⌘V가 안 먹어요. 입력 칸에서 직접 처리해요.
private final class KeyField: NSTextField {
    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        guard event.modifierFlags.intersection(.deviceIndependentFlagsMask) == .command else {
            return super.performKeyEquivalent(with: event)
        }
        let action: Selector?
        switch event.charactersIgnoringModifiers?.lowercased() {
        case "v": action = #selector(NSText.paste(_:))
        case "c": action = #selector(NSText.copy(_:))
        case "x": action = #selector(NSText.cut(_:))
        case "a": action = #selector(NSResponder.selectAll(_:))
        default: action = nil
        }
        if let action = action, NSApp.sendAction(action, to: nil, from: self) { return true }
        return super.performKeyEquivalent(with: event)
    }
}

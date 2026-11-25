import SwiftUI

enum Ending: String, Codable, CaseIterable, Identifiable {
    case solo, chorus
    var id: Self { self }
    var title: String { self == .solo ? "ギターソロ" : "客席と合唱" }
    var color: Color { self == .solo ? Color(red: 0.61, green: 0.51, blue: 0.92) : Color(red: 0.35, green: 0.73, blue: 0.66) }
}

struct ShowState: Decodable {
    let code, phase, light: String
    let connected, round, remaining: Int
    let online: Bool
    let selected, winner: Ending?
    let counts: [String: Int]
}

@MainActor
final class Session: ObservableObject {
    @Published var address = UserDefaults.standard.string(forKey: "address") ?? "http://127.0.0.1:8787"
    @Published var credential = ""
    @Published var message = ""
    @Published private(set) var joined = false
    @Published private(set) var state: ShowState?
    @Published var muted = false {
        didSet { if joined { UserDefaults.standard.set(muted, forKey: muteKey) } }
    }
    let isStudio: Bool
    private let id: String
    private var socket: URLSessionWebSocketTask?
    private var loop: Task<Void, Never>?
    private var pulse: Task<Void, Never>?
    private var foreground = true
    private var lastState = Date()
    private var base: URL?
    private var muteKey: String { "muted." + (base?.absoluteString ?? "") + "." + credential }

    init(studio: Bool) {
        isStudio = studio
        let defaults = UserDefaults.standard
        id = defaults.string(forKey: "participant") ?? UUID().uuidString
        defaults.set(id, forKey: "participant")
    }

    var invite: URL? {
        guard let base, let code = state?.code else { return nil }
        return base.appending(queryItems: [.init(name: "code", value: code)])
    }

    func join() {
        let input = address.trimmingCharacters(in: .whitespacesAndNewlines)
        credential = credential.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: input), ["http","https"].contains(url.scheme ?? ""),
              url.host != nil, url.query == nil, url.fragment == nil, url.user == nil, url.password == nil,
              ["","/"].contains(url.path) else { message = "サーバーURLを入力してください。"; return }
        guard isStudio ? !credential.isEmpty : credential.range(of: "^[0-9]{6}$", options: .regularExpression) != nil
        else { message = isStudio ? "Studioキーを入力してください。" : "6桁のイベントコードを入力してください。"; return }
        base = url
        UserDefaults.standard.set(input, forKey: "address")
        muted = UserDefaults.standard.bool(forKey: muteKey)
        joined = true
        run()
    }

    func leave() {
        joined = false
        halt()
        message = ""
    }

    func scene(_ phase: ScenePhase) {
        foreground = phase == .active
        if foreground && joined { run() }
        else if !foreground { halt() }
    }

    func action(_ type: String, choice: Ending? = nil) {
        guard let socket, let state else { return }
        var data: [String: Any] = ["type": type]
        if let choice { data["choice"] = choice.rawValue }
        if type == "vote" { data["round"] = state.round }
        Task {
            do { try await send(data, to: socket) }
            catch { if self.socket === socket { socket.cancel(with: .goingAway, reason: nil) } }
        }
    }

    private func send(_ values: [String: Any], to socket: URLSessionWebSocketTask) async throws {
        let data = try JSONSerialization.data(withJSONObject: values)
        try await socket.send(.string(String(decoding: data, as: UTF8.self)))
    }

    private func halt() {
        loop?.cancel(); loop = nil
        pulse?.cancel(); pulse = nil
        socket?.cancel(with: .goingAway, reason: nil); socket = nil
        state = nil
    }

    private func run() {
        guard joined, foreground, loop == nil, let base,
              var route = URLComponents(url: base, resolvingAgainstBaseURL: false) else { return }
        route.scheme = base.scheme == "https" ? "wss" : "ws"
        route.path = "/live"
        guard let url = route.url else { return }
        loop = Task { [weak self] in
            guard let self else { return }
            while !Task.isCancelled {
                let ws = URLSession.shared.webSocketTask(with: url)
                socket = ws
                message = "サーバーに接続中…"
                ws.resume()
                lastState = Date()
                pulse = Task { [self] in
                    while !Task.isCancelled, socket === ws {
                        do {
                            try await Task.sleep(for: .milliseconds(400))
                            guard socket === ws else { return }
                            if Date().timeIntervalSince(lastState) > (state == nil ? 5 : 1.25) {
                                state = nil
                                ws.cancel(with: .goingAway, reason: nil)
                                return
                            }
                            if isStudio && state != nil { try await send(["type": "ping"], to: ws) }
                        } catch { return }
                    }
                }
                do {
                    try await send(["type": "join", "role": isStudio ? "studio" : "audience",
                                    "key": isStudio ? credential : "", "code": isStudio ? "" : credential, "id": id], to: ws)
                    while !Task.isCancelled {
                        let event = try await ws.receive()
                        guard socket === ws else { return }
                        let data: Data
                        switch event {
                        case .data(let bytes): data = bytes
                        case .string(let text): data = Data(text.utf8)
                        @unknown default: continue
                        }
                        if let current = try? JSONDecoder().decode(ShowState.self, from: data) {
                            lastState = Date()
                            if state == nil { message = "" }
                            state = current
                        } else if let info = try? JSONSerialization.jsonObject(with: data) as? [String: String],
                                  let notice = info["message"] { message = notice }
                    }
                } catch { /* A dropped connection is retried while this screen is active. */ }
                guard socket === ws, !Task.isCancelled else { return }
                pulse?.cancel(); state = nil; socket = nil
                if [4003,4009].contains(ws.closeCode.rawValue) {
                    message = ws.closeCode.rawValue == 4009 ? "別のStudioが操作中です。" : "キーまたはコードを確認してください。"
                    joined = false; loop = nil
                    return
                }
                message = "接続が切れました。再接続中…"
                try? await Task.sleep(for: .milliseconds(800))
            }
        }
    }
}

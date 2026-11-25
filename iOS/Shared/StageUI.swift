import SwiftUI

let night = Color(red: 0.045, green: 0.048, blue: 0.085)
let lilac = Color(red: 0.76, green: 0.69, blue: 0.99)

struct Brand: View {
    let role: String
    var body: some View {
        HStack {
            Image(systemName: "waveform").foregroundStyle(lilac)
            Text("LightSync").font(.system(size: 25, weight: .semibold))
            Spacer()
            Text(role).font(.caption.monospaced()).tracking(2).foregroundStyle(.secondary)
        }.padding(.vertical, 8)
    }
}

struct ConnectView: View {
    @ObservedObject var session: Session
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 19) {
                Brand(role: session.isStudio ? "STUDIO" : "AUDIENCE")
                Divider()
                Image(systemName: session.isStudio ? "slider.horizontal.3" : "waveform")
                    .font(.system(size: 50, weight: .light)).foregroundStyle(lilac).padding(.top, 24)
                Text(session.isStudio ? "客席に、合図を。" : "この曲のラストは、\n客席が決める。")
                    .font(.largeTitle.bold()).padding(.bottom, 15)
                Text("サーバーURL").font(.caption)
                TextField("http://192.168.1.2:8787", text: $session.address).keyboardType(.URL)
                Text(session.isStudio ? "Studioキー" : "イベントコード").font(.caption)
                if session.isStudio { SecureField("Macに表示されたキー", text: $session.credential) }
                else { TextField("6桁のコード", text: $session.credential).keyboardType(.numberPad) }
                Button(session.isStudio ? "Studioを開く" : "参加する") { session.join() }
                    .buttonStyle(.borderedProminent).controlSize(.large)
                if !session.message.isEmpty { Text(session.message).font(.callout).foregroundStyle(.secondary) }
            }.padding(24)
        }.textFieldStyle(.roundedBorder).textInputAutocapitalization(.never).autocorrectionDisabled()
    }
}

struct Reconnecting: View {
    @ObservedObject var session: Session
    var body: some View {
        VStack(spacing: 20) {
            ProgressView()
            Text(session.message).foregroundStyle(.secondary)
            Button("接続画面へ戻る") { session.leave() }
        }
    }
}

struct StageApp<Content: View>: View {
    @ObservedObject var session: Session
    @ViewBuilder var content: (ShowState) -> Content
    @Environment(\.scenePhase) private var phase
    var body: some View {
        ZStack {
            night.ignoresSafeArea()
            if !session.joined { ConnectView(session: session) }
            else if let state = session.state { content(state) }
            else { Reconnecting(session: session) }
        }.preferredColorScheme(.dark).tint(lilac)
        .onChange(of: phase) { _, phase in session.scene(phase) }
        .onChange(of: session.joined) { _, active in UIApplication.shared.isIdleTimerDisabled = active }
    }
}

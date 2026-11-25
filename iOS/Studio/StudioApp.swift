import SwiftUI
import CoreImage.CIFilterBuiltins

@main
struct StudioApp: App {
    @StateObject private var session = Session(studio: true)
    var body: some Scene {
        WindowGroup { StageApp(session: session) { state in Desk(session: session, state: state) } }
    }
}

struct Desk: View {
    @ObservedObject var session: Session
    let state: ShowState
    @State private var invites = false
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                Brand(role: "STUDIO")
                HStack {
                    Text("客席  \(state.connected) 台").font(.headline)
                    Spacer()
                    Button("参加用QR") { invites = true }
                }
                Divider()
                Text("最後の8小節").font(.largeTitle.bold())
                Text(state.phase == "open" ? "投票受付中 · 残り \(state.remaining) 秒" : state.winner.map { "決定 · " + $0.title } ?? "曲前のMCで投票を開いてください。")
                ForEach(Ending.allCases) { ending in
                    HStack {
                        Circle().fill(ending.color).frame(width: 13, height: 13)
                        Text(ending.title); Spacer()
                        Text("\(state.counts[ending.rawValue] ?? 0) 票").monospacedDigit()
                    }.padding(14).background(.white.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
                }
                Text("同票・無票の場合はギターソロで進行します。").font(.footnote).foregroundStyle(.secondary)
                Button("投票を10秒開く") { session.action("open") }.disabled(state.phase == "open")
                Button("選ばれた結末の色を送る") { session.action("result") }.disabled(state.winner == nil)
                Divider()
                Text("手動点灯").font(.caption)
                HStack {
                    ForEach(Ending.allCases) { ending in
                        Button(ending == .solo ? "パープル" : "ミント") { session.action("cue", choice: ending) }
                            .tint(ending.color)
                    }
                }.disabled(state.phase == "open")
                if !session.message.isEmpty { Text(session.message).font(.footnote) }
                Button("接続を終了") { session.leave() }.buttonStyle(.borderless)
            }.padding(22)
        }.buttonStyle(.bordered)
        .safeAreaInset(edge: .bottom) {
            Button { session.action("stop") } label: {
                Label("全員を消灯", systemImage: "stop.fill").frame(maxWidth: .infinity)
            }.buttonStyle(.borderedProminent).tint(.red).controlSize(.large).padding().background(night)
        }
        .sheet(isPresented: $invites) {
            VStack(spacing: 22) {
                Text("観客の参加用QR").font(.title2.bold())
                if let url = session.invite {
                    if let image = qrImage(url) { Image(uiImage: image).interpolation(.none).resizable().frame(width: 205, height: 205).padding(12).background(.white) }
                    Text(state.code).font(.title.monospacedDigit())
                    Text(url.absoluteString).font(.footnote).textSelection(.enabled)
                    ShareLink(item: url) { Label("参加リンクを共有", systemImage: "square.and.arrow.up") }
                }
                Button("閉じる") { invites = false }
            }.padding().presentationDetents([.medium, .large])
        }
    }

    private func qrImage(_ url: URL) -> UIImage? {
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(url.absoluteString.utf8)
        guard let output = filter.outputImage,
              let cg = CIContext().createCGImage(output, from: output.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}

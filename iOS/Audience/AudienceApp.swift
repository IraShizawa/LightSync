import SwiftUI

@main
struct AudienceApp: App {
    @StateObject private var session = Session(studio: false)
    var body: some Scene {
        WindowGroup { StageApp(session: session) { state in AudienceScreen(session: session, state: state) } }
    }
}

struct AudienceScreen: View {
    @ObservedObject var session: Session
    let state: ShowState
    @State private var level = 0.6
    var body: some View {
        let color = state.online && !session.muted ? Ending(rawValue: state.light)?.color : nil
        ZStack {
            (color ?? .black).opacity(level).ignoresSafeArea()
                .animation(color == nil ? nil : .easeInOut(duration: 0.65), value: state.light)
            VStack(alignment: .leading, spacing: 17) {
                Brand(role: "AUDIENCE")
                HStack { Text("EVENT  /  " + state.code).font(.caption.monospaced()); Spacer(); Button("退出") { session.leave() } }
                Spacer()
                VStack(alignment: .leading, spacing: 14) {
                    if !state.online { Text("主催者を待っています").font(.title.bold()) }
                    else if state.phase == "open" {
                        Text("残り \(state.remaining) 秒").font(.caption.monospacedDigit())
                        if let selected = state.selected { Text(selected.title + "に投票しました").font(.title2.bold()) }
                        else {
                            Text("最後の8小節は？").font(.title.bold())
                            ForEach(Ending.allCases) { ending in
                                Button(ending.title) { session.action("vote", choice: ending) }
                                    .buttonStyle(.borderedProminent).tint(ending.color)
                            }
                        }
                    } else if let winner = state.winner { Text(winner.title + "に決定").font(.title.bold()) }
                    else { Text(state.light == "off" ? "開演を待っています" : "演出に参加中").font(.title.bold()) }
                }
                .padding().background(.black.opacity(0.65), in: RoundedRectangle(cornerRadius: 12))
                HStack { Text("光の明るさ").font(.caption); Slider(value: $level, in: 0.1...1).accessibilityLabel("光の明るさ") }
                Button { session.muted.toggle() } label: {
                    Text(session.muted ? "点灯への参加を再開" : "自分だけ消灯").frame(maxWidth: .infinity)
                }.buttonStyle(.borderedProminent).controlSize(.large)
            }.padding(22)
        }
    }
}

const el = id => document.getElementById(id);
const names = { solo: "ギターソロ", chorus: "客席と合唱" };
const colors = { solo: "#9d83eb", chorus: "#58b9a9" };
let ws, retry, lease, active = false, state = null, muted = false, code = "";
const id = sessionStorage.getItem("lightsync-id") || Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2, "0")).join("");
sessionStorage.setItem("lightsync-id", id);
el("code").value = new URLSearchParams(location.search).get("code") || "";
function render() {
  const light = !muted && state?.online && !document.hidden && colors[state.light];
  const lamp = el("lamp");
  lamp.classList.toggle("dark", !light);
  lamp.style.backgroundColor = light || "#0b0c16";
  lamp.style.opacity = light ? Number(el("level").value) / 100 : 1;
  document.body.classList.toggle("lit", Boolean(light));
  el("mute").textContent = muted ? "点灯への参加を再開" : "自分だけ消灯";
  const voting = state?.online && state.phase === "open";
  el("options").hidden = !voting || Boolean(state?.selected);
  el("mode").textContent = voting ? "VOTE  /  " + state.remaining + " 秒" : "LIVE  /  " + code;
  let title = "接続しています", detail = "接続を確認するまで、画面は消灯します。";
  if (state && !state.online) { title = "主催者を待っています"; detail = "Studioの接続後に参加できます。"; }
  if (state?.online) {
    if (voting) { title = state.selected ? names[state.selected] + "に投票しました" : "最後の8小節は？"; detail = state.selected ? "結果はMCがお知らせします。" : "好きな結末を一度選んでください。"; }
    else if (state.winner) { title = names[state.winner] + "に決定"; detail = "ステージで曲の結末をお楽しみください。"; }
    else { title = state.light === "off" ? "開演を待っています" : "演出に参加中"; detail = "いつでも自分だけ消灯できます。"; }
  }
  if (muted) detail = "自分の画面は消灯中です。";
  if (el("title").textContent !== title) el("title").textContent = title;
  if (el("detail").textContent !== detail) el("detail").textContent = detail;
}
function dark() { clearTimeout(lease); state = null; render(); }
function disconnect() {
  clearTimeout(retry);
  if (ws) { const old = ws; ws = null; old.close(); }
  dark();
}
function leave(message) {
  active = false; disconnect(); el("show").hidden = true; el("entry").hidden = false; el("hint").textContent = message;
}
function connect() {
  if (!active || document.hidden) return;
  disconnect();
  const socket = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/live");
  ws = socket;
  socket.onopen = () => { if (socket === ws) socket.send(JSON.stringify({ type: "join", role: "audience", code, id })); };
  socket.onmessage = event => {
    if (socket !== ws || !active || document.hidden) return;
    const next = JSON.parse(event.data);
    if (next.type !== "state") return;
    state = next; render(); clearTimeout(lease);
    lease = setTimeout(connect, 1250);
  };
  socket.onclose = event => {
    if (socket !== ws) return;
    ws = null; dark();
    if (event.code === 4003) { leave("イベントコードを確認してください。"); return; }
    if (active && !document.hidden) retry = setTimeout(connect, 800);
  };
}
el("join").onsubmit = event => {
  event.preventDefault(); code = el("code").value.trim(); active = true;
  muted = sessionStorage.getItem("mute-" + code) === "yes";
  el("room").textContent = "EVENT  /  " + code; el("show").hidden = false; el("entry").hidden = true; connect();
};
el("exit").onclick = () => leave("イベントから退出しました。");
el("mute").onclick = () => {
  muted = !muted; sessionStorage.setItem("mute-" + code, muted ? "yes" : "no"); render();
};
el("level").oninput = render;
document.querySelectorAll("[data-choice]").forEach(button => button.onclick = () => {
  if (ws?.readyState === WebSocket.OPEN && state?.phase === "open" && !state.selected)
    ws.send(JSON.stringify({ type: "vote", round: state.round, choice: button.dataset.choice }));
});
document.addEventListener("visibilitychange", () => { if (document.hidden) disconnect(); else connect(); });
window.addEventListener("pagehide", disconnect);
window.addEventListener("pageshow", event => { if (event.persisted) connect(); });

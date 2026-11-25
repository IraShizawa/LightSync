import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { networkInterfaces } from "node:os";
import { randomBytes, randomInt } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import { Show } from "./session.ts";

const code = String(randomInt(100000, 1000000));
const key = randomBytes(12).toString("base64url");
const show = new Show();
const sockets = new WebSocketServer({ noServer: true, maxPayload: 2048 });
type Peer = { role: "studio" | "audience"; id: string };
const peers = new Map<WebSocket, Peer>();
let studio: WebSocket | null = null;
let studioSeen = 0;
const files = new Map([["/", ["index.html", "text/html"]], ["/app.js", ["app.js", "text/javascript"]], ["/style.css", ["style.css", "text/css"]]]);
const server = createServer(async (req, res) => {
  const file = files.get((req.url ?? "").split("?")[0]);
  if (!file || req.method !== "GET") { res.writeHead(404).end(); return; }
  try {
    const data = await readFile(new URL("public/" + file[0], import.meta.url));
    res.writeHead(200, { "Content-Type": file[1] + "; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" }).end(data);
  } catch { res.writeHead(500).end(); }
});
server.on("upgrade", (request, socket, head) => {
  if (request.url !== "/live" || (request.headers.origin && request.headers.origin !== "http://" + request.headers.host)) { socket.destroy(); return; }
  sockets.handleUpgrade(request, socket, head, ws => sockets.emit("connection", ws));
});

function send(ws: WebSocket, message: object) {
  if (ws.readyState === WebSocket.OPEN && ws.bufferedAmount < 32768) ws.send(JSON.stringify(message));
}
function broadcast() {
  const now = Date.now();
  if (studio && now - studioSeen > 1200) {
    const expired = studio;
    studio = null;
    peers.delete(expired);
    show.stop(now);
    expired.close(4000, "studio timeout");
  }
  show.settle(now);
  const connected = new Set([...peers.values()].filter(p => p.role === "audience").map(p => p.id)).size;
  for (const [ws, peer] of peers) {
    const vote = show.votes.get(peer.id) ?? null;
    send(ws, { type: "state", code, phase: show.phase, round: show.round,
      remaining: Math.max(0, Math.ceil((show.closesAt - now) / 1000)),
      light: show.phase === "open" && vote ? vote : show.light,
      selected: vote, winner: show.winner, connected, online: studio !== null,
      counts: show.phase === "open" && peer.role !== "studio" ? { solo: 0, chorus: 0 } : show.counts });
  }
}
sockets.on("connection", ws => {
  const authTimer = setTimeout(() => { if (!peers.has(ws)) ws.close(4003, "join timeout"); }, 4000);
  ws.on("error", () => ws.terminate());
  ws.on("close", () => {
    clearTimeout(authTimer);
    peers.delete(ws);
    if (studio === ws) { studio = null; show.stop(Date.now()); }
    broadcast();
  });
  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { ws.close(1007); return; }
    if (!msg || typeof msg !== "object") { ws.close(1007); return; }
    const peer = peers.get(ws);
    const now = Date.now();
    if (!peer) {
      if (msg.type !== "join" || !["studio", "audience"].includes(msg.role) ||
          (msg.role === "studio" ? msg.key !== key : msg.code !== code) ||
          typeof msg.id !== "string" || !/^[a-zA-Z0-9-]{8,80}$/.test(msg.id)) {
        ws.close(4003, "invalid credentials"); return;
      }
      if (msg.role === "studio" && studio) { ws.close(4009, "studio in use"); return; }
      if (msg.role === "studio") { studio = ws; studioSeen = now; }
      peers.set(ws, { role: msg.role, id: msg.id });
      clearTimeout(authTimer); broadcast(); return;
    }
    if (ws === studio && msg.type === "ping") { studioSeen = now; return; }
    if (peer.role === "audience" && msg.type === "vote" && ["solo", "chorus"].includes(msg.choice)) {
      show.vote(peer.id, msg.round, msg.choice, now); broadcast(); return;
    }
    if (ws !== studio) return;
    let accepted = true;
    show.settle(now);
    switch (msg.type) {
      case "stop": show.stop(now); break;
      case "open": accepted = show.open(now); break;
      case "result": accepted = !!show.winner && show.cue(show.winner, now); break;
      case "cue": accepted = ["solo", "chorus"].includes(msg.choice) && show.cue(msg.choice, now); break;
      default: return;
    }
    if (!accepted) send(ws, { type: "notice", message: "受付中または色の切替直後です。少し待ってください。" });
    broadcast();
  });
});
setInterval(broadcast, 350).unref();
const lan = process.argv.includes("--lan");
server.listen(Number(process.env.PORT || 8787), lan ? "0.0.0.0" : "127.0.0.1", () => {
  const port = server.address().port;
  const hosts = ["127.0.0.1"];
  if (lan) for (const networks of Object.values(networkInterfaces())) {
    for (const address of networks ?? []) if (address.family === "IPv4" && !address.internal) hosts.push(address.address);
  }
  console.log("Studio key:", key, "\nEvent code:", code);
  for (const host of hosts) console.log("Audience:", "http://" + host + ":" + port + "/?code=" + code);
});

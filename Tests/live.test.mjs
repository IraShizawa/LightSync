import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { WebSocket } from "ws";

async function serverFor(t) {
  const child = spawn(process.execPath, ["Server/main.ts"], {
    cwd: new URL("../", import.meta.url), env: { ...process.env, PORT: "0" }, stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => child.kill());
  let log = "";
  for await (const chunk of child.stdout) {
    log += chunk;
    const address = log.match(/Audience: (http:\/\/127\.0\.0\.1:\d+)/);
    if (address) return { address: address[1], key: log.match(/Studio key: (\S+)/)[1], code: log.match(/Event code: (\d+)/)[1] };
  }
  throw new Error("Test server did not start");
}

async function join(t, server, role, id) {
  const ws = new WebSocket(server.address.replace("http:", "ws:") + "/live");
  t.after(() => ws.terminate());
  const send = data => ws.send(JSON.stringify(data));
  function wait(predicate) {
    return new Promise((resolve, reject) => {
      function onMessage(raw) {
        const state = JSON.parse(raw);
        if (state.type !== "state" || !predicate(state)) return;
        clearTimeout(timer); ws.off("message", onMessage); resolve(state);
      }
      const timer = setTimeout(() => { ws.off("message", onMessage); reject(new Error("Timed out waiting for state")); }, 3500);
      ws.on("message", onMessage);
    });
  }
  await once(ws, "open");
  const joined = wait(() => true);
  send({ type: "join", role, id, code: server.code, key: role === "studio" ? server.key : "" });
  await joined;
  return { ws, send, wait };
}

test("real clients join, light two screens, vote once after reconnect and black out on Studio loss", async t => {
  const server = await serverFor(t);
  assert.equal((await fetch(server.address)).status, 200);
  const studio = await join(t, server, "studio", "operator-01");
  const beat = setInterval(() => { if (studio.ws.readyState === 1) studio.send({type: "ping"}); }, 400);
  t.after(() => clearInterval(beat));
  const a = await join(t, server, "audience", "guest-one");
  const b = await join(t, server, "audience", "guest-two");
  a.send({type:"cue", choice:"chorus"});
  assert.equal((await b.wait(s => s.connected === 2)).light, "off");
  const lit = [a, b].map(client => client.wait(s => s.light === "solo"));
  studio.send({ type: "cue", choice: "solo" });
  await Promise.all(lit);
  const stopped = a.wait(s => s.light === "off");
  studio.send({ type: "stop" });
  await stopped;
  await new Promise(resolve => setTimeout(resolve, 1250));
  const opened = a.wait(s => s.phase === "open");
  studio.send({ type: "open" });
  const { round } = await opened;
  a.send({ type: "vote", round, choice: "chorus" });
  await studio.wait(s => s.counts.chorus === 1);
  a.ws.close(); await once(a.ws, "close");
  const same = await join(t, server, "audience", "guest-one");
  same.send({ type: "vote", round, choice: "solo" });
  const duplicate = await studio.wait(s => s.connected === 2);
  assert.deepEqual(duplicate.counts, { solo: 0, chorus: 1 });
  const dark = same.wait(s => !s.online && s.phase === "idle" && s.light === "off");
  clearInterval(beat);
  await dark;
});

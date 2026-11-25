import test from "node:test";
import assert from "node:assert/strict";
import { Show } from "../Server/session.ts";
test("deadline, replayed votes, stale rounds and tied outcome", () => {
  const show = new Show();
  assert.ok(show.open(0));
  assert.ok(show.vote("one", 1, "chorus", 100));
  assert.equal(show.vote("one", 1, "solo", 200), false);
  assert.ok(show.vote("two", 1, "solo", 9999));
  assert.equal(show.vote("three", 1, "chorus", 10000), false);
  assert.equal(show.winner, "solo");
  assert.ok(show.open(12000));
  assert.equal(show.vote("one", 1, "solo", 12020), false);
});
test("stop cancels the round and blocks immediate relight", () => {
  const show = new Show(); show.open(100); show.stop(200);
  show.settle(20000); assert.equal(show.phase, "idle");
  assert.equal(show.cue("chorus", 210), false);
  assert.equal(show.light, "off");
});

export type Choice = "solo" | "chorus";
export type Light = Choice | "off";

export class Show {
  light: Light = "off";
  phase: "idle" | "open" | "closed" = "idle";
  round = 0;
  closesAt = 0;
  winner: Choice | null = null;
  votes = new Map<string, Choice>();
  counts = { solo: 0, chorus: 0 };
  private lastChange = -Infinity;

  open(now: number) {
    if (this.phase === "open" || now - this.lastChange < 1200) return false;
    this.stop(now);
    this.round++;
    this.phase = "open";
    this.closesAt = now + 10_000;
    return true;
  }

  settle(now: number) {
    if (this.phase !== "open" || now < this.closesAt) return;
    this.phase = "closed";
    this.winner = this.counts.chorus > this.counts.solo ? "chorus" : "solo";
    this.lastChange = now;
  }

  vote(id: string, round: number, choice: Choice, now: number) {
    this.settle(now);
    if (this.phase !== "open" || round !== this.round || this.votes.has(id)) return false;
    this.votes.set(id, choice);
    this.counts[choice]++;
    return true;
  }

  cue(light: Choice, now: number) {
    if (this.phase === "open" || now - this.lastChange < 1200) return false;
    this.light = light;
    this.lastChange = now;
    return true;
  }

  stop(now: number) {
    this.light = "off";
    this.phase = "idle";
    this.winner = null;
    this.closesAt = 0;
    this.votes.clear();
    this.counts = { solo: 0, chorus: 0 };
    this.lastChange = now;
  }
}

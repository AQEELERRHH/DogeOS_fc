import Phaser from "phaser";
import { GOAL_HALF, LENGTH, WIDTH, type MatchEvent, type MatchState } from "@dogefc/engine";

export const PX = 25; // pixels per metre
const PAD = 16;
export const PITCH_W = LENGTH * PX + PAD * 2;
export const PITCH_H = WIDTH * PX + PAD * 2;

const sx = (x: number) => PAD + x * PX;
const sy = (y: number) => PAD + y * PX;
const hex = (c: string) => parseInt(c.replace("#", ""), 16);

export interface FrameSource {
  prev: MatchState | null;
  cur: MatchState | null;
  alpha: number;
}

/** Draws the cage, players and ball, interpolating between engine ticks. */
export class PitchScene extends Phaser.Scene {
  private source: () => FrameSource;
  private players: Phaser.GameObjects.Container[] = [];
  private ring!: Phaser.GameObjects.Arc;
  private you!: Phaser.GameObjects.Container;
  private ball!: Phaser.GameObjects.Arc;
  private shadow!: Phaser.GameObjects.Ellipse;
  private banner!: Phaser.GameObjects.Text;
  private seenEvents = 0;
  private built = false;

  constructor(source: () => FrameSource) {
    super("pitch");
    this.source = source;
  }

  create() {
    const g = this.add.graphics();
    // Grass stripes
    for (let i = 0; i < 10; i++) {
      g.fillStyle(i % 2 ? 0x0c3127 : 0x0a2a22).fillRect(sx((LENGTH / 10) * i), sy(0), (LENGTH / 10) * PX, WIDTH * PX);
    }
    // Cage walls
    g.lineStyle(4, 0x22304a).strokeRect(sx(0) - 2, sy(0) - 2, LENGTH * PX + 4, WIDTH * PX + 4);
    // Lines
    g.lineStyle(2, 0xeceff4, 0.55);
    g.lineBetween(sx(LENGTH / 2), sy(0), sx(LENGTH / 2), sy(WIDTH));
    g.strokeCircle(sx(LENGTH / 2), sy(WIDTH / 2), 3 * PX);
    g.fillStyle(0xeceff4, 0.7).fillCircle(sx(LENGTH / 2), sy(WIDTH / 2), 3);
    for (const left of [true, false]) {
      const x0 = left ? 0 : LENGTH;
      const d = left ? 1 : -1;
      // Keeper's area: a 6 m semicircle-ish box
      g.lineStyle(2, 0xeceff4, 0.55);
      g.strokeRect(left ? sx(0) : sx(LENGTH - 6), sy(WIDTH / 2 - 5), 6 * PX, 10 * PX);
      // Goal
      g.lineStyle(4, 0xeceff4, 0.95);
      g.strokeRect(left ? sx(x0) - 12 : sx(x0), sy(WIDTH / 2 - GOAL_HALF), 12, GOAL_HALF * 2 * PX);
      g.fillStyle(0xeceff4, 0.08).fillRect(left ? sx(x0) - 12 : sx(x0), sy(WIDTH / 2 - GOAL_HALF), 12, GOAL_HALF * 2 * PX);
      void d;
    }

    this.ring = this.add.circle(0, 0, 0.85 * PX).setStrokeStyle(2, 0xffb020, 0.9).setFillStyle(0, 0).setDepth(4);
    this.shadow = this.add.ellipse(0, 0, 10, 5, 0x000000, 0.35).setDepth(5);
    // Player-manager marker: a bobbing arrow over the player you control.
    const arrow = this.add.triangle(0, 0, -10, -8, 10, -8, 0, 5, 0x22e4f5).setStrokeStyle(2, 0x070b14);
    const label = this.add
      .text(0, -20, "YOU", { fontFamily: '"Press Start 2P", monospace', fontSize: "12px", color: "#22E4F5", stroke: "#070B14", strokeThickness: 3 })
      .setOrigin(0.5);
    this.you = this.add.container(0, 0, [arrow, label]).setDepth(20).setVisible(false);
    this.tweens.add({ targets: arrow, y: -4, duration: 420, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.ball = this.add.circle(0, 0, 0.27 * PX, 0xffffff).setStrokeStyle(1.5, 0x070b14).setDepth(12);
    this.banner = this.add
      .text(PITCH_W / 2, PITCH_H / 2, "", { fontFamily: '"Press Start 2P", monospace', fontSize: "44px", color: "#22E4F5", stroke: "#070B14", strokeThickness: 8 })
      .setOrigin(0.5)
      .setDepth(30)
      .setAlpha(0);
  }

  private build(s: MatchState) {
    for (const p of s.players) {
      const club = p.team === 0 ? s.config.home : s.config.away;
      const body = this.add.circle(0, 0, 0.56 * PX, hex(club.color)).setStrokeStyle(p.slot === 0 ? 4 : 2, p.slot === 0 ? 0xffffff : hex(club.trim));
      const num = this.add
        .text(0, 0, String(p.def.number), { fontFamily: '"Chakra Petch", sans-serif', fontSize: "13px", fontStyle: "700", color: club.trim })
        .setOrigin(0.5);
      const name = this.add
        .text(0, 0.95 * PX, p.def.name, { fontFamily: '"Chakra Petch", sans-serif', fontSize: "11px", color: "#ECEFF4" })
        .setOrigin(0.5)
        .setAlpha(0.85);
      const c = this.add.container(0, 0, [body, num, name]).setDepth(8);
      this.players.push(c);
    }
    this.built = true;
  }

  update() {
    const { prev, cur, alpha } = this.source();
    if (!cur) return;
    if (!this.built) this.build(cur);
    const a = prev && prev.tick < cur.tick ? alpha : 1;
    const lerp = (p: number, c: number) => p + (c - p) * a;
    cur.players.forEach((p, i) => {
      const q = prev?.players[i] ?? p;
      const jump = Math.abs(q.pos.x - p.pos.x) + Math.abs(q.pos.y - p.pos.y) > 4;
      const x = jump ? p.pos.x : lerp(q.pos.x, p.pos.x);
      const y = jump ? p.pos.y : lerp(q.pos.y, p.pos.y);
      this.players[i].setPosition(sx(x), sy(y));
      this.players[i].setAlpha(cur.tick < p.beatenUntil ? 0.7 : 1);
    });
    const pb = prev?.ball.pos ?? cur.ball.pos;
    const jumpB = Math.abs(pb.x - cur.ball.pos.x) + Math.abs(pb.y - cur.ball.pos.y) > 6;
    const bx = jumpB ? cur.ball.pos.x : lerp(pb.x, cur.ball.pos.x);
    const by = jumpB ? cur.ball.pos.y : lerp(pb.y, cur.ball.pos.y);
    this.ball.setPosition(sx(bx), sy(by));
    this.shadow.setPosition(sx(bx) + 3, sy(by) + 4);
    if (cur.ball.owner >= 0) {
      const o = this.players[cur.ball.owner];
      this.ring.setVisible(true).setPosition(o.x, o.y);
    } else this.ring.setVisible(false);
    const ctl = cur.control?.[0];
    if (ctl) {
      const pl = this.players[ctl.idx];
      this.you.setVisible(true).setPosition(pl.x, pl.y - 0.95 * PX);
    } else this.you.setVisible(false);

    // New events → effects
    if (cur.events.length < this.seenEvents) this.seenEvents = 0;
    for (const e of cur.events.slice(this.seenEvents)) this.effect(e, cur);
    this.seenEvents = cur.events.length;
  }

  private flash(text: string, color: string) {
    this.banner.setText(text).setColor(color).setAlpha(1).setScale(0.6);
    this.tweens.killTweensOf(this.banner);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 260, ease: "Back.easeOut" });
    this.tweens.add({ targets: this.banner, alpha: 0, delay: 1300, duration: 400 });
  }

  private effect(e: MatchEvent, s: MatchState) {
    if (e.type === "goal") {
      const club = e.team === 0 ? s.config.home : s.config.away;
      this.flash("GOAL!", club.color);
      this.cameras.main.shake(300, 0.006);
    } else if (e.type === "save" && !e.held) {
      this.cameras.main.shake(120, 0.003);
    } else if (e.type === "halftime") this.flash("HALF-TIME", "#ECEFF4");
    else if (e.type === "fulltime") this.flash("FULL-TIME", "#ECEFF4");
  }
}

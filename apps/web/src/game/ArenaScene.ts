import Phaser from "phaser";
import { COLLAPSED, TRAIL, WALL, type GameEvent, type GameState, type Vec } from "@aftermaze/engine";

export const CELL = 32;

const C = {
  floor: 0x0a1122,
  wall: 0x1b2742,
  wallEdge: 0x24345a,
  trail: 0x2a1f55,
  trailEdge: 0x9b6bff,
  passTrail: 0x22e4f5,
  collapsed: 0x3a0e1c,
  collapsedEdge: 0xff3b5c,
  warn: 0xffb020,
  warnDark: 0x3a2a05,
  nova: 0x22e4f5,
  seeker: 0xff3b5c,
  sentinel: 0xffb020,
  stunned: 0x8b97ad,
  crystal: 0x3cf28b,
  bonus: 0xeceff4,
  exitClosed: 0x9b6bff,
  exitOpen: 0x3cf28b,
};

const key = (v: Vec) => `${v.x},${v.y}`;
const px = (n: number) => n * CELL + CELL / 2;

/**
 * Draws one GameState at a time and animates the change from the previous one.
 * Holds no game logic: every frame comes from the engine.
 */
export class ArenaScene extends Phaser.Scene {
  private board!: Phaser.GameObjects.Graphics;
  private overlay!: Phaser.GameObjects.Graphics;
  private nova!: Phaser.GameObjects.Container;
  private enemies = new Map<number, Phaser.GameObjects.Container>();
  private crystals = new Map<string, Phaser.GameObjects.Rectangle>();
  private bonuses = new Map<string, Phaser.GameObjects.Arc>();
  private exit!: Phaser.GameObjects.Arc;
  private ready = false;
  private queued: { frame: GameState; events: GameEvent[]; tickMs: number } | null = null;
  private warnPhase = 0;
  private lastFrame: GameState | null = null;

  private novaColor: number;

  constructor(novaColor: number = C.nova) {
    super("arena");
    this.novaColor = novaColor;
  }

  create() {
    this.board = this.add.graphics();
    this.overlay = this.add.graphics().setDepth(5);
    this.exit = this.add.circle(0, 0, CELL * 0.34).setStrokeStyle(3, C.exitClosed).setFillStyle(0, 0).setDepth(2);
    this.nova = this.makeNova().setDepth(10);
    this.ready = true;
    if (this.queued) {
      const q = this.queued;
      this.queued = null;
      this.showFrame(q.frame, q.events, q.tickMs, true);
    }
  }

  update(_t: number, dt: number) {
    // Collapse warning stripes pulse.
    this.warnPhase += dt / 1000;
    if (this.lastFrame?.pendingCollapse) this.drawOverlay(this.lastFrame);
  }

  private makeNova() {
    const body = this.add.rectangle(0, 0, CELL * 0.7, CELL * 0.7, this.novaColor).setStrokeStyle(2, 0xe9fdff);
    const visor = this.add.rectangle(0, -CELL * 0.08, CELL * 0.42, CELL * 0.14, 0x05080f);
    const c = this.add.container(0, 0, [body, visor]);
    body.postFX?.addGlow(this.novaColor, 4, 0, false, 0.1, 10);
    return c;
  }

  private makeEnemy(kind: "seeker" | "sentinel") {
    if (kind === "seeker") {
      const d = this.add.rectangle(0, 0, CELL * 0.5, CELL * 0.5, C.seeker).setAngle(45);
      d.postFX?.addGlow(C.seeker, 4, 0, false, 0.1, 10);
      const eye = this.add.rectangle(0, 0, CELL * 0.14, CELL * 0.14, 0x05080f);
      return this.add.container(0, 0, [d, eye]).setDepth(9);
    }
    const s = this.add.rectangle(0, 0, CELL * 0.58, CELL * 0.58).setStrokeStyle(4, C.sentinel).setFillStyle(0x05080f, 0.6);
    const core = this.add.rectangle(0, 0, CELL * 0.16, CELL * 0.16, C.sentinel);
    return this.add.container(0, 0, [s, core]).setDepth(9);
  }

  /** Render `frame`. `events` are the ones that happened since the previous frame. */
  showFrame(frame: GameState, events: GameEvent[], tickMs: number, instant = false) {
    if (!this.ready) {
      this.queued = { frame, events, tickMs };
      return;
    }
    const dur = instant ? 0 : Math.max(40, tickMs * 0.85);
    this.lastFrame = frame;
    this.drawBoard(frame);
    this.drawOverlay(frame);
    this.syncPickups(frame);

    const open = frame.crystals.length === 0;
    this.exit.setPosition(px(frame.exit.x), px(frame.exit.y)).setStrokeStyle(open ? 4 : 3, open ? C.exitOpen : C.exitClosed);
    this.exit.setFillStyle(open ? C.exitOpen : 0, open ? 0.25 : 0);

    this.moveTo(this.nova, frame.agent.pos, dur);
    const blinking = frame.tick < frame.agent.invulnerableUntil;
    this.nova.setAlpha(blinking ? 0.55 : 1);
    if (frame.status === "destroyed") this.nova.setAlpha(0.25);

    for (const e of frame.enemies) {
      let go = this.enemies.get(e.id);
      if (!go) {
        go = this.makeEnemy(e.kind);
        go.setPosition(px(e.pos.x), px(e.pos.y));
        this.enemies.set(e.id, go);
      }
      this.moveTo(go, e.pos, dur);
      const stunned = frame.tick < e.stunnedUntil;
      go.setAlpha(stunned ? 0.4 : 1);
    }

    for (const ev of events) this.playEvent(ev, frame);
  }

  private moveTo(go: Phaser.GameObjects.Container, v: Vec, dur: number) {
    this.tweens.killTweensOf(go);
    const x = px(v.x);
    const y = px(v.y);
    if (!dur || Phaser.Math.Distance.Between(go.x, go.y, x, y) > CELL * 2.5) go.setPosition(x, y);
    else this.tweens.add({ targets: go, x, y, duration: dur, ease: "Sine.easeInOut" });
  }

  private drawBoard(s: GameState) {
    const g = this.board;
    g.clear();
    const passable = new Set(s.agent.trail.map(key));
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        const t = s.grid[y * s.width + x];
        const X = x * CELL;
        const Y = y * CELL;
        if (t === WALL) {
          g.fillStyle(C.wall).fillRect(X, Y, CELL, CELL);
          g.lineStyle(1, C.wallEdge).strokeRect(X + 0.5, Y + 0.5, CELL - 1, CELL - 1);
        } else if (t === TRAIL) {
          g.fillStyle(C.trail).fillRect(X, Y, CELL, CELL);
          g.lineStyle(2, C.trailEdge).strokeRect(X + 1, Y + 1, CELL - 2, CELL - 2);
        } else if (t === COLLAPSED) {
          g.fillStyle(C.collapsed).fillRect(X, Y, CELL, CELL);
          g.lineStyle(1, C.collapsedEdge).strokeRect(X + 0.5, Y + 0.5, CELL - 1, CELL - 1);
          g.lineStyle(1, C.collapsedEdge, 0.5).lineBetween(X + 4, Y + 4, X + CELL - 4, Y + CELL - 4);
        } else {
          g.fillStyle(C.floor).fillRect(X, Y, CELL, CELL);
          if (passable.has(`${x},${y}`)) g.fillStyle(C.passTrail, 0.3).fillRect(X + CELL * 0.28, Y + CELL * 0.28, CELL * 0.44, CELL * 0.44);
        }
      }
    }
  }

  private drawOverlay(s: GameState) {
    const g = this.overlay;
    g.clear();
    const p = s.pendingCollapse;
    if (!p) return;
    const pulse = 0.45 + 0.35 * Math.sin(this.warnPhase * 8);
    for (const c of p.cells) {
      const X = c.x * CELL;
      const Y = c.y * CELL;
      g.fillStyle(C.warnDark, 0.85).fillRect(X, Y, CELL, CELL);
      g.lineStyle(3, C.warn, pulse);
      for (let k = -CELL; k < CELL; k += 9) g.lineBetween(X + Math.max(0, k), Y + Math.max(0, -k), X + Math.min(CELL, k + CELL), Y + Math.min(CELL, CELL - k));
      g.lineStyle(2, C.warn, 0.9).strokeRect(X + 1, Y + 1, CELL - 2, CELL - 2);
    }
  }

  private syncPickups(s: GameState) {
    const want = new Set(s.crystals.map(key));
    for (const [k, go] of this.crystals) if (!want.has(k)) { go.destroy(); this.crystals.delete(k); }
    for (const c of s.crystals) {
      const k = key(c);
      if (this.crystals.has(k)) continue;
      const r = this.add.rectangle(px(c.x), px(c.y), CELL * 0.36, CELL * 0.36, C.crystal).setAngle(45).setDepth(3);
      r.postFX?.addGlow(C.crystal, 3, 0, false, 0.1, 8);
      this.tweens.add({ targets: r, scale: 1.18, yoyo: true, repeat: -1, duration: 700, ease: "Sine.easeInOut" });
      this.crystals.set(k, r);
    }
    const wantB = new Set(s.bonuses.map(key));
    for (const [k, go] of this.bonuses) if (!wantB.has(k)) { go.destroy(); this.bonuses.delete(k); }
    for (const b of s.bonuses) {
      const k = key(b);
      if (this.bonuses.has(k)) continue;
      this.bonuses.set(k, this.add.circle(px(b.x), px(b.y), CELL * 0.13, C.bonus).setDepth(3));
    }
  }

  private burst(x: number, y: number, color: number, count = 10, spread = CELL * 1.2) {
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count;
      const p = this.add.rectangle(x, y, 5, 5, color).setDepth(20);
      this.tweens.add({
        targets: p,
        x: x + Math.cos(a) * spread,
        y: y + Math.sin(a) * spread,
        alpha: 0,
        duration: 450,
        ease: "Quad.easeOut",
        onComplete: () => p.destroy(),
      });
    }
  }

  private playEvent(ev: GameEvent, s: GameState) {
    switch (ev.type) {
      case "crystal":
        this.burst(px(ev.pos.x), px(ev.pos.y), C.crystal, 12);
        break;
      case "bonus":
        this.burst(px(ev.pos.x), px(ev.pos.y), C.bonus, 6, CELL * 0.7);
        break;
      case "bomb": {
        const R = (s.config.bombRadius + 0.5) * CELL;
        const ring = this.add.circle(px(ev.pos.x), px(ev.pos.y), 4).setStrokeStyle(4, 0x22e4f5).setDepth(20);
        this.tweens.add({ targets: ring, radius: R, alpha: 0, duration: 420, ease: "Quad.easeOut", onComplete: () => ring.destroy() });
        this.cameras.main.shake(140, 0.004);
        break;
      }
      case "hit":
        this.cameras.main.flash(160, 255, 59, 92);
        this.cameras.main.shake(180, 0.006);
        break;
      case "collapse":
        for (const c of ev.cells) this.burst(px(c.x), px(c.y), C.collapsedEdge, 6, CELL * 0.6);
        this.cameras.main.shake(260, 0.008);
        break;
      case "exit_open":
        this.burst(px(s.exit.x), px(s.exit.y), C.exitOpen, 16, CELL * 1.6);
        break;
      case "escaped":
        this.burst(px(s.exit.x), px(s.exit.y), C.nova, 24, CELL * 2.5);
        break;
      case "destroyed":
        this.burst(px(s.agent.pos.x), px(s.agent.pos.y), C.seeker, 20, CELL * 1.8);
        this.cameras.main.shake(300, 0.01);
        break;
    }
  }
}

import { useEffect, useRef, useState } from "react";
import { CALL_TICKS, type MatchState, type TouchlineCall, type V2 } from "@dogefc/engine";

/**
 * Directions are snapped to 8 compass points. That keeps the recorded inputs small and exact,
 * so a match can be replayed from its seed and inputs.
 */
const D = Math.SQRT1_2;
export const ZERO: V2 = { x: 0, y: 0 };

export function snap(x: number, y: number): V2 {
  if (Math.abs(x) < 1e-6 && Math.abs(y) < 1e-6) return ZERO;
  const a = Math.round(Math.atan2(y, x) / (Math.PI / 4));
  const dirs: V2[] = [
    { x: 1, y: 0 }, { x: D, y: D }, { x: 0, y: 1 }, { x: -D, y: D },
    { x: -1, y: 0 }, { x: -D, y: -D }, { x: 0, y: -1 }, { x: D, y: -D },
  ];
  return dirs[((a % 8) + 8) % 8];
}

const same = (a: V2, b: V2) => a.x === b.x && a.y === b.y;

const KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};
const PASS_KEYS = new Set(["Space", "KeyJ"]);
const SHOOT_KEYS = new Set(["Enter", "KeyK", "KeyL"]);

/** Keyboard: WASD or arrows to move, Space or J to pass, Enter or K to shoot. */
export function useKeyboardControl(enabled: boolean, onMove: (m: V2) => void, onAction: (a: "pass" | "shoot") => void) {
  const held = useRef(new Set<string>());
  const last = useRef<V2>(ZERO);
  const cb = useRef({ onMove, onAction });
  cb.current = { onMove, onAction };

  useEffect(() => {
    if (!enabled) return;
    const recompute = () => {
      let x = 0;
      let y = 0;
      held.current.forEach((k) => {
        const v = KEYS[k];
        if (v) {
          x += v[0];
          y += v[1];
        }
      });
      const m = snap(x, y);
      if (!same(m, last.current)) {
        last.current = m;
        cb.current.onMove(m);
      }
    };
    const typing = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      if (KEYS[e.code]) {
        e.preventDefault();
        held.current.add(e.code);
        recompute();
      } else if (!e.repeat && PASS_KEYS.has(e.code)) {
        e.preventDefault();
        cb.current.onAction("pass");
      } else if (!e.repeat && SHOOT_KEYS.has(e.code)) {
        e.preventDefault();
        cb.current.onAction("shoot");
      }
    };
    const up = (e: KeyboardEvent) => {
      if (held.current.delete(e.code)) recompute();
    };
    const blur = () => {
      held.current.clear();
      recompute();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
      held.current.clear();
      last.current = ZERO;
    };
  }, [enabled]);
}

/** On-screen joystick plus pass and shoot buttons, for phones and tablets. */
export function TouchPad({ onMove, onAction }: { onMove: (m: V2) => void; onAction: (a: "pass" | "shoot") => void }) {
  const pad = useRef<HTMLDivElement>(null);
  const last = useRef<V2>(ZERO);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const update = (clientX: number, clientY: number) => {
    const r = pad.current!.getBoundingClientRect();
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    const max = r.width / 2 - 18;
    const l = Math.hypot(dx, dy);
    const k = l > max ? max / l : 1;
    setKnob({ x: dx * k, y: dy * k });
    const m = l < 12 ? ZERO : snap(dx, dy);
    if (!same(m, last.current)) {
      last.current = m;
      onMove(m);
    }
  };
  const end = () => {
    setKnob({ x: 0, y: 0 });
    if (!same(last.current, ZERO)) {
      last.current = ZERO;
      onMove(ZERO);
    }
  };

  return (
    <div className="flex items-center justify-between gap-4 select-none" style={{ touchAction: "none" }}>
      <div
        ref={pad}
        role="application"
        aria-label="Movement joystick"
        className="relative size-32 shrink-0 rounded-full border-2 border-line bg-[#0A1122]"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          update(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) update(e.clientX, e.clientY);
        }}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <span
          className="absolute left-1/2 top-1/2 size-12 rounded-full border-2 border-cyan bg-[#0B1E2A]"
          style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }}
          aria-hidden="true"
        />
      </div>
      <div className="flex gap-3">
        <button type="button" onPointerDown={(e) => { e.preventDefault(); onAction("pass"); }} className="grid size-20 place-items-center rounded-full border-2 border-cyan bg-[#0B1E2A] font-pixel text-[10px] text-cyan">
          PASS
        </button>
        <button type="button" onPointerDown={(e) => { e.preventDefault(); onAction("shoot"); }} className="grid size-20 place-items-center rounded-full bg-amber font-pixel text-[10px] text-bg">
          SHOOT
        </button>
      </div>
    </div>
  );
}

export const CALLS: { key: TouchlineCall; label: string; blurb: string }[] = [
  { key: "shoot", label: "Shoot on sight", blurb: "Shoot from further out. More shots, lower quality." },
  { key: "press", label: "All-out press", blurb: "Hunt the ball everywhere. Tires your players." },
  { key: "keep", label: "Keep the ball", blurb: "Safe passes, no risks. Calms the game down." },
  { key: "attack", label: "All forward", blurb: "Everyone pushes up. Leaves space behind." },
];

/** The four touchline calls, how many are left this half, and which is running now. */
export function TouchlineCalls({ s, disabled, onCall }: { s: MatchState; disabled: boolean; onCall: (c: TouchlineCall) => void }) {
  const left = s.callsLeft[0];
  const active = s.calls[0] && s.tick < s.calls[0].until ? s.calls[0] : null;
  const remaining = active ? (active.until - s.tick) / CALL_TICKS : 0;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-pixel text-[10px] text-amber">TOUCHLINE CALLS</span>
        <span className="text-xs text-muted">{left} left this half</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {CALLS.map((c) => {
          const on = active?.call === c.key;
          return (
            <button
              key={c.key}
              type="button"
              title={c.blurb}
              disabled={!on && (disabled || left === 0 || !!active)}
              onClick={() => !on && onCall(c.key)}
              aria-pressed={on}
              className={`relative flex min-h-12 flex-col justify-center overflow-hidden px-2.5 py-1.5 text-left text-[13px] ${on ? "bg-amber font-semibold text-bg" : "border border-line bg-[#0A1122] text-soft enabled:hover:border-amber disabled:opacity-45"}`}
            >
              {c.label}
              {on && <span className="absolute bottom-0 left-0 h-1 bg-bg/40" style={{ width: `${remaining * 100}%` }} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <p className="m-0 text-xs text-muted">
        {active ? `${CALLS.find((c) => c.key === active.call)!.label} is on for about ${Math.ceil(((active.until - s.tick) / (2 * s.config.halfTicks)) * 40)} more min.` : "Optional. Each call lasts two match minutes."}
      </p>
    </div>
  );
}

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ATTR_CAP,
  DRILLS,
  PLAYER_STYLES,
  drillCost,
  overall,
  styleLabel,
  type Attributes,
  type PlayerDef,
  type PlayerStyle,
} from "@dogefc/engine";
import { Eyebrow, Panel, SiteHeader, btnGhost, btnPrimary } from "../components/ui";
import { KIT_COLORS, TRIM_COLORS, createClub, starterPlayers, useClub, type SavedClub } from "../club/store";

export function Club() {
  const { club } = useClub();
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="mx-auto flex max-w-[1240px] flex-col gap-6 px-5 pb-14 pt-7 sm:px-8">
        {club ? <ClubHub club={club} /> : <CreateClub />}
      </main>
    </div>
  );
}

// ------------------------------------------------------------------ create

function CreateClub() {
  const [name, setName] = useState("");
  const [short, setShort] = useState("");
  const [color, setColor] = useState(KIT_COLORS[1]);
  const [trim, setTrim] = useState(TRIM_COLORS[0]);
  const [players, setPlayers] = useState<PlayerDef[]>(starterPlayers);
  const [tried, setTried] = useState(false);

  const shortValue = (short || name.replace(/[^A-Za-z]/g, "").slice(0, 3)).toUpperCase();
  const errors = {
    name: name.trim().length < 2 ? "Give your club a name of at least 2 letters." : "",
    players: players.some((p) => p.name.trim().length === 0) ? "Every player needs a name." : "",
  };
  const valid = !errors.name && !errors.players;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!valid) return;
    createClub({
      name: name.trim(),
      short: shortValue || "MYC",
      color,
      trim,
      players: players.map((p) => ({ ...p, name: p.name.trim() })),
    });
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Eyebrow className="text-amber">NEW CLUB</Eyebrow>
        <h1 className="m-0 text-3xl font-bold">Start your club</h1>
        <p className="m-0 max-w-3xl text-soft">
          Name it, pick your kit and name your five players. Every match you play earns training points to make them better. Your club is saved in this browser.
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <Panel className="flex min-w-0 flex-[1_1_380px] flex-col gap-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wider text-muted">Club name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 24))}
              placeholder="e.g. Kaduna Comets"
              aria-invalid={tried && !!errors.name}
              aria-describedby="name-err"
              className="min-h-11 border border-line bg-[#0A1122] px-3 text-ink"
            />
            {tried && errors.name && <span id="name-err" className="text-sm text-danger">{errors.name}</span>}
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wider text-muted">Short name (3 letters)</span>
            <input
              value={short}
              onChange={(e) => setShort(e.target.value.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase())}
              placeholder={shortValue || "KCO"}
              className="min-h-11 w-28 border border-line bg-[#0A1122] px-3 font-mono uppercase text-ink"
            />
          </label>
          <Swatches label="Kit colour" options={KIT_COLORS} value={color} onChange={setColor} />
          <Swatches label="Trim" options={TRIM_COLORS} value={trim} onChange={setTrim} />
          <KitPreview name={name || "Your club"} short={shortValue || "YOU"} color={color} trim={trim} />
        </Panel>

        <Panel className="flex min-w-0 flex-[1_1_420px] flex-col gap-4">
          <span className="text-xs uppercase tracking-wider text-muted">Name your players</span>
          {players.map((p, i) => (
            <label key={p.id} className="flex items-center gap-3">
              <span className="w-12 font-pixel text-[9px] text-cyan">{p.role}</span>
              <span className="w-8 font-mono text-sm text-muted">#{p.number}</span>
              <input
                value={p.name}
                onChange={(e) => setPlayers((ps) => ps.map((x, j) => (j === i ? { ...x, name: e.target.value.slice(0, 14) } : x)))}
                aria-label={`Name for player ${p.number}, ${p.role}`}
                className="min-h-11 min-w-0 flex-1 border border-line bg-[#0A1122] px-3 text-ink"
              />
            </label>
          ))}
          {tried && errors.players && <span className="text-sm text-danger">{errors.players}</span>}
          <p className="m-0 text-sm text-muted">You can change names, roles and playing styles later on the club page.</p>
        </Panel>
      </div>

      <div>
        <button type="submit" className={`${btnPrimary} py-4 text-[12px]`}>CREATE CLUB</button>
      </div>
    </form>
  );
}

function Swatches({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-1.5 text-xs uppercase tracking-wider text-muted">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={c}
            aria-pressed={value === c}
            onClick={() => onChange(c)}
            className={`size-11 border-2 ${value === c ? "border-cyan outline outline-2 outline-offset-2 outline-cyan" : "border-line"}`}
            style={{ background: c }}
          />
        ))}
      </div>
    </fieldset>
  );
}

function KitPreview({ name, short, color, trim }: { name: string; short: string; color: string; trim: string }) {
  return (
    <div className="flex items-center gap-4 border border-line2 bg-[#0A1122] p-3">
      <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r="18" fill={color} stroke={trim} strokeWidth="3" />
        <text x="22" y="27" textAnchor="middle" fontSize="14" fontWeight="700" fill={trim} fontFamily="Chakra Petch, sans-serif">9</text>
      </svg>
      <div className="flex flex-col">
        <span className="text-lg font-semibold">{name}</span>
        <span className="font-mono text-xs text-muted">{short} · how your players look on the pitch</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ hub

const ATTR_LABEL: Record<keyof Attributes, string> = {
  pace: "Pace",
  passing: "Passing",
  shooting: "Shooting",
  dribbling: "Dribbling",
  tackling: "Tackling",
  positioning: "Positioning",
  reflexes: "Reflexes",
  stamina: "Stamina",
};

function shownAttrs(p: PlayerDef): (keyof Attributes)[] {
  return p.role === "GK"
    ? ["reflexes", "positioning", "passing", "pace", "stamina"]
    : ["pace", "passing", "shooting", "dribbling", "tackling", "positioning", "stamina"];
}

function ClubHub({ club }: { club: SavedClub }) {
  const { train, setStyle, rename, reset } = useClub();
  const [selected, setSelected] = useState(club.players[0].id);
  const [flash, setFlash] = useState<{ attr: keyof Attributes; id: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const player = club.players.find((p) => p.id === selected) ?? club.players[0];
  const r = club.record;
  const played = r.w + r.d + r.l;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="size-12 border-[3px]" style={{ background: club.color, borderColor: club.trim }} aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <Eyebrow className="text-amber">YOUR CLUB · {club.short}</Eyebrow>
            <h1 className="m-0 text-3xl font-bold">{club.name}</h1>
          </div>
        </div>
        <Link to="/play" className={`${btnPrimary} py-4 text-[12px]`}>PLAY A MATCH</Link>
      </div>

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
        <Stat label="Training points" value={String(club.points)} accent />
        <Stat label="Played" value={String(played)} />
        <Stat label="W · D · L" value={`${r.w} · ${r.d} · ${r.l}`} />
        <Stat label="Goals" value={`${r.gf} – ${r.ga}`} />
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <section className="flex min-w-0 flex-[1_1_320px] flex-col gap-3" aria-label="Squad">
          <Eyebrow>SQUAD</Eyebrow>
          <div className="flex flex-col gap-2">
            {club.players.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={p.id === player.id}
                onClick={() => setSelected(p.id)}
                className={`flex items-center gap-3 border-2 p-3 text-left ${p.id === player.id ? "border-cyan bg-[#0B1E2A]" : "border-line bg-surface"}`}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-full border-2 font-semibold" style={{ background: club.color, borderColor: club.trim, color: club.trim }}>
                  {p.number}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">{p.name}</span>
                  <span className="text-xs text-muted">{p.role} · {styleLabel(p.style)}</span>
                </span>
                <span className="font-pixel text-sm text-cyan" aria-label={`Overall ${overall(p)}`}>{overall(p)}</span>
              </button>
            ))}
          </div>
          {club.history.length > 0 && (
            <Panel className="flex flex-col gap-2 p-4">
              <span className="text-xs uppercase tracking-wider text-muted">Recent results</span>
              <ol className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
                {club.history.slice(0, 6).map((h) => (
                  <li key={h.at} className="flex items-center justify-between gap-2">
                    <span>
                      <span className={`mr-2 inline-block w-5 font-pixel text-[10px] ${h.gf > h.ga ? "text-ok" : h.gf < h.ga ? "text-danger" : "text-amber"}`}>
                        {h.gf > h.ga ? "W" : h.gf < h.ga ? "L" : "D"}
                      </span>
                      vs {h.rival}
                    </span>
                    <span className="font-mono text-soft">{h.gf}–{h.ga} <span className="text-muted">+{h.points}</span></span>
                  </li>
                ))}
              </ol>
            </Panel>
          )}
        </section>

        <section className="flex min-w-0 flex-[2_1_560px] flex-col gap-3" aria-label="Player">
          <Eyebrow>PLAYER</Eyebrow>
          <Panel className="flex flex-col gap-5">
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-xs uppercase tracking-wider text-muted">Name · #{player.number} · {player.role}</span>
                <input
                  value={player.name}
                  onChange={(e) => rename(player.id, e.target.value.slice(0, 14))}
                  onBlur={(e) => !e.target.value.trim() && rename(player.id, `Player ${player.number}`)}
                  className="min-h-11 border border-line bg-[#0A1122] px-3 text-lg font-semibold text-ink"
                />
              </label>
              <span className="flex flex-col items-end">
                <span className="text-xs uppercase tracking-wider text-muted">Overall</span>
                <span className="font-pixel text-2xl text-cyan">{overall(player)}</span>
              </span>
            </div>

            <StylePicker player={player} onChange={(st) => setStyle(player.id, st)} />

            <div className="flex flex-col gap-2.5">
              <span className="text-xs uppercase tracking-wider text-muted">Attributes</span>
              {shownAttrs(player).map((k) => (
                <AttrBar key={k} label={ATTR_LABEL[k]} value={player.attrs[k]} flashing={flash?.attr === k && flash.id === player.id} />
              ))}
            </div>
          </Panel>

          <Eyebrow>TRAINING</Eyebrow>
          <Panel className="flex flex-col gap-3">
            <p className="m-0 text-sm text-soft">
              Each session raises one attribute by 1. Better players cost more to improve, and nothing goes past {ATTR_CAP}. You have{" "}
              <span className="font-semibold text-cyan">{club.points} point{club.points === 1 ? "" : "s"}</span>. Win 3, draw 2, lose 1, plus 1 for a clean sheet.
            </p>
            <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
              {DRILLS.filter((d) => d.roles.includes(player.role)).map((d) => {
                const value = player.attrs[d.attr];
                const cost = drillCost(value);
                const can = cost !== null && cost <= club.points;
                return (
                  <button
                    key={d.id}
                    type="button"
                    disabled={!can}
                    onClick={() => {
                      if (train(player.id, d.id)) setFlash({ attr: d.attr, id: player.id });
                    }}
                    className="flex flex-col gap-1 border border-line bg-[#0A1122] p-3 text-left enabled:hover:border-cyan disabled:opacity-45"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-semibold">{d.name}</span>
                      <span className="font-mono text-xs text-amber">{cost === null ? "MAX" : `${cost} pt${cost === 1 ? "" : "s"}`}</span>
                    </span>
                    <span className="text-xs text-muted">{ATTR_LABEL[d.attr]} {value} → {Math.min(ATTR_CAP, value + 1)} · {d.blurb}</span>
                  </button>
                );
              })}
            </div>
            {club.points === 0 && (
              <p className="m-0 text-sm text-muted">
                Out of points. <Link to="/play">Play a match</Link> to earn more.
              </p>
            )}
          </Panel>
        </section>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-line2 pt-5">
        {confirmReset ? (
          <>
            <span className="text-sm text-soft">Delete {club.name} and start again? This can't be undone.</span>
            <button type="button" className={`${btnGhost} border-danger text-danger`} onClick={reset}>Delete club</button>
            <button type="button" className={btnGhost} onClick={() => setConfirmReset(false)}>Keep it</button>
          </>
        ) : (
          <button type="button" className="min-h-11 text-sm text-muted underline hover:text-ink" onClick={() => setConfirmReset(true)}>
            Start a new club
          </button>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-1 border border-line bg-surface p-4">
      <span className="text-xs uppercase tracking-wider text-muted">{label}</span>
      <span className={`font-pixel text-xl ${accent ? "text-cyan" : "text-ink"}`}>{value}</span>
    </div>
  );
}

function AttrBar({ label, value, flashing }: { label: string; value: number; flashing: boolean }) {
  const tone = value >= 80 ? "bg-ok" : value >= 65 ? "bg-cyan" : value >= 50 ? "bg-amber" : "bg-danger";
  return (
    <div className="grid grid-cols-[96px_1fr_32px] items-center gap-3 text-sm">
      <span className="text-soft">{label}</span>
      <span className="h-2.5 bg-[#0A1122]" role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <span className={`block h-full ${tone} transition-[width] duration-300`} style={{ width: `${value}%` }} />
      </span>
      <span key={flashing ? `f-${value}` : value} className={`text-right font-mono ${flashing ? "animate-pulse text-ok" : ""}`}>{value}</span>
    </div>
  );
}

function StylePicker({ player, onChange }: { player: PlayerDef; onChange: (s: PlayerStyle | undefined) => void }) {
  const options = useMemo(() => [{ key: undefined, label: "Standard", blurb: "Plays the role with no special instructions." }, ...PLAYER_STYLES[player.role]], [player.role]);
  return (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-1.5 text-xs uppercase tracking-wider text-muted">Playing style</legend>
      <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        {options.map((o) => {
          const on = player.style === o.key;
          return (
            <button
              key={o.label}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(o.key)}
              className={`flex flex-col gap-1 p-3 text-left ${on ? "bg-[#0B1E2A] outline outline-2 outline-cyan" : "border border-line bg-[#0A1122]"}`}
            >
              <span className={`font-semibold ${on ? "text-cyan" : ""}`}>{o.label}</span>
              <span className="text-xs text-muted">{o.blurb}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

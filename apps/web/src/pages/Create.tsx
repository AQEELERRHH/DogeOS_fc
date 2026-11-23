import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PERSONALITIES, type Personality } from "@aftermaze/engine";
import { Eyebrow, Logo, WEIGHT_META, btnPrimary } from "../components/ui";
import { createAgent, useSave } from "../store";
import { NovaSprite } from "./Landing";

export function Create() {
  const save = useSave();
  const navigate = useNavigate();
  const [name, setName] = useState("NOVA");
  const [persona, setPersona] = useState<Personality>("explorer");
  const [confirmReset, setConfirmReset] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (save.agent && !confirmReset) {
      setConfirmReset(true);
      return;
    }
    createAgent(name, persona);
    navigate("/arena");
  };

  return (
    <div className="min-h-screen">
      <header className="mx-auto max-w-[1240px] px-5 py-6 sm:px-8"><Logo /></header>
      <main className="mx-auto flex max-w-[1000px] flex-col gap-8 px-5 pb-16 sm:px-8">
        <div className="flex flex-wrap items-center gap-8">
          <NovaSprite size={10} />
          <div className="flex flex-col gap-2">
            <Eyebrow>NEW AGENT</Eyebrow>
            <h1 className="m-0 text-3xl font-bold">Create your agent</h1>
            <p className="m-0 text-soft">One player, one agent. You can coach it later, but the personality is where it starts.</p>
          </div>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="agent-name" className="text-sm uppercase tracking-wider text-muted">Agent name</label>
            <input
              id="agent-name"
              value={name}
              maxLength={24}
              onChange={(e) => setName(e.target.value)}
              className="max-w-sm border border-line bg-[#0A1122] px-4 py-3 font-pixel text-sm text-ink"
            />
          </div>
          <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
            <legend className="mb-3 text-sm uppercase tracking-wider text-muted">Personality</legend>
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
              {(Object.keys(PERSONALITIES) as Personality[]).map((k) => {
                const on = persona === k;
                return (
                  <label key={k} className={`flex cursor-pointer flex-col gap-3 border-2 p-5 ${on ? "border-cyan bg-[#0B1E2A]" : "border-line bg-surface"}`}>
                    <span className="flex items-center gap-3">
                      <input type="radio" name="persona" value={k} checked={on} onChange={() => setPersona(k)} className="size-4 accent-[#22E4F5]" />
                      <span className="font-pixel text-[12px] text-cyan">{PERSONALITIES[k].label.toUpperCase()}</span>
                    </span>
                    <span className="text-sm leading-normal text-soft">{PERSONALITIES[k].description}</span>
                    <span className="flex flex-col gap-1.5">
                      {WEIGHT_META.map((w) => (
                        <span key={w.key} className="grid grid-cols-[110px_1fr_24px] items-center gap-2 font-mono text-[11px] text-soft">
                          {w.name}
                          <span className="h-1.5 bg-line2"><span className="block h-1.5" style={{ width: `${PERSONALITIES[k].weights[w.key]}%`, background: w.color }} /></span>
                          <span className="text-right text-ink">{PERSONALITIES[k].weights[w.key]}</span>
                        </span>
                      ))}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          {confirmReset && (
            <p className="m-0 border border-amber bg-[#2A1E04] p-4 text-[#FFD27A]">
              You already have {save.agent?.name}. Creating a new agent erases its training, history and records on this device. Press the button again to confirm.
            </p>
          )}
          <button type="submit" className={`${btnPrimary} self-start px-6 py-4 text-[12px]`}>{confirmReset ? "YES, START OVER" : "CREATE AGENT"}</button>
        </form>
      </main>
    </div>
  );
}

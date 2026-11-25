import { FORMATIONS, type FormationKey } from "@dogefc/engine";

export function FormationDiagram({ f, active }: { f: FormationKey; active: boolean }) {
  const def = FORMATIONS[f];
  return (
    <div className={`relative aspect-[5/3] w-full border ${active ? "border-cyan" : "border-line"} bg-[#0A2A22]`} aria-hidden="true">
      <span className="absolute inset-y-0 left-1/2 w-px bg-white/30" />
      <span className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" style={{ left: "6%", top: "50%" }} />
      {def.slots.map((sl, i) => (
        <span key={i} className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${sl.x * 100}%`, top: `${sl.y * 100}%`, background: sl.role === "DEF" ? "#22E4F5" : sl.role === "MID" ? "#9B6BFF" : "#FFB020" }} />
      ))}
    </div>
  );
}

import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { PITCH_H, PITCH_W, PitchScene, type FrameSource } from "./PitchScene";

/** Mounts the Phaser pitch. `source` is read every animation frame (no React re-render needed). */
export function PitchCanvas({ source, matchKey }: { source: () => FrameSource; matchKey: string }) {
  const host = useRef<HTMLDivElement>(null);
  const src = useRef(source);
  src.current = source;

  useEffect(() => {
    if (!host.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      width: PITCH_W,
      height: PITCH_H,
      backgroundColor: "#070B14",
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
      scene: new PitchScene(() => src.current()),
      banner: false,
      audio: { noAudio: true },
    });
    return () => game.destroy(true);
  }, [matchKey]);

  return <div ref={host} role="img" aria-label="Live match on the pitch" className="w-full" style={{ aspectRatio: `${PITCH_W} / ${PITCH_H}` }} />;
}

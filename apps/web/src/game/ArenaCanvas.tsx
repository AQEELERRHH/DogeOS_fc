import { useEffect, useRef } from "react";
import Phaser from "phaser";
import type { GameState } from "@aftermaze/engine";
import { ArenaScene, CELL } from "./ArenaScene";
import { SKIN_COLORS } from "../chain/config";
import { useSave } from "../store";

interface Props {
  frames: GameState[];
  index: number;
  tickMs: number;
  label: string;
}

/** Mounts a Phaser game sized to the maze and feeds it engine frames. */
export function ArenaCanvas({ frames, index, tickMs, label }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const skin = useSave().equippedSkin;
  const novaColor = skin && SKIN_COLORS[skin] ? parseInt(SKIN_COLORS[skin].slice(1), 16) : 0x22e4f5;
  const sceneRef = useRef<ArenaScene | null>(null);
  const shown = useRef(-1);
  const first = frames[0];
  const w = first?.width ?? 21;
  const h = first?.height ?? 15;

  useEffect(() => {
    if (!host.current) return;
    const scene = new ArenaScene(novaColor);
    sceneRef.current = scene;
    shown.current = -1;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      width: w * CELL,
      height: h * CELL,
      backgroundColor: "#0A1122",
      pixelArt: false,
      antialias: true,
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
      scene,
      banner: false,
      audio: { noAudio: true },
    });
    return () => {
      sceneRef.current = null;
      game.destroy(true);
    };
    // A new maze (different size or seed) gets a fresh game.
  }, [w, h, first?.config.seed, first?.config.level, novaColor]);

  useEffect(() => {
    const scene = sceneRef.current;
    const frame = frames[index];
    if (!scene || !frame) return;
    const prev = shown.current >= 0 ? frames[shown.current] : null;
    const jumped = !prev || index !== shown.current + 1;
    const events = prev && !jumped ? frame.events.slice(prev.events.length) : [];
    scene.showFrame(frame, events, tickMs, jumped);
    shown.current = index;
  }, [frames, index, tickMs]);

  return (
    <div
      ref={host}
      role="img"
      aria-label={label}
      className="w-full"
      style={{ aspectRatio: `${w} / ${h}`, maxWidth: w * CELL }}
    />
  );
}

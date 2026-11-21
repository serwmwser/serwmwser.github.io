"use client";
import { ComponentProps, ReactElement, useMemo } from "react";
import dynamic from "next/dynamic";
import Board from "../Board";
import { cboardOf, useCartoonPrefs, type Cam } from "@/lib/cartoonPrefs";
import { useApp } from "@/lib/ctx";
import Piece, { PieceType } from "./Pieces";
import Knight from "./Knights";
import { CARTOON_CSS, type Mood } from "./Character";

// 3D-доска грузится только когда игрок включил 3D (библиотека three тяжёлая и нужна не всем)
const Board3D = dynamic(() => import("../cartoon3d/Board3D"), {
  ssr: false,
  loading: () => <div className="aspect-square w-full animate-pulse rounded-2xl bg-white/10" role="status" aria-label="3D" />,
});

type BoardProps = ComponentProps<typeof Board>;
type PieceFn = (a: { squareWidth: number; square?: string }) => ReactElement;
type Hop = { square: string; mood: Mood } | null;

/** Набор для доски: wP, bN и т.д. pawnW / pawnB выбирают персонажа-пешку. moods: настроение королей (wK, bK). hop: фигура на этой клетке реагирует (подпрыгивает), остальные такого же типа не затрагиваются. */
function build(pawnW: number, pawnB: number, moods: Record<string, Mood>, hop: Hop, knights: boolean): BoardProps["pieces"] {
  const out: Record<string, PieceFn> = {};
  for (const side of ["w", "b"] as const) {
    for (const t of ["P", "N", "B", "R", "Q", "K"]) {
      const type = t.toLowerCase() as PieceType;
      const variant = side === "w" ? pawnW : pawnB;
      out[side + t] = ({ squareWidth, square }) => {
        const mood: Mood = t === "K" ? moods[side + t] ?? "idle" : hop && square === hop.square ? hop.mood : "idle";
        const animate: boolean | "blink" = t === "K" || mood !== "idle" ? true : "blink";
        return (
          <div style={{ width: squareWidth, height: squareWidth, display: "flex", alignItems: "center", justifyContent: "center", overflow: "visible" }}>
            {knights
              ? <Knight type={type} side={side} size={squareWidth * 0.8} animate={animate} mood={mood} />
              : <Piece type={type} side={side} size={squareWidth * 0.8} variant={variant} animate={animate} mood={mood} />}
          </div>
        );
      };
    }
  }
  return out as unknown as BoardProps["pieces"];
}

/** Доска с мультяшными фигурами: вся логика (ходы, подсветка, превращение, звук) та же, что у обычной доски.
 *  Если в настройках включён 3D-вид, вместо плоской доски показывается трёхмерная с теми же позицией и ходами. */
export default function CartoonBoard({ pawnW = 1, pawnB = 0, moods, hop = null, ...rest }: Omit<BoardProps, "pieces"> & { pawnW?: number; pawnB?: number; moods?: Record<string, Mood>; hop?: Hop }) {
  const [prefs, setPrefs] = useCartoonPrefs();
  const { lang } = useApp();
  const ru = lang === "ru";
  const cb = cboardOf(prefs.cboard);
  const key = JSON.stringify(moods ?? {}) + "|" + (hop ? hop.square + hop.mood : "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const knights = prefs.team === "knights";
  const pieces = useMemo(() => build(pawnW, pawnB, moods ?? {}, hop, knights), [pawnW, pawnB, key, knights]);
  /* переключатель видов: всегда над доской, чтобы вид можно было сменить прямо в партии */
  const modes: { k: string; label: string; on: boolean; pick: () => void }[] = [
    { k: "flat", label: ru ? "Плоская" : "Flat", on: !prefs.view3d, pick: () => setPrefs({ view3d: false }) },
    ...([["top", ru ? "3D сверху" : "3D top"], ["tilt", ru ? "3D под углом 30°" : "3D 30° angle"], ["far", ru ? "3D с другой стороны" : "3D other side"]] as [Cam, string][]).map(([c, label]) => ({
      k: c, label, on: prefs.view3d && prefs.cam === c, pick: () => setPrefs({ view3d: true, cam: c }),
    })),
  ];
  const switcher = (
    <div className="mx-auto mb-2 flex w-full max-w-[560px] flex-wrap justify-center gap-1.5" role="group" aria-label={ru ? "Вид доски" : "Board view"}>
      {modes.map((m) => (
        <button key={m.k} type="button" aria-pressed={m.on} className={"chip " + (m.on ? "chip-on" : "")} onClick={m.pick}>{m.label}</button>
      ))}
    </div>
  );
  if (prefs.view3d) {
    return (
      <>
        {switcher}
        <Board3D fen={rest.fen} orientation={rest.orientation} lastMove={rest.lastMove ?? null} disabled={rest.disabled} mute={rest.mute} cam={prefs.cam} onMove={rest.onMove} />
      </>
    );
  }
  return (
    <>
      <style>{CARTOON_CSS}</style>
      {switcher}
      <Board {...rest} pieces={pieces} colors={[cb.light, cb.dark]} />
    </>
  );
}

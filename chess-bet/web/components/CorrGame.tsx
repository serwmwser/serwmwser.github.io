"use client";
// Одна партия по переписке: доска, ходы, сдача, ничья, остаток времени на ход. Сервер проверяет каждый ход.
import { useCallback, useEffect, useMemo, useState } from "react";
import { Chess } from "chess.js";
import { useApp } from "@/lib/ctx";
import { useSocial } from "@/lib/social";
import { corrDraw, corrGame, corrMove, corrResign, hoursLabel, leftText, resultText, type CorrGameData } from "@/lib/corr";
import Board, { Moves } from "./Board";

export default function CorrGame({ id, onClose }: { id: string; onClose: () => void }) {
  const { lang, toast } = useApp();
  const ru = lang === "ru";
  const { token } = useSocial();
  const [g, setG] = useState<CorrGameData | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [, setNow] = useState(0);

  const load = useCallback(async () => {
    try { setG(await corrGame(token || "", id)); setErr(""); } catch (e) { setErr((e as Error).message); }
  }, [token, id]);

  // обновляем партию раз в 30 секунд (вдруг соперник уже сходил) и часы на экране раз в минуту
  useEffect(() => {
    void load();
    const a = setInterval(() => { if (!document.hidden) void load(); }, 30000);
    const b = setInterval(() => setNow((n) => n + 1), 60000);
    return () => { clearInterval(a); clearInterval(b); };
  }, [load]);

  const last = useMemo(() => {
    if (!g || !g.moves.length) return null;
    try {
      const c = new Chess();
      let mv: { from: string; to: string } | null = null;
      for (const s of g.moves) { const m = c.move(s); mv = { from: m.from, to: m.to }; }
      return mv;
    } catch { return null; }
  }, [g]);

  const run = async (f: () => Promise<CorrGameData>) => {
    if (busy) return;
    setBusy(true);
    try { setG(await f()); } catch (e) {
      const m = (e as Error).message;
      toast(m === "not_your_turn" ? (ru ? "Сейчас ход соперника" : "It is your opponent's move") : m === "illegal" ? (ru ? "Такой ход невозможен" : "Illegal move") : (ru ? "Не получилось, попробуйте ещё раз" : "Failed, try again"), "err");
      void load();
    } finally { setBusy(false); }
  };

  if (err === "not_found") return <div className="card p-4 text-sm">{ru ? "Партия не найдена или уже удалена." : "Game not found or already deleted."} <button className="btn btn-ghost ml-2" onClick={onClose}>{ru ? "Назад" : "Back"}</button></div>;
  if (!g) return <div className="card p-4 text-sm opacity-70">{ru ? "Загрузка партии…" : "Loading game…"}</div>;

  const me = g.color; // "" — зритель
  const myTurn = g.status === "active" && me !== "" && g.turn === me;
  const done = g.status === "done";
  const white = g.w || "—", black = g.b || (ru ? "ждём соперника" : "waiting for opponent");
  const oppDraw = g.drawBy !== "" && g.drawBy !== me;

  return (
    <div className="card p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <button className="btn btn-ghost" onClick={onClose}>← {ru ? "Назад" : "Back"}</button>
        <span className="chip">♟ {ru ? "По переписке" : "Correspondence"} · {hoursLabel(g.hours, ru)} / {ru ? "ход" : "move"}</span>
      </div>

      <div className="text-sm flex flex-wrap items-center justify-between gap-2">
        <span>⬜ {white} · ⬛ {black}</span>
        {g.status === "active" && (
          <span className={myTurn ? "font-semibold" : "opacity-70"}>
            {myTurn ? (ru ? "Ваш ход" : "Your move") : (ru ? "Ход соперника" : "Opponent's move")} · {leftText(g.deadline, ru)}
          </span>
        )}
      </div>

      {g.status === "open" && <div className="text-sm opacity-80">{ru ? "Вызов ждёт соперника. Когда кто-то его примет, мы напишем в Telegram и пришлём уведомление." : "The challenge is waiting for an opponent. We will notify you in Telegram and by push once someone accepts."}</div>}

      <div className="max-w-[520px] mx-auto">
        <Board
          fen={g.fen}
          orientation={me === "b" ? "black" : "white"}
          lastMove={last}
          disabled={!myTurn || busy}
          mute={!myTurn}
          onMove={(from, to, promotion) => void run(() => corrMove(token || "", g.id, from, to, promotion))}
        />
      </div>

      <Moves san={g.moves} />

      {done && <div className="rounded-2xl bg-black/5 dark:bg-white/5 px-3 py-2 text-sm font-medium">🏁 {resultText(g.result, g.reason, ru)}</div>}

      {g.status === "active" && me !== "" && (
        <div className="flex flex-wrap gap-2">
          {oppDraw ? (
            <>
              <span className="text-sm self-center">{ru ? "Соперник предлагает ничью:" : "Your opponent offers a draw:"}</span>
              <button className="btn btn-primary" disabled={busy} onClick={() => void run(() => corrDraw(token || "", g.id, "accept"))}>{ru ? "Принять" : "Accept"}</button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => void run(() => corrDraw(token || "", g.id, "decline"))}>{ru ? "Отклонить" : "Decline"}</button>
            </>
          ) : g.drawBy === me ? (
            <span className="text-sm opacity-70 self-center">{ru ? "Вы предложили ничью, ждём ответ" : "Draw offered, waiting for the answer"}</span>
          ) : (
            <button className="btn btn-ghost" disabled={busy} onClick={() => void run(() => corrDraw(token || "", g.id, "offer"))}>🤝 {ru ? "Предложить ничью" : "Offer a draw"}</button>
          )}
          <button className="btn btn-ghost" disabled={busy} onClick={() => { if (confirm(ru ? "Сдаться?" : "Resign?")) void run(() => corrResign(token || "", g.id)); }}>🏳 {ru ? "Сдаться" : "Resign"}</button>
        </div>
      )}

      <div className="text-xs opacity-60">{ru ? "Бесплатная партия, без ставок. Не успели сходить за отведённое время — засчитывается поражение." : "Free game, no stakes. If you do not move in time, you lose."}</div>
    </div>
  );
}

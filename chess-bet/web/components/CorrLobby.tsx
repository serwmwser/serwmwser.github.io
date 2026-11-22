"use client";
// Партии по переписке: открытые вызовы, мои партии, создание вызова. Бесплатно, ставок нет.
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/lib/ctx";
import { useSocial } from "@/lib/social";
import { CORR_HOURS, corrCancel, corrCreate, corrJoin, corrMine, corrOpen, hoursLabel, leftText, resultText, type CorrMine, type CorrOpen } from "@/lib/corr";
import CorrGame from "./CorrGame";
import LoginPrompt from "./LoginPrompt";

const ERR_RU: Record<string, string> = {
  too_many_games: "У вас уже 10 партий. Закончите одну из них.",
  too_many_open: "У вас уже 3 открытых вызова. Отмените один или дождитесь соперника.",
  slow_down: "Слишком часто. Попробуйте чуть позже.",
  own_game: "Это ваш собственный вызов.",
  not_open: "Вызов уже принят или отменён.",
};
const ERR_EN: Record<string, string> = {
  too_many_games: "You already have 10 games. Finish one first.",
  too_many_open: "You already have 3 open challenges. Cancel one or wait for an opponent.",
  slow_down: "Too fast. Try again a bit later.",
  own_game: "This is your own challenge.",
  not_open: "The challenge was already accepted or cancelled.",
};

export default function CorrLobby({ initialId = "" }: { initialId?: string }) {
  const { lang, toast } = useApp();
  const ru = lang === "ru";
  const { token } = useSocial();
  const [open, setOpen] = useState<CorrOpen[]>([]);
  const [mine, setMine] = useState<CorrMine[]>([]);
  const [hours, setHours] = useState(24);
  const [color, setColor] = useState<"w" | "b" | "r">("r");
  const [busy, setBusy] = useState(false);
  const [game, setGame] = useState(initialId);

  useEffect(() => { setGame(initialId); }, [initialId]);

  const load = useCallback(async () => {
    try { setOpen(await corrOpen(token || "")); } catch { /* сервер недоступен */ }
    if (token) { try { setMine(await corrMine(token)); } catch { /* нет входа */ } } else setMine([]);
  }, [token]);

  useEffect(() => {
    void load();
    const t = setInterval(() => { if (!document.hidden) void load(); }, 30000);
    return () => clearInterval(t);
  }, [load]);

  const fail = (e: unknown) => {
    const m = (e as Error).message;
    toast((ru ? ERR_RU : ERR_EN)[m] || (ru ? "Не получилось, попробуйте ещё раз" : "Failed, try again"), "err");
  };
  const act = async (f: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await f(); } catch (e) { fail(e); } finally { setBusy(false); void load(); }
  };

  if (game) return <CorrGame id={game} onClose={() => { setGame(""); void load(); }} />;

  const waiting = mine.filter((g) => g.status === "open");
  const active = mine.filter((g) => g.status === "active");
  const done = mine.filter((g) => g.status === "done");
  const colorTxt = (c: "w" | "b") => (c === "w" ? (ru ? "белыми" : "White") : (ru ? "чёрными" : "Black"));

  return (
    <div className="space-y-3">
      <div className="card p-4 space-y-3">
        <h2 className="text-lg font-semibold">♟ {ru ? "Партии по переписке" : "Correspondence chess"}</h2>
        <p className="text-sm opacity-80">
          {ru
            ? "Играйте в своём темпе: один ход в час, 6 часов, сутки или 3 дня. Когда соперник сходит, мы напишем в Telegram или пришлём уведомление. Бесплатно, без ставок."
            : "Play at your own pace: one move per hour, 6 hours, a day or 3 days. When your opponent moves, we notify you in Telegram or by push. Free, no stakes."}
        </p>

        {token ? (
          <div className="space-y-2">
            <div className="text-sm font-medium">{ru ? "Создать вызов" : "Create a challenge"}</div>
            <div className="flex flex-wrap gap-2">
              {CORR_HOURS.map((h) => (
                <button key={h} className={`chip ${hours === h ? "chip-on" : ""}`} onClick={() => setHours(h)}>{hoursLabel(h, ru)} / {ru ? "ход" : "move"}</button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {(["w", "r", "b"] as const).map((c) => (
                <button key={c} className={`chip ${color === c ? "chip-on" : ""}`} onClick={() => setColor(c)}>
                  {c === "w" ? `⬜ ${ru ? "Белые" : "White"}` : c === "b" ? `⬛ ${ru ? "Чёрные" : "Black"}` : `🎲 ${ru ? "Случайно" : "Random"}`}
                </button>
              ))}
            </div>
            <button className="btn btn-primary" disabled={busy} onClick={() => void act(async () => { const id = await corrCreate(token, hours, color); toast(ru ? "Вызов создан. Мы сообщим, когда его примут." : "Challenge created. We will tell you when it is accepted.", "ok"); setGame(id); })}>
              {ru ? "Бросить вызов" : "Post challenge"}
            </button>
          </div>
        ) : (
          <LoginPrompt text={ru ? "Чтобы играть по переписке, войдите на сайт (подпись бесплатна)." : "Sign in to play correspondence chess (the signature is free)."} />
        )}
      </div>

      {active.length > 0 && (
        <div className="card p-4 space-y-2">
          <div className="text-sm font-medium">{ru ? "Мои партии" : "My games"}</div>
          {active.map((g) => (
            <button key={g.id} className="w-full text-left rounded-2xl bg-black/5 dark:bg-white/5 px-3 py-2 text-sm flex items-center justify-between gap-2" onClick={() => setGame(g.id)}>
              <span>{g.color === "w" ? "⬜" : "⬛"} {g.opponent || "?"} · {hoursLabel(g.hours, ru)}</span>
              <span className={g.myTurn ? "font-semibold" : "opacity-70"}>{g.myTurn ? (ru ? "Ваш ход" : "Your move") : (ru ? "Ждём соперника" : "Waiting")} · {leftText(g.deadline, ru)}</span>
            </button>
          ))}
        </div>
      )}

      {waiting.length > 0 && (
        <div className="card p-4 space-y-2">
          <div className="text-sm font-medium">{ru ? "Мои вызовы (ждут соперника)" : "My challenges (waiting)"}</div>
          {waiting.map((g) => (
            <div key={g.id} className="rounded-2xl bg-black/5 dark:bg-white/5 px-3 py-2 text-sm flex items-center justify-between gap-2">
              <span>{g.color === "w" ? "⬜" : "⬛"} {hoursLabel(g.hours, ru)} / {ru ? "ход" : "move"}</span>
              <span className="flex gap-2">
                <button className="btn btn-ghost" onClick={() => setGame(g.id)}>{ru ? "Открыть" : "Open"}</button>
                <button className="btn btn-ghost" disabled={busy} onClick={() => void act(async () => { await corrCancel(token, g.id); })}>{ru ? "Отменить" : "Cancel"}</button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="card p-4 space-y-2">
        <div className="text-sm font-medium">{ru ? "Открытые вызовы" : "Open challenges"}</div>
        {open.length === 0 && <div className="text-sm opacity-70">{ru ? "Пока вызовов нет. Бросьте первый, и соперник найдётся." : "No challenges yet. Post the first one."}</div>}
        {open.map((o) => (
          <div key={o.id} className="rounded-2xl bg-black/5 dark:bg-white/5 px-3 py-2 text-sm flex items-center justify-between gap-2">
            <span>{o.by || "?"} · {ru ? "играет" : "plays"} {colorTxt(o.color)} · {hoursLabel(o.hours, ru)} / {ru ? "ход" : "move"}</span>
            {o.mine ? (
              <span className="opacity-60 text-xs">{ru ? "ваш вызов" : "your challenge"}</span>
            ) : (
              <button className="btn btn-primary" disabled={busy || !token} title={token ? "" : ru ? "Сначала войдите" : "Sign in first"} onClick={() => void act(async () => { const g = await corrJoin(token, o.id); setGame(g.id); })}>
                {ru ? "Принять" : "Accept"}
              </button>
            )}
          </div>
        ))}
      </div>

      {done.length > 0 && (
        <div className="card p-4 space-y-2">
          <div className="text-sm font-medium">{ru ? "Недавно сыграно" : "Recently finished"}</div>
          {done.map((g) => (
            <button key={g.id} className="w-full text-left rounded-2xl bg-black/5 dark:bg-white/5 px-3 py-2 text-sm flex items-center justify-between gap-2" onClick={() => setGame(g.id)}>
              <span>{g.color === "w" ? "⬜" : "⬛"} {g.opponent || "?"}</span>
              <span className="opacity-70">{resultText(g.result, g.reason, ru)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/ctx";
import { API_URL } from "@/lib/config";
import { targetLang } from "@/lib/translate";
import { GUEST_LIMIT, guestLeft, loadGuest, saveGuest, type GuestSession, type InviteInfo } from "@/lib/invite-link";
import TrustScreen from "./TrustScreen";

/** Включить на этапе B, когда сервер начнёт доставлять гостевые сообщения пригласившему. */
const DELIVERS = false;

type Tr = { text: string; same: boolean };

/** Перевод для гостя (без входа): сервер /api/guest/translate появится на этапе B. Пока недоступен — вернёт null. */
async function guestTranslate(text: string, to: string, gid: string): Promise<Tr | null> {
  try {
    const r = await fetch(`${API_URL}/api/guest/translate`, {
      method: "POST", cache: "no-store", headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, to, g: gid }), signal: AbortSignal.timeout(8000),
    });
    const j = (await r.json()) as { ok: boolean; text?: string; same?: boolean };
    if (!j.ok || typeof j.text !== "string") return null;
    return { text: j.text, same: !!j.same };
  } catch { return null; }
}

/** HiMeet invite: гостевой диалог с пригласившим. Без установки и регистрации; история хранится в этом браузере.
 *  Звонки требуют входа: кнопка «Позвонить» открывает экран доверия. */
export default function GuestChat({ info }: { info: InviteInfo }) {
  const { lang } = useApp();
  const ru = lang === "ru";
  const who = info.name || (ru ? "Ваш друг" : "Your friend");
  const own = !info.message; // своего текста нет: показываем стандартное приветствие на языке сайта
  const first = info.message || (ru
    ? "Привет! Я в HiMeet: здесь мы переписываемся с автопереводом. Напиши мне на своём языке."
    : "Hi! I'm on HiMeet: here we chat with automatic translation. Write to me in your own language.");

  const [s, setS] = useState<GuestSession | null>(null);
  const [tr, setTr] = useState<Tr | "fail" | null>(null);
  const [showOrig, setShowOrig] = useState(false);
  const [draft, setDraft] = useState("");
  const [trust, setTrust] = useState<"save" | "call" | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setS(loadGuest(info.ref)); }, [info.ref]);

  // Автоперевод первого сообщения на язык браузера гостя: на глазах у новичка
  useEffect(() => {
    if (!s || own) return;
    let on = true;
    const t0 = Date.now();
    guestTranslate(first, targetLang(lang), s.id).then((r) => {
      const wait = Math.max(0, 900 - (Date.now() - t0)); // короткая пауза, чтобы раскрытие было заметно
      setTimeout(() => { if (on) setTr(r ?? "fail"); }, wait);
    });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.id, lang]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [s?.msgs.length]);

  const left = s ? guestLeft(s) : GUEST_LIMIT;

  const send = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!s || !text || left <= 0) return;
    const next: GuestSession = { ...s, sent: s.sent + 1, msgs: [...s.msgs, { from: "me", text, ts: Date.now() }] };
    saveGuest(next);
    setS(next);
    setDraft("");
  };

  const translated = tr && tr !== "fail" && !tr.same ? tr : null;
  const shown = translated && !showOrig ? translated.text : first;

  return (
    <section className="card space-y-3" aria-label={ru ? "Диалог" : "Chat"}>
      <div className="flex items-center gap-3">
        <span className="grid place-items-center w-11 h-11 rounded-full text-lg font-extrabold text-white shrink-0" style={{ background: "linear-gradient(135deg,#ff8fb1,#8b4dff)" }} aria-hidden="true">{who.slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <div className="font-extrabold truncate">{who}</div>
          <div className="text-xs opacity-75">{ru ? "пригласил вас в HiMeet" : "invited you to HiMeet"}</div>
        </div>
        <button type="button" className="btn btn-ghost !px-3 !py-1.5 shrink-0" onClick={() => setTrust("call")} aria-label={ru ? `Позвонить: ${who}` : `Call ${who}`}>📞 {ru ? "Позвонить" : "Call"}</button>
      </div>

      <div className="space-y-2" aria-live="polite">
        <div className="max-w-[88%] rounded-2xl rounded-es-sm px-3 py-2 text-sm" style={{ background: "rgba(139,77,255,.12)" }}>
          {!own && tr === null ? (
            <span className="inline-flex gap-1 items-center py-1" role="status" aria-label={ru ? "Переводим" : "Translating"}>
              <i className="w-1.5 h-1.5 rounded-full bg-current opacity-60 animate-pulse" />
              <i className="w-1.5 h-1.5 rounded-full bg-current opacity-60 animate-pulse" style={{ animationDelay: ".2s" }} />
              <i className="w-1.5 h-1.5 rounded-full bg-current opacity-60 animate-pulse" style={{ animationDelay: ".4s" }} />
            </span>
          ) : (
            <span>{shown}</span>
          )}
          {translated && (
            <button type="button" className="block mt-1 text-xs underline opacity-75" onClick={() => setShowOrig((v) => !v)}>
              {showOrig ? (ru ? "Показать перевод" : "Show translation") : (ru ? "Показать оригинал" : "Show original")}
            </button>
          )}
          {!own && tr === "fail" && <span className="block mt-1 text-xs opacity-60">{ru ? "Автоперевод сейчас недоступен" : "Auto-translation is unavailable right now"}</span>}
        </div>

        {s?.msgs.map((m) => (
          <div key={m.ts} className={m.from === "me" ? "flex justify-end" : "flex"}>
            <div className="max-w-[88%] rounded-2xl rounded-ee-sm px-3 py-2 text-sm text-white" style={{ background: "linear-gradient(135deg,#ff8fb1,#8b4dff)" }}>{m.text}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {s && s.msgs.length > 0 && !DELIVERS && (
        <p className="text-xs opacity-75">
          {ru ? `Сообщение сохранено в этом браузере. Войдите, чтобы ${who} его получил.` : `Your message is saved in this browser. Sign in so ${who} can receive it.`}
        </p>
      )}

      <form onSubmit={send} className="space-y-1.5">
        <div className="flex gap-2">
          <input
            className="input flex-1 min-w-0"
            value={draft}
            maxLength={500}
            onChange={(e) => setDraft(e.target.value)}
            disabled={left <= 0}
            placeholder={ru ? "Напишите сообщение…" : "Write a message…"}
            aria-label={ru ? "Сообщение" : "Message"}
          />
          <button className="btn btn-primary shrink-0" type="submit" disabled={!draft.trim() || left <= 0}>{ru ? "Отправить" : "Send"}</button>
        </div>
        <p className="text-xs opacity-70">
          {left > 0
            ? (ru ? `Пишите на своём языке — ${who} увидит перевод. Осталось сообщений сегодня: ${left}.` : `Write in your own language — ${who} will see a translation. Messages left today: ${left}.`)
            : (ru ? "Дневной лимит гостя исчерпан. Войдите, чтобы писать без ограничений." : "Daily guest limit reached. Sign in to keep chatting.")}
        </p>
      </form>

      <div className="flex items-center justify-between gap-2 rounded-2xl px-3 py-2 text-xs" style={{ background: "rgba(212,160,23,.12)" }}>
        <span>{ru ? "Гостевой режим · переписка хранится в этом браузере" : "Guest mode · chat is kept in this browser"}</span>
        <button type="button" className="btn btn-ghost !px-3 !py-1.5 shrink-0" onClick={() => setTrust("save")}>{ru ? "Сохранить переписку" : "Save chat"}</button>
      </div>

      {trust && <TrustScreen name={who} reason={trust} onClose={() => setTrust(null)} />}
    </section>
  );
}

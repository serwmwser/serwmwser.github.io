"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/ctx";
import { targetLang } from "@/lib/translate";
import { guestLeft, loadGuest, saveGuest, type GuestSession, type InviteInfo } from "@/lib/invite-link";
import { guestError, guestSend, guestThread, guestTranslate, type GuestItem, type Tr } from "@/lib/guest-api";
import TrustScreen from "./TrustScreen";

const NAME_KEY = "hm_guest_name";
const POLL_MS = 8000; // опрос ответов пригласившего; сервер допускает не чаще раза в 6 секунд

/** HiMeet invite: гостевой диалог с пригласившим. Без установки и регистрации.
 *  Сообщения уходят пригласившему через сервер, его ответы приходят сюда; звонки и сохранение переписки требуют входа. */
export default function GuestChat({ info }: { info: InviteInfo }) {
  const { lang } = useApp();
  const ru = lang === "ru";
  const who = info.name || (ru ? "Ваш друг" : "Your friend");
  const own = !info.message; // своего текста нет: показываем стандартное приветствие на языке сайта
  const first = info.message || (ru
    ? "Привет! Я в HiMeet: здесь мы переписываемся с автопереводом. Напиши мне на своём языке."
    : "Hi! I'm on HiMeet: here we chat with automatic translation. Write to me in your own language.");

  const [s, setS] = useState<GuestSession | null>(null);
  const [items, setItems] = useState<GuestItem[]>([]); // переписка с сервера (когда в ссылке есть пригласивший)
  const [left, setLeft] = useState(20);
  const [name, setName] = useState("");
  const [tr, setTr] = useState<Tr | "fail" | null>(null);
  const [showOrig, setShowOrig] = useState(false);
  const [trMap, setTrMap] = useState<Record<number, Tr | "fail">>({});
  const [origMap, setOrigMap] = useState<Record<number, boolean>>({});
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [trust, setTrust] = useState<"save" | "call" | null>(null);
  const asked = useRef<Set<number>>(new Set());
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sess = loadGuest(info.ref);
    saveGuest(sess); // id гостя сохраняется сразу
    setS(sess);
    setLeft(guestLeft(sess));
    try { setName(localStorage.getItem(NAME_KEY) || ""); } catch { /* без хранилища */ }
  }, [info.ref]);

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

  // Ответы пригласившего: опрос сервера, пока вкладка видна
  const poll = useCallback(async () => {
    if (!s || !info.ref) return;
    try { const r = await guestThread(s.id, info.ref, 0); setItems(r.items); setLeft(r.left); } catch { /* нет сети: повторим */ }
  }, [s, info.ref]);
  useEffect(() => {
    if (!s || !info.ref) return;
    poll();
    const t = setInterval(() => { if (!document.hidden) poll(); }, POLL_MS);
    return () => clearInterval(t);
  }, [s, info.ref, poll]);

  // Перевод ответов пригласившего на язык гостя
  useEffect(() => {
    if (!s) return;
    for (const m of items) {
      if (m.side !== "inviter" || asked.current.has(m.id)) continue;
      asked.current.add(m.id);
      guestTranslate(m.text, targetLang(lang), s.id).then((r) => setTrMap((v) => ({ ...v, [m.id]: r ?? "fail" })));
    }
  }, [items, s, lang]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [items.length, s?.msgs.length]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!s || !text || busy || left <= 0) return;
    setErr("");
    if (!info.ref) { // в ссылке нет пригласившего: сообщение хранится только в этом браузере
      const next: GuestSession = { ...s, sent: s.sent + 1, msgs: [...s.msgs, { from: "me", text, ts: Date.now() }] };
      saveGuest(next); setS(next); setLeft(guestLeft(next)); setDraft("");
      return;
    }
    setBusy(true);
    try {
      const r = await guestSend(s.id, info.ref, name.trim(), text);
      setItems((v) => [...v, { id: r.id, side: "guest", text, created: Date.now() }]);
      setLeft(r.left);
      setDraft("");
      try { localStorage.setItem(NAME_KEY, name.trim()); } catch { /* без хранилища */ }
    } catch (x) {
      setErr(guestError((x as Error).message, ru));
    } finally { setBusy(false); }
  };

  const translated = tr && tr !== "fail" && !tr.same ? tr : null;
  const shown = translated && !showOrig ? translated.text : first;
  const bubbleMe = { background: "linear-gradient(135deg,#ff8fb1,#8b4dff)" } as const;
  const bubbleThem = { background: "rgba(139,77,255,.12)" } as const;

  return (
    <section className="card space-y-3" aria-label={ru ? "Диалог" : "Chat"}>
      <div className="flex items-center gap-3">
        <span className="grid place-items-center w-11 h-11 rounded-full text-lg font-extrabold text-white shrink-0" style={bubbleMe} aria-hidden="true">{who.slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0 flex-1">
          <div className="font-extrabold truncate">{who}</div>
          <div className="text-xs opacity-75">{ru ? "пригласил вас в HiMeet" : "invited you to HiMeet"}</div>
        </div>
        <button type="button" className="btn btn-ghost !px-3 !py-1.5 shrink-0" onClick={() => setTrust("call")} aria-label={ru ? `Позвонить: ${who}` : `Call ${who}`}>📞 {ru ? "Позвонить" : "Call"}</button>
      </div>

      <div className="space-y-2" aria-live="polite">
        <div className="max-w-[88%] rounded-2xl rounded-es-sm px-3 py-2 text-sm" style={bubbleThem}>
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

        {info.ref
          ? items.map((m) => {
              const t = trMap[m.id];
              const tx = t && t !== "fail" && !t.same ? t : null;
              return m.side === "guest" ? (
                <div key={m.id} className="flex justify-end"><div className="max-w-[88%] rounded-2xl rounded-ee-sm px-3 py-2 text-sm text-white" style={bubbleMe}>{m.text}</div></div>
              ) : (
                <div key={m.id} className="flex"><div className="max-w-[88%] rounded-2xl rounded-es-sm px-3 py-2 text-sm" style={bubbleThem}>
                  <span>{tx && !origMap[m.id] ? tx.text : m.text}</span>
                  {tx && <button type="button" className="block mt-1 text-xs underline opacity-75" onClick={() => setOrigMap((v) => ({ ...v, [m.id]: !v[m.id] }))}>{origMap[m.id] ? (ru ? "Показать перевод" : "Show translation") : (ru ? "Показать оригинал" : "Show original")}</button>}
                </div></div>
              );
            })
          : s?.msgs.map((m) => (
              <div key={m.ts} className="flex justify-end"><div className="max-w-[88%] rounded-2xl rounded-ee-sm px-3 py-2 text-sm text-white" style={bubbleMe}>{m.text}</div></div>
            ))}
        <div ref={endRef} />
      </div>

      {!info.ref && s && s.msgs.length > 0 && (
        <p className="text-xs opacity-75">{ru ? "В этой ссылке нет пригласившего: сообщение сохранено только в этом браузере." : "This link has no inviter: your message is saved only in this browser."}</p>
      )}

      <form onSubmit={send} className="space-y-1.5">
        {info.ref && items.length === 0 && (
          <input className="input w-full" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder={ru ? "Как вас зовут? (необязательно)" : "Your name (optional)"} aria-label={ru ? "Ваше имя" : "Your name"} />
        )}
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
          <button className="btn btn-primary shrink-0" type="submit" disabled={!draft.trim() || left <= 0 || busy}>{ru ? "Отправить" : "Send"}</button>
        </div>
        {err && <p className="text-xs text-red-500" role="alert">{err}</p>}
        <p className="text-xs opacity-70">
          {left > 0
            ? (ru ? `Пишите на своём языке — ${who} увидит перевод. Осталось сообщений сегодня: ${left}.` : `Write in your own language — ${who} will see a translation. Messages left today: ${left}.`)
            : (ru ? "Дневной лимит гостя исчерпан. Войдите, чтобы писать без ограничений." : "Daily guest limit reached. Sign in to keep chatting.")}
        </p>
      </form>

      <div className="flex items-center justify-between gap-2 rounded-2xl px-3 py-2 text-xs" style={{ background: "rgba(212,160,23,.12)" }}>
        <span>{ru ? "Гостевой режим · без регистрации" : "Guest mode · no sign-up"}</span>
        <button type="button" className="btn btn-ghost !px-3 !py-1.5 shrink-0" onClick={() => setTrust("save")}>{ru ? "Сохранить переписку" : "Save chat"}</button>
      </div>

      {trust && <TrustScreen name={who} reason={trust} onClose={() => setTrust(null)} />}
    </section>
  );
}

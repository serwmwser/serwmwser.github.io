"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/ctx";
import { targetLang } from "@/lib/translate";
import { guestLeft, inviteTarget, loadGuest, MAX_QUEUE, saveGuest, type GuestQueued, type GuestSession, type InviteInfo } from "@/lib/invite-link";
import { guestDelete, guestError, guestReport, guestSend, guestThread, guestTranslate, isOffline, type GuestItem, type Tr } from "@/lib/guest-api";
import TrustScreen from "./TrustScreen";

const NAME_KEY = "hm_guest_name";
const POLL_MS = 8000; // опрос ответов пригласившего; сервер допускает не чаще раза в 6 секунд
const newKey = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const bubbleMe = { background: "linear-gradient(135deg,#ff8fb1,#8b4dff)" } as const;
const bubbleThem = { background: "rgba(139,77,255,.12)" } as const;

/** HiMeet invite: гостевой диалог с пригласившим. Без установки и регистрации.
 *  Как в чате профиля: перевод по кнопке, удаление своих сообщений, жалоба, статусы «доставлено / прочитано».
 *  Работает и без интернета: сообщения ждут в очереди и уходят сами, переписка читается из кэша браузера.
 *  Звонки и сохранение переписки требуют входа. */
export default function GuestChat({ info }: { info: InviteInfo }) {
  const { lang } = useApp();
  const ru = lang === "ru";
  const target = inviteTarget(info); // ник из короткой ссылки или адрес из старой
  const who = info.name || (ru ? "Ваш друг" : "Your friend");
  const own = !info.message; // своего текста нет: показываем стандартное приветствие на языке сайта
  const first = info.message || (ru
    ? "Привет! Я в HiMeet: здесь мы переписываемся с автопереводом. Напиши мне на своём языке."
    : "Hi! I'm on HiMeet: here we chat with automatic translation. Write to me in your own language.");

  const sRef = useRef<GuestSession | null>(null); // актуальная сессия для асинхронных обработчиков
  const [sid, setSid] = useState<string | null>(null);
  const [items, setItems] = useState<GuestItem[]>([]); // переписка с сервера или из кэша
  const [queue, setQueue] = useState<GuestQueued[]>([]); // ещё не отправлено (нет сети)
  const [local, setLocal] = useState<GuestSession["msgs"]>([]); // режим без пригласившего в ссылке
  const [left, setLeft] = useState(20);
  const [blocked, setBlocked] = useState(false);
  const [name, setName] = useState("");
  const nameRef = useRef("");
  const [trMap, setTrMap] = useState<Record<number, Tr | "load" | "fail">>({});
  const [origMap, setOrigMap] = useState<Record<number, boolean>>({});
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [trust, setTrust] = useState<"save" | "call" | null>(null);
  const asked = useRef<Set<number>>(new Set());
  const flushing = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);

  const persist = useCallback((patch: Partial<GuestSession>) => {
    const cur = sRef.current;
    if (!cur) return;
    const next = { ...cur, ...patch };
    sRef.current = next;
    saveGuest(next);
  }, []);

  useEffect(() => { nameRef.current = name; }, [name]);

  // загрузка сессии гостя; переписка и очередь показываются сразу из кэша, даже без сети
  useEffect(() => {
    const sess = loadGuest(target);
    saveGuest(sess); // id гостя сохраняется сразу
    sRef.current = sess;
    setSid(sess.id);
    setItems(sess.cache);
    setQueue(sess.queue);
    setLocal(sess.msgs);
    setLeft(guestLeft(sess));
    try { const n = localStorage.getItem(NAME_KEY) || ""; setName(n); nameRef.current = n; } catch { /* без хранилища */ }
  }, [target]);

  // перевод: один запрос на сообщение; при сбое появляется кнопка «Перевести» (повтор)
  const tryTr = useCallback(async (key: number, text: string) => {
    const sess = sRef.current;
    if (!sess) return;
    setTrMap((v) => ({ ...v, [key]: "load" }));
    const r = await guestTranslate(text, targetLang(lang), sess.id);
    setTrMap((v) => ({ ...v, [key]: r ?? "fail" }));
  }, [lang]);

  useEffect(() => { asked.current.clear(); setTrMap({}); setOrigMap({}); }, [lang]); // язык сменили: переводим заново
  useEffect(() => { // приветствие пригласившего (ключ 0): на глазах у новичка
    if (!sid || own || asked.current.has(0)) return;
    asked.current.add(0);
    const t0 = Date.now();
    setTimeout(() => tryTr(0, first), Math.max(0, 600 - (Date.now() - t0)));
  }, [sid, own, first, tryTr, lang]);
  useEffect(() => { // ответы пригласившего переводятся сами
    if (!sid) return;
    for (const m of items) {
      if (m.side !== "inviter" || asked.current.has(m.id)) continue;
      asked.current.add(m.id);
      tryTr(m.id, m.text);
    }
  }, [items, sid, tryTr]);

  // ответы пригласившего: опрос сервера, пока вкладка видна
  const poll = useCallback(async () => {
    const sess = sRef.current;
    if (!sess || !target) return;
    try {
      const r = await guestThread(sess.id, target, 0);
      setItems(r.items); setLeft(r.left); setBlocked(r.blocked);
      persist({ cache: r.items });
    } catch { /* нет сети: остаётся кэш */ }
  }, [target, persist]);

  // отправка очереди: по порядку, при отсутствии сети останавливаемся и пробуем позже
  const flush = useCallback(async () => {
    const sess = sRef.current;
    if (!sess || !target || flushing.current || sess.queue.length === 0) return;
    flushing.current = true;
    try {
      for (const q of [...sess.queue]) {
        const drop = () => { const rest = (sRef.current?.queue ?? []).filter((x) => x.k !== q.k); persist({ queue: rest }); setQueue(rest); };
        try {
          const r = await guestSend(sess.id, target, nameRef.current, q.text);
          drop();
          setLeft(r.left);
          setItems((v) => [...v, { id: r.id, side: "guest", text: q.text, created: q.ts }]);
        } catch (e) {
          if (isOffline(e)) break; // нет сети: повторим позже
          drop(); // сервер отказал (лимит, блокировка): сообщение не вернётся
          setErr(guestError((e as Error).message, ru));
        }
      }
    } finally { flushing.current = false; }
    poll();
  }, [target, persist, poll, ru]);

  useEffect(() => {
    if (!sid || !target) return;
    flush(); poll();
    const t = setInterval(() => { if (!document.hidden) { flush(); poll(); } }, POLL_MS);
    const on = () => { flush(); poll(); };
    window.addEventListener("online", on);
    return () => { clearInterval(t); window.removeEventListener("online", on); };
  }, [sid, target, flush, poll]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [items.length, queue.length, local.length]);

  const send = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    const sess = sRef.current;
    if (!sess || !text || left <= 0 || blocked) return;
    setErr(""); setNote("");
    if (!target) { // в ссылке нет пригласившего: сообщение хранится только в этом браузере
      const msgs = [...sess.msgs, { from: "me" as const, text, ts: Date.now() }];
      persist({ msgs, sent: sess.sent + 1 });
      setLocal(msgs); setLeft(guestLeft(sRef.current as GuestSession)); setDraft("");
      return;
    }
    if (sess.queue.length >= MAX_QUEUE) { setErr(guestError("offline", ru)); return; }
    const next = [...sess.queue, { k: newKey(), text, ts: Date.now() }];
    persist({ queue: next }); setQueue(next); setDraft("");
    try { localStorage.setItem(NAME_KEY, nameRef.current.trim()); } catch { /* без хранилища */ }
    flush();
  };

  const delMine = async (m: GuestItem) => {
    const sess = sRef.current;
    if (!sess || !window.confirm(ru ? "Удалить сообщение?" : "Delete this message?")) return;
    try {
      await guestDelete(sess.id, m.id);
      const rest = items.filter((x) => x.id !== m.id);
      setItems(rest); persist({ cache: rest });
    } catch (e) { setErr(guestError((e as Error).message, ru)); }
  };
  const delQueued = (k: string) => {
    const rest = queue.filter((x) => x.k !== k);
    persist({ queue: rest }); setQueue(rest);
  };
  const report = async (m: GuestItem) => {
    const sess = sRef.current;
    if (!sess || !window.confirm(ru ? "Пожаловаться на это сообщение?" : "Report this message?")) return;
    try { await guestReport(sess.id, m.id); setNote(ru ? "Жалоба отправлена" : "Report sent"); }
    catch (e) { setErr(guestError((e as Error).message, ru)); }
  };

  const toggleBtn = "block mt-1 text-xs underline opacity-75";
  /** Входящее сообщение: перевод на язык гостя, «Показать оригинал», при сбое «Перевести» */
  const incoming = (id: number, text: string, auto: boolean, m?: GuestItem) => {
    const t = trMap[id];
    const tx = t && t !== "load" && t !== "fail" && !t.same ? t : null;
    const pending = t === "load" || (t === undefined && auto);
    return (
      <div className="flex"><div className="max-w-[88%] rounded-2xl rounded-es-sm px-3 py-2 text-sm" style={bubbleThem}>
        {pending ? (
          <span className="inline-flex gap-1 items-center py-1" role="status" aria-label={ru ? "Переводим" : "Translating"}>
            <i className="w-1.5 h-1.5 rounded-full bg-current opacity-60 animate-pulse" />
            <i className="w-1.5 h-1.5 rounded-full bg-current opacity-60 animate-pulse" style={{ animationDelay: ".2s" }} />
            <i className="w-1.5 h-1.5 rounded-full bg-current opacity-60 animate-pulse" style={{ animationDelay: ".4s" }} />
          </span>
        ) : (
          <span>{tx && !origMap[id] ? tx.text : text}</span>
        )}
        {tx && <button type="button" className={toggleBtn} onClick={() => setOrigMap((v) => ({ ...v, [id]: !v[id] }))}>{origMap[id] ? (ru ? "Показать перевод" : "Show translation") : (ru ? "Показать оригинал" : "Show original")}</button>}
        {t === "fail" && <button type="button" className={toggleBtn} onClick={() => tryTr(id, text)}>{ru ? "Перевести" : "Translate"}</button>}
        {m && <button type="button" className="ms-2 text-xs opacity-50 hover:opacity-100" onClick={() => report(m)} aria-label={ru ? "Пожаловаться" : "Report"}>⚑</button>}
      </div></div>
    );
  };

  const canWrite = left > 0 && !blocked;
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
        {incoming(0, first, !own)}

        {target
          ? <>
              {items.map((m) => m.side === "guest" ? (
                <div key={m.id} className="flex justify-end"><div className="max-w-[88%] rounded-2xl rounded-ee-sm px-3 py-2 text-sm text-white" style={bubbleMe}>
                  {m.text}
                  <span className="block text-[10px] opacity-70 text-end mt-0.5">
                    <span aria-label={m.read ? (ru ? "Прочитано" : "Read") : (ru ? "Доставлено" : "Delivered")}>{m.read ? "✓✓" : "✓"}</span>
                    <button type="button" className="ms-2 opacity-70 hover:opacity-100" onClick={() => delMine(m)} aria-label={ru ? "Удалить" : "Delete"}>🗑</button>
                  </span>
                </div></div>
              ) : <div key={m.id}>{incoming(m.id, m.text, true, m)}</div>)}
              {queue.map((q) => (
                <div key={q.k} className="flex justify-end"><div className="max-w-[88%] rounded-2xl rounded-ee-sm px-3 py-2 text-sm text-white opacity-80" style={bubbleMe}>
                  {q.text}
                  <span className="block text-[10px] opacity-80 text-end mt-0.5">
                    🕓 {ru ? "ждёт сети" : "waiting for network"}
                    <button type="button" className="ms-2 opacity-70 hover:opacity-100" onClick={() => delQueued(q.k)} aria-label={ru ? "Убрать" : "Remove"}>🗑</button>
                  </span>
                </div></div>
              ))}
            </>
          : local.map((m) => (
              <div key={m.ts} className="flex justify-end"><div className="max-w-[88%] rounded-2xl rounded-ee-sm px-3 py-2 text-sm text-white" style={bubbleMe}>{m.text}</div></div>
            ))}
        <div ref={endRef} />
      </div>

      {!target && local.length > 0 && (
        <p className="text-xs opacity-75">{ru ? "В этой ссылке нет пригласившего: сообщение сохранено только в этом браузере." : "This link has no inviter: your message is saved only in this browser."}</p>
      )}
      {blocked && <p className="text-xs opacity-80" role="status">{guestError("blocked", ru)}</p>}

      <form onSubmit={send} className="space-y-1.5">
        {target && items.length === 0 && queue.length === 0 && (
          <input className="input w-full" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder={ru ? "Как вас зовут? (необязательно)" : "Your name (optional)"} aria-label={ru ? "Ваше имя" : "Your name"} />
        )}
        <div className="flex gap-2">
          <input
            className="input flex-1 min-w-0"
            value={draft}
            maxLength={500}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!canWrite}
            placeholder={ru ? "Напишите сообщение…" : "Write a message…"}
            aria-label={ru ? "Сообщение" : "Message"}
          />
          <button className="btn btn-primary shrink-0" type="submit" disabled={!draft.trim() || !canWrite}>{ru ? "Отправить" : "Send"}</button>
        </div>
        {err && <p className="text-xs text-red-500" role="alert">{err}</p>}
        {note && <p className="text-xs opacity-80" role="status">{note}</p>}
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

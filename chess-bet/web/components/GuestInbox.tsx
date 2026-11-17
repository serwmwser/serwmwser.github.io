"use client";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/ctx";
import { targetLang, translateError, translateText } from "@/lib/translate";
import { guestError, guestInbox, guestMessages, guestReply, type GuestItem, type GuestThreadInfo } from "@/lib/guest-api";

const REFRESH_MS = 10000;
type Tr = { text: string; show: boolean };

/** HiMeet invite: блок «Гости по вашей ссылке» во вкладке «Чат». Видны переписки людей, написавших по вашей ссылке-приглашению
 *  без регистрации; можно перевести их сообщения на свой язык и ответить. Пока гостей нет, блок скрыт. */
export default function GuestInbox({ token }: { token: string }) {
  const { lang, toast } = useApp();
  const ru = lang === "ru";
  const [list, setList] = useState<GuestThreadInfo[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [msgs, setMsgs] = useState<GuestItem[]>([]);
  const [tr, setTr] = useState<Record<number, Tr | "load">>({});
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const label = useCallback((g: string, n: string) => n || (ru ? "Гость " : "Guest ") + g.slice(0, 4), [ru]);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      if (open) { const r = await guestMessages(token, open); setName(r.name); setMsgs(r.items); }
      else setList(await guestInbox(token));
    } catch { /* нет сети или сервер ещё не обновлён: блок просто не показываем */ }
  }, [token, open]);

  useEffect(() => {
    if (!token) return;
    refresh();
    const t = setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
    return () => clearInterval(t);
  }, [token, refresh]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [msgs.length, open]);

  const doTr = async (m: GuestItem) => {
    const cur = tr[m.id];
    if (cur === "load") return;
    if (cur) { setTr((a) => ({ ...a, [m.id]: { ...cur, show: !cur.show } })); return; }
    setTr((a) => ({ ...a, [m.id]: "load" }));
    try {
      const r = await translateText(token, m.text, targetLang(lang));
      if (r.same) { toast(ru ? "Сообщение уже на вашем языке" : "The message is already in your language", "info"); setTr((a) => { const b = { ...a }; delete b[m.id]; return b; }); return; }
      setTr((a) => ({ ...a, [m.id]: { text: r.text, show: true } }));
    } catch (e) {
      toast(translateError((e as Error).message, ru), "err");
      setTr((a) => { const b = { ...a }; delete b[m.id]; return b; });
    }
  };

  const reply = async (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!open || !text || busy) return;
    setBusy(true);
    try {
      const r = await guestReply(token, open, text);
      setMsgs((v) => [...v, { id: r.id, side: "inviter", text, created: Date.now() }]);
      setDraft("");
    } catch (x) { toast(guestError((x as Error).message, ru), "err"); }
    finally { setBusy(false); }
  };

  const back = () => { setOpen(null); setMsgs([]); setList(null); };
  const time = (t: number) => new Date(t).toLocaleTimeString(ru ? "ru-RU" : "en-US", { hour: "2-digit", minute: "2-digit" });

  if (!token) return null;

  if (open) {
    return (
      <section className="card space-y-3" aria-label={ru ? "Переписка с гостем" : "Guest conversation"}>
        <header className="flex items-center gap-2">
          <button type="button" onClick={back} aria-label={ru ? "Назад" : "Back"} className="text-xl px-1">←</button>
          <b className="truncate">{label(open, name)}</b>
          <span className="text-xs opacity-60">{ru ? "гость без регистрации" : "guest, not signed in"}</span>
        </header>
        <div className="space-y-2 max-h-[50vh] overflow-y-auto" aria-live="polite">
          {msgs.map((m) => {
            const t = tr[m.id];
            const mine = m.side === "inviter";
            return (
              <div key={m.id} className={mine ? "flex justify-end" : "flex"}>
                <div className={"max-w-[88%] rounded-2xl px-3 py-2 text-sm " + (mine ? "text-white" : "")} style={{ background: mine ? "linear-gradient(135deg,#ff8fb1,#8b4dff)" : "rgba(139,77,255,.12)" }}>
                  <span>{!mine && t && t !== "load" && t.show ? t.text : m.text}</span>
                  <span className="block text-[10px] opacity-60 mt-0.5">{time(m.created)}</span>
                  {!mine && (
                    <button type="button" className="block mt-0.5 text-xs underline opacity-75" onClick={() => doTr(m)}>
                      {t === "load" ? "…" : t && t.show ? (ru ? "Показать оригинал" : "Show original") : (ru ? "Перевести" : "Translate")}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>
        <form onSubmit={reply} className="flex gap-2">
          <input className="input flex-1 min-w-0" value={draft} maxLength={500} onChange={(e) => setDraft(e.target.value)} placeholder={ru ? "Ответить гостю…" : "Reply to the guest…"} aria-label={ru ? "Ответ" : "Reply"} />
          <button className="btn btn-primary shrink-0" type="submit" disabled={!draft.trim() || busy}>{ru ? "Отправить" : "Send"}</button>
        </form>
        <p className="text-xs opacity-70">{ru ? "Гость увидит ваш ответ переведённым на его язык." : "The guest will see your reply translated into their language."}</p>
      </section>
    );
  }

  if (!list || list.length === 0) return null;
  const total = list.reduce((n, x) => n + x.unread, 0);
  return (
    <section className="card space-y-2" aria-label={ru ? "Гости по вашей ссылке" : "Guests from your link"} style={{ border: "2px solid #ff8fb1" }}>
      <h2 className="font-extrabold">👥 {ru ? "Гости по вашей ссылке" : "Guests from your link"}{total > 0 ? ` (${total})` : ""}</h2>
      <p className="text-xs opacity-70">{ru ? "Эти люди написали вам по приглашению без регистрации." : "These people wrote to you through your invitation without signing up."}</p>
      <ul className="space-y-1.5">
        {list.map((x) => (
          <li key={x.g}>
            <button type="button" onClick={() => { setOpen(x.g); setName(x.name); setMsgs([]); }} className="w-full text-start rounded-xl px-3 py-2 flex items-center gap-2 hover:opacity-90" style={{ background: "rgba(139,77,255,.10)" }}>
              <span className="min-w-0 flex-1">
                <b className="block truncate">{label(x.g, x.name)}</b>
                <span className="block text-xs opacity-75 truncate">{x.mine ? (ru ? "Вы: " : "You: ") : ""}{x.last}</span>
              </span>
              {x.unread > 0 && <span className="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ background: "#ff4fa3" }}>{x.unread}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { useConnectModal } from "thirdweb/react";
import { chain, client } from "@/lib/config";
import { useApp } from "@/lib/ctx";
import { useSocial } from "@/lib/social";
import { getToken } from "@/lib/session";
import { LinkInfo, addLink, clearPendingLink, fetchLinks, getPendingLink, linkErr, removeLink, setPendingLink } from "@/lib/loginLinks";
import { wallets } from "./Header";

const short = (a: string) => a.slice(0, 6) + "…" + a.slice(-4);

/** Блок «Входы в профиль»: один профиль открывается почтой, Google или кошельком.
 *  «Привязать другой вход»: запоминаем основной профиль, человек подключает второй способ,
 *  и после его входа этот блок (он остаётся на странице профиля) завершает привязку. */
export default function LinkLogin() {
  const { lang, dark, toast } = useApp();
  const ru = lang === "ru";
  const { addr, token } = useSocial();
  const { connect } = useConnectModal();
  const [info, setInfo] = useState<LinkInfo | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const done = useRef("");

  const load = () => { if (token) fetchLinks(token).then(setInfo).catch(() => setInfo(null)); };
  useEffect(() => { setInfo(null); load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);

  // Второй вход подключён: привязываем его к запомненному основному профилю
  useEffect(() => {
    const pend = getPendingLink();
    if (!token || !addr || !pend) return;
    if (token.split("|")[0] !== addr.toLowerCase()) return; // токен ещё от прошлого входа: ждём токен нового
    if (pend === addr.toLowerCase()) { clearPendingLink(); return; } // выбрали тот же вход
    const k = pend + ">" + addr.toLowerCase();
    if (done.current === k) return;
    done.current = k;
    setBusy(true);
    addLink(token, pend)
      .then(() => { clearPendingLink(); toast(ru ? "Вход привязан. Обновляем профиль…" : "Login linked. Reloading the profile…", "ok"); setTimeout(() => window.location.reload(), 900); })
      .catch((e) => { clearPendingLink(); const m = linkErr(e, ru); setNote(m); toast(m, "err"); })
      .finally(() => setBusy(false));
  }, [token, addr, ru, toast]);

  const start = async () => {
    if (!info) return;
    if (!getToken(info.main)) { setNote(ru ? "Сначала войдите в основной профиль тем способом, которым вы в него входили, и повторите." : "First sign in to the main profile the way you usually do, then retry."); return; }
    setNote("");
    setPendingLink(info.main);
    try { await connect({ client, chain, wallets, theme: dark ? "dark" : "light", size: "compact", title: "HiMeet" }); }
    catch { clearPendingLink(); /* окно закрыли */ }
  };

  const drop = async (alt: string) => {
    if (!token || busy) return;
    setBusy(true);
    try { await removeLink(token, alt); load(); } catch (e) { setNote(linkErr(e, ru)); }
    setBusy(false);
  };

  if (!token) return null;
  return (
    <section className="card space-y-3" aria-label={ru ? "Входы в профиль" : "Profile logins"}>
      <h2 className="font-bold text-sm">🔗 {ru ? "Входы в профиль" : "Profile logins"}</h2>
      {info && (
        <ul className="text-xs space-y-1">
          <li>{ru ? "Основной вход" : "Main login"}: <span className="font-mono">{short(info.main)}</span>{info.current === info.main ? (ru ? " (вы сейчас здесь)" : " (you are here)") : ""}</li>
          {info.alts.map((a) => (
            <li key={a.addr} className="flex items-center gap-2">
              <span>{ru ? "Привязан" : "Linked"}: <span className="font-mono">{short(a.addr)}</span>{info.current === a.addr ? (ru ? " (вы сейчас здесь)" : " (you are here)") : ""}</span>
              <button type="button" disabled={busy} className="underline opacity-80" onClick={() => void drop(a.addr)}>{ru ? "отвязать" : "unlink"}</button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" disabled={busy || !info} className="btn btn-ghost !py-2" onClick={() => void start()}>
        ➕ {busy ? (ru ? "Привязываем…" : "Linking…") : (ru ? "Привязать другой вход" : "Link another login")}
      </button>
      {note && <p className="text-xs" role="status">{note}</p>}
      <div className="text-xs opacity-80 space-y-1">
        <p>{ru ? "Один профиль можно открывать разными способами: почтой, Google или крипто-кошельком. Привяжите второй способ, и друзья, сообщения и объявления будут одинаковыми при любом входе." : "One profile can be opened in different ways: email, Google or a crypto wallet. Link a second way and your friends, messages and ads will be the same whichever way you sign in."}</p>
        <p>{ru ? "Как привязать: 1) нажмите «Привязать другой вход»; 2) подключите второй способ (почта, Google или кошелёк) и подтвердите вход; 3) профиль привяжется сам, страница обновится." : "How to link: 1) tap “Link another login”; 2) connect the second way (email, Google or a wallet) and confirm; 3) the profile links itself and the page reloads."}</p>
        <p>{ru ? "Важно: привязать можно только вход, у которого ещё нет своего профиля с данными (ника, постов, друзей, сообщений, объявлений). Два заполненных профиля не объединяются, чтобы ничего не потерялось. Ставки и игры на деньги остаются на подключённом кошельке." : "Important: you can only link a login that has no profile data yet (nickname, posts, friends, messages, ads). Two filled profiles are not merged, so nothing is lost. Bets and money games stay on the connected wallet."}</p>
      </div>
    </section>
  );
}

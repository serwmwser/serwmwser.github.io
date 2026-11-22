"use client";
import { useEffect, useState } from "react";
import { useActiveWallet, useConnectModal } from "thirdweb/react";
import { chain, client } from "@/lib/config";
import { useApp } from "@/lib/ctx";
import { AUTO_OFF, errText, useSocial } from "@/lib/social";
import { emailWallets, wallets } from "./Header";
import { useAuthLog } from "@/lib/authlog";
import { needsTap } from "@/lib/signmode";
import WalletBrowserLinks from "./WalletBrowserLinks";

/** Единый блок входа: одна белая кнопка.
 *  Кошелёк не подключён: «Подключить кошелёк». После подключения вход (бесплатная подпись) идёт автоматически;
 *  на телефоне вне браузера кошелька Android открывает кошелёк только по нажатию, поэтому та же кнопка меняется на «Войти».
 *  Когда вход выполнен, блок скрыт. */
export default function LoginPrompt({ text }: { text?: string }) {
  const { lang, dark, toast } = useApp();
  const { addr, token, busy, signIn } = useSocial();
  const { connect } = useConnectModal();
  const wallet = useActiveWallet();
  const log = useAuthLog();
  const ru = lang === "ru";
  const tap = needsTap(wallet?.id);
  const [slow, setSlow] = useState(false); // вход не завершился за 20 с
  const [off, setOff] = useState(false); // подпись отклонена или автоматический вход остановлен
  const [injected, setInjected] = useState(false); // есть расширение или браузер кошелька
  useEffect(() => { setInjected(!!(window as unknown as { ethereum?: unknown }).ethereum); }, []);
  const primaryEmail = !injected; // без кошелька в браузере (телефон, приложение) главная кнопка: почта или Google

  useEffect(() => {
    if (!addr || token) { setSlow(false); setOff(false); return; }
    try { setOff(!!sessionStorage.getItem(AUTO_OFF)); } catch { /* без хранилища */ }
    const t = setTimeout(() => setSlow(true), 20000);
    return () => clearTimeout(t);
  }, [addr, token]);

  if (token) return null;

  const click = async (list: typeof wallets = wallets) => {
    if (!addr) {
      try { await connect({ client, chain, wallets: list, theme: dark ? "dark" : "light", size: "compact", title: "HiMeet" }); } catch { /* окно закрыли */ }
      return;
    }
    try { await signIn(); } catch (e) { toast(errText(e, ru), "err"); }
  };

  const showButton = !addr || tap || slow || off;
  const label = !addr
    ? (ru ? "Подключить кошелёк" : "Connect wallet")
    : busy
      ? (ru ? "Ждём подпись в кошельке…" : "Waiting for your signature…")
      : tap || off || slow
        ? (ru ? "Войти" : "Sign in")
        : "";

  return (
    <section className="card space-y-3 text-center">
      {text && <p className="text-sm">{text}</p>}
      {addr && !showButton && <p className="text-sm opacity-80">{ru ? "Подтвердите вход в кошельке (подпись бесплатна)…" : "Confirm sign-in in your wallet (the signature is free)…"}</p>}
      {addr && showButton && (tap || off) && !busy && (
        <p className="text-sm opacity-80">{ru ? "Нажмите «Войти»: откроется кошелёк. Подтвердите там бесплатную подпись и вернитесь на сайт." : "Press “Sign in”: your wallet will open. Confirm the free signature there and come back."}</p>
      )}
      {showButton && !addr && (
        <div className="flex flex-col items-center gap-2">
          <button type="button" onClick={() => void click(primaryEmail ? emailWallets : wallets)}
            className="rounded-2xl bg-white px-6 py-3 text-base font-semibold text-black shadow">
            {primaryEmail ? (ru ? "Войти через почту или Google" : "Sign in with email or Google") : (ru ? "Подключить кошелёк" : "Connect wallet")}
          </button>
          <button type="button" className="text-sm underline opacity-90" onClick={() => void click(primaryEmail ? wallets : emailWallets)}>
            {primaryEmail ? (ru ? "У меня есть крипто-кошелёк" : "I have a crypto wallet") : (ru ? "Войти через почту или Google" : "Sign in with email or Google")}
          </button>
          <p className="text-xs opacity-70 max-w-xs">{ru ? "Почта или Google: без кошелька и установки, вход в одно касание. Позже профиль можно привязать к кошельку." : "Email or Google: no wallet or install needed, one-tap sign-in. You can link the profile to a wallet later."}</p>
        </div>
      )}
      {showButton && addr && (
        <button type="button" disabled={busy} onClick={() => void click()}
          className="rounded-2xl bg-white px-6 py-3 text-base font-semibold text-black shadow disabled:opacity-60">
          {label}
        </button>
      )}
      {!addr && <p className="text-xs opacity-70">{ru ? "При входе кошелёк попросит подтвердить два действия: 1) подключение к сайту, 2) подпись входа. Подпись бесплатна, деньги не списываются." : "When you sign in, your wallet will ask you to confirm two things: 1) connecting to the site, 2) the sign-in signature. The signature is free and no money is spent."}</p>}
      {addr && slow && log.length > 0 && <pre className="text-left text-[11px] leading-4 opacity-60 whitespace-pre-wrap">{log.slice(-8).join("\n")}</pre>}
      {slow && <WalletBrowserLinks />}
    </section>
  );
}

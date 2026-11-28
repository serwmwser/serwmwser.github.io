"use client";
import { ConnectButton } from "thirdweb/react";
import { createWallet, inAppWallet } from "thirdweb/wallets";
import { chain, client } from "@/lib/config";
import { useApp } from "@/lib/ctx";
import { LANGS, Lang } from "@/lib/i18n";
import MusicToggle from "./MusicToggle";
import { inTelegram } from "@/lib/telegram";

const allWallets = [
  inAppWallet({ auth: { options: ["email", "google", "apple", "telegram", "passkey"] } }),
  createWallet("io.metamask"),
  createWallet("com.coinbase.wallet"),
  createWallet("com.trustwallet.app"),
  createWallet("walletConnect"),
];

export const emailWallets = [allWallets[0]];
export const wallets = inTelegram() ? [inAppWallet({ auth: { options: ["email"] } })] : allWallets;

export default function Header() {
  const { lang, setLang, dark, toggleDark } = useApp();
  const ru = lang === "ru";

  return (
    <header className="hm-header sticky top-0 z-40">
      <div className="hm-header-inner mx-auto flex w-full max-w-6xl items-center gap-2 px-3 py-3 sm:gap-4 sm:px-5">
        <a href="/" className="hm-brand me-auto flex min-w-0 items-center gap-3" aria-label="HiMeet home">
          <span className="hm-brand-mark" aria-hidden="true">H</span>
          <span className="min-w-0">
            <span className="block text-lg font-black leading-tight tracking-tight">HiMeet</span>
            <span className="hidden max-w-[18rem] truncate text-[11px] font-medium sm:block">
              {ru ? "Ваше пространство для общения и сообществ" : "Your space for people and communities"}
            </span>
          </span>
        </a>

        <select
          aria-label={ru ? "Язык сайта" : "Website language"}
          value={lang}
          onChange={(e) => setLang(e.target.value as Lang)}
          className="hm-control max-w-[105px] sm:max-w-[135px]"
        >
          {Object.entries(LANGS).map(([k, v]) => (
            <option key={k} value={k} className="text-slate-900">{v}</option>
          ))}
        </select>

        <button
          type="button"
          onClick={toggleDark}
          aria-label={ru ? "Переключить тему" : "Toggle theme"}
          title={ru ? "Переключить тему" : "Toggle theme"}
          className="hm-icon-button"
        >
          {dark ? "☀" : "☾"}
        </button>

        <span className="hidden min-[440px]:block">
          <MusicToggle />
        </span>

        <ConnectButton
          client={client}
          chain={chain}
          wallets={wallets}
          autoConnect={{ timeout: 5000 }}
          theme={dark ? "dark" : "light"}
          connectButton={{
            style: {
              borderRadius: 13,
              height: 42,
              minWidth: 0,
              padding: "0 15px",
              fontSize: 13,
              fontWeight: 700,
            },
          }}
          detailsButton={{
            style: {
              borderRadius: 13,
              height: 42,
              minWidth: 0,
              padding: "0 12px",
              fontSize: 13,
            },
          }}
          connectModal={{ size: "compact", title: "HiMeet" }}
        />
      </div>
    </header>
  );
}

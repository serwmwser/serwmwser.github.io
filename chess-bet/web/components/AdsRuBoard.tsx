"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import LoginPrompt from "./LoginPrompt";
import { useApp } from "@/lib/ctx";
import { useSocial } from "@/lib/social";
import { ROUTES } from "@/lib/urls";
import { ADS_RU_SSO, ADS_RU_URL, adsRuPass } from "@/lib/adsru";

/** Российская доска объявлений внутри раздела «Объявления». С единым входом: вошли в HiMeet, значит вошли и на доске. */
export default function AdsRuBoard() {
  const { lang, toast } = useApp();
  const { token, me } = useSocial();
  const ru = lang === "ru";
  const [loaded, setLoaded] = useState(false);
  const [src, setSrc] = useState(ADS_RU_SSO ? "" : ADS_RU_URL);
  const [fail, setFail] = useState(false);

  useEffect(() => {
    if (!ADS_RU_SSO || !token || !me) return;
    let alive = true;
    setFail(false);
    adsRuPass(token).then((t) => { if (alive) setSrc(`${ADS_RU_URL}/sso?t=${encodeURIComponent(t)}`); }).catch(() => { if (alive) setFail(true); });
    return () => { alive = false; };
  }, [token, me]);

  const [opening, setOpening] = useState(false);
  const canOpen = !ADS_RU_SSO || (!!token && !!me);

  /** Открыть доску в новой вкладке: пропуск одноразовый, поэтому для вкладки берём свежий */
  async function openSite() {
    if (opening) return;
    if (!ADS_RU_SSO) { window.open(ADS_RU_URL, "_blank", "noopener"); return; }
    if (!token) return;
    setOpening(true);
    const w = window.open("", "_blank"); // окно открываем сразу, чтобы браузер его не заблокировал
    try {
      const t = await adsRuPass(token);
      const url = `${ADS_RU_URL}/sso?t=${encodeURIComponent(t)}`;
      if (w) { w.opener = null; w.location.href = url; } else window.location.assign(url);
    } catch {
      if (w) w.close();
      toast(ru ? "Не удалось открыть сайт. Попробуйте ещё раз" : "Could not open the site. Please try again", "err");
    } finally {
      setOpening(false);
    }
  }

  const head = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-extrabold">🇷🇺 {ru ? "Доска объявлений России" : "Classifieds board of Russia"}</h2>
        {canOpen && (
          <button type="button" onClick={openSite} disabled={opening} className="btn btn-primary !px-5 !py-2 text-sm font-bold">
            {opening ? (ru ? "Открываем…" : "Opening…") : (ru ? "Открыть сайт ↗" : "Open site ↗")}
          </button>
        )}
      </div>
      <p className="text-xs opacity-70">{ru ? "Объявления для России. Вход общий с HiMeet: отдельная регистрация и SMS не нужны. Мировая доска с оплатой в USDC находится на вкладке «Объявления»." : "Classifieds for Russia. Single sign-in with HiMeet: no separate sign-up or SMS. The worldwide board with USDC payments is on the “Ads” tab."}</p>
    </>
  );

  // Единый вход включён: нужен профиль HiMeet
  if (ADS_RU_SSO && !token) {
    return (
      <section className="space-y-3" aria-label={ru ? "Доска объявлений России" : "Russian classifieds board"}>
        {head}
        <div className="card space-y-3 text-center">
          <div className="text-3xl" aria-hidden>🇷🇺</div>
          <h3 className="font-bold">{ru ? "Создайте профиль на HiMeet" : "Create a HiMeet profile"}</h3>
          <p className="text-sm opacity-80">{ru ? "Чтобы смотреть и подавать объявления на российской доске, войдите в HiMeet или создайте профиль: это бесплатно, без телефона и SMS." : "To browse and post ads on the Russian board, sign in to HiMeet or create a profile: it is free, no phone or SMS."}</p>
          <LoginPrompt text={ru ? "Подключите кошелёк (подпись бесплатна), затем создайте профиль с ником." : "Connect your wallet (the signature is free), then create a profile with a nickname."} />
        </div>
      </section>
    );
  }
  if (ADS_RU_SSO && !me) {
    return (
      <section className="space-y-3">
        {head}
        <div className="card space-y-2 text-center">
          <h3 className="font-bold">{ru ? "Осталось создать профиль" : "One step left: create a profile"}</h3>
          <p className="text-sm opacity-80">{ru ? "Нужен ник, он будет и на российской доске." : "You need a nickname; it will also be used on the Russian board."}</p>
          <Link href={ROUTES.profile} className="btn btn-primary inline-block">{ru ? "Создать профиль" : "Create profile"}</Link>
        </div>
      </section>
    );
  }
  if (ADS_RU_SSO && fail) {
    return (
      <section className="space-y-3">
        {head}
        <div className="card text-center text-sm">{ru ? "Не удалось войти на российскую доску. Обновите страницу или попробуйте позже." : "Could not sign in to the Russian board. Reload the page or try again later."}</div>
      </section>
    );
  }

  return (
    <section className="space-y-2" aria-label={ru ? "Доска объявлений России" : "Russian classifieds board"}>
      {head}
      <div className="relative overflow-hidden rounded-2xl border border-black/10 dark:border-white/15 bg-white">
        {!loaded && <div className="absolute inset-0 grid place-items-center text-sm opacity-60">{ru ? "Загрузка доски…" : "Loading the board…"}</div>}
        {src && (
          <iframe src={src} title={ru ? "Доска объявлений России" : "Russian classifieds board"} onLoad={() => setLoaded(true)}
            className="block w-full" style={{ height: "85vh", minHeight: 560, border: 0 }} referrerPolicy="strict-origin-when-cross-origin" allow="clipboard-write" />
        )}
      </div>
      <p className="text-xs opacity-60">{ru ? "Если окно не загрузилось, нажмите «Открыть сайт»." : "If the window does not load, press “Open site”."}</p>
    </section>
  );
}

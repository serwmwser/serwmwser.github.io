"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useApp } from "@/lib/ctx";
import { usePageTranslate } from "@/lib/pageTranslate";
import { useActiveAccount } from "thirdweb/react";
import { useSocial } from "@/lib/social";
import { captureRef, getRef, registerRef } from "@/lib/ref";
import { ROUTES } from "@/lib/urls";
import { inviteTarget, loadGuest, readInvite, type InviteInfo } from "@/lib/invite-link";
import { guestClaim, guestInviter } from "@/lib/guest-api";
import { readFunnel, track, type FunnelData } from "@/lib/funnel";
import GuestChat from "@/components/GuestChat";
import FunnelFeatures from "@/components/FunnelFeatures";
import FunnelSignup from "@/components/FunnelSignup";

/** HiMeet invite: страница /i/?u=ник (или старая /i/?ref=0x…). Это воронка: человек сразу пишет пригласившему без регистрации,
 *  пробует функции приложения и создаёт профиль. После входа гостевая переписка переносится в личные сообщения профиля.
 *  Работает и без сети: сообщения ждут в очереди, переписка читается из кэша. */
export default function InvitePage() {
  const { lang } = useApp();
  const { token } = useSocial();
  const account = useActiveAccount();
  const ru = lang === "ru";
  const mainRef = useRef<HTMLElement>(null);
  const pt = usePageTranslate(mainRef, lang); // язык посетителя определяется автоматически, страница переводится
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [inviter, setInviter] = useState("");
  const [missing, setMissing] = useState(false);
  const [online, setOnline] = useState(true);
  const [sent, setSent] = useState(0);
  const [fd, setFd] = useState<FunnelData>({ events: {}, features: [], count: {} });
  const [moved, setMoved] = useState<{ n: number; name: string } | null>(null);

  useEffect(() => {
    captureRef(); // старая ссылка с ?ref=: первый пригласивший запоминается навсегда
    const i = readInvite(location.search);
    setInfo(i);
    setFd(track("open"));
    if (i.user) {
      // короткая ссылка: по нику узнаём адрес для реферальной привязки; нет сети — не страшно, чат всё равно откроется
      guestInviter(i.user)
        .then((r) => {
          if (r.name) setInviter(r.name);
          try { if (!getRef() && r.addr) localStorage.setItem("cb_ref", r.addr.toLowerCase()); } catch { /* без хранилища */ }
        })
        .catch((e) => { if ((e as Error).message === "no_inviter") setMissing(true); });
    }
    const upd = () => setOnline(navigator.onLine);
    upd();
    window.addEventListener("online", upd);
    window.addEventListener("offline", upd);
    return () => { window.removeEventListener("online", upd); window.removeEventListener("offline", upd); };
  }, []);

  // после входа: привязываем нового пользователя к пригласившему (одна ссылка = чат и реферальная программа); повтор безопасен
  useEffect(() => { if (account) void registerRef(account as never); }, [account, inviter]);

  // после входа: переносим гостевую переписку в личные сообщения (один раз для этой ссылки)
  useEffect(() => {
    if (!token || !info) return;
    const target = inviteTarget(info);
    if (!target) return;
    const key = `hm_claimed_${target}`;
    try { if (localStorage.getItem(key)) return; } catch { /* без хранилища: попробуем один раз за визит */ }
    const g = loadGuest(target).id;
    if (!g) return;
    let stop = false;
    guestClaim(token, g, target)
      .then((r) => {
        try { localStorage.setItem(key, "1"); } catch { /* без хранилища */ }
        if (!stop && r.moved > 0) setMoved({ n: r.moved, name: r.name });
      })
      .catch((e) => {
        // «это ваша ссылка» или «переписки нет» — повторять не нужно; сеть и лимит — попробуем в следующий раз
        const c = (e as Error).message;
        if (c === "self" || c === "no_thread" || c === "guest" || c === "no_inviter") {
          try { localStorage.setItem(key, "1"); } catch { /* без хранилища */ }
        }
      });
    return () => { stop = true; };
  }, [token, info]);

  const onActivity = useCallback((total: number, fresh: boolean) => {
    setSent(total);
    setFd(fresh ? track("message") : readFunnel());
  }, []);
  const refresh = useCallback(() => setFd(readFunnel()), []);
  const onPick = useCallback((id: string) => setFd(track("feature", id)), []);

  const who = inviter || info?.name || (ru ? "Ваш друг" : "Your friend");
  const steps = ru ? ["Напишите", "Попробуйте", "Создайте профиль"] : ["Write", "Explore", "Sign up"];
  const done = [sent > 0, fd.features.length > 0, !!fd.events.signup_click || !!token];
  const current = done.findIndex((d) => !d);

  return (
    <main ref={mainRef} className="mx-auto max-w-xl px-3 pt-3 pb-28 space-y-3">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-lg font-extrabold" style={{ color: "#d4a017" }} aria-label="HiMeet">HiMeet</Link>
        <span className="flex items-center gap-2">
          <span className="text-xs opacity-70">{ru ? "чат с автопереводом" : "chat with auto-translation"}</span>
          {pt.target && (
            <button type="button" data-notr translate="no" className="chip" onClick={pt.toggle} aria-pressed={pt.on} aria-label="Language">
              🌐 {pt.on ? pt.name : "English"}{pt.busy ? " …" : ""}
            </button>
          )}
        </span>
      </header>

      {!online && (
        <p className="card text-xs text-center" role="status" style={{ background: "rgba(212,160,23,.15)" }}>
          {ru ? "Нет сети. Сообщения сохранятся и отправятся сами, когда интернет вернётся." : "You are offline. Messages are saved and will be sent automatically when the connection returns."}
        </p>
      )}

      {moved && (
        <div className="card text-center space-y-2" role="status" style={{ background: "rgba(52,168,83,.15)" }}>
          <p className="font-bold">
            {ru ? `Профиль создан. Переписка с ${moved.name || who} сохранена в ваших сообщениях.` : `Profile created. Your chat with ${moved.name || who} is saved in your messages.`}
          </p>
          <Link href={ROUTES.messages} className="btn btn-primary">{ru ? "Открыть сообщения" : "Open messages"}</Link>
        </div>
      )}

      {missing ? (
        <div className="card text-center space-y-2" role="alert">
          <p>{ru ? "Приглашение не найдено. Проверьте ссылку или попросите друга прислать её ещё раз." : "Invitation not found. Check the link or ask your friend to send it again."}</p>
          <Link href="/" className="btn btn-primary">{ru ? "На главную" : "Home"}</Link>
        </div>
      ) : (
        <>
          <section className="card space-y-2 text-center" style={{ background: "linear-gradient(135deg,rgba(255,143,177,.18),rgba(139,77,255,.18))" }}>
            <h1 className="text-xl font-extrabold leading-tight">
              {ru ? `${who} приглашает вас в HiMeet` : `${who} invites you to HiMeet`}
            </h1>
            <p className="text-sm opacity-85">
              {ru ? "Общайтесь на своём языке: переводим сообщения сразу. Ничего устанавливать не нужно." : "Chat in your own language: messages are translated instantly. Nothing to install."}
            </p>
            <ul className="flex flex-wrap justify-center gap-1.5 text-xs">
              {(ru ? ["Без регистрации", "Автоперевод", "Голос и фото", "Сообщения не пропадают без сети"] : ["No sign-up", "Auto-translation", "Voice and photos", "Messages are kept offline"]).map((t) => (
                <li key={t} className="rounded-full px-2.5 py-1" style={{ background: "rgba(255,255,255,.55)", color: "#3b2a66" }}>✓ {t}</li>
              ))}
            </ul>
          </section>

          <ol className="grid grid-cols-3 gap-1.5 text-center text-xs" aria-label={ru ? "Шаги" : "Steps"}>
            {steps.map((s, i) => (
              <li
                key={s}
                aria-current={i === current ? "step" : undefined}
                className="rounded-xl px-1.5 py-2 font-bold"
                style={{ background: done[i] ? "rgba(52,168,83,.18)" : i === current ? "rgba(255,143,177,.28)" : "rgba(139,77,255,.08)", opacity: done[i] || i === current ? 1 : 0.7 }}
              >
                <span aria-hidden="true">{done[i] ? "✓" : i + 1}</span> {s}
              </li>
            ))}
          </ol>

          {info ? (
            <GuestChat info={info} onActivity={onActivity} />
          ) : (
            <div className="card text-center text-sm opacity-70" role="status">{ru ? "Открываем приглашение…" : "Opening your invitation…"}</div>
          )}

          {!token && <FunnelSignup sent={sent} who={who} onSignup={refresh} />}
          <section className="card text-center space-y-2">
            <h2 className="text-base font-bold">{ru ? "💰 Приглашайте друзей и зарабатывайте" : "💰 Invite friends and earn"}</h2>
            <p className="text-sm opacity-85">{ru ? "Ваша ссылка приглашения работает и как реферальная: доля комиссии с шахмат и баллы TCH за действия друзей." : "Your invite link is also a referral link: a share of the chess fee and TCH points for your friends' activity."}</p>
            <a href={ROUTES.home + "?tab=earn"} className="btn btn-primary">{ru ? "Открыть «Заработок»" : "Open Earn"}</a>
          </section>
          <FunnelFeatures tried={fd.features} onPick={onPick} />

          <footer className="text-center text-xs opacity-70 space-x-3 pt-1">
            <Link href={ROUTES.about}>{ru ? "О нас" : "About"}</Link>
            <Link href={ROUTES.faq}>FAQ</Link>
            <Link href={ROUTES.terms}>{ru ? "Условия" : "Terms"}</Link>
          </footer>
        </>
      )}
    </main>
  );
}

"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "@/lib/ctx";
import { captureRef, getRef } from "@/lib/ref";
import { readInvite, type InviteInfo } from "@/lib/invite-link";
import { guestInviter } from "@/lib/guest-api";
import GuestChat from "@/components/GuestChat";

/** HiMeet invite: страница /i/?u=ник (или старая /i/?ref=0x…). Без установки и регистрации сразу открывает диалог с пригласившим.
 *  Работает и без сети: сообщения ждут в очереди, переписка читается из кэша браузера. */
export default function InvitePage() {
  const { lang } = useApp();
  const ru = lang === "ru";
  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [missing, setMissing] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    captureRef(); // старая ссылка с ?ref=: первый пригласивший запоминается навсегда
    const i = readInvite(location.search);
    setInfo(i);
    if (i.user) {
      // короткая ссылка: по нику узнаём адрес для реферальной привязки; нет сети — не страшно, чат всё равно откроется
      guestInviter(i.user)
        .then((r) => { try { if (!getRef() && r.addr) localStorage.setItem("cb_ref", r.addr.toLowerCase()); } catch { /* без хранилища */ } })
        .catch((e) => { if ((e as Error).message === "no_inviter") setMissing(true); });
    }
    const upd = () => setOnline(navigator.onLine);
    upd();
    window.addEventListener("online", upd);
    window.addEventListener("offline", upd);
    return () => { window.removeEventListener("online", upd); window.removeEventListener("offline", upd); };
  }, []);

  return (
    <main className="mx-auto max-w-xl px-3 pt-3 pb-10 space-y-3">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-lg font-extrabold" style={{ color: "#d4a017" }} aria-label="HiMeet">HiMeet</Link>
        <span className="text-xs opacity-70">{ru ? "чат с автопереводом" : "chat with auto-translation"}</span>
      </header>
      {!online && (
        <p className="card text-xs text-center" role="status" style={{ background: "rgba(212,160,23,.15)" }}>
          {ru ? "Нет сети. Сообщения сохранятся и отправятся сами, когда интернет вернётся." : "You are offline. Messages are saved and will be sent automatically when the connection returns."}
        </p>
      )}
      {missing ? (
        <div className="card text-center space-y-2" role="alert">
          <p>{ru ? "Приглашение не найдено. Проверьте ссылку или попросите друга прислать её ещё раз." : "Invitation not found. Check the link or ask your friend to send it again."}</p>
          <Link href="/" className="btn btn-primary">{ru ? "На главную" : "Home"}</Link>
        </div>
      ) : info ? (
        <GuestChat info={info} />
      ) : (
        <div className="card text-center text-sm opacity-70" role="status">{ru ? "Открываем приглашение…" : "Opening your invitation…"}</div>
      )}
    </main>
  );
}

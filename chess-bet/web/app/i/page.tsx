"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "@/lib/ctx";
import { captureRef } from "@/lib/ref";
import { readInvite, type InviteInfo } from "@/lib/invite-link";
import GuestChat from "@/components/GuestChat";

/** HiMeet invite: страница /i/?ref=0x…&n=Имя&m=Сообщение. Без установки и регистрации сразу открывает диалог с пригласившим. */
export default function InvitePage() {
  const { lang } = useApp();
  const ru = lang === "ru";
  const [info, setInfo] = useState<InviteInfo | null>(null);

  useEffect(() => {
    captureRef(); // первый пригласивший запоминается навсегда
    setInfo(readInvite(location.search));
  }, []);

  return (
    <main className="mx-auto max-w-xl px-3 pt-3 pb-10 space-y-3">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-lg font-extrabold" style={{ color: "#d4a017" }} aria-label="HiMeet">HiMeet</Link>
        <span className="text-xs opacity-70">{ru ? "чат с автопереводом" : "chat with auto-translation"}</span>
      </header>
      {info ? (
        <GuestChat info={info} />
      ) : (
        <div className="card text-center text-sm opacity-70" role="status">{ru ? "Открываем приглашение…" : "Opening your invitation…"}</div>
      )}
    </main>
  );
}

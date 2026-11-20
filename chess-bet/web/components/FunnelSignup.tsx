"use client";
import { useState } from "react";
import { useApp } from "@/lib/ctx";
import { SIGNUP_AFTER, track } from "@/lib/funnel";
import TrustScreen from "./TrustScreen";

/** Регистрация на странице приглашения: закреплённая внизу кнопка «Создать профиль» и, после нескольких сообщений гостя,
 *  карточка с тем, что даёт профиль. Вход идёт через окно TrustScreen (Google, Telegram, почта). */
export default function FunnelSignup({ sent, who, onSignup }: { sent: number; who: string; onSignup: () => void }) {
  const { lang } = useApp();
  const ru = lang === "ru";
  const [open, setOpen] = useState(false);
  const go = () => { track("signup_click"); onSignup(); setOpen(true); };

  const perks = ru
    ? [
        `Переписка с ${who} сохранится в вашем профиле`,
        "Звонки: голосом и видео",
        "Сообщений без дневного лимита гостя",
        "Голосовые до 2 минут и фото, PDF",
        "Друзья, знакомства, турниры и шахматы",
      ]
    : [
        `Your chat with ${who} is saved in your profile`,
        "Voice and video calls",
        "No guest daily message limit",
        "Voice messages up to 2 minutes, photos and PDF",
        "Friends, dating, tournaments and chess",
      ];

  return (
    <>
      {sent >= SIGNUP_AFTER && (
        <section className="card space-y-2" style={{ border: "2px solid #ff8fb1" }} aria-label={ru ? "Создайте профиль" : "Create your profile"}>
          <h2 className="text-lg font-extrabold">{ru ? "Вам нравится? Создайте профиль" : "Enjoying it? Create your profile"}</h2>
          <ul className="text-sm space-y-1">
            {perks.map((p) => (
              <li key={p} className="flex gap-2"><span aria-hidden="true">✓</span><span>{p}</span></li>
            ))}
          </ul>
          <button type="button" className="btn btn-primary w-full" onClick={go}>{ru ? "Создать профиль за 30 секунд" : "Create a profile in 30 seconds"}</button>
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 pt-2 pointer-events-none">
        <div className="mx-auto max-w-xl pointer-events-auto card !p-2 flex items-center gap-2 shadow-lg">
          <span className="text-xs opacity-80 flex-1 min-w-0 leading-snug">
            {ru ? "Хотите звонки и историю переписки? Профиль создаётся за 30 секунд." : "Want calls and chat history? A profile takes 30 seconds."}
          </span>
          <button type="button" className="btn btn-primary shrink-0 !py-1.5 !px-4" onClick={go}>{ru ? "Создать профиль" : "Sign up"}</button>
        </div>
      </div>

      {open && <TrustScreen name={who} reason="save" onClose={() => setOpen(false)} />}
    </>
  );
}

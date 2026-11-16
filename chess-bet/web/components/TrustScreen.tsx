"use client";
import { useEffect } from "react";
import { useConnectModal } from "thirdweb/react";
import { chain, client } from "@/lib/config";
import { useApp } from "@/lib/ctx";

/** HiMeet invite: честный экран «зачем войти». reason: save = сохранить переписку, call = позвонить.
 *  Отказ равноправен по размеру и заметности, без заранее поставленных галочек и повторных окон. */
export default function TrustScreen({ name, reason = "save", onClose }: { name: string; reason?: "save" | "call"; onClose: () => void }) {
  const { lang, dark } = useApp();
  const { connect } = useConnectModal();
  const ru = lang === "ru";

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const login = async () => {
    onClose();
    try {
      const { wallets } = await import("./Header"); // тяжёлый код входа грузим только по нажатию
      await connect({ client, chain, wallets, theme: dark ? "dark" : "light", size: "compact", title: "HiMeet" });
    } catch { /* окно закрыли */ }
  };

  const call = reason === "call";
  const title = call
    ? (ru ? `Позвонить: ${name}` : `Call ${name}`)
    : (ru ? "Сохранить переписку" : "Save your chat");
  const points = ru
    ? [
        call ? "Звонки в HiMeet бесплатные. Для них нужен вход, чтобы собеседник знал, кто звонит." : `Переписка с ${name} сохранится и будет на всех ваших устройствах.`,
        "Вход занимает меньше минуты: почта или Google, без кошелька и паролей.",
        "Можно продолжить без входа: гостевой режим останется, а переписка будет храниться в этом браузере.",
      ]
    : [
        call ? "Calls on HiMeet are free. Sign-in is needed so the other person knows who is calling." : `Your chat with ${name} will be saved on all your devices.`,
        "Signing in takes under a minute: email or Google, no wallet or passwords.",
        "You can continue without signing in: guest mode stays and the chat is kept in this browser.",
      ];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: "rgba(60,20,80,.45)" }} role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="card w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-center space-y-1">
          <div className="text-4xl" aria-hidden="true">{call ? "📞" : "💬"}</div>
          <h2 className="text-xl font-extrabold">{title}</h2>
          <p className="text-sm opacity-80">{ru ? "Зачем это нужно:" : "Why this is needed:"}</p>
        </div>
        <ol className="space-y-1.5 text-sm">
          {points.map((p, i) => (
            <li key={i} className="flex gap-2"><b className="shrink-0">{i + 1}.</b><span>{p}</span></li>
          ))}
        </ol>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button type="button" className="btn btn-primary w-full justify-center" onClick={login}>{ru ? "Войти" : "Sign in"}</button>
          <button type="button" className="btn btn-ghost w-full justify-center" onClick={onClose}>{ru ? "Продолжить без входа" : "Continue without signing in"}</button>
        </div>
      </div>
    </div>
  );
}

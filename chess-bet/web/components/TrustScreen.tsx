"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useConnectModal } from "thirdweb/react";
import { chain, client } from "@/lib/config";
import { useApp } from "@/lib/ctx";

/** HiMeet invite: честный экран «зачем войти». reason: save = сохранить переписку, call = позвонить.
 *  Отказ равноправен по размеру и заметности, без заранее поставленных галочек и повторных окон.
 *  Окно выводится прямо в body (иначе размытие фона у карточки чата «зажимает» его внутри карточки),
 *  длинный текст прокручивается, а кнопки всегда видны внизу. */
export default function TrustScreen({ name, reason = "save", onClose }: { name: string; reason?: "save" | "call"; onClose: () => void }) {
  const { lang, dark } = useApp();
  const { connect } = useConnectModal();
  const ru = lang === "ru";
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  // пока окно открыто, страница под ним не прокручивается
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

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

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-3" style={{ background: "rgba(60,20,80,.45)" }} role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="card w-full max-w-md flex flex-col overflow-hidden !p-0" style={{ maxHeight: "calc(100dvh - 24px)" }} onClick={(e) => e.stopPropagation()}>
        <div className="overflow-y-auto p-4 space-y-3">
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
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 border-t border-black/10 shrink-0">
          <button type="button" className="btn btn-primary w-full justify-center" onClick={login}>{ru ? "Войти" : "Sign in"}</button>
          <button type="button" className="btn btn-ghost w-full justify-center" onClick={onClose}>{ru ? "Продолжить без входа" : "Continue without signing in"}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

"use client";
import { useApp } from "@/lib/ctx";
import { FEATURES } from "@/lib/funnel";

/** Блок «Попробуйте HiMeet» на странице приглашения: краткое описание приложения и кнопки всех функций.
 *  Каждая кнопка ведёт на настоящую страницу и открывается в новой вкладке, чтобы гостевой чат остался открытым.
 *  tried — функции, которые гость уже открывал (получают галочку); onPick сообщает странице о нажатии. */
export default function FunnelFeatures({ tried, onPick }: { tried: string[]; onPick: (id: string) => void }) {
  const { lang } = useApp();
  const ru = lang === "ru";
  return (
    <section className="card space-y-3" aria-label={ru ? "Что есть в HiMeet" : "What is in HiMeet"}>
      <div className="space-y-1">
        <h2 className="text-lg font-extrabold">{ru ? "Попробуйте HiMeet" : "Try HiMeet"}</h2>
        <p className="text-sm opacity-80">
          {ru
            ? "HiMeet — общение без языковых границ: чат с автопереводом, шахматы, знакомства, языковой обмен и объявления в одном приложении. Нажмите любую кнопку: страница откроется в новой вкладке, а ваш чат останется здесь."
            : "HiMeet is communication without language barriers: auto-translated chat, chess, dating, language exchange and classifieds in one app. Tap any button: the page opens in a new tab and your chat stays right here."}
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-2">
        {FEATURES.map((f) => {
          const done = tried.includes(f.id);
          return (
            <li key={f.id}>
              <a
                href={f.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onPick(f.id)}
                className="block h-full rounded-2xl px-3 py-2.5 hover:opacity-90"
                style={{ background: done ? "rgba(52,168,83,.14)" : "rgba(139,77,255,.10)" }}
              >
                <span className="flex items-center gap-2">
                  <span className="text-xl" aria-hidden="true">{f.icon}</span>
                  <b className="text-sm leading-tight flex-1 min-w-0">{ru ? f.ru : f.en}</b>
                  {done && <span className="text-xs" aria-label={ru ? "Уже открывали" : "Already opened"}>✓</span>}
                </span>
                <span className="block text-xs opacity-75 mt-1 leading-snug">{ru ? f.dRu : f.dEn}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

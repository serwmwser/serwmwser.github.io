"use client";
// Баннер с таймером для владельца сообщества: сколько осталось бесплатного периода или оплаченного тарифа и кнопка оплаты.
// Состояния: бесплатный период (первые 50 создателей: 3 месяца, остальные: 14 дней), срок закончился (сообщество на паузе), оплаченный тариф скоро закончится.
import { useEffect, useState } from "react";
import PayButton from "./PayButton";
import { useApp } from "@/lib/ctx";
import { useSocial } from "@/lib/social";
import { getPricing, type CreatorSub, type Pricing } from "@/lib/communities";
import { payCreator } from "@/lib/pay";

const DAY = 86400000;
const WARN_DAYS = 7; // оплаченный тариф: напоминаем за неделю

/** Остаток времени в виде «13д 22ч 49м» */
export function leftText(ms: number, ru: boolean): string {
  const m = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  const [D, H, M] = ru ? ["д", "ч", "м"] : ["d", "h", "m"];
  if (d > 0) return `${d}${D} ${h}${H} ${mm}${M}`;
  if (h > 0) return `${h}${H} ${mm}${M}`;
  return `${mm}${M}`;
}

export default function TrialBanner({ sub, onPaid }: { sub: CreatorSub | null; onPaid?: () => void }) {
  const { lang } = useApp();
  const { token } = useSocial();
  const ru = lang === "ru";
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const [pr, setPr] = useState<Pricing | null>(null);
  const [plan, setPlan] = useState<"start" | "pro">("start");
  const [period, setPeriod] = useState<"month" | "year">("month");

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  useEffect(() => { if (open && !pr) getPricing(token).then(setPr).catch(() => { /* цены покажутся при повторном открытии */ }); }, [open, pr, token]);

  if (!sub) return null;
  const left = sub.expires - now;
  const expired = left <= 0;
  const trial = sub.source === "founder" || sub.source === "trial";
  if (!expired && !trial && left > WARN_DAYS * DAY) return null; // оплаченный тариф с запасом: баннер не нужен

  const urgent = expired || left < 3 * DAY;
  const date = new Date(sub.expires).toLocaleDateString(ru ? "ru-RU" : "en-GB", { day: "numeric", month: "long" });
  const title = expired
    ? ru ? "Срок тарифа закончился: сообщество на паузе." : "Your plan has ended: the community is paused."
    : trial
      ? ru ? `Бесплатный период заканчивается ${date}.` : `Your free period ends on ${date}.`
      : ru ? `Тариф заканчивается ${date}.` : `Your plan ends on ${date}.`;
  const note = expired
    ? ru ? "Сообщество скрыто из каталога, новые вступления и оплаты участников закрыты. Участники пока сохраняют доступ. После оплаты всё включится сразу." : "The community is hidden from the catalog and new joins and payments are closed. Current members keep access. Everything resumes right after payment."
    : trial
      ? ru ? `${sub.source === "founder" ? "Вы среди первых 50 создателей: 3 месяца бесплатно. " : ""}Зарабатывать можно уже сейчас, комиссия платформы с платежей участников удерживается и в бесплатный период. Оплатите тариф до конца срока, чтобы сообщество не встало на паузу.` : `${sub.source === "founder" ? "You are among the first 50 creators: 3 months free. " : ""}You can earn right now; the platform fee on member payments applies during the free period too. Pay before it ends so the community is not paused.`
      : ru ? "Продлите тариф, чтобы сообщество не встало на паузу." : "Renew your plan so the community is not paused.";

  const p = pr?.plans.find((x) => x.id === plan);
  const price = p ? (period === "year" ? p.year : p.month) : null;

  return (
    <section
      role="status" aria-live="polite"
      className={`rounded-2xl border px-4 py-3 space-y-2 ${urgent ? "border-red-500/50 bg-red-500/10" : "border-amber-500/50 bg-amber-400/15"}`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span aria-hidden>⏳</span>
        <p className="text-sm font-semibold">
          {title}{" "}
          {!expired && <span>{ru ? "Осталось" : "Left"}: <span className="tabular-nums">{leftText(left, ru)}</span></span>}
        </p>
        <button type="button" className="btn btn-primary !py-1.5 text-sm ms-auto" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {expired ? (ru ? "Оплатить и включить" : "Pay and resume") : ru ? "Оплатить тариф" : "Pay for a plan"}
        </button>
      </div>
      <p className="text-xs opacity-80">{note}</p>

      {open && (
        <div className="space-y-3 border-t border-black/10 dark:border-white/10 pt-3">
          {!pr ? <p className="text-sm opacity-70">…</p> : (
            <>
              <div className="grid gap-2 sm:grid-cols-2">
                {pr.plans.map((x) => (
                  <button
                    key={x.id} type="button" onClick={() => setPlan(x.id)} aria-pressed={plan === x.id}
                    className={`rounded-xl border-2 px-3 py-2 text-left text-sm ${plan === x.id ? "border-blue-500" : "border-black/15 dark:border-white/20"}`}
                  >
                    <div className="font-bold">{ru ? x.name[0] : x.name[1]} · {period === "year" ? x.year : x.month} USDC {period === "year" ? (ru ? "в год" : "/ year") : ru ? "в месяц" : "/ month"}</div>
                    <div className="text-xs opacity-70">{ru ? `Комиссия платформы с участников ${x.feePct}%` : `Platform fee on members ${x.feePct}%`}{x.affiliates ? (ru ? " · партнёрские тарифы" : " · partner plans") : ""}</div>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={`chip ${period === "month" ? "chip-on" : ""}`} onClick={() => setPeriod("month")}>{ru ? "Месяц" : "Monthly"}</button>
                <button type="button" className={`chip ${period === "year" ? "chip-on" : ""}`} onClick={() => setPeriod("year")}>{ru ? `Год (${pr.yearFreeMonths} мес. в подарок)` : `Yearly (${pr.yearFreeMonths} months free)`}</button>
                {price !== null && (
                  <PayButton
                    className="btn btn-primary ms-auto" price={price} payKey={`creator_${plan}_${period}`}
                    label={`${ru ? "Оплатить" : "Pay"} ${price} USDC`}
                    run={(tx) => payCreator(token, plan, period, tx)} onDone={() => { setOpen(false); onPaid?.(); }}
                  />
                )}
              </div>
              <p className="text-xs opacity-60">{ru ? "Оплата в USDC (сеть Polygon). Если у вас ещё остался бесплатный период, оплаченный срок добавится после него." : "Paid in USDC (Polygon network). If you still have a free period left, the paid time is added after it."}</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}

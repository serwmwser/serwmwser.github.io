"use client";
// Блок «Как купить» на странице товара: пять шагов от выбора оплаты до получения товара. Пятый шаг зависит от вида товара (файл или услуга).
import { useApp } from "@/lib/ctx";
import type { ProductKind } from "@/lib/shop";

export default function HowToBuy({ kind, className = "" }: { kind: ProductKind; className?: string }) {
  const { lang } = useApp();
  const ru = lang === "ru";
  const steps: [string, string][] = ru
    ? [
        ["Выберите способ оплаты", "СБП через ЮKassa (рубли) или USDC в сети Polygon. Регистрация не нужна."],
        ["Укажите почту", "Она нужна для связи по заказу. Мы не отправляем рекламу без вашего согласия."],
        ["Нажмите «Перейти к оплате»", "Откроется страница заказа с кодом. Сохраните ссылку на неё: по ней вы вернётесь к покупке."],
        ["Оплатите", "Через СБП откроется страница ЮKassa с QR-кодом: оплатите в приложении своего банка. Для USDC отправьте перевод и введите его хеш."],
        kind === "digital"
          ? ["Получите файл", "После подтверждения оплаты на странице заказа появится кнопка «Скачать» (PDF, до 20 скачиваний). Если страница не обновилась, подождите минуту или откройте сохранённую ссылку. Не пришло или не открывается: напишите нам с кодом заказа."]
          : ["Получите услугу", "После подтверждения оплаты на странице заказа появится инструкция, как получить услугу и что делать дальше. Сохраните ссылку на заказ. Вопросы: напишите нам с кодом заказа."],
      ]
    : [
        ["Pick a payment method", "SBP via YooKassa (rubles) or USDC on Polygon. No sign-up needed."],
        ["Enter your email", "Used for order contact only. No ads without your consent."],
        ["Press “Continue to payment”", "The order page with your code opens. Save its link to come back to the purchase."],
        ["Pay", "With SBP a YooKassa page with a QR code opens: pay in your bank app. For USDC send the transfer and enter its hash."],
        kind === "digital"
          ? ["Get your file", "Once payment is confirmed the order page shows a “Download” button (PDF, up to 20 downloads). If it has not updated, wait a minute or open your saved link. Problems: write to us with your order code."]
          : ["Get your service", "Once payment is confirmed the order page shows how to receive the service and what to do next. Save the order link. Questions: write to us with your order code."],
      ];
  return (
    <section className={`card space-y-3 ${className}`} aria-label={ru ? "Как купить" : "How to buy"}>
      <h2 className="font-bold">{ru ? "Как купить" : "How to buy"}</h2>
      <ol className="space-y-3">
        {steps.map(([t, d], i) => (
          <li key={t} className="flex gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-violet-600 text-sm font-bold text-white" aria-hidden>{i + 1}</span>
            <div className="min-w-0">
              <div className="text-sm font-semibold">{t}</div>
              <p className="text-xs opacity-80">{d}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

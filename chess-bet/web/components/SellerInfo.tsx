"use client";
// Реквизиты продавца (самозанятый): показываются в подвале всех страниц (главная, сообщества, товары) и на странице покупки.
import { useApp } from "@/lib/ctx";

export const SELLER_NAME = "Яковенко Сергей Владимирович";
export const SELLER_INN = "263508859634";

export default function SellerInfo({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  const { lang } = useApp();
  const ru = lang === "ru";
  if (compact) {
    return (
      <p className={`text-xs opacity-70 ${className}`}>
        {ru ? "Продавец: самозанятый" : "Seller: self-employed"} {SELLER_NAME}, {ru ? "ИНН" : "TIN"} {SELLER_INN}
      </p>
    );
  }
  return (
    <section className={`card space-y-1 text-sm ${className}`} aria-label={ru ? "Реквизиты продавца" : "Seller details"}>
      <h2 className="font-bold">{ru ? "Реквизиты" : "Seller details"}</h2>
      <p>{ru ? "Самозанятый" : "Self-employed"} {SELLER_NAME}</p>
      <p>{ru ? "ИНН" : "TIN"} <span className="mono">{SELLER_INN}</span></p>
      <p className="text-xs opacity-70">{ru ? "Приём платежей за товары и услуги. Чек выдаётся в приложении «Мой налог»." : "Payments for goods and services are accepted by the seller above."}</p>
    </section>
  );
}

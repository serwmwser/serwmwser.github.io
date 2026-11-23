"use client";
// Кнопка оплаты в USDC: спрашивает подтверждение, переводит деньги из кошелька, затем вызывает run(хеш перевода) для сервера.
import { useState } from "react";
import { useApp } from "@/lib/ctx";
import { payError, usePay } from "@/lib/pay";

export default function PayButton({ price, payKey, label, run, onDone, className }: {
  price: number;                          // сумма в USDC
  payKey: string;                         // уникальный ключ оплаты (чтобы не платить дважды при сбое связи)
  label: string;                          // текст на кнопке
  run: (tx: string) => Promise<unknown>;  // запрос на сервер с хешем перевода
  onDone?: () => void;                    // вызывается после успешной оплаты
  className?: string;
}) {
  const { lang, toast } = useApp();
  const ru = lang === "ru";
  const payAndCall = usePay();
  const [busy, setBusy] = useState(false);

  async function go() {
    if (busy) return;
    const ask = ru ? `Оплатить ${price} USDC (сеть Polygon)?` : `Pay ${price} USDC (Polygon network)?`;
    if (!window.confirm(ask)) return;
    setBusy(true);
    try {
      await payAndCall(payKey, price, run);
      toast(ru ? "Оплата принята" : "Payment received", "ok");
      onDone?.();
    } catch (e) {
      toast(payError(e, ru), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className={className || "btn btn-primary"} onClick={go} disabled={busy}>
      {busy ? (ru ? "Оплата…" : "Paying…") : label}
    </button>
  );
}

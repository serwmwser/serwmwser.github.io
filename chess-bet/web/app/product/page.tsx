"use client";
// Страница товара сообщества и заказа. Покупка без регистрации: почта, способ оплаты, оплата, скачивание.
// Адреса: /product/?id=5 (товар) и /product/?order=<номер> (заказ; ссылку на заказ нужно сохранить, она открывает файл).
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import SellerInfo from "@/components/SellerInfo";
import { useApp } from "@/lib/ctx";
import { BASE } from "@/lib/urls";
import { mediaSrc } from "@/lib/communities";
import {
  claimOrder, createOrder, downloadUrl, getOrder, getProduct, rememberOrder, rub, shopError, usdc, verifyOrder,
  type Order, type ProductAdmin,
} from "@/lib/shop";

const field = "w-full rounded-xl border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 text-sm";

function Copy({ text, label }: { text: string; label: string }) {
  const { lang, toast } = useApp();
  return (
    <button type="button" className="btn btn-ghost !py-1 !px-2 text-xs" aria-label={label}
      onClick={() => { navigator.clipboard?.writeText(text).then(() => toast(lang === "ru" ? "Скопировано" : "Copied", "ok")).catch(() => { /* буфер недоступен */ }); }}>
      {lang === "ru" ? "Копировать" : "Copy"}
    </button>
  );
}

function Row({ k, v, copy }: { k: string; v: string; copy?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-black/10 dark:border-white/10 py-2 text-sm first:border-0">
      <span className="opacity-70">{k}</span>
      <span className="flex items-center gap-2 font-semibold break-all text-right">{v}{copy && <Copy text={v} label={k} />}</span>
    </div>
  );
}

function OrderView({ order, onChange }: { order: Order; onChange: (o: Order) => void }) {
  const { lang, toast } = useApp();
  const ru = lang === "ru";
  const [note, setNote] = useState("");
  const [tx, setTx] = useState("");
  const [from, setFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const pay = order.pay;

  // Пока заказ не оплачен, раз в 20 секунд спрашиваем статус: подтверждение приходит от продавца
  useEffect(() => {
    if (order.status === "paid" || order.status === "rejected") return;
    const t = setInterval(() => { getOrder(order.id).then(onChange).catch(() => { /* повторим позже */ }); }, 20000);
    return () => clearInterval(t);
  }, [order.id, order.status, onChange]);

  const run = async (f: () => Promise<Order>) => {
    setBusy(true);
    try { onChange(await f()); } catch (e) { toast(shopError(e, ru), "err"); } finally { setBusy(false); }
  };

  const link = typeof window !== "undefined" ? `${window.location.origin}${BASE}/product/?order=${order.id}` : "";

  return (
    <div className="space-y-4">
      <div className="card flex items-center gap-3">
        {order.product?.image && <img src={mediaSrc(order.product.image)} alt="" className="h-16 w-16 rounded-lg object-cover" />}
        <div className="min-w-0">
          <div className="font-bold break-words">{order.product?.title}</div>
          <div className="text-xs opacity-70">{ru ? "Заказ" : "Order"} {order.code} · {order.method === "sbp" ? rub(order.amount) : usdc(order.amount)}</div>
        </div>
      </div>

      {order.status === "paid" && (
        <div className="card space-y-3 border-2 border-green-500/50">
          <h2 className="font-bold text-green-600 dark:text-green-400">{ru ? "Оплата получена. Спасибо!" : "Payment received. Thank you!"}</h2>
          {order.after && <p className="text-sm whitespace-pre-line">{order.after}</p>}
          {order.product?.kind === "digital" && (order.canDownload ? (
            <a href={downloadUrl(order.id)} className="btn btn-primary inline-block text-center">{ru ? "Скачать PDF" : "Download PDF"}</a>
          ) : (
            <p className="text-sm opacity-80">{ru ? "Лимит скачиваний исчерпан или файл недоступен. Напишите продавцу, мы сбросим лимит." : "Download limit reached or the file is unavailable. Contact the seller."}</p>
          ))}
          <p className="text-xs opacity-70">{ru ? "Сохраните эту ссылку: по ней файл можно скачать снова." : "Save this link: you can download the file again with it."}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs break-all"><span>{link}</span><Copy text={link} label={ru ? "Ссылка на заказ" : "Order link"} /></div>
        </div>
      )}

      {order.status === "rejected" && <div className="card text-sm">{ru ? "Заказ отклонён: оплата не найдена. Если вы платили, напишите продавцу с номером заказа." : "The order was rejected: no payment found. If you paid, contact the seller with the order number."}</div>}

      {(order.status === "new" || order.status === "claimed") && pay && pay.method === "sbp" && (
        <div className="card space-y-3">
          <h2 className="font-bold">{ru ? "Оплата по СБП" : "Pay via SBP"}</h2>
          <ol className="list-decimal pl-5 text-sm space-y-1 opacity-90">
            <li>{ru ? "Откройте приложение банка и выберите перевод по номеру телефона (СБП)." : "Open your bank app and choose a transfer by phone number (SBP)."}</li>
            <li>{ru ? `Переведите ровно ${rub(pay.amountRub)} на номер ниже${pay.bank ? `, банк получателя: ${pay.bank}` : ""}.` : `Send exactly ${rub(pay.amountRub)} to the number below.`}</li>
            <li>{ru ? "В комментарии к переводу укажите код заказа, если банк позволяет." : "Put the order code in the transfer comment if your bank allows."}</li>
            <li>{ru ? "Нажмите «Я оплатил». Продавец проверит поступление, обычно в течение нескольких часов." : "Press “I paid”. The seller will check the payment, usually within a few hours."}</li>
          </ol>
          <div>
            <Row k={ru ? "Номер телефона" : "Phone number"} v={pay.phone} copy />
            {pay.holder && <Row k={ru ? "Получатель" : "Recipient"} v={pay.holder} />}
            <Row k={ru ? "Сумма" : "Amount"} v={String(pay.amountRub)} copy />
            <Row k={ru ? "Код заказа" : "Order code"} v={pay.comment} copy />
          </div>
          {order.status === "new" ? (
            <div className="space-y-2">
              <label className="block text-sm">{ru ? "Имя отправителя или последние цифры карты (по желанию, поможет найти платёж)" : "Sender name or last card digits (optional)"}
                <input className={field} value={note} maxLength={60} onChange={(e) => setNote(e.target.value)} />
              </label>
              <button type="button" disabled={busy} className="btn btn-primary" onClick={() => void run(() => claimOrder(order.id, note))}>{busy ? "…" : ru ? "Я оплатил" : "I paid"}</button>
            </div>
          ) : (
            <p className="text-sm font-semibold">{ru ? "Спасибо! Ждём подтверждения от продавца. Эта страница обновится сама, можно оставить её открытой." : "Thanks! Waiting for the seller to confirm. This page updates itself."}</p>
          )}
        </div>
      )}

      {(order.status === "new" || order.status === "claimed") && pay && pay.method === "usdc" && (
        <div className="card space-y-3">
          <h2 className="font-bold">{ru ? "Оплата USDC (сеть Polygon)" : "Pay with USDC (Polygon network)"}</h2>
          <ol className="list-decimal pl-5 text-sm space-y-1 opacity-90">
            <li>{ru ? `Отправьте не меньше ${usdc(pay.amount)} на адрес ниже в сети Polygon. Другая сеть или другой токен: деньги потеряются.` : `Send at least ${usdc(pay.amount)} to the address below on the Polygon network. Another network or token will lose the funds.`}</li>
            <li>{ru ? "Скопируйте хеш перевода (0x…) и адрес кошелька, с которого платили." : "Copy the transaction hash (0x…) and the address you paid from."}</li>
            <li>{ru ? "Вставьте их ниже: сервер проверит перевод в блокчейне автоматически." : "Paste them below: the server verifies the transfer on-chain."}</li>
          </ol>
          <div>
            <Row k={ru ? "Адрес получателя" : "Recipient address"} v={pay.to} copy />
            <Row k={ru ? "Токен USDC (контракт)" : "USDC token contract"} v={pay.token} copy />
            <Row k={ru ? "Сумма" : "Amount"} v={String(pay.amount)} copy />
          </div>
          <label className="block text-sm">{ru ? "Хеш перевода" : "Transaction hash"}
            <input className={field} value={tx} onChange={(e) => setTx(e.target.value.trim())} placeholder="0x…" spellCheck={false} />
          </label>
          <label className="block text-sm">{ru ? "Адрес вашего кошелька (откуда платили)" : "Your wallet address (the sender)"}
            <input className={field} value={from} onChange={(e) => setFrom(e.target.value.trim())} placeholder="0x…" spellCheck={false} />
          </label>
          <p className="text-xs opacity-70">{ru ? "Никогда не вводите здесь seed-фразу или приватный ключ: они не нужны." : "Never enter a seed phrase or private key here: they are not needed."}</p>
          <button type="button" disabled={busy || !tx || !from} className="btn btn-primary" onClick={() => void run(() => verifyOrder(order.id, tx, from))}>{busy ? "…" : ru ? "Проверить оплату" : "Verify payment"}</button>
        </div>
      )}

      {order.status !== "paid" && (
        <p className="text-xs opacity-70 break-all">{ru ? "Ссылка на этот заказ (сохраните, чтобы вернуться):" : "Link to this order (save it to come back):"} {link}</p>
      )}
    </div>
  );
}

function View() {
  const { lang, toast } = useApp();
  const ru = lang === "ru";
  const params = useSearchParams();
  const idParam = Number(params.get("id")) || 0;
  const orderParam = params.get("order") || "";
  const [product, setProduct] = useState<ProductAdmin | null>(null);
  const [methods, setMethods] = useState<{ sbp: boolean; usdc: boolean }>({ sbp: false, usdc: false });
  const [order, setOrder] = useState<Order | null>(null);
  const [failed, setFailed] = useState(false);
  const [email, setEmail] = useState("");
  const [method, setMethod] = useState<"sbp" | "usdc">("sbp");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const loaded = useRef("");

  const load = useCallback(() => {
    setFailed(false);
    if (orderParam) {
      getOrder(orderParam).then((o) => { setOrder(o); rememberOrder(o.id); }).catch(() => setFailed(true));
    } else if (idParam) {
      getProduct(idParam).then((r) => {
        setProduct(r.product); setMethods({ sbp: r.sbp && r.product.priceRub > 0, usdc: r.usdc && r.product.priceUsdc > 0 });
        setMethod(r.sbp && r.product.priceRub > 0 ? "sbp" : "usdc");
      }).catch(() => setFailed(true));
    } else setFailed(true);
  }, [orderParam, idParam]);
  useEffect(() => {
    const key = `${orderParam}|${idParam}`;
    if (loaded.current === key) return;
    loaded.current = key; load();
  }, [load, orderParam, idParam]);

  const title = order?.product?.title || product?.title || (ru ? "Товар" : "Product");
  useEffect(() => { document.title = `${title} | HiMeet`; }, [title]);

  const buy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product) return;
    setBusy(true);
    try {
      const o = await createOrder(product.id, email, method);
      rememberOrder(o.id); setOrder(o);
      window.history.replaceState(null, "", `${BASE}/product/?order=${o.id}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) { toast(shopError(err, ru), "err"); } finally { setBusy(false); }
  };

  return (
    <PageShell title={title}>
      {failed && (
        <div className="card text-center space-y-3">
          <p className="text-sm opacity-80">{ru ? "Страница не найдена." : "Page not found."}</p>
          <Link href={`${BASE}/communities/`} className="btn btn-ghost inline-block">{ru ? "К сообществам" : "To communities"}</Link>
        </div>
      )}
      {!failed && !product && !order && <p className="text-sm opacity-60">…</p>}

      {order && <OrderView order={order} onChange={setOrder} />}

      {!order && product && (
        <div className="space-y-4">
          {product.image && <img src={mediaSrc(product.image)} alt="" className="w-full max-h-96 rounded-2xl object-cover" />}
          {product.descr && <div className="card text-sm leading-relaxed whitespace-pre-line">{product.descr}</div>}
          <form onSubmit={buy} className="card space-y-3">
            <h2 className="font-bold">{ru ? "Купить без регистрации" : "Buy without signing up"}</h2>
            {!methods.sbp && !methods.usdc ? (
              <p className="text-sm opacity-80">{ru ? "Приём оплаты пока не настроен." : "Payments are not set up yet."}</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2" role="group" aria-label={ru ? "Способ оплаты" : "Payment method"}>
                  {methods.sbp && <button type="button" aria-pressed={method === "sbp"} className={`chip ${method === "sbp" ? "chip-on" : ""}`} onClick={() => setMethod("sbp")}>{ru ? `СБП · ${rub(product.priceRub)}` : `SBP · ${rub(product.priceRub)}`}</button>}
                  {methods.usdc && <button type="button" aria-pressed={method === "usdc"} className={`chip ${method === "usdc" ? "chip-on" : ""}`} onClick={() => setMethod("usdc")}>USDC · {usdc(product.priceUsdc)}</button>}
                </div>
                <label className="block text-sm">{ru ? "Ваша почта (для связи по заказу)" : "Your email (for order contact)"}
                  <input className={field} type="email" value={email} maxLength={254} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                </label>
                {product.kind === "digital" && (
                  <label className="flex items-start gap-2 text-xs opacity-90">
                    <input type="checkbox" className="mt-0.5" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                    <span>{ru ? "Понимаю, что это цифровой файл (PDF), он открывается сразу после подтверждения оплаты. Материал носит информационный характер и не заменяет консультацию врача." : "I understand this is a digital file (PDF) available right after payment is confirmed. The material is informational and does not replace medical advice."}</span>
                  </label>
                )}
                <button type="submit" disabled={busy || (product.kind === "digital" && !agree)} className="btn btn-primary">{busy ? "…" : ru ? "Перейти к оплате" : "Continue to payment"}</button>
              </>
            )}
          </form>
        </div>
      )}
      <SellerInfo compact />
    </PageShell>
  );
}

export default function ProductPage() {
  return (
    <Suspense fallback={null}>
      <View />
    </Suspense>
  );
}

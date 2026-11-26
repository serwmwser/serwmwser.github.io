"use client";
// Раздел «Товары и услуги» в сообществе. Покупателям показывает витрину (покупка на странице товара без регистрации).
// Владельцу сообщества (на тарифе Start 1 товар, на Pro до 10) даёт форму товара, загрузку закрытого PDF, список заказов и заработок.
// Деньги приходят на реквизиты платформы: комиссия 20%, остальное выплачивается владельцу отдельно от выплат за участников.
// Подтверждать оплату по СБП и отмечать выплаты может только администратор сайта.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "@/lib/ctx";
import { useSocial } from "@/lib/social";
import { BASE } from "@/lib/urls";
import { modMe } from "@/lib/mod";
import { uploadFile } from "@/lib/attach";
import { mediaSrc, type Community } from "@/lib/communities";
import {
  confirmOrder, deleteProduct, getEarnings, listOrders, listProducts, markPayout, rub, saveProduct, shopError, uploadProductFile, usdc,
  type Earn, type Earnings, type OrderAdmin, type ProductAdmin, type ProductKind, type ProductList,
} from "@/lib/shop";

type Form = { id: number; title: string; descr: string; image: string; kind: ProductKind; priceRub: string; priceUsdc: string; after: string; status: "active" | "hidden" };
const EMPTY: Form = { id: 0, title: "", descr: "", image: "", kind: "digital", priceRub: "", priceUsdc: "", after: "", status: "active" };
const field = "w-full rounded-xl border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 text-sm";

export default function ProductsSection({ c }: { c: Community }) {
  const { lang, toast } = useApp();
  const { token } = useSocial();
  const ru = lang === "ru";
  const [admin, setAdmin] = useState(false);
  const [data, setData] = useState<ProductList | null>(null);
  const [orders, setOrders] = useState<OrderAdmin[]>([]);
  const [earn, setEarn] = useState<Earnings | null>(null);
  const [f, setF] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!token) { setAdmin(false); return; }
    modMe(token).then((a) => { if (alive) setAdmin(!!a); }).catch(() => { if (alive) setAdmin(false); });
    return () => { alive = false; };
  }, [token]);

  const load = useCallback(() => {
    listProducts(c.slug, token || "", !!token)
      .then((d) => {
        setData(d);
        if (d.manage) {
          listOrders(token, c.slug).then(setOrders).catch(() => setOrders([]));
          getEarnings(token, c.slug).then(setEarn).catch(() => setEarn(null));
        } else { setOrders([]); setEarn(null); }
      })
      .catch(() => setData({ items: [], manage: false, limit: 0, used: 0, feePct: 20 }));
  }, [c.slug, token]);
  useEffect(() => { load(); }, [load]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const fail = (e: unknown) => toast(shopError(e, ru), "err");

  const items = data?.items ?? null;
  const manage = !!data?.manage;
  const limit = data?.limit ?? 0;
  const used = data?.used ?? 0;
  const full = manage && used >= limit;
  const showCounter = manage && limit < 100;
  const feePct = data?.feePct ?? 20;

  const edit = (p: ProductAdmin) => {
    setF({ id: p.id, title: p.title, descr: p.descr, image: p.image, kind: p.kind, priceRub: p.priceRub ? String(p.priceRub) : "", priceUsdc: p.priceUsdc ? String(p.priceUsdc) : "", after: p.after, status: p.status });
    setOpen(true);
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try { set("image", (await uploadFile(token, file)).path); } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await saveProduct(token, {
        id: f.id || undefined, community: c.slug, title: f.title, descr: f.descr, image: f.image, kind: f.kind,
        priceRub: Number(f.priceRub) || 0, priceUsdc: Number(f.priceUsdc.replace(",", ".")) || 0, after: f.after, status: f.status,
      });
      toast(ru ? "Сохранено" : "Saved", "ok");
      setF(EMPTY); setOpen(false); load();
    } catch (err) { fail(err); } finally { setBusy(false); }
  };

  const pickPdf = async (p: ProductAdmin, file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const bytes = await uploadProductFile(token, p.id, file);
      toast(ru ? `PDF загружен (${(bytes / 1048576).toFixed(1)} МБ)` : `PDF uploaded (${(bytes / 1048576).toFixed(1)} MB)`, "ok");
      load();
    } catch (err) { fail(err); } finally { setBusy(false); }
  };

  const remove = async (p: ProductAdmin) => {
    if (!window.confirm(ru ? `Удалить товар «${p.title}»?` : `Delete “${p.title}”?`)) return;
    try { await deleteProduct(token, p.id); if (f.id === p.id) setF(EMPTY); load(); } catch (err) { fail(err); }
  };

  const order = async (o: OrderAdmin, action: "paid" | "reject" | "reset") => {
    if (action === "paid" && !window.confirm(ru ? `Деньги по заказу ${o.code} пришли на счёт?` : `Did the payment for ${o.code} arrive?`)) return;
    try { await confirmOrder(token, o.id, action); load(); } catch (err) { fail(err); }
  };

  const payout = async () => {
    if (!window.confirm(ru ? "Отметить, что выплата владельцу за проданные товары и услуги сделана?" : "Mark the payout to the owner as done?")) return;
    try { await markPayout(token, c.slug); toast(ru ? "Выплата отмечена" : "Payout marked", "ok"); load(); } catch (err) { fail(err); }
  };

  const waiting = orders.filter((o) => o.status === "claimed" || o.status === "new");
  const statusText = (s: OrderAdmin["status"]) => ({ new: ru ? "создан" : "new", claimed: ru ? "ждёт проверки" : "to check", paid: ru ? "оплачен" : "paid", rejected: ru ? "отклонён" : "rejected" }[s]);
  const money = (o: OrderAdmin, v: number) => (o.method === "sbp" ? rub(v) : usdc(v));
  const earnLine = (label: string, e: Earn, fmt: (n: number) => string) => e.count > 0 && (
    <p key={label} className="text-sm">
      <b>{label}:</b> {ru ? "продано на" : "sold for"} {fmt(e.gross)} · {ru ? "комиссия платформы" : "platform fee"} {fmt(e.fee)} ·{" "}
      {ru ? "к выплате" : "to pay out"} <b>{fmt(e.pending)}</b> · {ru ? "уже выплачено" : "paid out"} {fmt(e.paid)}
    </p>
  );

  // Покупателям пустой раздел не показываем
  if (!manage && (!items || items.length === 0)) return null;

  return (
    <section className="space-y-4" id="products">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-extrabold">{ru ? "Товары и услуги" : "Products and services"}</h2>
          {showCounter && <p className="text-xs opacity-70">{ru ? `Использовано ${used} из ${limit}: на тарифе Start 1 товар, на Pro до 10.` : `Used ${used} of ${limit}: Start allows 1, Pro up to 10.`}</p>}
        </div>
        {manage && !open && !full && <button type="button" className="btn btn-primary" onClick={() => { setF(EMPTY); setOpen(true); }}>{ru ? "Добавить товар или услугу" : "Add product or service"}</button>}
      </div>
      {manage && full && !open && (
        <p className="card text-sm">{ru ? "Лимит товаров исчерпан. Чтобы добавить больше (до 10), перейдите на тариф «Про»." : "Product limit reached. Upgrade to Pro to add up to 10."}</p>
      )}

      {manage && open && (
        <form onSubmit={submit} className="card space-y-3">
          <h3 className="font-bold">{f.id ? (ru ? "Изменить товар" : "Edit product") : ru ? "Новый товар или услуга" : "New product or service"}</h3>
          <div className="flex flex-wrap gap-2" role="group" aria-label={ru ? "Вид" : "Kind"}>
            {([["digital", "Цифровой товар (файл PDF)", "Digital product (PDF)"], ["service", "Услуга", "Service"]] as [ProductKind, string, string][]).map(([k, a, b]) => (
              <button key={k} type="button" aria-pressed={f.kind === k} className={`chip ${f.kind === k ? "chip-on" : ""}`} onClick={() => set("kind", k)}>{ru ? a : b}</button>
            ))}
          </div>
          <label className="block text-sm">{ru ? "Название (до 80 символов)" : "Title (up to 80 characters)"}
            <input className={field} value={f.title} maxLength={80} onChange={(e) => set("title", e.target.value)} required />
          </label>
          <label className="block text-sm">{ru ? "Описание (до 4000 символов)" : "Description (up to 4000 characters)"}
            <textarea className={field} rows={8} value={f.descr} maxLength={4000} onChange={(e) => set("descr", e.target.value)} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">{ru ? "Цена в рублях (СБП); 0 = не принимать" : "Price in rubles (SBP); 0 = off"}
              <input className={field} inputMode="numeric" value={f.priceRub} onChange={(e) => set("priceRub", e.target.value.replace(/[^\d]/g, ""))} placeholder="990" />
            </label>
            <label className="block text-sm">{ru ? "Цена в USDC (Polygon); 0 = не принимать" : "Price in USDC (Polygon); 0 = off"}
              <input className={field} inputMode="decimal" value={f.priceUsdc} onChange={(e) => set("priceUsdc", e.target.value.replace(/[^\d.,]/g, ""))} placeholder="11" />
            </label>
          </div>
          <p className="text-xs opacity-70">{ru ? `Покупатели платят на счёт платформы. С каждой продажи платформа удерживает ${feePct}%, остальное выплачивается владельцу отдельно от выплат за участников.` : `Buyers pay the platform. The platform keeps ${feePct}% of each sale and pays out the rest to the owner, separately from membership payouts.`}</p>
          <label className="block text-sm">{ru ? "Текст после оплаты (до 600 символов), например как получить услугу" : "Text shown after payment (up to 600 characters)"}
            <textarea className={field} rows={3} value={f.after} maxLength={600} onChange={(e) => set("after", e.target.value)} />
          </label>
          <div className="space-y-2">
            <div className="text-sm">{ru ? "Обложка (JPG, PNG, WebP)" : "Cover (JPG, PNG, WebP)"}</div>
            {f.image && (
              <div className="flex items-center gap-3">
                <img src={mediaSrc(f.image)} alt="" className="h-24 w-24 rounded-lg object-cover" />
                <button type="button" className="btn btn-ghost !py-1.5 text-sm" onClick={() => set("image", "")}>{ru ? "Убрать" : "Remove"}</button>
              </div>
            )}
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => { void pickImage(e.target.files?.[0]); e.target.value = ""; }} className="text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.status === "active"} onChange={(e) => set("status", e.target.checked ? "active" : "hidden")} />
            {ru ? "Показывать покупателям" : "Visible to buyers"}
          </label>
          {f.kind === "digital" && <p className="text-xs opacity-70">{ru ? "PDF-файл загружается после сохранения: кнопка «Загрузить PDF» у товара в списке." : "Upload the PDF after saving: use “Upload PDF” on the product in the list."}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className="btn btn-primary">{busy ? "…" : ru ? "Сохранить" : "Save"}</button>
            <button type="button" className="btn btn-ghost" onClick={() => { setF(EMPTY); setOpen(false); }}>{ru ? "Отмена" : "Cancel"}</button>
          </div>
        </form>
      )}

      {!items ? <p className="text-sm opacity-60">…</p> : items.length === 0 ? (
        <p className="text-sm opacity-70">{ru ? "Товаров пока нет." : "No products yet."}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <article key={p.id} className="card flex flex-col gap-3">
              {p.image && <img src={mediaSrc(p.image)} alt="" className="aspect-[4/3] w-full rounded-xl object-cover" />}
              <div className="min-w-0 flex-1 space-y-1">
                <h3 className="font-bold break-words">{p.title}</h3>
                {p.descr && <p className="text-sm opacity-80 line-clamp-3 whitespace-pre-line">{p.descr}</p>}
                <p className="text-sm font-semibold">
                  {[p.priceRub > 0 ? rub(p.priceRub) : "", p.priceUsdc > 0 ? usdc(p.priceUsdc) : ""].filter(Boolean).join(" · ")}
                </p>
                {manage && (
                  <p className="text-xs opacity-70">
                    {p.status === "hidden" ? (ru ? "скрыт" : "hidden") : ru ? "показывается" : "visible"} · {ru ? "продано" : "sold"}: {p.sold}
                    {p.kind === "digital" ? ` · ${p.hasFile ? (ru ? "PDF загружен" : "PDF ready") : ru ? "PDF не загружен" : "no PDF yet"}` : ""}
                  </p>
                )}
              </div>
              <Link href={`${BASE}/product/?id=${p.id}`} className="btn btn-primary text-center">{ru ? "Подробнее и купить" : "Details and buy"}</Link>
              {manage && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-ghost !py-1.5 text-sm" onClick={() => edit(p)}>{ru ? "Изменить" : "Edit"}</button>
                  {p.kind === "digital" && (
                    <label className="btn btn-ghost !py-1.5 text-sm cursor-pointer">
                      {p.hasFile ? (ru ? "Заменить PDF" : "Replace PDF") : ru ? "Загрузить PDF" : "Upload PDF"}
                      <input type="file" accept="application/pdf,.pdf" className="hidden" disabled={busy} onChange={(e) => { void pickPdf(p, e.target.files?.[0]); e.target.value = ""; }} />
                    </label>
                  )}
                  <button type="button" className="btn btn-ghost !py-1.5 text-sm text-red-500" onClick={() => void remove(p)}>{ru ? "Удалить" : "Delete"}</button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {manage && earn && (earn.rub.count > 0 || earn.usdc.count > 0) && (
        <div className="card space-y-2">
          <h3 className="font-bold">{ru ? "Заработок от товаров и услуг" : "Earnings from products and services"}</h3>
          <p className="text-xs opacity-70">{ru ? `Это отдельно от выплат за участников. Комиссия платформы ${earn.feePct}%, выплаты по понедельникам.` : `Separate from membership payouts. Platform fee ${earn.feePct}%, paid out on Mondays.`}</p>
          {earnLine(ru ? "Рубли (СБП)" : "Rubles (SBP)", earn.rub, rub)}
          {earnLine("USDC", earn.usdc, usdc)}
          {admin && (earn.rub.pending > 0 || earn.usdc.pending > 0) && (
            <button type="button" className="btn btn-primary !py-1.5 text-sm" onClick={() => void payout()}>{ru ? "Отметить выплату владельцу" : "Mark payout as done"}</button>
          )}
        </div>
      )}

      {manage && (
        <div className="card space-y-3">
          <h3 className="font-bold">{ru ? "Заказы" : "Orders"}{waiting.length ? ` · ${ru ? "ждут проверки" : "to check"}: ${waiting.length}` : ""}</h3>
          {orders.length === 0 ? <p className="text-sm opacity-70">{ru ? "Заказов пока нет." : "No orders yet."}</p> : orders.slice(0, 50).map((o) => (
            <div key={o.id} className="flex flex-wrap items-center gap-2 border-t border-black/10 dark:border-white/10 pt-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-semibold break-words">{o.code} · {o.title}</div>
                <div className="text-xs opacity-70 break-all">
                  {o.email ? `${o.email} · ` : ""}{money(o, o.amount)} · {statusText(o.status)}
                  {o.note ? ` · ${o.note}` : ""} · {new Date(o.created).toLocaleString(ru ? "ru-RU" : "en-GB")}
                  {o.status === "paid" ? ` · ${ru ? "скачиваний" : "downloads"}: ${o.downloads}` : ""}
                </div>
                {o.status === "paid" && (
                  <div className="text-xs opacity-80">
                    {ru ? "Ваша доля" : "Your share"}: {money(o, o.share)} ({ru ? "комиссия" : "fee"} {money(o, o.fee)}) · {o.payout === "done" ? (ru ? "выплачено" : "paid out") : ru ? "ждёт выплаты" : "payout pending"}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {admin && o.status !== "paid" && o.status !== "rejected" && <button type="button" className="btn btn-primary !py-1.5 text-sm" onClick={() => void order(o, "paid")}>{ru ? "Оплата пришла" : "Payment received"}</button>}
                {admin && o.status !== "paid" && o.status !== "rejected" && <button type="button" className="btn btn-ghost !py-1.5 text-sm" onClick={() => void order(o, "reject")}>{ru ? "Отклонить" : "Reject"}</button>}
                {o.status === "paid" && o.downloads > 0 && <button type="button" className="btn btn-ghost !py-1.5 text-sm" onClick={() => void order(o, "reset")}>{ru ? "Сбросить скачивания" : "Reset downloads"}</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

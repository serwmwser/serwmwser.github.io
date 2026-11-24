"use client";
// Партнёры сообщества (для владельца на тарифе «Про»): партнёрские тарифы (процент), личные ссылки партнёров и их заработок.
// Доля партнёра считается от суммы платежа участника и берётся из части владельца; выплата по понедельникам вместе с остальными.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "@/lib/ctx";
import { useSocial } from "@/lib/social";
import { BASE } from "@/lib/urls";
import { communityUrl, type Community } from "@/lib/communities";
import { partnerAdd, partnerList, partnerPlanAdd, partnerPlanRemove, partnerRemove, payError, type PartnerRow, type PartnerTariff } from "@/lib/pay";

const usdc = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function CommunityPartners({ c }: { c: Community }) {
  const { lang, toast } = useApp();
  const { token } = useSocial();
  const ru = lang === "ru";
  const [pro, setPro] = useState<boolean | null>(null);
  const [tariffs, setTariffs] = useState<PartnerTariff[]>([]);
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [tName, setTName] = useState("");
  const [tPct, setTPct] = useState("");
  const [pAddr, setPAddr] = useState("");
  const [pTariff, setPTariff] = useState(0);

  const load = useCallback(() => {
    partnerList(token, c.slug)
      .then((r) => { setPro(r.pro); setTariffs(r.tariffs); setPartners(r.partners); setPTariff((cur) => (r.tariffs.some((t) => t.id === cur) ? cur : r.tariffs[0]?.id ?? 0)); })
      .catch(() => setPro(false));
  }, [token, c.slug]);
  useEffect(() => { load(); }, [load]);

  const run = async (f: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try { await f(); load(); } catch (e) { toast(payError(e, ru), "err"); } finally { setBusy(false); }
  };
  const link = (code: string) => `${window.location.origin}${communityUrl(c.slug)}&ref=${code}`;
  const copy = (text: string) => {
    try { void navigator.clipboard.writeText(text); toast(ru ? "Ссылка скопирована" : "Link copied", "ok"); } catch { toast(text, "info"); }
  };
  const input = "w-full rounded-xl border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 text-sm";
  const pct = Number(tPct);
  const pctOk = Number.isInteger(pct) && pct >= 1 && pct <= 50;
  const addrOk = /^0x[a-fA-F0-9]{40}$/.test(pAddr.trim());

  if (pro === null) return null;
  return (
    <section className="card space-y-4" aria-label={ru ? "Партнёры" : "Partners"}>
      <h2 className="text-lg font-bold">🤝 {ru ? "Партнёры сообщества" : "Community partners"}</h2>
      {!pro ? (
        <p className="text-sm opacity-80">
          {ru ? "Партнёрские тарифы доступны на тарифе «Про»: вы задаёте процент, а партнёр получает его с каждого платежа, который привёл. " : "Partner plans are available on the Pro plan: you set a percentage and the partner earns it on every payment they bring. "}
          <Link href={`${BASE}/communities/new/`} className="underline">{ru ? "Посмотреть тарифы" : "See plans"}</Link>
        </p>
      ) : (
        <>
          <p className="text-xs opacity-70">{ru
            ? "Процент считается от суммы платежа участника и вычитается из вашей части (комиссия платформы не меняется). Выплата партнёру идёт по понедельникам за прошлую неделю."
            : "The percentage is taken from the member's payment and deducted from your share (the platform fee does not change). Partners are paid on Mondays for the previous week."}</p>

          <div className="space-y-2">
            <h3 className="font-bold text-sm">{ru ? "Партнёрские тарифы" : "Partner plans"}</h3>
            {tariffs.length === 0 && <div className="text-sm opacity-70">{ru ? "Тарифов пока нет." : "No plans yet."}</div>}
            {tariffs.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2 rounded-2xl bg-black/5 dark:bg-white/5 px-3 py-2 text-sm">
                <span><b>{t.name}</b> · {t.pct}%</span>
                <button type="button" className="btn btn-ghost !px-3 !py-1.5" disabled={busy} onClick={() => run(() => partnerPlanRemove(token, c.slug, t.id))}>{ru ? "Убрать" : "Remove"}</button>
              </div>
            ))}
            <div className="grid gap-2 sm:grid-cols-[1fr_120px_auto]">
              <input className={input} placeholder={ru ? "Название (например, Блогер)" : "Name (e.g. Blogger)"} value={tName} maxLength={30} onChange={(e) => setTName(e.target.value)} />
              <input className={input} placeholder={ru ? "% (1–50)" : "% (1–50)"} inputMode="numeric" value={tPct} onChange={(e) => setTPct(e.target.value.replace(/\D/g, "").slice(0, 2))} />
              <button type="button" className="btn btn-ghost" disabled={busy || tName.trim().length < 2 || !pctOk}
                onClick={() => run(async () => { await partnerPlanAdd(token, c.slug, tName.trim(), pct); setTName(""); setTPct(""); })}>＋ {ru ? "Добавить" : "Add"}</button>
            </div>
          </div>

          <div className="space-y-2 border-t border-black/10 dark:border-white/10 pt-4">
            <h3 className="font-bold text-sm">{ru ? "Партнёры" : "Partners"}</h3>
            {partners.length === 0 && <div className="text-sm opacity-70">{ru ? "Партнёров пока нет." : "No partners yet."}</div>}
            {partners.map((p) => (
              <div key={p.addr} className="space-y-2 rounded-2xl bg-black/5 dark:bg-white/5 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span><b>{p.name}</b> <span className="font-mono text-xs opacity-70">{short(p.addr)}</span></span>
                  <span className="text-xs opacity-80">{ru ? "к выплате" : "pending"}: {usdc(p.pending)} · {ru ? "выплачено" : "paid"}: {usdc(p.paid)} USDC</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select className="rounded-xl border border-black/15 dark:border-white/20 bg-transparent px-2 py-1.5 text-sm" value={p.tariff} disabled={busy}
                    onChange={(e) => run(() => partnerAdd(token, c.slug, p.addr, Number(e.target.value)))}>
                    {tariffs.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.pct}%</option>)}
                  </select>
                  <button type="button" className="btn btn-ghost !px-3 !py-1.5" onClick={() => copy(link(p.code))}>🔗 {ru ? "Ссылка партнёра" : "Partner link"}</button>
                  <button type="button" className="btn btn-ghost !px-3 !py-1.5" disabled={busy}
                    onClick={() => { if (window.confirm(ru ? "Убрать партнёра? Его ссылка перестанет работать." : "Remove this partner? Their link will stop working.")) void run(() => partnerRemove(token, c.slug, p.addr)); }}>{ru ? "Убрать" : "Remove"}</button>
                </div>
              </div>
            ))}
            {tariffs.length > 0 && (
              <div className="grid gap-2 sm:grid-cols-[1fr_160px_auto]">
                <input className={input} placeholder={ru ? "Адрес кошелька партнёра (0x…)" : "Partner wallet address (0x…)"} value={pAddr} onChange={(e) => setPAddr(e.target.value.trim())} />
                <select className={input} value={pTariff} onChange={(e) => setPTariff(Number(e.target.value))}>
                  {tariffs.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.pct}%</option>)}
                </select>
                <button type="button" className="btn btn-primary" disabled={busy || !addrOk || !pTariff}
                  onClick={() => run(async () => { await partnerAdd(token, c.slug, pAddr.toLowerCase(), pTariff); setPAddr(""); toast(ru ? "Партнёр добавлен" : "Partner added", "ok"); })}>＋ {ru ? "Партнёр" : "Partner"}</button>
              </div>
            )}
            <p className="text-xs opacity-60">{ru ? "Партнёр должен иметь профиль на HiMeet. Попросите его прислать адрес кошелька, которым он входит на сайт." : "The partner must have a HiMeet profile. Ask them for the wallet address they sign in with."}</p>
          </div>
        </>
      )}
    </section>
  );
}

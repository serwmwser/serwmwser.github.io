"use client";
// Партнёрка платформы (как у Skool): личные ссылки, число приглашённых создателей, заработок за 30 дней и за всё время, баланс и выплаты.
// За каждого приглашённого создателя вы получаете процент от его платежей за тариф создателя, пока он платит. Выплаты по понедельникам за прошлую неделю.
import { useEffect, useState } from "react";
import Link from "next/link";
import LoginPrompt from "@/components/LoginPrompt";
import PageShell from "@/components/PageShell";
import { useApp } from "@/lib/ctx";
import { useSocial } from "@/lib/social";
import { BASE } from "@/lib/urls";
import { affiliateStats, payError, type AffiliateStats } from "@/lib/pay";

const usdc = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AffiliatesPage() {
  const { lang, toast } = useApp();
  const { token, addr } = useSocial();
  const ru = lang === "ru";
  const [st, setSt] = useState<AffiliateStats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!token) { setSt(null); return; }
    let alive = true;
    setFailed(false);
    affiliateStats(token).then((r) => { if (alive) setSt(r); }).catch((e) => { if (alive) { setFailed(true); toast(payError(e, ru), "err"); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const origin = typeof window === "undefined" ? "https://himeet.online" : window.location.origin;
  const me = (addr || st?.wallet || "").toLowerCase();
  const creatorLink = me ? `${origin}${BASE}/communities/new/?ref=${me}` : "";
  const siteLink = me ? `${origin}${BASE}/?ref=${me}` : "";
  const copy = (text: string) => {
    try { void navigator.clipboard.writeText(text); toast(ru ? "Ссылка скопирована" : "Link copied", "ok"); } catch { toast(text, "info"); }
  };
  const date = (t: number) => new Date(t).toLocaleDateString(ru ? "ru-RU" : "en-GB", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" });

  const pct = st?.pct ?? 40;
  const stats: [string, string, string][] = st ? [
    [ru ? "Приглашено создателей" : "Creators invited", String(st.creators), ""],
    [ru ? "За 30 дней" : "Last 30 days", usdc(st.last30), "USDC"],
    [ru ? "За всё время" : "Lifetime", usdc(st.lifetime), "USDC"],
    [ru ? "К выплате" : "Balance", usdc(st.balance), "USDC"],
    [ru ? "Уже выплачено" : "Paid out", usdc(st.paid), "USDC"],
  ] : [];

  return (
    <PageShell
      title={ru ? "Партнёрка" : "Affiliates"}
      intro={ru ? `Приглашайте создателей сообществ и получайте ${pct}% от их платежей за тариф создателя, пока они платят.` : `Invite community creators and earn ${pct}% of what they pay for their creator plans, for as long as they pay.`}
    >
      {!token ? (
        <LoginPrompt text={ru ? "Войдите, чтобы получить личную ссылку." : "Sign in to get your personal link."} />
      ) : (
        <>
          <section className="card space-y-3" aria-label={ru ? "Ваши ссылки" : "Your links"}>
            <h2 className="text-lg font-bold">{ru ? "Ваши ссылки" : "Your links"}</h2>
            <div className="space-y-1 text-sm">
              <div className="font-semibold">{ru ? "Для создателей сообществ" : "For community creators"}</div>
              <div className="flex flex-wrap items-center gap-2">
                <input readOnly className="min-w-0 flex-1 rounded-xl border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 text-xs font-mono" value={creatorLink} onFocus={(e) => e.currentTarget.select()} />
                <button type="button" className="btn btn-primary !py-2" disabled={!creatorLink} onClick={() => copy(creatorLink)}>{ru ? "Копировать" : "Copy"}</button>
              </div>
            </div>
            <div className="space-y-1 text-sm">
              <div className="font-semibold">{ru ? "Общая ссылка на HiMeet" : "General HiMeet link"}</div>
              <div className="flex flex-wrap items-center gap-2">
                <input readOnly className="min-w-0 flex-1 rounded-xl border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 text-xs font-mono" value={siteLink} onFocus={(e) => e.currentTarget.select()} />
                <button type="button" className="btn btn-ghost !py-2" disabled={!siteLink} onClick={() => copy(siteLink)}>{ru ? "Копировать" : "Copy"}</button>
              </div>
            </div>
            <p className="text-xs opacity-60">{ru ? "Первый пригласивший закрепляется за человеком навсегда. Создатель считается приглашённым вами, если зашёл на сайт по вашей ссылке до первого входа." : "The first inviter stays with a person for good. A creator counts as invited by you if they came to the site through your link before signing in for the first time."}</p>
          </section>

          {st ? (
            <section className="space-y-3" aria-label={ru ? "Заработок" : "Earnings"}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {stats.map(([label, value, unit]) => (
                  <div key={label} className="card text-center">
                    <div className="text-xs opacity-70">{label}</div>
                    <div className="text-xl font-extrabold">{value}</div>
                    {unit && <div className="text-xs opacity-60">{unit}</div>}
                  </div>
                ))}
              </div>
              <div className="card space-y-1 text-sm">
                <div><b>{ru ? "Ближайшая выплата" : "Next payout"}:</b> {date(st.nextPayout)}</div>
                <div className="opacity-80">{ru ? "Выплата идёт по понедельникам за прошлую неделю (пн–вс, UTC) в USDC на кошелёк, которым вы входите на сайт:" : "Payouts are made on Mondays for the previous week (Mon–Sun, UTC) in USDC to the wallet you sign in with:"}</div>
                <div className="font-mono text-xs break-all">{st.wallet}</div>
              </div>
            </section>
          ) : failed ? (
            <section className="card text-center text-sm opacity-80">{ru ? "Не удалось загрузить данные. Обновите страницу." : "Could not load the data. Please refresh the page."}</section>
          ) : (
            <p className="text-sm opacity-60">…</p>
          )}

          <section className="card space-y-2 text-sm">
            <h2 className="text-lg font-bold">{ru ? "Как это работает" : "How it works"}</h2>
            <ul className="space-y-1.5 opacity-90">
              <li>1. {ru ? "Отправьте ссылку блогеру или владельцу клуба." : "Send the link to a blogger or a club owner."}</li>
              <li>2. {ru ? "Он создаёт сообщество и оплачивает тариф создателя (после бесплатного периода)." : "They create a community and pay for a creator plan (after the free period)."}</li>
              <li>3. {ru ? `Вы получаете ${pct}% с каждого его платежа за тариф, пожизненно.` : `You earn ${pct}% of each of their plan payments, for life.`}</li>
            </ul>
            <p className="text-xs opacity-60">{ru ? "Доход не гарантирован и зависит от того, сколько создателей придут и оплатят тариф." : "Income is not guaranteed and depends on how many creators join and pay for a plan."}</p>
            <Link href={`${BASE}/communities/new/`} className="underline">{ru ? "Страница создания сообщества" : "Create-a-community page"}</Link>
            <div className="border-t border-black/10 dark:border-white/10 pt-2 text-xs opacity-80">
              {ru ? "Вас добавил партнёром владелец сообщества? " : "Did a community owner add you as a partner? "}
              <Link href={`${BASE}/partner/`} className="underline">{ru ? "Кабинет партнёра сообществ" : "Community partner dashboard"}</Link>
            </div>
          </section>
        </>
      )}
    </PageShell>
  );
}

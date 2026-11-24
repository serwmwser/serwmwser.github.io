"use client";
// Кабинет партнёра сообществ: личные ссылки в сообщества, где владелец добавил вас партнёром, и заработок (к выплате и выплачено).
// Выплата по понедельникам за прошлую неделю на кошелёк, которым вы входите на сайт.
import { useEffect, useState } from "react";
import Link from "next/link";
import LoginPrompt from "@/components/LoginPrompt";
import PageShell from "@/components/PageShell";
import { useApp } from "@/lib/ctx";
import { useSocial } from "@/lib/social";
import { BASE } from "@/lib/urls";
import { communityUrl } from "@/lib/communities";
import { partnerMine, payError, type PartnerLink } from "@/lib/pay";

const usdc = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function PartnerPage() {
  const { lang, toast } = useApp();
  const { token, addr } = useSocial();
  const ru = lang === "ru";
  const [data, setData] = useState<{ links: PartnerLink[]; pending: number; paid: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!token) { setData(null); return; }
    let alive = true;
    setFailed(false);
    partnerMine(token).then((r) => { if (alive) setData(r); }).catch((e) => { if (alive) { setFailed(true); toast(payError(e, ru), "err"); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const origin = typeof window === "undefined" ? "https://himeet.online" : window.location.origin;
  const link = (l: PartnerLink) => `${origin}${communityUrl(l.slug)}&ref=${l.code}`;
  const copy = (text: string) => {
    try { void navigator.clipboard.writeText(text); toast(ru ? "Ссылка скопирована" : "Link copied", "ok"); } catch { toast(text, "info"); }
  };

  return (
    <PageShell
      title={ru ? "Кабинет партнёра" : "Partner dashboard"}
      intro={ru ? "Ссылки в сообщества, где владелец сделал вас партнёром, и ваш заработок с привлечённых участников." : "Links to the communities where the owner made you a partner, and your earnings from the members you bring."}
    >
      {!token ? (
        <LoginPrompt text={ru ? "Войдите кошельком, который указал владелец сообщества." : "Sign in with the wallet the community owner added."} />
      ) : failed ? (
        <section className="card text-center text-sm opacity-80">{ru ? "Не удалось загрузить данные. Обновите страницу." : "Could not load the data. Please refresh the page."}</section>
      ) : !data ? (
        <p className="text-sm opacity-60">…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="card"><div className="text-xs opacity-70">{ru ? "К выплате" : "To be paid"}</div><div className="text-xl font-extrabold">{usdc(data.pending)}</div><div className="text-xs opacity-60">USDC</div></div>
            <div className="card"><div className="text-xs opacity-70">{ru ? "Уже выплачено" : "Paid out"}</div><div className="text-xl font-extrabold">{usdc(data.paid)}</div><div className="text-xs opacity-60">USDC</div></div>
          </div>
          <p className="text-xs opacity-60">{ru ? "Выплаты по понедельникам за прошлую неделю (пн–вс, UTC) в USDC на кошелёк" : "Payouts on Mondays for the previous week (Mon–Sun, UTC) in USDC to the wallet"} <span className="font-mono break-all">{addr}</span></p>

          <section className="space-y-2" aria-label={ru ? "Мои ссылки" : "My links"}>
            <h2 className="text-lg font-bold">{ru ? "Мои ссылки" : "My links"}</h2>
            {data.links.length === 0 && (
              <div className="card space-y-2 text-sm">
                <p>{ru ? "Вас пока не добавили партнёром ни в одно сообщество." : "You have not been added as a partner to any community yet."}</p>
                <p className="opacity-80">{ru ? "Владелец сообщества на тарифе «Про» добавляет партнёров по адресу кошелька. Отправьте ему адрес, которым вы входите на сайт:" : "A community owner on the Pro plan adds partners by wallet address. Send them the address you sign in with:"}</p>
                <p className="font-mono text-xs break-all">{addr}</p>
              </div>
            )}
            {data.links.map((l) => (
              <div key={l.code} className="card space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`${BASE}/community/?slug=${encodeURIComponent(l.slug)}`} className="font-bold underline">{l.community}</Link>
                  <span className="chip chip-on text-xs">{l.tariff} · {l.pct}%</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input readOnly className="min-w-0 flex-1 rounded-xl border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 text-xs font-mono" value={link(l)} onFocus={(e) => e.currentTarget.select()} />
                  <button type="button" className="btn btn-primary !py-2" onClick={() => copy(link(l))}>{ru ? "Копировать" : "Copy"}</button>
                </div>
              </div>
            ))}
            <p className="text-xs opacity-60">{ru ? `Вы получаете указанный процент от суммы каждого платежа участника, который вступил по вашей ссылке. Доход не гарантирован.` : `You earn the stated percentage of every payment made by a member who joined through your link. Income is not guaranteed.`}</p>
          </section>
        </>
      )}
    </PageShell>
  );
}

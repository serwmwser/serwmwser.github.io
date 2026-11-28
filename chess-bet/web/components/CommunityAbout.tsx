"use client";
// Страница-витрина сообщества (как «About» на Skool): слева галерея (видео и картинки) и описание, справа карточка с кнопкой вступления.
import { useEffect, useState } from "react";
import Link from "next/link";
import LoginPrompt from "./LoginPrompt";
import PayButton from "./PayButton";
import { useApp } from "@/lib/ctx";
import { useSocial } from "@/lib/social";
import { BASE } from "@/lib/urls";
import {
  communityError, communityUrl, fromPrice, getCommunity, joinCommunity, leaveCommunity, MAIN_SLUG, mediaSrc, payRub, payStatus, periodText, planPriceText, trialText,
  type Community,
} from "@/lib/communities";
import { getRef, payMember } from "@/lib/pay";

const gradientFor = (slug: string) => {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `linear-gradient(135deg, hsl(${h} 70% 45%), hsl(${(h + 50) % 360} 70% 35%))`;
};

export default function CommunityAbout({ c, onChange }: { c: Community; onChange: (c: Community) => void }) {
  const { lang, toast } = useApp();
  const { token } = useSocial();
  const ru = lang === "ru";
  const main = c.slug === MAIN_SLUG;
  const media = c.media || [];
  const [idx, setIdx] = useState(0);
  const [sel, setSel] = useState<number>(() => c.plans.find((p) => p.price > 0 || (p.priceRub ?? 0) > 0)?.id ?? c.plans[0]?.id ?? 0);
  const [busy, setBusy] = useState(false);
  const cur = media[Math.min(idx, Math.max(0, media.length - 1))];
  const plan = c.plans.find((p) => p.id === sel) || c.plans[0];
  const member = c.state === "member";

  async function act(fn: () => Promise<Community>, okMsg?: string) {
    setBusy(true);
    try { onChange(await fn()); if (okMsg) toast(okMsg, "ok"); }
    catch (e) { toast(communityError((e as Error).message, ru), "err"); }
    finally { setBusy(false); }
  }
  const refresh = () => { getCommunity(token, c.slug).then(onChange).catch(() => { /* обновится при следующем заходе */ }); };

  /** Оплата в рублях: сервер создаёт платёж ЮKassa (СБП), переходим на страницу оплаты */
  async function payInRub(id: number) {
    setBusy(true);
    try { const r = await payRub(token, id, getRef(c.slug)); window.location.href = r.url; }
    catch (e) { toast(communityError((e as Error).message, ru), "err"); setBusy(false); }
  }
  /** Вернулись с оплаты (?paid=…): спрашиваем у сервера статус и открываем доступ */
  useEffect(() => {
    let id = "";
    try { id = new URLSearchParams(window.location.search).get("paid") || ""; } catch { /* нет адреса */ }
    if (!id || !token) return;
    let stop = false;
    const clean = () => { try { const u = new URL(window.location.href); u.searchParams.delete("paid"); window.history.replaceState(null, "", u.toString()); } catch { /* не страшно */ } };
    (async () => {
      for (let i = 0; i < 12 && !stop; i++) {
        try {
          const r = await payStatus(token, id);
          if (r.status === "paid") { toast(ru ? "Оплата прошла, доступ открыт" : "Payment received, access granted", "ok"); clean(); refresh(); return; }
          if (r.status === "canceled" || r.status === "failed") { toast(ru ? "Платёж не прошёл" : "Payment failed", "err"); clean(); return; }
        } catch { /* повторим */ }
        await new Promise((res) => setTimeout(res, 2500));
      }
    })();
    return () => { stop = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  const copyLink = () => {
    try { void navigator.clipboard.writeText(window.location.origin + communityUrl(c.slug)); toast(ru ? "Ссылка скопирована" : "Link copied", "ok"); }
    catch { toast(window.location.origin + communityUrl(c.slug), "info"); }
  };

  const visLabel = c.visibility === "closed" ? (ru ? "Закрытое" : "Private") : ru ? "Открытое" : "Public";
  const text = c.about || c.descr;

  return (
    <div className="hm-community-layout grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
      {/* Левая колонка: галерея и описание */}
      <section className="hm-community-main space-y-4 min-w-0">
        {cur ? (
          <div className="space-y-2">
            <div className="hm-community-gallery relative aspect-video w-full overflow-hidden rounded-2xl bg-black/10 dark:bg-white/10">
              {cur.type === "video" ? (
                <iframe
                  key={cur.url} src={cur.url} title={c.name} loading="lazy" className="absolute inset-0 h-full w-full border-0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={cur.url} src={mediaSrc(cur.url)} alt={c.name} className="absolute inset-0 h-full w-full object-contain" />
              )}
            </div>
            {media.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {media.map((m, k) => (
                  <button
                    key={m.url + k} type="button" onClick={() => setIdx(k)} aria-label={`${ru ? "Показать" : "Show"} ${k + 1}`} aria-current={k === idx}
                    className={`relative h-14 w-24 shrink-0 overflow-hidden rounded-lg border-2 ${k === idx ? "border-blue-500" : "border-transparent opacity-80 hover:opacity-100"}`}
                    style={m.type === "image" || m.thumb ? undefined : { background: gradientFor(c.slug) }}
                  >
                    {(m.type === "image" || m.thumb) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.type === "image" ? mediaSrc(m.url) : m.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                    )}
                    {m.type === "video" && <span className="absolute inset-0 grid place-items-center text-white text-lg drop-shadow" aria-hidden>▶</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : c.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={mediaSrc(c.cover)} alt={c.name} className="aspect-video w-full rounded-2xl object-cover" />
        ) : null}

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold">
          <span>{c.visibility === "closed" ? "🔒" : "🌐"} {visLabel}</span>
          <span>👥 {c.members.toLocaleString(ru ? "ru-RU" : "en-US")} {ru ? "участников" : "members"}</span>
          <span>🏷 {fromPrice(c, ru)}</span>
          {c.owner && <span>{ru ? "Автор" : "By"} {c.owner}</span>}
        </div>

        <div className="space-y-3 text-[15px] leading-relaxed">
          {text.split(/\n{2,}/).map((para, k) => (
            <p key={k} className="whitespace-pre-wrap break-words">{para}</p>
          ))}
        </div>
      </section>

      {/* Правая колонка: карточка вступления */}
      <aside className="hm-community-sidebar card !p-0 overflow-hidden lg:sticky lg:top-4">
        <div className="relative aspect-[16/9] w-full" style={c.cover ? undefined : { background: gradientFor(c.slug) }}>
          {c.cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaSrc(c.cover)} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
        </div>
        <div className="space-y-3 p-4">
          <h2 className="text-xl font-extrabold leading-tight break-words">{c.name}</h2>
          <p className="text-xs opacity-60 break-all">{`himeet.online${communityUrl(c.slug)}`}</p>
          {c.descr && <p className="text-sm opacity-90 break-words">{c.descr}</p>}
          <div className="grid grid-cols-2 gap-2 border-y border-black/10 dark:border-white/10 py-3 text-center">
            <div><div className="text-lg font-bold">{c.members.toLocaleString(ru ? "ru-RU" : "en-US")}</div><div className="text-xs opacity-70">{ru ? "Участники" : "Members"}</div></div>
            <div><div className="text-lg font-bold">+{c.recent}</div><div className="text-xs opacity-70">{ru ? "За неделю" : "This week"}</div></div>
          </div>

          {main ? (
            <>
              <p className="text-sm text-center opacity-80">{ru ? "Вы уже в сообществе: оно работает прямо на этом сайте." : "You are already in: it runs right on this site."}</p>
              <Link href={`${BASE}/`} className="btn btn-primary w-full text-center">{ru ? "Открыть HiMeet" : "Open HiMeet"}</Link>
            </>
          ) : c.role === "owner" ? (
            <p className="text-sm text-center opacity-80">{ru ? "Это ваше сообщество. Настройки ниже." : "This is your community. Settings are below."}</p>
          ) : member ? (
            <>
              <p className="text-sm text-center font-semibold text-green-600">✓ {ru ? "Вы участник" : "You are a member"}</p>
              <button
                type="button" className="btn btn-ghost w-full !py-2 text-sm" disabled={busy}
                onClick={() => { if (window.confirm(ru ? "Выйти из сообщества?" : "Leave this community?")) void act(async () => { await leaveCommunity(token, c.slug); return getCommunity(token, c.slug); }); }}
              >{ru ? "Выйти" : "Leave"}</button>
            </>
          ) : c.paused ? (
            <p className="rounded-xl bg-amber-400/15 px-3 py-2 text-sm text-center">{ru ? "Сообщество на паузе: вступление временно закрыто." : "This community is paused: joining is temporarily closed."}</p>
          ) : !token ? (
            <LoginPrompt text={ru ? "Войдите, чтобы вступить." : "Sign in to join."} />
          ) : c.state === "pending" ? (
            <button type="button" className="btn btn-ghost w-full" disabled>{ru ? "Заявка отправлена" : "Request sent"}</button>
          ) : c.visibility === "open" ? (
            <button type="button" className="btn btn-primary w-full" disabled={busy} onClick={() => void act(() => joinCommunity(token, c.slug))}>
              {ru ? "Вступить бесплатно" : "Join for free"}
            </button>
          ) : (
            <div className="space-y-3">
              {c.state === "expired" && <p className="text-sm text-amber-600">{ru ? "Срок доступа закончился: продлите участие." : "Your access has expired: renew your membership."}</p>}
              {c.plans.length > 1 && (
                <div role="radiogroup" className="space-y-1">
                  {c.plans.map((p) => (
                    <button
                      key={p.id} type="button" role="radio" aria-checked={p.id === sel} onClick={() => setSel(p.id)}
                      className={`flex w-full items-center justify-between gap-2 rounded-xl border-2 px-3 py-2 text-left text-sm ${p.id === sel ? "border-blue-500" : "border-black/15 dark:border-white/20"}`}
                    >
                      <span className="font-semibold">{p.name}</span>
                      <span>{planPriceText(p, ru)}{p.price > 0 || (p.priceRub ?? 0) > 0 ? ` ${periodText(p.period, ru)}` : ""}</span>
                    </button>
                  ))}
                </div>
              )}
              {plan && (plan.price > 0 || (plan.priceRub ?? 0) > 0) ? (
                <>
                  {(plan.priceRub ?? 0) > 0 && (
                    <>
                      <button type="button" className="btn btn-primary w-full" disabled={busy} onClick={() => void payInRub(plan.id)}>
                        {ru ? "Оплатить" : "Pay"} · {plan.priceRub} ₽ {periodText(plan.period, ru)} · {ru ? "СБП" : "SBP"}
                      </button>
                      <p className="text-center text-xs opacity-60">{ru ? "Оплата через СБП (ЮKassa). Доступ откроется сразу после оплаты." : "Paid via SBP (YooKassa). Access opens right after payment."}</p>
                    </>
                  )}
                  {plan.price > 0 && (
                    <PayButton
                      className={(plan.priceRub ?? 0) > 0 ? "btn btn-ghost w-full" : "btn btn-primary w-full"} price={plan.price} payKey={`member_${c.slug}_${plan.id}`}
                      label={`${ru ? "Вступить" : "Join"} · ${plan.price} USDC ${periodText(plan.period, ru)}`}
                      run={(tx) => payMember(token, c.slug, plan.id, tx, getRef(c.slug))} onDone={refresh}
                    />
                  )}
                  {plan.price > 0 && plan.trial > 0 && c.state !== "expired" && (
                    <button type="button" className="btn btn-ghost w-full !py-2 text-sm" disabled={busy} onClick={() => void act(() => joinCommunity(token, c.slug, plan.id))}>
                      {trialText(plan.trial, ru)}
                    </button>
                  )}
                </>
              ) : (
                <button type="button" className="btn btn-primary w-full" disabled={busy} onClick={() => void act(() => joinCommunity(token, c.slug, plan?.id), ru ? "Заявка отправлена" : "Request sent")}>
                  {ru ? "Подать заявку" : "Request to join"}
                </button>
              )}
            </div>
          )}

          <button type="button" className="btn btn-ghost w-full !py-2 text-sm" onClick={copyLink}>🔗 {ru ? "Скопировать ссылку" : "Copy link"}</button>
        </div>
      </aside>
    </div>
  );
}

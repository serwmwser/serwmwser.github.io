"use client";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/lib/ctx";
import { useSocial } from "@/lib/social";
import { fetchRefSummary, microToTch, shortRefLink, TIERS, type RefKind, type RefSummary } from "@/lib/ref";
import LoginPrompt from "./LoginPrompt";

/** Единая реферальная программа HiMeet: одна ссылка (та же, что зовёт в чат без регистрации) и доход по трём направлениям.
 *  Шахматы считает контракт, объявления и знакомства и чат награждаются баллами TCH (хранятся на сайте, вывод появится позже). */
export default function RefEarnings() {
  const { lang, toast } = useApp();
  const ru = lang === "ru";
  const { token, me } = useSocial();
  const [s, setS] = useState<RefSummary | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    setFailed(false);
    fetchRefSummary(token).then((r) => { if (r) setS(r); else setFailed(true); });
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const link = me?.name && typeof location !== "undefined" ? shortRefLink(me.name) : "";
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); toast(ru ? "Ссылка скопирована" : "Link copied", "ok"); }
    catch { toast(ru ? "Не удалось скопировать" : "Could not copy", "err"); }
  };

  const r = s?.rules;
  const tch = (micro: number | undefined, d: number) => microToTch(micro ?? d);
  const rows: { k: RefKind | "chess"; icon: string; name: string; how: string; got: string }[] = [
    {
      k: "chess", icon: "♟", name: ru ? "Шахматы" : "Chess",
      how: ru ? `С каждой партии друга на токены вы получаете ${TIERS[0].pct}% (от 21 друга ${TIERS[1].pct}%, от 101 друга ${TIERS[2].pct}%) от половины комиссии. Считает контракт.` : `From each of your friend's staked games you get ${TIERS[0].pct}% (${TIERS[1].pct}% from 21 friends, ${TIERS[2].pct}% from 101) of half the fee. Counted by the contract.`,
      got: ru ? "см. раздел «Заработать»" : "see the Earn section",
    },
    {
      k: "join", icon: "💬", name: ru ? "Чат и профиль" : "Chat and profile",
      how: ru ? `Друг перешёл по ссылке, создал профиль и стал активен: +${tch(r?.join, 10_000)} TCH.` : `Your friend opened the link, created a profile and became active: +${tch(r?.join, 10_000)} TCH.`,
      got: s ? `${s.by.join.n} · +${microToTch(s.by.join.micro)} TCH` : "…",
    },
    {
      k: "ad", icon: "🛒", name: ru ? "Объявления" : "Classifieds",
      how: ru ? `Друг опубликовал первое объявление: +${tch(r?.ad, 20_000)} TCH, и +1 бесплатное объявление вам за каждого активного друга.` : `Your friend posted a first ad: +${tch(r?.ad, 20_000)} TCH, plus 1 free ad for you per active friend.`,
      got: s ? `${s.by.ad.n} · +${microToTch(s.by.ad.micro)} TCH` : "…",
    },
    {
      k: "dating", icon: "💞", name: ru ? "Знакомства (18+)" : "Dating (18+)",
      how: ru ? `Друг создал анкету знакомств: +${tch(r?.dating, 20_000)} TCH.` : `Your friend created a dating profile: +${tch(r?.dating, 20_000)} TCH.`,
      got: s ? `${s.by.dating.n} · +${microToTch(s.by.dating.micro)} TCH` : "…",
    },
  ];
  const kindName: Record<RefKind, string> = { join: ru ? "чат и профиль" : "chat and profile", ad: ru ? "объявление" : "ad", dating: ru ? "знакомства" : "dating" };

  return (
    <section className="card space-y-3 text-sm" style={{ border: "2px solid #d4a017" }} aria-label={ru ? "Реферальная программа" : "Referral program"}>
      <h2 className="text-lg font-extrabold text-center">🤝 {ru ? "Реферальная программа HiMeet" : "HiMeet referral program"}</h2>
      <p className="text-center opacity-85">
        {ru
          ? "Одна ссылка работает сразу как приглашение в чат без регистрации и как реферальная: друг открывает чат с вами, а вы получаете награды за то, что он делает в HiMeet."
          : "One link is both an invitation to a chat without sign-up and a referral link: your friend opens a chat with you, and you earn rewards for what they do in HiMeet."}
      </p>

      {link ? (
        <div className="space-y-2 text-center">
          <p className="text-xs font-mono break-all opacity-80" aria-label={ru ? "Ваша ссылка" : "Your link"}>{link}</p>
          <button type="button" className="btn btn-primary" onClick={copy}>{ru ? "Скопировать ссылку" : "Copy link"}</button>
        </div>
      ) : (
        <p className="text-center text-xs opacity-70">{ru ? "Ссылка появится, когда у вас будет логин в профиле." : "Your link appears once your profile has a username."}</p>
      )}

      <ul className="space-y-2">
        {rows.map((x) => (
          <li key={x.k} className="rounded-xl p-2.5" style={{ background: "rgba(139,77,255,.08)" }}>
            <div className="flex items-center justify-between gap-2 font-bold">
              <span><span aria-hidden="true">{x.icon}</span> {x.name}</span>
              <span className="text-xs font-semibold opacity-80">{x.got}</span>
            </div>
            <p className="text-xs opacity-80 mt-0.5">{x.how}</p>
          </li>
        ))}
      </ul>

      {token ? (
        <>
          {s && (
            <p className="text-center font-bold">
              {ru ? `Приглашено: ${s.invited}. Начислено баллами: +${microToTch(s.total)} TCH` : `Invited: ${s.invited}. Earned in points: +${microToTch(s.total)} TCH`}
            </p>
          )}
          {failed && (
            <p className="text-center text-xs opacity-70">
              {ru ? "Не удалось загрузить сводку. " : "Could not load the summary. "}
              <button type="button" className="underline" onClick={load}>{ru ? "Повторить" : "Retry"}</button>
            </p>
          )}
          {s && s.items.length > 0 && (
            <ul className="text-xs space-y-1" aria-label={ru ? "Последние награды" : "Latest rewards"}>
              {s.items.slice(0, 8).map((i, n) => (
                <li key={n} className="flex justify-between gap-2 opacity-85">
                  <span>{i.name || (ru ? "друг" : "friend")} · {kindName[i.kind]}</span>
                  <span>+{microToTch(i.micro)} TCH</span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <LoginPrompt text={ru ? "Войдите, чтобы видеть своих приглашённых и награды." : "Sign in to see your invited friends and rewards."} />
      )}

      <p className="text-xs opacity-70">
        {ru
          ? `Баллы TCH хранятся на сайте, вывод на кошелёк появится позже. Награда выдаётся один раз за каждое действие друга, когда его профиль существует не менее ${r?.minAgeHours ?? 24} ч. Не больше ${r?.dayCap ?? 20} наград в сутки на человека, общий дневной лимит ограничен. Самого себя приглашать нельзя, при накрутках награды отменяются. Условия могут меняться.`
          : `TCH points are kept on the site; withdrawal to a wallet will come later. A reward is paid once per friend action, once their profile is at least ${r?.minAgeHours ?? 24} h old. Up to ${r?.dayCap ?? 20} rewards a day per person, and the overall daily limit is capped. You cannot invite yourself, and rewards are cancelled for abuse. The terms may change.`}
      </p>
    </section>
  );
}

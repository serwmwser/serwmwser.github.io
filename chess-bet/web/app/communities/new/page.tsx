"use client";
// Создание сообщества: тарифы создателя (Start / Pro), информация о бесплатном периоде и форма (название, адрес, категории, тип, язык, описание).
// Первые 50 создателей получают 3 месяца бесплатно, остальные 14 дней; комиссия платформы с платежей участников удерживается и в этот период.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import LoginPrompt from "@/components/LoginPrompt";
import TrialBanner from "@/components/TrialBanner";
import { useApp } from "@/lib/ctx";
import { useSocial } from "@/lib/social";
import { BASE } from "@/lib/urls";
import { communityError, createCommunity, getPricing, listFilters, type Category, type Language, type Pricing } from "@/lib/communities";

const TR: Record<string, string> = { а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch", ы: "y", э: "e", ю: "yu", я: "ya" };
const toSlug = (s: string) =>
  s.toLowerCase().split("").map((ch) => TR[ch] ?? ch).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);

export default function NewCommunityPage() {
  const { lang, toast } = useApp();
  const { token } = useSocial();
  const ru = lang === "ru";

  const [pr, setPr] = useState<Pricing | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [langs, setLangs] = useState<Language[]>([]);
  const [year, setYear] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [descr, setDescr] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [vis, setVis] = useState<"open" | "closed">("open");
  const [lg, setLg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { listFilters().then((f) => { setCats(f.categories); setLangs(f.languages); }).catch(() => { /* форма работает и без списка */ }); }, []);
  const load = () => { getPricing(token || "").then(setPr).catch(() => setPr(null)); };
  useEffect(load, [token]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!slugTouched) setSlug(toSlug(name)); }, [name, slugTouched]);
  // кнопка «Создать клуб» внутри презентации прокручивает к форме
  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data === "hm-create") document.getElementById("new-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    window.addEventListener("message", h);
    return () => window.removeEventListener("message", h);
  }, []);

  const slugOk = useMemo(() => /^[a-z0-9][a-z0-9-]{2,29}$/.test(slug), [slug]);
  const formOk = name.trim().length >= 3 && slugOk && sel.length > 0;
  const toggleCat = (s: string) => setSel((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : cur.length >= 3 ? cur : [...cur, s]));

  async function submit() {
    if (busy || !formOk) return;
    setBusy(true);
    try {
      const c = await createCommunity(token, { slug, name: name.trim(), descr: descr.trim(), visibility: vis, categories: sel, language: lg || undefined });
      toast(ru ? "Сообщество создано" : "Community created", "ok");
      window.location.assign(`${BASE}/community/?slug=${encodeURIComponent(c.slug)}`);
    } catch (e) {
      toast(communityError((e as Error).message, ru), "err");
      setBusy(false);
    }
  }

  const input = "w-full rounded-xl border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 text-sm";
  const expiredSub = !!pr && !pr.canCreate && !!pr.sub; // бесплатный период или оплаченный срок закончился
  const freeText = !pr ? "" : pr.founderLeft > 0
    ? ru ? `Первые ${pr.founderSlots} создателей получают ${Math.round(pr.founderDays / 30)} месяца бесплатно. Осталось мест: ${pr.founderLeft} из ${pr.founderSlots}.` : `The first ${pr.founderSlots} creators get ${Math.round(pr.founderDays / 30)} months free. Spots left: ${pr.founderLeft} of ${pr.founderSlots}.`
    : ru ? `${pr.trialDays} дней бесплатно, без оплаты при создании.` : `${pr.trialDays} days free, nothing to pay at creation.`;

  return (
    <>
      <Header />
      <SiteNav />
      <main className="mx-auto max-w-4xl px-3 pt-4 pb-12 space-y-6">
        <Link href={`${BASE}/communities/`} className="text-sm underline opacity-80">← {ru ? "Все сообщества" : "All communities"}</Link>
        <header className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-extrabold" style={{ color: "#d4a017" }}>{ru ? "Создать сообщество" : "Create a community"}</h1>
          <p className="text-sm sm:text-base opacity-85">{ru ? "Открытое или закрытое, бесплатное или платное: цену участия (от 1 до 1000 USDC) вы задаёте сами." : "Open or private, free or paid: you set the membership price (1 to 1000 USDC) yourself."}</p>
        </header>

        <section className="space-y-2" aria-label={ru ? "Презентация для создателей" : "Presentation for creators"}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold">{ru ? "Почему стоит открыть клуб на HiMeet" : "Why open a club on HiMeet"}</h2>
            <a href={`${BASE}/creators.html?lang=${ru ? "ru" : "en"}`} target="_blank" rel="noopener" className="btn btn-ghost !py-1.5 text-sm ms-auto">{ru ? "Открыть на весь экран ↗" : "Open full screen ↗"}</a>
          </div>
          <iframe
            src={`${BASE}/creators.html?lang=${ru ? "ru" : "en"}`} title={ru ? "Презентация для создателей" : "Presentation for creators"} loading="lazy"
            className="h-[75vh] min-h-[480px] w-full rounded-2xl border border-black/10 dark:border-white/10"
          />
        </section>

        {pr && pr.ready && (
          <section className="space-y-3" aria-label={ru ? "Тарифы создателя" : "Creator plans"}>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold">{ru ? "Тарифы" : "Plans"}</h2>
              <div className="ms-auto flex gap-2">
                <button type="button" className={`chip ${!year ? "chip-on" : ""}`} onClick={() => setYear(false)}>{ru ? "Месяц" : "Monthly"}</button>
                <button type="button" className={`chip ${year ? "chip-on" : ""}`} onClick={() => setYear(true)}>{ru ? `Год (${pr.yearFreeMonths} мес. в подарок)` : `Yearly (${pr.yearFreeMonths} months free)`}</button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {pr.plans.map((p) => (
                <div key={p.id} className="card space-y-2">
                  <h3 className="text-lg font-extrabold">{ru ? p.name[0] : p.name[1]}</h3>
                  <p className="text-2xl font-extrabold">{year ? p.year : p.month} <span className="text-sm font-semibold opacity-70">USDC {year ? (ru ? "/ год" : "/ year") : ru ? "/ мес." : "/ mo"}</span></p>
                  <ul className="space-y-1 text-sm">
                    <li>✓ {ru ? `Комиссия платформы с платежей участников: ${p.feePct}%` : `Platform fee on member payments: ${p.feePct}%`}</li>
                    {p.features.map((f, k) => <li key={k}>✓ {ru ? f[0] : f[1]}</li>)}
                  </ul>
                </div>
              ))}
            </div>
            <p className="rounded-2xl border border-amber-500/50 bg-amber-400/15 px-4 py-3 text-sm">
              🎁 {freeText}{" "}
              {ru ? "Зарабатывать можно сразу: комиссия платформы с платежей участников удерживается и в бесплатный период. Перейти на «Про» можно в любой момент, остаток бесплатного времени сохранится." : "You can earn right away: the platform fee on member payments applies during the free period too. You can switch to Pro any time and keep the remaining free time."}
            </p>
            <p className="text-xs opacity-60"><Link href={`${BASE}/affiliates/`} className="underline">{ru ? `Партнёрская программа платформы: ${pr.platformAffiliatePct}% от оплат приглашённого вами создателя, пожизненно.` : `Platform affiliate programme: ${pr.platformAffiliatePct}% of the plan payments of every creator you invite, for life.`}</Link></p>
          </section>
        )}
        {pr && !pr.ready && <p className="card text-sm opacity-80">{ru ? "Создание сообществ откроется совсем скоро." : "Community creation opens very soon."}</p>}

        <div id="new-form" className="scroll-mt-4" />
        {!token ? (
          <LoginPrompt text={ru ? "Войдите, чтобы создать сообщество." : "Sign in to create a community."} />
        ) : expiredSub ? (
          <section className="space-y-3">
            <p className="text-sm opacity-80">{ru ? "Бесплатный период закончился. Оплатите тариф, чтобы создавать сообщества." : "Your free period has ended. Pay for a plan to create communities."}</p>
            <TrialBanner sub={pr!.sub} onPaid={load} />
          </section>
        ) : pr && pr.canCreate ? (
          <section className="card space-y-4" aria-label={ru ? "Новое сообщество" : "New community"}>
            <h2 className="text-lg font-bold">{ru ? "Новое сообщество" : "New community"}</h2>
            <label className="block space-y-1 text-sm">
              <span className="font-semibold">{ru ? "Название" : "Name"}</span>
              <input className={input} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={ru ? "Например, Шахматный клуб" : "e.g. Chess club"} />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-semibold">{ru ? "Адрес" : "Address"}</span>
              <input className={input} value={slug} maxLength={30} onChange={(e) => { setSlugTouched(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")); }} placeholder="chess-club" />
              <span className={`text-xs ${slug && !slugOk ? "text-red-600" : "opacity-60"}`}>{`himeet.online/community/?slug=${slug || "…"}`} · {ru ? "3–30 символов: латиница, цифры, дефис" : "3–30 chars: letters, digits, hyphen"}</span>
            </label>
            <div className="space-y-1 text-sm">
              <span className="font-semibold">{ru ? "Категории (до 3)" : "Categories (up to 3)"}</span>
              <div className="flex flex-wrap gap-2">
                {cats.map((c) => (
                  <button key={c.slug} type="button" aria-pressed={sel.includes(c.slug)} className={`chip ${sel.includes(c.slug) ? "chip-on" : ""}`} onClick={() => toggleCat(c.slug)}>
                    {c.icon} {ru ? c.ru : c.en}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 text-sm">
              <div className="space-y-1">
                <span className="font-semibold">{ru ? "Тип" : "Type"}</span>
                <div className="flex gap-2">
                  <button type="button" className={`chip ${vis === "open" ? "chip-on" : ""}`} onClick={() => setVis("open")}>🌐 {ru ? "Открытое" : "Public"}</button>
                  <button type="button" className={`chip ${vis === "closed" ? "chip-on" : ""}`} onClick={() => setVis("closed")}>🔒 {ru ? "Закрытое" : "Private"}</button>
                </div>
              </div>
              <label className="space-y-1">
                <span className="font-semibold">{ru ? "Язык сообщества" : "Community language"}</span>
                <select className={input} value={lg} onChange={(e) => setLg(e.target.value)}>
                  <option value="">{ru ? "Не указан" : "Not set"}</option>
                  {langs.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
                </select>
              </label>
            </div>
            <label className="block space-y-1 text-sm">
              <span className="font-semibold">{ru ? "Короткое описание" : "Short description"}</span>
              <textarea className={input} rows={3} maxLength={300} value={descr} onChange={(e) => setDescr(e.target.value)} />
              <span className="text-xs opacity-60">{ru ? "Подробное описание, видео, картинки и цену участия добавите на странице сообщества после создания." : "Add the long description, videos, images and membership price on the community page after creating it."}</span>
            </label>
            <button type="button" className="btn btn-primary w-full sm:w-auto" disabled={busy || !formOk} onClick={submit}>
              {busy ? "…" : ru ? "Создать сообщество" : "Create community"}
            </button>
          </section>
        ) : null}
        <SiteFooter />
      </main>
    </>
  );
}

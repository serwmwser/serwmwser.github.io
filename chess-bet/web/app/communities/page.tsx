"use client";
// Каталог сообществ: поиск, категории, фильтр как на Skool (цена, тип, сортировка, язык), карточки. «HiMeet» всегда первым.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import CommunityCard from "@/components/CommunityCard";
import { useApp } from "@/lib/ctx";
import { useSocial } from "@/lib/social";
import { BASE } from "@/lib/urls";
import { communityUrl, listCommunities, listFilters, MAIN_SLUG, myCommunities, type Category, type Community, type Language } from "@/lib/communities";

type Price = "" | "free" | "paid" | "trial";
type Kind = "" | "closed" | "open";
type Sort = "trending" | "top";
const CHIPS_SHOWN = 12;

/** Кружок-переключатель: повторное нажатие на выбранный вариант снимает выбор */
function Radio({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick} className="flex items-center gap-2 py-1.5 text-left text-sm">
      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${on ? "border-blue-500" : "border-black/30 dark:border-white/40"}`}>
        {on && <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />}
      </span>
      {children}
    </button>
  );
}

export default function CommunitiesPage() {
  const { lang } = useApp();
  const { token } = useSocial();
  const ru = lang === "ru";

  const [all, setAll] = useState<Community[] | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [langs, setLangs] = useState<Language[]>([]);
  const [mine, setMine] = useState<Community[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [price, setPrice] = useState<Price>("");
  const [kind, setKind] = useState<Kind>("");
  const [sort, setSort] = useState<Sort>("trending");
  const [lg, setLg] = useState(""); // выбранный язык каталога; пусто = все языки
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreCats, setMoreCats] = useState(false);
  const [failed, setFailed] = useState(false);
  const fRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listCommunities(token || "").then(setAll).catch(() => setFailed(true));
    listFilters().then((f) => { setCats(f.categories); setLangs(f.languages); }).catch(() => { /* без категорий каталог тоже работает */ });
  }, [token]);
  useEffect(() => {
    if (!token) { setMine([]); return; }
    myCommunities(token).then(setMine).catch(() => setMine([]));
  }, [token]);
  // панель фильтра закрывается нажатием вне её и клавишей Esc
  useEffect(() => {
    if (!filterOpen) return;
    const down = (e: MouseEvent | TouchEvent) => { if (fRef.current && !fRef.current.contains(e.target as Node)) setFilterOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setFilterOpen(false); };
    document.addEventListener("mousedown", down); document.addEventListener("touchstart", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("touchstart", down); document.removeEventListener("keydown", key); };
  }, [filterOpen]);

  const catMap = useMemo(() => Object.fromEntries(cats.map((c) => [c.slug, c])) as Record<string, Category>, [cats]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = (all || []).filter((c) => {
      if (cat && !c.categories.includes(cat)) return false;
      if (price === "free" && c.paid) return false;
      if (price === "paid" && !c.paid) return false;
      if (price === "trial" && !c.trial) return false;
      if (kind && c.visibility !== kind) return false;
      if (lg && c.language && c.language !== lg) return false; // многоязычные (без языка) видны при любом выборе
      if (s && !(c.name.toLowerCase().includes(s) || c.descr.toLowerCase().includes(s) || c.slug.includes(s))) return false;
      return true;
    });
    return [...list].sort((a, b) => (a.slug === MAIN_SLUG ? -1 : b.slug === MAIN_SLUG ? 1 : sort === "trending" ? b.recent - a.recent || b.members - a.members : b.members - a.members || b.created - a.created));
  }, [all, q, cat, price, kind, lg, sort]);

  const chipCats = moreCats ? cats : cats.slice(0, CHIPS_SHOWN);
  const filtersOn = (price ? 1 : 0) + (kind ? 1 : 0) + (lg ? 1 : 0) + (sort !== "trending" ? 1 : 0);
  const reset = () => { setPrice(""); setKind(""); setLg(""); setSort("trending"); };
  const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" className={`chip ${on ? "chip-on" : ""}`} onClick={onClick}>{children}</button>
  );

  return (
    <>
      <Header />
      <SiteNav />
      <main className="mx-auto max-w-6xl px-3 pt-6 pb-12 space-y-6">
        <header className="text-center space-y-2">
          <h1 className="text-3xl sm:text-5xl font-extrabold" style={{ color: "#d4a017" }}>{ru ? "Найдите своё сообщество" : "Discover communities"}</h1>
          <p className="text-sm sm:text-base opacity-85">
            {ru ? "или " : "or "}
            <Link href={`${BASE}/communities/new/`} className="underline font-semibold" style={{ color: "#2563eb" }}>{ru ? "создайте своё" : "create your own"}</Link>
          </p>
        </header>

        <div className="mx-auto max-w-2xl">
          <label className="card !p-0 flex items-center gap-2 px-4">
            <span aria-hidden className="opacity-60">🔍</span>
            <input
              value={q} onChange={(e) => setQ(e.target.value)} type="search" maxLength={40}
              placeholder={ru ? "Поиск по сообществам" : "Search for anything"}
              className="w-full bg-transparent py-3.5 outline-none text-base" aria-label={ru ? "Поиск" : "Search"}
            />
          </label>
        </div>

        {mine.length > 0 && (
          <section aria-label={ru ? "Мои сообщества" : "My communities"} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold">{ru ? "Мои:" : "Mine:"}</span>
            {mine.map((c) => <Link key={c.slug} href={communityUrl(c.slug)} className="chip">{catMap[c.category]?.icon || "✨"} {c.name}</Link>)}
          </section>
        )}

        <section aria-label={ru ? "Категории" : "Categories"} className="flex flex-wrap items-center justify-center gap-2">
          <Chip on={cat === ""} onClick={() => setCat("")}>🔥 {ru ? "Все" : "All"}</Chip>
          {chipCats.map((c) => <Chip key={c.slug} on={cat === c.slug} onClick={() => setCat(cat === c.slug ? "" : c.slug)}>{c.icon} {ru ? c.ru : c.en}</Chip>)}
          {cats.length > CHIPS_SHOWN && <Chip on={false} onClick={() => setMoreCats((v) => !v)}>{moreCats ? (ru ? "Меньше…" : "Less…") : (ru ? "Ещё…" : "More…")}</Chip>}

          <div ref={fRef} className="relative">
            <button type="button" className={`chip ${filtersOn || filterOpen ? "chip-on" : ""}`} aria-expanded={filterOpen} onClick={() => setFilterOpen((v) => !v)}>
              ⚙ {ru ? "Фильтр" : "Filter"}{filtersOn ? ` · ${filtersOn}` : ""}
            </button>
            {filterOpen && (
              <div role="dialog" aria-label={ru ? "Фильтр" : "Filter"} className="card absolute right-0 top-full mt-2 z-30 w-[min(92vw,26rem)] !p-4 shadow-xl text-left space-y-4">
                <div className="grid grid-cols-3 gap-3" role="radiogroup">
                  <div>
                    <div className="font-bold mb-1">{ru ? "Цена" : "Price"}</div>
                    <Radio on={price === "free"} onClick={() => setPrice(price === "free" ? "" : "free")}>{ru ? "Бесплатные" : "Free"}</Radio>
                    <Radio on={price === "paid"} onClick={() => setPrice(price === "paid" ? "" : "paid")}>{ru ? "Платные" : "Paid"}</Radio>
                    <Radio on={price === "trial"} onClick={() => setPrice(price === "trial" ? "" : "trial")}>{ru ? "Пробный период" : "Free trial"}</Radio>
                  </div>
                  <div>
                    <div className="font-bold mb-1">{ru ? "Тип" : "Type"}</div>
                    <Radio on={kind === "closed"} onClick={() => setKind(kind === "closed" ? "" : "closed")}>{ru ? "Закрытые" : "Private"}</Radio>
                    <Radio on={kind === "open"} onClick={() => setKind(kind === "open" ? "" : "open")}>{ru ? "Открытые" : "Public"}</Radio>
                  </div>
                  <div>
                    <div className="font-bold mb-1">{ru ? "Сортировка" : "Sort"}</div>
                    <Radio on={sort === "trending"} onClick={() => setSort("trending")}>{ru ? "Популярные сейчас" : "Trending"}</Radio>
                    <Radio on={sort === "top"} onClick={() => setSort("top")}>{ru ? "Лучшие" : "Top"}</Radio>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-sm font-bold" htmlFor="lg">{ru ? "Язык" : "Language"}</label>
                  <select id="lg" value={lg} onChange={(e) => setLg(e.target.value)} className="rounded-xl border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 text-sm">
                    <option value="">{ru ? "Все языки" : "All languages"}</option>
                    {langs.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
                  </select>
                </div>
                {filtersOn > 0 && <button type="button" className="text-sm underline opacity-80" onClick={reset}>{ru ? "Сбросить фильтр" : "Reset filter"}</button>}
              </div>
            )}
          </div>
        </section>

        {failed && <div className="card text-center text-sm">{ru ? "Не удалось загрузить сообщества. Попробуйте обновить страницу." : "Could not load communities. Try refreshing the page."}</div>}
        {!failed && all === null && <div className="text-center text-sm opacity-70">{ru ? "Загрузка…" : "Loading…"}</div>}
        {all !== null && shown.length === 0 && (
          <div className="card text-center text-sm space-y-2">
            <p>{ru ? "Ничего не нашлось. Попробуйте другую категорию или " : "Nothing found. Try another category or "}
              <Link href={`${BASE}/communities/new/`} className="underline">{ru ? "создайте такое сообщество сами" : "create this community yourself"}</Link>.</p>
          </div>
        )}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label={ru ? "Сообщества" : "Communities"}>
          {shown.map((c) => <CommunityCard key={c.slug} c={c} cats={catMap} />)}
        </section>

        <SiteFooter />
      </main>
    </>
  );
}

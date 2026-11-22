"use client";
// Каталог сообществ: поиск, категории, фильтр (цена, тип, сортировка), карточки. «HiMeet» всегда первым.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import CommunityCard from "@/components/CommunityCard";
import { useApp } from "@/lib/ctx";
import { useSocial } from "@/lib/social";
import { BASE } from "@/lib/urls";
import { communityUrl, listCategories, listCommunities, MAIN_SLUG, myCommunities, type Category, type Community } from "@/lib/communities";

type Price = "all" | "free" | "paid";
type Kind = "all" | "open" | "closed";
type Sort = "top" | "new";
const CHIPS_SHOWN = 12;

export default function CommunitiesPage() {
  const { lang } = useApp();
  const { token } = useSocial();
  const ru = lang === "ru";

  const [all, setAll] = useState<Community[] | null>(null);
  const [cats, setCats] = useState<Category[]>([]);
  const [mine, setMine] = useState<Community[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [price, setPrice] = useState<Price>("all");
  const [kind, setKind] = useState<Kind>("all");
  const [sort, setSort] = useState<Sort>("top");
  const [filterOpen, setFilterOpen] = useState(false);
  const [moreCats, setMoreCats] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    listCommunities(token || "").then(setAll).catch(() => setFailed(true));
    listCategories().then(setCats).catch(() => { /* без категорий каталог тоже работает */ });
  }, [token]);
  useEffect(() => {
    if (!token) { setMine([]); return; }
    myCommunities(token).then(setMine).catch(() => setMine([]));
  }, [token]);

  const catMap = useMemo(() => Object.fromEntries(cats.map((c) => [c.slug, c])) as Record<string, Category>, [cats]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = (all || []).filter((c) => {
      if (cat && !c.categories.includes(cat)) return false;
      if (price === "free" && c.paid) return false;
      if (price === "paid" && !c.paid) return false;
      if (kind !== "all" && c.visibility !== kind) return false;
      if (s && !(c.name.toLowerCase().includes(s) || c.descr.toLowerCase().includes(s) || c.slug.includes(s))) return false;
      return true;
    });
    list = [...list].sort((a, b) => (a.slug === MAIN_SLUG ? -1 : b.slug === MAIN_SLUG ? 1 : sort === "new" ? b.created - a.created : b.members - a.members || b.created - a.created));
    return list;
  }, [all, q, cat, price, kind, sort]);

  const chipCats = moreCats ? cats : cats.slice(0, CHIPS_SHOWN);
  const filtersOn = price !== "all" || kind !== "all" || sort !== "top";
  const Opt = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
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
          <Opt on={cat === ""} onClick={() => setCat("")}>🔥 {ru ? "Все" : "All"}</Opt>
          {chipCats.map((c) => <Opt key={c.slug} on={cat === c.slug} onClick={() => setCat(cat === c.slug ? "" : c.slug)}>{c.icon} {ru ? c.ru : c.en}</Opt>)}
          {cats.length > CHIPS_SHOWN && <Opt on={false} onClick={() => setMoreCats((v) => !v)}>{moreCats ? (ru ? "Меньше…" : "Less…") : (ru ? "Ещё…" : "More…")}</Opt>}
          <Opt on={filterOpen || filtersOn} onClick={() => setFilterOpen((v) => !v)}>⚙ {ru ? "Фильтр" : "Filter"}</Opt>
        </section>

        {filterOpen && (
          <section className="card mx-auto max-w-2xl grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <div className="text-sm font-bold">{ru ? "Цена" : "Price"}</div>
              <div className="flex flex-wrap gap-2">
                <Opt on={price === "all"} onClick={() => setPrice("all")}>{ru ? "Любая" : "Any"}</Opt>
                <Opt on={price === "free"} onClick={() => setPrice("free")}>{ru ? "Бесплатные" : "Free"}</Opt>
                <Opt on={price === "paid"} onClick={() => setPrice("paid")}>{ru ? "Платные" : "Paid"}</Opt>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-bold">{ru ? "Тип" : "Type"}</div>
              <div className="flex flex-wrap gap-2">
                <Opt on={kind === "all"} onClick={() => setKind("all")}>{ru ? "Любой" : "Any"}</Opt>
                <Opt on={kind === "open"} onClick={() => setKind("open")}>{ru ? "Открытые" : "Public"}</Opt>
                <Opt on={kind === "closed"} onClick={() => setKind("closed")}>{ru ? "Закрытые" : "Private"}</Opt>
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-sm font-bold">{ru ? "Сортировка" : "Sort"}</div>
              <div className="flex flex-wrap gap-2">
                <Opt on={sort === "top"} onClick={() => setSort("top")}>{ru ? "Популярные" : "Top"}</Opt>
                <Opt on={sort === "new"} onClick={() => setSort("new")}>{ru ? "Новые" : "New"}</Opt>
              </div>
            </div>
          </section>
        )}

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

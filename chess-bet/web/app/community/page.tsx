"use client";
// Страница сообщества: /community/?slug=…  Витрина для всех, для владельца ещё и баннер с таймером тарифа, настройки и партнёры.
// Реферальный код из ссылки партнёра (?ref=…) запоминается и уходит вместе с платежом участника.
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Header from "@/components/Header";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import SectionsGrid from "@/components/SectionsGrid";
import CommunityAbout from "@/components/CommunityAbout";
import CommunityManage from "@/components/CommunityManage";
import CommunityPartners from "@/components/CommunityPartners";
import ProductsSection from "@/components/ProductsSection";
import CommunityPosts from "@/components/CommunityPosts";
import TrialBanner from "@/components/TrialBanner";
import { useApp } from "@/lib/ctx";
import { useSocial } from "@/lib/social";
import { BASE } from "@/lib/urls";
import { getCommunity, MAIN_SLUG, type Community } from "@/lib/communities";
import { rememberRef } from "@/lib/pay";

function View() {
  const { lang } = useApp();
  const { token } = useSocial();
  const ru = lang === "ru";
  const params = useSearchParams();
  const slug = (params.get("slug") || MAIN_SLUG).toLowerCase();
  const ref = params.get("ref") || "";
  const [c, setC] = useState<Community | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => { if (ref) rememberRef(slug, ref); }, [slug, ref]);

  const load = useCallback(() => {
    setFailed(false);
    getCommunity(token || "", slug).then(setC).catch(() => { setC(null); setFailed(true); });
  }, [token, slug]);
  useEffect(() => { setC(null); load(); }, [load]);

  useEffect(() => {
    if (c) document.title = `${c.name} | HiMeet`;
  }, [c]);

  const owner = !!c && c.role === "owner"; // владелец сообщества или администратор (для главного сообщества HiMeet)
  const isMain = !!c && c.slug === MAIN_SLUG;

  return (
    <>
      <Header />
      <SiteNav />
      <main className="mx-auto max-w-6xl px-3 pt-4 pb-12 space-y-6">
        <Link href={`${BASE}/communities/`} className="text-sm underline opacity-80">← {ru ? "Все сообщества" : "All communities"}</Link>

        {failed && (
          <section className="card text-center space-y-3">
            <p className="text-sm opacity-80">{ru ? "Сообщество не найдено или закрыто." : "Community not found or unavailable."}</p>
            <button type="button" className="btn btn-ghost" onClick={load}>{ru ? "Повторить" : "Retry"}</button>
          </section>
        )}
        {!c && !failed && <p className="text-sm opacity-60">…</p>}

        {c && (
          <>
            {owner && !isMain && <TrialBanner sub={c.sub} onPaid={load} />}
            <header>
              <h1 className="text-2xl sm:text-3xl font-extrabold break-words">{c.name}</h1>
            </header>
            <CommunityAbout c={c} onChange={setC} />
            <CommunityPosts c={c} />
            <ProductsSection c={c} />
            {c.slug === MAIN_SLUG && token && <SectionsGrid force />}
            {owner && (
              <div className="space-y-6">
                <CommunityManage c={c} onChange={setC} />
                {!isMain && <CommunityPartners c={c} />}
              </div>
            )}
          </>
        )}
        <SiteFooter />
      </main>
    </>
  );
}

export default function CommunityPage() {
  return (
    <Suspense fallback={null}>
      <View />
    </Suspense>
  );
}

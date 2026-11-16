"use client";
import dynamic from "next/dynamic";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { useApp } from "@/lib/ctx";
import { ROUTES } from "@/lib/urls";
import { EN, RU } from "./content";

// 3D-доска грузится только в браузере (WebGL), на сервере и при сборке сайта она не нужна
const Board3D = dynamic(() => import("@/components/cartoon3d/Board3D"), {
  ssr: false,
  loading: () => <div className="card text-center text-sm opacity-70">Загрузка 3D-доски…</div>,
});

export default function Page() {
  const { lang } = useApp();
  const c = lang === "ru" ? RU : EN;
  return (
    <PageShell title={c.title} intro={c.intro}>
      <nav aria-label="Breadcrumb" className="text-xs opacity-70">
        <Link href={ROUTES.home} className="underline">HiMeet</Link> › <span>{c.crumb}</span>
      </nav>
      <Board3D />
      {c.blocks.map(([h, ps]) => (
        <section key={h} className="card space-y-2">
          <h2 className="text-lg font-bold">{h}</h2>
          {ps.map((p) => <p key={p} className="text-sm opacity-90">{p}</p>)}
        </section>
      ))}
      <section className="space-y-3" aria-label={c.featuresH}>
        <h2 className="text-lg font-bold text-center">{c.featuresH}</h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {c.features.map(([h, p]) => (
            <li key={h} className="card space-y-1"><h3 className="font-semibold">{h}</h3><p className="text-sm opacity-85">{p}</p></li>
          ))}
        </ul>
      </section>
      <section className="space-y-2" aria-label={c.faqH}>
        <h2 className="text-lg font-bold text-center">{c.faqH}</h2>
        {c.faq.map(([q, a]) => (
          <details key={q} className="card">
            <summary className="font-semibold cursor-pointer">{q}</summary>
            <p className="text-sm opacity-85 mt-2">{a}</p>
          </details>
        ))}
      </section>
      <a href={c.ctaHref} className="btn btn-primary w-full justify-center text-center">{c.cta}</a>
    </PageShell>
  );
}

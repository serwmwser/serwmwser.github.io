"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BASE, profileUrl } from "@/lib/urls";

/** Страница 404. Заодно обрабатывает короткие ссылки вида himeet.online/@ник: переводит на профиль. */
export default function NotFound() {
  const [short, setShort] = useState(false);
  useEffect(() => {
    const m = window.location.pathname.match(/\/@([A-Za-z0-9_]{1,20})\/?$/);
    if (m) { setShort(true); window.location.replace(profileUrl(m[1].toLowerCase())); }
  }, []);
  if (short) return <main className="mx-auto max-w-xl px-4 py-16 text-center opacity-70">…</main>;
  return (
    <main className="mx-auto max-w-xl px-4 py-16 text-center">
      <h1 className="text-3xl font-extrabold">404</h1>
      <p className="mt-2 opacity-80">Страница не найдена / Page not found</p>
      <Link href={BASE + "/"} className="btn btn-primary mt-6 inline-block">HiMeet</Link>
    </main>
  );
}

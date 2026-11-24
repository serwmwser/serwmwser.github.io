"use client";
// Админ-раздел «Реклама»: реклама на главной странице (сообщество, продукт сообщества, внешний ресурс).
// Блок на главной виден только пока есть хотя бы одна активная реклама в пределах дат показа.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import LoginPrompt from "@/components/LoginPrompt";
import PageShell from "@/components/PageShell";
import { useApp } from "@/lib/ctx";
import { useSocial } from "@/lib/social";
import { modMe } from "@/lib/mod";
import { uploadFile } from "@/lib/attach";
import { deletePromo, listPromosAdmin, mediaSrc, promoError, savePromo, type PromoAdmin, type PromoKind } from "@/lib/promos";

const KINDS: [PromoKind, string, string][] = [
  ["community", "Сообщество", "Community"],
  ["product", "Продукт сообщества", "Community product"],
  ["external", "Внешний ресурс", "External resource"],
];

type Form = {
  id: number; kind: PromoKind; title: string; text: string; image: string; url: string; slug: string;
  starts: string; ends: string; active: boolean; // даты в формате ГГГГ-ММ-ДД, пусто = без ограничения
};
const EMPTY: Form = { id: 0, kind: "external", title: "", text: "", image: "", url: "", slug: "", starts: "", ends: "", active: true };

/** Начало дня (для «с») и конец дня (для «по») по местному времени админа */
const startOf = (d: string) => (d ? new Date(`${d}T00:00:00`).getTime() : 0);
const endOf = (d: string) => (d ? new Date(`${d}T23:59:59`).getTime() : 0);
const dayStr = (t: number) => {
  if (!t) return "";
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

function Manager({ token }: { token: string }) {
  const { lang, toast } = useApp();
  const ru = lang === "ru";
  const [items, setItems] = useState<PromoAdmin[] | null>(null);
  const [f, setF] = useState<Form>(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    listPromosAdmin(token).then(setItems).catch((e) => { setItems([]); toast(promoError(e, ru), "err"); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  const edit = (p: PromoAdmin) => {
    setF({ id: p.id, kind: p.kind, title: p.title, text: p.text, image: p.image, url: p.url, slug: p.slug, starts: dayStr(p.starts), ends: dayStr(p.ends), active: p.active });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try { const r = await uploadFile(token, file); set("image", r.path); }
    catch (e) { toast(promoError(e, ru), "err"); }
    finally { setBusy(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await savePromo(token, {
        id: f.id || undefined, kind: f.kind, title: f.title, text: f.text, image: f.image, url: f.url, slug: f.slug,
        starts: startOf(f.starts), ends: endOf(f.ends), active: f.active,
      });
      toast(ru ? "Сохранено" : "Saved", "ok");
      setF(EMPTY); load();
    } catch (err) { toast(promoError(err, ru), "err"); }
    finally { setBusy(false); }
  };

  const toggle = async (p: PromoAdmin) => {
    try {
      await savePromo(token, { id: p.id, kind: p.kind, title: p.title, text: p.text, image: p.image, url: p.url, slug: p.slug, starts: p.starts, ends: p.ends, active: !p.active });
      load();
    } catch (err) { toast(promoError(err, ru), "err"); }
  };

  const remove = async (p: PromoAdmin) => {
    if (!window.confirm(ru ? `Удалить рекламу «${p.title}»?` : `Delete the ad “${p.title}”?`)) return;
    try { await deletePromo(token, p.id); if (f.id === p.id) setF(EMPTY); load(); }
    catch (err) { toast(promoError(err, ru), "err"); }
  };

  const status = (p: PromoAdmin) => {
    if (!p.active) return ru ? "выключена" : "off";
    if (p.live) return ru ? "показывается" : "live";
    return p.starts > Date.now() ? (ru ? "ждёт начала" : "scheduled") : (ru ? "срок вышел" : "expired");
  };
  const dateText = (t: number) => (t ? new Date(t).toLocaleDateString(ru ? "ru-RU" : "en-GB") : "");
  const ctr = (p: PromoAdmin) => (p.views ? `${Math.round((p.clicks / p.views) * 1000) / 10}%` : "—");

  const field = "w-full rounded-xl border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="card space-y-3">
        <h2 className="font-bold">{f.id ? (ru ? "Изменить рекламу" : "Edit ad") : ru ? "Новая реклама" : "New ad"}</h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label={ru ? "Вид рекламы" : "Ad kind"}>
          {KINDS.map(([k, a, b]) => (
            <button key={k} type="button" aria-pressed={f.kind === k} className={`chip ${f.kind === k ? "chip-on" : ""}`} onClick={() => set("kind", k)}>{ru ? a : b}</button>
          ))}
        </div>
        <label className="block text-sm">{ru ? "Заголовок (до 80 символов)" : "Title (up to 80 characters)"}
          <input className={field} value={f.title} maxLength={80} onChange={(e) => set("title", e.target.value)} required />
        </label>
        <label className="block text-sm">{ru ? "Текст (до 240 символов)" : "Text (up to 240 characters)"}
          <textarea className={field} rows={3} value={f.text} maxLength={240} onChange={(e) => set("text", e.target.value)} />
        </label>
        {f.kind === "community" && (
          <label className="block text-sm">{ru ? "Адрес сообщества (slug), ссылка подставится сама" : "Community slug (the link is filled in automatically)"}
            <input className={field} value={f.slug} maxLength={30} onChange={(e) => set("slug", e.target.value)} placeholder="himeet" />
          </label>
        )}
        <label className="block text-sm">{ru ? "Ссылка: https://… или адрес на сайте, например /community/?slug=himeet" : "Link: https://… or a site path such as /community/?slug=himeet"}
          <input className={field} value={f.url} maxLength={500} onChange={(e) => set("url", e.target.value)} placeholder="https://" />
        </label>
        <div className="space-y-2">
          <div className="text-sm">{ru ? "Картинка (JPG, PNG, WebP; лучше 16:9)" : "Image (JPG, PNG, WebP; 16:9 works best)"}</div>
          {f.image && (
            <div className="flex items-center gap-3">
              <img src={mediaSrc(f.image)} alt="" className="h-20 w-36 rounded-lg object-cover" />
              <button type="button" className="btn btn-ghost !py-1.5 text-sm" onClick={() => set("image", "")}>{ru ? "Убрать" : "Remove"}</button>
            </div>
          )}
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} className="text-sm" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">{ru ? "Показывать с (пусто = сразу)" : "Show from (empty = now)"}
            <input type="date" className={field} value={f.starts} onChange={(e) => set("starts", e.target.value)} />
          </label>
          <label className="block text-sm">{ru ? "Показывать по (пусто = без срока)" : "Show until (empty = no end)"}
            <input type="date" className={field} value={f.ends} onChange={(e) => set("ends", e.target.value)} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} />
          {ru ? "Включена" : "Enabled"}
        </label>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className="btn btn-primary">{busy ? "…" : f.id ? (ru ? "Сохранить" : "Save") : ru ? "Добавить" : "Add"}</button>
          {f.id !== 0 && <button type="button" className="btn btn-ghost" onClick={() => setF(EMPTY)}>{ru ? "Отмена" : "Cancel"}</button>}
        </div>
      </form>

      <section className="space-y-3">
        <h2 className="font-bold">{ru ? "Вся реклама" : "All ads"}</h2>
        {!items ? <p className="text-sm opacity-60">…</p> : items.length === 0 ? (
          <p className="text-sm opacity-70">{ru ? "Рекламы пока нет, поэтому блок на главной скрыт." : "No ads yet, so the block on the home page is hidden."}</p>
        ) : items.map((p) => (
          <article key={p.id} className="card flex flex-wrap items-center gap-3">
            {p.image ? <img src={mediaSrc(p.image)} alt="" className="h-14 w-24 rounded-lg object-cover" /> : <div className="h-14 w-24 rounded-lg bg-black/10 dark:bg-white/10" />}
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{p.title}</div>
              <div className="text-xs opacity-70">
                {(() => { const k = KINDS.find((x) => x[0] === p.kind); return k ? (ru ? k[1] : k[2]) : p.kind; })()} · {status(p)}
                {(p.starts || p.ends) ? ` · ${dateText(p.starts) || "…"} — ${dateText(p.ends) || "…"}` : ""}
              </div>
              <div className="text-xs opacity-70">{ru ? "Показы" : "Views"}: {p.views} · {ru ? "Клики" : "Clicks"}: {p.clicks} · CTR {ctr(p)}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-ghost !py-1.5 text-sm" onClick={() => edit(p)}>{ru ? "Изменить" : "Edit"}</button>
              <button type="button" className="btn btn-ghost !py-1.5 text-sm" onClick={() => void toggle(p)}>{p.active ? (ru ? "Выключить" : "Turn off") : ru ? "Включить" : "Turn on"}</button>
              <button type="button" className="btn btn-ghost !py-1.5 text-sm text-red-500" onClick={() => void remove(p)}>{ru ? "Удалить" : "Delete"}</button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

export default function AdminPromosPage() {
  const { lang } = useApp();
  const s = useSocial();
  const ru = lang === "ru";
  const [admin, setAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!s.token) { setAdmin(null); return; }
    let alive = true;
    modMe(s.token).then((a) => { if (alive) setAdmin(!!a); }).catch(() => { if (alive) setAdmin(false); });
    return () => { alive = false; };
  }, [s.token]);

  return (
    <PageShell title={ru ? "Реклама на главной" : "Home page advertising"} intro={ru ? "Блок рекламы на главной появляется сам, когда есть хотя бы одна включённая реклама в пределах дат." : "The ad block on the home page appears by itself once at least one enabled ad is within its dates."}>
      {!s.token ? (
        <LoginPrompt text={ru ? "Войдите кошельком администратора." : "Sign in with the admin wallet."} />
      ) : admin === null ? (
        <p className="text-sm opacity-60">…</p>
      ) : !admin ? (
        <section className="card text-center text-sm opacity-80">{ru ? "У этого кошелька нет доступа." : "This wallet has no access."}</section>
      ) : (
        <>
          <nav><Link href="/admin/" className="btn btn-ghost !py-2">← {ru ? "Модерация" : "Moderation"}</Link></nav>
          <Manager token={s.token} />
        </>
      )}
    </PageShell>
  );
}

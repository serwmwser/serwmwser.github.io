"use client";
// Панель владельца сообщества: описание и настройки, тарифы для участников, заявки на вступление.
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/ctx";
import { useSocial } from "@/lib/social";
import { fileErr, uploadFile } from "@/lib/attach";
import {
  addPlan, communityError, decideRequest, listFilters, listRequests, periodText, planPriceText, removePlan, trialText, updateCommunity,
  MAIN_SLUG, type Category, type Community, type JoinRequest, type Language, type MediaItem, type PlanPeriod,
} from "@/lib/communities";

const PERIODS: PlanPeriod[] = ["month", "quarter", "year", "lifetime"];

export default function CommunityManage({ c, onChange }: { c: Community; onChange: (c: Community) => void }) {
  const { lang, toast } = useApp();
  const { token } = useSocial();
  const ru = lang === "ru";
  const isMain = c.slug === MAIN_SLUG;

  const [cats, setCats] = useState<Category[]>([]);
  const [langs, setLangs] = useState<Language[]>([]);
  const [name, setName] = useState(c.name);
  const [descr, setDescr] = useState(c.descr);
  const [cover, setCover] = useState(c.cover);
  const [about, setAbout] = useState(c.about || "");
  const [media, setMedia] = useState<MediaItem[]>(c.media || []);
  const [link, setLink] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const [vis, setVis] = useState<"open" | "closed">(c.visibility);
  const [sel, setSel] = useState<string[]>(c.categories);
  const [lg, setLg] = useState(c.language);
  const [busy, setBusy] = useState(false);

  const [pName, setPName] = useState("");
  const [pPeriod, setPPeriod] = useState<PlanPeriod>("month");
  const [pPrice, setPPrice] = useState("");
  const [pRub, setPRub] = useState("");
  const [pTrial, setPTrial] = useState("0");
  const [reqs, setReqs] = useState<JoinRequest[]>([]);

  useEffect(() => { listFilters().then((f) => { setCats(f.categories); setLangs(f.languages); }).catch(() => { /* без списка категорий форма тоже работает */ }); }, []);
  const loadReqs = useCallback(() => {
    if (c.visibility === "closed") listRequests(token, c.slug).then(setReqs).catch(() => setReqs([]));
    else setReqs([]);
  }, [token, c.slug, c.visibility]);
  useEffect(() => { loadReqs(); }, [loadReqs]);

  const run = async (f: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await f(); } catch (e) { toast(communityError((e as Error).message, ru), "err"); } finally { setBusy(false); }
  };
  const isVideoLink = (u: string) => /^https:\/\/((www|m)\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com|vimeo\.com|player\.vimeo\.com|rutube\.ru)\//i.test(u);
  const addLink = () => {
    const u = link.trim();
    if (media.length >= 8) { toast(ru ? "Не больше 8 элементов" : "Up to 8 items", "err"); return; }
    if (!/^https:\/\/[^\s"'<>]{3,300}$/.test(u)) { toast(ru ? "Нужна ссылка, начинающаяся с https://" : "A link starting with https:// is required", "err"); return; }
    setMedia((m) => [...m, { type: isVideoLink(u) ? "video" : "image", url: u, thumb: "" }]);
    setLink("");
  };
  const addPhoto = (file?: File) => run(async () => {
    if (!file) return;
    if (media.length >= 8) { toast(ru ? "Не больше 8 элементов" : "Up to 8 items", "err"); return; }
    try { const r = await uploadFile(token, file); setMedia((m) => [...m, { type: "image", url: r.path, thumb: "" }]); }
    catch (e) { toast(fileErr(e, ru), "err"); }
  });
  const uploadCover = (file?: File) => run(async () => {
    if (!file) return;
    try { const r = await uploadFile(token, file); setCover(r.path); }
    catch (e) { toast(fileErr(e, ru), "err"); }
  });
  const moveUp = (k: number) => setMedia((m) => (k > 0 ? [...m.slice(0, k - 1), m[k], m[k - 1], ...m.slice(k + 1)] : m));
  const toggleCat = (slug: string) => setSel((s) => (s.includes(slug) ? s.filter((x) => x !== slug) : s.length >= 3 ? s : [...s, slug]));

  const save = () => run(async () => {
    const nc = await updateCommunity(token, c.slug, { name, descr, about, media: media.map((m) => ({ type: m.type, url: m.url })), cover, visibility: isMain ? undefined : vis, categories: sel.length ? sel : ["other"], language: lg });
    onChange(nc);
    setMedia(nc.media || []); setAbout(nc.about || "");
    toast(ru ? "Сохранено" : "Saved", "ok");
  });
  const add = () => run(async () => {
    const price = Number(pPrice.replace(",", "."));
    onChange(await addPlan(token, c.slug, { name: pName, period: pPeriod, price: Number.isFinite(price) ? price : -1, priceRub: Number(pRub) || 0, trial: Number(pTrial) || 0 }));
    setPName(""); setPPrice(""); setPRub(""); setPTrial("0");
  });
  const decide = (addr: string, ok: boolean) => run(async () => { await decideRequest(token, c.slug, addr, ok); loadReqs(); });

  const input = "w-full rounded-xl border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 text-sm";
  const pn = Number(pPrice.replace(",", "."));
  const rn = Number(pRub);
  const rubOk = pRub === "" || (Number.isInteger(rn) && rn >= 50 && rn <= 100000); // рубли: пусто или от 50 до 100 000 ₽
  const usdcOk = pPrice !== "" && Number.isFinite(pn) && (pn === 0 || (pn >= 1 && pn <= 1000)); // USDC: бесплатно или от 1 до 1000
  const priceOk = rubOk && (usdcOk || (pPrice === "" && pRub !== ""));

  return (
    <section className="card space-y-5" aria-label={ru ? "Управление сообществом" : "Manage community"}>
      <h2 className="text-lg font-bold">⚙ {ru ? "Управление сообществом" : "Manage community"}</h2>

      <div className="space-y-3">
        <label className="block space-y-1 text-sm"><span className="font-semibold">{ru ? "Название" : "Name"}</span>
          <input className={input} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></label>
        <label className="block space-y-1 text-sm"><span className="font-semibold">{ru ? "Описание" : "Description"}</span>
          <textarea className={input} rows={3} value={descr} maxLength={300} onChange={(e) => setDescr(e.target.value)} /></label>
        <div className="space-y-1 text-sm">
          <div className="font-semibold">{ru ? "Обложка (ссылка https://… или загрузка фото)" : "Cover (https://… link or photo upload)"}</div>
          <div className="flex gap-2">
            <input className={input} value={cover} maxLength={300} onChange={(e) => setCover(e.target.value)} placeholder="https://" />
            <button type="button" className="btn btn-ghost !py-2 shrink-0" disabled={busy} aria-label={ru ? "Загрузить фото" : "Upload photo"} onClick={() => coverRef.current?.click()}>📷</button>
            <input ref={coverRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { void uploadCover(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
        </div>

        <label className="block space-y-1 text-sm"><span className="font-semibold">{ru ? "Страница сообщества: подробное описание" : "Community page: full description"}</span>
          <textarea className={input} rows={8} value={about} maxLength={4000} onChange={(e) => setAbout(e.target.value)}
            placeholder={ru ? "О чём сообщество, что получит участник, для кого оно. Абзацы разделяйте пустой строкой." : "What the community is about, what members get, who it is for. Separate paragraphs with an empty line."} /></label>

        <div className="space-y-2 text-sm">
          <div className="font-semibold">{ru ? "Галерея: видео и фото (до 8)" : "Gallery: videos and photos (up to 8)"}</div>
          <p className="text-xs opacity-70">{ru ? "Видео: ссылка на YouTube, Vimeo или RuTube. Фото: ссылка https://… или загрузка. Первый элемент показывается на странице сообщества первым." : "Videos: a YouTube, Vimeo or RuTube link. Photos: an https://… link or an upload. The first item is shown first on the community page."}</p>
          {media.map((m, k) => (
            <div key={m.url + k} className="flex items-center justify-between gap-2 rounded-2xl bg-black/5 dark:bg-white/5 px-3 py-2">
              <span className="min-w-0 truncate">{m.type === "video" ? "▶" : "🖼"} {m.url.replace(/^https:\/\//, "")}</span>
              <span className="flex shrink-0 gap-1">
                {k > 0 && <button type="button" className="btn btn-ghost !px-2 !py-1" aria-label={ru ? "Выше" : "Move up"} onClick={() => moveUp(k)}>↑</button>}
                <button type="button" className="btn btn-ghost !px-2 !py-1" aria-label={ru ? "Убрать" : "Remove"} onClick={() => setMedia((x) => x.filter((_, i) => i !== k))}>✕</button>
              </span>
            </div>
          ))}
          <div className="flex gap-2">
            <input className={input} value={link} maxLength={300} placeholder={ru ? "Ссылка на видео или фото (https://…)" : "Video or photo link (https://…)"} onChange={(e) => setLink(e.target.value)} />
            <button type="button" className="btn btn-ghost !py-2 shrink-0" disabled={busy || !link.trim()} onClick={addLink}>＋</button>
            <button type="button" className="btn btn-ghost !py-2 shrink-0" disabled={busy} aria-label={ru ? "Загрузить фото" : "Upload photo"} onClick={() => fileRef.current?.click()}>📷</button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { void addPhoto(e.target.files?.[0]); e.target.value = ""; }} />
          </div>
          <p className="text-xs opacity-60">{ru ? "После изменений нажмите «Сохранить»." : "Press “Save” after making changes."}</p>
        </div>

        {!isMain && (
          <div className="space-y-1 text-sm">
            <div className="font-semibold">{ru ? "Доступ" : "Access"}</div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={`chip ${vis === "open" ? "chip-on" : ""}`} onClick={() => setVis("open")}>🌐 {ru ? "Открытое: вступает любой" : "Public: anyone can join"}</button>
              <button type="button" className={`chip ${vis === "closed" ? "chip-on" : ""}`} onClick={() => setVis("closed")}>🔒 {ru ? "Закрытое: по заявке или тарифу" : "Private: by request or plan"}</button>
            </div>
          </div>
        )}

        <div className="space-y-1 text-sm">
          <div className="font-semibold">{ru ? "Категории (до 3)" : "Categories (up to 3)"}</div>
          <div className="flex flex-wrap gap-1.5">
            {cats.map((k) => <button key={k.slug} type="button" className={`chip ${sel.includes(k.slug) ? "chip-on" : ""}`} onClick={() => toggleCat(k.slug)}>{k.icon} {ru ? k.ru : k.en}</button>)}
          </div>
        </div>

        <label className="flex items-center justify-between gap-3 text-sm"><span className="font-semibold">{ru ? "Язык сообщества" : "Community language"}</span>
          <select className="rounded-xl border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 text-sm" value={lg} onChange={(e) => setLg(e.target.value)}>
            <option value="">{ru ? "Многоязычное" : "Multilingual"}</option>
            {langs.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select></label>

        <button type="button" className="btn btn-primary" disabled={busy || name.trim().length < 3} onClick={save}>{ru ? "Сохранить" : "Save"}</button>
      </div>

      {!isMain && c.visibility === "closed" && (
        <div className="space-y-3 border-t border-black/10 dark:border-white/10 pt-4">
          <h3 className="font-bold">{ru ? "Тарифы для участников" : "Member plans"}</h3>
          <p className="text-xs opacity-70">{ru
            ? "Цена в USDC: 0 (бесплатно) или от 1 до 1000. Участники платят в USDC, платформа удерживает комиссию (10% на тарифе «Старт», 3% на «Про»), остальное выплачивается вам по понедельникам за прошлую неделю. Пробный период даёт доступ без оплаты на заданное число дней (один раз на человека)."
            : "Price in USDC: 0 (free) or from 1 to 1000. Members pay in USDC; the platform keeps a fee (10% on Start, 3% on Pro) and the rest is paid out to you on Mondays for the previous week. A free trial gives access for the given number of days (once per person)."}</p>
          {c.plans.length === 0 && <div className="text-sm opacity-70">{ru ? "Тарифов пока нет, вступление по заявке." : "No plans yet, people join by request."}</div>}
          {c.plans.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-2xl bg-black/5 dark:bg-white/5 px-3 py-2 text-sm">
              <span><b>{p.name}</b> · {planPriceText(p, ru)} {p.price > 0 || (p.priceRub ?? 0) > 0 ? periodText(p.period, ru) : ""}{p.trial > 0 ? ` · ${trialText(p.trial, ru)}` : ""}</span>
              <button type="button" className="btn btn-ghost !px-3 !py-1.5" disabled={busy} onClick={() => run(async () => onChange(await removePlan(token, c.slug, p.id)))}>{ru ? "Убрать" : "Remove"}</button>
            </div>
          ))}
          <p className="text-xs opacity-70">{ru
            ? "Цена в рублях (от 50 до 100 000 ₽): участники платят через СБП (ЮKassa), доступ открывается сразу. Комиссия платформы та же (10% на «Старт», 3% на «Про»), остальное выплачивается по понедельникам за прошлую неделю. Можно указать только рубли, только USDC или обе цены."
            : "Ruble price (50 to 100,000 RUB): members pay via SBP (YooKassa), access opens right away. Same platform fee (10% on Start, 3% on Pro); the rest is paid out on Mondays for the previous week. You can set rubles only, USDC only, or both."}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input className={input} placeholder={ru ? "Название тарифа" : "Plan name"} value={pName} maxLength={40} onChange={(e) => setPName(e.target.value)} />
            <select className={input} value={pPeriod} onChange={(e) => setPPeriod(e.target.value as PlanPeriod)}>
              {PERIODS.map((p) => <option key={p} value={p}>{periodText(p, ru)}</option>)}
            </select>
            <input className={input} placeholder={ru ? "Цена, USDC (0 = бесплатно)" : "Price, USDC (0 = free)"} inputMode="decimal" value={pPrice} onChange={(e) => setPPrice(e.target.value)} />
            <input className={input} placeholder={ru ? "Цена, ₽ (через СБП, необязательно)" : "Price, RUB (via SBP, optional)"} inputMode="numeric" value={pRub} onChange={(e) => setPRub(e.target.value.replace(/\D/g, "").slice(0, 6))} />
            <input className={input} placeholder={ru ? "Пробный период, дней" : "Free trial, days"} inputMode="numeric" value={pTrial} onChange={(e) => setPTrial(e.target.value.replace(/\D/g, "").slice(0, 2))} />
          </div>
          <button type="button" className="btn btn-ghost" disabled={busy || pName.trim().length < 2 || !priceOk} onClick={add}>＋ {ru ? "Добавить тариф" : "Add plan"}</button>
        </div>
      )}

      {!isMain && c.visibility === "closed" && (
        <div className="space-y-2 border-t border-black/10 dark:border-white/10 pt-4">
          <h3 className="font-bold">{ru ? "Заявки на вступление" : "Join requests"} {reqs.length > 0 && <span className="chip chip-on !py-0">{reqs.length}</span>}</h3>
          {reqs.length === 0 && <div className="text-sm opacity-70">{ru ? "Новых заявок нет." : "No new requests."}</div>}
          {reqs.map((r) => (
            <div key={r.addr} className="flex items-center justify-between gap-2 rounded-2xl bg-black/5 dark:bg-white/5 px-3 py-2 text-sm">
              <span className="break-all">{r.name || r.addr}</span>
              <span className="flex gap-2">
                <button type="button" className="btn btn-primary !px-3 !py-1.5" disabled={busy} onClick={() => decide(r.addr, true)}>{ru ? "Принять" : "Accept"}</button>
                <button type="button" className="btn btn-ghost !px-3 !py-1.5" disabled={busy} onClick={() => decide(r.addr, false)}>{ru ? "Отклонить" : "Decline"}</button>
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

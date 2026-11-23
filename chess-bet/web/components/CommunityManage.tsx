"use client";
// Панель владельца сообщества: описание и настройки, тарифы для участников, заявки на вступление.
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/lib/ctx";
import { useSocial } from "@/lib/social";
import {
  addPlan, communityError, decideRequest, listFilters, listRequests, periodText, priceText, removePlan, trialText, updateCommunity,
  MAIN_SLUG, type Category, type Community, type JoinRequest, type Language, type PlanPeriod,
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
  const [vis, setVis] = useState<"open" | "closed">(c.visibility);
  const [sel, setSel] = useState<string[]>(c.categories);
  const [lg, setLg] = useState(c.language);
  const [busy, setBusy] = useState(false);

  const [pName, setPName] = useState("");
  const [pPeriod, setPPeriod] = useState<PlanPeriod>("month");
  const [pPrice, setPPrice] = useState("");
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
  const toggleCat = (slug: string) => setSel((s) => (s.includes(slug) ? s.filter((x) => x !== slug) : s.length >= 3 ? s : [...s, slug]));

  const save = () => run(async () => {
    const nc = await updateCommunity(token, c.slug, { name, descr, cover, visibility: isMain ? undefined : vis, categories: sel.length ? sel : ["other"], language: lg });
    onChange(nc);
    toast(ru ? "Сохранено" : "Saved", "ok");
  });
  const add = () => run(async () => {
    const price = Number(pPrice.replace(",", "."));
    onChange(await addPlan(token, c.slug, { name: pName, period: pPeriod, price: Number.isFinite(price) ? price : -1, trial: Number(pTrial) || 0 }));
    setPName(""); setPPrice(""); setPTrial("0");
  });
  const decide = (addr: string, ok: boolean) => run(async () => { await decideRequest(token, c.slug, addr, ok); loadReqs(); });

  const input = "w-full rounded-xl border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 text-sm";

  return (
    <section className="card space-y-5" aria-label={ru ? "Управление сообществом" : "Manage community"}>
      <h2 className="text-lg font-bold">⚙ {ru ? "Управление сообществом" : "Manage community"}</h2>

      <div className="space-y-3">
        <label className="block space-y-1 text-sm"><span className="font-semibold">{ru ? "Название" : "Name"}</span>
          <input className={input} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></label>
        <label className="block space-y-1 text-sm"><span className="font-semibold">{ru ? "Описание" : "Description"}</span>
          <textarea className={input} rows={3} value={descr} maxLength={300} onChange={(e) => setDescr(e.target.value)} /></label>
        <label className="block space-y-1 text-sm"><span className="font-semibold">{ru ? "Обложка (ссылка на картинку, https://…)" : "Cover (image link, https://…)"}</span>
          <input className={input} value={cover} maxLength={300} onChange={(e) => setCover(e.target.value)} placeholder="https://" /></label>

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
            ? "Цена в USDC. Пробный период даёт доступ без оплаты на заданное число дней (один раз на человека). Приём оплаты тарифов подключим позже, до этого вступление идёт по заявке."
            : "Price in USDC. A free trial gives access for the given number of days (once per person). Paying for plans is coming soon; until then people join by request."}</p>
          {c.plans.length === 0 && <div className="text-sm opacity-70">{ru ? "Тарифов пока нет, вступление по заявке." : "No plans yet, people join by request."}</div>}
          {c.plans.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-2xl bg-black/5 dark:bg-white/5 px-3 py-2 text-sm">
              <span><b>{p.name}</b> · {priceText(p.price, ru)} {p.price > 0 ? periodText(p.period, ru) : ""}{p.trial > 0 ? ` · ${trialText(p.trial, ru)}` : ""}</span>
              <button type="button" className="btn btn-ghost !px-3 !py-1.5" disabled={busy} onClick={() => run(async () => onChange(await removePlan(token, c.slug, p.id)))}>{ru ? "Убрать" : "Remove"}</button>
            </div>
          ))}
          <div className="grid gap-2 sm:grid-cols-2">
            <input className={input} placeholder={ru ? "Название тарифа" : "Plan name"} value={pName} maxLength={40} onChange={(e) => setPName(e.target.value)} />
            <select className={input} value={pPeriod} onChange={(e) => setPPeriod(e.target.value as PlanPeriod)}>
              {PERIODS.map((p) => <option key={p} value={p}>{periodText(p, ru)}</option>)}
            </select>
            <input className={input} placeholder={ru ? "Цена, USDC (0 = бесплатно)" : "Price, USDC (0 = free)"} inputMode="decimal" value={pPrice} onChange={(e) => setPPrice(e.target.value)} />
            <input className={input} placeholder={ru ? "Пробный период, дней" : "Free trial, days"} inputMode="numeric" value={pTrial} onChange={(e) => setPTrial(e.target.value.replace(/\D/g, "").slice(0, 2))} />
          </div>
          <button type="button" className="btn btn-ghost" disabled={busy || pName.trim().length < 2 || pPrice === ""} onClick={add}>＋ {ru ? "Добавить тариф" : "Add plan"}</button>
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

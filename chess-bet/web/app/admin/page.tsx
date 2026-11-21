"use client";
import LoginPrompt from "@/components/LoginPrompt";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PageShell from "@/components/PageShell";
import { useApp } from "@/lib/ctx";
import { API_URL } from "@/lib/config";
import { useSocial } from "@/lib/social";
import { postUrl, profileUrl } from "@/lib/urls";
import { modAction, modErr, modMe, modReports, modUsers, type ModAction, type ModItem, type ModKind, type ModUser } from "@/lib/mod";

const KIND_LABEL: Record<ModKind, [string, string]> = {
  post: ["Пост", "Post"], comment: ["Комментарий", "Comment"], dm: ["Личное сообщение", "Direct message"], user: ["Профиль", "Profile"],
};

function Reports({ token }: { token: string }) {
  const { lang, toast } = useApp();
  const ru = lang === "ru";
  const [items, setItems] = useState<ModItem[] | null>(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    modReports(token).then(setItems).catch((e) => { setItems([]); toast(modErr(e, ru), "err"); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const act = async (it: ModItem, action: ModAction) => {
    if (action === "delete" && !window.confirm(ru ? "Удалить это?" : "Delete this?")) return;
    if (action === "ban" && !window.confirm(ru ? `Заблокировать автора (${it.info.author})?` : `Ban the author (${it.info.author})?`)) return;
    const key = it.kind + it.target;
    setBusy(key);
    try { await modAction(token, it.kind, it.target, action); load(); }
    catch (e) { toast(modErr(e, ru), "err"); }
    finally { setBusy(""); }
  };

  if (!items) return <p className="text-sm opacity-60">…</p>;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">{ru ? "Открытые жалобы" : "Open reports"} ({items.length})</h2>
        <button type="button" className="btn btn-ghost !py-1.5 text-sm" onClick={load}>↻ {ru ? "Обновить" : "Refresh"}</button>
      </div>
      {items.length === 0 && <p className="card text-center text-sm opacity-70">{ru ? "Жалоб нет. Всё спокойно 🙂" : "No reports. All quiet 🙂"}</p>}
      {items.map((it) => {
        const key = it.kind + it.target;
        const link = it.kind === "post" ? postUrl(it.target) : it.kind === "comment" && it.info.post ? postUrl(it.info.post) : it.kind === "user" ? profileUrl(it.info.author) : "";
        return (
          <article key={key} className="card space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-black/10 dark:bg-white/10 px-2 py-0.5 text-xs font-semibold">{ru ? KIND_LABEL[it.kind][0] : KIND_LABEL[it.kind][1]}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${it.count >= 3 ? "bg-red-500 text-white" : "bg-amber-400/80"}`}>⚑ {it.count}</span>
              <b>@{it.info.author}</b>
              {it.info.banned && <span className="text-xs text-red-500">{ru ? "заблокирован" : "banned"}</span>}
              {it.info.deleted && <span className="text-xs opacity-60">{ru ? "уже удалено" : "already removed"}</span>}
              {link && <Link href={link} target="_blank" className="ms-auto text-xs underline opacity-70">{ru ? "открыть" : "open"}</Link>}
            </div>
            {it.info.text && <p className="whitespace-pre-wrap break-words rounded-lg bg-black/5 dark:bg-white/5 p-2 text-sm">{it.info.text}</p>}
            {!!it.info.media && <p className="text-xs opacity-60">📷 {it.info.media}</p>}
            {it.kind === "dm" && it.info.to && <p className="text-xs opacity-60">{ru ? "Кому" : "To"}: @{it.info.to}</p>}
            {it.reasons.length > 0 && <p className="text-xs opacity-80">{ru ? "Причины" : "Reasons"}: {it.reasons.join(" · ")}</p>}
            <div className="flex flex-wrap gap-2">
              {it.kind !== "user" && !it.info.deleted && <button type="button" disabled={busy === key} className="btn btn-danger !py-1.5 text-sm" onClick={() => act(it, "delete")}>🗑 {ru ? "Удалить" : "Delete"}</button>}
              {!it.info.banned
                ? <button type="button" disabled={busy === key} className="btn btn-danger !py-1.5 text-sm" onClick={() => act(it, "ban")}>⛔ {ru ? "Заблокировать автора" : "Ban author"}</button>
                : <button type="button" disabled={busy === key} className="btn btn-ghost !py-1.5 text-sm" onClick={() => act(it, "unban")}>✔ {ru ? "Разблокировать" : "Unban"}</button>}
              <button type="button" disabled={busy === key} className="btn btn-ghost !py-1.5 text-sm" onClick={() => act(it, "dismiss")}>{ru ? "Отклонить жалобу" : "Dismiss"}</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function Users({ token }: { token: string }) {
  const { lang, toast } = useApp();
  const ru = lang === "ru";
  const [q, setQ] = useState("");
  const [list, setList] = useState<ModUser[] | null>(null);

  const load = useCallback((query: string) => {
    modUsers(token, query).then(setList).catch((e) => { setList([]); toast(modErr(e, ru), "err"); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  useEffect(() => { const t = setTimeout(() => load(q.trim()), 300); return () => clearTimeout(t); }, [q, load]);

  const toggle = async (u: ModUser) => {
    if (!u.banned && !window.confirm(ru ? `Заблокировать @${u.name}?` : `Ban @${u.name}?`)) return;
    try { await modAction(token, "user", u.name, u.banned ? "unban" : "ban"); load(q.trim()); }
    catch (e) { toast(modErr(e, ru), "err"); }
  };

  return (
    <div className="space-y-3">
      <input className="w-full rounded-lg border px-3 py-2 bg-transparent" value={q} maxLength={20} onChange={(e) => setQ(e.target.value)}
        placeholder={ru ? "Ник пользователя (пусто: заблокированные)" : "Username (empty: banned users)"} />
      {list && list.length === 0 && <p className="card text-center text-sm opacity-70">{ru ? "Никого не найдено" : "Nobody found"}</p>}
      {list?.map((u) => (
        <div key={u.name} className="card flex items-center gap-3">
          <Link href={profileUrl(u.name)} target="_blank" className="font-semibold hover:underline">@{u.name}</Link>
          {u.banned && <span className="text-xs text-red-500">{ru ? "заблокирован" : "banned"}</span>}
          <button type="button" className={`ms-auto btn !py-1.5 text-sm ${u.banned ? "btn-ghost" : "btn-danger"}`} onClick={() => toggle(u)}>
            {u.banned ? (ru ? "Разблокировать" : "Unban") : (ru ? "Заблокировать" : "Ban")}
          </button>
        </div>
      ))}
    </div>
  );
}

type FRow = { open: number; message: number; feature: number; signup_click: number; signup_done: number };
type FSummary = { days: number; byDay: (FRow & { day: string })[]; bySrc: (FRow & { src: string })[]; features: { id: string; n: number }[]; langs: { lang: string; n: number }[] };

/** Воронка приглашений: открыли ссылку → написали → попробовали функции → нажали «создать профиль» → создали профиль. Без личных данных. */
function Funnel({ token }: { token: string }) {
  const { lang } = useApp();
  const ru = lang === "ru";
  const [days, setDays] = useState(14);
  const [d, setD] = useState<FSummary | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let alive = true;
    const [wallet, tok] = token.split("|");
    setD(null); setErr("");
    fetch(`${API_URL}/api/funnel/summary?days=${days}`, { cache: "no-store", headers: { authorization: `Bearer ${tok}`, "x-wallet": wallet } })
      .then((r) => r.json())
      .then((j: { ok: boolean; error?: string } & Partial<FSummary>) => { if (!alive) return; if (j.ok) setD(j as FSummary); else setErr(j.error || "error"); })
      .catch(() => { if (alive) setErr("offline"); });
    return () => { alive = false; };
  }, [token, days]);

  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) + "%" : "—");
  const total = (rows: FRow[]): FRow => rows.reduce((t, r) => ({ open: t.open + r.open, message: t.message + r.message, feature: t.feature + r.feature, signup_click: t.signup_click + r.signup_click, signup_done: t.signup_done + r.signup_done }), { open: 0, message: 0, feature: 0, signup_click: 0, signup_done: 0 });
  const head = ru ? ["Открыли", "Написали", "Функции", "«Создать профиль»", "Профиль создан"] : ["Opened", "Wrote", "Features", "“Create profile”", "Profile created"];
  const th = "px-2 py-1 text-right font-semibold whitespace-nowrap";
  const td = "px-2 py-1 text-right tabular-nums";
  const cells = (r: FRow) => [r.open, r.message, r.feature, r.signup_click, r.signup_done].map((v, i) => <td key={i} className={td}>{v}</td>);

  if (err) return <section className="card text-sm" role="alert">{ru ? "Не удалось загрузить воронку: " : "Could not load the funnel: "}{err}</section>;
  if (!d) return <p className="text-sm opacity-60">…</p>;
  const t = total(d.byDay);
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {[7, 14, 30].map((n) => <button key={n} type="button" aria-pressed={days === n} className={days === n ? "chip chip-on" : "chip"} onClick={() => setDays(n)}>{n} {ru ? "дн." : "d"}</button>)}
      </div>
      <div className="card space-y-1 text-sm">
        <h2 className="font-bold">{ru ? "Итого за период (уникальные гости)" : "Period total (unique guests)"}</h2>
        <p>{ru ? "Открыли" : "Opened"}: <b>{t.open}</b> → {ru ? "написали" : "wrote"}: <b>{t.message}</b> ({pct(t.message, t.open)}) → {ru ? "нажали «создать профиль»" : "clicked “create profile”"}: <b>{t.signup_click}</b> ({pct(t.signup_click, t.open)}) → {ru ? "создали профиль" : "created profile"}: <b>{t.signup_done}</b> ({pct(t.signup_done, t.open)})</p>
        <p className="text-xs opacity-70">{ru ? "Считаются люди, а не события; один гость в день учитывается один раз. Суммы по дням могут быть больше, чем число людей, если гость заходил в разные дни." : "People are counted, not events; one guest counts once per day. Day totals can exceed the number of people if a guest returned on other days."}</p>
      </div>
      <div className="card overflow-x-auto">
        <h2 className="font-bold text-sm mb-1">{ru ? "По источникам (метка ?s= в ссылке или сайт-источник)" : "By source (?s= tag in the link or referring site)"}</h2>
        <table className="w-full text-xs">
          <thead><tr><th className="px-2 py-1 text-left">{ru ? "Источник" : "Source"}</th>{head.map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody>{d.bySrc.map((r) => <tr key={r.src} className="border-t border-white/10"><td className="px-2 py-1">{r.src}</td>{cells(r)}</tr>)}</tbody>
        </table>
      </div>
      <div className="card overflow-x-auto">
        <h2 className="font-bold text-sm mb-1">{ru ? "По дням" : "By day"}</h2>
        <table className="w-full text-xs">
          <thead><tr><th className="px-2 py-1 text-left">{ru ? "День" : "Day"}</th>{head.map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody>{d.byDay.map((r) => <tr key={r.day} className="border-t border-white/10"><td className="px-2 py-1">{r.day}</td>{cells(r)}</tr>)}</tbody>
        </table>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card text-xs space-y-1">
          <h2 className="font-bold text-sm">{ru ? "Какие функции нажимают" : "Features clicked"}</h2>
          {d.features.length ? d.features.map((x) => <p key={x.id} className="flex justify-between"><span>{x.id}</span><b>{x.n}</b></p>) : <p className="opacity-70">—</p>}
        </div>
        <div className="card text-xs space-y-1">
          <h2 className="font-bold text-sm">{ru ? "Языки посетителей" : "Visitor languages"}</h2>
          {d.langs.length ? d.langs.map((x) => <p key={x.lang} className="flex justify-between"><span>{x.lang}</span><b>{x.n}</b></p>) : <p className="opacity-70">—</p>}
        </div>
      </div>
    </section>
  );
}

export default function AdminPage() {
  const { lang } = useApp();
  const ru = lang === "ru";
  const s = useSocial();
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<"reports" | "users" | "funnel">("reports");

  useEffect(() => {
    if (!s.token) { setAdmin(null); return; }
    let alive = true;
    modMe(s.token).then((a) => { if (alive) setAdmin(a); }).catch(() => { if (alive) setAdmin(false); });
    return () => { alive = false; };
  }, [s.token]);

  return (
    <PageShell title={ru ? "Модерация" : "Moderation"}>
      {!s.token ? (
        <LoginPrompt text={ru ? "Войдите кошельком модератора." : "Sign in with the moderator wallet."} />
      ) : admin === null ? (
        <p className="text-sm opacity-60">…</p>
      ) : !admin ? (
        <section className="card text-center text-sm opacity-80">{ru ? "У этого кошелька нет доступа к модерации." : "This wallet has no moderator access."}</section>
      ) : (
        <>
          <nav className="flex gap-2" aria-label={ru ? "Разделы" : "Sections"}>
            <button type="button" aria-pressed={tab === "reports"} className={tab === "reports" ? "btn btn-primary !py-2" : "btn btn-ghost !py-2"} onClick={() => setTab("reports")}>⚑ {ru ? "Жалобы" : "Reports"}</button>
            <button type="button" aria-pressed={tab === "users"} className={tab === "users" ? "btn btn-primary !py-2" : "btn btn-ghost !py-2"} onClick={() => setTab("users")}>👤 {ru ? "Пользователи" : "Users"}</button>
            <button type="button" aria-pressed={tab === "funnel"} className={tab === "funnel" ? "btn btn-primary !py-2" : "btn btn-ghost !py-2"} onClick={() => setTab("funnel")}>📊 {ru ? "Воронка" : "Funnel"}</button>
          </nav>
          {tab === "reports" ? <Reports token={s.token} /> : tab === "funnel" ? <Funnel token={s.token} /> : <Users token={s.token} />}
        </>
      )}
    </PageShell>
  );
}

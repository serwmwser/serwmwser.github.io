"use client";
// Админ-раздел «Получено»: платежи участников и создателей, комиссия платформы, суммы к выплате владельцам и партнёрам.
// Выплаты делаются по понедельникам за предыдущую неделю (пн–вс, UTC): администратор переводит USDC вручную и отмечает выплату.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import LoginPrompt from "@/components/LoginPrompt";
import PageShell from "@/components/PageShell";
import { useApp } from "@/lib/ctx";
import { useSocial } from "@/lib/social";
import { modMe } from "@/lib/mod";
import { adminIncome, adminMark, payError, type Income } from "@/lib/pay";

const DAY = 86400000;
const usdc = (n: number) => (Math.round(n * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const short = (a: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

function Report({ token }: { token: string }) {
  const { lang, toast } = useApp();
  const ru = lang === "ru";
  const loc = ru ? "ru-RU" : "en-GB";
  const date = (t: number) => new Date(t).toLocaleDateString(loc, { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });
  const [data, setData] = useState<Income | null>(null);
  const [due, setDue] = useState(0); // 0 = ближайшая неделя с невыплаченными суммами
  const [busy, setBusy] = useState("");

  const load = useCallback((d: number) => {
    adminIncome(token, d || undefined).then(setData).catch((e) => { setData(null); toast(payError(e, ru), "err"); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  useEffect(() => { load(due); }, [load, due]);

  const copy = (text: string) => {
    try { void navigator.clipboard.writeText(text); toast(ru ? "Скопировано" : "Copied", "ok"); } catch { toast(text, "info"); }
  };
  const mark = async (payee: string) => {
    if (!data) return;
    const ids = data.items.filter((i) => i.payee === payee && i.status === "pending").map((i) => i.id);
    if (!ids.length) return;
    const tx = window.prompt(ru ? "Хеш перевода (можно оставить пустым):" : "Transfer hash (optional):", "");
    if (tx === null) return;
    setBusy(payee);
    try { await adminMark(token, ids, tx.trim()); toast(ru ? "Отмечено как выплаченное" : "Marked as paid", "ok"); load(due); }
    catch (e) { toast(payError(e, ru), "err"); }
    finally { setBusy(""); }
  };

  if (!data) return <p className="text-sm opacity-60">…</p>;
  const pendingRows = data.byPayee.filter((b) => b.pending > 0);
  const list = pendingRows.map((b) => `${b.payee}\t${usdc(b.pending)}`).join("\n");

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold" htmlFor="due">{ru ? "Выплата в понедельник" : "Payout on Monday"}</label>
        <select id="due" className="rounded-lg border border-black/20 dark:border-white/20 bg-transparent px-2 py-1.5 text-sm" value={data.due} onChange={(e) => setDue(Number(e.target.value))}>
          {(data.dues.includes(data.due) ? data.dues : [data.due, ...data.dues]).map((d) => (
            <option key={d} value={d}>{date(d)} · {ru ? "за" : "for"} {date(d - 7 * DAY)}–{date(d - DAY)}</option>
          ))}
        </select>
        <button type="button" className="btn btn-ghost !py-1.5 text-sm ms-auto" onClick={() => load(due)}>↻ {ru ? "Обновить" : "Refresh"}</button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="card"><div className="text-xs opacity-70">{ru ? "Получено" : "Received"}</div><div className="text-lg font-bold">{usdc(data.totals.gross)}</div></div>
        <div className="card"><div className="text-xs opacity-70">{ru ? "Комиссия платформы" : "Platform fee"}</div><div className="text-lg font-bold">{usdc(data.totals.fee)}</div></div>
        <div className="card"><div className="text-xs opacity-70">{ru ? "К выплате" : "To pay out"}</div><div className="text-lg font-bold">{usdc(data.totals.payout)}</div></div>
      </div>
      <p className="text-xs opacity-60">{ru ? "Суммы в USDC. Комиссия платформы остаётся на вашем кошельке; к выплате относится часть владельцев, партнёров и пригласивших." : "Amounts in USDC. The platform fee stays in your wallet; the payout part belongs to owners, partners and referrers."}</p>

      <section className="card space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold">{ru ? "Кому выплатить" : "Who to pay"}</h2>
          {pendingRows.length > 0 && <button type="button" className="btn btn-ghost !py-1.5 text-sm ms-auto" onClick={() => copy(list)}>⧉ {ru ? "Копировать список" : "Copy list"}</button>}
        </div>
        {data.byPayee.length === 0 && <p className="text-sm opacity-70">{ru ? "За эту неделю платежей нет." : "No payments this week."}</p>}
        {data.byPayee.map((b) => (
          <div key={b.payee} className="flex flex-wrap items-center gap-2 border-t border-black/10 dark:border-white/10 pt-2 text-sm">
            <div className="min-w-0">
              <div className="font-semibold">{b.name}</div>
              <button type="button" className="font-mono text-xs opacity-70 underline" title={b.payee} onClick={() => copy(b.payee)}>{short(b.payee)}</button>
            </div>
            <div className="ms-auto text-right">
              <div className="font-bold">{usdc(b.total)} USDC</div>
              <div className="text-xs opacity-70">{b.pending > 0 ? `${ru ? "к выплате" : "pending"}: ${usdc(b.pending)}` : ru ? "выплачено" : "paid"}</div>
            </div>
            {b.pending > 0 && (
              <button type="button" className="btn btn-primary !py-1.5 text-sm" disabled={busy === b.payee} onClick={() => mark(b.payee)}>
                {ru ? "Отметить выплаченным" : "Mark as paid"}
              </button>
            )}
          </div>
        ))}
      </section>

      <section className="card space-y-2">
        <h2 className="text-lg font-bold">{ru ? "Платежи" : "Payments"}</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs opacity-70">
              <tr>
                <th className="py-1 pe-2">{ru ? "Дата" : "Date"}</th>
                <th className="pe-2">{ru ? "Сообщество" : "Community"}</th>
                <th className="pe-2">{ru ? "От кого" : "From"}</th>
                <th className="pe-2 text-right">{ru ? "Получено" : "Received"}</th>
                <th className="pe-2 text-right">{ru ? "Комиссия" : "Fee"}</th>
                <th className="pe-2 text-right">{ru ? "Выплата" : "Payout"}</th>
                <th className="pe-2">{ru ? "Кошелёк" : "Wallet"}</th>
                <th>{ru ? "Статус" : "Status"}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((i) => (
                <tr key={i.id} className="border-t border-black/10 dark:border-white/10 align-top">
                  <td className="py-1.5 pe-2 whitespace-nowrap">{date(i.at)}</td>
                  <td className="pe-2">
                    {i.kind === "member" ? <Link href={`/community/?slug=${encodeURIComponent(i.community)}`} className="underline">{i.title}</Link> : i.title}
                    <div className="text-xs opacity-60">{i.role === "owner" ? (ru ? "владельцу" : "owner") : i.role === "partner" ? (ru ? "партнёру" : "partner") : ru ? "пригласившему" : "referrer"}</div>
                  </td>
                  <td className="pe-2">{i.fromName}</td>
                  <td className="pe-2 text-right whitespace-nowrap">{usdc(i.gross)}</td>
                  <td className="pe-2 text-right whitespace-nowrap">{usdc(i.fee)}</td>
                  <td className="pe-2 text-right whitespace-nowrap font-semibold">{usdc(i.amount)}</td>
                  <td className="pe-2 font-mono text-xs"><button type="button" title={i.payee} className="underline" onClick={() => copy(i.payee)}>{short(i.payee)}</button></td>
                  <td className="whitespace-nowrap">{i.status === "paid" ? <span className="text-green-600">✓ {ru ? "выплачено" : "paid"}</span> : <span className="text-amber-600">{ru ? "ожидает" : "pending"}</span>}</td>
                </tr>
              ))}
              {data.items.length === 0 && <tr><td colSpan={8} className="py-3 text-center opacity-70">{ru ? "Нет платежей" : "No payments"}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default function IncomePage() {
  const { lang } = useApp();
  const ru = lang === "ru";
  const s = useSocial();
  const [admin, setAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!s.token) { setAdmin(null); return; }
    let alive = true;
    modMe(s.token).then((a) => { if (alive) setAdmin(a); }).catch(() => { if (alive) setAdmin(false); });
    return () => { alive = false; };
  }, [s.token]);

  return (
    <PageShell title={ru ? "Получено" : "Income"} intro={ru ? "Платежи сообществ, комиссия платформы и выплаты по понедельникам за прошлую неделю." : "Community payments, platform fee and Monday payouts for the previous week."}>
      {!s.token ? (
        <LoginPrompt text={ru ? "Войдите кошельком администратора." : "Sign in with the admin wallet."} />
      ) : admin === null ? (
        <p className="text-sm opacity-60">…</p>
      ) : !admin ? (
        <section className="card text-center text-sm opacity-80">{ru ? "У этого кошелька нет доступа." : "This wallet has no access."}</section>
      ) : (
        <>
          <Link href="/admin/" className="text-sm underline opacity-80">← {ru ? "Модерация" : "Moderation"}</Link>
          <Report token={s.token} />
        </>
      )}
    </PageShell>
  );
}

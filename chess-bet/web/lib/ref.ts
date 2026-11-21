// Реферальная программа «Вечный гамбит»: ссылка, учёт переходов, ставки уровней.
import { ensureToken } from "./session";
import { API_URL } from "./config";
import { buildInviteLink } from "./invite-link";
export const REF_ENABLED = process.env.NEXT_PUBLIC_REFERRAL === "1";
const KEY = "cb_ref";
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const TIERS = [
  { id: "start", from: 0, pct: 10 },
  { id: "leader", from: 21, pct: 20 },
  { id: "legend", from: 101, pct: 30 },
] as const;

export const tierOf = (friends: number) => (friends >= 101 ? TIERS[2] : friends >= 21 ? TIERS[1] : TIERS[0]);

/** Доля реферера с одной партии ОДНОГО приглашённого игрока: % × половина комиссии 10%. */
export const perGame = (betUsdc: number, pct: number) => betUsdc * 0.10 * (pct / 100);

/** Сохраняет ?ref=0x… из ссылки (первый пригласивший остаётся навсегда). */
export function captureRef() {
  try {
    const r = new URLSearchParams(location.search).get("ref");
    if (r && /^0x[a-fA-F0-9]{40}$/.test(r) && !localStorage.getItem(KEY)) localStorage.setItem(KEY, r.toLowerCase());
  } catch {}
}
export function getRef(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
export const refLink = (addr: string) => `${location.origin}${BASE}/?ref=${addr}`;
/** Единая ссылка: приглашает в чат без регистрации и одновременно является реферальной (/i/?u=ник) */
export const shortRefLink = (nick: string) => buildInviteLink(location.origin, nick);

/** Сводка программы: сколько пришло по моей ссылке и что начислено баллами TCH (в микро-TCH: 1 TCH = 1 000 000) */
export type RefKind = "join" | "ad" | "dating";
export type RefSummary = {
  invited: number;
  by: Record<RefKind, { n: number; micro: number }>;
  total: number;
  items: { kind: RefKind; micro: number; created: number; name: string }[];
  rules: { join: number; ad: number; dating: number; minAgeHours: number; dayCap: number };
};
export const microToTch = (micro: number) => (micro / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 });

/** Запросить сводку (нужен токен входа вида «кошелёк|токен»); при ошибке вернёт null */
export async function fetchRefSummary(token: string): Promise<RefSummary | null> {
  const [wallet, tok] = token.split("|");
  if (!tok) return null;
  try {
    const r = await fetch(`${API_URL}/api/refs/summary`, { cache: "no-store", headers: { authorization: `Bearer ${tok}`, "x-wallet": wallet } });
    const j = await r.json();
    return j && j.ok ? (j as RefSummary) : null;
  } catch { return null; }
}

/** После входа: подписываем (бесплатно, без газа) привязку к пригласившему и отправляем серверу. Один раз на адрес. */
export async function registerRef(account: { address: string; signMessage: (a: { message: string }) => Promise<string> }) {
  const ref = getRef();
  const user = account.address.toLowerCase();
  if (!REF_ENABLED || !ref || ref === user) return;
  const k = `cb_ref_sent_${user}`;
  try {
    if (localStorage.getItem(k)) return;
    const token = await ensureToken(account); // та же одна подпись входа, второй не нужно
    const sig = token ? "" : await account.signMessage({ message: `ChessBet referral\nUser: ${user}\nReferrer: ${ref}` });
    const { postRef } = await import("./api");
    const r = await postRef({ address: user, ref, sig, token: token || undefined });
    if (r.ok || r.error === "already_played") localStorage.setItem(k, "1");
  } catch {}
}

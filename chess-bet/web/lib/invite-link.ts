// HiMeet invite: короткая ссылка приглашения /i/?u=ник и гостевая сессия (localStorage этого браузера).
// Старые длинные ссылки /i/?ref=0x…&n=Имя&m=Текст тоже читаются.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const GUEST_LIMIT = 20; // сообщений в сутки для гостя
const MAX_KEPT = 200; // сколько сообщений хранить в браузере
const MAX_QUEUE = 20; // сколько неотправленных сообщений держать в очереди

/** user = ник пригласившего из короткой ссылки; ref = адрес из старой ссылки */
export type InviteInfo = { user: string | null; ref: string | null; name: string; message: string };
export type GuestMsg = { from: "them" | "me"; text: string; ts: number };
/** Сообщение, написанное без сети: уйдёт, когда появится интернет */
export type GuestQueued = { k: string; text: string; ts: number };
/** Копия переписки для чтения без интернета */
export type GuestCached = { id: number; side: "guest" | "inviter"; text: string; created: number; read?: boolean };
export type GuestSession = {
  id: string; ref: string | null; day: string; sent: number;
  msgs: GuestMsg[]; queue: GuestQueued[]; cache: GuestCached[];
};

const clean = (s: string, max: number) => s.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);
const today = () => new Date().toISOString().slice(0, 10);
const NAME_RE = /^[\p{L}\p{N}_.-]{2,32}$/u;

/** Кого указывать серверу как пригласившего: ник (короткая ссылка) или адрес (старая) */
export const inviteTarget = (i: InviteInfo): string | null => i.user || i.ref;

/** Читает параметры ссылки приглашения; всё лишнее отбрасывается, текст очищается. */
export function readInvite(search: string): InviteInfo {
  const p = new URLSearchParams(search);
  const u = (p.get("u") || "").trim().toLowerCase();
  const r = p.get("ref") || "";
  const user = NAME_RE.test(u) ? u : null;
  return {
    user,
    ref: /^0x[a-fA-F0-9]{40}$/.test(r) ? r.toLowerCase() : null,
    name: clean(p.get("n") || "", 30) || user || "",
    message: clean(p.get("m") || "", 200),
  };
}

/** Короткая ссылка приглашения: https://himeet.online/i/?u=ник */
export function buildInviteLink(origin: string, nick: string): string {
  return `${origin}${BASE}/i/?u=${encodeURIComponent(nick.trim().toLowerCase())}`;
}

const keyOf = (ref: string | null) => "hm_guest_" + (ref ?? "none");
const newId = () => {
  try { return crypto.randomUUID(); } catch { return "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
};

/** Загружает гостевую сессию для этого пригласившего (или создаёт новую). Счётчик сообщений сбрасывается каждые сутки. */
export function loadGuest(target: string | null): GuestSession {
  let s: GuestSession | null = null;
  try {
    const raw = localStorage.getItem(keyOf(target));
    if (raw) {
      const p = JSON.parse(raw) as Partial<GuestSession>;
      if (p && typeof p.id === "string" && Array.isArray(p.msgs)) {
        s = { id: p.id, ref: target, day: p.day || today(), sent: p.sent || 0, msgs: p.msgs, queue: Array.isArray(p.queue) ? p.queue : [], cache: Array.isArray(p.cache) ? p.cache : [] };
      }
    }
  } catch { /* без хранилища */ }
  if (!s) s = { id: newId(), ref: target, day: today(), sent: 0, msgs: [], queue: [], cache: [] };
  if (s.day !== today()) { s.day = today(); s.sent = 0; }
  return s;
}

export function saveGuest(s: GuestSession): void {
  try {
    const keep: GuestSession = { ...s, msgs: s.msgs.slice(-MAX_KEPT), queue: s.queue.slice(-MAX_QUEUE), cache: s.cache.slice(-MAX_KEPT) };
    localStorage.setItem(keyOf(s.ref), JSON.stringify(keep));
  } catch { /* без хранилища: сессия живёт до закрытия вкладки */ }
}

export const guestLeft = (s: GuestSession) => Math.max(0, GUEST_LIMIT - s.sent);
export { MAX_QUEUE };

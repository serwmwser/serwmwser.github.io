// HiMeet invite: ссылка приглашения /i/?ref=0x…&n=Имя&m=Сообщение и гостевая сессия (localStorage этого браузера).
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const GUEST_LIMIT = 20; // сообщений в сутки для гостя
const MAX_KEPT = 200; // сколько сообщений хранить в браузере

export type InviteInfo = { ref: string | null; name: string; message: string };
export type GuestMsg = { from: "them" | "me"; text: string; ts: number };
export type GuestSession = { id: string; ref: string | null; day: string; sent: number; msgs: GuestMsg[] };

const clean = (s: string, max: number) => s.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);
const today = () => new Date().toISOString().slice(0, 10);

/** Читает параметры ссылки приглашения; всё лишнее отбрасывается, текст очищается. */
export function readInvite(search: string): InviteInfo {
  const p = new URLSearchParams(search);
  const r = p.get("ref") || "";
  return {
    ref: /^0x[a-fA-F0-9]{40}$/.test(r) ? r.toLowerCase() : null,
    name: clean(p.get("n") || "", 30),
    message: clean(p.get("m") || "", 200),
  };
}

/** Собирает ссылку приглашения: адрес пригласившего, его имя и первое сообщение (необязательно). */
export function buildInviteLink(origin: string, addr: string, name?: string, message?: string): string {
  const q = new URLSearchParams({ ref: addr.toLowerCase() });
  if (name) q.set("n", clean(name, 30));
  if (message) q.set("m", clean(message, 200));
  return `${origin}${BASE}/i/?${q.toString()}`;
}

const keyOf = (ref: string | null) => "hm_guest_" + (ref ?? "none");
const newId = () => {
  try { return crypto.randomUUID(); } catch { return "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
};

/** Загружает гостевую сессию для этого пригласившего (или создаёт новую). Счётчик сообщений сбрасывается каждые сутки. */
export function loadGuest(ref: string | null): GuestSession {
  let s: GuestSession | null = null;
  try {
    const raw = localStorage.getItem(keyOf(ref));
    if (raw) {
      const p = JSON.parse(raw) as GuestSession;
      if (p && typeof p.id === "string" && Array.isArray(p.msgs)) s = p;
    }
  } catch { /* без хранилища */ }
  if (!s) s = { id: newId(), ref, day: today(), sent: 0, msgs: [] };
  if (s.day !== today()) { s.day = today(); s.sent = 0; }
  return s;
}

export function saveGuest(s: GuestSession): void {
  try {
    const keep: GuestSession = { ...s, msgs: s.msgs.slice(-MAX_KEPT) };
    localStorage.setItem(keyOf(s.ref), JSON.stringify(keep));
  } catch { /* без хранилища: сессия живёт до закрытия вкладки */ }
}

export const guestLeft = (s: GuestSession) => Math.max(0, GUEST_LIMIT - s.sent);

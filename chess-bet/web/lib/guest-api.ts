"use client";
// Запросы к гостевому чату (сервер: server/src/guest.ts). Гость идёт без входа, пригласивший — с токеном входа.
import { API_URL } from "./config";

export type GuestItem = { id: number; side: "guest" | "inviter"; text: string; created: number; read?: boolean };
export type GuestThreadInfo = { g: string; name: string; unread: number; last: string; mine: boolean; at: number; blocked?: boolean };
export type Tr = { text: string; same: boolean };

type Ok<T> = { ok: true } & T;
type Fail = { ok: false; error: string };

/** Ошибка «нет сети»: сообщение ставится в очередь и уйдёт позже */
export const isOffline = (e: unknown) => (e as Error | undefined)?.message === "offline";

async function call<T>(path: string, o: { token?: string; post?: unknown } = {}): Promise<Ok<T>> {
  const [wallet, tok] = (o.token || "").split("|");
  let r: Response;
  try {
    r = await fetch(`${API_URL}${path}`, {
      method: o.post === undefined ? "GET" : "POST",
      cache: "no-store",
      headers: { ...(o.post === undefined ? {} : { "content-type": "application/json" }), ...(tok ? { authorization: `Bearer ${tok}`, "x-wallet": wallet } : {}) },
      body: o.post === undefined ? undefined : JSON.stringify(o.post),
    });
  } catch { throw new Error("offline"); } // нет сети или сервер недоступен
  let j: Ok<T> | Fail;
  try { j = (await r.json()) as Ok<T> | Fail; } catch { throw new Error("server"); }
  if (!j.ok) throw new Error((j as Fail).error || "error");
  return j;
}

// ---- гость (без входа) ----
/** Кто пригласил: ник в адрес кошелька (для реферальной привязки); 404 no_inviter, если ника нет */
export const guestInviter = (u: string) => call<{ name: string; addr: string }>(`/api/guest/inviter?u=${encodeURIComponent(u)}`);
/** Отправить сообщение пригласившему (ref — ник или адрес из ссылки) */
export const guestSend = (g: string, ref: string, name: string, text: string) =>
  call<{ id: number; left: number }>("/api/guest/send", { post: { g, ref, name, text } });
/** Переписка гостя: сообщения после номера since */
export const guestThread = (g: string, ref: string, since: number) =>
  call<{ items: GuestItem[]; left: number; blocked: boolean }>(`/api/guest/thread?g=${encodeURIComponent(g)}&ref=${encodeURIComponent(ref)}&since=${since}`);
/** Перевод текста на язык браузера; при ошибке вернёт null */
export async function guestTranslate(text: string, to: string, g: string): Promise<Tr | null> {
  try {
    const r = await call<{ text: string; same: boolean }>("/api/guest/translate", { post: { text, to, g } });
    return { text: r.text, same: !!r.same };
  } catch { return null; }
}
/** Удалить своё сообщение */
export const guestDelete = (g: string, id: number) => call<{ removed: boolean }>("/api/guest/delete", { post: { g, id } });
/** Пожаловаться на сообщение пригласившего */
export const guestReport = (g: string, id: number, reason = "") => call<Record<string, never>>("/api/guest/report", { post: { g, id, reason } });

// ---- после регистрации ----
/** Перенести гостевую переписку в личные сообщения профиля (нужен токен входа нового пользователя) */
export const guestClaim = (token: string, g: string, ref: string) =>
  call<{ moved: number; name: string; blocked?: boolean }>("/api/guest/claim", { token, post: { g, ref } });

// ---- пригласивший (нужен токен входа) ----
export const guestUnread = (token: string) => call<{ n: number }>("/api/guest/unread", { token }).then((r) => r.n);
export const guestInbox = (token: string) => call<{ items: GuestThreadInfo[] }>("/api/guest/inbox", { token }).then((r) => r.items);
export const guestMessages = (token: string, g: string) => call<{ name: string; blocked: boolean; items: GuestItem[] }>(`/api/guest/messages?g=${encodeURIComponent(g)}`, { token });
export const guestReply = (token: string, g: string, text: string) => call<{ id: number }>("/api/guest/reply", { token, post: { g, text } });
export const guestRemove = (token: string, id: number) => call<{ removed: boolean }>("/api/guest/remove", { token, post: { id } });
export const guestFlag = (token: string, id: number, reason = "") => call<Record<string, never>>("/api/guest/flag", { token, post: { id, reason } });
export const guestBlock = (token: string, g: string, on: boolean) => call<{ blocked: boolean }>("/api/guest/block", { token, post: { g, on } });
/** Настройка ссылки приглашения: принимает ли она новых гостей */
export const guestLinkGet = (token: string) => call<{ open: boolean }>("/api/guest/link-settings", { token }).then((r) => r.open);
export const guestLinkSet = (token: string, open: boolean) => call<{ open: boolean }>("/api/guest/link-settings", { token, post: { open } }).then((r) => r.open);

/** Понятный текст ошибки (ru/en) */
export function guestError(code: string, ru: boolean): string {
  const m: Record<string, [string, string]> = {
    limit: ["Дневной лимит гостя исчерпан. Войдите, чтобы писать без ограничений.", "Daily guest limit reached. Sign in to keep chatting."],
    slow_down: ["Слишком часто, подождите немного", "Too fast, please wait a moment"],
    no_inviter: ["Пригласивший не найден. Проверьте ссылку.", "The person who invited you was not found. Check the link."],
    blocked: ["Пригласивший ограничил переписку", "The person who invited you has restricted this chat"],
    link_closed: ["Это приглашение сейчас не принимает новых гостей. Попросите друга прислать новую ссылку или включить приём.", "This invitation is not accepting new guests right now. Ask your friend to send a new link or turn it back on."],
    ref: ["В ссылке нет пригласившего", "The link has no inviter"],
    empty: ["Введите сообщение", "Enter a message"],
    auth: ["Нужно войти", "Please sign in"],
    no_thread: ["Переписка не найдена", "Conversation not found"],
    no_message: ["Сообщение не найдено", "Message not found"],
    self: ["Это ваша собственная ссылка", "This is your own link"],
    guest: ["Гостевая переписка не найдена", "Guest conversation not found"],
    offline: ["Нет сети. Повторите, когда интернет вернётся.", "You are offline. Try again when the connection returns."],
  };
  const x = m[code];
  return x ? (ru ? x[0] : x[1]) : ru ? "Не удалось выполнить, повторите позже" : "Could not complete, try again later";
}

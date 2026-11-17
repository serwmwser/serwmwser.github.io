"use client";
// Запросы к гостевому чату (сервер: server/src/guest.ts). Гость идёт без входа, пригласивший — с токеном входа.
import { API_URL } from "./config";

export type GuestItem = { id: number; side: "guest" | "inviter"; text: string; created: number };
export type GuestThreadInfo = { g: string; name: string; unread: number; last: string; mine: boolean; at: number };
export type Tr = { text: string; same: boolean };

type Ok<T> = { ok: true } & T;
type Fail = { ok: false; error: string };

async function call<T>(path: string, o: { token?: string; post?: unknown } = {}): Promise<Ok<T>> {
  const [wallet, tok] = (o.token || "").split("|");
  const r = await fetch(`${API_URL}${path}`, {
    method: o.post === undefined ? "GET" : "POST",
    cache: "no-store",
    headers: { ...(o.post === undefined ? {} : { "content-type": "application/json" }), ...(tok ? { authorization: `Bearer ${tok}`, "x-wallet": wallet } : {}) },
    body: o.post === undefined ? undefined : JSON.stringify(o.post),
  });
  const j = (await r.json()) as Ok<T> | Fail;
  if (!j.ok) throw new Error((j as Fail).error || "error");
  return j;
}

/** Гость: отправить сообщение пригласившему (ref — адрес из ссылки) */
export const guestSend = (g: string, ref: string, name: string, text: string) =>
  call<{ id: number; left: number }>("/api/guest/send", { post: { g, ref, name, text } });

/** Гость: новые сообщения переписки (ответы пригласившего), после номера since */
export const guestThread = (g: string, ref: string, since: number) =>
  call<{ items: GuestItem[]; left: number }>(`/api/guest/thread?g=${encodeURIComponent(g)}&ref=${encodeURIComponent(ref)}&since=${since}`);

/** Гость: перевод текста на язык браузера; при ошибке вернёт null */
export async function guestTranslate(text: string, to: string, g: string): Promise<Tr | null> {
  try {
    const r = await call<{ text: string; same: boolean }>("/api/guest/translate", { post: { text, to, g } });
    return { text: r.text, same: !!r.same };
  } catch { return null; }
}

/** Пригласивший: непрочитанные сообщения от гостей */
export const guestUnread = (token: string) => call<{ n: number }>("/api/guest/unread", { token }).then((r) => r.n);
/** Пригласивший: список гостей, написавших по его ссылке */
export const guestInbox = (token: string) => call<{ items: GuestThreadInfo[] }>("/api/guest/inbox", { token }).then((r) => r.items);
/** Пригласивший: переписка с одним гостем (помечает сообщения прочитанными) */
export const guestMessages = (token: string, g: string) => call<{ name: string; items: GuestItem[] }>(`/api/guest/messages?g=${encodeURIComponent(g)}`, { token });
/** Пригласивший: ответить гостю */
export const guestReply = (token: string, g: string, text: string) => call<{ id: number }>("/api/guest/reply", { token, post: { g, text } });

/** Понятный текст ошибки (ru/en) */
export function guestError(code: string, ru: boolean): string {
  const m: Record<string, [string, string]> = {
    limit: ["Дневной лимит гостя исчерпан. Войдите, чтобы писать без ограничений.", "Daily guest limit reached. Sign in to keep chatting."],
    slow_down: ["Слишком часто, подождите немного", "Too fast, please wait a moment"],
    no_inviter: ["Пригласивший не найден. Проверьте ссылку.", "The person who invited you was not found. Check the link."],
    ref: ["В ссылке нет пригласившего", "The link has no inviter"],
    empty: ["Введите сообщение", "Enter a message"],
    auth: ["Нужно войти", "Please sign in"],
    no_thread: ["Переписка не найдена", "Conversation not found"],
  };
  const x = m[code];
  return x ? (ru ? x[0] : x[1]) : ru ? "Не удалось выполнить, повторите позже" : "Could not complete, try again later";
}

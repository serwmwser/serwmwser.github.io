"use client";
// Привязка способов входа к одному профилю. Сервер: server/src/links.ts (маршруты /api/links/*).
import { API_URL } from "./config";
import { getToken } from "./session";

export type LinkInfo = { main: string; current: string; alts: { addr: string; created: number }[] };

const PENDING = "cb_link_main"; // адрес основного профиля, пока человек подключает второй вход
const PENDING_MS = 10 * 60 * 1000; // запись живёт 10 минут: вход через Google на телефоне может открыться в другом окне

/** Токен сайта имеет вид «адрес|токен»: в заголовки уходит и то и другое */
async function call<T>(path: string, token: string, post?: unknown): Promise<T> {
  const [wallet, tok] = token.split("|");
  const r = await fetch(`${API_URL}${path}`, {
    method: post !== undefined ? "POST" : "GET",
    cache: "no-store",
    headers: {
      ...(post !== undefined ? { "content-type": "application/json" } : {}),
      ...(tok ? { authorization: `Bearer ${tok}`, "x-wallet": wallet } : {}),
    },
    body: post !== undefined ? JSON.stringify(post) : undefined,
  });
  const j = (await r.json()) as { ok: boolean; error?: string } & T;
  if (!j.ok) throw new Error(j.error || "error");
  return j;
}

/** Основной профиль и привязанные входы */
export const fetchLinks = (token: string) => call<LinkInfo>("/api/links/list", token);

/** Привязать текущий вход (token) к основному профилю main: нужна сохранённая сессия основного профиля */
export function addLink(token: string, main: string) {
  const mainToken = getToken(main);
  if (!mainToken) return Promise.reject(new Error("main_auth"));
  return call<{ already?: boolean }>("/api/links/add", token, { main: main.toLowerCase(), token: mainToken });
}

/** Отвязать вход */
export const removeLink = (token: string, alt: string) => call<{ removed: number }>("/api/links/remove", token, { alt });

/** Запомнить, к какому профилю привязываем (живёт до закрытия вкладки) */
export function setPendingLink(main: string) { try { localStorage.setItem(PENDING, `${main.toLowerCase()}|${Date.now()}`); } catch { /* без хранилища */ } }
export function getPendingLink(): string {
  try {
    const [a, t] = (localStorage.getItem(PENDING) || "").split("|");
    if (/^0x[0-9a-f]{40}$/.test(a || "") && Date.now() - Number(t) < PENDING_MS) return a;
    localStorage.removeItem(PENDING);
  } catch { /* без хранилища */ }
  return "";
}
export function clearPendingLink() { try { localStorage.removeItem(PENDING); } catch { /* без хранилища */ } }

/** Понятный текст ошибки */
export function linkErr(e: unknown, ru: boolean): string {
  const m = (e as Error)?.message || "error";
  const t: Record<string, [string, string]> = {
    auth: ["Сначала войдите", "Sign in first"],
    main_auth: ["Основной профиль не подтверждён: вернитесь в него, войдите заново и повторите", "The main profile is not confirmed: sign in to it again and retry"],
    same: ["Это тот же вход, что и основной", "This is the same login as the main one"],
    main_is_alt: ["Основной профиль сам привязан к другому. Войдите в настоящий основной профиль", "The main profile is itself linked to another one. Sign in to the real main profile"],
    already_linked: ["Этот вход уже привязан к другому профилю", "This login is already linked to another profile"],
    too_many: ["Можно привязать не больше 5 входов", "You can link up to 5 logins"],
    has_data: ["У этого входа уже есть свой профиль с данными (посты, сообщения, друзья, объявления или ник). Чтобы ничего не потерять, такие профили не объединяются. Привяжите вход без данных", "This login already has its own profile with data (posts, messages, friends, ads or a nickname). To avoid losing anything such profiles are not merged. Link a login without data"],
    slow_down: ["Слишком часто, подождите", "Too fast, wait a while"],
  };
  const x = t[m];
  return x ? x[ru ? 0 : 1] : (ru ? "Не удалось: " : "Failed: ") + m;
}

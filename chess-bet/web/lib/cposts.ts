"use client";
// Посты сообщества. Сервер: server/src/cposts.ts (маршруты /api/cposts/*). Пишет владелец сообщества или администратор.
import { API_URL } from "./config";

export const CPOST_MAX_TEXT = 1500;
export const CPOST_MAX_PHOTOS = 3;

export type CPost = { id: number; community: string; text: string; photos: string[]; video: string; thumb: string; link: string; created: number; edited: boolean };
export type CPostList = { items: CPost[]; manage: boolean; locked: boolean; more: boolean };
export type CPostInput = { id?: number; community: string; text: string; photos: string[]; video: string; link: string };

async function call<T>(path: string, token: string, post?: unknown): Promise<T> {
  const [wallet, tok] = (token || "").split("|");
  const r = await fetch(`${API_URL}${path}`, {
    method: post !== undefined ? "POST" : "GET",
    cache: "no-store",
    headers: {
      ...(post !== undefined ? { "content-type": "application/json" } : {}),
      ...(tok ? { authorization: `Bearer ${tok}`, "x-wallet": wallet } : {}),
    },
    body: post !== undefined ? JSON.stringify(post) : undefined,
  });
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string } & T;
  if (!j.ok) throw new Error(j.error || "error");
  return j;
}

/** Лента постов сообщества, новые сверху; before = id последнего загруженного поста (для «Показать ещё») */
export const listCPosts = (community: string, token = "", before = 0) =>
  call<CPostList & { ok: true }>(`/api/cposts?community=${encodeURIComponent(community)}${before ? `&before=${before}` : ""}`, token);
export const saveCPost = (token: string, d: CPostInput) => call<{ post: CPost }>("/api/cposts/save", token, d).then((r) => r.post);
export const deleteCPost = (token: string, id: number) => call<{ ok: true }>("/api/cposts/delete", token, { id });

/** Ссылка на видео принимается только с YouTube, Vimeo и RuTube (https) */
export const isVideoLink = (u: string) => /^https:\/\/((www|m)\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com|vimeo\.com|player\.vimeo\.com|rutube\.ru)\//i.test(u.trim());

const ERRORS: Record<string, [string, string]> = {
  auth: ["Войдите в аккаунт", "Please sign in"],
  forbidden: ["Писать посты может владелец сообщества", "Only the community owner can post"],
  not_found: ["Не найдено", "Not found"],
  empty: ["Добавьте текст, фото, видео или ссылку", "Add text, a photo, a video or a link"],
  bad_photos: ["Фото: не больше 3, загруженные или по ссылке https", "Photos: up to 3, uploaded or an https link"],
  bad_video: ["Видео: ссылка на YouTube, Vimeo или RuTube (https)", "Video: a YouTube, Vimeo or RuTube link (https)"],
  bad_link: ["Ссылка должна начинаться с https://", "The link must start with https://"],
  slow_down: ["Слишком часто. Подождите немного", "Too many posts. Please wait a little"],
  too_big: ["Слишком большой пост", "The post is too large"],
};
export const cpostError = (e: unknown, ru: boolean) => {
  const t = ERRORS[e instanceof Error ? e.message : ""];
  return t ? (ru ? t[0] : t[1]) : ru ? "Не получилось. Попробуйте ещё раз." : "Something went wrong. Please try again.";
};

"use client";
// Реклама на главной странице. Сервер: server/src/promos.ts (маршруты /api/promos/*).
// Публичный список отдаёт только активную рекламу; пока её нет, блок на сайте скрыт.
import { useEffect, useState } from "react";
import { API_URL } from "./config";
import { mediaSrc } from "./communities";

export type PromoKind = "community" | "product" | "external";
export type Promo = { id: number; kind: PromoKind; title: string; text: string; image: string; url: string; slug: string };
/** Строка админ-списка: с признаками активности, показами и кликами */
export type PromoAdmin = Promo & { starts: number; ends: number; active: boolean; live: boolean; views: number; clicks: number; created: number };
export type PromoInput = {
  id?: number; kind: PromoKind; title: string; text: string; image: string; url: string; slug: string;
  starts: number; ends: number; active: boolean;
};

export { mediaSrc };

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
  const j = (await r.json()) as { ok: boolean; error?: string } & T;
  if (!j.ok) throw new Error(j.error || "error");
  return j;
}

export const listPromos = () => call<{ items: Promo[] }>("/api/promos", "").then((j) => j.items);
export const listPromosAdmin = (token: string) => call<{ items: PromoAdmin[] }>("/api/promos/all", token).then((j) => j.items);
export const savePromo = (token: string, p: PromoInput) => call<{ id: number }>("/api/promos/save", token, p).then((j) => j.id);
export const deletePromo = (token: string, id: number) => call<object>("/api/promos/delete", token, { id });

/** Счётчики показов и кликов: ошибки не важны, поэтому глотаем их */
export const promoEvent = (kind: "view" | "click", id: number) => {
  fetch(`${API_URL}/api/promos/${kind}`, {
    method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ id }),
  }).catch(() => { /* счётчик не критичен */ });
};

/** Активная реклама для главной: пустой список, пока ничего нет или сервер недоступен */
export function usePromos(): Promo[] {
  const [items, setItems] = useState<Promo[]>([]);
  useEffect(() => {
    let alive = true;
    listPromos().then((l) => { if (alive) setItems(l); }).catch(() => { /* блок остаётся скрытым */ });
    return () => { alive = false; };
  }, []);
  return items;
}

const ERRORS: Record<string, [string, string]> = {
  auth: ["Войдите в аккаунт", "Please sign in"],
  forbidden: ["Только для администратора", "Admins only"],
  bad_kind: ["Выберите вид рекламы", "Pick the ad kind"],
  title_required: ["Укажите заголовок", "Title is required"],
  bad_url: ["Нужна ссылка: https://… или адрес внутри сайта, начинающийся с «/»", "A link is required: https://… or a site path starting with “/”"],
  bad_dates: ["Дата окончания должна быть позже даты начала", "End date must be after the start date"],
  not_found: ["Реклама не найдена", "Ad not found"],
  too_big: ["Слишком большой запрос", "Request too large"],
  bad_type: ["Нужна картинка JPG, PNG или WebP", "Use a JPG, PNG or WebP image"],
};
export const promoError = (e: unknown, ru: boolean) => {
  const k = e instanceof Error ? e.message : "";
  const t = ERRORS[k];
  return t ? (ru ? t[0] : t[1]) : ru ? "Не получилось. Попробуйте ещё раз." : "Something went wrong. Please try again.";
};

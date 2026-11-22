"use client";
// Партии по переписке (бесплатные, ход раз в 1 / 6 / 24 / 72 часа). Сервер: server/src/corr.ts (маршруты /api/corr/*).
import { API_URL } from "./config";

export type CorrHours = 1 | 6 | 24 | 72;
export const CORR_HOURS: CorrHours[] = [1, 6, 24, 72];

export type CorrOpen = { id: string; hours: number; by: string | null; color: "w" | "b"; mine: boolean; created: number };
export type CorrMine = {
  id: string; status: "open" | "active" | "done"; result: string; reason: string; hours: number;
  color: "w" | "b"; opponent: string | null; turn: "w" | "b"; myTurn: boolean; deadline: number; plies: number; updated: number;
};
export type CorrGameData = {
  id: string; status: "open" | "active" | "done"; hours: number; turn: "w" | "b"; deadline: number; result: string; reason: string;
  moves: string[]; fen: string; w: string | null; b: string | null; color: "w" | "b" | ""; drawBy: "" | "w" | "b";
  creatorColor: "w" | "b"; created: number; updated: number;
};

/** Токен сайта имеет вид «адрес|токен»; без входа можно только читать (токен пустой) */
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

export const corrOpen = (token: string) => call<{ items: CorrOpen[] }>("/api/corr/open", token).then((j) => j.items);
export const corrMine = (token: string) => call<{ items: CorrMine[] }>("/api/corr/mine", token).then((j) => j.items);
export const corrGame = (token: string, id: string) => call<{ game: CorrGameData }>(`/api/corr/game?id=${encodeURIComponent(id)}`, token).then((j) => j.game);
export const corrCreate = (token: string, hours: number, color: "w" | "b" | "r") => call<{ id: string }>("/api/corr/create", token, { hours, color }).then((j) => j.id);
export const corrJoin = (token: string, id: string) => call<{ game: CorrGameData }>("/api/corr/join", token, { id }).then((j) => j.game);
export const corrCancel = (token: string, id: string) => call<object>("/api/corr/cancel", token, { id });
export const corrMove = (token: string, id: string, from: string, to: string, promotion?: string) =>
  call<{ game: CorrGameData }>("/api/corr/move", token, { id, from, to, promotion: promotion || "" }).then((j) => j.game);
export const corrResign = (token: string, id: string) => call<{ game: CorrGameData }>("/api/corr/resign", token, { id }).then((j) => j.game);
export const corrDraw = (token: string, id: string, action: "offer" | "accept" | "decline") =>
  call<{ game: CorrGameData }>("/api/corr/draw", token, { id, action }).then((j) => j.game);

/** Сколько осталось на ход: «5 ч 12 мин», «2 дн. 3 ч», «40 мин» */
export function leftText(deadline: number, ru: boolean): string {
  const ms = deadline - Date.now();
  if (ms <= 0) return ru ? "время вышло" : "time is up";
  const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  if (d > 0) return ru ? `${d} дн. ${h} ч` : `${d} d ${h} h`;
  if (h > 0) return ru ? `${h} ч ${mm} мин` : `${h} h ${mm} min`;
  return ru ? `${mm} мин` : `${mm} min`;
}
export const hoursLabel = (h: number, ru: boolean) => (h < 24 ? `${h} ${ru ? "ч" : "h"}` : `${h / 24} ${ru ? "дн." : "d"}`);

/** Текст итога партии */
export function resultText(result: string, reason: string, ru: boolean): string {
  const r = result === "1-0" ? (ru ? "победили белые" : "White won") : result === "0-1" ? (ru ? "победили чёрные" : "Black won") : (ru ? "ничья" : "draw");
  const why: Record<string, [string, string]> = {
    checkmate: ["мат", "checkmate"], time: ["время вышло", "time out"], resign: ["сдача", "resignation"], agreed: ["по согласию", "by agreement"],
    stalemate: ["пат", "stalemate"], insufficient: ["недостаточно материала", "insufficient material"], repetition: ["троекратное повторение", "repetition"], fifty: ["правило 50 ходов", "fifty-move rule"],
  };
  const w = why[reason];
  return w ? `${r} (${w[ru ? 0 : 1]})` : r;
}

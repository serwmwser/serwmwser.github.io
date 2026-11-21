"use client";
// Воронка страницы приглашения /i/: список функций приложения, шаги «написал → попробовал → создал профиль» и события.
// События хранятся в браузере гостя (localStorage) и не уходят на сторонние сервисы.
import { BASE, ROUTES } from "./urls";
import { API_URL } from "./config";

export const SIGNUP_AFTER = 3; // после стольких сообщений гостя показываем карточку «Создайте профиль»
const KEY = "hm_funnel";

export type Feature = { id: string; icon: string; ru: string; en: string; dRu: string; dEn: string; href: string };

/** Функции HiMeet: каждая кнопка ведёт на настоящую страницу приложения */
export const FEATURES: Feature[] = [
  { id: "chess", icon: "♟", ru: "Шахматы", en: "Chess", dRu: "Партия с ботом или с другом по ссылке, бесплатно", dEn: "Play a bot or a friend by link, free", href: ROUTES.chess },
  { id: "puzzles", icon: "🧩", ru: "Задачи", en: "Puzzles", dRu: "Шахматные задачи на мат в несколько ходов", dEn: "Mate-in-N chess puzzles", href: ROUTES.puzzles },
  { id: "cartoon", icon: "🐱", ru: "Мультяшные фигуры", en: "Cartoon pieces", dRu: "Анимированные фигуры, которые живут на доске", dEn: "Animated pieces that come alive on the board", href: ROUTES.cartoon },
  { id: "cartoon3d", icon: "🎲", ru: "3D доска", en: "3D board", dRu: "Мультяшная шахматная доска в 3D", dEn: "A cartoon chess board in 3D", href: `${BASE}/cartoon-3d/` },
  { id: "translate", icon: "💬", ru: "Чат с переводом", en: "Translated chat", dRu: "Пишите на своём языке, собеседник читает на своём", dEn: "Write in your language, they read theirs", href: ROUTES.translateChat },
  { id: "friends", icon: "👋", ru: "Найти друзей", en: "Find friends", dRu: "Люди со всего мира, с которыми можно общаться", dEn: "People from around the world to talk to", href: ROUTES.friends },
  { id: "exchange", icon: "🌍", ru: "Языковой обмен", en: "Language exchange", dRu: "Практикуйте язык с носителями", dEn: "Practice a language with native speakers", href: ROUTES.exchange },
  { id: "dating", icon: "💞", ru: "Знакомства", en: "Dating", dRu: "Новые знакомства с автопереводом общения", dEn: "Meet new people with auto-translated chat", href: ROUTES.dating },
  { id: "ads", icon: "📢", ru: "Объявления", en: "Classifieds", dRu: "Доска объявлений для всех стран", dEn: "A classifieds board for every country", href: ROUTES.ads },
  { id: "tournaments", icon: "🏆", ru: "Турниры", en: "Tournaments", dRu: "Соревнуйтесь с другими игроками", dEn: "Compete with other players", href: ROUTES.tournaments },
  { id: "token", icon: "🪙", ru: "Токен TCH", en: "TCH token", dRu: "Токен приложения и как он работает", dEn: "The app token and how it works", href: ROUTES.token },
  { id: "nft", icon: "🖼", ru: "NFT", en: "NFT", dRu: "Коллекционные фигуры и картинки", dEn: "Collectible pieces and images", href: ROUTES.nft },
  { id: "android", icon: "📱", ru: "Android", en: "Android", dRu: "Установите приложение на телефон", dEn: "Install the app on your phone", href: ROUTES.android },
];

export type FunnelEvent = "open" | "message" | "feature" | "signup_click" | "signup_open" | "signup_done";
export type FunnelData = { events: Partial<Record<FunnelEvent, number>>; features: string[]; count: Partial<Record<FunnelEvent, number>> };

const empty = (): FunnelData => ({ events: {}, features: [], count: {} });

/** Читает накопленные события воронки; без хранилища возвращает пустые */
export function readFunnel(): FunnelData {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null") as Partial<FunnelData> | null;
    if (!raw || typeof raw !== "object") return empty();
    return { events: raw.events ?? {}, features: Array.isArray(raw.features) ? raw.features.slice(0, 40) : [], count: raw.count ?? {} };
  } catch { return empty(); }
}

/** Анонимный номер этого браузера для воронки (случайный, без личных данных) */
function funnelId(): string {
  try {
    let id = localStorage.getItem("hm_fid") || "";
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) {
      const a = new Uint8Array(12);
      crypto.getRandomValues(a);
      id = Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
      localStorage.setItem("hm_fid", id);
    }
    return id;
  } catch { return ""; }
}

/** Источник перехода: метка ?s=ph из ссылки (запоминается с первого визита) или сайт, откуда пришли, иначе direct */
function funnelSource(): string {
  const ok = (v: string) => (/^[a-z0-9._-]{1,30}$/.test(v) ? v : "");
  try {
    const q = ok((new URLSearchParams(location.search).get("s") || "").toLowerCase());
    if (q) { localStorage.setItem("hm_src", q); return q; }
    const saved = ok(localStorage.getItem("hm_src") || "");
    if (saved) return saved;
    if (document.referrer) {
      const h = new URL(document.referrer).hostname.replace(/^www\./, "").toLowerCase();
      if (h && !h.endsWith("himeet.online")) { const r = ok(h.slice(0, 30)); if (r) { localStorage.setItem("hm_src", r); return r; } }
    }
  } catch { /* без хранилища */ }
  return "direct";
}

/** Отправляет событие на сервер (без личных данных). Ошибки и отсутствие сети молча игнорируются */
export function sendFunnel(ev: FunnelEvent, detail?: string) {
  try {
    const g = funnelId();
    if (!g) return;
    void fetch(`${API_URL}/api/funnel`, {
      method: "POST", keepalive: true, headers: { "content-type": "application/json" },
      body: JSON.stringify({ g, ev, detail: detail || "", src: funnelSource(), lang: (navigator.language || "").toLowerCase().slice(0, 12) }),
    }).catch(() => { /* не мешаем странице */ });
  } catch { /* не мешаем странице */ }
}

/** Записывает событие: время первого раза, счётчик и (для кнопок функций) какая функция нажата */
export function track(ev: FunnelEvent, detail?: string): FunnelData {
  const d = readFunnel();
  d.events[ev] = d.events[ev] ?? Date.now();
  d.count[ev] = (d.count[ev] ?? 0) + 1;
  if (ev === "feature" && detail && !d.features.includes(detail)) d.features.push(detail);
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* без хранилища */ }
  sendFunnel(ev, detail);
  return d;
}

/** Текущий шаг воронки: 0 — открыл, 1 — написал, 2 — попробовал функции, 3 — нажал «создать профиль» */
export function funnelStep(d: FunnelData, sent: number): 0 | 1 | 2 | 3 {
  if (d.events.signup_click) return 3;
  if (d.features.length > 0) return 2;
  return sent > 0 ? 1 : 0;
}

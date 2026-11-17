"use client";
// Воронка страницы приглашения /i/: список функций приложения, шаги «написал → попробовал → создал профиль» и события.
// События хранятся в браузере гостя (localStorage) и не уходят на сторонние сервисы.
import { BASE, ROUTES } from "./urls";

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

export type FunnelEvent = "open" | "message" | "feature" | "signup_click" | "signup_open";
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

/** Записывает событие: время первого раза, счётчик и (для кнопок функций) какая функция нажата */
export function track(ev: FunnelEvent, detail?: string): FunnelData {
  const d = readFunnel();
  d.events[ev] = d.events[ev] ?? Date.now();
  d.count[ev] = (d.count[ev] ?? 0) + 1;
  if (ev === "feature" && detail && !d.features.includes(detail)) d.features.push(detail);
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* без хранилища */ }
  return d;
}

/** Текущий шаг воронки: 0 — открыл, 1 — написал, 2 — попробовал функции, 3 — нажал «создать профиль» */
export function funnelStep(d: FunnelData, sent: number): 0 | 1 | 2 | 3 {
  if (d.events.signup_click) return 3;
  if (d.features.length > 0) return 2;
  return sent > 0 ? 1 : 0;
}

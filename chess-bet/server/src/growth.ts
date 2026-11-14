// Рост аудитории через Telegram-бота: ответ на кодовое слово из роликов (MATE / МАТ) и счётчики.
// Подключается из tg.ts. Данные: ./data/growth.json (счётчики), ./data/puzzles.json (необязательно: список id задач Lichess).
import fs from "node:fs";

const FILE = process.env.GROWTH_FILE || "./data/growth.json";
const IDS_FILE = process.env.PUZZLES_FILE || "./data/puzzles.json";
const GAME = process.env.GAME_URL || "https://t.me/chess_betlolbot/game";
const SITE = process.env.SITE_URL || "https://himeet.online";

type Stats = { keyword: Record<string, number>; total: number };
let stats: Stats = { keyword: {}, total: 0 };
try {
  const o = JSON.parse(fs.readFileSync(FILE, "utf8")) as Stats;
  if (o && typeof o === "object") stats = { keyword: o.keyword || {}, total: Number(o.total) || 0 };
} catch { /* файла ещё нет */ }

function save() {
  try {
    fs.mkdirSync(FILE.replace(/[\\/][^\\/]*$/, "") || ".", { recursive: true });
    fs.writeFileSync(FILE + ".tmp", JSON.stringify(stats));
    fs.renameSync(FILE + ".tmp", FILE);
  } catch (e) { console.error("growth save", e); }
}

/** Слова-пароли из роликов: без регистра, без пробелов и знаков */
const WORDS = new Set(["мат", "mat", "mate", "мат2", "mat2", "mate2", "матв2", "matein2"]);
export const isKeyword = (text: string) => WORDS.has(String(text || "").toLowerCase().replace(/[^a-zа-яё0-9]/g, ""));

const day = (d = new Date()) => d.toISOString().slice(0, 10);

/** 5 задач на сегодня из data/puzzles.json (по кругу). Если файла нет — вернём пустой список. */
export function dailyIds(date = new Date()): string[] {
  try {
    const all = (JSON.parse(fs.readFileSync(IDS_FILE, "utf8")) as unknown[])
      .map(String).filter((x) => /^[A-Za-z0-9]{3,8}$/.test(x));
    if (!all.length) return [];
    const n = Math.floor(date.getTime() / 86400000);
    return Array.from({ length: Math.min(5, all.length) }, (_, i) => all[(n * 5 + i) % all.length]);
  } catch { return []; }
}

export function keywordText(lang: "ru" | "en", ids: string[]): string {
  const list = ids.length
    ? ids.map((id, i) => `${i + 1}) https://lichess.org/training/${id}`).join("\n")
    : "https://lichess.org/training/mateIn2";
  return lang === "ru"
    ? `Привет! Ваши задачи «мат в 2 хода» на сегодня:\n${list}\n\nРешайте по ссылкам на Lichess. А поиграть в мультяшные шахматы бесплатно можно в нашей игре 👇`
    : `Hi! Your "mate in 2" puzzles for today:\n${list}\n\nSolve them on Lichess. And you can play cartoon chess for free in our game 👇`;
}

const last = new Map<number, number>(); // защита от повторов: один ответ раз в 8 секунд на чат

/** Вернёт true, если сообщение было кодовым словом и мы ответили. send — функция отправки сообщения в Telegram. */
export async function growthKeyword(
  chat: number, text: string, lang: "ru" | "en",
  send: (body: Record<string, unknown>) => Promise<unknown>,
): Promise<boolean> {
  if (!isKeyword(text)) return false;
  const now = Date.now();
  if (now - (last.get(chat) || 0) < 8000) return true;
  last.set(chat, now);
  if (last.size > 5000) last.clear();
  const d = day();
  stats.keyword[d] = (stats.keyword[d] || 0) + 1;
  stats.total += 1;
  save();
  await send({
    chat_id: chat,
    text: keywordText(lang, dailyIds()),
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [{ text: lang === "ru" ? "Играть бесплатно" : "Play free", url: GAME }],
        [{ text: lang === "ru" ? "Сайт HiMeet" : "HiMeet website", url: SITE }],
      ],
    },
  });
  return true;
}

/** Сводка для владельца (понадобится для команды /stats) */
export function growthSummary(): string {
  const days = Object.keys(stats.keyword).sort().slice(-7);
  const rows = days.map((d) => `${d}: ${stats.keyword[d]}`).join("\n");
  return `Слово MATE/МАТ: всего ${stats.total}\n${rows || "пока нет данных"}`;
}
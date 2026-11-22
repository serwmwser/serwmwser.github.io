// Партии по переписке: бесплатные партии без часов реального времени, ход раз в 1 час / 6 часов / 24 часа / 3 дня.
// Ходы проверяет сервер (chess.js). Об ответном ходе игрок узнаёт в Telegram и пушем. Ставок нет.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type http from "node:http";
import Database from "better-sqlite3";
import { Chess } from "chess.js";
import { tgNotify } from "./tg.js";
import { pushTo } from "./push.js";

const SITE = process.env.SITE_URL || "https://himeet.online";
const DB_FILE = process.env.SOCIAL_DB || "./data/social.db";
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new Database(DB_FILE);
db.pragma("journal_mode = WAL");
db.pragma("busy_timeout = 3000");
db.exec(`
CREATE TABLE IF NOT EXISTS corr_games(
  id TEXT PRIMARY KEY, creator TEXT NOT NULL, creator_color TEXT NOT NULL,
  w TEXT NOT NULL DEFAULT '', b TEXT NOT NULL DEFAULT '', hours INTEGER NOT NULL,
  moves TEXT NOT NULL DEFAULT '[]', turn TEXT NOT NULL DEFAULT 'w',
  status TEXT NOT NULL, result TEXT NOT NULL DEFAULT '', reason TEXT NOT NULL DEFAULT '',
  deadline INTEGER NOT NULL DEFAULT 0, draw_by TEXT NOT NULL DEFAULT '', warned INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL, updated INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS corr_w ON corr_games(w, status);
CREATE INDEX IF NOT EXISTS corr_b ON corr_games(b, status);
CREATE INDEX IF NOT EXISTS corr_status ON corr_games(status, created);
`);

type Color = "w" | "b";
type Row = {
  id: string; creator: string; creator_color: Color; w: string; b: string; hours: number; moves: string; turn: Color;
  status: "open" | "active" | "done"; result: string; reason: string; deadline: number; draw_by: "" | Color; warned: number;
  created: number; updated: number;
};

const HOURS = [1, 6, 24, 72];
const HOUR = 3600000, DAY = 86400000;
const OPEN_TTL = 7 * DAY, DONE_TTL = 90 * DAY;
const MAX_ACTIVE = 10, MAX_OPEN = 3;
const ID_RE = /^[a-f0-9]{10}$/;
const SQ_RE = /^[a-h][1-8]$/;
const ADDR_RE = /^0x[0-9a-f]{40}$/;

const hits = new Map<string, number[]>();
function limited(key: string, max: number, ms: number): boolean {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < ms);
  if (arr.length >= max) { hits.set(key, arr); return true; }
  arr.push(now); hits.set(key, arr);
  if (hits.size > 20000) hits.clear();
  return false;
}
function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => { n += c.length; if (n > 2048) { reject(new Error("too_big")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); } catch { reject(new Error("bad_json")); } });
    req.on("error", reject);
  });
}

const get = (id: string) => db.prepare("SELECT * FROM corr_games WHERE id=?").get(id) as Row | undefined;
const nameOf = (a: string): string | null => {
  if (!a) return null;
  const r = db.prepare("SELECT name FROM users WHERE addr=?").get(a) as { name: string } | undefined;
  return r?.name || a.slice(0, 6) + "…" + a.slice(-4);
};
const colorOf = (g: Row, a: string): Color | "" => (g.w === a ? "w" : g.b === a ? "b" : "");
const other = (c: Color): Color => (c === "w" ? "b" : "w");
const hoursText = (h: number, ru: boolean) => (h < 24 ? `${h} ${ru ? "ч" : "h"}` : `${h / 24} ${ru ? "дн." : "d"}`);

function replay(g: Row): Chess {
  const c = new Chess();
  for (const san of JSON.parse(g.moves) as string[]) c.move(san);
  return c;
}

/** Уведомление игроку: Telegram (если привязан) и веб-пуш */
function ping(addr: string, ru: string, en: string, key: string, id: string) {
  if (!addr || !ADDR_RE.test(addr)) return;
  const url = `${SITE}/?corr=${id}`;
  void tgNotify(addr, ru, en, key, url);
  try { pushTo(addr, { title: "HiMeet ♟", body: `${ru} / ${en}`, url, tag: "corr:" + id }); } catch { /* пуши не настроены */ }
}

function view(g: Row, me: string) {
  const c = replay(g);
  return {
    id: g.id, status: g.status, hours: g.hours, turn: g.turn, deadline: g.deadline, result: g.result, reason: g.reason,
    moves: JSON.parse(g.moves) as string[], fen: c.fen(), w: nameOf(g.w), b: nameOf(g.b), color: me ? colorOf(g, me) : "",
    drawBy: g.draw_by, creatorColor: g.creator_color, created: g.created, updated: g.updated,
  };
}

function finish(g: Row, result: "1-0" | "0-1" | "1/2-1/2", reason: string) {
  db.prepare("UPDATE corr_games SET status='done', result=?, reason=?, draw_by='', updated=? WHERE id=?").run(result, reason, Date.now(), g.id);
  const wn = nameOf(g.w) || "?", bn = nameOf(g.b) || "?";
  const label = (ru: boolean) => {
    const r = result === "1-0" ? (ru ? "победили белые" : "White won") : result === "0-1" ? (ru ? "победили чёрные" : "Black won") : (ru ? "ничья" : "draw");
    const why: Record<string, [string, string]> = { checkmate: ["мат", "checkmate"], time: ["время вышло", "time out"], resign: ["сдача", "resignation"], agreed: ["по согласию", "by agreement"], stalemate: ["пат", "stalemate"], insufficient: ["недостаточно материала", "insufficient material"], repetition: ["троекратное повторение", "repetition"], fifty: ["правило 50 ходов", "fifty-move rule"] };
    return `${wn} — ${bn}: ${r} (${(why[reason] || [reason, reason])[ru ? 0 : 1]})`;
  };
  for (const a of [g.w, g.b]) ping(a, "Партия окончена: " + label(true), "Game over: " + label(false), `corr:${g.id}:end`, g.id);
}

/** Раз в минуту: просрочка хода = поражение, напоминание, чистка старых партий */
function tick() {
  try {
    const now = Date.now();
    for (const g of db.prepare("SELECT * FROM corr_games WHERE status='active' AND deadline<?").all(now) as Row[]) {
      finish(g, g.turn === "w" ? "0-1" : "1-0", "time");
    }
    for (const g of db.prepare("SELECT * FROM corr_games WHERE status='active' AND warned=0 AND hours>=6 AND deadline-? < hours*?*0.2").all(now, HOUR) as Row[]) {
      db.prepare("UPDATE corr_games SET warned=1 WHERE id=?").run(g.id);
      ping(g.turn === "w" ? g.w : g.b, "Скоро закончится время на ход в партии по переписке", "Your time to move in a correspondence game is almost up", `corr:${g.id}:warn:${g.moves.length}`, g.id);
    }
    db.prepare("DELETE FROM corr_games WHERE status='open' AND created<?").run(now - OPEN_TTL);
    db.prepare("DELETE FROM corr_games WHERE status='done' AND updated<?").run(now - DONE_TTL);
  } catch (e) { console.error("corr tick", e); }
}
setInterval(tick, 60000).unref();

/** Маршруты /api/corr/* */
export async function handleCorr(req: http.IncomingMessage, res: http.ServerResponse, url: URL, viewer: string): Promise<boolean> {
  const p = url.pathname;
  if (!p.startsWith("/api/corr/")) return false;
  const out = (code: number, o: unknown) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(o)); return true; };
  const bad = (e: string, code = 400) => out(code, { ok: false, error: e });
  try {
    // чтение без входа: список вызовов и просмотр партии
    if (req.method === "GET" && p === "/api/corr/open") {
      const rows = db.prepare("SELECT * FROM corr_games WHERE status='open' ORDER BY created DESC LIMIT 50").all() as Row[];
      return out(200, { ok: true, items: rows.map((g) => ({ id: g.id, hours: g.hours, by: nameOf(g.creator), color: g.creator_color, mine: !!viewer && g.creator === viewer, created: g.created })) });
    }
    if (req.method === "GET" && p === "/api/corr/game") {
      const id = String(url.searchParams.get("id") || "");
      const g = ID_RE.test(id) ? get(id) : undefined;
      return g ? out(200, { ok: true, game: view(g, viewer) }) : bad("not_found", 404);
    }

    if (!viewer) return bad("auth", 401);

    if (req.method === "GET" && p === "/api/corr/mine") {
      const rows = db.prepare("SELECT * FROM corr_games WHERE (w=? OR b=?) AND (status IN ('open','active') OR (status='done' AND updated>?)) ORDER BY updated DESC LIMIT 40").all(viewer, viewer, Date.now() - 30 * DAY) as Row[];
      return out(200, {
        ok: true,
        items: rows.map((g) => {
          const me = colorOf(g, viewer) as Color;
          return { id: g.id, status: g.status, result: g.result, reason: g.reason, hours: g.hours, color: me, opponent: nameOf(me === "w" ? g.b : g.w), turn: g.turn, myTurn: g.status === "active" && g.turn === me, deadline: g.deadline, plies: (JSON.parse(g.moves) as string[]).length, updated: g.updated };
        }),
      });
    }

    if (req.method !== "POST") return bad("not_found", 404);
    if (limited("corr_u:" + viewer, 600, HOUR)) return bad("slow_down", 429);
    const m = await readBody(req);
    const id = String(m.id ?? "");

    if (p === "/api/corr/create") {
      const hours = Number(m.hours);
      if (!HOURS.includes(hours)) return bad("bad_hours");
      const mine = db.prepare("SELECT COUNT(*) AS n, SUM(status='open') AS o FROM corr_games WHERE (creator=? OR w=? OR b=?) AND status IN ('open','active')").get(viewer, viewer, viewer) as { n: number; o: number | null };
      if (mine.n >= MAX_ACTIVE) return bad("too_many_games");
      if ((mine.o || 0) >= MAX_OPEN) return bad("too_many_open");
      if (limited("corr_new:" + viewer, 20, DAY)) return bad("slow_down", 429);
      const pick = String(m.color ?? "r");
      const color: Color = pick === "w" || pick === "b" ? pick : crypto.randomInt(2) ? "w" : "b";
      const gid = crypto.randomBytes(5).toString("hex");
      const now = Date.now();
      db.prepare("INSERT INTO corr_games(id,creator,creator_color,w,b,hours,status,created,updated) VALUES(?,?,?,?,?,?,'open',?,?)")
        .run(gid, viewer, color, color === "w" ? viewer : "", color === "b" ? viewer : "", hours, now, now);
      return out(200, { ok: true, id: gid });
    }

    if (!ID_RE.test(id)) return bad("bad_id");
    const g = get(id);
    if (!g) return bad("not_found", 404);

    if (p === "/api/corr/cancel") {
      if (g.status !== "open" || g.creator !== viewer) return bad("forbidden", 403);
      db.prepare("DELETE FROM corr_games WHERE id=?").run(id);
      return out(200, { ok: true });
    }

    if (p === "/api/corr/join") {
      if (g.status !== "open") return bad("not_open");
      if (g.creator === viewer) return bad("own_game");
      const n = (db.prepare("SELECT COUNT(*) AS n FROM corr_games WHERE (w=? OR b=?) AND status IN ('open','active')").get(viewer, viewer) as { n: number }).n;
      if (n >= MAX_ACTIVE) return bad("too_many_games");
      const w = g.creator_color === "w" ? g.w : viewer;
      const b = g.creator_color === "b" ? g.b : viewer;
      const now = Date.now();
      db.prepare("UPDATE corr_games SET w=?, b=?, status='active', turn='w', deadline=?, warned=0, updated=? WHERE id=?").run(w, b, now + g.hours * HOUR, now, id);
      const who = nameOf(viewer) || "?";
      const mine = g.creator_color === "w";
      ping(g.creator, `${who} принял ваш вызов.${mine ? " Ваш ход." : ""} Время на ход: ${hoursText(g.hours, true)}.`, `${who} accepted your challenge.${mine ? " Your move." : ""} Time per move: ${hoursText(g.hours, false)}.`, `corr:${id}:join`, id);
      return out(200, { ok: true, game: view(get(id) as Row, viewer) });
    }

    const color = colorOf(g, viewer);
    if (!color) return bad("not_player", 403);
    if (g.status !== "active") return bad("not_active");

    if (p === "/api/corr/move") {
      if (g.turn !== color) return bad("not_your_turn");
      const from = String(m.from ?? ""), to = String(m.to ?? ""), promo = String(m.promotion ?? "");
      if (!SQ_RE.test(from) || !SQ_RE.test(to) || !/^[qrbn]?$/.test(promo)) return bad("illegal");
      const c = replay(g);
      let san: string;
      try { san = c.move({ from, to, promotion: promo || undefined }).san; } catch { return bad("illegal"); }
      const moves = [...(JSON.parse(g.moves) as string[]), san];
      const now = Date.now();
      db.prepare("UPDATE corr_games SET moves=?, turn=?, deadline=?, draw_by='', warned=0, updated=? WHERE id=?").run(JSON.stringify(moves), c.turn(), now + g.hours * HOUR, now, id);
      const fresh = get(id) as Row;
      if (c.isCheckmate()) finish(fresh, color === "w" ? "1-0" : "0-1", "checkmate");
      else if (c.isStalemate()) finish(fresh, "1/2-1/2", "stalemate");
      else if (c.isInsufficientMaterial()) finish(fresh, "1/2-1/2", "insufficient");
      else if (c.isThreefoldRepetition()) finish(fresh, "1/2-1/2", "repetition");
      else if (c.isDraw()) finish(fresh, "1/2-1/2", "fifty");
      else {
        const who = nameOf(viewer) || "?";
        ping(color === "w" ? g.b : g.w, `${who} сделал ход ${san}. Ваш ход (на ход ${hoursText(g.hours, true)}).`, `${who} played ${san}. Your move (${hoursText(g.hours, false)} per move).`, `corr:${id}:${moves.length}`, id);
      }
      return out(200, { ok: true, game: view(get(id) as Row, viewer) });
    }

    if (p === "/api/corr/resign") {
      finish(g, color === "w" ? "0-1" : "1-0", "resign");
      return out(200, { ok: true, game: view(get(id) as Row, viewer) });
    }

    if (p === "/api/corr/draw") {
      const act = String(m.action ?? "");
      const opp = other(color);
      if (act === "offer" && !g.draw_by) {
        db.prepare("UPDATE corr_games SET draw_by=?, updated=? WHERE id=?").run(color, Date.now(), id);
        const who = nameOf(viewer) || "?";
        ping(opp === "w" ? g.w : g.b, `${who} предлагает ничью`, `${who} offers a draw`, `corr:${id}:draw:${g.moves.length}`, id);
      } else if (act === "accept" && g.draw_by === opp) {
        finish(g, "1/2-1/2", "agreed");
      } else if (act === "decline" && g.draw_by === opp) {
        db.prepare("UPDATE corr_games SET draw_by='', updated=? WHERE id=?").run(Date.now(), id);
      } else return bad("bad_action");
      return out(200, { ok: true, game: view(get(id) as Row, viewer) });
    }

    return bad("not_found", 404);
  } catch (e) {
    const msg = (e as Error).message;
    return bad(msg === "too_big" || msg === "bad_json" ? msg : "server", msg === "server" ? 500 : 400);
  }
}

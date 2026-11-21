"use client";
// Автоперевод страницы приглашения на язык посетителя. Язык берётся из настроек сайта или из языков браузера
// (navigator.languages: самый надёжный признак региона и языка посетителя). Исходный текст страницы русский или английский;
// для других языков он переводится через сервер переводов (с общим кэшем), результат запоминается в браузере.
// Переводятся только текстовые узлы и атрибуты (placeholder, aria-label, title), разметка и React не затрагиваются.
import { useCallback, useEffect, useState, type RefObject } from "react";
import { guestTranslate } from "./guest-api";

/** Языки, которые умеет переводчик на сервере (без en и ru: это языки самой страницы) */
const SUPPORTED = new Set(["es", "de", "fr", "it", "pt", "pl", "uk", "tr", "ar", "zh", "ja", "ko", "hi", "id", "vi", "nl", "cs", "ro", "bg", "el", "he", "th", "sv", "hu", "kk"]);
const RTL = new Set(["ar", "he"]);
const OFF_KEY = "hm_pt_off";
const ATTRS = ["placeholder", "aria-label", "title"] as const;
const SKIP = "[data-notr],[translate=no],script,style,code,pre,textarea,svg,noscript";
const BATCH = 900;      // символов в одном запросе к переводчику (лимит сервера 1000)
const MAX_NODE = 400;   // слишком длинные тексты не переводим (это чаще пользовательский текст)
const CACHE_MAX = 400;

/** На какой язык переводить страницу (null: не нужно). appLang: язык интерфейса сайта (ru или en/другой, где текст английский). */
export function pageTarget(appLang: string, langs?: readonly string[]): string | null {
  if (appLang === "ru") return null; // русский интерфейс: текст страницы уже русский
  if (appLang !== "en" && SUPPORTED.has(appLang)) return appLang;
  const list = langs ?? (typeof navigator !== "undefined" ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : []);
  for (const l of list) {
    const c = String(l || "").slice(0, 2).toLowerCase();
    if (c === "en" || c === "ru") return null;
    if (SUPPORTED.has(c)) return c;
  }
  return null;
}

export function langName(code: string): string {
  try { return new Intl.DisplayNames([code], { type: "language" }).of(code) || code; } catch { return code; }
}

const loadCache = (t: string): Record<string, string> => { try { return JSON.parse(localStorage.getItem("hm_pt_" + t) || "{}"); } catch { return {}; } };
const saveCache = (t: string, c: Record<string, string>) => {
  try {
    const keys = Object.keys(c);
    const out: Record<string, string> = {};
    for (const k of keys.slice(-CACHE_MAX)) out[k] = c[k];
    localStorage.setItem("hm_pt_" + t, JSON.stringify(out));
  } catch { /* хранилище недоступно: перевод просто не запомнится */ }
};
const pageId = (): string => {
  try {
    let v = localStorage.getItem("hm_pgid");
    if (!v) { v = "pg" + Array.from(crypto.getRandomValues(new Uint8Array(12))).map((b) => b.toString(16).padStart(2, "0")).join(""); localStorage.setItem("hm_pgid", v); }
    return v;
  } catch { return "pgtmp" + Math.random().toString(36).slice(2, 12); }
};

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
/** Числа заменяем метками {1}, {2}: счётчики вроде «осталось 17» не плодят новые переводы */
const mask = (s: string) => {
  const nums: string[] = [];
  const key = s.replace(/\d+(?:[.,:]\d+)*/g, (m) => { nums.push(m); return "{" + nums.length + "}"; });
  return { key, nums };
};
const okMask = (t: string, nums: string[]) => nums.every((_, i) => t.includes("{" + (i + 1) + "}"));
const unmask = (t: string, nums: string[]) => t.replace(/\{(\d+)\}/g, (_, i) => nums[Number(i) - 1] ?? "");
const hasLetters = (s: string) => /\p{L}/u.test(s);

/** Запускает перевод страницы; возвращает функцию остановки (она возвращает исходные тексты). */
export function startPageTranslate(target: string, getRoot: () => HTMLElement | null, setBusy: (b: boolean) => void = () => {}): () => void {
  const cache = loadCache(target);
  const g = pageId();
  const orig = new Map<Text, string>(), shown = new Map<Text, string>();
  const aorig = new Map<Element, Record<string, string>>(), ashown = new Map<Element, Record<string, string>>();
  let dead = 0; // до этого времени сервер перевода не трогаем (ошибка или лимит)
  let running = false, again = false, stopped = false, timer = 0;
  const dirSet: HTMLElement[] = [];

  const roots = () => [getRoot(), ...Array.from(document.querySelectorAll<HTMLElement>("[data-pt]"))].filter((x): x is HTMLElement => !!x);
  const textNodes = (): Text[] => {
    const out: Text[] = [];
    for (const r of roots()) {
      const w = document.createTreeWalker(r, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
      });
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const v = n.nodeValue ?? "";
        if (v.length <= MAX_NODE && hasLetters(v)) out.push(n as Text);
      }
    }
    return out;
  };
  const attrEls = (): Element[] => {
    const out: Element[] = [];
    for (const r of roots()) r.querySelectorAll("[placeholder],[aria-label],[title]").forEach((e) => { if (!e.closest(SKIP)) out.push(e); });
    return out;
  };

  const obs = new MutationObserver(() => schedule());
  const watch = () => obs.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
  function schedule() { if (stopped) return; window.clearTimeout(timer); timer = window.setTimeout(() => { void process(); }, 250); }

  async function fetchBatch(keys: string[], depth = 0): Promise<void> {
    if (!keys.length || Date.now() < dead) return;
    const r = await guestTranslate(keys.join("\n"), target, g);
    if (!r) { dead = Date.now() + 5 * 60_000; return; } // ошибка или лимит: оставляем как есть и пробуем позже
    const lines = r.text.split("\n").map((x) => x.trim());
    if (lines.length === keys.length) {
      keys.forEach((k, i) => { if (lines[i]) cache[k] = lines[i]; });
    } else if (keys.length > 1 && depth < 2) {
      const mid = Math.ceil(keys.length / 2);
      await fetchBatch(keys.slice(0, mid), depth + 1);
      await fetchBatch(keys.slice(mid), depth + 1);
    }
  }

  const trans = (src: string): string | null => {
    const n = norm(src);
    if (!n) return null;
    const { key, nums } = mask(n);
    const t = cache[key];
    if (!t || !okMask(t, nums)) return null;
    const lead = src.match(/^\s*/)?.[0] ?? "", trail = src.match(/\s*$/)?.[0] ?? "";
    return lead + unmask(t, nums) + trail;
  };

  function apply() {
    obs.disconnect();
    try {
      for (const n of textNodes()) {
        const cur = n.nodeValue ?? "";
        if (shown.get(n) === cur) continue;              // уже переведён нами
        orig.set(n, cur); shown.delete(n);                // новый или изменённый React текст
        const t = trans(cur);
        if (t && t !== cur) { n.nodeValue = t; shown.set(n, t); }
      }
      for (const e of attrEls()) {
        const o = aorig.get(e) ?? {}, s = ashown.get(e) ?? {};
        for (const a of ATTRS) {
          const cur = e.getAttribute(a);
          if (cur == null || s[a] === cur || !hasLetters(cur)) continue;
          o[a] = cur; delete s[a];
          const t = trans(cur);
          if (t && t !== cur) { e.setAttribute(a, t); s[a] = t; }
        }
        aorig.set(e, o); ashown.set(e, s);
      }
      if (RTL.has(target)) for (const r of roots()) if (r.dir !== "rtl") { r.dir = "rtl"; dirSet.push(r); }
    } finally { if (!stopped) watch(); }
  }

  function missing(): string[] {
    const need = new Set<string>();
    const add = (src: string) => { const n = norm(src); if (!n || !hasLetters(n)) return; const { key, nums } = mask(n); if (!cache[key] || !okMask(cache[key], nums)) need.add(key); };
    for (const n of textNodes()) { const cur = n.nodeValue ?? ""; if (shown.get(n) !== cur) add(cur); }
    for (const e of attrEls()) for (const a of ATTRS) { const cur = e.getAttribute(a); if (cur && ashown.get(e)?.[a] !== cur) add(cur); }
    return [...need];
  }

  async function process() {
    if (stopped) return;
    if (running) { again = true; return; }
    running = true;
    try {
      apply();                                           // сразу то, что уже есть в кэше (без мигания)
      const need = missing().filter((k) => k.length <= BATCH);
      if (need.length && Date.now() >= dead) {
        setBusy(true);
        let batch: string[] = [], len = 0;
        const flush = async () => { if (batch.length) { const b = batch; batch = []; len = 0; await fetchBatch(b); } };
        for (const k of need) {
          if (len + k.length + 1 > BATCH) await flush();
          batch.push(k); len += k.length + 1;
          if (stopped) break;
        }
        await flush();
        saveCache(target, cache);
        if (!stopped) apply();
      }
    } finally {
      setBusy(false);
      running = false;
      if (again && !stopped) { again = false; schedule(); }
    }
  }

  watch();
  void process();

  return () => {
    stopped = true; window.clearTimeout(timer); obs.disconnect();
    for (const [n, s] of shown) if (n.isConnected && n.nodeValue === s) n.nodeValue = orig.get(n) ?? s;
    for (const [e, s] of ashown) { const o = aorig.get(e) ?? {}; for (const a of Object.keys(s)) if (e.getAttribute(a) === s[a] && o[a] != null) e.setAttribute(a, o[a]); }
    for (const r of dirSet) r.removeAttribute("dir");
  };
}

/** Хук для страницы: определяет язык, включает перевод, даёт переключатель «оригинал / перевод» (выбор помнится) */
export function usePageTranslate(rootRef: RefObject<HTMLElement>, appLang: string) {
  const [target, setTarget] = useState<string | null>(null);
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = pageTarget(appLang);
    setTarget(t);
    let off = false;
    try { off = localStorage.getItem(OFF_KEY) === "1"; } catch { /* без хранилища */ }
    setOn(!!t && !off);
  }, [appLang]);

  useEffect(() => {
    if (!target || !on) return;
    return startPageTranslate(target, () => rootRef.current, setBusy);
  }, [target, on, rootRef]);

  const toggle = useCallback(() => {
    setOn((v) => { try { localStorage.setItem(OFF_KEY, v ? "1" : "0"); } catch { /* без хранилища */ } return !v; });
  }, []);

  return { target, on, busy, toggle, name: target ? langName(target) : "" };
}

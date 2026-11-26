"use client";
// Посты сообщества: лента для всех участников, форма для владельца (текст до 1500 знаков, до 3 фото, 1 видео по ссылке, 1 ссылка).
// В закрытом сообществе ленту видят только участники. Фото загружаются так же, как в постах профиля.
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/ctx";
import { useSocial } from "@/lib/social";
import { mediaSrc, type Community } from "@/lib/communities";
import { uploadImage } from "./PostComposer";
import { CPOST_MAX_PHOTOS, CPOST_MAX_TEXT, cpostError, deleteCPost, isVideoLink, listCPosts, saveCPost, type CPost } from "@/lib/cposts";

const field = "w-full rounded-xl border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 text-sm";
type Form = { id: number; text: string; photos: string[]; video: string; link: string };
const EMPTY: Form = { id: 0, text: "", photos: [], video: "", link: "" };
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

export default function CommunityPosts({ c }: { c: Community }) {
  const { lang, toast } = useApp();
  const { token } = useSocial();
  const ru = lang === "ru";
  const [items, setItems] = useState<CPost[]>([]);
  const [manage, setManage] = useState(false);
  const [locked, setLocked] = useState(false);
  const [more, setMore] = useState(false);
  const [ready, setReady] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);
  const [up, setUp] = useState(0);
  const file = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    listCPosts(c.slug, token || "").then((r) => { setItems(r.items); setManage(r.manage); setLocked(r.locked); setMore(r.more); }).catch(() => { /* раздел просто не покажется */ }).finally(() => setReady(true));
  }, [c.slug, token]);
  useEffect(() => { load(); }, [load]);

  const older = () => {
    const last = items[items.length - 1];
    if (!last) return;
    listCPosts(c.slug, token || "", last.id).then((r) => { setItems((a) => [...a, ...r.items]); setMore(r.more); }).catch((e) => toast(cpostError(e, ru), "err"));
  };

  const pick = async (list: FileList | null) => {
    if (!list || !list.length || !form) return;
    for (const f of Array.from(list).slice(0, CPOST_MAX_PHOTOS - form.photos.length)) {
      setUp((n) => n + 1);
      try {
        const path = await uploadImage(token, f);
        setForm((x) => (x && x.photos.length < CPOST_MAX_PHOTOS ? { ...x, photos: [...x.photos, path] } : x));
      } catch (e) {
        const m = (e as Error)?.message;
        toast(m === "too_big" ? (ru ? "Фото слишком большое" : "Photo is too large") : m === "bad_image" ? (ru ? "Нужна картинка JPG, PNG или WebP" : "Use a JPG, PNG or WebP image") : cpostError(e, ru), "err");
      } finally { setUp((n) => n - 1); }
    }
    if (file.current) file.current.value = "";
  };

  const send = async () => {
    if (!form) return;
    if (form.video.trim() && !isVideoLink(form.video)) { toast(cpostError(new Error("bad_video"), ru), "err"); return; }
    if (form.link.trim() && !/^https:\/\/\S{4,}$/.test(form.link.trim())) { toast(cpostError(new Error("bad_link"), ru), "err"); return; }
    setBusy(true);
    try {
      const p = await saveCPost(token, { id: form.id || undefined, community: c.slug, text: form.text.trim(), photos: form.photos, video: form.video.trim(), link: form.link.trim() });
      setItems((a) => (form.id ? a.map((x) => (x.id === p.id ? p : x)) : [p, ...a]));
      setForm(null);
      toast(ru ? "Опубликовано" : "Published", "ok");
    } catch (e) { toast(cpostError(e, ru), "err"); } finally { setBusy(false); }
  };

  const remove = async (p: CPost) => {
    if (!window.confirm(ru ? "Удалить пост?" : "Delete this post?")) return;
    try { await deleteCPost(token, p.id); setItems((a) => a.filter((x) => x.id !== p.id)); } catch (e) { toast(cpostError(e, ru), "err"); }
  };

  if (!ready) return null;
  if (locked) return <section className="card text-sm opacity-80">{ru ? "Посты сообщества видят только участники." : "Posts are visible to members only."}</section>;
  if (!manage && items.length === 0) return null;

  const left = CPOST_MAX_TEXT - (form?.text.length || 0);
  const empty = !form || (!form.text.trim() && !form.photos.length && !form.video.trim() && !form.link.trim());
  return (
    <section className="space-y-3" aria-label={ru ? "Посты сообщества" : "Community posts"}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-extrabold">{ru ? "Посты" : "Posts"}</h2>
        {manage && !form && <button type="button" className="btn btn-primary !py-2" onClick={() => setForm({ ...EMPTY })}>✍️ {ru ? "Написать пост" : "Write a post"}</button>}
      </div>

      {manage && form && (
        <div className="card space-y-3">
          <textarea className={field} rows={6} maxLength={CPOST_MAX_TEXT} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value.slice(0, CPOST_MAX_TEXT) })}
            placeholder={ru ? "О чём хотите рассказать участникам?" : "What do you want to tell your members?"} aria-label={ru ? "Текст поста" : "Post text"} />
          {(form.photos.length > 0 || up > 0) && (
            <div className="grid grid-cols-3 gap-2">
              {form.photos.map((p) => (
                <div key={p} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mediaSrc(p)} alt="" className="h-28 w-full rounded-xl object-cover" />
                  <button type="button" aria-label={ru ? "Убрать фото" : "Remove photo"} onClick={() => setForm({ ...form, photos: form.photos.filter((x) => x !== p) })} className="absolute right-1 top-1 h-7 w-7 rounded-full bg-black/70 text-sm text-white">✕</button>
                </div>
              ))}
              {up > 0 && <div className="grid h-28 place-items-center rounded-xl border border-dashed text-xs opacity-70">{ru ? "Загрузка…" : "Uploading…"}</div>}
            </div>
          )}
          <input className={field} value={form.video} maxLength={300} onChange={(e) => setForm({ ...form, video: e.target.value })} placeholder={ru ? "Видео: ссылка на YouTube, Vimeo или RuTube (необязательно)" : "Video: a YouTube, Vimeo or RuTube link (optional)"} />
          <input className={field} value={form.link} maxLength={300} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder={ru ? "Ссылка https://… (необязательно)" : "Link https://… (optional)"} />
          <div className="flex flex-wrap items-center gap-2">
            <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => void pick(e.target.files)} />
            <button type="button" className="btn btn-ghost !py-2" disabled={form.photos.length + up >= CPOST_MAX_PHOTOS} onClick={() => file.current?.click()}>🖼 {ru ? `Фото (${form.photos.length}/${CPOST_MAX_PHOTOS})` : `Photos (${form.photos.length}/${CPOST_MAX_PHOTOS})`}</button>
            <span className="ml-auto text-xs" style={{ color: left < 100 ? "#e0245e" : undefined, opacity: left < 100 ? 1 : 0.6 }}>{left}</span>
            <button type="button" className="btn btn-ghost !py-2" onClick={() => setForm(null)}>{ru ? "Отмена" : "Cancel"}</button>
            <button type="button" className="btn btn-primary !py-2" disabled={busy || up > 0 || empty} onClick={() => void send()}>{busy ? "…" : form.id ? (ru ? "Сохранить" : "Save") : (ru ? "Опубликовать" : "Publish")}</button>
          </div>
        </div>
      )}

      {items.map((p) => (
        <article key={p.id} className="card space-y-3">
          {p.text && <p className="whitespace-pre-wrap break-words text-sm sm:text-base">{p.text}</p>}
          {p.photos.length > 0 && (
            <div className={`grid gap-2 ${p.photos.length === 1 ? "grid-cols-1" : p.photos.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
              {p.photos.map((u) => (
                <a key={u} href={mediaSrc(u)} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mediaSrc(u)} alt="" loading="lazy" className={`w-full rounded-xl object-cover ${p.photos.length === 1 ? "max-h-96" : "h-32 sm:h-40"}`} />
                </a>
              ))}
            </div>
          )}
          {p.video && (
            <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black">
              <iframe src={p.video} title={ru ? "Видео" : "Video"} loading="lazy" allowFullScreen className="absolute inset-0 h-full w-full border-0" allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen" referrerPolicy="strict-origin-when-cross-origin" />
            </div>
          )}
          {p.link && <a href={p.link} target="_blank" rel="noopener noreferrer nofollow ugc" className="inline-block max-w-full truncate rounded-xl bg-violet-100 px-3 py-2 text-sm font-semibold text-violet-800 dark:bg-violet-500/25 dark:text-violet-200">🔗 {host(p.link)}</a>}
          <div className="flex flex-wrap items-center gap-2 text-xs opacity-70">
            <span>{new Date(p.created).toLocaleDateString(ru ? "ru-RU" : "en-US", { day: "numeric", month: "long", year: "numeric" })}{p.edited ? (ru ? " · изменено" : " · edited") : ""}</span>
            {manage && (
              <span className="ml-auto flex gap-2">
                <button type="button" className="underline" onClick={() => { setForm({ id: p.id, text: p.text, photos: p.photos, video: p.video, link: p.link }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{ru ? "Изменить" : "Edit"}</button>
                <button type="button" className="underline" onClick={() => void remove(p)}>{ru ? "Удалить" : "Delete"}</button>
              </span>
            )}
          </div>
        </article>
      ))}
      {more && <button type="button" className="btn btn-ghost w-full" onClick={older}>{ru ? "Показать ещё" : "Show more"}</button>}
    </section>
  );
}

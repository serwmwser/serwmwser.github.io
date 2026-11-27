"use client";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/ctx";

/** Кнопка «QR»: показывает QR-код ссылки и даёт скачать его картинкой (для визитки, печати, сторис). */
export default function QrButton({ url, name }: { url: string; name: string }) {
  const { lang } = useApp();
  const ru = lang === "ru";
  const [open, setOpen] = useState(false);
  const [img, setImg] = useState("");
  useEffect(() => {
    if (!open || img) return;
    let alive = true;
    import("qrcode").then((q) => q.toDataURL(url, { width: 512, margin: 2, errorCorrectionLevel: "M" })).then((d) => { if (alive) setImg(d); }).catch(() => { /* без QR остаётся ссылка */ });
    return () => { alive = false; };
  }, [open, img, url]);
  return (
    <>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold hover:opacity-80">
        <span aria-hidden>▦</span>QR
      </button>
      {open && (
        <div className="basis-full rounded-2xl border p-3 flex items-center gap-4">
          {img ? <img src={img} alt={"QR " + url} width={128} height={128} className="rounded-lg bg-white" /> : <div className="h-32 w-32 rounded-lg bg-black/5" />}
          <div className="min-w-0 space-y-2 text-sm">
            <div className="font-semibold break-all select-all">{url.replace(/^https?:\/\//, "")}</div>
            <p className="text-xs opacity-70">{ru ? "Наведите камеру телефона: откроется ваш профиль." : "Point a phone camera at it to open the profile."}</p>
            {img && <a href={img} download={"himeet-" + name + ".png"} className="btn btn-ghost !py-1 !px-3 !text-xs inline-block">{ru ? "Скачать PNG" : "Download PNG"}</a>}
          </div>
        </div>
      )}
    </>
  );
}

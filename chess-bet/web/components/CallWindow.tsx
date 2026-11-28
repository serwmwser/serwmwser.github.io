"use client";
// Глобальное окно звонков: включает приём звонков для вошедшего пользователя и показывает входящий/текущий звонок, с видео собеседника и своим превью.
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/lib/ctx";
import { useSocial } from "@/lib/social";
import { acceptCall, callError, clearCallError, declineCall, fmtSecs, hangup, startCalls, stopCalls, toggleCam, toggleMute, useCallState } from "@/lib/calls";
import Avatar from "./Avatar";

/** Видео из потока: звук идёт отдельно, поэтому элемент всегда без звука */
function VideoEl({ stream, mirror = false, className = "" }: { stream: MediaStream | null; mirror?: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.srcObject = stream;
    if (stream) void v.play().catch(() => { /* браузер разрешит после нажатия */ });
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted className={className} style={mirror ? { transform: "scaleX(-1)" } : undefined} />;
}

export default function CallWindow() {
  const { lang, toast } = useApp();
  const { token } = useSocial();
  const ru = lang === "ru";
  const c = useCallState();
  const [secs, setSecs] = useState(0);
  const base = useRef({ at: 0, secs: 0 });
  const lastEnded = useRef(0);

  // приём звонков включён, пока пользователь вошёл на сайт
  useEffect(() => {
    startCalls(token || "");
    return () => { if (!token) stopCalls(); };
  }, [token]);

  // таймер: считаем сами каждую секунду, сверяемся с сервером
  useEffect(() => {
    base.current = { at: Date.now(), secs: c.secs };
    setSecs(c.secs);
  }, [c.secs]);
  useEffect(() => {
    if (c.status !== "active") return;
    const t = setInterval(() => setSecs(base.current.secs + Math.floor((Date.now() - base.current.at) / 1000)), 1000);
    return () => clearInterval(t);
  }, [c.status]);

  // ошибки
  useEffect(() => {
    if (!c.error) return;
    toast(callError(c.error, ru), c.error === "other_tab" ? "info" : "err");
    clearCallError();
  }, [c.error, ru, toast]);

  // итог звонка
  useEffect(() => {
    if (!c.ended || c.ended.at === lastEnded.current) return;
    lastEnded.current = c.ended.at;
    if (c.ended.reason === "hangup" && c.ended.secs > 0) toast((ru ? "Звонок завершён · " : "Call ended · ") + fmtSecs(c.ended.secs), "info");
    else toast(callError(c.ended.reason, ru), "info");
  }, [c.ended, ru, toast]);

  if (!token || !c.peer || (c.status !== "incoming" && c.status !== "calling" && c.status !== "connecting" && c.status !== "active")) return null;

  const label =
    c.status === "incoming" ? (ru ? "Входящий звонок" : "Incoming call") :
    c.status === "calling" ? (ru ? "Вызываем…" : "Calling…") :
    c.status === "connecting" ? (ru ? "Соединяем…" : "Connecting…") :
    fmtSecs(secs);

  const showRemote = c.status === "active" && c.peerCam && !!c.remoteVideo;
  const showLocal = c.status === "active" && c.cam && !!c.localVideo;
  const showVideo = showRemote || showLocal;

  return (
    <div className="fixed inset-x-0 bottom-4 z-[100] flex justify-center px-4 pointer-events-none" role="dialog" aria-live="assertive" aria-label={label}>
      <div className={"card pointer-events-auto w-full !p-4 shadow-2xl " + (showVideo ? "max-w-lg" : "max-w-sm")}>
        <div className="flex items-center gap-3">
          <div className={c.status === "incoming" ? "animate-pulse" : ""}><Avatar name={c.peer.name} src={c.peer.avatar} size={showVideo ? 40 : 56} /></div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">@{c.peer.name}</div>
            <div className={"text-sm " + (c.status === "active" ? "tabular-nums text-emerald-600 font-semibold" : "opacity-70")}>{label}</div>
          </div>
        </div>

        {showVideo && (
          <div className="relative mt-3 aspect-[4/3] w-full overflow-hidden rounded-xl bg-black">
            {showRemote
              ? <VideoEl stream={c.remoteVideo} className="absolute inset-0 h-full w-full object-cover" />
              : <div className="absolute inset-0 grid place-items-center px-4 text-center text-sm text-white/70">{ru ? "У собеседника выключена камера" : "The other person's camera is off"}</div>}
            {showLocal && (
              <VideoEl stream={c.localVideo} mirror className="absolute bottom-2 right-2 h-24 w-auto rounded-lg border border-white/40 object-cover shadow-lg" />
            )}
          </div>
        )}

        <div className={"mt-4 gap-2 " + (c.status === "active" ? "grid grid-cols-3" : "flex")}>
          {c.status === "incoming" ? (
            <>
              <button type="button" className="btn btn-primary flex-1" onClick={() => void acceptCall()}>📞 {ru ? "Принять" : "Accept"}</button>
              <button type="button" className="btn btn-danger flex-1" onClick={declineCall}>{ru ? "Отклонить" : "Decline"}</button>
            </>
          ) : (
            <>
              {c.status === "active" && (
                <>
                  <button type="button" className={"btn " + (c.muted ? "btn-primary" : "btn-ghost")} onClick={toggleMute} aria-pressed={c.muted}>
                    {c.muted ? "🔇 " + (ru ? "Звук выкл." : "Muted") : "🎙 " + (ru ? "Микрофон" : "Mic")}
                  </button>
                  <button type="button" className={"btn " + (c.cam ? "btn-primary" : "btn-ghost")} onClick={() => void toggleCam()} aria-pressed={c.cam}>
                    {c.cam ? "📷 " + (ru ? "Камера вкл." : "Cam on") : "📷 " + (ru ? "Камера" : "Camera")}
                  </button>
                </>
              )}
              <button type="button" className={"btn btn-danger " + (c.status === "active" ? "" : "flex-1")} onClick={hangup}>
                {c.status === "calling" ? (ru ? "Отмена" : "Cancel") : (ru ? "Завершить" : "Hang up")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

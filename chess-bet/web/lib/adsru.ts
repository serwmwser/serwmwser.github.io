import { API_URL } from "./config";

// Адрес российской доски объявлений (отдельный проект ads-ru на VPS, он же продаётся как шаблон сайта).
// Когда DNS ads.himeet.online переключат на VPS, замените адрес на "https://ads.himeet.online".
export const ADS_RU_URL = "https://ads.84-200-80-66.sslip.io";

// Единый вход через HiMeet. Включайте (true) только после того, как на сервере ads-ru установлен приём пропуска (/sso).
export const ADS_RU_SSO = true;

/** Короткий одноразовый пропуск для входа на российскую доску (действует 2 минуты) */
export async function adsRuPass(token: string): Promise<string> {
  const [wallet, tok] = (token || "").split("|");
  const r = await fetch(`${API_URL}/api/sso/ads-ru`, {
    method: "POST", cache: "no-store",
    headers: { "content-type": "application/json", ...(tok ? { authorization: `Bearer ${tok}`, "x-wallet": wallet } : {}) },
    body: "{}",
  });
  const j = (await r.json()) as { ok: boolean; token?: string; error?: string };
  if (!j.ok || !j.token) throw new Error(j.error || "error");
  return j.token;
}

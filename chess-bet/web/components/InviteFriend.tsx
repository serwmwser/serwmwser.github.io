"use client";
import { useState } from "react";
import { useActiveAccount } from "thirdweb/react";
import { useApp } from "@/lib/ctx";
import { buildInviteLink } from "@/lib/invite-link";
import { useSocial } from "@/lib/social";
import { absoluteUrl, ROUTES } from "@/lib/urls";
import ShareMenu from "./ShareMenu";

type Tpl = "chat" | "ads" | "chess";

/** HiMeet invite: карточка «Пригласить друга». Три шаблона приглашения, каждый ведёт в свой раздел, а не на главную.
 *  Ссылка в чат короткая: /i/?u=ваш_ник (если ника ещё нет, используется ссылка с адресом). */
export default function InviteFriend() {
  const { lang } = useApp();
  const ru = lang === "ru";
  const account = useActiveAccount();
  const { me } = useSocial();
  const [tpl, setTpl] = useState<Tpl>("chat");
  const addr = account ? account.address.toLowerCase() : "";
  const origin = typeof location !== "undefined" ? location.origin : "https://himeet.online";

  const withRef = (path: string) => absoluteUrl(path) + (addr ? "?ref=" + addr : "");
  const chatLink = me?.name ? buildInviteLink(origin, me.name) : addr ? `${origin}/i/?ref=${addr}` : absoluteUrl("/");

  const T: Record<Tpl, { label: string; hint: string; url: string; text: string }> = {
    chat: {
      label: ru ? "💬 Чат с переводом" : "💬 Chat with translation",
      hint: ru ? "Друг сразу попадёт в диалог с вами, без регистрации." : "Your friend lands straight in a chat with you, no sign-up.",
      url: chatLink,
      text: ru ? "Привет! Заходи в HiMeet: общаемся на любых языках, чат сам переводит. Ссылка без установки:" : "Hi! Join me on HiMeet: we chat in any language and the chat translates. No install needed:",
    },
    ads: {
      label: ru ? "🛒 Объявления" : "🛒 Classifieds",
      hint: ru ? "Друг откроет раздел объявлений." : "Your friend opens the classifieds section.",
      url: withRef(ROUTES.ads),
      text: ru ? "Загляни на HiMeet: бесплатные объявления со всего мира, первое объявление бесплатно:" : "Take a look at HiMeet: free worldwide classifieds, your first ad is free:",
    },
    chess: {
      label: ru ? "♟ Шахматная задача" : "♟ Chess puzzle",
      hint: ru ? "Друг откроет шахматные задачи." : "Your friend opens the chess puzzles.",
      url: withRef(ROUTES.puzzles),
      text: ru ? "Реши шахматную задачу на HiMeet и сравни результат со мной:" : "Solve a chess puzzle on HiMeet and compare your result with mine:",
    },
  };
  const cur = T[tpl];

  return (
    <section className="card space-y-3 text-center" style={{ border: "2px solid #ff8fb1" }}>
      <h2 className="text-lg font-extrabold">💌 {ru ? "Пригласите друга" : "Invite a friend"}</h2>
      <p className="text-sm opacity-80">{ru ? "Выберите, что показать другу. Он откроет ссылку в браузере, без установки приложения." : "Choose what to show your friend. They open the link in a browser, no app install."}</p>
      <div className="flex flex-wrap justify-center gap-2" role="group" aria-label={ru ? "Шаблон приглашения" : "Invitation template"}>
        {(Object.keys(T) as Tpl[]).map((k) => (
          <button key={k} type="button" aria-pressed={tpl === k} className={"chip " + (tpl === k ? "chip-on" : "")} onClick={() => setTpl(k)}>{T[k].label}</button>
        ))}
      </div>
      <p className="text-xs opacity-70">{cur.hint}</p>
      <p className="text-xs opacity-80" data-id="reward-note">{ru ? "Ссылка реферальная: за активность друга вы получаете награды. Подробности во вкладке «Заработать»." : "The link is also a referral link: you earn rewards for your friend's activity. Details are in the Earn tab."}</p>
      <p className="text-xs font-mono opacity-80 break-all" aria-label={ru ? "Ссылка приглашения" : "Invitation link"}>{cur.url}</p>
      <ShareMenu url={cur.url} text={cur.text} label={ru ? "Пригласить друга" : "Invite a friend"} className="btn btn-primary w-full justify-center" />
    </section>
  );
}

"use client";
// Политика конфиденциальности (покупки без регистрации). ШАБЛОН: перед приёмом реальных платежей текст должен проверить юрист.
import PageShell from "@/components/PageShell";
import { useApp } from "@/lib/ctx";
import { SELLER_INN, SELLER_NAME } from "@/components/SellerInfo";

type Sec = [string, string[]];

const RU: Sec[] = [
  ["1. Кто обрабатывает данные", [
    `Оператор данных для покупок в магазине: самозанятый ${SELLER_NAME}, ИНН ${SELLER_INN}. Контакт: chessgrokearn@gmail.com.`,
  ]],
  ["2. Какие данные мы собираем", [
    "При покупке без регистрации: адрес электронной почты, выбранный способ оплаты, код и состав заказа, время оплаты. При оплате USDC: хэш транзакции и адрес кошелька отправителя (они и так публичны в блокчейне).",
    "Мы не просим и не храним сид-фразы, приватные ключи, данные банковских карт и пароли от банков. Платёж картой обрабатывает платёжный сервис, данные карты мы не видим.",
    "Номер телефона, на который принимаются переводы СБП, показывается только на странице заказа, в открытом коде сайта его нет.",
  ]],
  ["3. Зачем", [
    "Чтобы выдать заказ, подтвердить оплату, направить чек, помочь по вопросам и возврату, предотвращать мошенничество. Рекламную рассылку на этот адрес мы не отправляем без отдельного согласия.",
  ]],
  ["4. Кому передаём", [
    "Данные не продаются. Они могут быть переданы платёжному сервису (при оплате через него), налоговой службе в части чека, а также по законному требованию государственных органов. Автору сообщества, у которого вы купили товар, передаются сведения о заказе, необходимые для выполнения услуги.",
  ]],
  ["5. Хранение и защита", [
    "Заказы хранятся на сервере проекта, пока это нужно для исполнения обязательств и учёта, но не дольше, чем требует закон. Файлы товаров лежат в закрытом хранилище и выдаются только по ссылке заказа.",
    "Ссылка на заказ в этом браузере сохраняется локально (localStorage), чтобы вы могли вернуться к покупке. Её можно удалить, очистив данные сайта.",
  ]],
  ["6. Ваши права", [
    "Вы можете запросить сведения о своих данных, их исправление или удаление, написав на chessgrokearn@gmail.com с кодом заказа. Данные, которые мы обязаны хранить по закону (учёт продаж), удалить нельзя до окончания срока хранения.",
  ]],
  ["7. Изменения", [
    "Мы можем обновлять политику. Действующая редакция всегда находится на этой странице.",
  ]],
];

const EN: Sec[] = [
  ["1. Controller", [
    `Controller for shop purchases: self-employed ${SELLER_NAME}, TIN ${SELLER_INN}. Contact: chessgrokearn@gmail.com.`,
  ]],
  ["2. Data and purposes", [
    "When you buy without an account we collect your email, payment method, order code and contents, and payment time; for USDC also the transaction hash and sender wallet (public on the blockchain). We never ask for or store seed phrases, private keys or card data.",
    "We use it to deliver your order, confirm payment, send a receipt, handle support and refunds and prevent fraud. We do not send marketing email without separate consent.",
  ]],
  ["3. Sharing, storage and rights", [
    "We do not sell data. It may be shared with a payment provider, tax authorities (receipt) and public authorities on lawful request; the community author receives the order details needed to perform a service. Orders are kept as long as needed and required by law. Your order link is stored in your browser (localStorage) and can be cleared with site data.",
    "To request access, correction or deletion write to chessgrokearn@gmail.com with your order code. Records we must keep by law cannot be deleted before the retention period ends.",
  ]],
];

export default function Privacy() {
  const { lang } = useApp();
  const ru = lang === "ru";
  const secs = ru ? RU : EN;
  return (
    <PageShell title={ru ? "Политика конфиденциальности" : "Privacy policy"} intro={ru ? "Как мы обращаемся с данными при покупках на HiMeet." : "How we handle data for purchases on HiMeet."}>
      <p className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs">
        {ru
          ? "Это шаблон, а не юридическая консультация. Перед приёмом реальных платежей его должен проверить юрист."
          : "This is a template, not legal advice. A lawyer should review it before accepting real payments."}
      </p>
      {secs.map(([h, ps]) => (
        <section key={h} className="space-y-1.5">
          <h2 className="text-lg font-semibold">{h}</h2>
          {ps.map((p) => <p key={p} className="text-sm opacity-85">{p}</p>)}
        </section>
      ))}
    </PageShell>
  );
}

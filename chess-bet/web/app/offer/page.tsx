"use client";
// Публичная оферта о продаже цифровых товаров и услуг. ШАБЛОН: перед приёмом реальных платежей текст должен проверить юрист.
import PageShell from "@/components/PageShell";
import { useApp } from "@/lib/ctx";
import { SELLER_INN, SELLER_NAME } from "@/components/SellerInfo";

type Sec = [string, string[]];

const RU: Sec[] = [
  ["1. Общие положения", [
    `Настоящий документ является публичной офертой (ст. 435 и 437 Гражданского кодекса РФ) самозанятого ${SELLER_NAME}, ИНН ${SELLER_INN} (далее «Продавец»), о продаже цифровых товаров (например, электронных книг в формате PDF) и оказании услуг через сайт himeet.online.`,
    "Оформляя заказ и оплачивая его, покупатель принимает условия оферты. Регистрация на сайте для покупки не требуется.",
    "Товары и услуги, размещённые авторами сообществ, продаёт сам автор сообщества; сайт принимает платёж и передаёт товар покупателю как технический посредник. В карточке товара указано, чей он.",
  ]],
  ["2. Предмет", [
    "Цифровой товар: покупатель получает право скачать файл по ссылке из заказа после подтверждения оплаты. Передача товара считается выполненной в момент, когда ссылка на скачивание стала доступна.",
    "Услуга: оказывается способом, который указан в описании товара и в тексте, показанном после оплаты.",
    "Цена, название и описание указаны в карточке товара. Цена, которую вы увидели при оформлении заказа, не меняется для этого заказа.",
  ]],
  ["3. Оплата", [
    "Способы оплаты указаны при оформлении заказа: СБП (перевод по реквизитам, с кодом заказа в комментарии) и USDC в сети Polygon. Банковские карты и СБП через платёжный сервис ЮKassa будут доступны после подключения, об этом сообщит страница заказа.",
    "Заказ считается оплаченным после подтверждения платежа: для USDC после проверки транзакции в блокчейне, для СБП после подтверждения поступления. Подтверждение СБП может занять до нескольких часов.",
    "Переводы в блокчейне необратимы. Проверяйте сумму, сеть и адрес. Никогда не передавайте сид-фразу или приватный ключ: мы их не запрашиваем.",
    "Продавец применяет налог на профессиональный доход, чек формируется в приложении «Мой налог» и направляется на указанный при заказе адрес электронной почты.",
  ]],
  ["4. Получение товара", [
    "После подтверждения оплаты на странице заказа появляется кнопка скачивания. Ссылку на заказ сохраните: она же доступна в этом браузере и в письме. Оплата даёт право на одно скачивание за одну единицу товара: сохраните файл сразу. Если загрузка прервалась, напишите нам с кодом заказа, мы сбросим счётчик.",
    "Файлы предназначены для личного использования. Запрещено публиковать и перепродавать материалы без согласия автора.",
  ]],
  ["5. Возврат", [
    "Если файл не открывается, повреждён или не соответствует описанию, напишите нам в течение 7 дней после оплаты: мы заменим файл или вернём деньги.",
    "Если товар соответствует описанию и успешно скачан, по причине «не понравилось» возврат не производится, так как цифровой контент нельзя вернуть. Услуга, которая уже оказана, возврату не подлежит; не оказанную услугу мы вернём полностью.",
    "Возврат производится тем же способом, которым была оплата. Переводы USDC возвращаются на кошелёк отправителя без учёта комиссии сети.",
  ]],
  ["6. Информационные материалы", [
    "Материалы о питании и образе жизни носят информационный характер, не заменяют консультацию врача и не обещают конкретного результата. Перед изменением рациона, особенно при заболеваниях, беременности, приёме лекарств, проконсультируйтесь со специалистом.",
  ]],
  ["7. Данные и связь", [
    "Мы используем адрес электронной почты только для выдачи заказа и связи по нему. Подробнее в политике конфиденциальности.",
    "Вопросы по заказам и возвратам: chessgrokearn@gmail.com. Укажите код заказа.",
  ]],
  ["8. Изменения", [
    "Продавец вправе изменить оферту, новая редакция действует для заказов, оформленных после публикации. Действующая редакция всегда находится на этой странице.",
  ]],
];

const EN: Sec[] = [
  ["1. General", [
    `This is a public offer by the self-employed seller ${SELLER_NAME} (TIN ${SELLER_INN}) for selling digital goods (e.g. PDF e-books) and services on himeet.online. Placing and paying an order means accepting these terms. No registration is needed to buy.`,
    "Goods and services listed by community authors are sold by the author; the site only collects the payment and delivers the product as a technical intermediary. The product page shows whose it is.",
  ]],
  ["2. Payment and delivery", [
    "Payment methods are shown at checkout: SBP bank transfer and USDC on Polygon. Card and SBP payments through YooKassa will be available once connected. An order counts as paid after the payment is confirmed. Blockchain transfers are irreversible; never share your seed phrase or private key.",
    "After confirmation a download button appears on the order page (one download per unit purchased). Files are for personal use only.",
  ]],
  ["3. Refunds", [
    "If the file is broken or does not match its description, write to us within 7 days of payment and we will replace it or refund you. A correctly delivered digital product is not refundable for change of mind; an unperformed service is refunded in full.",
  ]],
  ["4. Information materials", [
    "Nutrition and lifestyle materials are for information only, do not replace medical advice and do not promise a specific result. Consult a specialist before changing your diet.",
  ]],
  ["5. Contact", [
    "Orders and refunds: chessgrokearn@gmail.com (include your order code). We may update this offer; the current version is always on this page.",
  ]],
];

export default function Offer() {
  const { lang } = useApp();
  const ru = lang === "ru";
  const secs = ru ? RU : EN;
  return (
    <PageShell title={ru ? "Публичная оферта" : "Public offer"} intro={ru ? "Условия покупки цифровых товаров и услуг на HiMeet." : "Terms for buying digital goods and services on HiMeet."}>
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

// Общие категории сообществ (как на витрине Skool). У каждого сообщества выбирается одна категория,
// по ней работают фильтр каталога и подбор по тематике. Чтобы добавить категорию, допишите строку в список (slug — латиницей, один раз и навсегда).

export type Category = { slug: string; ru: string; en: string; icon: string };

export const CATEGORIES: Category[] = [
  { slug: "ai", ru: "ИИ и автоматизация", en: "AI & Automation", icon: "🤖" },
  { slug: "video", ru: "Видео и монтаж", en: "Video", icon: "🎬" },
  { slug: "side-hustles", ru: "Подработка и доп. доход", en: "Side Hustles", icon: "💼" },
  { slug: "marketing", ru: "Реклама и маркетинг", en: "Ads & Marketing", icon: "📣" },
  { slug: "ecom", ru: "Электронная коммерция", en: "E-commerce", icon: "🛒" },
  { slug: "social", ru: "YouTube и соцсети", en: "YouTube & Social", icon: "📱" },
  { slug: "trading", ru: "Трейдинг", en: "Trading", icon: "📈" },
  { slug: "crypto", ru: "Крипто и Web3", en: "Crypto & Web3", icon: "🪙" },
  { slug: "business", ru: "Бизнес", en: "Business", icon: "🏢" },
  { slug: "sales", ru: "Продажи", en: "Sales", icon: "🤝" },
  { slug: "health", ru: "Здоровье и фитнес", en: "Health & Fitness", icon: "💪" },
  { slug: "sports", ru: "Спорт", en: "Sports", icon: "⚽" },
  { slug: "chess", ru: "Шахматы и настольные игры", en: "Chess & Board Games", icon: "♟" },
  { slug: "gaming", ru: "Игры", en: "Gaming", icon: "🎮" },
  { slug: "realestate", ru: "Недвижимость", en: "Real Estate", icon: "🏠" },
  { slug: "selfimprovement", ru: "Саморазвитие", en: "Self Improvement", icon: "🌱" },
  { slug: "spirituality", ru: "Духовность и вера", en: "Spirituality & Faith", icon: "🕊" },
  { slug: "arts", ru: "Творчество и ремёсла", en: "Arts & Crafts", icon: "🎨" },
  { slug: "trades", ru: "Услуги и ремесло", en: "Home Services & Trades", icon: "🔧" },
  { slug: "careers", ru: "Работа и карьера", en: "Job Search & Careers", icon: "🧑‍💼" },
  { slug: "education", ru: "Образование и экзамены", en: "Education & Test Prep", icon: "🎓" },
  { slug: "fashion", ru: "Мода и красота", en: "Fashion & Beauty", icon: "👗" },
  { slug: "relationships", ru: "Отношения и знакомства", en: "Relationships & Dating", icon: "💞" },
  { slug: "languages", ru: "Иностранные языки", en: "Languages", icon: "🌍" },
  { slug: "music", ru: "Музыка", en: "Music", icon: "🎵" },
  { slug: "finance", ru: "Личные финансы", en: "Personal Finance", icon: "💰" },
  { slug: "pets", ru: "Питомцы", en: "Pets & Animals", icon: "🐾" },
  { slug: "parenting", ru: "Семья и дети", en: "Parenting", icon: "👨‍👩‍👧" },
  { slug: "travel", ru: "Путешествия", en: "Travel", icon: "✈️" },
  { slug: "nature", ru: "Природа и активный отдых", en: "Nature & Outdoors", icon: "🏕" },
  { slug: "other", ru: "Другое", en: "Other", icon: "✨" },
];

/** Категория по умолчанию, если владелец ничего не выбрал */
export const DEFAULT_CATEGORY = "other";

const SLUGS = new Set(CATEGORIES.map((c) => c.slug));
export const isCategory = (s: string): boolean => SLUGS.has(s);
/** Допустимая категория или категория по умолчанию */
export const categoryOr = (s: unknown): string => (typeof s === "string" && SLUGS.has(s) ? s : DEFAULT_CATEGORY);

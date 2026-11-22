import type { Metadata } from "next";

const SITE = "https://himeet.online";
const PATH = "/communities/";
const TITLE = "Communities: find yours or create your own | HiMeet";
const DESC = "Discover communities on HiMeet: chat with translation, games, dating, classifieds and calls with one shared profile. Join for free or create your own open or private community.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  openGraph: { type: "website", url: SITE + PATH, title: TITLE, description: DESC, images: ["/og.png"] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC, images: ["/og.png"] },
};

const JSON_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "CollectionPage", "@id": SITE + PATH + "#page", url: SITE + PATH, name: TITLE, description: DESC, isPartOf: { "@id": SITE + "/#site" }, inLanguage: "en" },
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "HiMeet", item: SITE + "/" },
      { "@type": "ListItem", position: 2, name: "Communities", item: SITE + PATH },
    ] },
  ],
}).replace(/</g, "\\u003c");

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON_LD }} />
      {children}
    </>
  );
}

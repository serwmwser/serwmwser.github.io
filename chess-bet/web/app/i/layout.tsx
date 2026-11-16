import type { Metadata } from "next";

const SITE = "https://himeet.online";
const PATH = "/i/";
const TITLE = "You are invited to HiMeet: chat with automatic translation";
const DESC = "Open the invitation in your browser: no app install, no sign-up. Write in your own language and the chat translates your messages for your friend.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: PATH },
  robots: { index: false, follow: true },
  openGraph: { type: "website", url: SITE + PATH, title: TITLE, description: DESC, images: ["/og.png"] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESC, images: ["/og.png"] },
};

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

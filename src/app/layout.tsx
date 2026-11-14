import type { Metadata } from "next";
import { getUser } from "@/server/auth";
import { getConfig } from "@/server/config";
import { AllioShell } from "@/components/allio/shell";
import "@fontsource/noto-sans-kr/400.css";
import "@fontsource/noto-sans-kr/700.css";
import "./globals.css";
import "./allio.css";
export const metadata: Metadata = {
  title: { default: "ALL-IO · 내 사업장 혜택·행정 관리", template: "%s · ALL-IO" },
  description: "사업장과 직원 정보를 바탕으로 혜택, 서류, 프로젝트와 일정을 한곳에서 관리하세요.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  return (
    <html lang="ko">
      <body className="allio-body">
        <a className="skip-link" href="#main">
          본문으로 이동
        </a>
        <AllioShell signedIn={Boolean(user)} demo={getConfig().demo}>
          {children}
        </AllioShell>
      </body>
    </html>
  );
}

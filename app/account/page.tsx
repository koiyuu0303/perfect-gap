import { Suspense } from "react";
import Link from "next/link";
import { AccountPanel } from "@/components/AccountPanel";

export const metadata = {
  title: "記録の引き継ぎ — Perfect Gap",
};

export default function AccountPage() {
  return (
    <main className="flex-1 flex flex-col items-center px-6 py-10 sm:py-16">
      <div className="w-full max-w-xl flex flex-col gap-8">
        <Link
          href="/"
          className="text-xs text-muted hover:text-foreground transition-colors self-start"
        >
          ← Perfect Gap
        </Link>

        <header className="flex flex-col gap-3">
          <h1 className="text-2xl font-semibold">記録の引き継ぎ</h1>
          <p className="text-sm text-muted leading-relaxed">
            このアプリは登録なしで使えますが、そのままだと記録は
            このブラウザにしか残りません。メールアドレスを紐づけておくと、
            端末を変えても同じ記録の続きから使えます。
          </p>
        </header>

        <Suspense fallback={<div className="min-h-[16rem]" aria-hidden />}>
          <AccountPanel />
        </Suspense>
      </div>
    </main>
  );
}

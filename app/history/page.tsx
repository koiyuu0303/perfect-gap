import { Suspense } from "react";
import Link from "next/link";
import { HistoryView } from "@/components/HistoryView";

export const metadata = {
  title: "記録 — Perfect Gap",
};

export default function HistoryPage() {
  return (
    <main className="flex-1 flex flex-col items-center px-6 py-10 sm:py-16">
      <div className="w-full max-w-2xl flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="text-xs text-muted hover:text-foreground transition-colors"
          >
            ← Perfect Gap
          </Link>
          <Link
            href="/account"
            className="text-xs text-muted hover:text-foreground transition-colors"
          >
            記録の引き継ぎ
          </Link>
        </div>

        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">記録</h1>
          <p className="text-sm text-muted leading-relaxed">
            診断のたびに積み上がります。
          </p>
        </header>

        <Suspense fallback={<div className="min-h-[20rem]" aria-hidden />}>
          <HistoryView />
        </Suspense>
      </div>
    </main>
  );
}

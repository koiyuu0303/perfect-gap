import Link from "next/link";
import { DiagnosticSession } from "@/components/DiagnosticSession";

export default function DiagnosticPage() {
  return (
    <main className="flex-1 flex flex-col items-center px-6 py-10 sm:py-16">
      <div className="w-full max-w-3xl flex flex-col gap-8">
        <Link
          href="/"
          className="text-xs text-muted hover:text-foreground transition-colors self-start"
        >
          ← Perfect Gap
        </Link>

        <DiagnosticSession />
      </div>
    </main>
  );
}

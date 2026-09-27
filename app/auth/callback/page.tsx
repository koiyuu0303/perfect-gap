"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseClient } from "@/lib/db/client";
import { getIdentity, translateAuthError, type Identity } from "@/lib/db/account";

/**
 * メール内のリンクから戻ってきたときの着地点。
 *
 * クライアントは detectSessionInUrl を有効にしているため、URLに含まれる
 * 認証情報は生成時に自動で処理される。ただしそれは非同期に進むので、
 * ここでは認証状態の変化を購読して完了を待つ。
 *
 * 待ちっぱなしにならないよう時間切れも設けている。利用者にとって
 * 「読み込み中のまま止まる」が最も分かりにくい失敗の形だからだ。
 */

type State =
  | { kind: "working" }
  | { kind: "done"; identity: Identity }
  | { kind: "failed"; message: string };

/** 認証処理を諦めるまでの時間(ミリ秒)。 */
const TIMEOUT_MS = 10000;

export default function AuthCallbackPage() {
  const [state, setState] = useState<State>({ kind: "working" });

  useEffect(() => {
    let settled = false;

    const finish = (next: State) => {
      if (settled) return;
      settled = true;
      setState(next);
    };

    // リンク自体が失効していた場合、Supabase はエラーを付けて戻す
    const params = new URLSearchParams(
      window.location.hash.replace(/^#/, "") || window.location.search,
    );
    const errorDescription =
      params.get("error_description") ?? params.get("error");

    if (errorDescription) {
      finish({
        kind: "failed",
        message: translateAuthError(errorDescription.replace(/\+/g, " ")),
      });
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      finish({
        kind: "failed",
        message: "データベースが設定されていません。",
      });
      return;
    }

    const settleFromSession = async () => {
      const identity = await getIdentity();
      if (identity.kind === "linked" || identity.kind === "anonymous") {
        finish({ kind: "done", identity });
      }
    };

    const { data: subscription } = supabase.auth.onAuthStateChange(() => {
      void settleFromSession();
    });

    // 既に処理が終わっている場合に備えて一度確認する
    void settleFromSession();

    const timer = setTimeout(() => {
      finish({
        kind: "failed",
        message:
          "確認に時間がかかりすぎました。リンクの有効期限が切れている可能性があります。もう一度メールを送ってください。",
      });
    }, TIMEOUT_MS);

    return () => {
      clearTimeout(timer);
      subscription.subscription.unsubscribe();
    };
  }, []);

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-8 flex flex-col items-center gap-5 text-center">
        {state.kind === "working" && (
          <>
            <span className="text-3xl animate-pulse-soft" aria-hidden>
              ✉️
            </span>
            <p className="text-sm text-muted">確認しています…</p>
          </>
        )}

        {state.kind === "done" && (
          <>
            <span className="text-3xl" aria-hidden>
              ✓
            </span>
            <h1 className="text-lg font-semibold">
              {state.identity.kind === "linked"
                ? "引き継ぎの設定が完了しました"
                : "確認しました"}
            </h1>

            {state.identity.kind === "linked" && (
              <p className="text-sm text-muted leading-relaxed">
                記録は{" "}
                <span className="text-foreground">{state.identity.email}</span>{" "}
                に紐づきました。ブラウザのデータを消しても、
                別の端末からでも、同じ記録の続きから使えます。
              </p>
            )}

            <div className="flex gap-2 pt-2">
              <Link
                href="/diagnostic"
                className="px-6 py-2.5 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:opacity-90 transition-opacity"
              >
                診断へ
              </Link>
              <Link
                href="/history"
                className="px-6 py-2.5 rounded-lg border border-border text-sm hover:border-accent transition-colors"
              >
                記録を見る
              </Link>
            </div>
          </>
        )}

        {state.kind === "failed" && (
          <>
            <span className="text-3xl" aria-hidden>
              ⚠️
            </span>
            <h1 className="text-lg font-semibold">確認できませんでした</h1>
            <p className="text-sm text-muted leading-relaxed">
              {state.message}
            </p>
            <Link
              href="/account"
              className="px-6 py-2.5 rounded-lg border border-border text-sm hover:border-accent transition-colors"
            >
              引き継ぎ設定に戻る
            </Link>
          </>
        )}
      </div>
    </main>
  );
}

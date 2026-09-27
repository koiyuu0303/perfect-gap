"use client";

import { use, useState, useTransition } from "react";
import {
  getIdentity,
  linkEmail,
  signInWithEmail,
  signOut,
  type AuthResult,
  type Identity,
} from "@/lib/db/account";

/**
 * 取得中の Promise を保持する。use() には描画のたびに同じ Promise を
 * 渡す必要があるため、再取得の回数を鍵にして同一性を保つ。
 */
let cache: { attempt: number; promise: Promise<Identity> } | null = null;

function identityFor(attempt: number): Promise<Identity> {
  if (!cache || cache.attempt !== attempt) {
    cache = { attempt, promise: getIdentity() };
  }
  return cache.promise;
}

/**
 * 記録の引き継ぎ設定。
 *
 * 匿名の認証情報はブラウザにしか存在しないため、データを消すと
 * 過去の記録との紐づけが永久に切れる。数ヶ月かけて積む縦断データが
 * 主成果物である以上、これは実質的な消失に等しい。
 *
 * ここでメールアドレスを紐づけておけば、別の端末からでも
 * 同じ身元で戻ってこられる。
 */

type Mode = "link" | "signin";

export function AccountPanel() {
  const [attempt, setAttempt] = useState(0);
  const [, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("link");
  const [email, setEmail] = useState("");
  const [result, setResult] = useState<AuthResult | null>(null);
  const [busy, setBusy] = useState(false);

  const identity = use(identityFor(attempt));

  // 遷移として扱えば、再取得の間も入力内容や表示が消えない
  const refresh = () => startTransition(() => setAttempt((n) => n + 1));

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setResult(null);

    const action = mode === "link" ? linkEmail : signInWithEmail;
    const outcome = await action(email);

    setResult(outcome);
    setBusy(false);

    if (outcome.ok) {
      setEmail("");
      refresh();
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    const outcome = await signOut();
    setResult(outcome);
    setBusy(false);
    refresh();
  };

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col gap-6">
      <StatusCard identity={identity} />

      {identity.kind === "unconfigured" && (
        <p className="text-sm text-muted leading-relaxed rounded-xl border border-border bg-surface p-5">
          この環境ではデータベースが設定されていないため、記録は保存されません。
          引き継ぎの設定も不要です。
        </p>
      )}

      {identity.kind === "linked" && (
        <div className="rounded-xl border border-border bg-surface p-6 flex flex-col gap-4">
          <p className="text-sm text-muted leading-relaxed">
            記録はこのメールアドレスに紐づいています。別の端末で
            <span className="text-foreground">「別の端末から続ける」</span>
            を選び、同じアドレスを入力すれば続きから使えます。
          </p>
          <button
            onClick={handleSignOut}
            disabled={busy}
            className="self-start px-5 py-2 rounded-lg border border-border text-sm hover:border-accent transition-colors disabled:opacity-50"
          >
            ログアウト
          </button>
        </div>
      )}

      {(identity.kind === "anonymous" ||
        identity.kind === "none" ||
        identity.kind === "pending") && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-border bg-surface p-6 flex flex-col gap-5"
        >
          <div className="flex gap-1 p-1 rounded-lg bg-surface-raised self-start">
            <ModeTab
              active={mode === "link"}
              onClick={() => {
                setMode("link");
                setResult(null);
              }}
            >
              この端末の記録を守る
            </ModeTab>
            <ModeTab
              active={mode === "signin"}
              onClick={() => {
                setMode("signin");
                setResult(null);
              }}
            >
              別の端末から続ける
            </ModeTab>
          </div>

          <p className="text-sm text-muted leading-relaxed">
            {mode === "link"
              ? "この端末に貯まっている記録にメールアドレスを紐づけます。以後、ブラウザのデータを消しても記録は失われません。"
              : "他の端末で紐づけ済みのメールアドレスを入力すると、その記録の続きから使えます。"}
          </p>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-surface-raised text-sm outline-none focus:border-accent transition-colors"
            />
            <button
              type="submit"
              disabled={busy || email.trim().length === 0}
              className="px-6 py-2.5 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-default whitespace-nowrap"
            >
              {busy
                ? "送信中…"
                : mode === "link"
                  ? "確認メールを送る"
                  : "ログインリンクを送る"}
            </button>
          </div>

          {result && (
            <p
              className={[
                "text-sm leading-relaxed rounded-lg p-3 border",
                result.ok
                  ? "text-success border-success/30 bg-success/10"
                  : "text-error border-error/30 bg-error/10",
              ].join(" ")}
            >
              {result.message}
            </p>
          )}

          <p className="text-xs text-muted leading-relaxed border-t border-border pt-4">
            パスワードは使いません。送られてくるリンクを開くだけで完了します。
            {mode === "link" && (
              <>
                <br />
                リンクを開くまでは今までどおり使え、記録も失われません。
              </>
            )}
          </p>
        </form>
      )}
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "px-3 py-1.5 rounded-md text-xs transition-colors",
        active
          ? "bg-surface text-foreground shadow-sm"
          : "text-muted hover:text-foreground",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

/** いまの状態と、それが何を意味するかを示す。 */
function StatusCard({ identity }: { identity: Identity }) {
  const presentation: Record<
    Identity["kind"],
    { label: string; tone: string; detail: string }
  > = {
    unconfigured: {
      label: "保存なし",
      tone: "text-muted border-border",
      detail: "この環境では記録が保存されません。",
    },
    none: {
      label: "未開始",
      tone: "text-muted border-border",
      detail:
        "まだ診断を受けていないため、守るべき記録がありません。先に診断を1回受けてください。",
    },
    anonymous: {
      label: "この端末のみ",
      tone: "text-accent-warn border-accent-warn/40",
      detail:
        "記録はこのブラウザにだけ紐づいています。データを消すか別の端末に移ると、過去の記録は取り戻せません。",
    },
    pending: {
      label: "確認待ち",
      tone: "text-accent-warn border-accent-warn/40",
      detail:
        "確認メールを送りました。記載のリンクを開くまで紐づけは完了していません。",
    },
    linked: {
      label: "引き継ぎ可能",
      tone: "text-success border-success/40",
      detail: "記録はメールアドレスに紐づいており、別の端末からも戻れます。",
    },
  };

  const current = presentation[identity.kind];

  return (
    <div className="rounded-xl border border-border bg-surface p-6 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span
          className={`px-3 py-1 rounded-full border text-xs ${current.tone}`}
        >
          {current.label}
        </span>
        {(identity.kind === "linked" || identity.kind === "pending") && (
          <span className="text-sm">{identity.email}</span>
        )}
      </div>

      <p className="text-sm text-muted leading-relaxed">{current.detail}</p>
    </div>
  );
}

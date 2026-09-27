"use client";

import { use, useState, useTransition } from "react";
import Link from "next/link";
import { fetchHistory, type HistoryResult, type HistorySummary } from "@/lib/db/history";
import { HistoryChart } from "./HistoryChart";

/**
 * 取得中の Promise を保持する。
 *
 * use() は描画のたびに同じ Promise を受け取る必要がある。毎回新しく
 * 作ると読み込みが永遠に終わらないため、再試行の回数を鍵にして
 * 同一性を保つ。
 */
let cache: { attempt: number; promise: Promise<HistoryResult> } | null = null;

function historyFor(attempt: number): Promise<HistoryResult> {
  if (!cache || cache.attempt !== attempt) {
    cache = { attempt, promise: fetchHistory() };
  }
  return cache.promise;
}

/**
 * 診断の記録と、その推移。
 *
 * 毎日戻ってくる理由をここで作る。測定器が正確でも、続かなければ
 * 縦断データは貯まらない。自分の変化が見えることが、続ける動機になる。
 */
export function HistoryView() {
  const [attempt, setAttempt] = useState(0);
  const [, startTransition] = useTransition();

  const result = use(historyFor(attempt));

  // 遷移として扱うことで、再取得の間も前の画面が消えない
  const load = () => startTransition(() => setAttempt((n) => n + 1));

  if (result.kind === "unconfigured") {
    return (
      <Notice
        title="記録は保存されていません"
        body="この環境ではデータベースが設定されていないため、診断結果は画面に表示されるだけです。"
      />
    );
  }

  if (result.kind === "failed") {
    return (
      <Notice
        title="記録を読み込めませんでした"
        body={result.message}
        action={
          <button
            onClick={load}
            className="px-5 py-2 rounded-lg border border-border text-sm hover:border-accent transition-colors"
          >
            再試行
          </button>
        }
      />
    );
  }

  const { summary } = result;

  if (summary.totalSessions === 0) {
    return (
      <Notice
        title="まだ記録がありません"
        body="診断を最後まで受けると、ここに結果が積み上がっていきます。続けるほど、自分の変化が見えるようになります。"
        action={
          <Link
            href="/diagnostic"
            className="px-6 py-2.5 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            診断を受ける
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <ChangeHeadline summary={summary} />

      {summary.totalSessions === 1 ? (
        <Notice
          title="推移はまだ描けません"
          body="変化を見るには2回以上の記録が必要です。日を変えてもう一度受けてみてください。"
          action={
            <Link
              href="/diagnostic"
              className="px-6 py-2.5 rounded-lg bg-accent text-accent-foreground text-sm font-medium hover:opacity-90 transition-opacity"
            >
              もう一度受ける
            </Link>
          }
        />
      ) : (
        <HistoryChart points={summary.points} />
      )}

      <div className="grid grid-cols-3 gap-3">
        <Stat label="診断回数" value={`${summary.totalSessions}`} unit="回" />
        <Stat label="継続日数" value={`${summary.activeDays}`} unit="日" />
        <Stat label="総回答数" value={`${summary.totalTrials}`} unit="問" />
      </div>
    </div>
  );
}

/**
 * 初回からの変化を一文で示す。
 *
 * この一文が、面接で「何を検証したか」を語るときの素材そのものになる。
 */
function ChangeHeadline({ summary }: { summary: HistorySummary }) {
  const { change, firstApReliance, latestApReliance } = summary;

  if (change === null || firstApReliance === null || latestApReliance === null) {
    return (
      <div className="rounded-xl border border-border bg-surface p-6 flex flex-col items-center gap-2 text-center">
        <span className="text-xs text-muted">現在の依存度</span>
        <span className="text-5xl font-semibold tabular-nums">
          {Math.round(firstApReliance ?? 0)}
          <span className="text-lg text-muted ml-1">pt</span>
        </span>
      </div>
    );
  }

  const improved = change < 0;
  const magnitude = Math.abs(Math.round(change));

  return (
    <div className="rounded-xl border border-border bg-surface p-6 sm:p-8 flex flex-col items-center gap-4 text-center">
      <span className="text-xs text-muted">初回からの変化</span>

      <div className="flex items-baseline gap-3">
        <span className="text-2xl text-muted tabular-nums">
          {Math.round(firstApReliance)}
        </span>
        <span className="text-muted" aria-hidden>
          →
        </span>
        <span className="text-5xl font-semibold tabular-nums">
          {Math.round(latestApReliance)}
          <span className="text-lg text-muted ml-1">pt</span>
        </span>
      </div>

      {magnitude === 0 ? (
        <p className="text-sm text-muted">まだ変化は見られません。</p>
      ) : (
        <p className="text-sm leading-relaxed max-w-md">
          <span className={improved ? "text-success" : "text-accent-warn"}>
            {magnitude} ポイント{improved ? "減少" : "増加"}
          </span>
          <span className="text-muted">
            {improved
              ? " — 音を名前ではなく、関係として聴けるようになってきています。"
              : " — 日によるばらつきの範囲かもしれません。回数を重ねて傾向を見てください。"}
          </span>
        </p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">
        {value}
        <span className="text-xs text-muted ml-1 font-normal">{unit}</span>
      </span>
    </div>
  );
}

function Notice({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-8 flex flex-col items-center gap-4 text-center">
      <h2 className="text-base font-medium">{title}</h2>
      <p className="text-sm text-muted leading-relaxed max-w-md">{body}</p>
      {action}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import {
  summarizeDiagnostic,
  classifyListener,
  listenerProfileLabel,
  type TrialRecord,
  type DiagnosticSummary,
} from "@/lib/training/analysis";
import type { ConditionId } from "@/lib/training/trial";
import type { SaveStatus } from "@/lib/db/save";

/**
 * 診断結果の表示。
 *
 * 図は実験計画の構造をそのまま写した形にしている。
 * 横方向が「調の遠さ」、色が「チューニングのずれ」で、
 * 2×2 の要因計画が一目で読み取れる。
 *
 * 見るべきは棒の高さそのものではなく、青と橙の差。
 * この差が絶対的な音高ラベルへの依存を表している。
 */

interface Cell {
  condition: ConditionId;
  accuracy: number;
  trials: number;
  medianRtMs: number;
}

const GROUPS = [
  { label: "近い調", normal: "baseline", detuned: "detuned" },
  { label: "遠隔調", normal: "remoteKey", detuned: "both" },
] as const;

const SERIES = [
  { key: "normal", label: "基準ピッチ", color: "var(--series-1)" },
  { key: "detuned", label: "50セント下げ", color: "var(--series-2)" },
] as const;

export function DiagnosticResults({
  records,
  saveStatus,
  onRestart,
}: {
  records: TrialRecord[];
  saveStatus?: SaveStatus;
  onRestart: () => void;
}) {
  const summary = useMemo(() => summarizeDiagnostic(records), [records]);
  const profile = classifyListener(summary);

  return (
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-8">
      <HeroMetric summary={summary} profileLabel={listenerProfileLabel(profile)} />

      <AccuracyChart summary={summary} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatTile
          label="調性依存度"
          value={`${formatDelta(summary.keyDependency).value} ${formatDelta(summary.keyDependency).direction}`}
          hint="遠隔調になったときの正答率の変化"
        />
        <StatTile
          label="計算の遅れ"
          value={`${summary.rtPenaltyMs >= 0 ? "+" : ""}${(summary.rtPenaltyMs / 1000).toFixed(2)} 秒`}
          hint="デチューン時に回答が遅くなった分"
        />
        <StatTile
          label="全体の正答率"
          value={`${Math.round(summary.overallAccuracy * 100)}%`}
          hint={`全 ${summary.totalTrials} 問`}
        />
      </div>

      <Interpretation summary={summary} profile={profile} />

      <DetailTable summary={summary} />

      {saveStatus && <SaveIndicator status={saveStatus} />}

      <button
        onClick={onRestart}
        className="self-center px-8 py-3 rounded-lg border border-border bg-surface hover:border-accent transition-colors"
      >
        もう一度診断する
      </button>
    </div>
  );
}

/**
 * 記録の保存状況。
 *
 * 目立たせすぎない。利用者が見たいのは結果であって通信の成否ではない。
 * ただし縦断データを積む本人にとっては保存の失敗が致命的なので、
 * 失敗したときだけははっきり分かるようにする。
 */
function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status.kind === "idle") return null;

  if (status.kind === "saving") {
    return (
      <p className="text-xs text-muted text-center">記録を保存しています…</p>
    );
  }

  if (status.kind === "saved") {
    return <p className="text-xs text-muted text-center">記録を保存しました</p>;
  }

  if (status.kind === "skipped") {
    return <p className="text-xs text-muted text-center">{status.reason}</p>;
  }

  return (
    <div className="rounded-lg border border-error/40 bg-error/10 p-3 text-center">
      <p className="text-sm text-error">記録を保存できませんでした</p>
      <p className="text-xs text-muted mt-1">{status.message}</p>
    </div>
  );
}

/** 最も重要な数値をひとつだけ大きく示す。 */
function HeroMetric({
  summary,
  profileLabel,
}: {
  summary: DiagnosticSummary;
  profileLabel: string;
}) {
  const delta = formatDelta(summary.apReliance);

  return (
    <div className="rounded-xl border border-border bg-surface p-8 flex flex-col items-center gap-3 text-center">
      <span className="text-xs tracking-wide text-muted">絶対音高への依存度</span>

      <span className="flex items-baseline gap-2">
        <span className="text-6xl font-semibold tabular-nums">
          {delta.value}
        </span>
        <span className="text-lg text-muted">{delta.direction}</span>
      </span>

      <span className="text-sm text-muted max-w-md leading-relaxed">
        基準ピッチを半音の半分だけずらしたとき、正答率がこれだけ変化しました。
      </span>

      <span className="mt-1 px-3 py-1 rounded-full border border-border bg-surface-raised text-sm">
        {profileLabel}
      </span>
    </div>
  );
}

/**
 * 2×2 の要因計画をそのまま写したグループ化棒グラフ。
 *
 * 系列は2つなので凡例に加えて各棒に直接数値を添えている。
 * 色だけで系列を区別させない(色覚特性への配慮であり、
 * 印刷やモノクロ表示でも読める)。
 */
function AccuracyChart({ summary }: { summary: DiagnosticSummary }) {
  const [hovered, setHovered] = useState<Cell | null>(null);

  const cellFor = (condition: ConditionId): Cell => {
    const s = summary.byCondition[condition];
    return {
      condition,
      accuracy: s.accuracy,
      trials: s.trials,
      medianRtMs: s.medianRtMs,
    };
  };

  return (
    <figure className="rounded-xl border border-border bg-surface p-6 flex flex-col gap-5">
      <figcaption className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">条件ごとの正答率</h3>
        <p className="text-xs text-muted leading-relaxed">
          青と橙の差が大きいほど、絶対的な音高ラベルに頼って聴いていることを示します。
        </p>
      </figcaption>

      <div className="relative">
        {/* 目盛り線。数値の読み取りを助けるが、主役ではないので薄くする */}
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
          {[100, 75, 50, 25, 0].map((tick) => (
            <div key={tick} className="flex items-center gap-2">
              <span className="text-[0.65rem] text-muted tabular-nums w-8 text-right">
                {tick}
              </span>
              <div className="flex-1 border-t border-border" />
            </div>
          ))}
        </div>

        {/* 描画領域。目盛りラベルのぶん左に余白をとる */}
        <div className="relative pl-10 h-52 flex items-end">
          <div className="flex-1 flex justify-around items-end h-full">
            {GROUPS.map((group) => (
              <div
                key={group.label}
                className="flex flex-col items-center gap-2 h-full justify-end"
              >
                {/* 隣り合う棒の間は2pxだけ空けて、1組であることを保つ */}
                <div className="flex items-end gap-[2px] h-full">
                  {SERIES.map((series) => {
                    const cell = cellFor(group[series.key]);
                    const percentage = Math.round(cell.accuracy * 100);

                    return (
                      <div
                        key={series.key}
                        className="flex flex-col items-center justify-end h-full w-12 sm:w-16"
                        onMouseEnter={() => setHovered(cell)}
                        onMouseLeave={() => setHovered(null)}
                      >
                        <span className="text-xs tabular-nums mb-1">
                          {percentage}%
                        </span>
                        <div
                          className="w-full rounded-t-[4px] transition-opacity hover:opacity-80"
                          style={{
                            height: `${cell.accuracy * 100}%`,
                            backgroundColor: series.color,
                            // 高さ0でも棒の存在が分かるよう下限を設ける
                            minHeight: "2px",
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 群のラベル。描画領域の外に置く */}
        <div className="pl-10 flex justify-around mt-2">
          {GROUPS.map((group) => (
            <span key={group.label} className="text-xs text-muted">
              {group.label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4 pt-1">
        {SERIES.map((series) => (
          <span key={series.key} className="flex items-center gap-2 text-xs">
            <span
              className="w-3 h-3 rounded-[2px]"
              style={{ backgroundColor: series.color }}
              aria-hidden
            />
            <span className="text-muted">{series.label}</span>
          </span>
        ))}
      </div>

      {hovered && (
        <p className="text-xs text-center text-muted tabular-nums">
          {hovered.trials} 問中 {Math.round(hovered.accuracy * hovered.trials)}{" "}
          問正解 · 反応時間の中央値 {(hovered.medianRtMs / 1000).toFixed(2)} 秒
        </p>
      )}
    </figure>
  );
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-1">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
      <span className="text-[0.7rem] text-muted leading-snug">{hint}</span>
    </div>
  );
}

/**
 * 数値の意味を言葉にする。
 *
 * ここは決定論的に分岐させている。生成AIに任せるのは、
 * この判定を踏まえた練習方針の説明だけにとどめる予定。
 */
function Interpretation({
  summary,
  profile,
}: {
  summary: DiagnosticSummary;
  profile: ReturnType<typeof classifyListener>;
}) {
  const messages: Record<typeof profile, string> = {
    "absolute-dependent":
      "基準ピッチが正しいときは高い正答率でしたが、半音の半分だけずらすと大きく崩れました。これは音を「名前」で識別し、そこから音度を計算していることを示します。音楽的な内容は何も変わっていないため、音同士の距離で聴けていれば成績は落ちないはずの条件です。移動ド階名での訓練が有効です。",
    "relative-capable":
      "基準ピッチをずらしても成績がほとんど変わりませんでした。音を絶対的な高さではなく、音同士の関係として捉えられています。より複雑な和音やコード進行へ進む段階です。",
    developing:
      "まだ基準条件そのものの正答率が伸びていません。まずは調が確立された状態で主音・属音といった主要な音を聴き分けるところから始めるのが近道です。",
    "insufficient-data":
      "判定に必要な問題数に達していません。最後まで通して回答すると結果が出ます。",
  };

  return (
    <div className="rounded-xl border border-border bg-surface-raised p-6 flex flex-col gap-3">
      <h3 className="text-sm font-medium">この結果の読み方</h3>
      <p className="text-sm leading-relaxed text-muted">{messages[profile]}</p>

      {summary.rtPenaltyMs > 300 && profile !== "insufficient-data" && (
        <p className="text-sm leading-relaxed text-muted border-t border-border pt-3">
          正答率とは別に、デチューン条件では回答までの時間が
          {(summary.rtPenaltyMs / 1000).toFixed(2)}
          秒長くなっています。答えは合っていても、頭の中で変換する一手間が
          入っている可能性があります。
        </p>
      )}
    </div>
  );
}

/** 図が読めない場合に備えた表形式の内訳。 */
function DetailTable({ summary }: { summary: DiagnosticSummary }) {
  const rows: { label: string; condition: ConditionId }[] = [
    { label: "近い調 · 基準ピッチ", condition: "baseline" },
    { label: "近い調 · 50セント下げ", condition: "detuned" },
    { label: "遠隔調 · 基準ピッチ", condition: "remoteKey" },
    { label: "遠隔調 · 50セント下げ", condition: "both" },
  ];

  return (
    <details className="rounded-xl border border-border bg-surface">
      <summary className="cursor-pointer p-4 text-sm select-none">
        数値を表で見る
      </summary>

      <div className="overflow-x-auto px-4 pb-4">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-muted text-xs">
              <th className="text-left font-normal py-2">条件</th>
              <th className="text-right font-normal py-2">正答</th>
              <th className="text-right font-normal py-2">正答率</th>
              <th className="text-right font-normal py-2">反応時間(中央値)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const cell = summary.byCondition[row.condition];
              return (
                <tr key={row.condition} className="border-t border-border">
                  <td className="py-2">{row.label}</td>
                  <td className="py-2 text-right tabular-nums">
                    {cell.correct} / {cell.trials}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {Math.round(cell.accuracy * 100)}%
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {(cell.medianRtMs / 1000).toFixed(2)} 秒
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * 正答率の差を、向きが分かる形に整える。
 *
 * 「依存度」という指標に負号を付けると、値が小さいのか成績が下がったのか
 * 読み取れなくなる。数値と向きを分けて返し、言葉で明示する。
 */
function formatDelta(points: number): { value: string; direction: string } {
  const rounded = Math.round(points);

  if (rounded === 0) return { value: "0", direction: "変化なし" };
  if (rounded > 0) return { value: `${rounded}`, direction: "pt 低下" };
  return { value: `${Math.abs(rounded)}`, direction: "pt 向上" };
}

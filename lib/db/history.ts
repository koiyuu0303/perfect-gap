/**
 * 過去の診断結果の取得と、推移の組み立て。
 *
 * 見せたいのは絶対的な成績ではなく「絶対音高への依存度がどう変化したか」。
 * 訓練が効いているなら、この値は時間とともに小さくなるはずで、
 * それがこのプロジェクトの検証したい仮説そのものになる。
 */

import { getSupabaseClient, isDatabaseConfigured } from "./client";
import type { ConditionId } from "@/lib/training/trial";

/** condition_summary ビューの1行。 */
export interface ConditionSummaryRow {
  session_id: string;
  condition: ConditionId;
  trials: number;
  correct: number;
  accuracy: number;
  median_rt_ms: number;
  started_at: string;
}

/** 診断1回分の指標。 */
export interface HistoryPoint {
  sessionId: string;
  date: string;
  /** 絶対音高への依存度(ポイント)。小さいほど相対的に聴けている。 */
  apReliance: number;
  /** 調性依存度(ポイント)。 */
  keyDependency: number;
  /** デチューン時の反応時間の遅れ(ミリ秒)。 */
  rtPenaltyMs: number;
  overallAccuracy: number;
  totalTrials: number;
}

export interface HistorySummary {
  points: HistoryPoint[];
  totalSessions: number;
  totalTrials: number;
  /** 初回と最新の依存度。変化を語るための両端。 */
  firstApReliance: number | null;
  latestApReliance: number | null;
  /** 最新 − 初回。負なら依存が減っている＝訓練が効いている。 */
  change: number | null;
  /** 診断を受けた日数(同じ日の複数回は1日と数える)。 */
  activeDays: number;
}

export type HistoryResult =
  | { kind: "unconfigured" }
  | { kind: "loaded"; summary: HistorySummary }
  | { kind: "failed"; message: string };

/** 条件別の行から、セッションごとの指標を組み立てる。 */
export function toHistoryPoints(rows: ConditionSummaryRow[]): HistoryPoint[] {
  const bySession = new Map<string, ConditionSummaryRow[]>();

  for (const row of rows) {
    const existing = bySession.get(row.session_id);
    if (existing) {
      existing.push(row);
    } else {
      bySession.set(row.session_id, [row]);
    }
  }

  const points: HistoryPoint[] = [];

  for (const [sessionId, sessionRows] of bySession) {
    const accuracyOf = (condition: ConditionId) =>
      sessionRows.find((r) => r.condition === condition)?.accuracy ?? 0;
    const rtOf = (condition: ConditionId) =>
      sessionRows.find((r) => r.condition === condition)?.median_rt_ms ?? 0;

    const totalTrials = sessionRows.reduce((sum, r) => sum + r.trials, 0);
    const totalCorrect = sessionRows.reduce((sum, r) => sum + r.correct, 0);

    // 開始時刻は、その回で最も早い提示時刻
    const date = sessionRows.reduce(
      (earliest, r) => (r.started_at < earliest ? r.started_at : earliest),
      sessionRows[0].started_at,
    );

    points.push({
      sessionId,
      date,
      apReliance: (accuracyOf("baseline") - accuracyOf("detuned")) * 100,
      keyDependency: (accuracyOf("baseline") - accuracyOf("remoteKey")) * 100,
      rtPenaltyMs: rtOf("detuned") - rtOf("baseline"),
      overallAccuracy: totalTrials === 0 ? 0 : totalCorrect / totalTrials,
      totalTrials,
    });
  }

  // 推移として読めるよう古い順に並べる
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

/** 推移から全体の要約を作る。 */
export function summarizeHistory(points: HistoryPoint[]): HistorySummary {
  const first = points[0] ?? null;
  const latest = points[points.length - 1] ?? null;

  // 同じ日に複数回受けても1日と数える(継続の指標として日数の方が意味を持つ)
  const days = new Set(points.map((p) => p.date.slice(0, 10)));

  return {
    points,
    totalSessions: points.length,
    totalTrials: points.reduce((sum, p) => sum + p.totalTrials, 0),
    firstApReliance: first?.apReliance ?? null,
    latestApReliance: latest?.apReliance ?? null,
    change:
      first && latest && points.length >= 2
        ? latest.apReliance - first.apReliance
        : null,
    activeDays: days.size,
  };
}

/** 自分の全診断履歴を取得する。 */
export async function fetchHistory(): Promise<HistoryResult> {
  if (!isDatabaseConfigured) return { kind: "unconfigured" };

  const supabase = getSupabaseClient();
  if (!supabase) return { kind: "unconfigured" };

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    // 未ログインなら記録は存在しない。エラーではなく空として扱う。
    return { kind: "loaded", summary: summarizeHistory([]) };
  }

  const { data, error } = await supabase
    .from("condition_summary")
    .select("session_id, condition, trials, correct, accuracy, median_rt_ms, started_at")
    .order("started_at", { ascending: true });

  if (error) {
    return { kind: "failed", message: error.message };
  }

  return {
    kind: "loaded",
    summary: summarizeHistory(toHistoryPoints((data ?? []) as ConditionSummaryRow[])),
  };
}

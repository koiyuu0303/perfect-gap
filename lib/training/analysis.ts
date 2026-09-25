/**
 * 診断結果から指標を計算する。
 *
 * 中心にあるのは「条件間の差」を取ることで、絶対的な成績ではない。
 * 上手い人ほど全条件で高い正答率を出すが、それは音楽経験の指標であって
 * 絶対音感への依存度ではない。基準条件との差を見ることで、
 * 経験の多寡を打ち消し、依存度だけを取り出せる。
 */

import type { ConditionId } from "./trial";

/**
 * 1問の記録。データベースの trials テーブルとそのまま対応する。
 *
 * 条件を識別する情報(調・距離・デチューン量)を1問ごとに持たせているのが要点。
 * 正誤だけを記録する設計では、あとから条件別に切り分けられない。
 */
export interface TrialRecord {
  condition: ConditionId;
  keyTonic: string;
  /** 五度圏でのハ長調からの距離 (0〜6)。 */
  keyDistance: number;
  detuneCents: number;
  targetMidi: number;
  correctDegree: number;
  answeredDegree: number;
  isCorrect: boolean;
  rtMs: number;
  presentedAt: string;
}

export interface ConditionSummary {
  condition: ConditionId;
  trials: number;
  correct: number;
  /** 正答率 (0〜1)。試行数が0なら NaN ではなく 0 を返す。 */
  accuracy: number;
  /** 反応時間の中央値(ミリ秒)。 */
  medianRtMs: number;
}

export interface DiagnosticSummary {
  byCondition: Record<ConditionId, ConditionSummary>;
  /**
   * 絶対音感依存度。基準条件とデチューン条件の正答率の差(ポイント)。
   *
   * この指標がこのプロジェクトの主役。絶対的な音高ラベルが使えなくなった
   * ときにどれだけ成績が落ちるかを直接測っている。
   * 相対音感で聴いている人はほぼ0に近づく。
   */
  apReliance: number;
  /** 調性依存度。基準条件と遠隔調条件の正答率の差(ポイント)。 */
  keyDependency: number;
  /**
   * 計算遅延。デチューン条件と基準条件の反応時間中央値の差(ミリ秒)。
   *
   * 正答率が保たれていても、頭の中で変換している人はここに差が出る。
   * 正答率だけでは見えない依存を捉えるための指標。
   */
  rtPenaltyMs: number;
  totalTrials: number;
  overallAccuracy: number;
}

/**
 * 中央値を返す。
 *
 * 反応時間の分布は右に長い裾を持つため、平均では一部の極端に遅い回答に
 * 引きずられる。中央値ならその影響を受けない。
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/** 指定条件の記録だけを集計する。 */
export function summarizeCondition(
  records: TrialRecord[],
  condition: ConditionId,
): ConditionSummary {
  const subset = records.filter((r) => r.condition === condition);
  const correct = subset.filter((r) => r.isCorrect).length;

  return {
    condition,
    trials: subset.length,
    correct,
    accuracy: subset.length === 0 ? 0 : correct / subset.length,
    medianRtMs: median(subset.map((r) => r.rtMs)),
  };
}

const ALL_CONDITIONS: ConditionId[] = [
  "baseline",
  "remoteKey",
  "detuned",
  "both",
];

/** 診断1回分の記録から、すべての指標を計算する。 */
export function summarizeDiagnostic(
  records: TrialRecord[],
): DiagnosticSummary {
  const byCondition = Object.fromEntries(
    ALL_CONDITIONS.map((condition) => [
      condition,
      summarizeCondition(records, condition),
    ]),
  ) as Record<ConditionId, ConditionSummary>;

  const correct = records.filter((r) => r.isCorrect).length;

  return {
    byCondition,
    // 正答率の差はポイント表記(0〜100)にする。割合のままだと読みにくいため。
    apReliance:
      (byCondition.baseline.accuracy - byCondition.detuned.accuracy) * 100,
    keyDependency:
      (byCondition.baseline.accuracy - byCondition.remoteKey.accuracy) * 100,
    rtPenaltyMs:
      byCondition.detuned.medianRtMs - byCondition.baseline.medianRtMs,
    totalTrials: records.length,
    overallAccuracy: records.length === 0 ? 0 : correct / records.length,
  };
}

/**
 * 誤答の方向を半音数で返す。正なら高く、負なら低く答えたことを示す。
 *
 * デチューンで成績が落ちるとき、絶対音感で聴いている人は
 * 特定の方向へ体系的にずれると予測される。ここを見れば、
 * 単に当てずっぽうになっているのか、それとも一貫した誤りなのかを区別できる。
 */
export function answerErrorInSemitones(
  record: TrialRecord,
  scalePattern: readonly number[] = [0, 2, 4, 5, 7, 9, 11],
): number {
  const correct = scalePattern[record.correctDegree - 1];
  const answered = scalePattern[record.answeredDegree - 1];
  return answered - correct;
}

/**
 * 診断結果を一言で表す型に分類する。
 *
 * しきい値は暫定値。本人と協力者のデータが貯まった段階で、
 * 分布に基づいて見直すことを前提にしている。
 */
export type ListenerProfile =
  | "absolute-dependent"
  | "relative-capable"
  | "developing"
  | "insufficient-data";

export function classifyListener(
  summary: DiagnosticSummary,
): ListenerProfile {
  if (summary.totalTrials < 16) return "insufficient-data";

  const baselineAccuracy = summary.byCondition.baseline.accuracy;

  // 基準条件で正しく答えられていないなら、依存度以前に技能が未形成
  if (baselineAccuracy < 0.6) return "developing";

  // 基準条件は解けるのにデチューンで大きく落ちる = 絶対的な音高ラベルへの依存
  if (summary.apReliance >= 25) return "absolute-dependent";

  return "relative-capable";
}

/** 判定結果の日本語ラベル。 */
export function listenerProfileLabel(profile: ListenerProfile): string {
  const labels: Record<ListenerProfile, string> = {
    "absolute-dependent": "絶対音高への依存が強い",
    "relative-capable": "相対的な聴き方ができている",
    developing: "基礎を形成中",
    "insufficient-data": "データ不足",
  };
  return labels[profile];
}

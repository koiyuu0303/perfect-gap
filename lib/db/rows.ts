/**
 * アプリ内の記録と、データベースの行との相互変換。
 *
 * ここを純粋関数として切り出しているのは、通信を伴わずに検証できるようにするため。
 * 列の取り違えや値の欠落は、データが貯まってから気づくと取り返しがつかない。
 */

import type { TrialRecord } from "@/lib/training/analysis";
import type { ParticipantProfile } from "@/lib/training/profile";
import type { Trial } from "@/lib/training/trial";

/** profiles テーブルの行。 */
export interface ProfileRow {
  id: string;
  absolute_pitch: string;
  training_years: string;
  primary_instrument: string;
  solfege_system: string;
  updated_at: string;
}

/** sessions テーブルの行(挿入時)。 */
export interface SessionRow {
  id: string;
  participant_id: string;
  mode: "diagnostic" | "training";
  started_at: string;
  completed_at: string;
  app_version: string;
}

/** trials テーブルの行(挿入時)。 */
export interface TrialRow {
  session_id: string;
  participant_id: string;
  trial_index: number;
  condition: string;
  key_tonic: string;
  key_distance: number;
  detune_cents: number;
  target_midi: number;
  stimulus: { midis: number[]; offset: number; duration: number }[] | null;
  correct_degree: number;
  answered_degree: number;
  is_correct: boolean;
  rt_ms: number;
  presented_at: string;
}

/** 自己申告をデータベースの行に変換する。 */
export function toProfileRow(
  profile: ParticipantProfile,
  participantId: string,
  now: Date = new Date(),
): ProfileRow {
  return {
    id: participantId,
    absolute_pitch: profile.absolutePitch,
    training_years: profile.trainingYears,
    primary_instrument: profile.primaryInstrument,
    solfege_system: profile.solfegeSystem,
    updated_at: now.toISOString(),
  };
}

/** 診断1回分のセッション行を作る。 */
export function toSessionRow(
  sessionId: string,
  participantId: string,
  records: TrialRecord[],
  protocolVersion: number,
  completedAt: Date = new Date(),
): SessionRow {
  // 開始時刻は最初の問題が提示された時刻とする。
  // 記録が空の場合は完了時刻で代用する。
  const startedAt =
    records.length > 0
      ? records.reduce(
          (earliest, record) =>
            record.presentedAt < earliest ? record.presentedAt : earliest,
          records[0].presentedAt,
        )
      : completedAt.toISOString();

  return {
    id: sessionId,
    participant_id: participantId,
    mode: "diagnostic",
    started_at: startedAt,
    completed_at: completedAt.toISOString(),
    app_version: `protocol-${protocolVersion}`,
  };
}

/**
 * 回答記録をデータベースの行に変換する。
 *
 * trial_index は出題順そのもの。順序効果(慣れや疲れ)を後から検定できるよう、
 * 並び順の情報を落とさずに残しておく。
 *
 * @param trials 出題した課題。刺激の内容を保存するために使う。
 */
export function toTrialRows(
  records: TrialRecord[],
  sessionId: string,
  participantId: string,
  trials?: Trial[],
): TrialRow[] {
  return records.map((record, index) => ({
    session_id: sessionId,
    participant_id: participantId,
    trial_index: index,
    condition: record.condition,
    key_tonic: record.keyTonic,
    key_distance: record.keyDistance,
    detune_cents: record.detuneCents,
    target_midi: record.targetMidi,
    stimulus: trials?.[index]?.events ?? null,
    correct_degree: record.correctDegree,
    answered_degree: record.answeredDegree,
    is_correct: record.isCorrect,
    rt_ms: record.rtMs,
    presented_at: record.presentedAt,
  }));
}

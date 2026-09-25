/**
 * 診断課題の生成と採点。
 *
 * 課題は一貫して「機能的聴音」の形をとる。
 * まずカデンツで調を確立し、続けて対象音を1つ鳴らし、
 * その音が調の中で何番目の音かを答えさせる。
 *
 * 音名ではなく音度を問うのが要点。絶対音感で聴く人は
 * 「音名を得る → 調を思い出す → 差を計算する」という手順を踏むため、
 * 相対音感で直接聴く人より遅くなり、調が遠いほど誤りやすくなる。
 *
 * ── 実験計画 ──
 * 「調の距離」と「デチューン」を独立に操作する2×2の要因計画。
 * 両者を分離することで、成績低下が調性の遠さによるものか、
 * 絶対的な音高ラベルが崩れたことによるものかを切り分けられる。
 */

import { DETUNE_CONDITIONS, type DetuneCents } from "@/lib/music/pitch";
import {
  PRACTICAL_MAJOR_KEYS,
  circleOfFifthsDistance,
  scaleDegreeOf,
  scalePatternFor,
  tonicPitchClass,
  type Key,
  type ScaleDegree,
} from "@/lib/music/scale";
import { cadenceFor } from "@/lib/music/chord";
import type { ToneEvent } from "@/lib/audio/engine";

/** 乱数源。テストで固定できるよう注入可能にしている。 */
export type RandomSource = () => number;

export type ConditionId = "baseline" | "remoteKey" | "detuned" | "both";

export interface Condition {
  id: ConditionId;
  /** 調をハ長調の近くから選ぶか、遠隔調から選ぶか。 */
  keyProximity: "near" | "remote";
  detuneCents: DetuneCents;
  label: string;
}

/**
 * 診断の4条件。2×2の要因計画になっている。
 *
 *                  基準ピッチ正常    デチューン
 *   近い調          baseline         detuned
 *   遠隔調          remoteKey        both
 *
 * baseline との差を見ることで、それぞれの要因の効果量を独立に取り出せる。
 */
export const CONDITIONS: readonly Condition[] = [
  {
    id: "baseline",
    keyProximity: "near",
    detuneCents: DETUNE_CONDITIONS.NONE,
    label: "基準",
  },
  {
    id: "remoteKey",
    keyProximity: "remote",
    detuneCents: DETUNE_CONDITIONS.NONE,
    label: "遠隔調",
  },
  {
    id: "detuned",
    keyProximity: "near",
    detuneCents: -DETUNE_CONDITIONS.MAXIMAL,
    label: "デチューン",
  },
  {
    id: "both",
    keyProximity: "remote",
    detuneCents: -DETUNE_CONDITIONS.MAXIMAL,
    label: "遠隔調＋デチューン",
  },
];

/** ハ長調に近い調(五度圏で1歩以内)。 */
export const NEAR_KEYS: readonly string[] = PRACTICAL_MAJOR_KEYS.filter(
  (tonic) => circleOfFifthsDistance({ tonic, mode: "major" }) <= 1,
);

/** 遠隔調(五度圏で4歩以上)。 */
export const REMOTE_KEYS: readonly string[] = PRACTICAL_MAJOR_KEYS.filter(
  (tonic) => circleOfFifthsDistance({ tonic, mode: "major" }) >= 4,
);

/** 課題の時間配置(秒)。 */
const CADENCE_CHORD_DURATION = 0.55;
const PAUSE_AFTER_CADENCE = 0.5;
const TARGET_DURATION = 1.5;

export interface Trial {
  key: Key;
  condition: ConditionId;
  detuneCents: DetuneCents;
  /** 出題した音のMIDI値。 */
  targetMidi: number;
  /** 正解の音度。 */
  correctAnswer: ScaleDegree;
  /** 主音のMIDI値(参照用)。 */
  tonicMidi: number;
  /** 五度圏上のハ長調からの距離。分析で説明変数として使う。 */
  keyDistance: number;
  /** 再生する音の並び(カデンツ＋対象音)。 */
  events: ToneEvent[];
}

/** 配列から一様に1つ選ぶ。 */
function pick<T>(items: readonly T[], random: RandomSource): T {
  return items[Math.floor(random() * items.length)];
}

/**
 * 対象音を配置する基準となる主音のMIDI値を返す (C4〜B4 の範囲)。
 *
 * 調ごとに音域がばらつくと、音の高さ自体が手がかりになったり、
 * 極端な音域で聴き取りにくくなったりする。どの調でも主音が
 * 中央ハのオクターブに来るよう揃えることで、それを防ぐ。
 *
 * カデンツはこの1オクターブ下に置かれるため、伴奏と旋律のような
 * 自然な配置になり、両者が音域として重ならない。
 */
export function tonicMidiNearMiddleC(key: Key): number {
  return 60 + tonicPitchClass(key);
}

/**
 * 条件に沿って課題を1問生成する。
 *
 * 対象音は音階固有音(7つの音度)から選ぶ。変化音まで含めると
 * 課題が難しくなりすぎ、初期の診断としては感度が落ちるため。
 */
export function generateTrial(
  condition: Condition,
  random: RandomSource = Math.random,
): Trial {
  const tonic = pick(
    condition.keyProximity === "near" ? NEAR_KEYS : REMOTE_KEYS,
    random,
  );
  const key: Key = { tonic, mode: "major" };

  const tonicMidi = tonicMidiNearMiddleC(key);

  // 音階固有音のうち1つを、主音から1オクターブ以内で選ぶ
  const pattern = scalePatternFor(key.mode);
  const degreeIndex = Math.floor(random() * pattern.length);
  const targetMidi = tonicMidi + pattern[degreeIndex];

  const events = buildTrialEvents(key, tonicMidi, targetMidi);

  return {
    key,
    condition: condition.id,
    detuneCents: condition.detuneCents,
    targetMidi,
    correctAnswer: scaleDegreeOf(targetMidi, key),
    tonicMidi,
    keyDistance: circleOfFifthsDistance(key),
    events,
  };
}

/**
 * 練習用の課題を作る。必ずハ長調・基準ピッチで出す。
 *
 * ハ長調を選ぶのには教育上の理由がある。ハ長調では固定ドと移動ドが
 * 一致する(ド = C = 主音)ため、固定ドで育った人は自分の持っている
 * 音名の知識をそのまま使いながら「主音から数える」規則を習得できる。
 * 本番で他の調に移ると両者は分岐するので、ここが橋渡しになる。
 *
 * 出題する音度は固定にしている。説明文に載せた例(ミ → 3)と
 * 実際に鳴る音を一致させ、規則を確実に伝えるため。
 */
export function generatePracticeTrials(): Trial[] {
  const key: Key = { tonic: "C", mode: "major" };
  const tonicMidi = tonicMidiNearMiddleC(key);
  const pattern = scalePatternFor(key.mode);

  // 第1音(主音そのもの)→ 第3音(説明文の例と同じ)の順に提示する
  return [1, 3].map((degree) => {
    const targetMidi = tonicMidi + pattern[degree - 1];

    return {
      key,
      condition: "baseline",
      detuneCents: 0,
      targetMidi,
      correctAnswer: scaleDegreeOf(targetMidi, key),
      tonicMidi,
      keyDistance: circleOfFifthsDistance(key),
      events: buildTrialEvents(key, tonicMidi, targetMidi),
    };
  });
}

/**
 * カデンツと対象音を時間軸に並べる。
 *
 * カデンツは対象音の主音の2オクターブ下に置く。cadenceFor() は
 * 和音を主音から23半音以内に収めるため、カデンツの最高音は
 * 必ず対象音の主音より低くなる。伴奏と旋律のような自然な配置になり、
 * 対象音が和音の音域に紛れることが構造的に起こりえない。
 */
export function buildTrialEvents(
  key: Key,
  tonicMidi: number,
  targetMidi: number,
): ToneEvent[] {
  // 主音の2オクターブ下がカデンツの主音になるオクターブ番号
  const cadenceOctave = Math.floor((tonicMidi - 24) / 12) - 1;
  const chords = cadenceFor(key, cadenceOctave);

  const events: ToneEvent[] = chords.map((chord, index) => ({
    midis: chord.midis,
    offset: index * CADENCE_CHORD_DURATION,
    duration: CADENCE_CHORD_DURATION,
  }));

  const targetOffset =
    chords.length * CADENCE_CHORD_DURATION + PAUSE_AFTER_CADENCE;

  events.push({
    midis: [targetMidi],
    offset: targetOffset,
    duration: TARGET_DURATION,
  });

  return events;
}

/** 回答が正しいかを判定する。純粋な比較であり、生成AIは一切関与しない。 */
export function gradeTrial(trial: Trial, answeredDegree: number): boolean {
  return (
    trial.correctAnswer.degree === answeredDegree &&
    trial.correctAnswer.alteration === 0
  );
}

/**
 * 診断1回分の出題順を組み立てる。
 *
 * 条件を均等に配分したうえで並びを混ぜる。条件がまとまって出ると
 * 慣れや戦略の切り替えが起こり、条件間の比較が歪むため。
 */
export function buildDiagnosticSequence(
  trialsPerCondition: number,
  random: RandomSource = Math.random,
): Trial[] {
  const trials: Trial[] = [];

  for (const condition of CONDITIONS) {
    for (let i = 0; i < trialsPerCondition; i++) {
      trials.push(generateTrial(condition, random));
    }
  }

  return shuffle(trials, random);
}

/** Fisher-Yates 法で並びを混ぜる(偏りのない順列が得られる)。 */
export function shuffle<T>(items: T[], random: RandomSource): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** 課題全体の長さ(秒)。UIで進行を示すのに使う。 */
export function trialDuration(trial: Trial): number {
  return Math.max(...trial.events.map((e) => e.offset + e.duration));
}

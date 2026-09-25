/**
 * 調・音度・移動ド階名。
 *
 * このモジュールが扱っているのが、絶対音感と相対音感が分岐する地点そのもの。
 *
 * 絶対音感で聴く人は「F#」という固定ラベルを得たあと、
 * 「ニ長調ならF#は第3音」と頭の中で計算する。
 * 相対音感で聴く人は、計算を経ずに直接「ミ」として聴く。
 *
 * 診断はこの差を突く。調を確立してから対象音を鳴らし、音名ではなく
 * 音度で答えさせる。絶対音感依存者は変換の一手間があるぶん遅く、
 * 遠隔調ほど正答率が落ちる。
 */

import { midiToPitchClass, noteNameToMidi } from "./pitch";

export type Mode = "major" | "minor";

/**
 * 調。主音は「音高クラス番号」ではなく「綴られた音名」で保持する。
 * 嬰ヘ長調と変ト長調は響きは同一でも記譜上は別の調であり、
 * 綴りを保たないと音度の表記が正しく出せないため。
 */
export interface Key {
  tonic: string; // "C", "F#", "Bb" など
  mode: Mode;
}

/** 主音からの半音数(長音階)。 */
export const MAJOR_SCALE_SEMITONES = [0, 2, 4, 5, 7, 9, 11] as const;

/** 主音からの半音数(自然的短音階)。 */
export const NATURAL_MINOR_SCALE_SEMITONES = [0, 2, 3, 5, 7, 8, 10] as const;

const LETTERS: readonly string[] = ["C", "D", "E", "F", "G", "A", "B"];

/** その旋法の、主音からの半音数の並びを返す。 */
export function scalePatternFor(mode: Mode): readonly number[] {
  return mode === "major"
    ? MAJOR_SCALE_SEMITONES
    : NATURAL_MINOR_SCALE_SEMITONES;
}

/** 各幹音のCからの半音数。 */
const LETTER_SEMITONES: Record<string, number> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};

/**
 * 実用的な12の長調。
 *
 * 異名同音のうち慣用的な綴りを採っている(嬰ハ長調=シャープ7つ ではなく
 * 変ニ長調=フラット5つ、など)。演奏者が実際に目にする調号に揃えるため。
 */
export const PRACTICAL_MAJOR_KEYS: readonly string[] = [
  "C",
  "G",
  "D",
  "A",
  "E",
  "B",
  "F#",
  "Db",
  "Ab",
  "Eb",
  "Bb",
  "F",
];

export interface ScaleDegree {
  /** 音階内の度数 (1〜7)。 */
  degree: number;
  /** 変化記号。-1 が下げ、0 が音階固有音、+1 が上げ。 */
  alteration: number;
}

/**
 * 移動ド階名。度数と変化記号の組から決まる。
 * 変化音は上行形(Di, Ri...)と下行形(Ra, Me...)を綴りで区別する。
 */
const SOLFEGE: Record<string, string> = {
  "1_0": "Do",
  "1_1": "Di",
  "2_-1": "Ra",
  "2_0": "Re",
  "2_1": "Ri",
  "3_-1": "Me",
  "3_0": "Mi",
  "4_0": "Fa",
  "4_1": "Fi",
  "5_-1": "Se",
  "5_0": "Sol",
  "5_1": "Si",
  "6_-1": "Le",
  "6_0": "La",
  "6_1": "Li",
  "7_-1": "Te",
  "7_0": "Ti",
};

/** 主音の綴りを、幹音の文字と変化記号に分解する。 */
function parseTonic(tonic: string): { letter: string; accidental: number } {
  const match = tonic.trim().match(/^([A-Ga-g])([#b]*)$/);
  if (!match) {
    throw new Error(`主音として解釈できません: "${tonic}"`);
  }
  const letter = match[1].toUpperCase();
  let accidental = 0;
  for (const ch of match[2]) {
    accidental += ch === "#" ? 1 : -1;
  }
  return { letter, accidental };
}

/** 変化記号の数を表記に直す。例: 1 → "#", -2 → "bb" */
function accidentalToString(accidental: number): string {
  if (accidental === 0) return "";
  return accidental > 0 ? "#".repeat(accidental) : "b".repeat(-accidental);
}

/** 主音の音高クラス (0〜11) を返す。 */
export function tonicPitchClass(key: Key): number {
  const { letter, accidental } = parseTonic(key.tonic);
  return (((LETTER_SEMITONES[letter] + accidental) % 12) + 12) % 12;
}

/**
 * 調の構成音を、正しい綴りで低い順に7つ返す。
 *
 * 音階は必ずA〜Gの各文字をちょうど1回ずつ使う、という記譜法の規則から
 * 構成する。文字を1つずつ進め、必要な半音数になるよう変化記号を決めるため、
 * ニ長調で「Gb」ではなく正しく「F#」が得られる。
 */
export function spellScale(key: Key): string[] {
  const { letter, accidental } = parseTonic(key.tonic);
  const tonicLetterIndex = LETTERS.indexOf(letter);
  const tonicSemitone = LETTER_SEMITONES[letter] + accidental;

  return scalePatternFor(key.mode).map((semitonesAboveTonic, degreeIndex) => {
    const targetLetter = LETTERS[(tonicLetterIndex + degreeIndex) % 7];
    const naturalSemitone = LETTER_SEMITONES[targetLetter];

    // その文字が本来持つ音高と、音階上あるべき音高との差が変化記号になる。
    // オクターブをまたぐため、-6〜+5 の範囲に畳んでから判定する。
    const required = tonicSemitone + semitonesAboveTonic;
    let diff = (required - naturalSemitone) % 12;
    if (diff > 6) diff -= 12;
    if (diff < -6) diff += 12;

    return `${targetLetter}${accidentalToString(diff)}`;
  });
}

/**
 * 与えられた音が、その調において何度の音かを返す。
 *
 * 音階固有音なら alteration は 0。そうでなければ、最も近い音階音からの
 * ずれとして表す(例: ハ長調のF#は「第4音の半音上」)。
 */
export function scaleDegreeOf(midi: number, key: Key): ScaleDegree {
  const tonicPc = tonicPitchClass(key);
  const semitonesAboveTonic = (((midi - tonicPc) % 12) + 12) % 12;

  const pattern = scalePatternFor(key.mode);

  const exactIndex = pattern.indexOf(semitonesAboveTonic);
  if (exactIndex !== -1) {
    return { degree: exactIndex + 1, alteration: 0 };
  }

  // 音階外の音は、直下の音階音を半音上げたものとして綴る。
  // 慣習的に変化音は上行形で表すことが多いため(#4, #5 など)。
  for (let i = pattern.length - 1; i >= 0; i--) {
    if (pattern[i] < semitonesAboveTonic) {
      return { degree: i + 1, alteration: 1 };
    }
  }

  // 主音より下に音階音はないので、ここに到達するのは理論上ありえない
  throw new Error(`音度を決定できません: midi=${midi}, key=${key.tonic}`);
}

/** 音度を移動ド階名に変換する。例: {degree:3, alteration:0} → "Mi" */
export function solfegeOf(scaleDegree: ScaleDegree): string {
  const syllable = SOLFEGE[`${scaleDegree.degree}_${scaleDegree.alteration}`];
  if (!syllable) {
    throw new Error(
      `階名が定義されていません: ${scaleDegree.degree}, ${scaleDegree.alteration}`,
    );
  }
  return syllable;
}

/** MIDI値を、その調における移動ド階名に直接変換する。 */
export function solfegeForMidi(midi: number, key: Key): string {
  return solfegeOf(scaleDegreeOf(midi, key));
}

/** 音度を "b3" "5" のような文字列に直す。 */
export function scaleDegreeToString(scaleDegree: ScaleDegree): string {
  return `${accidentalToString(scaleDegree.alteration)}${scaleDegree.degree}`;
}

/**
 * ハ長調から五度圏で何歩離れているかを返す (0〜6)。
 *
 * これが「遠隔調」の定量的な定義になる。「C調か否か」という二値ではなく
 * 連続量として扱えるため、分析では正答率をこの距離に回帰でき、
 * 調性依存度をはるかに豊かに記述できる。
 *
 * C=0, G/F=1, D/Bb=2, A/Eb=3, E/Ab=4, B/Db=5, F#=6
 */
export function circleOfFifthsDistance(key: Key): number {
  const pc = tonicPitchClass(key);
  // 音高クラスに7を掛けると五度圏上の位置になる(完全5度=7半音のため)
  const position = (pc * 7) % 12;
  return Math.min(position, 12 - position);
}

/** 調の表示名を返す。例: {tonic:"F#", mode:"major"} → "F# major" */
export function keyDisplayName(key: Key): string {
  return `${key.tonic} ${key.mode}`;
}

/**
 * 指定した調・オクターブにおける主音のMIDI値を返す。
 * オクターブは国際式 (C4 = 中央ハ = 60)。
 */
export function tonicMidi(key: Key, octave: number): number {
  return noteNameToMidi(`${key.tonic}${octave}`);
}

/**
 * ある音が、その調の音階固有音かどうか。
 */
export function isDiatonic(midi: number, key: Key): boolean {
  return scaleDegreeOf(midi, key).alteration === 0;
}

/**
 * その調の音階音のうち、指定した音域に含まれるMIDI値をすべて返す。
 * 出題時に、調の外の音を誤って選んでしまう事故を防ぐために使う。
 */
export function diatonicMidisInRange(
  key: Key,
  lowMidi: number,
  highMidi: number,
): number[] {
  const result: number[] = [];
  for (let midi = lowMidi; midi <= highMidi; midi++) {
    if (isDiatonic(midi, key)) {
      result.push(midi);
    }
  }
  return result;
}

/** デバッグ・表示用に、MIDI値を音高クラス名で返す(調を考慮しない簡易表記)。 */
export function pitchClassName(midi: number): string {
  return midiToPitchClass(midi);
}

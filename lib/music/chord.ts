/**
 * 和音の構成と、調を確立するためのカデンツ。
 *
 * 診断では、対象音を鳴らす前に必ずカデンツで調を確立する。
 * これを省くと調性の基準が聴き手の中に生まれず、
 * 「相対音感で答える」という選択肢自体が成立しなくなるため、
 * 絶対音感の有無を切り分けられなくなる。
 */

import { tonicPitchClass, scalePatternFor, type Key } from "./scale";

export type TriadQuality = "major" | "minor" | "diminished" | "augmented";

/** 根音からの半音数で表した三和音の構成。 */
export const TRIAD_INTERVALS: Record<TriadQuality, readonly number[]> = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  diminished: [0, 3, 6],
  augmented: [0, 4, 8],
};

export interface Chord {
  /** 根音のMIDI値。 */
  root: number;
  quality: TriadQuality;
  /** 実際に鳴らすMIDI値の並び(低い順)。 */
  midis: number[];
}

/** 根音と性質から三和音を組み立てる。 */
export function buildTriad(root: number, quality: TriadQuality): Chord {
  return {
    root,
    quality,
    midis: TRIAD_INTERVALS[quality].map((semitones) => root + semitones),
  };
}

/**
 * 長調の各音度上に生じる三和音の性質。
 * I ii iii IV V vi vii° という、調性和声の基本的な並び。
 */
export const MAJOR_DIATONIC_QUALITIES: readonly TriadQuality[] = [
  "major", // I
  "minor", // ii
  "minor", // iii
  "major", // IV
  "major", // V
  "minor", // vi
  "diminished", // vii°
];

/** 自然的短調の各音度上に生じる三和音の性質。 */
export const MINOR_DIATONIC_QUALITIES: readonly TriadQuality[] = [
  "minor", // i
  "diminished", // ii°
  "major", // III
  "minor", // iv
  "minor", // v
  "major", // VI
  "major", // VII
];

/**
 * 調の指定した音度上の三和音を返す。
 *
 * @param degree 1〜7 の音度
 * @param octave 主音を置くオクターブ (C4 = 中央ハ)
 */
export function diatonicTriad(key: Key, degree: number, octave: number): Chord {
  if (degree < 1 || degree > 7) {
    throw new Error(`音度は1〜7の範囲でなければなりません: ${degree}`);
  }

  const pattern = scalePatternFor(key.mode);
  const qualities =
    key.mode === "major" ? MAJOR_DIATONIC_QUALITIES : MINOR_DIATONIC_QUALITIES;

  // 主音のMIDI値を求め、そこから音度ぶん上の音を根音にする
  const tonicMidiValue = (octave + 1) * 12 + tonicPitchClass(key);
  const root = tonicMidiValue + pattern[degree - 1];

  return buildTriad(root, qualities[degree - 1]);
}

/**
 * 調を確立するためのカデンツ。
 *
 * I → IV → V → I は調性を最も明確に提示する定型で、聴音の教材で
 * 広く用いられている。V → I の解決が主音を疑いなく指し示すため、
 * 続く対象音を音度として聴く準備が整う。
 */
export const CADENCE_DEGREES: readonly number[] = [1, 4, 5, 1];

/**
 * 調を確立するカデンツの和音列を返す。
 *
 * 声部配置の規則は2つ。
 *
 * 1. 最低音は必ず和音の根音に置く(基本形)。
 *    第2転回形にすると和音が不安定になり、調を示す力が決定的に弱まる。
 *    カデンツの唯一の役割は調の確立なので、ここは譲れない。
 *    結果として低音は I → IV → V → I と根音で動く。
 *
 * 2. 残りの2声は、主音の1オクターブ上から始まる窓に畳み込む。
 *    上声部が同じ音域に留まるため声部の跳躍が小さくなり、
 *    かつカデンツ全体が主音から23半音以内に収まることが保証される。
 *    対象音を2オクターブ上に置けば音が重ならない。
 */
export function cadenceFor(key: Key, octave: number = 2): Chord[] {
  const tonicMidiValue = (octave + 1) * 12 + tonicPitchClass(key);
  const upperBottom = tonicMidiValue + 12;
  const upperTop = upperBottom + 11;

  return CADENCE_DEGREES.map((degree) => {
    const chord = diatonicTriad(key, degree, octave);

    // buildTriad は根音を先頭に低い順で返すため、先頭が根音になる
    const [root, ...upperTones] = chord.midis;

    const voicedUpper = upperTones
      .map((midi) => {
        let placed = midi;
        while (placed < upperBottom) placed += 12;
        while (placed > upperTop) placed -= 12;
        return placed;
      })
      .sort((a, b) => a - b);

    return { ...chord, midis: [root, ...voicedUpper] };
  });
}

/** 三和音の性質を日本語表記で返す。 */
export function triadQualityLabel(quality: TriadQuality): string {
  const labels: Record<TriadQuality, string> = {
    major: "長三和音",
    minor: "短三和音",
    diminished: "減三和音",
    augmented: "増三和音",
  };
  return labels[quality];
}

/**
 * 2つの和音が同じ響きかどうか(構成音の集合として比較)。
 * 転回や重複を無視して判定するため、正誤判定に使える。
 */
export function isSameChordSound(a: Chord, b: Chord): boolean {
  const pitchClasses = (chord: Chord) =>
    new Set(chord.midis.map((m) => ((m % 12) + 12) % 12));

  const setA = pitchClasses(a);
  const setB = pitchClasses(b);

  if (setA.size !== setB.size) return false;
  for (const pc of setA) {
    if (!setB.has(pc)) return false;
  }
  return true;
}

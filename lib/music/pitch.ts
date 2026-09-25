/**
 * ピッチ・周波数・チューニング基準の基本演算。
 *
 * このプロジェクト全体が、たった一つの操作の上に成り立っている:
 * 「同じMIDIノートを、ずらした基準ピッチで鳴らす」。
 *
 * 音を絶対的な名前で識別している人は、基準がずれると足場を失う。
 * 音を相対的な距離で聴いている人は、ほとんど影響を受けない。
 * したがって detuneCents がこの実験の独立変数そのものになる。
 *
 * 単位にセントを採用しているのは、周波数(Hz)が知覚的に線形でないため。
 * 100セント = 半音、50セント = 半音のちょうど中間 = 最も曖昧な点。
 */

/** A4 のMIDIノート番号。すべての周波数計算の原点。 */
export const A4_MIDI = 69;

/** 国際標準の A4 = 440Hz。 */
export const STANDARD_A4_HZ = 440;

/** 1オクターブのセント数。 */
export const CENTS_PER_OCTAVE = 1200;

/** 1半音のセント数。 */
export const CENTS_PER_SEMITONE = 100;

/**
 * 診断で用いるデチューン条件。
 *
 * 50セントを最大値に選んだのは音楽的な理由による。半音のちょうど中間であり、
 * 鳴っている音がどちらの音名にも等距離になる。絶対音感のラベル付けが
 * 最も破綻しやすい点であり、これ以上ずらしても曖昧さは増えない
 * (60セントずらせば、隣の音名に近づいてしまい再びラベル付けが可能になる)。
 */
export const DETUNE_CONDITIONS = {
  /** 標準。ベースライン条件。 */
  NONE: 0,
  /** わずかなずれ。訓練の第一段階。 */
  SLIGHT: 10,
  /** 明確なずれ。訓練の第二段階。 */
  MODERATE: 25,
  /** 半音の中間。絶対音感が最も機能しなくなる点。 */
  MAXIMAL: 50,
} as const;

export type DetuneCents = number;

/** 半音単位の音名(シャープ表記)。調に応じた異名同音の綴りは scale.ts が扱う。 */
export const PITCH_CLASS_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

/**
 * デチューン量(セント)から、実際に用いる A4 の周波数を求める。
 *
 * 例: -50セント → 427.47Hz
 */
export function detuneCentsToRefHz(
  detuneCents: DetuneCents,
  baseA4Hz: number = STANDARD_A4_HZ,
): number {
  return baseA4Hz * Math.pow(2, detuneCents / CENTS_PER_OCTAVE);
}

/**
 * MIDIノート番号を周波数(Hz)に変換する。
 *
 * detuneCents はシステム全体を平行移動させる。個々の音をずらすのではなく
 * チューニング基準そのものを動かすため、音程の関係は完全に保たれる。
 * これが重要で、課題の音楽的な内容は一切変わらないまま、
 * 絶対的な音名だけが使えなくなる。純粋な操作変数になっている。
 *
 * @param midi MIDIノート番号 (A4 = 69, C4 = 60)
 * @param detuneCents 基準ピッチのずれ。正で高く、負で低く。
 */
export function midiToFrequency(
  midi: number,
  detuneCents: DetuneCents = 0,
): number {
  const refHz = detuneCentsToRefHz(detuneCents);
  return refHz * Math.pow(2, (midi - A4_MIDI) / 12);
}

/**
 * 周波数をMIDIノート番号に戻す(小数を含む)。
 * 主に検証と、将来のマイク入力による音高検出のために用意している。
 */
export function frequencyToMidi(
  hz: number,
  detuneCents: DetuneCents = 0,
): number {
  const refHz = detuneCentsToRefHz(detuneCents);
  return A4_MIDI + 12 * Math.log2(hz / refHz);
}

/**
 * 2つの周波数の隔たりをセントで返す。
 * 対数をとるのは、知覚される音高差が周波数比に比例するため。
 */
export function centsBetween(fromHz: number, toHz: number): number {
  return CENTS_PER_OCTAVE * Math.log2(toHz / fromHz);
}

/** MIDIノート番号から音名部分(オクターブなし)を返す。例: 61 → "C#" */
export function midiToPitchClass(midi: number): string {
  // 負のMIDI値でも正しく循環させるため、剰余を正に正規化する
  const index = ((midi % 12) + 12) % 12;
  return PITCH_CLASS_NAMES[index];
}

/**
 * MIDIノート番号から国際式の音名を返す。例: 60 → "C4"
 * C4 = 60 (中央ハ) の慣習に従うため、オクターブ番号は midi/12 - 1。
 */
export function midiToNoteName(midi: number): string {
  const octave = Math.floor(midi / 12) - 1;
  return `${midiToPitchClass(midi)}${octave}`;
}

/**
 * 音名をMIDIノート番号に変換する。例: "C4" → 60, "Bb3" → 58
 * シャープ(#)とフラット(b)の両方を受け付ける。
 */
export function noteNameToMidi(name: string): number {
  const match = name.trim().match(/^([A-Ga-g])([#b]*)(-?\d+)$/);
  if (!match) {
    throw new Error(`音名として解釈できません: "${name}"`);
  }

  const [, letter, accidentals, octaveText] = match;

  // ハ長調の白鍵が、Cからいくつ上かの半音数
  const naturalSemitones: Record<string, number> = {
    C: 0,
    D: 2,
    E: 4,
    F: 5,
    G: 7,
    A: 9,
    B: 11,
  };

  let semitone = naturalSemitones[letter.toUpperCase()];
  for (const accidental of accidentals) {
    semitone += accidental === "#" ? 1 : -1;
  }

  const octave = parseInt(octaveText, 10);
  return (octave + 1) * 12 + semitone;
}

/** 幹音の日本語音名(固定ド)。 */
const JAPANESE_FIXED_DO: Record<number, string> = {
  0: "ド",
  2: "レ",
  4: "ミ",
  5: "ファ",
  7: "ソ",
  9: "ラ",
  11: "シ",
};

/**
 * 日本語の音名(固定ド)を返す。派生音はシャープ付きで表す。
 *
 * 用途は練習画面の説明に限っている。固定ドの音名を本番で提示すると
 * 音名で答える習慣を強化してしまい、診断が測ろうとしているものを
 * 濁らせるため。練習はハ長調のみで、そこでは固定ドと移動ドが
 * 一致するので誤解が生じない。
 */
export function midiToJapaneseFixedDo(midi: number): string {
  const index = ((midi % 12) + 12) % 12;
  const natural = JAPANESE_FIXED_DO[index];
  if (natural) return natural;

  // 黒鍵は直下の幹音にシャープを付ける
  return `${JAPANESE_FIXED_DO[index - 1]}#`;
}

/** 音高を保ったままオクターブだけ移動する。 */
export function transposeOctaves(midi: number, octaves: number): number {
  return midi + octaves * 12;
}

/** MIDIノート番号が実用的な可聴・演奏範囲にあるか。 */
export function isInPlayableRange(midi: number): boolean {
  // A0(21) から C8(108) = ピアノ88鍵の範囲
  return midi >= 21 && midi <= 108;
}

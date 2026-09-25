import { describe, it, expect } from "vitest";
import {
  A4_MIDI,
  STANDARD_A4_HZ,
  DETUNE_CONDITIONS,
  detuneCentsToRefHz,
  midiToFrequency,
  frequencyToMidi,
  centsBetween,
  midiToPitchClass,
  midiToNoteName,
  midiToJapaneseFixedDo,
  noteNameToMidi,
  transposeOctaves,
  isInPlayableRange,
} from "./pitch";

describe("midiToFrequency", () => {
  it("A4 を基準の 440Hz に対応させる", () => {
    expect(midiToFrequency(A4_MIDI)).toBeCloseTo(STANDARD_A4_HZ, 10);
  });

  it("中央ハ(C4) を 261.63Hz に対応させる", () => {
    expect(midiToFrequency(60)).toBeCloseTo(261.6256, 3);
  });

  it("1オクターブ上で周波数がちょうど2倍になる", () => {
    const a4 = midiToFrequency(69);
    const a5 = midiToFrequency(81);
    expect(a5 / a4).toBeCloseTo(2, 10);
  });

  it("1オクターブ下で周波数がちょうど半分になる", () => {
    expect(midiToFrequency(57)).toBeCloseTo(midiToFrequency(69) / 2, 10);
  });
});

describe("デチューン", () => {
  it("-50セントで A4 が約 427.47Hz になる", () => {
    const refHz = detuneCentsToRefHz(-DETUNE_CONDITIONS.MAXIMAL);
    expect(refHz).toBeCloseTo(427.474, 2);
  });

  it("デチューン量0のとき標準ピッチと完全に一致する", () => {
    expect(detuneCentsToRefHz(0)).toBe(STANDARD_A4_HZ);
  });

  it("+1200セント(1オクターブ)で基準が2倍になる", () => {
    expect(detuneCentsToRefHz(1200)).toBeCloseTo(880, 10);
  });

  /**
   * この実験の妥当性を支える中核的な不変条件。
   *
   * デチューンはシステム全体を平行移動させるだけであり、音同士の関係は
   * 一切変えない。もしここが崩れていれば、デチューン条件での成績低下は
   * 「絶対音感への依存」ではなく「課題が音楽的に変質したこと」で
   * 説明できてしまい、指標の解釈が成り立たなくなる。
   */
  it("音程比を完全に保存する(課題の音楽的内容は変わらない)", () => {
    const intervals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const root = 60;

    for (const semitones of intervals) {
      for (const detune of [0, 10, 25, 50, -50, -13.7]) {
        const lowerHz = midiToFrequency(root, detune);
        const upperHz = midiToFrequency(root + semitones, detune);

        // 音程は周波数比で決まる。デチューンによらず比は同一でなければならない。
        const ratio = upperHz / lowerHz;
        expect(ratio).toBeCloseTo(Math.pow(2, semitones / 12), 10);

        // セント換算でも、常にちょうど半音数 × 100 セントになる。
        expect(centsBetween(lowerHz, upperHz)).toBeCloseTo(semitones * 100, 8);
      }
    }
  });

  it("50セントのデチューンで、隣り合う2つの音名からちょうど等距離になる", () => {
    // A4 を50セント下げると、A4 と G#4 のちょうど中間に位置する。
    // これがラベル付けが最も破綻する点であり、MAXIMAL を50に選んだ理由。
    const detunedA4 = midiToFrequency(69, -50);
    const trueA4 = midiToFrequency(69, 0);
    const trueGsharp4 = midiToFrequency(68, 0);

    const distanceToA = Math.abs(centsBetween(detunedA4, trueA4));
    const distanceToGsharp = Math.abs(centsBetween(detunedA4, trueGsharp4));

    expect(distanceToA).toBeCloseTo(50, 8);
    expect(distanceToGsharp).toBeCloseTo(50, 8);
    expect(distanceToA).toBeCloseTo(distanceToGsharp, 8);
  });
});

describe("frequencyToMidi", () => {
  it("midiToFrequency の逆変換になっている", () => {
    for (const midi of [21, 40, 60, 69, 88, 108]) {
      expect(frequencyToMidi(midiToFrequency(midi))).toBeCloseTo(midi, 10);
    }
  });

  it("デチューン量を揃えれば逆変換が成立する", () => {
    const detune = -50;
    expect(frequencyToMidi(midiToFrequency(72, detune), detune)).toBeCloseTo(
      72,
      10,
    );
  });

  it("デチューンを無視すると、ずれた分だけMIDI値がずれる", () => {
    // 基準を知らずに-50セントの音を読むと、半音の半分だけ低く見える。
    const hz = midiToFrequency(69, -50);
    expect(frequencyToMidi(hz, 0)).toBeCloseTo(69 - 0.5, 8);
  });
});

describe("centsBetween", () => {
  it("オクターブを1200セントとする", () => {
    expect(centsBetween(440, 880)).toBeCloseTo(1200, 10);
  });

  it("半音を100セントとする", () => {
    expect(centsBetween(midiToFrequency(60), midiToFrequency(61))).toBeCloseTo(
      100,
      10,
    );
  });

  it("下降を負の値で表す", () => {
    expect(centsBetween(880, 440)).toBeCloseTo(-1200, 10);
  });

  it("同一周波数で0を返す", () => {
    expect(centsBetween(440, 440)).toBe(0);
  });
});

describe("音名の変換", () => {
  it("MIDI値から音名を導く", () => {
    expect(midiToNoteName(60)).toBe("C4");
    expect(midiToNoteName(69)).toBe("A4");
    expect(midiToNoteName(61)).toBe("C#4");
    expect(midiToNoteName(21)).toBe("A0");
    expect(midiToNoteName(108)).toBe("C8");
  });

  it("音名からMIDI値を導く", () => {
    expect(noteNameToMidi("C4")).toBe(60);
    expect(noteNameToMidi("A4")).toBe(69);
    expect(noteNameToMidi("C#4")).toBe(61);
    expect(noteNameToMidi("A0")).toBe(21);
  });

  it("フラット表記を受け付ける", () => {
    expect(noteNameToMidi("Bb3")).toBe(58);
    expect(noteNameToMidi("Db4")).toBe(61);
  });

  it("異名同音を同じMIDI値に対応させる", () => {
    expect(noteNameToMidi("C#4")).toBe(noteNameToMidi("Db4"));
    expect(noteNameToMidi("F#3")).toBe(noteNameToMidi("Gb3"));
  });

  it("音名とMIDI値の往復が成立する", () => {
    for (let midi = 21; midi <= 108; midi++) {
      expect(noteNameToMidi(midiToNoteName(midi))).toBe(midi);
    }
  });

  it("解釈できない入力を拒否する", () => {
    expect(() => noteNameToMidi("H4")).toThrow();
    expect(() => noteNameToMidi("C")).toThrow();
    expect(() => noteNameToMidi("")).toThrow();
  });

  it("負のMIDI値でも音名部分を正しく循環させる", () => {
    expect(midiToPitchClass(0)).toBe("C");
    expect(midiToPitchClass(-1)).toBe("B");
    expect(midiToPitchClass(-12)).toBe("C");
  });
});

describe("midiToJapaneseFixedDo", () => {
  it("幹音に日本語の音名を与える", () => {
    const names = [60, 62, 64, 65, 67, 69, 71].map(midiToJapaneseFixedDo);
    expect(names).toEqual(["ド", "レ", "ミ", "ファ", "ソ", "ラ", "シ"]);
  });

  it("黒鍵をシャープ付きで表す", () => {
    expect(midiToJapaneseFixedDo(61)).toBe("ド#");
    expect(midiToJapaneseFixedDo(66)).toBe("ファ#");
  });

  it("オクターブが変わっても同じ音名になる", () => {
    expect(midiToJapaneseFixedDo(48)).toBe("ド");
    expect(midiToJapaneseFixedDo(72)).toBe("ド");
  });

  it("すべての音高に名前が付く", () => {
    for (let midi = 21; midi <= 108; midi++) {
      expect(midiToJapaneseFixedDo(midi)).toMatch(/^(ド|レ|ミ|ファ|ソ|ラ|シ)#?$/);
    }
  });
});

describe("補助関数", () => {
  it("オクターブ単位で移調する", () => {
    expect(transposeOctaves(60, 1)).toBe(72);
    expect(transposeOctaves(60, -1)).toBe(48);
    expect(transposeOctaves(60, 0)).toBe(60);
  });

  it("ピアノ88鍵の範囲を判定する", () => {
    expect(isInPlayableRange(21)).toBe(true); // A0
    expect(isInPlayableRange(108)).toBe(true); // C8
    expect(isInPlayableRange(20)).toBe(false);
    expect(isInPlayableRange(109)).toBe(false);
  });
});

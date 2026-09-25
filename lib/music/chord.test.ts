import { describe, it, expect } from "vitest";
import {
  buildTriad,
  diatonicTriad,
  cadenceFor,
  isSameChordSound,
  triadQualityLabel,
  TRIAD_INTERVALS,
  CADENCE_DEGREES,
} from "./chord";
import { PRACTICAL_MAJOR_KEYS, isDiatonic, type Key } from "./scale";
import { noteNameToMidi } from "./pitch";

const major = (tonic: string): Key => ({ tonic, mode: "major" });
const C4 = noteNameToMidi("C4");

describe("buildTriad", () => {
  it("長三和音を根音・長3度・完全5度で組み立てる", () => {
    expect(buildTriad(C4, "major").midis).toEqual([60, 64, 67]);
  });

  it("短三和音の第3音を半音下げる", () => {
    expect(buildTriad(C4, "minor").midis).toEqual([60, 63, 67]);
  });

  it("減三和音の第5音を半音下げる", () => {
    expect(buildTriad(C4, "diminished").midis).toEqual([60, 63, 66]);
  });

  it("増三和音の第5音を半音上げる", () => {
    expect(buildTriad(C4, "augmented").midis).toEqual([60, 64, 68]);
  });

  it("すべての三和音が3音で構成される", () => {
    for (const quality of Object.keys(TRIAD_INTERVALS) as Array<
      keyof typeof TRIAD_INTERVALS
    >) {
      expect(buildTriad(C4, quality).midis).toHaveLength(3);
    }
  });
});

describe("diatonicTriad", () => {
  it("ハ長調の各音度に正しい性質を与える", () => {
    const key = major("C");
    const qualities = [1, 2, 3, 4, 5, 6, 7].map(
      (degree) => diatonicTriad(key, degree, 4).quality,
    );

    expect(qualities).toEqual([
      "major", // I   C
      "minor", // ii  Dm
      "minor", // iii Em
      "major", // IV  F
      "major", // V   G
      "minor", // vi  Am
      "diminished", // vii° Bdim
    ]);
  });

  it("ハ長調のI度とV度を正しい音で構成する", () => {
    const key = major("C");
    expect(diatonicTriad(key, 1, 4).midis).toEqual([60, 64, 67]); // C E G
    expect(diatonicTriad(key, 5, 4).midis).toEqual([67, 71, 74]); // G B D
  });

  /**
   * 調性和声の根幹。ある調の音階上に組んだ三和音は、
   * 必ずその調の音階固有音だけで構成される。
   * ここが崩れると、カデンツが調を確立できなくなる。
   */
  it("すべての実用長調で、音階上の三和音が音階固有音のみで構成される", () => {
    for (const tonic of PRACTICAL_MAJOR_KEYS) {
      const key = major(tonic);
      for (let degree = 1; degree <= 7; degree++) {
        for (const midi of diatonicTriad(key, degree, 4).midis) {
          expect(
            isDiatonic(midi, key),
            `${tonic} 長調の第${degree}音上の和音に音階外の音がある: midi=${midi}`,
          ).toBe(true);
        }
      }
    }
  });

  it("範囲外の音度を拒否する", () => {
    expect(() => diatonicTriad(major("C"), 0, 4)).toThrow();
    expect(() => diatonicTriad(major("C"), 8, 4)).toThrow();
  });
});

describe("cadenceFor", () => {
  it("I → IV → V → I の進行を返す", () => {
    expect(CADENCE_DEGREES).toEqual([1, 4, 5, 1]);
    expect(cadenceFor(major("C"))).toHaveLength(4);
  });

  it("主和音で始まり主和音で終わる", () => {
    for (const tonic of PRACTICAL_MAJOR_KEYS) {
      const cadence = cadenceFor(major(tonic));
      expect(cadence[0].quality).toBe("major");
      expect(cadence[3].quality).toBe("major");
      // 最初と最後は同じ和音(主和音)
      expect(isSameChordSound(cadence[0], cadence[3])).toBe(true);
    }
  });

  it("すべての実用長調で、カデンツが音階固有音のみを用いる", () => {
    for (const tonic of PRACTICAL_MAJOR_KEYS) {
      const key = major(tonic);
      for (const chord of cadenceFor(key)) {
        for (const midi of chord.midis) {
          expect(isDiatonic(midi, key), `${tonic} 長調のカデンツ`).toBe(true);
        }
      }
    }
  });

  /**
   * カデンツの生命線。すべての和音が基本形(最低音＝根音)であること。
   *
   * 第2転回形の和音は和声的に不安定で、調を示す力が決定的に弱まる。
   * カデンツの唯一の役割は調の確立なので、ここが崩れると
   * 「相対音感で答える」という選択肢自体が成立しなくなり、
   * 診断が測ろうとしているものが測れなくなる。
   */
  it("すべての和音が基本形(最低音が根音)である", () => {
    for (const tonic of PRACTICAL_MAJOR_KEYS) {
      for (const chord of cadenceFor(major(tonic))) {
        const lowest = Math.min(...chord.midis);

        expect(
          ((lowest % 12) + 12) % 12,
          `${tonic} 長調のカデンツに転回形が混ざっている`,
        ).toBe(((chord.root % 12) + 12) % 12);

        expect(lowest).toBe(chord.root);
      }
    }
  });

  it("低音が I → IV → V → I と根音で動く", () => {
    for (const tonic of PRACTICAL_MAJOR_KEYS) {
      const key = major(tonic);
      const basses = cadenceFor(key).map((c) => Math.min(...c.midis));
      const tonicBass = basses[0];

      // 主音からの半音数で I(0) → IV(5) → V(7) → I(0)
      expect(
        basses.map((b) => b - tonicBass),
        `${tonic} 長調の低音進行`,
      ).toEqual([0, 5, 7, 0]);
    }
  });

  it("カデンツ全体が主音から23半音以内に収まる", () => {
    for (const tonic of PRACTICAL_MAJOR_KEYS) {
      const key = major(tonic);
      const allMidis = cadenceFor(key).flatMap((c) => c.midis);
      const cadenceTonic = cadenceFor(key)[0].midis[0];

      expect(
        Math.max(...allMidis) - cadenceTonic,
        `${tonic} 長調のカデンツが想定音域を超えている`,
      ).toBeLessThanOrEqual(23);
    }
  });

  it("各和音の構成音が低い順に並んでいる", () => {
    for (const tonic of PRACTICAL_MAJOR_KEYS) {
      for (const chord of cadenceFor(major(tonic))) {
        const sorted = [...chord.midis].sort((a, b) => a - b);
        expect(chord.midis).toEqual(sorted);
      }
    }
  });
});

describe("isSameChordSound", () => {
  it("転回しても同じ和音と判定する", () => {
    const root = buildTriad(60, "major"); // C E G
    const inverted = { root: 64, quality: "major" as const, midis: [64, 67, 72] }; // E G C
    expect(isSameChordSound(root, inverted)).toBe(true);
  });

  it("性質が違えば別の和音と判定する", () => {
    expect(isSameChordSound(buildTriad(60, "major"), buildTriad(60, "minor"))).toBe(
      false,
    );
  });

  it("根音が違えば別の和音と判定する", () => {
    expect(isSameChordSound(buildTriad(60, "major"), buildTriad(62, "major"))).toBe(
      false,
    );
  });
});

describe("triadQualityLabel", () => {
  it("日本語の名称を返す", () => {
    expect(triadQualityLabel("major")).toBe("長三和音");
    expect(triadQualityLabel("diminished")).toBe("減三和音");
  });
});

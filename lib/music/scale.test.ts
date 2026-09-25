import { describe, it, expect } from "vitest";
import {
  PRACTICAL_MAJOR_KEYS,
  spellScale,
  scaleDegreeOf,
  solfegeOf,
  solfegeForMidi,
  scaleDegreeToString,
  circleOfFifthsDistance,
  tonicPitchClass,
  tonicMidi,
  isDiatonic,
  diatonicMidisInRange,
  keyDisplayName,
  type Key,
} from "./scale";
import { noteNameToMidi } from "./pitch";

const major = (tonic: string): Key => ({ tonic, mode: "major" });

describe("spellScale", () => {
  it("ハ長調を正しく綴る", () => {
    expect(spellScale(major("C"))).toEqual(["C", "D", "E", "F", "G", "A", "B"]);
  });

  it("シャープ系の調を正しく綴る", () => {
    expect(spellScale(major("G"))).toEqual(["G", "A", "B", "C", "D", "E", "F#"]);
    expect(spellScale(major("D"))).toEqual([
      "D",
      "E",
      "F#",
      "G",
      "A",
      "B",
      "C#",
    ]);
  });

  it("フラット系の調を正しく綴る", () => {
    expect(spellScale(major("F"))).toEqual(["F", "G", "A", "Bb", "C", "D", "E"]);
    expect(spellScale(major("Bb"))).toEqual([
      "Bb",
      "C",
      "D",
      "Eb",
      "F",
      "G",
      "A",
    ]);
    expect(spellScale(major("Db"))).toEqual([
      "Db",
      "Eb",
      "F",
      "Gb",
      "Ab",
      "Bb",
      "C",
    ]);
  });

  /**
   * 嬰ヘ長調の第7音は「F」ではなく「E#」でなければならない。
   * 綴りを音高クラスから機械的に決めていると必ず間違える箇所で、
   * 記譜法の規則(各文字を1回ずつ使う)から導いていることの証明になる。
   */
  it("嬰ヘ長調の第7音を E# と綴る", () => {
    const scale = spellScale(major("F#"));
    expect(scale).toEqual(["F#", "G#", "A#", "B", "C#", "D#", "E#"]);
    expect(scale[6]).toBe("E#");
    expect(scale[6]).not.toBe("F");
  });

  /**
   * 記譜法の中核的な規則。長音階は必ずA〜Gの各文字をちょうど1回ずつ使う。
   * これが全調で成り立つなら、綴りの導出は構造的に正しい。
   */
  it("すべての実用長調で、A〜Gの各文字をちょうど1回ずつ使う", () => {
    for (const tonic of PRACTICAL_MAJOR_KEYS) {
      const letters = spellScale(major(tonic)).map((note) => note[0]);
      const unique = new Set(letters);

      expect(unique.size, `${tonic} 長調で文字の重複がある: ${letters}`).toBe(7);
    }
  });

  it("すべての実用長調で、音程の並びが長音階と一致する", () => {
    for (const tonic of PRACTICAL_MAJOR_KEYS) {
      const midis = spellScale(major(tonic)).map((note) =>
        noteNameToMidi(`${note}4`),
      );

      // 主音を起点に、上行の半音数が長音階の型と一致することを確認する
      const relative = midis.map((midi) => (((midi - midis[0]) % 12) + 12) % 12);
      expect(relative, `${tonic} 長調`).toEqual([0, 2, 4, 5, 7, 9, 11]);
    }
  });

  it("自然的短音階を正しく綴る", () => {
    expect(spellScale({ tonic: "A", mode: "minor" })).toEqual([
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
    ]);
  });

  it("主音として解釈できない入力を拒否する", () => {
    expect(() => spellScale(major("H"))).toThrow();
    expect(() => spellScale(major(""))).toThrow();
  });
});

describe("scaleDegreeOf", () => {
  it("ハ長調の音階固有音を正しい度数にする", () => {
    const key = major("C");
    expect(scaleDegreeOf(noteNameToMidi("C4"), key)).toEqual({
      degree: 1,
      alteration: 0,
    });
    expect(scaleDegreeOf(noteNameToMidi("E4"), key)).toEqual({
      degree: 3,
      alteration: 0,
    });
    expect(scaleDegreeOf(noteNameToMidi("B4"), key)).toEqual({
      degree: 7,
      alteration: 0,
    });
  });

  /**
   * 絶対音感と相対音感が分岐する地点そのもの。
   * 同じ「F#」という音が、調によって全く違う機能を持つ。
   */
  it("同じ音が、調によって異なる度数になる", () => {
    const fSharp = noteNameToMidi("F#4");

    expect(scaleDegreeOf(fSharp, major("D"))).toEqual({
      degree: 3,
      alteration: 0,
    }); // ニ長調では第3音
    expect(scaleDegreeOf(fSharp, major("G"))).toEqual({
      degree: 7,
      alteration: 0,
    }); // ト長調では第7音
    expect(scaleDegreeOf(fSharp, major("B"))).toEqual({
      degree: 5,
      alteration: 0,
    }); // ロ長調では第5音
  });

  it("オクターブが違っても同じ度数になる", () => {
    const key = major("C");
    for (const octave of [2, 3, 4, 5, 6]) {
      expect(scaleDegreeOf(noteNameToMidi(`E${octave}`), key)).toEqual({
        degree: 3,
        alteration: 0,
      });
    }
  });

  it("音階外の音を変化音として表す", () => {
    const key = major("C");
    expect(scaleDegreeOf(noteNameToMidi("F#4"), key)).toEqual({
      degree: 4,
      alteration: 1,
    });
    expect(scaleDegreeOf(noteNameToMidi("C#4"), key)).toEqual({
      degree: 1,
      alteration: 1,
    });
  });

  it("すべての実用長調で、12音すべてに度数を割り当てられる", () => {
    for (const tonic of PRACTICAL_MAJOR_KEYS) {
      for (let midi = 60; midi < 72; midi++) {
        const degree = scaleDegreeOf(midi, major(tonic));
        expect(degree.degree).toBeGreaterThanOrEqual(1);
        expect(degree.degree).toBeLessThanOrEqual(7);
      }
    }
  });
});

describe("移動ド階名", () => {
  it("長音階の各音に階名を与える", () => {
    const key = major("C");
    const expected = ["Do", "Re", "Mi", "Fa", "Sol", "La", "Ti"];
    const actual = ["C4", "D4", "E4", "F4", "G4", "A4", "B4"].map((note) =>
      solfegeForMidi(noteNameToMidi(note), key),
    );
    expect(actual).toEqual(expected);
  });

  /**
   * 移動ドの本質。調が変わっても、音階上の同じ位置は同じ階名で呼ばれる。
   * 実際に鳴っている音高は調ごとに全く違う。
   */
  it("調が変わっても、同じ度数には同じ階名が与えられる", () => {
    for (const tonic of PRACTICAL_MAJOR_KEYS) {
      const key = major(tonic);
      const thirdDegreeMidi = tonicMidi(key, 4) + 4; // 主音の長3度上

      expect(solfegeForMidi(thirdDegreeMidi, key), `${tonic} 長調`).toBe("Mi");
    }
  });

  it("変化音に固有の階名を与える", () => {
    expect(solfegeOf({ degree: 4, alteration: 1 })).toBe("Fi");
    expect(solfegeOf({ degree: 5, alteration: -1 })).toBe("Se");
    expect(solfegeOf({ degree: 1, alteration: 1 })).toBe("Di");
  });

  it("音度を文字列に直す", () => {
    expect(scaleDegreeToString({ degree: 5, alteration: 0 })).toBe("5");
    expect(scaleDegreeToString({ degree: 3, alteration: -1 })).toBe("b3");
    expect(scaleDegreeToString({ degree: 4, alteration: 1 })).toBe("#4");
  });
});

describe("circleOfFifthsDistance", () => {
  it("ハ長調を原点とする", () => {
    expect(circleOfFifthsDistance(major("C"))).toBe(0);
  });

  it("五度圏上の距離を左右対称に測る", () => {
    expect(circleOfFifthsDistance(major("G"))).toBe(1); // シャープ1つ
    expect(circleOfFifthsDistance(major("F"))).toBe(1); // フラット1つ
    expect(circleOfFifthsDistance(major("D"))).toBe(2);
    expect(circleOfFifthsDistance(major("Bb"))).toBe(2);
    expect(circleOfFifthsDistance(major("A"))).toBe(3);
    expect(circleOfFifthsDistance(major("Eb"))).toBe(3);
  });

  it("嬰ヘ長調を最遠(距離6)とする", () => {
    expect(circleOfFifthsDistance(major("F#"))).toBe(6);
  });

  it("すべての実用長調で距離が 0〜6 に収まる", () => {
    for (const tonic of PRACTICAL_MAJOR_KEYS) {
      const distance = circleOfFifthsDistance(major(tonic));
      expect(distance).toBeGreaterThanOrEqual(0);
      expect(distance).toBeLessThanOrEqual(6);
    }
  });

  it("12の実用長調が五度圏をむらなく覆う", () => {
    // 分析で調性依存度を距離に回帰するため、各距離に十分な調が必要になる
    const distances = PRACTICAL_MAJOR_KEYS.map((t) =>
      circleOfFifthsDistance(major(t)),
    );
    expect(distances.filter((d) => d === 0)).toHaveLength(1); // C のみ
    expect(distances.filter((d) => d === 6)).toHaveLength(1); // F# のみ
    expect(distances.filter((d) => d === 1)).toHaveLength(2); // G, F
    expect(distances.filter((d) => d === 3)).toHaveLength(2); // A, Eb
  });
});

describe("補助関数", () => {
  it("主音の音高クラスを返す", () => {
    expect(tonicPitchClass(major("C"))).toBe(0);
    expect(tonicPitchClass(major("F#"))).toBe(6);
    expect(tonicPitchClass(major("Db"))).toBe(1);
  });

  it("異名同音の調が同じ音高クラスを指す", () => {
    expect(tonicPitchClass(major("F#"))).toBe(tonicPitchClass(major("Gb")));
  });

  it("主音のMIDI値をオクターブ付きで返す", () => {
    expect(tonicMidi(major("C"), 4)).toBe(60);
    expect(tonicMidi(major("A"), 4)).toBe(69);
  });

  it("音階固有音かどうかを判定する", () => {
    expect(isDiatonic(noteNameToMidi("F#4"), major("G"))).toBe(true);
    expect(isDiatonic(noteNameToMidi("F4"), major("G"))).toBe(false);
  });

  it("音域内の音階音を列挙する", () => {
    const midis = diatonicMidisInRange(major("C"), 60, 72);
    // C4〜C5 の白鍵8つ
    expect(midis).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
  });

  it("列挙した音がすべて音階固有音である", () => {
    for (const tonic of PRACTICAL_MAJOR_KEYS) {
      const key = major(tonic);
      for (const midi of diatonicMidisInRange(key, 48, 84)) {
        expect(isDiatonic(midi, key)).toBe(true);
      }
    }
  });

  it("調の表示名を返す", () => {
    expect(keyDisplayName(major("F#"))).toBe("F# major");
  });
});

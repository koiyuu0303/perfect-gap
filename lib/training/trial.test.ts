import { describe, it, expect } from "vitest";
import {
  CONDITIONS,
  NEAR_KEYS,
  REMOTE_KEYS,
  generateTrial,
  gradeTrial,
  buildDiagnosticSequence,
  buildTrialEvents,
  generatePracticeTrials,
  tonicMidiNearMiddleC,
  shuffle,
  trialDuration,
  type Condition,
} from "./trial";
import { circleOfFifthsDistance, isDiatonic, scaleDegreeOf } from "@/lib/music/scale";
import { DETUNE_CONDITIONS } from "@/lib/music/pitch";

/**
 * 決定論的な乱数源。テストを再現可能にするための線形合同法。
 * 実験の再現性という観点からも、乱数を注入できる設計にしている。
 */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe("実験計画", () => {
  it("2×2の要因計画になっている", () => {
    expect(CONDITIONS).toHaveLength(4);

    const combos = CONDITIONS.map(
      (c) => `${c.keyProximity}/${c.detuneCents === 0 ? "normal" : "detuned"}`,
    );
    expect(new Set(combos).size).toBe(4); // 4通りがすべて異なる

    expect(combos).toContain("near/normal");
    expect(combos).toContain("remote/normal");
    expect(combos).toContain("near/detuned");
    expect(combos).toContain("remote/detuned");
  });

  it("基準条件は調が近く、デチューンもない", () => {
    const baseline = CONDITIONS.find((c) => c.id === "baseline")!;
    expect(baseline.keyProximity).toBe("near");
    expect(baseline.detuneCents).toBe(0);
  });

  it("デチューン条件が半音の中間(50セント)を使う", () => {
    const detuned = CONDITIONS.find((c) => c.id === "detuned")!;
    expect(Math.abs(detuned.detuneCents)).toBe(DETUNE_CONDITIONS.MAXIMAL);
    expect(Math.abs(detuned.detuneCents)).toBe(50);
  });

  it("近い調と遠隔調が五度圏上で明確に分かれている", () => {
    for (const tonic of NEAR_KEYS) {
      expect(circleOfFifthsDistance({ tonic, mode: "major" })).toBeLessThanOrEqual(1);
    }
    for (const tonic of REMOTE_KEYS) {
      expect(circleOfFifthsDistance({ tonic, mode: "major" })).toBeGreaterThanOrEqual(4);
    }
    // 両群に重なりがない
    expect(NEAR_KEYS.filter((k) => REMOTE_KEYS.includes(k))).toHaveLength(0);
  });

  it("どちらの群にも十分な数の調がある", () => {
    expect(NEAR_KEYS.length).toBeGreaterThanOrEqual(3);
    expect(REMOTE_KEYS.length).toBeGreaterThanOrEqual(3);
  });
});

describe("generateTrial", () => {
  const allConditions = CONDITIONS as readonly Condition[];

  it("出題音が必ずその調の音階固有音になる", () => {
    const random = seededRandom(42);
    for (let i = 0; i < 200; i++) {
      for (const condition of allConditions) {
        const trial = generateTrial(condition, random);
        expect(
          isDiatonic(trial.targetMidi, trial.key),
          `${trial.key.tonic} 長調で音階外の音が出題された: ${trial.targetMidi}`,
        ).toBe(true);
      }
    }
  });

  it("正解が出題音から正しく導かれている", () => {
    const random = seededRandom(7);
    for (let i = 0; i < 100; i++) {
      for (const condition of allConditions) {
        const trial = generateTrial(condition, random);
        expect(trial.correctAnswer).toEqual(
          scaleDegreeOf(trial.targetMidi, trial.key),
        );
        expect(trial.correctAnswer.alteration).toBe(0);
        expect(trial.correctAnswer.degree).toBeGreaterThanOrEqual(1);
        expect(trial.correctAnswer.degree).toBeLessThanOrEqual(7);
      }
    }
  });

  it("条件で指定したデチューン量をそのまま引き継ぐ", () => {
    const random = seededRandom(1);
    for (const condition of allConditions) {
      const trial = generateTrial(condition, random);
      expect(trial.detuneCents).toBe(condition.detuneCents);
    }
  });

  it("条件で指定した調の遠さを守る", () => {
    const random = seededRandom(99);
    for (let i = 0; i < 100; i++) {
      for (const condition of allConditions) {
        const trial = generateTrial(condition, random);
        if (condition.keyProximity === "near") {
          expect(trial.keyDistance).toBeLessThanOrEqual(1);
        } else {
          expect(trial.keyDistance).toBeGreaterThanOrEqual(4);
        }
      }
    }
  });

  it("同じ乱数種から同じ課題が再現される", () => {
    const a = generateTrial(CONDITIONS[0], seededRandom(2024));
    const b = generateTrial(CONDITIONS[0], seededRandom(2024));
    expect(a).toEqual(b);
  });

  it("7つの音度がひととおり出題される", () => {
    const random = seededRandom(5);
    const degrees = new Set<number>();
    for (let i = 0; i < 300; i++) {
      degrees.add(generateTrial(CONDITIONS[0], random).correctAnswer.degree);
    }
    expect(degrees.size).toBe(7);
  });

  it("出題音が聴き取りやすい音域に収まる", () => {
    const random = seededRandom(3);
    for (let i = 0; i < 200; i++) {
      for (const condition of allConditions) {
        const trial = generateTrial(condition, random);
        // C3(48) 〜 C6(84) の範囲
        expect(trial.targetMidi).toBeGreaterThanOrEqual(48);
        expect(trial.targetMidi).toBeLessThanOrEqual(84);
      }
    }
  });
});

describe("generatePracticeTrials", () => {
  it("2問を返す", () => {
    expect(generatePracticeTrials()).toHaveLength(2);
  });

  /**
   * 練習をハ長調に固定するのは教育上の判断。
   * ハ長調では固定ドと移動ドが一致するため、固定ドで育った人が
   * 自分の音名の知識を使ったまま「数える」規則を学べる。
   */
  it("必ずハ長調で出題する", () => {
    for (const trial of generatePracticeTrials()) {
      expect(trial.key.tonic).toBe("C");
      expect(trial.keyDistance).toBe(0);
    }
  });

  it("練習ではデチューンしない", () => {
    for (const trial of generatePracticeTrials()) {
      expect(trial.detuneCents).toBe(0);
    }
  });

  it("主音から始めて、説明文の例と同じ第3音に進む", () => {
    const degrees = generatePracticeTrials().map(
      (t) => t.correctAnswer.degree,
    );
    expect(degrees).toEqual([1, 3]);
  });

  it("毎回同じ内容になる(説明文と食い違わないため)", () => {
    expect(generatePracticeTrials()).toEqual(generatePracticeTrials());
  });

  it("本番と同じ形式(カデンツ4和音＋対象音)で出題する", () => {
    for (const trial of generatePracticeTrials()) {
      expect(trial.events).toHaveLength(5);
      expect(trial.events[4].midis).toHaveLength(1);
    }
  });
});

describe("tonicMidiNearMiddleC", () => {
  it("すべての実用長調で主音が1オクターブ強の幅に収まる", () => {
    const midis = [...NEAR_KEYS, ...REMOTE_KEYS].map((tonic) =>
      tonicMidiNearMiddleC({ tonic, mode: "major" }),
    );
    const span = Math.max(...midis) - Math.min(...midis);

    // 調ごとに音域がばらつくと、音の高さ自体が手がかりになってしまう
    expect(span).toBeLessThanOrEqual(12);
  });
});

describe("buildTrialEvents", () => {
  it("カデンツ4和音のあとに対象音を並べる", () => {
    const key = { tonic: "C", mode: "major" as const };
    const events = buildTrialEvents(key, 60, 64);

    expect(events).toHaveLength(5); // カデンツ4つ + 対象音1つ
    expect(events[4].midis).toEqual([64]);
  });

  it("対象音がカデンツより後に鳴る", () => {
    const events = buildTrialEvents({ tonic: "C", mode: "major" }, 60, 64);
    const cadenceEnd = Math.max(
      ...events.slice(0, 4).map((e) => e.offset + e.duration),
    );
    expect(events[4].offset).toBeGreaterThan(cadenceEnd);
  });

  /**
   * 対象音がカデンツの和音と同じ高さで鳴ると、音が重なって聴き取れなくなる。
   * 最も危険なのは対象音が主音(音度1)のときで、実際にここで一度バグを出した。
   * すべての調・すべての音度で衝突が起きないことを確認する。
   */
  it("すべての調・音度で、カデンツが対象音より低く収まる", () => {
    for (const tonic of [...NEAR_KEYS, ...REMOTE_KEYS]) {
      const key = { tonic, mode: "major" as const };
      const tonicMidi = tonicMidiNearMiddleC(key);

      for (let degreeIndex = 0; degreeIndex < 7; degreeIndex++) {
        const targetMidi = tonicMidi + [0, 2, 4, 5, 7, 9, 11][degreeIndex];
        const events = buildTrialEvents(key, tonicMidi, targetMidi);

        const cadenceHighest = Math.max(
          ...events.slice(0, 4).flatMap((e) => e.midis),
        );

        expect(
          cadenceHighest,
          `${tonic} 長調の第${degreeIndex + 1}音でカデンツと対象音が重なる`,
        ).toBeLessThan(targetMidi);
      }
    }
  });

  it("和音が時間的に重ならない", () => {
    const events = buildTrialEvents({ tonic: "C", mode: "major" }, 60, 64);
    for (let i = 0; i < 3; i++) {
      expect(events[i].offset + events[i].duration).toBeLessThanOrEqual(
        events[i + 1].offset + 1e-9,
      );
    }
  });
});

describe("gradeTrial", () => {
  it("正しい音度を正解とする", () => {
    const trial = generateTrial(CONDITIONS[0], seededRandom(11));
    expect(gradeTrial(trial, trial.correctAnswer.degree)).toBe(true);
  });

  it("誤った音度を不正解とする", () => {
    const trial = generateTrial(CONDITIONS[0], seededRandom(11));
    const wrong = (trial.correctAnswer.degree % 7) + 1;
    expect(gradeTrial(trial, wrong)).toBe(false);
  });

  it("7つの選択肢のうち正解はちょうど1つ", () => {
    const random = seededRandom(77);
    for (let i = 0; i < 50; i++) {
      const trial = generateTrial(CONDITIONS[1], random);
      const correctCount = [1, 2, 3, 4, 5, 6, 7].filter((d) =>
        gradeTrial(trial, d),
      ).length;
      expect(correctCount).toBe(1);
    }
  });
});

describe("buildDiagnosticSequence", () => {
  it("各条件を同数ずつ出題する", () => {
    const trials = buildDiagnosticSequence(5, seededRandom(2025));
    expect(trials).toHaveLength(20);

    for (const condition of CONDITIONS) {
      const count = trials.filter((t) => t.condition === condition.id).length;
      expect(count, `条件 ${condition.id} の出題数`).toBe(5);
    }
  });

  /**
   * 条件がまとまって出ると、慣れや戦略の切り替えが起こって
   * 条件間の比較が歪む。順序が混ざっていることを確認する。
   */
  it("条件の並びが混ざっている", () => {
    const trials = buildDiagnosticSequence(8, seededRandom(31));
    const ids = trials.map((t) => t.condition);

    // 同じ条件が連続する箇所の数を数える。整列していれば 28 になる。
    let runs = 0;
    for (let i = 1; i < ids.length; i++) {
      if (ids[i] === ids[i - 1]) runs++;
    }
    expect(runs).toBeLessThan(ids.length / 2);
  });
});

describe("shuffle", () => {
  it("要素を失わない", () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const output = shuffle(input, seededRandom(8));
    expect(output).toHaveLength(input.length);
    expect([...output].sort((a, b) => a - b)).toEqual(input);
  });

  it("元の配列を変更しない", () => {
    const input = [1, 2, 3];
    shuffle(input, seededRandom(8));
    expect(input).toEqual([1, 2, 3]);
  });
});

describe("trialDuration", () => {
  it("課題全体の長さを返す", () => {
    const trial = generateTrial(CONDITIONS[0], seededRandom(4));
    const duration = trialDuration(trial);

    // カデンツ 2.2秒 + 間 0.5秒 + 対象音 1.5秒 = 4.2秒
    expect(duration).toBeCloseTo(4.2, 5);
  });
});

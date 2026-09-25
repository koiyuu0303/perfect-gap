import { describe, it, expect } from "vitest";
import {
  median,
  summarizeCondition,
  summarizeDiagnostic,
  answerErrorInSemitones,
  classifyListener,
  listenerProfileLabel,
  type TrialRecord,
} from "./analysis";
import type { ConditionId } from "./trial";

/** 検証用の記録を作る。指定しない項目は無難な既定値で埋める。 */
function record(overrides: Partial<TrialRecord> = {}): TrialRecord {
  return {
    condition: "baseline",
    keyTonic: "C",
    keyDistance: 0,
    detuneCents: 0,
    targetMidi: 64,
    correctDegree: 3,
    answeredDegree: 3,
    isCorrect: true,
    rtMs: 1000,
    presentedAt: "2026-09-05T00:00:00.000Z",
    ...overrides,
  };
}

/** 指定条件で、正解と不正解を指定数ずつ作る。 */
function records(
  condition: ConditionId,
  correct: number,
  wrong: number,
  rtMs = 1000,
): TrialRecord[] {
  return [
    ...Array.from({ length: correct }, () =>
      record({ condition, isCorrect: true, rtMs }),
    ),
    ...Array.from({ length: wrong }, () =>
      record({ condition, isCorrect: false, answeredDegree: 5, rtMs }),
    ),
  ];
}

describe("median", () => {
  it("奇数個の中央の値を返す", () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it("偶数個では中央2つの平均を返す", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it("空配列で0を返す", () => {
    expect(median([])).toBe(0);
  });

  it("元の配列を変更しない", () => {
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });

  /**
   * 中央値を選んだ理由そのものの確認。
   * 反応時間は稀に極端に大きい値を含むため、平均では歪む。
   */
  it("極端に大きい値に引きずられない", () => {
    const withOutlier = [500, 520, 540, 560, 30000];
    expect(median(withOutlier)).toBe(540);

    const mean = withOutlier.reduce((a, b) => a + b, 0) / withOutlier.length;
    expect(mean).toBeGreaterThan(6000); // 平均だとこれだけ歪む
  });
});

describe("summarizeCondition", () => {
  it("正答率を計算する", () => {
    const summary = summarizeCondition(records("baseline", 8, 2), "baseline");
    expect(summary.trials).toBe(10);
    expect(summary.correct).toBe(8);
    expect(summary.accuracy).toBe(0.8);
  });

  it("他の条件の記録を混ぜない", () => {
    const all = [...records("baseline", 5, 0), ...records("detuned", 0, 5)];

    expect(summarizeCondition(all, "baseline").accuracy).toBe(1);
    expect(summarizeCondition(all, "detuned").accuracy).toBe(0);
  });

  it("記録がない条件で0を返す(NaNにしない)", () => {
    const summary = summarizeCondition([], "baseline");
    expect(summary.accuracy).toBe(0);
    expect(summary.medianRtMs).toBe(0);
    expect(Number.isNaN(summary.accuracy)).toBe(false);
  });

  it("反応時間の中央値を返す", () => {
    const trials = [
      record({ condition: "baseline", rtMs: 800 }),
      record({ condition: "baseline", rtMs: 1000 }),
      record({ condition: "baseline", rtMs: 1200 }),
    ];
    expect(summarizeCondition(trials, "baseline").medianRtMs).toBe(1000);
  });
});

describe("summarizeDiagnostic", () => {
  /**
   * 絶対音感保持者に予測される典型的な結果。
   * 基準条件では高得点、デチューンで急落する。
   */
  it("絶対音高に依存する回答パターンで、AP依存度が大きく出る", () => {
    const summary = summarizeDiagnostic([
      ...records("baseline", 10, 0), // 100%
      ...records("detuned", 4, 6), // 40%
      ...records("remoteKey", 9, 1), // 90%
      ...records("both", 3, 7), // 30%
    ]);

    expect(summary.apReliance).toBeCloseTo(60, 5); // 100 - 40
    expect(summary.keyDependency).toBeCloseTo(10, 5); // 100 - 90
  });

  /**
   * 相対音感で聴いている人に予測される結果。
   * デチューンしても音同士の関係は変わらないため、成績は落ちない。
   */
  it("相対的に聴く回答パターンで、AP依存度がほぼ0になる", () => {
    const summary = summarizeDiagnostic([
      ...records("baseline", 8, 2), // 80%
      ...records("detuned", 8, 2), // 80%
      ...records("remoteKey", 8, 2),
      ...records("both", 8, 2),
    ]);

    expect(summary.apReliance).toBeCloseTo(0, 5);
    expect(summary.keyDependency).toBeCloseTo(0, 5);
  });

  /**
   * 指標が「差」である理由。技能の高低そのものは打ち消される。
   * 上手い人と下手な人が同じ依存度を示しうる。
   */
  it("全体の技能水準が違っても、依存度が同じなら同じ値になる", () => {
    const skilled = summarizeDiagnostic([
      ...records("baseline", 10, 0), // 100%
      ...records("detuned", 7, 3), // 70%
      ...records("remoteKey", 10, 0),
      ...records("both", 7, 3),
    ]);

    const lessSkilled = summarizeDiagnostic([
      ...records("baseline", 6, 4), // 60%
      ...records("detuned", 3, 7), // 30%
      ...records("remoteKey", 6, 4),
      ...records("both", 3, 7),
    ]);

    // どちらも30ポイントの低下
    expect(skilled.apReliance).toBeCloseTo(30, 5);
    expect(lessSkilled.apReliance).toBeCloseTo(30, 5);
    expect(skilled.overallAccuracy).toBeGreaterThan(lessSkilled.overallAccuracy);
  });

  it("反応時間の遅れを計算する", () => {
    const summary = summarizeDiagnostic([
      ...records("baseline", 5, 0, 900),
      ...records("detuned", 5, 0, 1600),
    ]);
    expect(summary.rtPenaltyMs).toBeCloseTo(700, 5);
  });

  it("全体の正答率と試行数を集計する", () => {
    const summary = summarizeDiagnostic([
      ...records("baseline", 5, 5),
      ...records("detuned", 5, 5),
    ]);
    expect(summary.totalTrials).toBe(20);
    expect(summary.overallAccuracy).toBe(0.5);
  });

  it("記録が空でも壊れない", () => {
    const summary = summarizeDiagnostic([]);
    expect(summary.totalTrials).toBe(0);
    expect(summary.overallAccuracy).toBe(0);
    expect(Number.isNaN(summary.apReliance)).toBe(false);
  });

  it("4条件すべての集計を含む", () => {
    const summary = summarizeDiagnostic(records("baseline", 1, 0));
    expect(Object.keys(summary.byCondition).sort()).toEqual([
      "baseline",
      "both",
      "detuned",
      "remoteKey",
    ]);
  });
});

describe("answerErrorInSemitones", () => {
  it("高く答えた誤りを正の値で返す", () => {
    // 第3音(4半音)が正解のところを第5音(7半音)と回答 → +3
    expect(
      answerErrorInSemitones(record({ correctDegree: 3, answeredDegree: 5 })),
    ).toBe(3);
  });

  it("低く答えた誤りを負の値で返す", () => {
    expect(
      answerErrorInSemitones(record({ correctDegree: 5, answeredDegree: 3 })),
    ).toBe(-3);
  });

  it("正解では0を返す", () => {
    expect(
      answerErrorInSemitones(record({ correctDegree: 4, answeredDegree: 4 })),
    ).toBe(0);
  });
});

describe("classifyListener", () => {
  it("試行数が少なければデータ不足とする", () => {
    expect(classifyListener(summarizeDiagnostic(records("baseline", 5, 0)))).toBe(
      "insufficient-data",
    );
  });

  it("基準条件で正答率が低ければ基礎形成中とする", () => {
    const summary = summarizeDiagnostic([
      ...records("baseline", 4, 6), // 40%
      ...records("detuned", 4, 6),
      ...records("remoteKey", 4, 6),
      ...records("both", 4, 6),
    ]);
    expect(classifyListener(summary)).toBe("developing");
  });

  it("基準は高くデチューンで大きく落ちれば絶対音高依存とする", () => {
    const summary = summarizeDiagnostic([
      ...records("baseline", 10, 0),
      ...records("detuned", 4, 6),
      ...records("remoteKey", 9, 1),
      ...records("both", 3, 7),
    ]);
    expect(classifyListener(summary)).toBe("absolute-dependent");
  });

  it("どの条件でも安定していれば相対的に聴けていると判定する", () => {
    const summary = summarizeDiagnostic([
      ...records("baseline", 9, 1),
      ...records("detuned", 9, 1),
      ...records("remoteKey", 8, 2),
      ...records("both", 8, 2),
    ]);
    expect(classifyListener(summary)).toBe("relative-capable");
  });

  it("すべての判定に日本語ラベルがある", () => {
    for (const profile of [
      "absolute-dependent",
      "relative-capable",
      "developing",
      "insufficient-data",
    ] as const) {
      expect(listenerProfileLabel(profile).length).toBeGreaterThan(0);
    }
  });
});

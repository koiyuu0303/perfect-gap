import { describe, it, expect } from "vitest";
import {
  toHistoryPoints,
  summarizeHistory,
  type ConditionSummaryRow,
} from "./history";
import type { ConditionId } from "@/lib/training/trial";

/** 1セッション分の4条件をまとめて作る。 */
function session(
  sessionId: string,
  startedAt: string,
  accuracies: Record<ConditionId, number>,
  medianRt: Partial<Record<ConditionId, number>> = {},
): ConditionSummaryRow[] {
  return (
    ["baseline", "remoteKey", "detuned", "both"] as ConditionId[]
  ).map((condition) => ({
    session_id: sessionId,
    condition,
    trials: 5,
    correct: Math.round(accuracies[condition] * 5),
    accuracy: accuracies[condition],
    median_rt_ms: medianRt[condition] ?? 1000,
    started_at: startedAt,
  }));
}

describe("toHistoryPoints", () => {
  it("条件別の行をセッション単位にまとめる", () => {
    const rows = session("s1", "2026-09-01T10:00:00.000Z", {
      baseline: 1.0,
      remoteKey: 0.8,
      detuned: 0.4,
      both: 0.2,
    });

    const points = toHistoryPoints(rows);
    expect(points).toHaveLength(1);
    expect(points[0].sessionId).toBe("s1");
    expect(points[0].totalTrials).toBe(20);
  });

  it("絶対音高への依存度を基準条件との差で求める", () => {
    const points = toHistoryPoints(
      session("s1", "2026-09-01T10:00:00.000Z", {
        baseline: 1.0,
        remoteKey: 0.9,
        detuned: 0.4,
        both: 0.3,
      }),
    );

    expect(points[0].apReliance).toBeCloseTo(60, 5); // 100 - 40
    expect(points[0].keyDependency).toBeCloseTo(10, 5); // 100 - 90
  });

  it("反応時間の遅れを求める", () => {
    const points = toHistoryPoints(
      session(
        "s1",
        "2026-09-01T10:00:00.000Z",
        { baseline: 1, remoteKey: 1, detuned: 1, both: 1 },
        { baseline: 900, detuned: 1700 },
      ),
    );
    expect(points[0].rtPenaltyMs).toBeCloseTo(800, 5);
  });

  /**
   * 推移として読ませるには時系列順でなければならない。
   * 取得順に依存すると、グラフが前後して意味をなさなくなる。
   */
  it("古い順に並べ替える", () => {
    const rows = [
      ...session("s3", "2026-09-10T10:00:00.000Z", {
        baseline: 1,
        remoteKey: 1,
        detuned: 1,
        both: 1,
      }),
      ...session("s1", "2026-09-01T10:00:00.000Z", {
        baseline: 1,
        remoteKey: 1,
        detuned: 1,
        both: 1,
      }),
      ...session("s2", "2026-09-05T10:00:00.000Z", {
        baseline: 1,
        remoteKey: 1,
        detuned: 1,
        both: 1,
      }),
    ];

    expect(toHistoryPoints(rows).map((p) => p.sessionId)).toEqual([
      "s1",
      "s2",
      "s3",
    ]);
  });

  it("複数セッションを取り違えずに集計する", () => {
    const rows = [
      ...session("s1", "2026-09-01T10:00:00.000Z", {
        baseline: 1.0,
        remoteKey: 1.0,
        detuned: 0.4,
        both: 0.4,
      }),
      ...session("s2", "2026-09-08T10:00:00.000Z", {
        baseline: 1.0,
        remoteKey: 1.0,
        detuned: 0.8,
        both: 0.8,
      }),
    ];

    const points = toHistoryPoints(rows);
    expect(points[0].apReliance).toBeCloseTo(60, 5);
    expect(points[1].apReliance).toBeCloseTo(20, 5);
  });

  it("条件が欠けていても壊れない", () => {
    const rows: ConditionSummaryRow[] = [
      {
        session_id: "s1",
        condition: "baseline",
        trials: 5,
        correct: 5,
        accuracy: 1,
        median_rt_ms: 900,
        started_at: "2026-09-01T10:00:00.000Z",
      },
    ];

    const points = toHistoryPoints(rows);
    expect(points).toHaveLength(1);
    expect(Number.isNaN(points[0].apReliance)).toBe(false);
  });

  it("行が空なら空の配列を返す", () => {
    expect(toHistoryPoints([])).toEqual([]);
  });
});

describe("summarizeHistory", () => {
  const points = toHistoryPoints([
    ...session("s1", "2026-09-01T10:00:00.000Z", {
      baseline: 1.0,
      remoteKey: 1.0,
      detuned: 0.4,
      both: 0.4,
    }),
    ...session("s2", "2026-09-08T10:00:00.000Z", {
      baseline: 1.0,
      remoteKey: 1.0,
      detuned: 0.8,
      both: 0.8,
    }),
  ]);

  it("回数と総試行数を数える", () => {
    const summary = summarizeHistory(points);
    expect(summary.totalSessions).toBe(2);
    expect(summary.totalTrials).toBe(40);
  });

  /**
   * 依存度が下がることが訓練の成功を意味するため、変化は負の値になるのが
   * 望ましい方向。符号の扱いを取り違えると結論が逆になる。
   */
  it("依存度の減少を負の変化として表す", () => {
    const summary = summarizeHistory(points);
    expect(summary.firstApReliance).toBeCloseTo(60, 5);
    expect(summary.latestApReliance).toBeCloseTo(20, 5);
    expect(summary.change).toBeCloseTo(-40, 5);
  });

  it("1回だけでは変化を出さない", () => {
    const single = toHistoryPoints(
      session("s1", "2026-09-01T10:00:00.000Z", {
        baseline: 1,
        remoteKey: 1,
        detuned: 0.5,
        both: 0.5,
      }),
    );
    const summary = summarizeHistory(single);

    expect(summary.totalSessions).toBe(1);
    expect(summary.change).toBeNull(); // 比べる相手がない
    expect(summary.firstApReliance).not.toBeNull();
  });

  it("記録がなければすべて空として扱う", () => {
    const summary = summarizeHistory([]);
    expect(summary.totalSessions).toBe(0);
    expect(summary.totalTrials).toBe(0);
    expect(summary.change).toBeNull();
    expect(summary.firstApReliance).toBeNull();
    expect(summary.activeDays).toBe(0);
  });

  it("同じ日の複数回を1日と数える", () => {
    const sameDay = toHistoryPoints([
      ...session("s1", "2026-09-01T09:00:00.000Z", {
        baseline: 1,
        remoteKey: 1,
        detuned: 1,
        both: 1,
      }),
      ...session("s2", "2026-09-01T21:00:00.000Z", {
        baseline: 1,
        remoteKey: 1,
        detuned: 1,
        both: 1,
      }),
      ...session("s3", "2026-09-02T09:00:00.000Z", {
        baseline: 1,
        remoteKey: 1,
        detuned: 1,
        both: 1,
      }),
    ]);

    const summary = summarizeHistory(sameDay);
    expect(summary.totalSessions).toBe(3);
    expect(summary.activeDays).toBe(2); // 継続の指標は日数で見る
  });
});

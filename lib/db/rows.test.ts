import { describe, it, expect } from "vitest";
import { toProfileRow, toSessionRow, toTrialRows } from "./rows";
import type { TrialRecord } from "@/lib/training/analysis";
import type { ParticipantProfile } from "@/lib/training/profile";
import { generatePracticeTrials } from "@/lib/training/trial";

const PARTICIPANT = "11111111-2222-3333-4444-555555555555";
const SESSION = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

const profile: ParticipantProfile = {
  absolutePitch: "yes",
  trainingYears: "10+",
  primaryInstrument: "piano",
  solfegeSystem: "fixed",
  createdAt: "2026-09-01T00:00:00.000Z",
};

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
    rtMs: 1234.5,
    presentedAt: "2026-09-05T10:00:00.000Z",
    ...overrides,
  };
}

describe("toProfileRow", () => {
  it("自己申告をスネークケースの列に写す", () => {
    const row = toProfileRow(
      profile,
      PARTICIPANT,
      new Date("2026-09-05T12:00:00.000Z"),
    );

    expect(row).toEqual({
      id: PARTICIPANT,
      absolute_pitch: "yes",
      training_years: "10+",
      primary_instrument: "piano",
      solfege_system: "fixed",
      updated_at: "2026-09-05T12:00:00.000Z",
    });
  });

  it("すべての自己申告項目を落とさず持っていく", () => {
    const row = toProfileRow(profile, PARTICIPANT);

    // 群分けに使う項目が欠けると、あとから被験者間比較ができなくなる
    expect(row.absolute_pitch).toBeDefined();
    expect(row.solfege_system).toBeDefined();
    expect(row.training_years).toBeDefined();
    expect(row.primary_instrument).toBeDefined();
  });
});

describe("toSessionRow", () => {
  it("最初に提示された時刻を開始時刻とする", () => {
    const records = [
      record({ presentedAt: "2026-09-05T10:05:00.000Z" }),
      record({ presentedAt: "2026-09-05T10:00:00.000Z" }), // こちらが最古
      record({ presentedAt: "2026-09-05T10:03:00.000Z" }),
    ];

    const row = toSessionRow(SESSION, PARTICIPANT, records, 1);
    expect(row.started_at).toBe("2026-09-05T10:00:00.000Z");
  });

  it("プロトコル版を記録する", () => {
    const row = toSessionRow(SESSION, PARTICIPANT, [record()], 3);
    expect(row.app_version).toBe("protocol-3");
  });

  it("記録が空でも壊れない", () => {
    const completedAt = new Date("2026-09-05T11:00:00.000Z");
    const row = toSessionRow(SESSION, PARTICIPANT, [], 1, completedAt);

    expect(row.started_at).toBe("2026-09-05T11:00:00.000Z");
    expect(row.completed_at).toBe("2026-09-05T11:00:00.000Z");
  });

  it("診断モードとして記録する", () => {
    expect(toSessionRow(SESSION, PARTICIPANT, [record()], 1).mode).toBe(
      "diagnostic",
    );
  });
});

describe("toTrialRows", () => {
  it("1問1行に変換する", () => {
    const records = [record(), record(), record()];
    expect(toTrialRows(records, SESSION, PARTICIPANT)).toHaveLength(3);
  });

  it("出題順を保存する", () => {
    const records = [record(), record(), record()];
    const rows = toTrialRows(records, SESSION, PARTICIPANT);

    // 順序効果の検定に必要なので、並び順の情報を落としてはいけない
    expect(rows.map((r) => r.trial_index)).toEqual([0, 1, 2]);
  });

  /**
   * 条件を識別する列がそろっていることが、この設計の生命線。
   * ここが欠けると、貯めたデータから条件別の差を取り出せなくなる。
   */
  it("実験条件を識別する列をすべて持つ", () => {
    const [row] = toTrialRows(
      [
        record({
          condition: "both",
          keyTonic: "F#",
          keyDistance: 6,
          detuneCents: -50,
        }),
      ],
      SESSION,
      PARTICIPANT,
    );

    expect(row.condition).toBe("both");
    expect(row.key_tonic).toBe("F#");
    expect(row.key_distance).toBe(6);
    expect(row.detune_cents).toBe(-50);
  });

  it("回答と反応時間を欠けなく写す", () => {
    const [row] = toTrialRows(
      [
        record({
          correctDegree: 5,
          answeredDegree: 2,
          isCorrect: false,
          rtMs: 2345.6,
        }),
      ],
      SESSION,
      PARTICIPANT,
    );

    expect(row.correct_degree).toBe(5);
    expect(row.answered_degree).toBe(2);
    expect(row.is_correct).toBe(false);
    expect(row.rt_ms).toBe(2345.6);
  });

  it("すべての行に同じセッションと参加者を紐づける", () => {
    const rows = toTrialRows([record(), record()], SESSION, PARTICIPANT);

    for (const row of rows) {
      expect(row.session_id).toBe(SESSION);
      expect(row.participant_id).toBe(PARTICIPANT);
    }
  });

  it("課題を渡せば刺激の内容も保存する", () => {
    const trials = generatePracticeTrials();
    const rows = toTrialRows(
      [record(), record()],
      SESSION,
      PARTICIPANT,
      trials,
    );

    expect(rows[0].stimulus).toEqual(trials[0].events);
    expect(rows[1].stimulus).toEqual(trials[1].events);
  });

  it("課題を渡さなければ刺激は null にする", () => {
    const [row] = toTrialRows([record()], SESSION, PARTICIPANT);
    expect(row.stimulus).toBeNull();
  });

  it("記録が空なら空の配列を返す", () => {
    expect(toTrialRows([], SESSION, PARTICIPANT)).toEqual([]);
  });
});

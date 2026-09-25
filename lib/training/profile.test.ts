import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  PROFILE_QUESTIONS,
  isProfileComplete,
  finalizeProfile,
  loadStoredProfile,
  storeProfile,
  type ParticipantProfile,
  type PartialProfile,
} from "./profile";

const completeDraft: PartialProfile = {
  absolutePitch: "yes",
  trainingYears: "10+",
  primaryInstrument: "piano",
  solfegeSystem: "fixed",
};

/** localStorage を差し替える。Node環境には存在しないため。 */
function installLocalStorage(impl?: Partial<Storage>) {
  const store = new Map<string, string>();
  const mock: Storage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => void store.set(key, value),
    removeItem: (key) => void store.delete(key),
    clear: () => store.clear(),
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
    ...impl,
  };
  vi.stubGlobal("localStorage", mock);
  return mock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("設問の定義", () => {
  it("4つの設問がある", () => {
    expect(PROFILE_QUESTIONS).toHaveLength(4);
  });

  it("各設問に2つ以上の選択肢がある", () => {
    for (const question of PROFILE_QUESTIONS) {
      expect(question.options.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("選択肢の値が設問内で重複しない", () => {
    for (const question of PROFILE_QUESTIONS) {
      const values = question.options.map((o) => o.value);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  /**
   * 絶対音感の有無は被験者間比較の主要な説明変数。
   * 「わからない」を用意しておかないと、確信のない人が
   * どちらかに寄ってしまい群分けが濁る。
   */
  it("絶対音感の設問に断定を避ける選択肢がある", () => {
    const question = PROFILE_QUESTIONS.find(
      (q) => q.key === "absolutePitch",
    )!;
    const values = question.options.map((o) => o.value);
    expect(values).toContain("unsure");
    expect(values).toContain("probably");
  });

  it("固定ドと移動ドを区別して記録する", () => {
    const question = PROFILE_QUESTIONS.find((q) => q.key === "solfegeSystem")!;
    const values = question.options.map((o) => o.value);
    expect(values).toContain("fixed");
    expect(values).toContain("movable");
  });

  /**
   * 専門用語を知らないと答えられない設問は、回答者を選んでしまう。
   * 実際、絶対音感を持つ経験者でも「固定ド/移動ド」という語には
   * 馴染みがなかった。設問は用語ではなく振る舞いを聞く形にしてある。
   */
  it("設問文と選択肢に専門用語を使わない", () => {
    const jargon = ["固定ド", "移動ド", "階名", "音度", "ソルフェージュ"];

    for (const question of PROFILE_QUESTIONS) {
      const visibleText = [
        question.label,
        question.hint,
        ...question.options.map((o) => o.label),
      ].join(" ");

      for (const term of jargon) {
        expect(
          visibleText,
          `設問「${question.label}」に専門用語「${term}」が含まれている`,
        ).not.toContain(term);
      }
    }
  });
});

describe("isProfileComplete", () => {
  it("すべて回答済みなら true", () => {
    expect(isProfileComplete(completeDraft)).toBe(true);
  });

  it("空の回答なら false", () => {
    expect(isProfileComplete({})).toBe(false);
  });

  it("設問がひとつでも欠けていれば false", () => {
    for (const question of PROFILE_QUESTIONS) {
      const partial = { ...completeDraft };
      delete partial[question.key];
      expect(isProfileComplete(partial), `${question.key} 未回答`).toBe(false);
    }
  });
});

describe("finalizeProfile", () => {
  it("作成時刻を付けて確定する", () => {
    const now = new Date("2026-09-05T12:00:00.000Z");
    const profile = finalizeProfile(completeDraft, now);

    expect(profile.createdAt).toBe("2026-09-05T12:00:00.000Z");
    expect(profile.absolutePitch).toBe("yes");
  });

  it("未回答があれば拒否する", () => {
    expect(() => finalizeProfile({ absolutePitch: "yes" })).toThrow();
  });
});

describe("保存と読み出し", () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it("保存したプロフィールを読み戻せる", () => {
    const profile = finalizeProfile(completeDraft);
    storeProfile(profile);
    expect(loadStoredProfile()).toEqual(profile);
  });

  it("何も保存されていなければ null を返す", () => {
    expect(loadStoredProfile()).toBeNull();
  });

  it("壊れたJSONを読んでも例外を投げない", () => {
    localStorage.setItem("perfect-gap.profile", "{壊れている");
    expect(loadStoredProfile()).toBeNull();
  });

  it("項目が欠けた保存内容を拒否する", () => {
    localStorage.setItem(
      "perfect-gap.profile",
      JSON.stringify({ absolutePitch: "yes", createdAt: "2026-01-01" }),
    );
    expect(loadStoredProfile()).toBeNull();
  });

  it("選択肢にない値が入っていれば拒否する", () => {
    localStorage.setItem(
      "perfect-gap.profile",
      JSON.stringify({
        ...completeDraft,
        absolutePitch: "でたらめ",
        createdAt: "2026-01-01",
      } satisfies Record<string, unknown>),
    );
    expect(loadStoredProfile()).toBeNull();
  });

  /**
   * プライベートブラウジングなどで localStorage が例外を投げる環境がある。
   * 保存できないことを理由に診断が始められないのは困る。
   */
  it("localStorage が例外を投げても落ちない", () => {
    installLocalStorage({
      getItem: () => {
        throw new Error("アクセスが拒否されました");
      },
      setItem: () => {
        throw new Error("アクセスが拒否されました");
      },
    });

    expect(() => loadStoredProfile()).not.toThrow();
    expect(loadStoredProfile()).toBeNull();

    const profile = finalizeProfile(completeDraft);
    expect(() => storeProfile(profile)).not.toThrow();
  });
});

describe("型の対応", () => {
  it("確定したプロフィールがすべての設問の項目を持つ", () => {
    const profile: ParticipantProfile = finalizeProfile(completeDraft);
    for (const question of PROFILE_QUESTIONS) {
      expect(profile[question.key]).toBeDefined();
    }
  });
});

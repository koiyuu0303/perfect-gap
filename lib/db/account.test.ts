import { describe, it, expect } from "vitest";
import {
  isPlausibleEmail,
  identityFromUser,
  translateAuthError,
} from "./account";

describe("isPlausibleEmail", () => {
  it("一般的なアドレスを受け入れる", () => {
    for (const value of [
      "koiyuu0303@icloud.com",
      "a@b.co",
      "first.last+tag@example.co.jp",
      "user_name@sub.domain.org",
    ]) {
      expect(isPlausibleEmail(value), value).toBe(true);
    }
  });

  it("前後の空白を許容する", () => {
    expect(isPlausibleEmail("  user@example.com  ")).toBe(true);
  });

  it("明らかな入力ミスを弾く", () => {
    for (const value of [
      "",
      "   ",
      "user",
      "user@",
      "@example.com",
      "user@example", // ドメインにドットがない
      "user@@example.com",
      "user name@example.com", // 空白を含む
      "user@.com",
      "user@example.",
      "user@exa..mple.com",
    ]) {
      expect(isPlausibleEmail(value), value).toBe(false);
    }
  });

  it("極端に長い入力を弾く", () => {
    expect(isPlausibleEmail("a".repeat(250) + "@example.com")).toBe(false);
  });
});

describe("identityFromUser", () => {
  it("未ログインを none とする", () => {
    expect(identityFromUser(null)).toEqual({ kind: "none" });
  });

  it("匿名ユーザーを anonymous とする", () => {
    expect(
      identityFromUser({ id: "u1", is_anonymous: true, email: null }),
    ).toEqual({ kind: "anonymous", participantId: "u1" });
  });

  it("メール未設定なら匿名として扱う", () => {
    expect(identityFromUser({ id: "u1" })).toEqual({
      kind: "anonymous",
      participantId: "u1",
    });
  });

  it("メール紐づけ済みを linked とする", () => {
    expect(
      identityFromUser({
        id: "u1",
        email: "a@example.com",
        is_anonymous: false,
      }),
    ).toEqual({
      kind: "linked",
      participantId: "u1",
      email: "a@example.com",
    });
  });

  /**
   * 確認メールを送った直後の状態。まだ紐づけは完了していないので、
   * 利用者には「確認待ち」と伝える必要がある。完了扱いにすると、
   * リンクを踏まないまま安心されてしまう。
   */
  it("確認待ちを pending とする", () => {
    expect(
      identityFromUser({
        id: "u1",
        email: null,
        is_anonymous: true,
        new_email: "new@example.com",
      }),
    ).toEqual({
      kind: "pending",
      participantId: "u1",
      email: "new@example.com",
    });
  });

  it("参加者IDを常に保つ", () => {
    // IDが変わると過去の記録との紐づけが切れるため、
    // どの状態でも同じIDが返ることが重要
    const cases = [
      { id: "same-id", is_anonymous: true },
      { id: "same-id", email: "a@example.com", is_anonymous: false },
      { id: "same-id", new_email: "b@example.com" },
    ];

    for (const user of cases) {
      const identity = identityFromUser(user);
      if (identity.kind !== "none" && identity.kind !== "unconfigured") {
        expect(identity.participantId).toBe("same-id");
      }
    }
  });
});

describe("translateAuthError", () => {
  it("登録済みアドレスに対し、進むべき操作を案内する", () => {
    const message = translateAuthError("Email address already registered");
    expect(message).toContain("別の端末から続ける");
  });

  it("未登録アドレスに対し、先にすべきことを案内する", () => {
    const message = translateAuthError("Signups not allowed for otp");
    expect(message).toContain("登録されていません");
  });

  it("送信回数の制限を分かるように伝える", () => {
    expect(translateAuthError("Email rate limit exceeded")).toContain(
      "しばらく待って",
    );
  });

  it("未知のエラーでも原文を添えて返す", () => {
    const message = translateAuthError("Some unexpected failure");
    expect(message).toContain("Some unexpected failure");
  });

  it("英語をそのまま見せない", () => {
    // 既知のエラーは日本語だけで完結させる
    for (const raw of [
      "Email address already registered",
      "User not found",
      "Email rate limit exceeded",
      "Invalid email",
    ]) {
      expect(translateAuthError(raw)).not.toBe(raw);
    }
  });
});

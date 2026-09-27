/**
 * 参加者の身元の管理。
 *
 * 既定では匿名ログインを使う。登録を求めないことが、協力者を集める上で
 * 最も効く配慮だからだ。しかし匿名の認証情報はブラウザにしか存在せず、
 * データを消すと過去の記録との紐づけが永久に切れる。
 *
 * 数ヶ月かけて積む縦断データが本プロジェクトの主成果物である以上、
 * これは許容できない弱点になる。そこでメールアドレスを紐づけて
 * 恒久アカウントへ昇格できるようにし、別の端末からも同じ身元で
 * 戻ってこられるようにする。
 */

import { getSupabaseClient, authCallbackUrl, isDatabaseConfigured } from "./client";

/** 現在の身元。 */
export type Identity =
  | { kind: "unconfigured" }
  | { kind: "none" }
  | { kind: "anonymous"; participantId: string }
  | { kind: "linked"; participantId: string; email: string }
  | { kind: "pending"; participantId: string; email: string };

/** 認証操作の結果。例外ではなく値で返し、UIが素直に分岐できるようにする。 */
export type AuthResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

/**
 * メールアドレスとして妥当か。
 *
 * 厳密な検証は行わない。RFCに忠実な正規表現は実用上の誤判定が多く、
 * 最終的な正しさは確認メールが届くかどうかでしか判定できない。
 * ここでは明らかな入力ミスを弾くことだけを目的とする。
 */
export function isPlausibleEmail(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  if (/\s/.test(trimmed)) return false;

  const parts = trimmed.split("@");
  if (parts.length !== 2) return false;

  const [local, domain] = parts;
  if (local.length === 0 || domain.length === 0) return false;
  if (!domain.includes(".")) return false;
  if (domain.startsWith(".") || domain.endsWith(".")) return false;
  if (domain.includes("..")) return false;

  return true;
}

/** Supabase のユーザー情報から身元を決める。 */
export function identityFromUser(
  user: {
    id: string;
    email?: string | null;
    is_anonymous?: boolean;
    new_email?: string | null;
  } | null,
): Identity {
  if (!user) return { kind: "none" };

  // 変更確認の途中。新しいアドレスはまだ有効になっていない。
  if (user.new_email) {
    return {
      kind: "pending",
      participantId: user.id,
      email: user.new_email,
    };
  }

  if (user.is_anonymous || !user.email) {
    return { kind: "anonymous", participantId: user.id };
  }

  return { kind: "linked", participantId: user.id, email: user.email };
}

/** 現在の身元を取得する。 */
export async function getIdentity(): Promise<Identity> {
  if (!isDatabaseConfigured) return { kind: "unconfigured" };

  const supabase = getSupabaseClient();
  if (!supabase) return { kind: "unconfigured" };

  const { data } = await supabase.auth.getUser();
  return identityFromUser(data.user);
}

/**
 * 匿名アカウントにメールアドレスを紐づけて恒久化する。
 *
 * 確認メールのリンクを踏むまで完了しない。踏むまでは元の匿名のまま
 * 使い続けられるので、途中で放置されても記録は失われない。
 */
export async function linkEmail(email: string): Promise<AuthResult> {
  if (!isPlausibleEmail(email)) {
    return { ok: false, message: "メールアドレスの形式を確認してください。" };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false, message: "データベースが設定されていません。" };
  }

  const { error } = await supabase.auth.updateUser(
    { email: email.trim() },
    { emailRedirectTo: authCallbackUrl() },
  );

  if (error) {
    return { ok: false, message: translateAuthError(error.message) };
  }

  return {
    ok: true,
    message: `${email.trim()} に確認メールを送りました。記載のリンクを開くと紐づけが完了します。`,
  };
}

/**
 * 登録済みのメールアドレスでログインし、過去の記録に戻る。
 *
 * 新規アカウントは作らない。未登録のアドレスを入れた人に空の
 * アカウントを与えても混乱するだけで、記録は戻ってこないため。
 */
export async function signInWithEmail(email: string): Promise<AuthResult> {
  if (!isPlausibleEmail(email)) {
    return { ok: false, message: "メールアドレスの形式を確認してください。" };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false, message: "データベースが設定されていません。" };
  }

  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: {
      emailRedirectTo: authCallbackUrl(),
      shouldCreateUser: false,
    },
  });

  if (error) {
    return { ok: false, message: translateAuthError(error.message) };
  }

  return {
    ok: true,
    message: `${email.trim()} にログイン用のリンクを送りました。`,
  };
}

/** ログアウトする。 */
export async function signOut(): Promise<AuthResult> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { ok: false, message: "データベースが設定されていません。" };
  }

  const { error } = await supabase.auth.signOut();
  if (error) {
    return { ok: false, message: translateAuthError(error.message) };
  }

  return { ok: true, message: "ログアウトしました。" };
}

/**
 * Supabase のエラー文を日本語にする。
 *
 * 利用者に英語の内部メッセージをそのまま見せない。特に「どうすれば
 * 解決するか」が伝わる文言にすることを優先している。
 */
export function translateAuthError(message: string): string {
  const lowered = message.toLowerCase();

  if (lowered.includes("already registered") || lowered.includes("already been registered")) {
    return "このメールアドレスは既に使われています。「別の端末から続ける」からログインしてください。";
  }
  if (lowered.includes("signups not allowed") || lowered.includes("user not found")) {
    return "このメールアドレスは登録されていません。先にこの端末で紐づけを行ってください。";
  }
  if (lowered.includes("rate limit") || lowered.includes("too many")) {
    return "短時間に何度も送信されました。しばらく待ってから再度お試しください。";
  }
  if (lowered.includes("invalid email")) {
    return "メールアドレスの形式を確認してください。";
  }

  return `処理できませんでした（${message}）`;
}

/**
 * 診断結果をデータベースへ保存する。
 *
 * 保存の失敗が結果表示を妨げてはいけない。回答し終えた利用者にとって
 * 見たいのは結果であって、通信の成否ではない。したがってここでは
 * 例外を投げず、状態を値として返す。
 */

import { getSupabaseClient, isDatabaseConfigured } from "./client";
import { toProfileRow, toSessionRow, toTrialRows } from "./rows";
import { TRIAL_PROTOCOL_VERSION } from "@/lib/config";
import type { TrialRecord } from "@/lib/training/analysis";
import type { ParticipantProfile } from "@/lib/training/profile";
import type { Trial } from "@/lib/training/trial";

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "skipped"; reason: string }
  | { kind: "saved"; sessionId: string }
  | { kind: "failed"; message: string };

export interface SaveInput {
  records: TrialRecord[];
  profile: ParticipantProfile | null;
  trials?: Trial[];
}

/**
 * 匿名ログインして参加者IDを得る。
 *
 * 登録を求めないのは、協力者を集める上で入力の手間が最大の障壁になるため。
 * 匿名ログインでも端末ごとに一意のIDが割り当てられ、認証情報が
 * 端末に保存されるので、同じ端末からの再訪は同一人物として繋がる。
 *
 * 逆に言えば、ブラウザのデータを消すと過去の記録との紐づけが切れる。
 * 縦断データを積む本人にとってはここが弱点なので、将来的には
 * メールアドレスを紐づけて恒久アカウントへ昇格できるようにしたい。
 */
async function ensureParticipantId(): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("データベースが設定されていません");

  const { data: existing } = await supabase.auth.getSession();
  if (existing.session?.user.id) {
    return existing.session.user.id;
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  if (!data.user?.id) throw new Error("参加者IDを取得できませんでした");

  return data.user.id;
}

/**
 * 診断1回分(自己申告・セッション・全回答)を保存する。
 *
 * 回答は最後にまとめて1回で挿入する。1問ごとに通信すると、
 * 途中の失敗で歯抜けのデータが残り、条件ごとの試行数が
 * 揃わなくなって分析が歪む。
 */
export async function saveDiagnosticSession(
  input: SaveInput,
): Promise<SaveStatus> {
  if (!isDatabaseConfigured) {
    return {
      kind: "skipped",
      reason: "データベースが未設定のため、結果はこの画面のみに表示されます。",
    };
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return { kind: "skipped", reason: "データベースに接続できません。" };
  }

  if (input.records.length === 0) {
    return { kind: "skipped", reason: "保存する回答がありません。" };
  }

  try {
    const participantId = await ensureParticipantId();
    const sessionId = crypto.randomUUID();

    if (input.profile) {
      const { error } = await supabase
        .from("profiles")
        .upsert(toProfileRow(input.profile, participantId));
      if (error) throw error;
    }

    const { error: sessionError } = await supabase
      .from("sessions")
      .insert(
        toSessionRow(
          sessionId,
          participantId,
          input.records,
          TRIAL_PROTOCOL_VERSION,
        ),
      );
    if (sessionError) throw sessionError;

    const { error: trialsError } = await supabase
      .from("trials")
      .insert(
        toTrialRows(input.records, sessionId, participantId, input.trials),
      );
    if (trialsError) throw trialsError;

    return { kind: "saved", sessionId };
  } catch (cause) {
    return {
      kind: "failed",
      message: cause instanceof Error ? cause.message : "保存に失敗しました。",
    };
  }
}

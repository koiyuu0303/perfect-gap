/**
 * Supabase クライアント。
 *
 * 環境変数が設定されていなくてもアプリ全体が動くようにしている。
 * 診断そのものはブラウザだけで完結するので、データベースは
 * 「あれば記録が残る」という位置づけに留め、必須にしない。
 *
 * こうしておくと、設定前でも開発と動作確認を進められるし、
 * 公開後に一時的にデータベースが落ちても診断は使い続けられる。
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** データベースへの接続情報がそろっているか。 */
export const isDatabaseConfigured = Boolean(url && anonKey);

let cachedClient: SupabaseClient | null = null;

/**
 * クライアントを返す。未設定なら null。
 *
 * 認証セッションは端末に保存する。匿名ログインで得た参加者IDが
 * 次回以降も同じになるため、同一人物の記録として繋がる。
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (!url || !anonKey) return null;

  if (!cachedClient) {
    cachedClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // メール内のリンクから戻ってきたとき、URLに含まれる認証情報を
        // 自動で処理してセッションを確立する。端末をまたいだ復帰に必須。
        detectSessionInUrl: true,
        flowType: "pkce",
      },
    });
  }

  return cachedClient;
}

/**
 * メールのリンクから戻る先。
 *
 * 実行時の origin から組み立てる。開発環境(localhost)と本番(vercel.app)で
 * 別々に設定を持つ必要がなくなり、設定漏れによる「リンクを踏んでも
 * 戻ってこない」という分かりにくい不具合を防げる。
 */
export function authCallbackUrl(): string {
  return `${window.location.origin}/auth/callback`;
}

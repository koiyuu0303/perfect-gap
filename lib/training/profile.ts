/**
 * 参加者の自己申告情報。
 *
 * データベースの profiles テーブルにそのまま対応する。
 *
 * 協力者を募って被験者間で比較する際、これが対照群を切り分ける唯一の手段になる。
 * 特に「絶対音感の有無」は主要な説明変数で、理論上は
 * 非保持者はデチューンでほとんど成績が落ちないはずであり、
 * それが確認できれば指標そのものの妥当性の裏付けになる。
 */

export type AbsolutePitchClaim = "yes" | "probably" | "no" | "unsure";
export type TrainingYears = "0" | "1-3" | "4-9" | "10+";
export type PrimaryInstrument =
  | "piano"
  | "strings"
  | "winds"
  | "voice"
  | "other"
  | "none";
export type SolfegeSystem = "fixed" | "movable" | "both" | "unsure";

export interface ParticipantProfile {
  absolutePitch: AbsolutePitchClaim;
  trainingYears: TrainingYears;
  primaryInstrument: PrimaryInstrument;
  /**
   * 「ドレミ」を固定ドと移動ドのどちらで習ったか。
   *
   * 日本の音楽教育では固定ド(ド=C)が主流で、その場合ドレミは音名として
   * 機能する。移動ドで育った人は音度で聴く習慣が既にあるため、
   * 絶対音感の有無とは別に成績を左右する可能性が高い。
   * 交絡因子になりうるので必ず記録する。
   */
  solfegeSystem: SolfegeSystem;
  createdAt: string;
}

/** 選択肢の定義。フォームの描画と検証の両方がこれを参照する。 */
export const PROFILE_QUESTIONS = [
  {
    key: "absolutePitch" as const,
    label: "絶対音感はありますか？",
    hint: "単音を聴いて、基準音なしに音名が分かるかどうか",
    options: [
      { value: "yes" as const, label: "ある" },
      { value: "probably" as const, label: "たぶんある" },
      { value: "no" as const, label: "ない" },
      { value: "unsure" as const, label: "わからない" },
    ],
  },
  {
    key: "trainingYears" as const,
    label: "音楽の経験年数",
    hint: "楽器・歌など、継続的に取り組んだ年数",
    options: [
      { value: "0" as const, label: "なし" },
      { value: "1-3" as const, label: "1〜3年" },
      { value: "4-9" as const, label: "4〜9年" },
      { value: "10+" as const, label: "10年以上" },
    ],
  },
  {
    key: "primaryInstrument" as const,
    label: "主な楽器",
    hint: "最も長く取り組んだもの",
    options: [
      { value: "piano" as const, label: "ピアノ・鍵盤" },
      { value: "strings" as const, label: "弦楽器" },
      { value: "winds" as const, label: "管楽器" },
      { value: "voice" as const, label: "歌" },
      { value: "other" as const, label: "その他" },
      { value: "none" as const, label: "なし" },
    ],
  },
  /*
   * 「固定ドと移動ドのどちらで習ったか」を直接聞くと、用語を知らない人が
   * 答えられない。実際、絶対音感を持ちピアノ経験のある人でも
   * この用語には馴染みがなかった。
   *
   * そこで用語を使わず、具体的な場面での振る舞いを聞く形にしている。
   * ニ長調の主音(D)を「レ」と呼ぶか「ド」と呼ぶかで、
   * 音名として使っているか音度として使っているかが一意に分かれる。
   */
  {
    key: "solfegeSystem" as const,
    label: "「ドレミ」で音階を歌うとき、ニ長調はどこから始めますか？",
    hint: "ニ長調は、ピアノの白鍵の「レ」の音から始まる音階です",
    options: [
      { value: "fixed" as const, label: "「レ」から歌う" },
      { value: "movable" as const, label: "「ド」から歌う" },
      { value: "both" as const, label: "どちらもある" },
      { value: "unsure" as const, label: "歌ったことがない" },
    ],
  },
] as const;

/** 回答途中の状態。すべて未選択から始まる。 */
export type PartialProfile = Partial<
  Omit<ParticipantProfile, "createdAt">
>;

/** すべての設問に回答済みかどうか。 */
export function isProfileComplete(
  draft: PartialProfile,
): draft is Omit<ParticipantProfile, "createdAt"> {
  return PROFILE_QUESTIONS.every((question) => draft[question.key] != null);
}

/** 回答から保存用のプロフィールを作る。 */
export function finalizeProfile(
  draft: PartialProfile,
  now: Date = new Date(),
): ParticipantProfile {
  if (!isProfileComplete(draft)) {
    throw new Error("未回答の設問があります。");
  }
  return { ...draft, createdAt: now.toISOString() };
}

const STORAGE_KEY = "perfect-gap.profile";

/**
 * 保存されたプロフィールを読む。
 *
 * localStorage はプライベートモードや設定によって例外を投げることがあるため、
 * 失敗しても null を返してアプリが動き続けるようにする。
 * 保存された内容が壊れている場合も同様に扱う。
 */
export function loadStoredProfile(): ParticipantProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    if (!isStoredProfile(parsed)) return null;

    return parsed;
  } catch {
    return null;
  }
}

/** プロフィールを保存する。失敗しても呼び出し側を止めない。 */
export function storeProfile(profile: ParticipantProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // 保存できなくても診断そのものは続行できる
  }
}

/** 保存された値が期待する形をしているか確かめる。 */
function isStoredProfile(value: unknown): value is ParticipantProfile {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Record<string, unknown>;

  const hasValidAnswers = PROFILE_QUESTIONS.every((question) => {
    const answer = candidate[question.key];
    return question.options.some((option) => option.value === answer);
  });

  return hasValidAnswers && typeof candidate.createdAt === "string";
}

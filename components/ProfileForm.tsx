"use client";

import { useState } from "react";
import {
  PROFILE_QUESTIONS,
  isProfileComplete,
  finalizeProfile,
  type ParticipantProfile,
  type PartialProfile,
} from "@/lib/training/profile";

/**
 * 参加者の自己申告フォーム。
 *
 * 協力者を募って比較する際、ここが対照群を切り分ける唯一の手段になる。
 * 特に「絶対音感の有無」は主要な説明変数であり、
 * 非保持者がデチューンで成績を落とさないことが確認できれば、
 * 指標そのものの妥当性の裏付けになる。
 */
export function ProfileForm({
  initial,
  onComplete,
}: {
  initial?: ParticipantProfile | null;
  onComplete: (profile: ParticipantProfile) => void;
}) {
  const [draft, setDraft] = useState<PartialProfile>(() =>
    initial
      ? {
          absolutePitch: initial.absolutePitch,
          trainingYears: initial.trainingYears,
          primaryInstrument: initial.primaryInstrument,
          solfegeSystem: initial.solfegeSystem,
        }
      : {},
  );

  const complete = isProfileComplete(draft);

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col gap-6">
      <div className="rounded-xl border border-border bg-surface p-6 sm:p-8 flex flex-col gap-7">
        <header className="flex flex-col gap-2">
          <h2 className="text-xl font-semibold">はじめに、あなたについて</h2>
          <p className="text-sm text-muted leading-relaxed">
            結果の解釈と、参加者どうしの比較に使います。
            正確さより、当てはまると感じるものを選んでください。
          </p>
        </header>

        {PROFILE_QUESTIONS.map((question) => (
          <fieldset key={question.key} className="flex flex-col gap-3">
            <legend className="flex flex-col gap-1">
              <span className="text-sm font-medium">{question.label}</span>
              <span className="text-xs text-muted">{question.hint}</span>
            </legend>

            <div className="flex flex-wrap gap-2">
              {question.options.map((option) => {
                const selected = draft[question.key] === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      setDraft((previous) => ({
                        ...previous,
                        [question.key]: option.value,
                      }))
                    }
                    className={[
                      "px-4 py-2 rounded-lg border text-sm transition-colors",
                      selected
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-surface-raised hover:border-accent",
                    ].join(" ")}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}

        <button
          disabled={!complete}
          onClick={() => onComplete(finalizeProfile(draft))}
          className="px-8 py-3 rounded-lg bg-accent text-accent-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-default"
        >
          {complete ? "次へ" : "すべての項目を選んでください"}
        </button>
      </div>

      <p className="text-xs text-muted text-center leading-relaxed">
        回答はこの端末に保存され、次回以降は省略されます。
      </p>
    </div>
  );
}

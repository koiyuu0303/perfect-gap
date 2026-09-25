"use client";

/**
 * 音度の回答ボタン。練習と本番で共有する。
 *
 * 階名(Do/Re/Mi)はあえて表示しない。日本では固定ド(ド=C)で
 * 教わることが多く、階名を出すと音名として読まれて誤答を誘発する。
 * 音名で答えたくなる衝動こそがこの診断の対象なので、
 * UIがそれを助長してはいけない。
 */

const DEGREES = [1, 2, 3, 4, 5, 6, 7];

export interface RevealedAnswer {
  correctDegree: number;
  answeredDegree: number;
}

export function AnswerPad({
  disabled,
  onAnswer,
  revealed,
}: {
  disabled: boolean;
  onAnswer: (degree: number) => void;
  revealed?: RevealedAnswer | null;
}) {
  return (
    <div className="grid grid-cols-4 sm:grid-cols-7 gap-2 w-full">
      {DEGREES.map((degree) => {
        const isCorrectAnswer = revealed?.correctDegree === degree;
        const isChosenWrong =
          revealed != null &&
          revealed.answeredDegree === degree &&
          revealed.answeredDegree !== revealed.correctDegree;

        return (
          <button
            key={degree}
            disabled={disabled}
            onClick={() => onAnswer(degree)}
            className={[
              "flex flex-col items-center justify-center gap-0.5 py-4 rounded-lg border transition-colors no-select",
              "disabled:cursor-default",
              isCorrectAnswer
                ? "border-success bg-success/15 text-success"
                : isChosenWrong
                  ? "border-error bg-error/15 text-error"
                  : "border-border bg-surface-raised hover:border-accent",
            ].join(" ")}
          >
            <span className="text-xl font-semibold tabular-nums">{degree}</span>
            <span className="text-[0.6rem] text-muted h-3">
              {degree === 1 ? "主音" : ""}
            </span>
          </button>
        );
      })}
    </div>
  );
}

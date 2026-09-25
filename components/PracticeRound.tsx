"use client";

import { useCallback, useState } from "react";
import { generatePracticeTrials } from "@/lib/training/trial";
import { midiToJapaneseFixedDo } from "@/lib/music/pitch";
import { scalePatternFor } from "@/lib/music/scale";
import { useTrialPlayback } from "@/hooks/useTrialPlayback";
import { useDegreeKeyboard } from "@/hooks/useDegreeKeyboard";
import { AnswerPad } from "./AnswerPad";

/**
 * 本番前の練習。
 *
 * 目的は成績を測ることではなく、規則を先に理解してもらうこと。
 * ルールが分からないまま最初の数問を消費すると、本番の測定に
 * 「理解の途中」という雑音が混ざる。練習の回答は記録しない。
 *
 * 練習は必ずハ長調で行う。ハ長調では固定ドと移動ドが一致するため、
 * 固定ドで育った人は自分の音名の知識をそのまま使いながら
 * 「主音から数える」規則を習得できる。
 */

const PRACTICE_TRIALS = generatePracticeTrials();

export function PracticeRound({ onFinish }: { onFinish: () => void }) {
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState<number | null>(null);

  const { status, play, reset } = useTrialPlayback();
  const trial = PRACTICE_TRIALS[index];
  const isLast = index === PRACTICE_TRIALS.length - 1;

  const handleAnswer = useCallback(
    (degree: number) => {
      if (status !== "answering" || answered !== null) return;
      setAnswered(degree);
    },
    [status, answered],
  );

  useDegreeKeyboard(status === "answering" && answered === null, handleAnswer);

  const goNext = () => {
    if (isLast) {
      onFinish();
      return;
    }
    setAnswered(null);
    reset();
    setIndex((i) => i + 1);
  };

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">
          練習 {index + 1} / {PRACTICE_TRIALS.length}
        </span>
        <button
          onClick={onFinish}
          className="text-xs text-muted hover:text-foreground transition-colors underline"
        >
          練習をとばす
        </button>
      </div>

      <div className="rounded-xl border border-border bg-surface p-6 sm:p-10 flex flex-col items-center gap-7 min-h-[20rem] justify-center">
        {status === "idle" && (
          <>
            <p className="text-sm text-muted text-center leading-relaxed">
              和音でハ長調が示されたあと、単音がひとつ鳴ります。
              <br />
              その音が主音から数えて何番目かを答えてください。
            </p>
            <button
              onClick={() => play(trial)}
              className="px-8 py-3 rounded-lg bg-accent text-accent-foreground font-medium hover:opacity-90 transition-opacity"
            >
              音を聴く
            </button>
          </>
        )}

        {status === "playing" && (
          <div className="flex flex-col items-center gap-3 no-select">
            <span className="text-4xl animate-pulse-soft" aria-hidden>
              ♪
            </span>
            <span className="text-sm text-muted">再生中</span>
          </div>
        )}

        {status === "answering" && (
          <>
            <p className="text-base font-medium no-select">
              いまの音は、主音から数えて何番目？
            </p>
            <AnswerPad
              disabled={answered !== null}
              onAnswer={handleAnswer}
              revealed={
                answered !== null
                  ? {
                      correctDegree: trial.correctAnswer.degree,
                      answeredDegree: answered,
                    }
                  : null
              }
            />

            {answered !== null && (
              <PracticeExplanation
                targetMidi={trial.targetMidi}
                tonicMidi={trial.tonicMidi}
                correctDegree={trial.correctAnswer.degree}
                wasCorrect={answered === trial.correctAnswer.degree}
                onNext={goNext}
                isLast={isLast}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 音階を数字と並べて見せ、「数える」という操作を目で確認できるようにする。
 */
function PracticeExplanation({
  targetMidi,
  tonicMidi,
  correctDegree,
  wasCorrect,
  onNext,
  isLast,
}: {
  targetMidi: number;
  tonicMidi: number;
  correctDegree: number;
  wasCorrect: boolean;
  onNext: () => void;
  isLast: boolean;
}) {
  const pattern = scalePatternFor("major");
  const targetName = midiToJapaneseFixedDo(targetMidi);

  return (
    <div className="w-full flex flex-col gap-5 border-t border-border pt-6">
      <p className="text-sm text-center">
        {wasCorrect ? (
          <span className="text-success">正解です</span>
        ) : (
          <span className="text-error">
            正しくは {correctDegree} 番目でした
          </span>
        )}
      </p>

      <div className="flex flex-col gap-2">
        <p className="text-xs text-muted text-center">ハ長調の音階</p>

        <div className="grid grid-cols-7 gap-1">
          {pattern.map((semitones, i) => {
            const midi = tonicMidi + semitones;
            const isTarget = midi === targetMidi;

            return (
              <div
                key={i}
                className={[
                  "flex flex-col items-center gap-1 py-2 rounded-lg border",
                  isTarget
                    ? "border-accent bg-accent/10"
                    : "border-transparent",
                ].join(" ")}
              >
                <span
                  className={`text-sm ${isTarget ? "text-foreground font-medium" : "text-muted"}`}
                >
                  {midiToJapaneseFixedDo(midi)}
                </span>
                <span
                  className={`text-xs tabular-nums ${isTarget ? "text-accent font-semibold" : "text-muted"}`}
                >
                  {i + 1}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-sm text-center text-muted leading-relaxed">
        鳴ったのは <span className="text-foreground">{targetName}</span>。
        主音から数えて{" "}
        <span className="text-foreground font-semibold">{correctDegree}</span>{" "}
        番目です。
      </p>

      {isLast && (
        <p className="text-xs text-muted leading-relaxed border border-border rounded-lg p-3 bg-surface-raised">
          ハ長調では、音名と番号がたまたま一致します。
          <span className="text-foreground">
            本番では他の調も出るため、そこでは両者がずれます。
          </span>
          音名ではなく、主音から数えた位置で答えてください。
        </p>
      )}

      <button
        onClick={onNext}
        className="self-center px-8 py-3 rounded-lg bg-accent text-accent-foreground font-medium hover:opacity-90 transition-opacity"
      >
        {isLast ? "本番をはじめる" : "次の練習へ"}
      </button>
    </div>
  );
}

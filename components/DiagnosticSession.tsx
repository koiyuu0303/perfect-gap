"use client";

import { useCallback, useState } from "react";
import { getAudioEngine } from "@/lib/audio/engine";
import {
  buildDiagnosticSequence,
  gradeTrial,
  type Trial,
} from "@/lib/training/trial";
import type { ParticipantProfile } from "@/lib/training/profile";
import type { TrialRecord } from "@/lib/training/analysis";
import { saveDiagnosticSession, type SaveStatus } from "@/lib/db/save";
import { useStoredProfile } from "@/hooks/useStoredProfile";
import { useTrialPlayback } from "@/hooks/useTrialPlayback";
import { useDegreeKeyboard } from "@/hooks/useDegreeKeyboard";
import { AnswerPad } from "./AnswerPad";
import { ProfileForm } from "./ProfileForm";
import { PracticeRound } from "./PracticeRound";
import { DiagnosticResults } from "./DiagnosticResults";

/** 1条件あたりの出題数。4条件あるので総数はこの4倍になる。 */
const TRIALS_PER_CONDITION = 5;

/** 正誤を表示してから次に進むまでの時間(ミリ秒)。 */
const FEEDBACK_DURATION_MS = 1400;

type Stage =
  | "loading"
  | "profile"
  | "intro"
  | "practice"
  | "diagnostic"
  | "complete";

export function DiagnosticSession() {
  const { profile, save } = useStoredProfile();
  const [records, setRecords] = useState<TrialRecord[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>({ kind: "idle" });

  /**
   * 画面の段階。利用者が進むまでは保存済みの自己申告から決まる。
   * 別途 state に写して同期させると食い違いの元になるので、
   * 進行を指示されたときだけ上書きする形にしている。
   */
  const [stageOverride, setStageOverride] = useState<Stage | null>(null);
  const stage: Stage =
    stageOverride ??
    (profile === undefined ? "loading" : profile ? "intro" : "profile");

  const setStage = setStageOverride;

  const handleProfileComplete = useCallback(
    (completed: ParticipantProfile) => {
      save(completed);
      setStage("intro");
    },
    [save, setStage],
  );

  if (stage === "loading") {
    return <div className="min-h-[20rem]" aria-hidden />;
  }

  if (stage === "profile") {
    return <ProfileForm initial={profile} onComplete={handleProfileComplete} />;
  }

  if (stage === "intro") {
    return (
      <IntroScreen
        onReady={() => setStage("practice")}
        onEditProfile={() => setStage("profile")}
      />
    );
  }

  if (stage === "practice") {
    return <PracticeRound onFinish={() => setStage("diagnostic")} />;
  }

  if (stage === "diagnostic") {
    return (
      <DiagnosticRun
        onComplete={(completed, trials) => {
          setRecords(completed);
          setStage("complete");

          // 保存は結果表示を待たせない。失敗しても画面には結果が出る。
          setSaveStatus({ kind: "saving" });
          saveDiagnosticSession({
            records: completed,
            profile: profile ?? null,
            trials,
          }).then(setSaveStatus);
        }}
      />
    );
  }

  return (
    <DiagnosticResults
      records={records}
      saveStatus={saveStatus}
      onRestart={() => {
        setRecords([]);
        setSaveStatus({ kind: "idle" });
        setStage("intro");
      }}
    />
  );
}

/**
 * 説明と音声の開始。
 *
 * ブラウザは自動再生を禁じているため、ここでのクリックが
 * 音声を使える状態にする唯一の機会になる。
 */
function IntroScreen({
  onReady,
  onEditProfile,
}: {
  onReady: () => void;
  onEditProfile: () => void;
}) {
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStart = async () => {
    setIsStarting(true);
    try {
      // ピアノ音源の読み込みを含むため数秒かかることがある
      await getAudioEngine().start();
      onReady();
    } catch {
      setError(
        "音声を開始できませんでした。ブラウザの音量設定を確認して、もう一度お試しください。",
      );
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto flex flex-col gap-4 text-center">
      <div className="rounded-xl border border-border bg-surface p-8 sm:p-10 flex flex-col gap-6">
        <h2 className="text-xl font-semibold">診断のすすめ方</h2>

        <ol className="text-left flex flex-col gap-3 text-sm leading-relaxed text-muted">
          <li>
            <span className="text-foreground font-medium">1.</span>{" "}
            はじめに和音が4つ鳴り、その曲の「調」が示されます。
          </li>
          <li>
            <span className="text-foreground font-medium">2.</span>{" "}
            少し間をおいて、単音がひとつ鳴ります。
          </li>
          <li>
            <span className="text-foreground font-medium">3.</span> その音が
            <span className="text-foreground">主音から数えて何番目か</span>
            を、1〜7の数字で答えてください。
          </li>
        </ol>

        {/*
          日本では「ドレミ」は固定ド(ド=C)で教わることが多い。
          音名で答えたくなる衝動こそがこの診断の対象なので、
          最初に例で明確に打ち消しておく。
        */}
        <div className="text-left border border-border rounded-lg p-4 flex flex-col gap-3 bg-surface-raised">
          <p className="text-sm">
            <span className="text-error">重要:</span>{" "}
            <span className="text-foreground">音名では答えません。</span>
          </p>

          <div className="flex flex-col gap-2 text-sm text-muted">
            <div className="flex items-baseline gap-2">
              <span className="text-xs shrink-0 w-32">ハ長調(主音=ド)で</span>
              <span className="text-foreground">ミ</span>
              <span className="text-xs">が鳴った →</span>
              <span className="text-foreground font-semibold">3</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xs shrink-0 w-32">ニ長調(主音=レ)で</span>
              <span className="text-foreground">ファ#</span>
              <span className="text-xs">が鳴った →</span>
              <span className="text-foreground font-semibold">3</span>
            </div>
          </div>

          <p className="text-xs text-muted leading-relaxed border-t border-border pt-3">
            鳴っている音は違っても、
            <span className="text-foreground">
              主音から数えた位置が同じなら答えは同じ
            </span>
            です。逆に、同じ「ミ」でも調が変われば答えは変わります。
          </p>
        </div>

        <p className="text-sm text-muted leading-relaxed border-t border-border pt-5">
          まず練習が2問あります。そのあと本番が20問、5分ほどです。
          <br />
          迷ってもかまいませんが、
          <span className="text-foreground">できるだけ速く</span>
          答えてください。時間も測っています。
        </p>

        <p className="text-xs text-muted">ヘッドホンの使用を推奨します。</p>

        {error && (
          <p className="text-sm text-error border border-error/30 rounded-lg p-3">
            {error}
          </p>
        )}

        <button
          onClick={handleStart}
          disabled={isStarting}
          className="px-8 py-3 rounded-lg bg-accent text-accent-foreground font-medium hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-default"
        >
          {isStarting ? "ピアノ音源を読み込んでいます…" : "練習をはじめる"}
        </button>
      </div>

      <button
        onClick={onEditProfile}
        className="text-xs text-muted hover:text-foreground transition-colors underline self-center"
      >
        自己申告の内容を変更する
      </button>
    </div>
  );
}

/** 本番の20問。 */
function DiagnosticRun({
  onComplete,
}: {
  onComplete: (records: TrialRecord[], trials: Trial[]) => void;
}) {
  const [trials] = useState<Trial[]>(() =>
    buildDiagnosticSequence(TRIALS_PER_CONDITION),
  );
  const [index, setIndex] = useState(0);
  const [records, setRecords] = useState<TrialRecord[]>([]);
  const [answered, setAnswered] = useState<number | null>(null);

  const { status, play, measureRt, reset, scheduleAfter } = useTrialPlayback();
  const trial = trials[index];

  const handleAnswer = useCallback(
    (degree: number) => {
      if (status !== "answering" || answered !== null) return;

      const rtMs = measureRt();
      const isCorrect = gradeTrial(trial, degree);

      const record: TrialRecord = {
        condition: trial.condition,
        keyTonic: trial.key.tonic,
        keyDistance: trial.keyDistance,
        detuneCents: trial.detuneCents,
        targetMidi: trial.targetMidi,
        correctDegree: trial.correctAnswer.degree,
        answeredDegree: degree,
        isCorrect,
        rtMs,
        presentedAt: new Date().toISOString(),
      };

      // 最終問題では完成した配列をそのまま渡す。
      // setState は非同期なので、状態の反映を待つと取りこぼす。
      const updated = [...records, record];
      setRecords(updated);
      setAnswered(degree);

      scheduleAfter(FEEDBACK_DURATION_MS, () => {
        if (index >= trials.length - 1) {
          onComplete(updated, trials);
        } else {
          setAnswered(null);
          reset();
          setIndex((i) => i + 1);
        }
      });
    },
    [
      status,
      answered,
      measureRt,
      trial,
      index,
      trials,
      records,
      scheduleAfter,
      reset,
      onComplete,
    ],
  );

  useDegreeKeyboard(status === "answering" && answered === null, handleAnswer);

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-8">
      <Progress current={index + 1} total={trials.length} />

      <div className="rounded-xl border border-border bg-surface p-8 sm:p-12 flex flex-col items-center gap-8 min-h-[22rem] justify-center">
        {status === "idle" && (
          <>
            <p className="text-sm text-muted no-select">
              準備ができたら再生してください
            </p>
            <button
              onClick={() => play(trial)}
              className="px-8 py-3 rounded-lg bg-accent text-accent-foreground font-medium hover:opacity-90 transition-opacity"
            >
              音を聴く
            </button>
          </>
        )}

        {/*
          再生中も回答中も、調名やデチューンの有無は一切表示しない。
          条件が分かると被験者が戦略を切り替えてしまい、
          条件間の比較が成立しなくなる。
        */}
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
            <div className="flex flex-col items-center gap-1 no-select">
              <p className="text-base font-medium">
                いまの音は、主音から数えて何番目？
              </p>
              <p className="text-xs text-muted">音名ではなく位置を答えます</p>
            </div>

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
          </>
        )}
      </div>

      {answered !== null && (
        <FeedbackLine
          isCorrect={answered === trial.correctAnswer.degree}
          correctDegree={trial.correctAnswer.degree}
          rtMs={records[records.length - 1]?.rtMs ?? 0}
        />
      )}
    </div>
  );
}

function Progress({ current, total }: { current: number; total: number }) {
  const percentage = total === 0 ? 0 : ((current - 1) / total) * 100;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between text-xs text-muted tabular-nums">
        <span>
          {current} / {total}
        </span>
      </div>
      <div className="h-1 rounded-full bg-surface-raised overflow-hidden">
        <div
          className="h-full bg-accent transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function FeedbackLine({
  isCorrect,
  correctDegree,
  rtMs,
}: {
  isCorrect: boolean;
  correctDegree: number;
  rtMs: number;
}) {
  return (
    <p className="text-center text-sm">
      {isCorrect ? (
        <span className="text-success">正解</span>
      ) : (
        <span className="text-error">
          不正解 — 正しくは {correctDegree} 番目
        </span>
      )}
      <span className="text-muted tabular-nums ml-3">
        {(rtMs / 1000).toFixed(2)} 秒
      </span>
    </p>
  );
}

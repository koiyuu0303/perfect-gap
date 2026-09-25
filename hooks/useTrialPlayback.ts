"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAudioEngine } from "@/lib/audio/engine";
import type { Trial } from "@/lib/training/trial";

/**
 * 課題の再生と反応時間の計測。練習と本番で共有する。
 *
 * 反応時間の起点は、タイマーが発火した時刻ではなく
 * 音が実際に鳴り終わる時刻(音声クロックから換算した値)を使う。
 * ボタンを開くタイミングにわずかなずれが出ても、計測値は汚れない。
 */

export type PlaybackStatus = "idle" | "playing" | "answering";

export function useTrialPlayback() {
  const [status, setStatus] = useState<PlaybackStatus>("idle");

  /** 刺激が鳴り終わる時刻(performance.now() と同じ時計)。 */
  const stimulusEndedAt = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  /** 課題を再生し、鳴り終わったら回答受付に移る。 */
  const play = useCallback(
    (trial: Trial) => {
      clearTimers();
      setStatus("playing");

      const result = getAudioEngine().playSequence(
        trial.events,
        trial.detuneCents,
      );
      stimulusEndedAt.current = result.endsAtPerformanceTime;

      const delay = Math.max(
        0,
        result.endsAtPerformanceTime - performance.now(),
      );
      timers.current.push(setTimeout(() => setStatus("answering"), delay));
    },
    [clearTimers],
  );

  /** 刺激が鳴り終わってからの経過時間(ミリ秒)。 */
  const measureRt = useCallback(
    () => performance.now() - stimulusEndedAt.current,
    [],
  );

  /** 待機状態に戻す。予約済みのタイマーも解除する。 */
  const reset = useCallback(() => {
    clearTimers();
    setStatus("idle");
  }, [clearTimers]);

  /** 一定時間後に処理を予約する(画面遷移などに使う)。 */
  const scheduleAfter = useCallback((ms: number, action: () => void) => {
    timers.current.push(setTimeout(action, ms));
  }, []);

  return { status, play, measureRt, reset, scheduleAfter };
}

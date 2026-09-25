"use client";

import { useEffect } from "react";

/**
 * キーボードの 1〜7 で音度を回答できるようにする。
 *
 * 反応時間を測る課題なので、マウスを動かす時間が入らない入力手段を
 * 用意しておく意味は大きい。ボタンの位置によって反応時間が変わると、
 * 測っているものに雑音が混じる。
 */
export function useDegreeKeyboard(
  active: boolean,
  onAnswer: (degree: number) => void,
) {
  useEffect(() => {
    if (!active) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const degree = Number(event.key);
      if (Number.isInteger(degree) && degree >= 1 && degree <= 7) {
        onAnswer(degree);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, onAnswer]);
}

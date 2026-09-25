"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  loadStoredProfile,
  storeProfile,
  type ParticipantProfile,
} from "@/lib/training/profile";

/**
 * 端末に保存された自己申告を読み書きする。
 *
 * localStorage はReactの外にある状態なので useSyncExternalStore で扱う。
 * 効果の中で setState する書き方でも動くが、サーバー描画との食い違いを
 * Reactに伝える手段がなく、ハイドレーションの整合を自前で面倒みることになる。
 *
 * サーバーには localStorage がないため、サーバー側の値は undefined を返す。
 * 呼び出し側はこれを「まだ分からない」状態として扱えるので、
 * 保存済みの人にフォームが一瞬映るちらつきも避けられる。
 */

/** 読み込み済みの値。getSnapshot は同じ参照を返し続ける必要がある。 */
let cache: ParticipantProfile | null | undefined;
let hasLoaded = false;

const listeners = new Set<() => void>();

function getSnapshot(): ParticipantProfile | null | undefined {
  if (!hasLoaded) {
    cache = loadStoredProfile();
    hasLoaded = true;
  }
  return cache;
}

/** サーバー描画時とハイドレーション直後の値。 */
function getServerSnapshot(): undefined {
  return undefined;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useStoredProfile() {
  const profile = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const save = useCallback((next: ParticipantProfile) => {
    storeProfile(next);
    cache = next;
    hasLoaded = true;
    listeners.forEach((listener) => listener());
  }, []);

  return { profile, save } as const;
}

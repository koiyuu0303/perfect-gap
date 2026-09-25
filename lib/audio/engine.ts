/**
 * 音声再生エンジン (ブラウザ専用)。
 *
 * 設計上の要点は3つ。
 *
 * 1. デチューンの計算をここに持ち込まない。
 *    純粋関数 midiToFrequency() が算出した周波数(Hz)をそのまま Tone.js に渡す。
 *    Tone.js は Hz を直接受け取れるため、実験の独立変数を扱うロジックが
 *    テスト済みのコードだけに閉じ、再生層はただ鳴らすだけの存在になる。
 *
 * 2. 反応時間の起点を正確に取る。
 *    音声クロックと DOM のクロックは別の時計であり、単純に混ぜると
 *    数十ミリ秒の誤差が入る。反応時間は本プロジェクトの中核指標なので、
 *    getOutputTimestamp() で両者を対応付けて変換する。
 *
 * 3. 音色はピアノを使う。
 *    合成音は聴き取りにくいだけでなく、絶対音感保持者の多くがピアノで
 *    音高を習得しているため、生態学的な妥当性の面でも実際の楽器音が望ましい。
 *    読み込みに失敗した場合だけ合成音に落とす。
 */

import { midiToFrequency, type DetuneCents } from "@/lib/music/pitch";

/** 同時に鳴らす音のまとまりと、その時間配置。 */
export interface ToneEvent {
  /** 同時に鳴らすMIDIノート番号。単音なら要素1つ。 */
  midis: number[];
  /** シーケンス先頭からの相対開始時刻(秒)。 */
  offset: number;
  /** 音を保持する長さ(秒)。 */
  duration: number;
}

export interface PlaybackResult {
  /**
   * 刺激が鳴り終わる時刻。performance.now() と同じ時計で表される。
   * 反応時間はこの値を起点に測る。
   *
   * ピアノ音は指定長のあとも自然に減衰するため、物理的な無音までは
   * さらに時間がかかる。ただし全条件で同じ時間配置を用いているので、
   * 条件間の差(本プロジェクトの全指標はすべて差である)には影響しない。
   */
  endsAtPerformanceTime: number;
  /** 刺激全体の長さ(秒)。 */
  totalDuration: number;
}

type ToneModule = typeof import("tone");
type Instrument = {
  triggerAttackRelease: (
    notes: number[] | number,
    duration: number,
    time?: number,
    velocity?: number,
  ) => unknown;
  releaseAll?: () => unknown;
  dispose: () => unknown;
  volume: { value: number };
};

/** 現在鳴らしている音色。 */
export type EngineVoice = "piano" | "synth";

/**
 * 発音までの余裕(秒)。
 * 現在時刻ちょうどに予約すると、処理が間に合わず先頭が欠けることがある。
 */
const SCHEDULE_AHEAD_SECONDS = 0.1;

/** すべての音を同じ強さで鳴らす(強弱が手がかりにならないようにする)。 */
const FIXED_VELOCITY = 0.7;

/** 音源の読み込みを諦めるまでの時間(ミリ秒)。 */
const SAMPLE_LOAD_TIMEOUT_MS = 15000;

/**
 * ピアノ音源の対応表。
 *
 * Salamander Grand Piano (Alexander Holm, CC-BY 3.0) を短3度間隔で収録した
 * ものから、課題で使う音域 C2〜A#5 を覆う分だけを抜き出している。
 * 間の音は Tone.Sampler が再生速度を変えて補う。
 * ファイル名の s はシャープを表す(URLに # を含められないため)。
 */
const PIANO_SAMPLES: Record<string, string> = {
  C2: "C2.mp3",
  "D#2": "Ds2.mp3",
  "F#2": "Fs2.mp3",
  A2: "A2.mp3",
  C3: "C3.mp3",
  "D#3": "Ds3.mp3",
  "F#3": "Fs3.mp3",
  A3: "A3.mp3",
  C4: "C4.mp3",
  "D#4": "Ds4.mp3",
  "F#4": "Fs4.mp3",
  A4: "A4.mp3",
  C5: "C5.mp3",
  "D#5": "Ds5.mp3",
  "F#5": "Fs5.mp3",
  A5: "A5.mp3",
  C6: "C6.mp3",
};

export class AudioEngine {
  private tone: ToneModule | null = null;
  private instrument: Instrument | null = null;
  private voice: EngineVoice = "synth";
  private started = false;

  /** 音声が利用可能な状態かどうか。 */
  get isReady(): boolean {
    return this.started && this.instrument !== null;
  }

  /** 実際に鳴っている音色。音源の読み込みに失敗すると "synth" になる。 */
  get currentVoice(): EngineVoice {
    return this.voice;
  }

  /**
   * 音声を開始し、ピアノ音源を読み込む。
   *
   * ブラウザは自動再生を禁じているため、必ずユーザー操作(クリックなど)の
   * 中から呼ぶ必要がある。音源の読み込みには数秒かかることがある。
   */
  async start(): Promise<void> {
    if (this.started) return;

    // Tone.js は読み込み時にブラウザのAPIへ触れるため、
    // サーバー側で評価されないよう動的 import にしている。
    const Tone = await import("tone");
    this.tone = Tone;

    await Tone.start();

    try {
      this.instrument = await this.loadPiano(Tone);
      this.voice = "piano";
    } catch {
      // 音源が読めなくても診断自体は成立させる。
      // 音色は条件間で共通なので、指標(条件間の差)の妥当性は保たれる。
      this.instrument = this.createSynth(Tone);
      this.voice = "synth";
    }

    this.started = true;
  }

  /** ピアノ音源を読み込む。時間内に揃わなければ失敗として扱う。 */
  private async loadPiano(Tone: ToneModule): Promise<Instrument> {
    const sampler = new Tone.Sampler({
      urls: PIANO_SAMPLES,
      baseUrl: "/audio/piano/",
      // 減衰しきる前に切ると不自然なので、余韻を残して離す
      release: 1,
    }).toDestination();

    // 和音で歪まないよう抑えめにする
    sampler.volume.value = -6;

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("音源の読み込みが時間内に終わりませんでした")),
        SAMPLE_LOAD_TIMEOUT_MS,
      ),
    );

    await Promise.race([Tone.loaded(), timeout]);

    if (!sampler.loaded) {
      sampler.dispose();
      throw new Error("音源の読み込みに失敗しました");
    }

    return sampler as unknown as Instrument;
  }

  /** 音源が使えないときの代替。三角波は倍音があり音高を捉えやすい。 */
  private createSynth(Tone: ToneModule): Instrument {
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: "triangle" },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.6 },
    }).toDestination();

    synth.volume.value = -10;
    return synth as unknown as Instrument;
  }

  /**
   * 音声クロック上の時刻を、performance.now() と同じ時計に変換する。
   *
   * getOutputTimestamp() は「ある音声時刻」と「それに対応する DOM 時刻」を
   * 同時に返す。この対応点を基準に差分を足すことで、両クロックのずれを
   * 持ち込まずに変換できる。
   */
  private audioToPerformanceTime(audioTime: number): number {
    const rawContext = this.tone!.getContext().rawContext as AudioContext;

    if (typeof rawContext.getOutputTimestamp === "function") {
      const timestamp = rawContext.getOutputTimestamp();
      if (
        typeof timestamp.contextTime === "number" &&
        typeof timestamp.performanceTime === "number"
      ) {
        return (
          timestamp.performanceTime + (audioTime - timestamp.contextTime) * 1000
        );
      }
    }

    // getOutputTimestamp が使えない環境向けの近似。
    // 出力遅延が含まれないぶんわずかに早くなるが、実用上は許容範囲。
    return performance.now() + (audioTime - rawContext.currentTime) * 1000;
  }

  /**
   * 音の並びを再生する。
   *
   * @param events 鳴らす音とその時間配置
   * @param detuneCents 基準ピッチのずれ。実験の独立変数。
   * @returns 鳴り終わる時刻(反応時間の起点)
   */
  playSequence(
    events: ToneEvent[],
    detuneCents: DetuneCents = 0,
  ): PlaybackResult {
    if (!this.instrument || !this.tone) {
      throw new Error(
        "音声が開始されていません。ユーザー操作の中で start() を呼んでください。",
      );
    }
    if (events.length === 0) {
      throw new Error("再生する音がありません。");
    }

    const startTime = this.tone.now() + SCHEDULE_AHEAD_SECONDS;

    for (const event of events) {
      // ここが要。MIDI値ではなく、デチューン込みで算出した周波数を渡す。
      const frequencies = event.midis.map((midi) =>
        midiToFrequency(midi, detuneCents),
      );

      this.instrument.triggerAttackRelease(
        frequencies,
        event.duration,
        startTime + event.offset,
        FIXED_VELOCITY,
      );
    }

    const endAudioTime = Math.max(...events.map((e) => e.offset + e.duration));

    return {
      endsAtPerformanceTime: this.audioToPerformanceTime(
        startTime + endAudioTime,
      ),
      totalDuration: endAudioTime + SCHEDULE_AHEAD_SECONDS,
    };
  }

  /** 単音を鳴らす。 */
  playNote(
    midi: number,
    detuneCents: DetuneCents = 0,
    duration = 1.2,
  ): PlaybackResult {
    return this.playSequence(
      [{ midis: [midi], offset: 0, duration }],
      detuneCents,
    );
  }

  /** 和音を鳴らす。 */
  playChord(
    midis: number[],
    detuneCents: DetuneCents = 0,
    duration = 1.2,
  ): PlaybackResult {
    return this.playSequence([{ midis, offset: 0, duration }], detuneCents);
  }

  /** 鳴っている音をすべて止める。 */
  stopAll(): void {
    this.instrument?.releaseAll?.();
  }

  /** 資源を解放する。 */
  dispose(): void {
    this.instrument?.dispose();
    this.instrument = null;
    this.started = false;
  }
}

/**
 * アプリ全体で1つの音声エンジンを共有する。
 * AudioContext はブラウザごとに数が制限されるため、複数生成してはいけない。
 */
let sharedEngine: AudioEngine | null = null;

export function getAudioEngine(): AudioEngine {
  if (!sharedEngine) {
    sharedEngine = new AudioEngine();
  }
  return sharedEngine;
}

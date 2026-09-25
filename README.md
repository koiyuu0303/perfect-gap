# Perfect Gap

**絶対音感は、相対音感の代わりにならない。** それを測定するWebアプリ。

音を「名前」で識別する能力と、音と音の「関係」を聴き取る能力は別物です。
このアプリは、基準ピッチをずらした条件で聴音課題を出すことで、
前者にどれだけ依存しているかを定量化します。

---

## 何を測っているのか

課題は一貫して同じ形です。まず和音で調を示し、続けて単音を1つ鳴らし、
その音が**主音から数えて何番目か**を答えてもらいます。

この課題を解く方法は2通りあります。

| | 手順 |
|---|---|
| **A. 絶対的な聴き方** | 「F#」と音名で識別 → 「調はニ長調」と想起 → 「F#はDの3番目」と計算 |
| **B. 相対的な聴き方** | 主音との距離を直接感じ取る（名前を経由しない） |

基準ピッチが A=440Hz のままだと、**どちらの方法でも正解できてしまう**ため、
両者を区別できません。

そこで基準ピッチを **50セント（半音のちょうど半分）** ずらします。

- **Bは影響を受けない。** 音同士の間隔は1つも変わっていないため
- **Aだけが壊れる。** 鳴っている音がどの音名とも一致しなくなり、ラベルが機能しない

つまりこれは「**片方の戦略だけを外科的に取り除く操作**」です。
課題の音楽的な内容は不変のまま、方法Aの使用だけを封じる。
したがって **デチューン条件での成績低下 = 方法Aへの依存度** が直接測れます。

50セントという値は、半音の中間＝2つの音名から等距離にある「最も曖昧な点」だからです。
60セントずらすと隣の音名に近づき、また名前を付け直せてしまいます。

> この設計の前提（デチューンが音程関係を完全に保存すること）は
> [`lib/music/pitch.test.ts`](lib/music/pitch.test.ts) で全音程・全デチューン量について検証しています。
> ここが崩れると「成績低下＝絶対音感依存」という解釈自体が成立しません。

### 実験計画

**調の距離 × デチューン** の2×2要因計画です。両者を独立に操作することで、
成績低下が「調が遠いこと」によるのか「音高ラベルが壊れたこと」によるのかを切り分けられます。

|  | 基準ピッチ | 50セント下げ |
|---|---|---|
| **近い調**（五度圏距離 0〜1） | baseline | detuned |
| **遠隔調**（五度圏距離 4〜6） | remoteKey | both |

主要指標:

| 指標 | 定義 |
|---|---|
| **絶対音高への依存度** | 正答率(baseline) − 正答率(detuned) |
| 調性依存度 | 正答率(baseline) − 正答率(remoteKey) |
| 計算の遅れ | 反応時間中央値(detuned) − 反応時間中央値(baseline) |

いずれも**条件間の差**である点が重要です。絶対的な成績は音楽経験の指標であって
依存度ではありません。差を取ることで経験の多寡が打ち消され、聴き方の癖だけが残ります。

---

## 背景

絶対音感保持者がハ長調以外の文脈で音程判断の成績を落とすこと、および
調子外れの音を判定する際に反応時間が伸びることは、音楽認知の研究で報告されています。

- [Cognitive control in music: adaptive strategies for relative pitch across the absolute-pitch proficiency continuum (Frontiers in Psychology, 2025)](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2025.1723224/full)
- [Perceiving pitch absolutely: Comparing absolute and relative pitch possessors in a pitch memory task (BMC Neuroscience)](https://bmcneurosci.biomedcentral.com/articles/10.1186/1471-2202-10-106)

本プロジェクトはこの知見を出発点に、**個人の依存度を測定し、訓練で変化するかを追跡する**ことを目的としています。

---

## 技術構成

```
app/          Next.js 16 (App Router) + TypeScript + Tailwind v4
lib/music/    音楽理論の純粋関数（音高・音階・和音）
lib/training/ 出題ロジックと指標の計算
lib/audio/    Tone.js による再生と反応時間の計測
lib/db/       Supabase への永続化
supabase/     スキーマ定義（SQL）
analysis/     Python による縦断分析（予定）
```

### 設計上の判断

**正解判定に生成AIを使わない。** 音程・音度・和音の判定は決定論的に定まるため、
純粋関数として実装しテストで固めています（165件）。LLMの役割は、
数値で出た診断結果を日本語の助言に翻訳する部分だけに限定する予定です。

**反応時間は音声クロックから換算する。** 音声とDOMは別の時計で動いており、
単純に混ぜると数十ミリ秒の誤差が入ります。`getOutputTimestamp()` で
両者を対応付け、**音が鳴り終わった時刻**を起点に測っています。

**出題中は条件を表示しない。** 調名やデチューンの有無が分かると
被験者が戦略を切り替えてしまい、条件間の比較が成立しなくなります。

**階名（Do/Re/Mi）をボタンに表示しない。** 日本では固定ド（ド＝C）で
教わることが多く、階名を出すと音名として読まれて誤答を誘発します。
音名で答えたくなる衝動こそが測定対象なので、UIがそれを助長してはいけません。

---

## セットアップ

```bash
npm install
npm run dev        # http://localhost:3000
```

Supabase を設定しなくても診断は完全に動作します（結果が保存されないだけ）。

### データベース（任意）

1. [supabase.com](https://supabase.com) でプロジェクトを作成
2. ダッシュボードの **SQL Editor** で [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) を実行
3. **Authentication → Sign In / Providers** で **Anonymous sign-ins** を有効化
4. `.env.example` を `.env.local` にコピーし、Project Settings → API の値を入れる

登録不要で使えるよう匿名ログインを採用しています。協力者を集める際、
アカウント作成が最大の障壁になるためです。

---

## コマンド

```bash
npm run dev     # 開発サーバー
npm test        # テスト（165件）
npm run build   # 本番ビルド
npm run lint    # 静的解析
```

---

## クレジット

ピアノ音源: [Salamander Grand Piano](https://archive.org/details/SalamanderGrandPianoV3)
by Alexander Holm（[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)）

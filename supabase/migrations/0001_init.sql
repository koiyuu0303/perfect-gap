-- Perfect Gap 初期スキーマ
--
-- 設計の要点は trials テーブル。1問1行で記録し、実験条件を識別する列
-- (key_distance, detune_cents) を第一級のカラムとして持たせている。
-- 正誤だけを記録する設計にすると、あとから条件別に切り分けられなくなる。
--
-- 実行方法: Supabase ダッシュボードの SQL Editor に貼り付けて実行する。

-- ============================================================
-- profiles: 参加者の自己申告 (1人1行)
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,

  absolute_pitch text not null
    check (absolute_pitch in ('yes', 'probably', 'no', 'unsure')),
  training_years text not null
    check (training_years in ('0', '1-3', '4-9', '10+')),
  primary_instrument text not null
    check (primary_instrument in ('piano', 'strings', 'winds', 'voice', 'other', 'none')),

  -- ニ長調の主音を「レ」と呼ぶ(音名)か「ド」と呼ぶ(音度)か。
  -- 絶対音感の有無とは独立に成績を左右しうる交絡因子。
  solfege_system text not null
    check (solfege_system in ('fixed', 'movable', 'both', 'unsure')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is '参加者の自己申告。被験者間比較で群を切り分けるのに使う。';

-- ============================================================
-- sessions: 診断や訓練の1回分
-- ============================================================
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references auth.users (id) on delete cascade,

  mode text not null default 'diagnostic'
    check (mode in ('diagnostic', 'training')),

  started_at timestamptz not null,
  completed_at timestamptz,

  -- 出題ロジックを変えた前後でデータを区別できるようにしておく。
  -- これがないと、途中で仕様変更したときに縦断比較が壊れる。
  app_version text,

  created_at timestamptz not null default now()
);

create index if not exists sessions_participant_started_idx
  on public.sessions (participant_id, started_at desc);

comment on table public.sessions is '診断1回分。縦断分析ではこれが時系列の単位になる。';

-- ============================================================
-- trials: 1問1行 ★中核テーブル
-- ============================================================
create table if not exists public.trials (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.sessions (id) on delete cascade,

  -- 参照を辿らずに参加者で絞り込めるよう、あえて重複して持たせる。
  -- RLS の判定と分析クエリの両方が単純になる。
  participant_id uuid not null references auth.users (id) on delete cascade,

  -- セッション内での出題順。順序効果(慣れ・疲れ)の検定に使う。
  trial_index int not null,

  condition text not null
    check (condition in ('baseline', 'remoteKey', 'detuned', 'both')),

  -- ---- 実験条件 (独立変数) ----
  key_tonic text not null,

  -- 五度圏でのハ長調からの距離 (0〜6)。
  -- 「遠隔調か否か」の二値ではなく連続量なので、正答率をこれに回帰できる。
  key_distance int not null check (key_distance between 0 and 6),

  -- 基準ピッチのずれ(セント)。実験の主たる独立変数。
  -- 実際の基準周波数は 440 * 2^(detune_cents / 1200) で求まる。
  detune_cents int not null,

  -- ---- 刺激と回答 ----
  target_midi int not null,

  -- 実際に鳴らした音の並び。将来コードや進行の課題を足したとき、
  -- 設計時に想定しなかった切り口でも再分析できるようにしておく。
  stimulus jsonb,

  correct_degree int not null check (correct_degree between 1 and 7),
  answered_degree int not null check (answered_degree between 1 and 7),
  is_correct boolean not null,

  -- 反応時間(ミリ秒)。刺激が鳴り終わった時刻を起点に測っている。
  rt_ms double precision not null,

  presented_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists trials_participant_presented_idx
  on public.trials (participant_id, presented_at);

create index if not exists trials_session_idx
  on public.trials (session_id);

-- 条件別の集計を頻繁に行うため
create index if not exists trials_condition_idx
  on public.trials (participant_id, condition);

comment on table public.trials is
  '1問1行の回答記録。条件を識別する列を持つことが分析可能性の前提。';

-- ============================================================
-- 行レベルセキュリティ
--
-- 参加者は自分の行だけを読み書きできる。
-- 研究者が全参加者のデータを集計する場合は、RLS を迂回する
-- service_role キーを分析ノートブック側で使う (キーはリポジトリに入れない)。
-- ============================================================
alter table public.profiles enable row level security;
alter table public.sessions enable row level security;
alter table public.trials   enable row level security;

drop policy if exists "自分のプロフィールを読む" on public.profiles;
create policy "自分のプロフィールを読む" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "自分のプロフィールを書く" on public.profiles;
create policy "自分のプロフィールを書く" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "自分のプロフィールを更新する" on public.profiles;
create policy "自分のプロフィールを更新する" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "自分のセッションを読む" on public.sessions;
create policy "自分のセッションを読む" on public.sessions
  for select using (auth.uid() = participant_id);

drop policy if exists "自分のセッションを作る" on public.sessions;
create policy "自分のセッションを作る" on public.sessions
  for insert with check (auth.uid() = participant_id);

drop policy if exists "自分のセッションを更新する" on public.sessions;
create policy "自分のセッションを更新する" on public.sessions
  for update using (auth.uid() = participant_id)
  with check (auth.uid() = participant_id);

drop policy if exists "自分の回答を読む" on public.trials;
create policy "自分の回答を読む" on public.trials
  for select using (auth.uid() = participant_id);

drop policy if exists "自分の回答を書く" on public.trials;
create policy "自分の回答を書く" on public.trials
  for insert with check (auth.uid() = participant_id);

-- ============================================================
-- テーブル権限
--
-- Postgres では「テーブルに触れる権限(GRANT)」と「どの行が見えるか(RLS)」は
-- 別の層になっている。プロジェクト作成時に「新しいテーブルを自動的に公開する」を
-- 無効にした場合、RLS ポリシーを書いても GRANT がないため操作できない。
-- ここで必要な操作だけを明示的に与える。
--
-- 対象は authenticated ロールのみ。匿名ログインでも JWT のロールは
-- authenticated になるため、未ログイン状態(anon)には一切権限を与えない。
-- ============================================================
grant usage on schema public to authenticated;

-- 自己申告は作成後に変更できるようにする
grant select, insert, update on public.profiles to authenticated;

-- セッションは開始時に作り、完了時に更新する
grant select, insert, update on public.sessions to authenticated;

-- 回答は一度書いたら変更しない。改変を防ぐため update も delete も与えない。
grant select, insert on public.trials to authenticated;

-- ============================================================
-- 分析用ビュー
--
-- 条件ごとの集計は分析のたびに書くことになるので、あらかじめ用意しておく。
-- RLS はビューにも継承されるため、参加者は自分の分しか見られない。
-- ============================================================
create or replace view public.condition_summary
with (security_invoker = true) as
select
  participant_id,
  session_id,
  condition,
  count(*)                                as trials,
  count(*) filter (where is_correct)      as correct,
  avg(is_correct::int)::double precision  as accuracy,
  percentile_cont(0.5) within group (order by rt_ms) as median_rt_ms,
  min(presented_at)                       as started_at
from public.trials
group by participant_id, session_id, condition;

comment on view public.condition_summary is
  '条件別の正答率と反応時間中央値。反応時間は分布が右に歪むため中央値を使う。';

grant select on public.condition_summary to authenticated;

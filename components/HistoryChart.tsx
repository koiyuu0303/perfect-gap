"use client";

import { useMemo, useRef, useState } from "react";
import type { HistoryPoint } from "@/lib/db/history";

/**
 * 絶対音高への依存度の推移。
 *
 * 系列は1つなので凡例は置かない(表題が何の線かを示している)。
 * 横軸は実際の日付で刻む。回数で等間隔に並べると「2週間空いた」ことと
 * 「毎日続けた」ことが同じ見た目になり、学習の経過を誤って読ませる。
 *
 * 縦軸には必ず0を含める。0は「絶対音高に依存していない」状態であり、
 * 訓練が目指す到達点そのものなので、そこまでの距離が見えないと
 * グラフの意味が半減する。
 */

const WIDTH = 720;
const HEIGHT = 280;
const PADDING = { top: 16, right: 16, bottom: 34, left: 44 };

const PLOT_WIDTH = WIDTH - PADDING.left - PADDING.right;
const PLOT_HEIGHT = HEIGHT - PADDING.top - PADDING.bottom;

interface Scaled extends HistoryPoint {
  x: number;
  y: number;
  time: number;
}

export function HistoryChart({ points }: { points: HistoryPoint[] }) {
  const [hovered, setHovered] = useState<Scaled | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const { scaled, ticks, yMin, yMax } = useMemo(
    () => buildScales(points),
    [points],
  );

  if (points.length === 0) return null;

  const linePath = scaled.map((p) => `${p.x},${p.y}`).join(" ");

  const handleMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;

    // 画面上の座標を、SVG内部の座標系に換算する
    const rect = svg.getBoundingClientRect();
    const ratio = WIDTH / rect.width;
    const x = (event.clientX - rect.left) * ratio;

    let nearest = scaled[0];
    for (const point of scaled) {
      if (Math.abs(point.x - x) < Math.abs(nearest.x - x)) nearest = point;
    }
    setHovered(nearest);
  };

  return (
    <figure className="rounded-xl border border-border bg-surface p-5 sm:p-6 flex flex-col gap-4">
      <figcaption className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">絶対音高への依存度の推移</h2>
        <p className="text-xs text-muted leading-relaxed">
          基準ピッチをずらしたときの正答率の低下幅。
          <span className="text-foreground">下がるほど</span>
          、音を名前ではなく関係で聴けていることを示します。
        </p>
      </figcaption>

      <div className="relative overflow-x-auto">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full min-w-[420px] h-auto"
          onMouseMove={handleMove}
          onMouseLeave={() => setHovered(null)}
          role="img"
          aria-label={`依存度の推移。${points.length}回分の記録。`}
        >
          {/* 目盛り線。読み取りを助けるが主役ではないので薄くする */}
          {ticks.map((tick) => {
            const y = scaleY(tick, yMin, yMax);
            return (
              <g key={tick}>
                <line
                  x1={PADDING.left}
                  y1={y}
                  x2={WIDTH - PADDING.right}
                  y2={y}
                  stroke="var(--border)"
                  strokeWidth={1}
                />
                <text
                  x={PADDING.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  className="fill-[var(--muted)]"
                  fontSize={11}
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {/* 0 の線だけは到達目標なので、他より少しはっきりさせる */}
          {yMin <= 0 && yMax >= 0 && (
            <line
              x1={PADDING.left}
              y1={scaleY(0, yMin, yMax)}
              x2={WIDTH - PADDING.right}
              y2={scaleY(0, yMin, yMax)}
              stroke="var(--muted)"
              strokeWidth={1}
              strokeDasharray="4 4"
              opacity={0.5}
            />
          )}

          {/* ホバー位置の縦線 */}
          {hovered && (
            <line
              x1={hovered.x}
              y1={PADDING.top}
              x2={hovered.x}
              y2={HEIGHT - PADDING.bottom}
              stroke="var(--border)"
              strokeWidth={1}
            />
          )}

          {scaled.length > 1 && (
            <polyline
              points={linePath}
              fill="none"
              stroke="var(--series-1)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {scaled.map((point) => {
            const active = hovered?.sessionId === point.sessionId;
            return (
              <circle
                key={point.sessionId}
                cx={point.x}
                cy={point.y}
                r={active ? 6 : 4}
                fill="var(--series-1)"
                /* 点が重なっても輪郭が分かるよう、背景色の輪を巻く */
                stroke="var(--surface)"
                strokeWidth={2}
              />
            );
          })}

          {/* 横軸のラベルは端だけに絞る。全点に日付を振ると読めなくなる */}
          <text
            x={PADDING.left}
            y={HEIGHT - 10}
            className="fill-[var(--muted)]"
            fontSize={11}
          >
            {formatDate(scaled[0].date)}
          </text>
          {scaled.length > 1 && (
            <text
              x={WIDTH - PADDING.right}
              y={HEIGHT - 10}
              textAnchor="end"
              className="fill-[var(--muted)]"
              fontSize={11}
            >
              {formatDate(scaled[scaled.length - 1].date)}
            </text>
          )}
        </svg>

        {hovered && (
          <div
            className="absolute pointer-events-none rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs shadow-lg"
            style={{
              left: `${(hovered.x / WIDTH) * 100}%`,
              top: 0,
              transform: "translateX(-50%)",
            }}
          >
            <div className="text-muted">{formatDate(hovered.date)}</div>
            <div className="tabular-nums font-medium">
              依存度 {Math.round(hovered.apReliance)} pt
            </div>
            <div className="text-muted tabular-nums">
              正答率 {Math.round(hovered.overallAccuracy * 100)}%
            </div>
          </div>
        )}
      </div>

      <HistoryTable points={points} />
    </figure>
  );
}

/** 図が読めない場合の代替。数値そのものを確認したいときにも使う。 */
function HistoryTable({ points }: { points: HistoryPoint[] }) {
  return (
    <details className="border-t border-border pt-3">
      <summary className="cursor-pointer text-xs text-muted select-none">
        数値を表で見る
      </summary>

      <div className="overflow-x-auto mt-3">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-muted">
              <th className="text-left font-normal py-1.5">日付</th>
              <th className="text-right font-normal py-1.5">依存度</th>
              <th className="text-right font-normal py-1.5">調性依存</th>
              <th className="text-right font-normal py-1.5">反応の遅れ</th>
              <th className="text-right font-normal py-1.5">正答率</th>
            </tr>
          </thead>
          <tbody>
            {[...points].reverse().map((point) => (
              <tr key={point.sessionId} className="border-t border-border">
                <td className="py-1.5">{formatDateTime(point.date)}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {Math.round(point.apReliance)} pt
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {Math.round(point.keyDependency)} pt
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {(point.rtPenaltyMs / 1000).toFixed(2)} 秒
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {Math.round(point.overallAccuracy * 100)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function scaleY(value: number, yMin: number, yMax: number): number {
  const span = yMax - yMin || 1;
  return PADDING.top + PLOT_HEIGHT - ((value - yMin) / span) * PLOT_HEIGHT;
}

function buildScales(points: HistoryPoint[]) {
  if (points.length === 0) {
    return { scaled: [] as Scaled[], ticks: [] as number[], yMin: 0, yMax: 100 };
  }

  const values = points.map((p) => p.apReliance);

  // 0 は到達目標なので必ず範囲に含める。上限は余白を持たせて丸める。
  const rawMin = Math.min(0, ...values);
  const rawMax = Math.max(20, ...values);
  const yMin = Math.floor(rawMin / 10) * 10;
  const yMax = Math.ceil((rawMax + 5) / 10) * 10;

  const ticks: number[] = [];
  const step = (yMax - yMin) / 4;
  for (let i = 0; i <= 4; i++) {
    ticks.push(Math.round(yMin + step * i));
  }

  const times = points.map((p) => new Date(p.date).getTime());
  const tMin = Math.min(...times);
  const tMax = Math.max(...times);
  const tSpan = tMax - tMin;

  const scaled: Scaled[] = points.map((point, index) => {
    const time = times[index];
    // 記録が1件、または全件が同時刻のときは中央に置く
    const ratio = tSpan === 0 ? 0.5 : (time - tMin) / tSpan;

    return {
      ...point,
      time,
      x: PADDING.left + ratio * PLOT_WIDTH,
      y: scaleY(point.apReliance, yMin, yMax),
    };
  });

  return { scaled, ticks, yMin, yMax };
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${hh}:${mm}`;
}

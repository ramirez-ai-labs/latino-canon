"use client";

import { useRef, useState } from "react";
import type { TrendPoint } from "@/lib/eval-insights";

/**
 * Hybrid recall@5 across retrieval runs, oldest to newest. One series, so no legend: the
 * section title names it. Runs are evenly spaced by order rather than by time - several
 * land within minutes of each other after back-to-back deploys, and time spacing would
 * stack them into one blob. Runs the deploy gate failed get the critical status color plus
 * an ✕ and a label, never color alone. The run log below the chart is its table view.
 */

const W = 640;
const H = 220;
const M = { top: 20, right: 56, bottom: 30, left: 44 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

// Chart tokens: one data hue (cyan, 3:1+ on the surface), the reserved status red for a
// failed gate, hairline grid one step off the surface. Text never wears the data color.
const SERIES = "var(--color-accent-cyan)";
const CRITICAL = "#d03b3b";
const GRID = "var(--color-border)";
const SURFACE = "var(--color-surface)";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function RetrievalTrend({ points }: { points: TrendPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  if (points.length < 2) return null;

  const values = points.map((p) => p.recall5);
  const lo = Math.floor((Math.min(...values) - 0.01) * 20) / 20;
  const hi = Math.ceil((Math.max(...values) + 0.01) * 20) / 20;
  const ticks: number[] = [];
  for (let t = lo; t <= hi + 1e-9; t += 0.05) ticks.push(Math.round(t * 100) / 100);

  const x = (i: number) => M.left + (i / (points.length - 1)) * PLOT_W;
  const y = (v: number) => M.top + (1 - (v - lo) / (hi - lo)) * PLOT_H;
  // Scores only compare within one golden set, so the line breaks where the set changed
  // (77 -> 97 queries on 2026-09-27 rose 0.782 -> 0.820 with no ranking change) and a
  // marked rule says why. Each run of same-set points is its own segment.
  const segments: number[][] = [];
  points.forEach((p, i) => {
    if (i > 0 && p.goldenSetHash !== points[i - 1]!.goldenSetHash) segments.push([]);
    if (segments.length === 0) segments.push([]);
    segments[segments.length - 1]!.push(i);
  });
  const setChanges = segments.slice(1).map((seg) => seg[0]!);
  const pathOf = (seg: number[]) => seg.map((i, k) => `${k === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(points[i]!.recall5).toFixed(1)}`).join(" ");
  const areaOf = (seg: number[]) =>
    `${pathOf(seg)} L${x(seg[seg.length - 1]!).toFixed(1)},${M.top + PLOT_H} L${x(seg[0]!).toFixed(1)},${M.top + PLOT_H} Z`;
  const last = points[points.length - 1]!;
  const failed = points.map((p, i) => ({ p, i })).filter(({ p }) => p.gate === "fail");
  const lowestFailed = failed.sort((a, b) => a.p.recall5 - b.p.recall5)[0];

  // The crosshair snaps to the nearest run, so the reader aims at a run, not a 2px line.
  function onPointer(e: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - M.left) / PLOT_W) * (points.length - 1));
    setActive(Math.min(Math.max(i, 0), points.length - 1));
  }

  function onKey(e: React.KeyboardEvent<SVGSVGElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const from = active ?? points.length - 1;
    setActive(Math.min(Math.max(from + (e.key === "ArrowRight" ? 1 : -1), 0), points.length - 1));
  }

  const a = active != null ? points[active] : null;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan/60"
        role="img"
        aria-label={`Hybrid recall@5 over the last ${points.length} retrieval runs, from ${points[0]!.recall5.toFixed(3)} to ${last.recall5.toFixed(3)}. Use the left and right arrow keys to step through runs.`}
        tabIndex={0}
        onPointerMove={onPointer}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive(points.length - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={onKey}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={M.left + PLOT_W} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} />
            <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular-nums">
              {t.toFixed(2)}
            </text>
          </g>
        ))}
        <text x={M.left} y={H - 8} className="fill-muted text-[11px]">
          {fmtDate(points[0]!.runAt)}
        </text>
        <text x={M.left + PLOT_W} y={H - 8} textAnchor="end" className="fill-muted text-[11px]">
          {fmtDate(last.runAt)}
        </text>

        {segments.map((seg) => (
          <g key={seg[0]}>
            {seg.length > 1 && <path d={areaOf(seg)} fill={SERIES} opacity={0.1} />}
            {seg.length > 1 && (
              <path d={pathOf(seg)} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            )}
          </g>
        ))}
        {setChanges.map((i) => {
          const cx = (x(i - 1) + x(i)) / 2;
          return (
            <g key={`set-${i}`}>
              <line x1={cx} x2={cx} y1={M.top} y2={M.top + PLOT_H} stroke="var(--color-muted)" strokeWidth={1} />
              <text x={cx - 6} y={M.top + 10} textAnchor="end" className="fill-muted text-[11px]">
                new query set
              </text>
            </g>
          );
        })}

        {a && (
          <line x1={x(active!)} x2={x(active!)} y1={M.top} y2={M.top + PLOT_H} stroke="var(--color-muted)" strokeWidth={1} />
        )}

        {points.map((p, i) =>
          p.gate === "fail" ? (
            <g key={p.id}>
              <circle cx={x(i)} cy={y(p.recall5)} r={6} fill={CRITICAL} stroke={SURFACE} strokeWidth={2} />
              <path
                d={`M${x(i) - 2.5},${y(p.recall5) - 2.5} l5,5 m0,-5 l-5,5`}
                stroke="white"
                strokeWidth={1.5}
                strokeLinecap="round"
              />
            </g>
          ) : (
            <circle
              key={p.id}
              cx={x(i)}
              cy={y(p.recall5)}
              r={i === active || i === points.length - 1 ? 5 : 4}
              fill={SERIES}
              stroke={SURFACE}
              strokeWidth={2}
            />
          ),
        )}

        {/* Selective labels: the latest value at the line's end, and the failed gate once. */}
        <text x={x(points.length - 1) + 10} y={y(last.recall5)} dy="0.32em" className="fill-text text-[12px] font-semibold">
          {last.recall5.toFixed(3)}
        </text>
        {lowestFailed && (
          <text x={x(lowestFailed.i)} y={y(lowestFailed.p.recall5) + 20} textAnchor="middle" className="fill-muted text-[11px]">
            gate failed
          </text>
        )}
      </svg>

      {a && (
        <div
          role="status"
          className="pointer-events-none absolute top-2 rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs shadow-lg"
          style={{
            left: `${(x(active!) / W) * 100}%`,
            transform: `translateX(${active! > points.length / 2 ? "calc(-100% - 12px)" : "12px"})`,
          }}
        >
          <div className="text-base font-semibold text-text">{a.recall5.toFixed(3)}</div>
          <div className="text-muted">recall@5 · {fmtTime(a.runAt)}</div>
          {a.gate !== "none" && a.gateDelta != null && (
            <div className="mt-1 flex items-center gap-1.5 text-muted">
              <span aria-hidden style={{ color: a.gate === "pass" ? "#0ca30c" : CRITICAL }}>
                {a.gate === "pass" ? "✓" : "✕"}
              </span>
              Gate {a.gate === "pass" ? "passed" : "failed"}, {a.gateDelta >= 0 ? "+" : ""}
              {a.gateDelta.toFixed(3)} vs last passing run
            </div>
          )}
        </div>
      )}
    </div>
  );
}

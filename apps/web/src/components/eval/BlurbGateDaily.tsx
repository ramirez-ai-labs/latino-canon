import type { BlurbGateDay } from "@latino-canon/core";

/**
 * The ingest blurb gate, one bar per day: blurbs the v3 judge approved (the data hue) and
 * held for an editor (neutral), stacked, with the day's pass rate on top. Two series, so a
 * legend - approved/held also differ in lightness, so identity never rides on hue alone -
 * and the table below is the chart's table view, carrying the rewrite counts too. Hover
 * titles give each segment's count. Server-rendered: nothing here needs client state.
 */

const W = 640;
const H = 190;
const M = { top: 26, right: 12, bottom: 28, left: 36 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;
const APPROVED = "var(--color-accent-cyan)";
const HELD = "var(--color-muted)";
const GAP = 2; // surface gap between stacked segments

/** A bar segment rounded only at its data end (the top), square where it sits on the baseline or another segment. */
function segment(x: number, y: number, w: number, h: number, roundTop: boolean): string {
  const r = roundTop ? Math.min(4, h, w / 2) : 0;
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

export function BlurbGateDaily({ days }: { days: BlurbGateDay[] }) {
  const judgedDays = days.filter((d) => d.judged > 0);
  if (days.length === 0) return null;

  const max = Math.max(...days.map((d) => d.judged), 1);
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / step) * step;
  const ticks = [0, top / 2, top];
  const band = PLOT_W / days.length;
  const barW = Math.min(24, band * 0.6);
  const y = (v: number) => M.top + PLOT_H - (v / top) * PLOT_H;
  const totals = judgedDays.reduce((t, d) => ({ judged: t.judged + d.judged, approved: t.approved + d.approved }), { judged: 0, approved: 0 });

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: APPROVED }} /> Approved by the judge
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm opacity-60" style={{ background: HELD }} /> Held for an editor
        </span>
        {totals.judged > 0 && (
          <span className="ml-auto">
            {totals.approved} of {totals.judged} approved ({pct(totals.approved, totals.judged)}) over {judgedDays.length}{" "}
            {judgedDays.length === 1 ? "day" : "days"}
          </span>
        )}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Blurbs approved and held by the ingest gate, per day. The table below lists every value.">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={M.left + PLOT_W} y1={y(t)} y2={y(t)} stroke="var(--color-border)" strokeWidth={1} />
            <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted text-[11px] tabular-nums">
              {t}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const cx = M.left + band * i + band / 2;
          const approvedTop = y(d.approved);
          const heldTop = y(d.judged);
          return (
            <g key={d.date}>
              {d.approved > 0 && (
                <path d={segment(cx - barW / 2, approvedTop, barW, y(0) - approvedTop, d.held === 0)} fill={APPROVED}>
                  <title>{`${fmtDay(d.date)}: ${d.approved} approved`}</title>
                </path>
              )}
              {d.held > 0 && (
                <path
                  d={segment(cx - barW / 2, heldTop, barW, Math.max(approvedTop - heldTop - (d.approved > 0 ? GAP : 0), 1), true)}
                  fill={HELD}
                  opacity={0.6}
                >
                  <title>{`${fmtDay(d.date)}: ${d.held} held`}</title>
                </path>
              )}
              {d.judged > 0 && (
                <text x={cx} y={heldTop - 6} textAnchor="middle" className="fill-text text-[11px] font-semibold tabular-nums">
                  {pct(d.approved, d.judged)}
                </text>
              )}
              <text x={cx} y={H - 8} textAnchor="middle" className="fill-muted text-[11px]">
                {fmtDay(d.date)}
              </text>
            </g>
          );
        })}
      </svg>

      <table className="mt-3 w-full border-collapse text-xs tabular-nums">
        <thead>
          <tr className="border-b border-border text-left text-muted">
            <th className="py-1.5 pr-3 font-medium">Day</th>
            <th className="py-1.5 pr-3 text-right font-medium">Judged</th>
            <th className="py-1.5 pr-3 text-right font-medium">Approved</th>
            <th className="py-1.5 pr-3 text-right font-medium">Held</th>
            <th className="py-1.5 pr-3 text-right font-medium">Mean score</th>
            <th className="py-1.5 text-right font-medium">Rewrites replaced</th>
          </tr>
        </thead>
        <tbody>
          {[...days].reverse().map((d) => (
            <tr key={d.date} className="border-b border-border last:border-0">
              <td className="py-1.5 pr-3">{fmtDay(d.date)}</td>
              <td className="py-1.5 pr-3 text-right">{d.judged}</td>
              <td className="py-1.5 pr-3 text-right">{d.approved}</td>
              <td className="py-1.5 pr-3 text-right">{d.held}</td>
              <td className="py-1.5 pr-3 text-right">{d.meanScore?.toFixed(2) ?? "—"}</td>
              <td className="py-1.5 text-right">{d.rewritesAttempted > 0 ? `${d.rewritesReplaced} of ${d.rewritesAttempted}` : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

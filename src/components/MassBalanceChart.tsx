"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CheckCircle2, Scale, ShieldAlert, Sprout } from "lucide-react";

import type { MassBalanceSummary } from "@/lib/types";
import { formatMass, formatNumber, formatPercent } from "@/lib/format";

interface MassBalanceChartProps {
  readonly summary: MassBalanceSummary;
}

/** Minimum certified share required before a "sustainable" claim is defensible. */
const CERTIFIED_THRESHOLD = 0.3;

const TOOLTIP_STYLE = {
  backgroundColor: "#0c1218",
  border: "1px solid #1e2d38",
  borderRadius: "0.5rem",
  fontSize: "11px",
  color: "#e6f0f5",
} as const;

/**
 * Certified sustainable volume against standard commodity mixtures.
 *
 * A sustainable claim is only auditable if the certified fraction can be
 * reconciled against the physical volume that stayed inside a documented chain
 * of custody. This chart shows both series per flow and the resulting ratio, so
 * an auditor can confirm the certified figure was never inflated.
 */
export default function MassBalanceChart({ summary }: MassBalanceChartProps) {
  const chartData = useMemo(
    () =>
      summary.flows.map((flow) => ({
        name: flow.label,
        reference: flow.reference,
        certifiedKg: flow.certifiedKg,
        conventionalKg: flow.inputKg - flow.certifiedKg,
      })),
    [summary.flows],
  );

  const donutData = useMemo(
    () => [
      { name: "Certified sustainable", value: summary.certifiedKg },
      { name: "Conventional", value: summary.conventionalKg },
    ],
    [summary.certifiedKg, summary.conventionalKg],
  );

  const meetsThreshold = summary.certifiedRatio >= CERTIFIED_THRESHOLD;
  const delta = summary.certifiedKg + summary.conventionalKg;
  const reconciles = delta === summary.totalInputKg;

  return (
    <section className="panel" aria-label="Mass balance certification">
      <div className="panel-header">
        <div className="flex items-center gap-2">
          <Scale className="size-4 text-leaf" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-ink">Mass Balance Certification</h2>
        </div>
        <span className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] text-ink-muted">
          {summary.periodLabel}
        </span>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_230px]">
        {/* Stacked volume per flow */}
        <div className="h-[300px] min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2d38" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: "#64798a", fontSize: 10 }}
                tickLine={false}
                axisLine={{ stroke: "#1e2d38" }}
                interval={0}
                height={52}
                angle={-12}
                textAnchor="end"
              />
              <YAxis
                tick={{ fill: "#64798a", fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(value: number) => `${Math.round(value / 1000)}t`}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelStyle={{ color: "#93a9b7", fontSize: 11, marginBottom: 4 }}
                formatter={(value, name) =>
                  `${formatMass(Number(value))} ${
                    name === "certifiedKg" ? "certified" : "conventional"
                  }`
                }
              />
              <Legend
                wrapperStyle={{ fontSize: 11, color: "#93a9b7", paddingTop: 6 }}
                formatter={(value: string) =>
                  value === "certifiedKg" ? "Certified sustainable" : "Conventional mixture"
                }
              />
              <Bar
                dataKey="certifiedKg"
                stackId="volume"
                fill="#34d399"
                radius={[0, 0, 3, 3]}
                maxBarSize={56}
              />
              <Bar
                dataKey="conventionalKg"
                stackId="volume"
                fill="#1e2d38"
                stroke="#2b3f4d"
                radius={[3, 3, 0, 0]}
                maxBarSize={56}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Certified share donut */}
        <div className="flex flex-col gap-3">
          <div className="relative h-[168px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donutData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={52}
                  outerRadius={72}
                  paddingAngle={2}
                  stroke="none"
                >
                  <Cell fill="#34d399" />
                  <Cell fill="#1e2d38" />
                </Pie>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(value) => formatMass(Number(value))}
                />
              </PieChart>
            </ResponsiveContainer>

            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="text-center">
                <p className="text-xl font-semibold text-leaf">
                  {formatPercent(summary.certifiedRatio)}
                </p>
                <p className="text-[10px] text-ink-faint">certified</p>
              </div>
            </div>
          </div>

          <dl className="space-y-1.5 text-[11px]">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-faint">Physical input</dt>
              <dd className="text-ink-muted">{formatMass(summary.totalInputKg)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="flex items-center gap-1 text-ink-faint">
                <Sprout className="size-3 text-leaf" aria-hidden="true" />
                Certified
              </dt>
              <dd className="text-leaf">{formatMass(summary.certifiedKg)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-ink-faint">Conventional</dt>
              <dd className="text-ink-muted">{formatMass(summary.conventionalKg)}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Audit verdict */}
      <div className="grid gap-3 border-t border-line bg-surface-2/50 p-4 sm:grid-cols-2">
        <div
          className={`flex items-start gap-2.5 rounded-lg border p-3 ${
            meetsThreshold ? "border-leaf/35 bg-leaf/8" : "border-clay/35 bg-clay/8"
          }`}
        >
          {meetsThreshold ? (
            <CheckCircle2 className="mt-px size-4 shrink-0 text-leaf" aria-hidden="true" />
          ) : (
            <ShieldAlert className="mt-px size-4 shrink-0 text-clay" aria-hidden="true" />
          )}
          <div>
            <p
              className={`text-xs font-semibold ${meetsThreshold ? "text-leaf" : "text-clay"}`}
            >
              {meetsThreshold
                ? "Ratio supports a sustainable claim"
                : "Certified share below the auditable threshold"}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">
              {formatPercent(summary.certifiedRatio)} certified against a{" "}
              {formatPercent(CERTIFIED_THRESHOLD)} minimum.{" "}
              {meetsThreshold
                ? `Up to ${formatMass(summary.certifiedKg)} may be sold as certified product.`
                : "Only the certified volume may be sold as certified product."}
            </p>
          </div>
        </div>

        <div
          className={`flex items-start gap-2.5 rounded-lg border p-3 ${
            reconciles ? "border-sky/30 bg-sky/6" : "border-rose/35 bg-rose/8"
          }`}
        >
          {reconciles ? (
            <CheckCircle2 className="mt-px size-4 shrink-0 text-sky" aria-hidden="true" />
          ) : (
            <ShieldAlert className="mt-px size-4 shrink-0 text-rose" aria-hidden="true" />
          )}
          <div>
            <p className={`text-xs font-semibold ${reconciles ? "text-sky" : "text-rose"}`}>
              {reconciles ? "Ledger reconciles" : "Ledger does not reconcile"}
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">
              Flow totals sum to {formatNumber(delta)} kg against a declared input of{" "}
              {formatNumber(summary.totalInputKg)} kg.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { STATUS_LABELS, VARIANT_LABELS } from "../lib/ducSchema";
import { entityDisplayName } from "../lib/names";
import { Card, Badge, Spinner, EmptyState, cx } from "../components/ui";
import { FileText, Check, Building, Clock, AlertTriangle, ChevronRight } from "../components/icons";

/* ------------------------------------------------------------------ tipos -- */

interface Track {
  stage: number;
  state: "pending" | "done";
  date?: string | null;
}

interface DucRow {
  id: string;
  status: string;
  variant: string;
  current_stage: number | null;
  tracking: Track[] | null;
  title: string | null;
  created_at: string;
  updated_at: string;
  client_id: string | null;
}

type Period = "30" | "90" | "all";

/* --------------------------------------------------------------- helpers -- */

const MS_DAY = 86_400_000;
const STALE_DAYS = 14; // sem atividade há mais de N dias = "parado"

function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysSince(iso: string | null | undefined, now: number): number | null {
  const d = parseDate(iso);
  if (!d) return null;
  return Math.max(0, Math.floor((now - d.getTime()) / MS_DAY));
}

function relTime(iso: string | null | undefined, now: number): string {
  const d = daysSince(iso, now);
  if (d === null) return "—";
  if (d === 0) return "hoje";
  if (d === 1) return "ontem";
  if (d < 30) return `há ${d} dias`;
  const m = Math.floor(d / 30);
  return m === 1 ? "há 1 mês" : `há ${m} meses`;
}

const STATUS_COLOR: Record<string, { dot: string; bar: string; pill: string }> = {
  draft: { dot: "bg-slate-400", bar: "#94a3b8", pill: "bg-slate-50 text-slate-600 ring-slate-200" },
  in_progress: { dot: "bg-amber-400", bar: "#f59e0b", pill: "bg-amber-50 text-amber-700 ring-amber-200" },
  delivered: { dot: "bg-blue-400", bar: "#3b82f6", pill: "bg-blue-50 text-blue-700 ring-blue-200" },
  closed: { dot: "bg-emerald-400", bar: "#10b981", pill: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
};
const STATUS_ORDER = ["draft", "in_progress", "delivered", "closed"];
const MONTH_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/* ----------------------------------------------------------- subcomponentes -- */

function Kpi({
  label,
  value,
  icon,
  tone = "slate",
  hint,
}: {
  label: string;
  value: string | number;
  icon: ReactNode;
  tone?: "slate" | "amber" | "blue" | "emerald" | "brand" | "red";
  hint?: string;
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-50 text-slate-500",
    amber: "bg-amber-50 text-amber-600",
    blue: "bg-blue-50 text-blue-600",
    emerald: "bg-emerald-50 text-emerald-600",
    brand: "bg-brand-50 text-brand-700",
    red: "bg-red-50 text-red-600",
  };
  return (
    <Card className="p-4 transition-shadow duration-150 hover:shadow-elevated">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
        <span className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", tones[tone])}>
          {icon}
        </span>
      </div>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-slate-800">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
    </Card>
  );
}

/** Donut SVG por estado. */
function StatusDonut({ counts, total }: { counts: Record<string, number>; total: number }) {
  const R = 54;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const slices = STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => {
    const frac = total > 0 ? counts[s] / total : 0;
    const len = frac * C;
    const slice = { s, dash: len, gap: C - len, off: -offset };
    offset += len;
    return slice;
  });
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
      <div className="relative h-40 w-40 shrink-0">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
          <circle cx="70" cy="70" r={R} fill="none" stroke="#f1f5f9" strokeWidth="15" />
          {slices.map((sl) => (
            <circle
              key={sl.s}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={STATUS_COLOR[sl.s]?.bar ?? "#94a3b8"}
              strokeWidth="15"
              strokeLinecap="round"
              strokeDasharray={`${Math.max(0, sl.dash - 2)} ${sl.gap + 2}`}
              strokeDashoffset={sl.off}
              className="transition-all duration-500"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums text-slate-800">{total}</span>
          <span className="text-[11px] text-slate-400">DUCs</span>
        </div>
      </div>
      <ul className="flex-1 space-y-2">
        {STATUS_ORDER.map((s) => {
          const n = counts[s] ?? 0;
          const pct = total > 0 ? Math.round((n / total) * 100) : 0;
          return (
            <li key={s} className="flex items-center gap-2.5 text-sm">
              <span className={cx("h-2.5 w-2.5 shrink-0 rounded-full", STATUS_COLOR[s]?.dot)} />
              <span className="flex-1 text-slate-600">{STATUS_LABELS[s] ?? s}</span>
              <span className="font-medium tabular-nums text-slate-700">{n}</span>
              <span className="w-9 text-right text-xs tabular-nums text-slate-400">{pct}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Barras verticais para a distribuição por etapa atual. */
function StageBars({ byStage }: { byStage: Array<{ stage: number; count: number }> }) {
  const max = Math.max(1, ...byStage.map((b) => b.count));
  if (byStage.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">Sem dados de etapa.</p>;
  }
  return (
    <div className="flex h-44 items-end gap-2">
      {byStage.map((b) => {
        const h = Math.round((b.count / max) * 100);
        return (
          <div key={b.stage} className="group flex flex-1 flex-col items-center gap-1.5">
            <span className="text-xs font-medium tabular-nums text-slate-500">{b.count}</span>
            <div className="flex w-full flex-1 items-end">
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-brand to-brand-light transition-all duration-500 group-hover:opacity-80"
                style={{ height: `${Math.max(4, h)}%` }}
                title={`Etapa ${b.stage}: ${b.count}`}
              />
            </div>
            <span className="text-[11px] tabular-nums text-slate-400">{b.stage}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Gráfico de área (criação ao longo do tempo). */
function MonthArea({ months }: { months: Array<{ key: string; label: string; count: number }> }) {
  const max = Math.max(1, ...months.map((m) => m.count));
  const W = 320;
  const H = 120;
  const P = 10;
  const n = months.length;
  const x = (i: number) => P + (n > 1 ? (i / (n - 1)) * (W - 2 * P) : 0);
  const y = (c: number) => H - P - (c / max) * (H - 2 * P);
  const line = months.map((m, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(m.count).toFixed(1)}`).join(" ");
  const area = `${line} L ${x(n - 1).toFixed(1)} ${H - P} L ${x(0).toFixed(1)} ${H - P} Z`;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <defs>
          <linearGradient id="ducArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#14b8a6" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#14b8a6" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#ducArea)" />
        <path d={line} fill="none" stroke="#0d9488" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {months.map((m, i) =>
          m.count > 0 ? <circle key={m.key} cx={x(i)} cy={y(m.count)} r="2.6" fill="#0d9488" /> : null
        )}
      </svg>
      <div className="mt-1 flex justify-between px-1 text-[10px] text-slate-400">
        {months.map((m, i) => (i % 2 === 0 ? <span key={m.key}>{m.label}</span> : <span key={m.key} />))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- página -- */

export default function Dashboard() {
  const { activeOrgId } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<DucRow[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("all");

  useEffect(() => {
    if (!activeOrgId) {
      setRows([]);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);
    (async () => {
      const { data, error: err } = await supabase
        .from("anew_client_ducs")
        .select("id, status, variant, current_stage, tracking, title, created_at, updated_at, client_id")
        .eq("organization_id", activeOrgId)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(2000);
      if (!alive) return;
      if (err) {
        setError(err.message);
        setRows([]);
        setLoading(false);
        return;
      }
      const list = (data ?? []) as DucRow[];
      setRows(list);

      // Resolve nomes de cliente (para a atividade recente).
      const clientIds = Array.from(new Set(list.map((r) => r.client_id).filter(Boolean))) as string[];
      if (clientIds.length > 0) {
        const { data: clients } = await supabase
          .from("anew_clients")
          .select("id, entity_id")
          .in("id", clientIds);
        const entIds = Array.from(new Set((clients ?? []).map((c) => c.entity_id as string).filter(Boolean)));
        const nameByEntity = new Map<string, string>();
        if (entIds.length > 0) {
          const { data: ents } = await supabase
            .from("anew_entities")
            .select("id, display_name, first_name, last_name")
            .in("id", entIds);
          (ents ?? []).forEach((e) => nameByEntity.set(e.id as string, entityDisplayName(e)));
        }
        const map = new Map<string, string>();
        (clients ?? []).forEach((c) => map.set(c.id as string, nameByEntity.get(c.entity_id as string) ?? "Cliente"));
        if (alive) setNames(map);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [activeOrgId]);

  const filtered = useMemo(() => {
    if (period === "all") return rows;
    const now = Date.now();
    const cutoff = now - Number(period) * MS_DAY;
    return rows.filter((r) => {
      const d = parseDate(r.created_at);
      return d ? d.getTime() >= cutoff : false;
    });
  }, [rows, period]);

  const stats = useMemo(() => {
    const now = Date.now();
    const nowDate = new Date(now);
    const curMonth = nowDate.getFullYear() * 12 + nowDate.getMonth();

    const counts: Record<string, number> = { draft: 0, in_progress: 0, delivered: 0, closed: 0 };
    const stageMap = new Map<number, number>();
    const monthMap = new Map<string, number>();

    let openDaysSum = 0, openDaysN = 0;
    let closeDaysSum = 0, closeDaysN = 0;
    let closedThisMonth = 0;
    let progressSum = 0, progressN = 0;
    let stale = 0;

    for (const r of filtered) {
      if (r.status in counts) counts[r.status] += 1;

      if (r.status !== "closed") {
        const d = daysSince(r.created_at, now);
        if (d !== null) {
          openDaysSum += d;
          openDaysN += 1;
        }
        const inact = daysSince(r.updated_at, now);
        if (inact !== null && inact > STALE_DAYS) stale += 1;
      } else {
        // tempo de fecho: created -> updated
        const c = parseDate(r.created_at);
        const u = parseDate(r.updated_at);
        if (c && u) {
          closeDaysSum += Math.max(0, (u.getTime() - c.getTime()) / MS_DAY);
          closeDaysN += 1;
        }
      }

      if (r.status === "closed") {
        const u = parseDate(r.updated_at);
        if (u && u.getFullYear() * 12 + u.getMonth() === curMonth) closedThisMonth += 1;
      }

      const st = typeof r.current_stage === "number" ? r.current_stage : null;
      if (st !== null) stageMap.set(st, (stageMap.get(st) ?? 0) + 1);

      const c = parseDate(r.created_at);
      if (c) {
        const key = `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, "0")}`;
        monthMap.set(key, (monthMap.get(key) ?? 0) + 1);
      }

      const tr = Array.isArray(r.tracking) ? r.tracking : [];
      if (tr.length > 0) {
        const done = tr.filter((t) => t?.state === "done").length;
        progressSum += done / tr.length;
        progressN += 1;
      }
    }

    const maxStage = stageMap.size > 0 ? Math.max(...stageMap.keys()) : 0;
    const byStage: Array<{ stage: number; count: number }> = [];
    for (let s = 1; s <= maxStage; s++) byStage.push({ stage: s, count: stageMap.get(s) ?? 0 });

    const months: Array<{ key: string; label: string; count: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(nowDate.getFullYear(), nowDate.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({
        key,
        label: `${MONTH_PT[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
        count: monthMap.get(key) ?? 0,
      });
    }

    const variantCounts: Record<string, number> = {};
    for (const r of filtered) variantCounts[r.variant] = (variantCounts[r.variant] ?? 0) + 1;

    const total = filtered.length;
    return {
      total,
      counts,
      avgOpenDays: openDaysN > 0 ? Math.round(openDaysSum / openDaysN) : 0,
      avgCloseDays: closeDaysN > 0 ? Math.round(closeDaysSum / closeDaysN) : 0,
      closedThisMonth,
      avgProgress: progressN > 0 ? progressSum / progressN : 0,
      completionRate: total > 0 ? Math.round((counts.closed / total) * 100) : 0,
      stale,
      byStage,
      months,
      variantCounts,
    };
  }, [filtered]);

  // Atividade recente (mais recentes por updated_at).
  const recent = useMemo(() => filtered.slice(0, 7), [filtered]);

  /* --------------------------------------------------------------- render -- */

  if (loading) return <Spinner label="A carregar dashboard…" />;

  if (error) {
    return (
      <Card className="m-4">
        <EmptyState icon={<FileText width={22} height={22} />} title="Não foi possível carregar" description={error} />
      </Card>
    );
  }
  if (!activeOrgId) {
    return (
      <Card className="m-4">
        <EmptyState
          icon={<Building width={22} height={22} />}
          title="Sem organização ativa"
          description="Seleciona uma organização para ver o dashboard."
        />
      </Card>
    );
  }

  const progressPct = Math.round(stats.avgProgress * 100);
  const periods: Array<{ id: Period; label: string }> = [
    { id: "30", label: "30 dias" },
    { id: "90", label: "90 dias" },
    { id: "all", label: "Tudo" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      {/* Hero */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-br from-brand-50 via-white to-teal-50/40 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Visão geral dos Documentos Únicos de Cliente
              {stats.total > 0 && (
                <>
                  {" "}· <span className="font-medium text-slate-700">{stats.total}</span> no período ·{" "}
                  <span className="font-medium text-emerald-600">{stats.completionRate}%</span> concluídos
                </>
              )}
            </p>
          </div>
          <div className="inline-flex shrink-0 rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
            {periods.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={cx(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  period === p.id ? "bg-brand text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {stats.total === 0 ? (
        <Card>
          <EmptyState
            icon={<FileText width={22} height={22} />}
            title="Ainda não há DUCs neste período"
            description="Cria um Documento Único de Cliente ou alarga o período do filtro."
          />
        </Card>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Total" value={stats.total} tone="brand" icon={<FileText width={16} height={16} />} />
            <Kpi label="Em curso" value={stats.counts.in_progress} tone="amber" icon={<Clock width={16} height={16} />} />
            <Kpi label="Fechados" value={stats.counts.closed} tone="emerald" icon={<Check width={16} height={16} />} />
            <Kpi
              label="Taxa de conclusão"
              value={`${stats.completionRate}%`}
              tone="emerald"
              icon={<Check width={16} height={16} />}
            />
            <Kpi
              label="Média dias aberto"
              value={stats.avgOpenDays}
              tone="slate"
              icon={<Clock width={16} height={16} />}
              hint="não-fechados"
            />
            <Kpi
              label="Tempo médio de fecho"
              value={`${stats.avgCloseDays}d`}
              tone="blue"
              icon={<Clock width={16} height={16} />}
              hint="criação → fecho"
            />
            <Kpi
              label="Fechados este mês"
              value={stats.closedThisMonth}
              tone="emerald"
              icon={<Check width={16} height={16} />}
            />
            <Kpi
              label="Parados +14 dias"
              value={stats.stale}
              tone={stats.stale > 0 ? "red" : "slate"}
              icon={<AlertTriangle width={16} height={16} />}
              hint="sem atividade"
            />
          </div>

          {/* Progresso médio */}
          <Card className="p-5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-700">Progresso médio dos DUCs</p>
              <span className="text-sm font-semibold tabular-nums text-brand">{progressPct}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand to-brand-light transition-all duration-700"
                style={{ width: `${Math.min(100, Math.max(0, progressPct))}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-slate-400">Média das etapas concluídas sobre o total de cada tracking.</p>
          </Card>

          {/* Gráficos */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <p className="mb-4 text-sm font-medium text-slate-700">Distribuição por estado</p>
              <StatusDonut counts={stats.counts} total={stats.total} />
            </Card>
            <Card className="p-5">
              <p className="mb-4 text-sm font-medium text-slate-700">DUCs por etapa atual</p>
              <StageBars byStage={stats.byStage} />
            </Card>
          </div>

          <Card className="p-5">
            <p className="mb-3 text-sm font-medium text-slate-700">DUCs criados ao longo do tempo</p>
            <MonthArea months={stats.months} />
          </Card>

          {/* Atividade recente */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5">
              <p className="text-sm font-medium text-slate-700">Atividade recente</p>
              <button
                type="button"
                onClick={() => navigate("/")}
                className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-dark"
              >
                Ver todos <ChevronRight width={13} height={13} />
              </button>
            </div>
            <ul className="divide-y divide-slate-100">
              {recent.map((r) => {
                const name = (r.client_id ? names.get(r.client_id) : null) ?? r.title ?? "—";
                const done = (r.tracking ?? []).filter((t) => t.state === "done").length;
                const total = r.tracking?.length || 0;
                return (
                  <li
                    key={r.id}
                    onClick={() => navigate(`/duc/${r.id}`)}
                    className="flex cursor-pointer items-center gap-3 px-5 py-3 transition-colors hover:bg-slate-50/70"
                  >
                    <span className={cx("h-2 w-2 shrink-0 rounded-full", STATUS_COLOR[r.status]?.dot ?? "bg-slate-300")} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{name}</p>
                      <p className="text-xs text-slate-400">
                        {total > 0 ? `${done}/${total} etapas · ` : ""}
                        atualizado {relTime(r.updated_at, Date.now())}
                      </p>
                    </div>
                    <Badge className={STATUS_COLOR[r.status]?.pill}>{STATUS_LABELS[r.status] ?? r.status}</Badge>
                    <ChevronRight width={15} height={15} className="shrink-0 text-slate-300" />
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Variantes */}
          <Card className="flex flex-wrap items-center gap-2 p-4">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Variantes</span>
            {Object.keys(stats.variantCounts).length === 0 ? (
              <span className="text-sm text-slate-400">—</span>
            ) : (
              Object.entries(stats.variantCounts).map(([v, n]) => (
                <Badge key={v}>
                  {VARIANT_LABELS[v as keyof typeof VARIANT_LABELS] ?? v}
                  <span className="font-semibold tabular-nums">{n}</span>
                </Badge>
              ))
            )}
          </Card>
        </>
      )}
    </div>
  );
}

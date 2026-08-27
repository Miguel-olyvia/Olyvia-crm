import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../auth/AuthProvider";
import { STATUS_LABELS, VARIANT_LABELS } from "../lib/ducSchema";
import { Card, Badge, Spinner, EmptyState, cx } from "../components/ui";
import { FileText, Check, Building } from "../components/icons";

/* ------------------------------------------------------------------ tipos -- */

/** Entrada de tracking (subconjunto do que precisamos aqui). */
interface Track {
  stage: number;
  state: "pending" | "done";
  date?: string | null;
}

/** Linha do DUC tal como vem da query (campos selecionados). */
interface DucRow {
  id: string;
  status: string;
  variant: string;
  current_stage: number | null;
  tracking: Track[] | null;
  created_at: string;
  updated_at: string;
  client_id: string | null;
}

type Period = "30" | "90" | "all";

/* --------------------------------------------------------------- helpers -- */

const MS_DAY = 86_400_000;

/** Faz parse seguro de uma data ISO; devolve null se inválida. */
function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Dias (arredondados) entre `iso` e agora; null se data inválida. */
function daysSince(iso: string | null | undefined, now: number): number | null {
  const d = parseDate(iso);
  if (!d) return null;
  return Math.max(0, Math.floor((now - d.getTime()) / MS_DAY));
}

/** Cores por estado — acentos consistentes na página. */
const STATUS_COLOR: Record<string, { dot: string; bar: string; text: string }> = {
  draft: { dot: "bg-slate-400", bar: "#94a3b8", text: "text-slate-600" },
  in_progress: { dot: "bg-amber-400", bar: "#fbbf24", text: "text-amber-600" },
  delivered: { dot: "bg-blue-400", bar: "#60a5fa", text: "text-blue-600" },
  closed: { dot: "bg-emerald-400", bar: "#34d399", text: "text-emerald-600" },
};

const STATUS_ORDER = ["draft", "in_progress", "delivered", "closed"];

/** Etiqueta "AAAA-MM" curta para o eixo (ex.: "ago 25"). */
const MONTH_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/* ----------------------------------------------------------- subcomponentes -- */

/** Cartão de KPI: número grande + rótulo + acento opcional. */
function Kpi({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: string | number;
  accent?: string;
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={cx("mt-1.5 text-3xl font-semibold tabular-nums text-slate-800", accent)}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </Card>
  );
}

/** Donut SVG por estado, com contagens em `data` (mesma ordem de STATUS_ORDER). */
function StatusDonut({ counts, total }: { counts: Record<string, number>; total: number }) {
  const R = 54;
  const C = 2 * Math.PI * R;
  // Acumula fatias; se total 0, mostra anel cinza vazio.
  let offset = 0;
  const slices = STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => {
    const frac = total > 0 ? counts[s] / total : 0;
    const len = frac * C;
    const slice = { s, dash: len, gap: C - len, off: -offset };
    offset += len;
    return slice;
  });

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative h-40 w-40 shrink-0">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
          <circle cx="70" cy="70" r={R} fill="none" stroke="#f1f5f9" strokeWidth="16" />
          {slices.map((sl) => (
            <circle
              key={sl.s}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={STATUS_COLOR[sl.s]?.bar ?? "#94a3b8"}
              strokeWidth="16"
              strokeLinecap="butt"
              strokeDasharray={`${sl.dash} ${sl.gap}`}
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
              <span className="tabular-nums font-medium text-slate-700">{n}</span>
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
          <div key={b.stage} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="text-xs tabular-nums font-medium text-slate-500">{b.count}</span>
            <div className="flex w-full flex-1 items-end">
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-brand to-brand-light transition-all duration-500"
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

/** Barras por mês (criação ao longo do tempo). */
function MonthBars({ months }: { months: Array<{ key: string; label: string; count: number }> }) {
  const max = Math.max(1, ...months.map((m) => m.count));
  if (months.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">Sem dados no período.</p>;
  }
  return (
    <div className="flex h-44 items-end gap-2">
      {months.map((m) => {
        const h = Math.round((m.count / max) * 100);
        return (
          <div key={m.key} className="flex flex-1 flex-col items-center gap-1.5">
            <span className="text-xs tabular-nums font-medium text-slate-500">{m.count}</span>
            <div className="flex w-full flex-1 items-end">
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-emerald-300 to-emerald-500 transition-all duration-500"
                style={{ height: `${Math.max(4, h)}%` }}
                title={`${m.label}: ${m.count}`}
              />
            </div>
            <span className="text-[11px] text-slate-400">{m.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------- página -- */

export default function Dashboard() {
  const { activeOrgId } = useAuth();
  const [rows, setRows] = useState<DucRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("all");

  // Carrega os DUCs da org ativa quando esta muda.
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
        .select("id, status, variant, current_stage, tracking, created_at, updated_at, client_id")
        .eq("organization_id", activeOrgId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (!alive) return;
      if (err) {
        setError(err.message);
        setRows([]);
      } else {
        setRows((data ?? []) as DucRow[]);
      }
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [activeOrgId]);

  // Filtra por período (client-side) antes de qualquer cálculo.
  const filtered = useMemo(() => {
    if (period === "all") return rows;
    const now = Date.now();
    const cutoff = now - Number(period) * MS_DAY;
    return rows.filter((r) => {
      const d = parseDate(r.created_at);
      return d ? d.getTime() >= cutoff : false;
    });
  }, [rows, period]);

  // Métricas derivadas — tudo robusto a nulos/tracking vazio.
  const stats = useMemo(() => {
    const now = Date.now();
    const nowDate = new Date(now);
    const curMonth = nowDate.getFullYear() * 12 + nowDate.getMonth();

    const counts: Record<string, number> = { draft: 0, in_progress: 0, delivered: 0, closed: 0 };
    const stageMap = new Map<number, number>();
    const monthMap = new Map<string, number>();

    let openDaysSum = 0;
    let openDaysN = 0;
    let closedThisMonth = 0;
    let progressSum = 0;
    let progressN = 0;

    for (const r of filtered) {
      // Contagem por estado (ignora estados fora do conhecido no donut, mas conta no total).
      if (r.status in counts) counts[r.status] += 1;

      // Média de dias aberto (não-fechados).
      if (r.status !== "closed") {
        const d = daysSince(r.created_at, now);
        if (d !== null) {
          openDaysSum += d;
          openDaysN += 1;
        }
      }

      // Fechados este mês (por updated_at).
      if (r.status === "closed") {
        const u = parseDate(r.updated_at);
        if (u && u.getFullYear() * 12 + u.getMonth() === curMonth) closedThisMonth += 1;
      }

      // Por etapa atual.
      const st = typeof r.current_stage === "number" ? r.current_stage : null;
      if (st !== null) stageMap.set(st, (stageMap.get(st) ?? 0) + 1);

      // Criados por ano-mês.
      const c = parseDate(r.created_at);
      if (c) {
        const key = `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, "0")}`;
        monthMap.set(key, (monthMap.get(key) ?? 0) + 1);
      }

      // Progresso médio (etapas done / total do tracking).
      const tr = Array.isArray(r.tracking) ? r.tracking : [];
      if (tr.length > 0) {
        const done = tr.filter((t) => t?.state === "done").length;
        progressSum += done / tr.length;
        progressN += 1;
      }
    }

    // Etapas: intervalo contínuo 1..max para barras legíveis.
    const maxStage = stageMap.size > 0 ? Math.max(...stageMap.keys()) : 0;
    const byStage: Array<{ stage: number; count: number }> = [];
    for (let s = 1; s <= maxStage; s++) byStage.push({ stage: s, count: stageMap.get(s) ?? 0 });

    // Últimos 12 meses até ao mês corrente (preenche buracos com 0).
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

    // Variantes (para um rodapé informativo).
    const variantCounts: Record<string, number> = {};
    for (const r of filtered) variantCounts[r.variant] = (variantCounts[r.variant] ?? 0) + 1;

    return {
      total: filtered.length,
      counts,
      avgOpenDays: openDaysN > 0 ? Math.round(openDaysSum / openDaysN) : 0,
      closedThisMonth,
      avgProgress: progressN > 0 ? progressSum / progressN : 0,
      byStage,
      months,
      variantCounts,
    };
  }, [filtered]);

  /* --------------------------------------------------------------- render -- */

  if (loading) return <Spinner label="A carregar dashboard…" />;

  if (error) {
    return (
      <Card className="m-4">
        <EmptyState
          icon={<FileText width={22} height={22} />}
          title="Não foi possível carregar"
          description={error}
        />
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
      {/* Cabeçalho + filtro de período */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-400">Visão geral dos Documentos Únicos de Cliente</p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
          {periods.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={cx(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                period === p.id
                  ? "bg-brand text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100"
              )}
            >
              {p.label}
            </button>
          ))}
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi label="Total" value={stats.total} />
            <Kpi
              label="Em curso"
              value={stats.counts.in_progress}
              accent="text-amber-600"
            />
            <Kpi label="Entregues" value={stats.counts.delivered} accent="text-blue-600" />
            <Kpi label="Fechados" value={stats.counts.closed} accent="text-emerald-600" />
            <Kpi label="Rascunhos" value={stats.counts.draft} accent="text-slate-500" />
            <Kpi
              label="Média dias aberto"
              value={stats.avgOpenDays}
              hint="dos DUCs não fechados"
            />
            <Kpi
              label="Fechados este mês"
              value={stats.closedThisMonth}
              accent="text-emerald-600"
            />
            <Card className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
                <Check width={20} height={20} />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Progresso médio
                </p>
                <p className="text-2xl font-semibold tabular-nums text-slate-800">{progressPct}%</p>
              </div>
            </Card>
          </div>

          {/* Barra grande de progresso médio */}
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
            <p className="mt-1.5 text-xs text-slate-400">
              Média das etapas concluídas sobre o total de cada tracking.
            </p>
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
            <p className="mb-4 text-sm font-medium text-slate-700">
              DUCs criados ao longo do tempo
            </p>
            <MonthBars months={stats.months} />
          </Card>

          {/* Rodapé: variantes */}
          <Card className="flex flex-wrap items-center gap-2 p-4">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Variantes
            </span>
            {Object.keys(stats.variantCounts).length === 0 ? (
              <span className="text-sm text-slate-400">—</span>
            ) : (
              Object.entries(stats.variantCounts).map(([v, n]) => (
                <Badge key={v}>
                  {VARIANT_LABELS[v as keyof typeof VARIANT_LABELS] ?? v}
                  <span className="tabular-nums font-semibold">{n}</span>
                </Badge>
              ))
            )}
          </Card>
        </>
      )}
    </div>
  );
}

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency } from "@/lib/utils";

interface WorkflowStage {
  id: string;
  name: string;
  label: string;
  color: string;
  stage_order: number;
  is_won?: boolean;
  is_lost?: boolean;
}

interface Proposal {
  id: string;
  title: string;
  value: number;
  status: string;
  stage_id: string | null;
  created_at: string;
  valid_until: string | null;
  assigned_to?: string | null;
  accepted_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  proposal_workflow_stages?: WorkflowStage | null;
}

interface ProposalsDashboardViewProps {
  proposals: Proposal[];
  workflowStages: WorkflowStage[];
  getProposalStage: (p: Proposal) => WorkflowStage | null;
  comercialNamesMap: Record<string, string>;
  isLoading?: boolean;
  hasError?: boolean;
  errorMessage?: string;
}

// Pick readable text color (black/white) for a given hex background via YIQ luminance.
function getReadableTextColor(hex: string): string {
  const cleaned = hex.replace("#", "");
  if (cleaned.length !== 6) return "#ffffff";
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? "#0f172a" : "#ffffff";
}

export function ProposalsDashboardView({
  proposals,
  workflowStages,
  getProposalStage,
  comercialNamesMap,
  isLoading,
  hasError,
  errorMessage,
}: ProposalsDashboardViewProps) {
  const funnelData = useMemo(() => {
    const ordered = [...workflowStages]
      .filter(s => !s.is_lost)
      .sort((a, b) => a.stage_order - b.stage_order);

    const directCount: Record<string, number> = {};
    const directValue: Record<string, number> = {};
    proposals.forEach(p => {
      const sId = getProposalStage(p)?.id;
      if (!sId) return;
      directCount[sId] = (directCount[sId] || 0) + 1;
      directValue[sId] = (directValue[sId] || 0) + Number(p.value);
    });

    return ordered.map((stage, idx) => {
      const count = directCount[stage.id] || 0;
      const value = directValue[stage.id] || 0;
      const nextStage = ordered[idx + 1];
      const nextCount = nextStage ? (directCount[nextStage.id] || 0) : 0;
      const conversionRate = count > 0 && nextStage ? Math.round((nextCount / count) * 100) : null;
      return { stage, count, value, conversionRate };
    });
  }, [proposals, workflowStages, getProposalStage]);

  const lostSummary = useMemo(() => {
    const lostIds = new Set(workflowStages.filter(s => s.is_lost).map(s => s.id));
    let count = 0;
    let value = 0;
    proposals.forEach(p => {
      const sId = getProposalStage(p)?.id;
      if (sId && lostIds.has(sId)) {
        count++;
        value += Number(p.value);
      }
    });
    return { count, value };
  }, [proposals, workflowStages, getProposalStage]);

  const byMonth = useMemo(() => {
    const wonIds = new Set(workflowStages.filter(s => s.is_won).map(s => s.id));
    const map: Record<string, number> = {};
    proposals.forEach(p => {
      const stage = getProposalStage(p);
      if (!stage || !wonIds.has(stage.id)) return;
      if (!p.accepted_at) return;
      const month = p.accepted_at.slice(0, 7);
      map[month] = (map[month] || 0) + Number(p.value);
    });
    return Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
  }, [proposals, workflowStages, getProposalStage]);

  const rejectionReasons = useMemo(() => {
    const lostIds = new Set(workflowStages.filter(s => s.is_lost).map(s => s.id));
    const map: Record<string, number> = {};
    proposals.forEach(p => {
      const stage = getProposalStage(p);
      if (stage && lostIds.has(stage.id)) {
        const reason = p.rejection_reason || "Outro";
        map[reason] = (map[reason] || 0) + 1;
      }
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [proposals, workflowStages, getProposalStage]);

  const byCommercial = useMemo(() => {
    const map: Record<string, { label: string; count: number; value: number }> = {};
    proposals.forEach(p => {
      const key = p.assigned_to ?? "__unassigned__";
      const label = p.assigned_to
        ? (comercialNamesMap[p.assigned_to] || "...")
        : "Não atribuído";
      if (!map[key]) map[key] = { label, count: 0, value: 0 };
      map[key].label = label;
      map[key].count++;
      map[key].value += Number(p.value);
    });
    return Object.entries(map).sort((a, b) => b[1].value - a[1].value);
  }, [proposals, comercialNamesMap]);

  const winRate = useMemo(() => {
    const wonIds = new Set(workflowStages.filter(s => s.is_won).map(s => s.id));
    const lostIds = new Set(workflowStages.filter(s => s.is_lost).map(s => s.id));
    let won = 0;
    let terminal = 0;
    proposals.forEach(p => {
      const sId = getProposalStage(p)?.id;
      if (!sId) return;
      if (wonIds.has(sId)) { won++; terminal++; }
      else if (lostIds.has(sId)) { terminal++; }
    });
    return {
      won,
      terminal,
      rate: terminal > 0 ? Math.round((won / terminal) * 100) : null,
    };
  }, [proposals, workflowStages, getProposalStage]);

  const expiredOpen = useMemo(() => {
    const terminalIds = new Set(
      workflowStages.filter(s => s.is_won || s.is_lost).map(s => s.id)
    );
    const now = Date.now();
    return proposals.filter(p => {
      const sId = getProposalStage(p)?.id;
      if (!sId || terminalIds.has(sId)) return false;
      return p.valid_until ? Date.parse(p.valid_until) < now : false;
    }).length;
  }, [proposals, workflowStages, getProposalStage]);

  const pipelineValue = useMemo(() => {
    const terminalIds = new Set(
      workflowStages.filter(s => s.is_won || s.is_lost).map(s => s.id)
    );
    return proposals.reduce((sum, p) => {
      const sId = getProposalStage(p)?.id;
      if (!sId || terminalIds.has(sId)) return sum;
      return sum + Number(p.value);
    }, 0);
  }, [proposals, workflowStages, getProposalStage]);

  if (hasError) {
    return (
      <div className="p-4 md:px-6">
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            {errorMessage || "Erro ao carregar dashboard."}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 md:px-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-48 w-full" />
        ))}
      </div>
    );
  }

  if (proposals.length === 0) {
    return (
      <div className="p-4 md:px-6">
        <Card>
          <CardContent className="p-10 text-center space-y-2">
            <p className="text-sm font-medium">Ainda não há propostas para mostrar.</p>
            <p className="text-xs text-muted-foreground">
              Cria a primeira proposta para começar a ver métricas neste dashboard.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const maxFunnel = Math.max(...funnelData.map(f => f.count), 1);
  const maxCommercial = Math.max(...byCommercial.map(c => c[1].value), 1);
  const maxMonth = Math.max(...byMonth.map(m => m[1]), 1);
  const totalRejections = rejectionReasons.reduce((s, r) => s + r[1], 0);

  const rejectionColors = ["#ef4444", "#f97316", "#eab308", "#6b7280", "#a855f7", "#06b6d4"];

  return (
    <div className="p-4 md:px-6 space-y-6 overflow-y-auto h-full">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase">Taxa de Ganho</div>
            <div className="text-2xl font-bold tabular-nums">
              {winRate.rate === null ? "—" : `${winRate.rate}%`}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1">
              {winRate.won} / {winRate.terminal} terminais
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase">Expiradas em Aberto</div>
            <div className="text-2xl font-bold tabular-nums">{expiredOpen}</div>
            <div className="text-[11px] text-muted-foreground mt-1">não terminais com validade ultrapassada</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase">Aceites Totais</div>
            <div className="text-2xl font-bold tabular-nums">{winRate.won}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground uppercase">Pipeline em Curso</div>
            <div className="text-2xl font-bold tabular-nums">{formatCurrency(pipelineValue)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Funil de Conversão</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {funnelData.map((item, idx) => {
              const textColor = getReadableTextColor(item.stage.color);
              return (
                <div key={item.stage.id}>
                  <div className="flex items-center gap-3">
                    <div className="w-28 text-sm font-medium truncate">{item.stage.label}</div>
                    <div className="flex-1 h-8 bg-muted rounded-md overflow-hidden relative">
                      <div
                        className="h-full rounded-md transition-all flex items-center px-3"
                        style={{
                          width: `${Math.max((item.count / maxFunnel) * 100, 8)}%`,
                          backgroundColor: item.stage.color + 'CC',
                        }}
                      >
                        <span className="text-xs font-bold" style={{ color: textColor }}>{item.count}</span>
                      </div>
                    </div>
                    <div className="w-24 text-right text-sm font-medium tabular-nums">{formatCurrency(item.value)}</div>
                  </div>
                  {item.conversionRate !== null && idx < funnelData.length - 1 && (
                    <div className="ml-28 pl-6 py-0.5 text-xs text-muted-foreground">
                      <span className="text-primary font-semibold">{item.conversionRate}%</span> conversão para o stage seguinte →
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {lostSummary.count > 0 && (
            <div className="mt-4 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
              <span>Fugas do funil (Perdidas)</span>
              <span className="tabular-nums">
                <span className="font-semibold text-foreground">{lostSummary.count}</span> · {formatCurrency(lostSummary.value)}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Propostas por Comercial</CardTitle></CardHeader>
          <CardContent>
            <ScrollArea className="h-80 pr-2">
              <div className="space-y-3">
                {byCommercial.map(([key, data]) => (
                  <div key={key} className="flex items-center gap-3">
                    <div className="w-32 text-sm truncate">{data.label}</div>
                    <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
                      <div className="h-full bg-primary/70 rounded" style={{ width: `${(data.value / maxCommercial) * 100}%` }} />
                    </div>
                    <Badge variant="secondary" className="text-xs">{data.count}</Badge>
                    <span className="text-xs font-medium tabular-nums w-20 text-right">{formatCurrency(data.value)}</span>
                  </div>
                ))}
                {byCommercial.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Sem propostas atribuídas.</p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Valor Aceite por Mês</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 h-40">
              {byMonth.map(([month, value]) => (
                <div key={month} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs font-medium tabular-nums">{formatCurrency(value)}</span>
                  <div className="w-full bg-muted rounded-t overflow-hidden flex-1 flex items-end">
                    <div
                      className="w-full bg-primary/60 rounded-t transition-all"
                      style={{ height: `${(value / maxMonth) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{month.slice(5)}/{month.slice(2, 4)}</span>
                </div>
              ))}
              {byMonth.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4 w-full">
                  Sem propostas aceites com data de aceitação registada.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {rejectionReasons.length > 0 && (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Motivos de Rejeição</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {rejectionReasons.map(([reason, count], idx) => {
                const bg = rejectionColors[idx % rejectionColors.length];
                return (
                  <div key={reason} className="flex items-center gap-3">
                    <div className="w-32 text-sm truncate">{reason}</div>
                    <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
                      <div
                        className="h-full rounded transition-all"
                        style={{
                          width: `${(count / totalRejections) * 100}%`,
                          backgroundColor: bg,
                        }}
                      />
                    </div>
                    <span className="text-xs font-medium tabular-nums w-10 text-right">
                      {Math.round((count / totalRejections) * 100)}%
                    </span>
                    <Badge variant="outline" className="text-xs">{count}</Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

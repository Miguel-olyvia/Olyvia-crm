import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { Phone, Mail, UserPlus, Pencil, Send, Check, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays, format } from "date-fns";

import type { ClientHealthScore, ClientContractInfo, ClientTag, ClientInteractionInfo } from "@/hooks/useClientEnrichedData";

interface ClientsRetentionViewProps {
  clients: { id: string; entity_id: string; status: string; created_at: string; assigned_to?: string | null }[];
  healthScores: Map<string, ClientHealthScore>;
  contracts: Map<string, ClientContractInfo>;
  interactions: Map<string, ClientInteractionInfo>;
  tags: Map<string, ClientTag[]>;
  identityMap: Record<string, { display_name?: string; email?: string | null; phone?: string | null; vat?: string | null }>;
  assignedUserMap: Map<string, string>;
  scopeOrgIds: string[];
  onOpenClient?: (entityId: string) => void;
  onCallClient?: (entityId: string) => void;
  onEmailClient?: (entityId: string) => void;
}

interface FullContract {
  id: string;
  entity_id: string | null;
  status: string;
  total_value: number | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  payment_terms: string | null;
  notes: string | null;
}

const HEALTH_BAR_COLORS: Record<string, string> = {
  excellent: "bg-green-500",
  good: "bg-blue-500",
  attention: "bg-yellow-500",
  at_risk: "bg-orange-500",
  critical: "bg-red-500",
};

const HEALTH_DOT_COLORS: Record<string, string> = {
  excellent: "text-green-500",
  good: "text-blue-500",
  attention: "text-yellow-500",
  at_risk: "text-orange-500",
  critical: "text-red-500",
};

const HEALTH_LABELS: Record<string, string> = {
  excellent: "Excelente",
  good: "Bom",
  attention: "Atenção",
  at_risk: "Em Risco",
  critical: "Crítico",
};

// Semi-circular gauge SVG
function RetentionGauge({ rate }: { rate: number }) {
  const clampedRate = Math.max(0, Math.min(100, rate));
  const angle = (clampedRate / 100) * 180;
  const radians = (angle * Math.PI) / 180;
  const cx = 120, cy = 110, r = 85;
  // Arc path
  const startX = cx - r;
  const startY = cy;
  const endX = cx + r * Math.cos(Math.PI - radians);
  const endY = cy - r * Math.sin(radians);
  const largeArc = 0;

  // Color
  let gaugeColor = "hsl(0, 70%, 55%)"; // red
  if (clampedRate >= 90) gaugeColor = "hsl(145, 60%, 45%)"; // green
  else if (clampedRate >= 70) gaugeColor = "hsl(45, 85%, 50%)"; // yellow

  // Pointer
  const pointerAngle = Math.PI - radians;
  const pointerLen = r - 15;
  const px = cx + pointerLen * Math.cos(pointerAngle);
  const py = cy - pointerLen * Math.sin(pointerAngle);

  return (
    <svg viewBox="0 0 240 140" className="w-[200px] h-[120px]">
      {/* Background arc */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke="hsl(var(--muted))"
        strokeWidth="18"
        strokeLinecap="round"
      />
      {/* Colored arc */}
      {clampedRate > 0 && (
        <path
          d={`M ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY}`}
          fill="none"
          stroke={gaugeColor}
          strokeWidth="18"
          strokeLinecap="round"
        />
      )}
      {/* Pointer line */}
      <line x1={cx} y1={cy} x2={px} y2={py} stroke="hsl(var(--foreground))" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="5" fill="hsl(var(--foreground))" />
      {/* Center text */}
      <text x={cx} y={cy + 5} textAnchor="middle" className="text-3xl font-bold" fill={gaugeColor} fontSize="36" fontWeight="700">
        {Math.round(clampedRate)}%
      </text>
    </svg>
  );
}

export function ClientsRetentionView({
  clients, healthScores, contracts, interactions, tags, identityMap, assignedUserMap, scopeOrgIds,
  onOpenClient, onCallClient, onEmailClient,
}: ClientsRetentionViewProps) {
  const [allContracts, setAllContracts] = useState<FullContract[]>([]);
  const [loadingContracts, setLoadingContracts] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoadingContracts(true);
      try {
        const entityIds = clients.map(c => c.entity_id).filter(Boolean);
        if (entityIds.length === 0) { setAllContracts([]); return; }
        const all: FullContract[] = [];
        for (let i = 0; i < entityIds.length; i += 100) {
          const batch = entityIds.slice(i, i + 100);
          const { data } = await supabase.from("client_contracts")
            .select("id, entity_id, status, total_value, start_date, end_date, created_at, payment_terms, notes")
            .in("entity_id", batch);
          if (data) all.push(...(data as FullContract[]));
        }
        setAllContracts(all);
      } catch (err) {
        console.error("Error loading contracts for retention view:", err);
      } finally {
        setLoadingContracts(false);
      }
    };
    load();
  }, [clients]);

  const now = new Date();
  const INACTIVE_STATUSES = ["inactive", "lost", "churned", "lost_definitive"];
  const activeClients = useMemo(() => clients.filter(c => !INACTIVE_STATUSES.includes(c.status)), [clients]);

  // ── KPIs ──
  const kpis = useMemo(() => {
    // Retention rate: clients that were active 90 days ago and are still active
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const clientsAtStart = clients.filter(c => new Date(c.created_at) <= ninetyDaysAgo);
    const stillActive = clientsAtStart.filter(c => !INACTIVE_STATUSES.includes(c.status));
    const retentionRate = clientsAtStart.length > 0 ? (stillActive.length / clientsAtStart.length) * 100 : 100;
    const lostCount = clientsAtStart.length - stillActive.length;

    // At-risk clients — use canonical health level (at_risk = 20-40, critical < 20)
    const atRiskClients: string[] = [];
    let atRiskValue = 0;
    activeClients.forEach(c => {
      const h = healthScores.get(c.entity_id);
      if (h && (h.level === "at_risk" || h.level === "critical") && !h.inactive) {
        atRiskClients.push(c.entity_id);
        atRiskValue += contracts.get(c.entity_id)?.totalValue || 0;
      }
    });


    // Expiring contracts (30 days)
    let expiringCount = 0;
    let expiringValue = 0;
    allContracts.forEach(c => {
      if ((c.status === "active" || c.status === "signed") && c.end_date) {
        const days = differenceInDays(new Date(c.end_date), now);
        if (days >= 0 && days <= 30) {
          expiringCount++;
          expiringValue += c.total_value || 0;
        }
      }
    });

    // Average health
    let totalHealth = 0;
    let healthCount = 0;
    activeClients.forEach(c => {
      const h = healthScores.get(c.entity_id);
      if (h) { totalHealth += h.score; healthCount++; }
    });
    const avgHealth = healthCount > 0 ? Math.round(totalHealth / healthCount) : 0;

    return {
      retentionRate, lostCount, totalAtStart: clientsAtStart.length, stillActiveCount: stillActive.length,
      atRiskCount: atRiskClients.length, atRiskValue,
      expiringCount, expiringValue,
      avgHealth,
    };
  }, [clients, activeClients, healthScores, contracts, allContracts, now]);

  // Build status map for contract row labels
  const statusByEntity = useMemo(() => {
    const m = new Map<string, string>();
    clients.forEach(c => m.set(c.entity_id, c.status));
    return m;
  }, [clients]);

  const STATUS_LABEL_PT: Record<string, string> = {
    active: "Activo",
    customer: "Cliente",
    inactive: "Inactivo",
    churned: "Perdido",
    lost: "Perdido",
    lost_definitive: "Perdido",
  };



  // ── At-Risk Clients ──
  const atRiskClients = useMemo(() => {
    return activeClients
      .filter(c => {
        const h = healthScores.get(c.entity_id);
        return h && (h.level === "at_risk" || h.level === "critical") && !h.inactive;
      })

      .map(c => {
        const h = healthScores.get(c.entity_id)!;
        const identity = identityMap[c.entity_id];
        const contract = contracts.get(c.entity_id);
        const interaction = interactions.get(c.entity_id);
        const clientTags = tags.get(c.entity_id) || [];
        const isVip = clientTags.some(t => t.tag.toLowerCase() === "vip");

        const daysSinceContact = interaction?.lastInteractionAt
          ? differenceInDays(now, new Date(interaction.lastInteractionAt))
          : 999;

        const reasons: string[] = [];
        if (daysSinceContact < 999) reasons.push(`Sem contacto há ${daysSinceContact} dias`);
        else reasons.push("Nunca contactado");
        if (contract) reasons.push(`${contract.activeCount} contrato${contract.activeCount > 1 ? "s" : ""} ${formatCurrency(contract.totalValue)}`);
        if (!identityMap[c.entity_id]?.vat) reasons.push("Sem NIF");
        if (!c.assigned_to) reasons.push("Sem atribuição");
        if (interaction?.lastSentiment === "negative") reasons.push("Última chamada negativa 😟");

        return {
          id: c.id,
          entityId: c.entity_id,
          name: identity?.display_name || "N/A",
          initials: (identity?.display_name || "??").split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase(),
          score: h.score,
          level: h.level,
          isVip,
          value: contract?.totalValue || 0,
          reason: reasons.join(" · "),
          isCritical: h.score < 30,
          hasPhone: !!identity?.phone,
        };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, 6);
  }, [activeClients, healthScores, contracts, interactions, tags, identityMap, now]);

  const atRiskTotalValue = useMemo(() => atRiskClients.reduce((sum, c) => sum + c.value, 0), [atRiskClients]);

  // ── Contracts to Renew ──
  const contractsToRenew = useMemo(() => {
    return allContracts
      .filter(c => (c.status === "active" || c.status === "signed") && c.end_date)
      .map(c => {
        const daysLeft = differenceInDays(new Date(c.end_date!), now);
        if (daysLeft > 45) return null;

        const identity = identityMap[c.entity_id || ""];
        const health = c.entity_id ? healthScores.get(c.entity_id) : undefined;
        const interaction = c.entity_id ? interactions.get(c.entity_id) : undefined;
        const clientTags = c.entity_id ? (tags.get(c.entity_id) || []) : [];
        const isVip = clientTags.some(t => t.tag.toLowerCase() === "vip");
        const daysSinceContact = interaction?.lastInteractionAt
          ? differenceInDays(now, new Date(interaction.lastInteractionAt))
          : null;

        const isExpired = daysLeft < 0;
        const isUrgent = daysLeft <= 14;
        const isHealthy = health && health.score >= 70;

        const details: string[] = [];
        if (daysLeft < 0) details.push(`Expirou há ${Math.abs(daysLeft)} dias`);
        else if (daysLeft <= 14) details.push(`Expira em ${daysLeft} dias (urgente)`);
        else details.push(`Expira em ${daysLeft} dias (${format(new Date(c.end_date!), "dd/MM")})`);
        if (isVip) details.push("VIP");
        const statusLabel = c.entity_id ? STATUS_LABEL_PT[statusByEntity.get(c.entity_id) || ""] : null;
        if (statusLabel) details.push(statusLabel);
        if (health) details.push(`Health score: ${health.score}`);

        if (daysSinceContact !== null) details.push(`Último contacto: ${daysSinceContact} dias`);
        if (isHealthy) details.push("Provável renovação");

        const contractName = c.payment_terms
          ? `Contrato ${c.payment_terms.charAt(0).toUpperCase() + c.payment_terms.slice(1)}`
          : `Contrato #${(c.id || "").slice(0, 6)}`;

        return {
          id: c.id,
          entityId: c.entity_id,
          clientName: identity?.display_name || "N/A",
          contractName,
          daysLeft,
          isExpired,
          isUrgent,
          isHealthy: !!isHealthy,
          value: c.total_value || 0,
          details: details.join(" · "),
          endDate: c.end_date!,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a!.daysLeft - b!.daysLeft) as NonNullable<typeof contractsToRenew[0]>[];
  }, [allContracts, identityMap, healthScores, interactions, tags, now]);

  const renewTotalValue = useMemo(() => contractsToRenew.reduce((sum, c) => sum + c.value, 0), [contractsToRenew]);

  // ── Health Distribution ──
  const healthDistribution = useMemo(() => {
    const dist = { excellent: 0, good: 0, attention: 0, at_risk: 0, critical: 0 };
    activeClients.forEach(c => {
      const h = healthScores.get(c.entity_id);
      if (h) dist[h.level]++;
    });
    const total = activeClients.length || 1;
    const goodPct = Math.round(((dist.excellent + dist.good) / total) * 100);
    const max = Math.max(dist.excellent, dist.good, dist.attention, dist.at_risk, dist.critical, 1);
    return {
      levels: [
        { key: "excellent", label: "Excelente", count: dist.excellent, pct: (dist.excellent / max) * 100 },
        { key: "good", label: "Bom", count: dist.good, pct: (dist.good / max) * 100 },
        { key: "attention", label: "Atenção", count: dist.attention, pct: (dist.attention / max) * 100 },
        { key: "at_risk", label: "Em Risco", count: dist.at_risk, pct: (dist.at_risk / max) * 100 },
        { key: "critical", label: "Crítico", count: dist.critical, pct: (dist.critical / max) * 100 },
      ],
      goodPct,
    };
  }, [activeClients, healthScores]);

  // ── Suggested Retention Actions ──
  const suggestedActions = useMemo(() => {
    const actions: {
      id: string; priority: "urgent" | "important" | "suggestion";
      icon: typeof Phone; title: string; description: string;
      actionLabel: string; actionType: "call" | "email" | "assign" | "edit" | "send";
      entityId?: string; healthImpact: number;
    }[] = [];

    // 1. VIP at risk → call
    activeClients.forEach(c => {
      const clientTags = tags.get(c.entity_id) || [];
      const isVip = clientTags.some(t => t.tag.toLowerCase() === "vip");
      const h = healthScores.get(c.entity_id);
      if (isVip && h && h.score < 40) {
        const name = identityMap[c.entity_id]?.display_name || "N/A";
        const contract = contracts.get(c.entity_id);
        const interaction = interactions.get(c.entity_id);
        const days = interaction?.lastInteractionAt ? differenceInDays(now, new Date(interaction.lastInteractionAt)) : 999;
        actions.push({
          id: `vip-${c.entity_id}`,
          priority: "urgent",
          icon: Phone,
          title: `Ligar à ${name} (VIP)`,
          description: `${days >= 999 ? "Nunca contactado" : `Sem contacto há ${days} dias`} · ${formatCurrency(contract?.totalValue || 0)} em risco · Prioridade máxima`,
          actionLabel: "Ligar",
          actionType: "call",
          entityId: c.entity_id,
          healthImpact: 8,
        });
      }
    });

    // 2. Unassigned at-risk → assign
    activeClients.forEach(c => {
      if (!c.assigned_to) {
        const h = healthScores.get(c.entity_id);
        if (h && h.score < 50) {
          const name = identityMap[c.entity_id]?.display_name || "N/A";
          const interaction = interactions.get(c.entity_id);
          const days = interaction?.lastInteractionAt ? differenceInDays(now, new Date(interaction.lastInteractionAt)) : 999;
          actions.push({
            id: `assign-${c.entity_id}`,
            priority: "urgent",
            icon: UserPlus,
            title: `Atribuir comercial ao ${name}`,
            description: `Sem atribuição · ${days >= 999 ? "Nunca contactado" : `Sem contacto ${days} dias`} · Precisa de dono`,
            actionLabel: "Atribuir",
            actionType: "assign",
            entityId: c.entity_id,
            healthImpact: 5,
          });
        }
      }
    });

    // 3. Expiring contracts → send renewal
    contractsToRenew.filter(c => c.daysLeft > 0 && c.daysLeft <= 30).forEach(c => {
      actions.push({
        id: `renew-${c.id}`,
        priority: "important",
        icon: Send,
        title: `Enviar renovação à ${c.clientName}`,
        description: `Contrato expira em ${c.daysLeft} dias · Template "Renovação" disponível`,
        actionLabel: "Enviar",
        actionType: "send",
        entityId: c.entityId || undefined,
        healthImpact: 4,
      });
    });

    // 4. No contact > 30d → call
    activeClients.forEach(c => {
      const interaction = interactions.get(c.entity_id);
      const days = interaction?.lastInteractionAt ? differenceInDays(now, new Date(interaction.lastInteractionAt)) : 999;
      const h = healthScores.get(c.entity_id);
      if (days > 30 && h && h.score >= 40 && h.score < 60) {
        const name = identityMap[c.entity_id]?.display_name || "N/A";
        if (!actions.some(a => a.entityId === c.entity_id)) {
          actions.push({
            id: `followup-${c.entity_id}`,
            priority: "important",
            icon: Phone,
            title: `Follow-up ${name}`,
            description: `${days >= 999 ? "Nunca contactado" : `Sem contacto há ${days} dias`} · Saúde ${h.score}/100 a descer`,
            actionLabel: "Ligar",
            actionType: "call",
            entityId: c.entity_id,
            healthImpact: 5,
          });
        }
      }
    });

    // 5. Missing VAT → edit
    const missingVat = activeClients.filter(c => !identityMap[c.entity_id]?.vat);
    if (missingVat.length > 0) {
      const names = missingVat.slice(0, 3).map(c => identityMap[c.entity_id]?.display_name?.split(" ")[0] || "N/A");
      actions.push({
        id: "missing-vat",
        priority: "suggestion",
        icon: Pencil,
        title: `Completar NIF do ${names.join(" e ")}`,
        description: "NIF em falta — necessário para facturação",
        actionLabel: "Editar",
        actionType: "edit",
        entityId: missingVat[0]?.entity_id,
        healthImpact: missingVat.length * 2,
      });
    }

    const sorted = actions.sort((a, b) => {
      const priorityOrder = { urgent: 0, important: 1, suggestion: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }).slice(0, 6);

    const totalImpact = sorted.reduce((sum, a) => sum + a.healthImpact, 0);
    const projectedHealth = Math.min(100, kpis.avgHealth + totalImpact);

    return { actions: sorted, pendingCount: sorted.length, projectedHealth };
  }, [activeClients, healthScores, contracts, interactions, tags, identityMap, contractsToRenew, kpis.avgHealth, now]);

  

  const priorityStyles: Record<string, { bg: string; border: string }> = {
    urgent: { bg: "bg-red-50 dark:bg-red-950/20", border: "border-red-200 dark:border-red-800/50" },
    important: { bg: "bg-yellow-50 dark:bg-yellow-950/20", border: "border-yellow-200 dark:border-yellow-800/50" },
    suggestion: { bg: "bg-blue-50 dark:bg-blue-950/20", border: "border-blue-200 dark:border-blue-800/50" },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <span className="text-lg">📈</span> Retenção — Saúde da Carteira
        </h2>
        <p className="text-sm text-muted-foreground">Quem está em risco de sair e o que podes fazer para os manter</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-[11px] font-semibold text-muted-foreground tracking-wider uppercase">Taxa de Retenção</p>
            <p className={`text-2xl font-bold mt-1 ${
              kpis.retentionRate >= 90 ? "text-green-600 dark:text-green-400" :
              kpis.retentionRate >= 70 ? "text-yellow-600 dark:text-yellow-400" :
              "text-red-600 dark:text-red-400"
            }`}>
              {Math.round(kpis.retentionRate)}%
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {kpis.lostCount} de {kpis.totalAtStart} perdido{kpis.lostCount !== 1 ? "s" : ""} nos últimos 90 dias
            </p>

          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-[11px] font-semibold text-muted-foreground tracking-wider uppercase">Clientes em Risco</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{kpis.atRiskCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{formatCurrency(kpis.atRiskValue)} em valor ameaçado</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-[11px] font-semibold text-muted-foreground tracking-wider uppercase">Contratos a Expirar</p>
            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400 mt-1">{kpis.expiringCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{formatCurrency(kpis.expiringValue)} nos próximos 30 dias</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <p className="text-[11px] font-semibold text-muted-foreground tracking-wider uppercase">Saúde Média</p>
            <p className="text-2xl font-bold mt-1">{kpis.avgHealth}<span className="text-sm font-normal text-muted-foreground">/100</span></p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {kpis.atRiskCount} em risco · {kpis.expiringCount} a expirar
            </p>

          </CardContent>
        </Card>
      </div>

      {/* Row 2: Gauge */}
      <div className="grid grid-cols-1 gap-4">

        {/* Retention Gauge */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              🎯 Taxa de Retenção
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <RetentionGauge rate={kpis.retentionRate} />
              <div className="space-y-2 text-sm">
                <p className="font-semibold text-green-600 dark:text-green-400">
                  {kpis.stillActiveCount} de {kpis.totalAtStart} clientes mantidos
                </p>
                <p className="text-muted-foreground">
                  {kpis.lostCount} cliente{kpis.lostCount !== 1 ? "s" : ""} perdido{kpis.lostCount !== 1 ? "s" : ""} nos últimos 90 dias
                </p>
                <p className="text-muted-foreground">
                  <strong>Meta: 95%</strong>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>


      {/* Row 3: At-Risk Clients + Contracts to Renew */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* At-Risk Clients */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              🚨 Clientes em Risco — Acção Urgente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {atRiskClients.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhum cliente em risco 🎉</p>
            ) : (
              <>
                {atRiskClients.map((client, i) => (
                  <div
                    key={client.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      client.isCritical
                        ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/50"
                        : "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800/50"
                    }`}
                    onClick={() => onOpenClient?.(client.entityId)}
                  >
                    {/* Score circle */}
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${
                      client.score < 20 ? "bg-red-500" : client.score < 30 ? "bg-orange-500" : "bg-yellow-500"
                    }`}>
                      {client.score}
                    </div>




                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold flex items-center gap-1">
                        {client.name}
                        {client.isVip && <span className="text-yellow-500">⭐</span>}
                        {client.isVip && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-yellow-400 text-yellow-700">VIP</Badge>}
                      </p>
                      <p className="text-xs text-muted-foreground leading-snug">{client.reason}</p>
                    </div>

                    {/* Action button */}
                    <Button
                      size="sm"
                      variant={client.isCritical ? "destructive" : "outline"}
                      className="gap-1.5 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (client.isCritical || client.hasPhone) onCallClient?.(client.entityId);
                        else onEmailClient?.(client.entityId);
                      }}
                    >
                      {client.isCritical ? (
                        <><Phone className="w-3.5 h-3.5" /> Ligar AGORA</>
                      ) : (
                        <><Mail className="w-3.5 h-3.5" /> Enviar email</>
                      )}
                    </Button>
                  </div>
                ))}

                {kpis.atRiskCount > atRiskClients.length && (
                  <p className="text-xs text-muted-foreground text-center py-1">
                    +{kpis.atRiskCount - atRiskClients.length} mais em risco — abre a lista completa para ver todos
                  </p>
                )}

                {/* Total value at risk */}
                <div className="bg-red-50 dark:bg-red-950/20 border border-red-200/50 dark:border-red-800/50 rounded-lg p-3 text-center mt-2">
                  <p className="text-sm font-semibold text-red-700 dark:text-red-400 flex items-center justify-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    {formatCurrency(atRiskTotalValue)} em valor de contratos em risco de perda
                  </p>
                </div>

              </>
            )}
          </CardContent>
        </Card>

        {/* Contracts to Renew */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              🔄 Contratos a Renovar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {contractsToRenew.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhum contrato próximo de expirar 🎉</p>
            ) : (
              <>
                {contractsToRenew.slice(0, 6).map((contract) => (
                  <div
                    key={contract.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      contract.isExpired
                        ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/50"
                        : contract.isUrgent
                        ? "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800/50"
                        : "border-border/50"
                    }`}
                  >
                    {/* Countdown */}
                    <div className={`text-center shrink-0 w-12 ${
                      contract.isExpired ? "text-red-600 dark:text-red-400" :
                      contract.isUrgent ? "text-orange-600 dark:text-orange-400" :
                      "text-muted-foreground"
                    }`}>
                      <span className="text-xl font-bold leading-none">
                        {contract.isExpired ? `${contract.daysLeft}` : `${contract.daysLeft}`}
                      </span>
                      <span className="text-xs block">d</span>
                    </div>

                    {/* Contract info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">
                        {contract.contractName} — {contract.clientName}
                      </p>
                      <p className="text-xs text-muted-foreground leading-snug">{contract.details}</p>
                    </div>

                    {/* Value + action */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold">{formatCurrency(contract.value)}</span>
                      <Button
                        size="sm"
                        variant={contract.isExpired ? "destructive" : contract.isHealthy ? "outline" : "outline"}
                        className="gap-1.5"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (contract.entityId) onOpenClient?.(contract.entityId);
                        }}
                      >
                        {contract.isExpired ? (
                          "Renovar"
                        ) : contract.isHealthy ? (
                          <><Check className="w-3.5 h-3.5" /> Provável</>
                        ) : (
                          <><Send className="w-3.5 h-3.5" /> Enviar renovação</>
                        )}
                      </Button>
                    </div>
                  </div>
                ))}

                {/* Total renewal value */}
                <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200/50 dark:border-yellow-800/50 rounded-lg p-3 text-center mt-2">
                  <p className="text-sm font-semibold text-yellow-700 dark:text-yellow-400 flex items-center justify-center gap-2">
                    💰 {formatCurrency(renewTotalValue)} em contratos a renovar nos próximos 45 dias
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Health Distribution + Suggested Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Health Distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              💚 Distribuição de Saúde dos Clientes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {healthDistribution.levels.map((level) => (
                <div key={level.key} className="flex items-center gap-3">
                  <span className={`text-lg ${HEALTH_DOT_COLORS[level.key]}`}>●</span>
                  <span className="text-sm font-medium w-20">{level.label}</span>
                  <div className="flex-1 bg-muted rounded-full h-4 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${HEALTH_BAR_COLORS[level.key]}`}
                      style={{ width: `${Math.max(level.pct, level.count > 0 ? 8 : 0)}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold w-12 text-right">
                    {level.count} <span className="text-xs font-normal text-muted-foreground">cliente{level.count !== 1 ? "s" : ""}</span>
                  </span>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground text-center mt-4">
              {healthDistribution.goodPct}% dos clientes com saúde boa ou excelente · <strong>Meta: 80%</strong>
            </p>
          </CardContent>
        </Card>

        {/* Suggested Retention Actions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              ✅ Acções de Retenção Sugeridas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {suggestedActions.actions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma acção pendente — tudo em dia! 🎉</p>
            ) : (
              <>
                {suggestedActions.actions.map((action) => {
                  const style = priorityStyles[action.priority];
                  const Icon = action.icon;
                  return (
                    <div
                      key={action.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border ${style.bg} ${style.border}`}
                    >
                      <div className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${
                        action.priority === "urgent" ? "bg-red-100 dark:bg-red-900/30" :
                        action.priority === "important" ? "bg-yellow-100 dark:bg-yellow-900/30" :
                        "bg-blue-100 dark:bg-blue-900/30"
                      }`}>
                        <Icon className={`w-4 h-4 ${
                          action.priority === "urgent" ? "text-red-600" :
                          action.priority === "important" ? "text-yellow-600" :
                          "text-blue-600"
                        }`} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{action.title}</p>
                        <p className="text-xs text-muted-foreground leading-snug">{action.description}</p>
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 shrink-0"
                        onClick={() => {
                          if (action.actionType === "call" && action.entityId) onCallClient?.(action.entityId);
                          else if (action.actionType === "email" && action.entityId) onEmailClient?.(action.entityId);
                          else if (action.entityId) onOpenClient?.(action.entityId);
                        }}
                      >
                        {action.actionType === "call" && <Phone className="w-3.5 h-3.5" />}
                        {action.actionType === "email" && <Mail className="w-3.5 h-3.5" />}
                        {action.actionType === "assign" && <UserPlus className="w-3.5 h-3.5" />}
                        {action.actionType === "edit" && <Pencil className="w-3.5 h-3.5" />}
                        {action.actionType === "send" && <Send className="w-3.5 h-3.5" />}
                        {action.actionLabel}
                      </Button>
                    </div>
                  );
                })}

                {/* Summary */}
                <div className="bg-muted/50 rounded-lg p-3 text-center mt-2">
                  <p className="text-sm text-muted-foreground">
                    {suggestedActions.pendingCount} acções pendentes · Se completar todas, saúde média sobe para <strong>{suggestedActions.projectedHealth}/100</strong>
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

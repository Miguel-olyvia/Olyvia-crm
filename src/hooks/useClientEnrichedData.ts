import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { differenceInDays } from 'date-fns';
import { isInactiveClientStatus } from '@/lib/clientStatus';

export interface ClientContractInfo {
  activeCount: number;
  totalValue: number;
  /**
   * Sum of total_value_sem_iva for active contracts. Optional (rather than
   * required) so existing call sites that build a ClientContractInfo without
   * this column (e.g. ClientDetailsDialog's health-score computation) don't
   * need updating — consumers that need it (see ClientsValueView's upselling
   * comparison) must fall back to 0 when absent.
   */
  totalValueSemIva?: number;
  expiringContracts: { id: string; end_date: string; total_value: number }[];
}

export interface ClientInteractionInfo {
  lastInteractionAt: string | null;
  interactionCount30d: number;
  lastSentiment: 'positive' | 'neutral' | 'negative' | null;
}

export interface ClientHealthScore {
  score: number;
  level: 'excellent' | 'good' | 'attention' | 'at_risk' | 'critical';
  color: string;
  bgColor: string;
  label: string;
  inactive?: boolean;
  breakdown: {
    lastContact: number;
    contracts: number;
    emailEngagement: number;
    dataCompleteness: number;
    interactionFrequency: number;
    sentiment: number;
  };
}

export interface ClientTag {
  id: string;
  tag: string;
  color: string | null;
}

export interface EnrichedClientData {
  contracts: Map<string, ClientContractInfo>;
  interactions: Map<string, ClientInteractionInfo>;
  healthScores: Map<string, ClientHealthScore>;
  tags: Map<string, ClientTag[]>;
  loading: boolean;
}

function getHealthLevel(score: number): { level: ClientHealthScore['level']; color: string; bgColor: string; label: string } {
  if (score >= 80) return { level: 'excellent', color: 'text-green-600', bgColor: 'bg-green-500', label: 'Excelente' };
  if (score >= 60) return { level: 'good', color: 'text-blue-600', bgColor: 'bg-blue-500', label: 'Bom' };
  if (score >= 40) return { level: 'attention', color: 'text-yellow-600', bgColor: 'bg-yellow-500', label: 'Atenção' };
  if (score >= 20) return { level: 'at_risk', color: 'text-orange-600', bgColor: 'bg-orange-500', label: 'Em Risco' };
  return { level: 'critical', color: 'text-red-600', bgColor: 'bg-red-500', label: 'Crítico' };
}

// Exported as the single shared source of truth for client health scoring:
// both the Clients list (AnewClients.tsx, via useClientEnrichedData below)
// and the client detail dialog (ClientDetailsDialog.tsx) must call this same
// function so the two surfaces never again show a different score/level for
// the same client.
export function calculateClientHealth(
  interaction: ClientInteractionInfo | undefined,
  contract: ClientContractInfo | undefined,
  hasEmail: boolean,
  hasPhone: boolean,
  hasVat: boolean,
  hasCompany: boolean,
  clientStatus?: string,
): ClientHealthScore {
  // Only truly inactive/lost clients should be excluded from scoring.
  // Mirrors the "active" filter's definition in AnewClients.tsx so a
  // prospect (or any other non-inactive status) isn't miscategorized
  // as critical-health just because it's not literally "active"/"customer".
  if (clientStatus && isInactiveClientStatus(clientStatus)) {
    return {
      score: 0, level: 'critical',
      color: 'text-muted-foreground', bgColor: 'bg-muted',
      label: clientStatus === 'lost' ? 'Fechado' : clientStatus === 'inactive' ? 'Inativo' : clientStatus,
      breakdown: { lastContact: 0, contracts: 0, emailEngagement: 0, dataCompleteness: 0, interactionFrequency: 0, sentiment: 0 },
      inactive: true,
    };
  }

  const base = 50;

  // Last contact
  let lastContact = -20;
  if (interaction?.lastInteractionAt) {
    const days = differenceInDays(new Date(), new Date(interaction.lastInteractionAt));
    if (days === 0) lastContact = 20;
    else if (days <= 7) lastContact = 15;
    else if (days <= 30) lastContact = 5;
    else lastContact = -20;
  }

  // Contracts
  const contracts = (contract?.activeCount || 0) > 0 ? 15 : 0;

  // Email engagement (simplified: based on interaction type)
  let emailEngagement = -10;
  if (interaction && interaction.interactionCount30d > 0) emailEngagement = 10;
  else if (interaction?.lastInteractionAt) emailEngagement = 0;

  // Data completeness
  const fields = [hasEmail, hasPhone, hasVat, hasCompany];
  const missing = fields.filter(f => !f).length;
  const dataCompleteness = 10 - (missing * 5);

  // Interaction frequency
  let interactionFrequency = 0;
  if (interaction) {
    if (interaction.interactionCount30d >= 3) interactionFrequency = 10;
    else if (interaction.interactionCount30d >= 1) interactionFrequency = 0;
    else interactionFrequency = -10;
  } else {
    interactionFrequency = -10;
  }

  // Sentiment
  let sentiment = 0;
  if (interaction?.lastSentiment === 'positive') sentiment = 12;
  else if (interaction?.lastSentiment === 'negative') sentiment = -10;

  const raw = base + lastContact + contracts + emailEngagement + dataCompleteness + interactionFrequency + sentiment;
  const score = Math.max(0, Math.min(100, raw));
  const { level, color, bgColor, label } = getHealthLevel(score);

  return {
    score, level, color, bgColor, label,
    breakdown: { lastContact, contracts, emailEngagement, dataCompleteness, interactionFrequency, sentiment },
  };
}

/** Linha devolvida por get_client_enriched_data (ver migration homonima). */
interface EnrichedClientRow {
  entity_id: string;
  active_contract_count: number | string | null;
  contract_total_value: number | string | null;
  contract_total_value_sem_iva: number | string | null;
  expiring_contracts: { id: string; end_date: string; total_value: number | string | null }[] | null;
  last_interaction_at: string | null;
  interaction_count_30d: number | string | null;
  last_sentiment: string | null;
  tags: { id: string; tag: string; color: string | null }[] | null;
}

/**
 * `numeric` chega do PostgREST como string quando excede o que um double
 * representa com seguranca, por isso tudo passa por Number() em vez de se
 * confiar no tipo declarado.
 */
const toNumber = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** Fuso do browser. A RPC faz aritmetica de datas em hora local, como o date-fns fazia. */
const resolveBrowserTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

export function useClientEnrichedData(entityIds: string[], identityMap: Record<string, { email?: string | null; phone?: string | null; vat?: string | null; type?: string }>, statusMap?: Record<string, string>, organizationId?: string | null) {
  const [contracts, setContracts] = useState<Map<string, ClientContractInfo>>(new Map());
  const [interactions, setInteractions] = useState<Map<string, ClientInteractionInfo>>(new Map());
  const [tags, setTags] = useState<Map<string, ClientTag[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEnrichedData = useCallback(async () => {
    if (entityIds.length === 0) return;
    // Entities can be shared across group-company organizations. Without a
    // required organizationId, `.in('entity_id', ...)` alone would leak
    // another org's contracts/interactions/tags into totals and health
    // scores. Bail out instead of querying unscoped — callers should wait
    // for organizationId to resolve (or pass one) before this hook fetches.
    if (!organizationId) {
      setContracts(new Map());
      setInteractions(new Map());
      setTags(new Map());
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Um unico POST em vez de 3 x ceil(n/100) GETs sequenciais (contratos,
      // interacoes e tags, cada um em lotes de 100 ids). Alem das idas ao
      // servidor, a leitura de entity_interactions trazia TODAS as linhas de
      // interacao das entidades para o cliente reduzir a tres numeros; a RPC
      // devolve ja uma linha por entidade.
      // Ver supabase/migrations/20261113110000_client_enriched_data_rpc.sql.
      //
      // `now` e `since` sao calculados UMA vez por vaga e enviados como
      // argumentos (em vez de now() do servidor) para que o servidor e o
      // cliente nunca discordem sobre "agora" ao decidir o que esta a expirar
      // ou o que conta para os ultimos 30 dias.
      const now = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error: rpcError } = await (supabase.rpc as any)('get_client_enriched_data', {
        _organization_id: organizationId,
        _entity_ids: [...new Set(entityIds)],
        _since: thirtyDaysAgo.toISOString(),
        _now: now.toISOString(),
        _tz: resolveBrowserTimeZone(),
      });

      if (rpcError) {
        console.error('Error loading client enriched data:', rpcError);
        setError('Falha ao carregar dados dos clientes.');
        return;
      }

      const contractMap = new Map<string, ClientContractInfo>();
      const interactionMap = new Map<string, ClientInteractionInfo>();
      const tagMap = new Map<string, ClientTag[]>();

      for (const raw of (data || []) as EnrichedClientRow[]) {
        const eid = raw.entity_id;
        if (!eid) continue;

        const activeCount = toNumber(raw.active_contract_count);
        if (activeCount > 0) {
          contractMap.set(eid, {
            activeCount,
            totalValue: toNumber(raw.contract_total_value),
            totalValueSemIva: toNumber(raw.contract_total_value_sem_iva),
            expiringContracts: (raw.expiring_contracts || []).map((c) => ({
              id: c.id,
              end_date: c.end_date,
              total_value: toNumber(c.total_value),
            })),
          });
        }

        // Uma entidade sem qualquer interacao nao entra no mapa — e o que o
        // codigo anterior fazia, e calculateClientHealth distingue
        // `undefined` (nunca contactado) de um registo com contagem zero.
        if (raw.last_interaction_at) {
          interactionMap.set(eid, {
            lastInteractionAt: raw.last_interaction_at,
            interactionCount30d: toNumber(raw.interaction_count_30d),
            lastSentiment: (raw.last_sentiment as ClientInteractionInfo['lastSentiment']) ?? null,
          });
        }

        if (raw.tags && raw.tags.length > 0) {
          tagMap.set(eid, raw.tags.map((t) => ({ id: t.id, tag: t.tag, color: t.color })));
        }
      }

      setContracts(contractMap);
      setInteractions(interactionMap);
      setTags(tagMap);
    } catch (err) {
      console.error('Error loading enriched data:', err);
      setError('Falha ao carregar dados dos clientes.');
    } finally {
      setLoading(false);
    }
  }, [entityIds.join(','), organizationId]);

  useEffect(() => {
    loadEnrichedData();
  }, [loadEnrichedData]);

  // Calculate health scores
  const healthScores = useMemo(() => {
    const map = new Map<string, ClientHealthScore>();
    for (const eid of entityIds) {
      const identity = identityMap[eid];
      map.set(eid, calculateClientHealth(
        interactions.get(eid),
        contracts.get(eid),
        !!identity?.email,
        !!identity?.phone,
        !!identity?.vat,
        identity?.type === 'organization',
        statusMap?.[eid],
      ));
    }
    return map;
  }, [entityIds, interactions, contracts, identityMap, statusMap]);

  return { contracts, interactions, healthScores, tags, loading, error, refetch: loadEnrichedData };
}

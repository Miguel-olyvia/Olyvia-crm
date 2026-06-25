import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { differenceInDays } from 'date-fns';

export interface ClientContractInfo {
  activeCount: number;
  totalValue: number;
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

function calculateClientHealth(
  interaction: ClientInteractionInfo | undefined,
  contract: ClientContractInfo | undefined,
  hasEmail: boolean,
  hasPhone: boolean,
  hasVat: boolean,
  hasCompany: boolean,
  clientStatus?: string,
): ClientHealthScore {
  // Only truly inactive/lost clients should be excluded from scoring
  const ACTIVE_STATUSES = ['active', 'customer'];
  if (clientStatus && !ACTIVE_STATUSES.includes(clientStatus)) {
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

export function useClientEnrichedData(entityIds: string[], identityMap: Record<string, { email?: string | null; phone?: string | null; vat?: string | null; type?: string }>, statusMap?: Record<string, string>, organizationId?: string | null) {
  const [contracts, setContracts] = useState<Map<string, ClientContractInfo>>(new Map());
  const [interactions, setInteractions] = useState<Map<string, ClientInteractionInfo>>(new Map());
  const [tags, setTags] = useState<Map<string, ClientTag[]>>(new Map());
  const [loading, setLoading] = useState(false);

  const loadEnrichedData = useCallback(async () => {
    if (entityIds.length === 0) return;
    setLoading(true);
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      // Load contracts
      const contractMap = new Map<string, ClientContractInfo>();
      for (let i = 0; i < entityIds.length; i += 100) {
        const batch = entityIds.slice(i, i + 100);
        let contractQuery = supabase.from('client_contracts')
          .select('id, entity_id, status, total_value, end_date')
          .in('entity_id', batch);
        if (organizationId) contractQuery = contractQuery.eq('organization_id', organizationId);
        const { data: contractData } = await contractQuery;
        if (contractData) {
          for (const c of contractData) {
            const info = contractMap.get(c.entity_id!) || { activeCount: 0, totalValue: 0, expiringContracts: [] };
            const isActive = c.status === 'active' || c.status === 'signed';
            if (isActive) {
              info.activeCount++;
              info.totalValue += c.total_value || 0;
              if (c.end_date) {
                const endDate = new Date(c.end_date);
                if (differenceInDays(endDate, now) >= 0 && differenceInDays(endDate, now) <= 30) {
                  info.expiringContracts.push({ id: c.id, end_date: c.end_date, total_value: c.total_value || 0 });
                }
              }
            }
            contractMap.set(c.entity_id!, info);
          }
        }
      }
      setContracts(contractMap);

      // Load interactions
      const interactionMap = new Map<string, ClientInteractionInfo>();
      for (let i = 0; i < entityIds.length; i += 100) {
        const batch = entityIds.slice(i, i + 100);
        let interactionQuery = supabase.from('entity_interactions')
          .select('entity_id, interaction_at, sentiment')
          .in('entity_id', batch)
          .order('interaction_at', { ascending: false });
        if (organizationId) interactionQuery = interactionQuery.eq('organization_id', organizationId);
        const { data: intData } = await interactionQuery;
        if (intData) {
          const countMap = new Map<string, number>();
          for (const row of intData) {
            const eid = (row as any).entity_id;
            if (!interactionMap.has(eid)) {
              interactionMap.set(eid, {
                lastInteractionAt: (row as any).interaction_at,
                interactionCount30d: 0,
                lastSentiment: (row as any).sentiment as any,
              });
            }
            const intDate = new Date((row as any).interaction_at);
            if (intDate >= thirtyDaysAgo) {
              countMap.set(eid, (countMap.get(eid) || 0) + 1);
            }
          }
          countMap.forEach((count, eid) => {
            const info = interactionMap.get(eid);
            if (info) info.interactionCount30d = count;
          });
        }
      }
      setInteractions(interactionMap);

      // Load tags
      const tagMap = new Map<string, ClientTag[]>();
      for (let i = 0; i < entityIds.length; i += 100) {
        const batch = entityIds.slice(i, i + 100);
        let tagQuery = supabase.from('contact_tags')
          .select('id, entity_id, tag, color')
          .in('entity_id', batch);
        if (organizationId) tagQuery = tagQuery.eq('organization_id', organizationId);
        const { data: tagData } = await tagQuery;
        if (tagData) {
          for (const t of tagData) {
            const existing = tagMap.get((t as any).entity_id) || [];
            existing.push({ id: t.id, tag: t.tag, color: t.color });
            tagMap.set((t as any).entity_id, existing);
          }
        }
      }
      setTags(tagMap);
    } catch (err) {
      console.error('Error loading enriched data:', err);
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

  return { contracts, interactions, healthScores, tags, loading, refetch: loadEnrichedData };
}

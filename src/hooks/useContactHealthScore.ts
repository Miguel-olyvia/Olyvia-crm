import { useMemo } from 'react';
import { differenceInDays } from 'date-fns';

export type HealthLevel = 'excellent' | 'good' | 'attention' | 'at_risk' | 'critical';

export interface HealthBreakdown {
  lastContact: number;      // 0-25
  dealActivity: number;     // 0-15
  dataCompleteness: number; // 0-10
  interactionFrequency: number; // 0-10
  total: number;            // 0-60 (raw), mapped to 0-100
}

export interface HealthScore {
  score: number;      // 0-100
  level: HealthLevel;
  color: string;
  label: string;
  breakdown: HealthBreakdown;
}

interface HealthInput {
  lastInteractionAt: string | null;
  hasActiveDeal: boolean;
  hasActiveProposal?: boolean;
  hasActiveQuote?: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
  hasVat: boolean;
  interactionCount30d: number;
  lastSentiment?: 'positive' | 'neutral' | 'negative' | null;
}

function getLevel(score: number): { level: HealthLevel; color: string; label: string } {
  if (score >= 80) return { level: 'excellent', color: 'text-green-600', label: 'Excelente' };
  if (score >= 60) return { level: 'good', color: 'text-blue-600', label: 'Bom' };
  if (score >= 40) return { level: 'attention', color: 'text-yellow-600', label: 'Atenção' };
  if (score >= 20) return { level: 'at_risk', color: 'text-orange-600', label: 'Em Risco' };
  return { level: 'critical', color: 'text-red-600', label: 'Crítico' };
}

export function calculateHealthScore(input: HealthInput): HealthScore {
  const { lastInteractionAt, hasActiveDeal, hasActiveProposal, hasActiveQuote, hasEmail, hasPhone, hasVat, interactionCount30d } = input;

  // Last contact score (0-25): <3d=25, <7d=20, <14d=15, <30d=10, <60d=5, >60d=0
  let lastContact = 0;
  if (lastInteractionAt) {
    const days = differenceInDays(new Date(), new Date(lastInteractionAt));
    if (days <= 3) lastContact = 25;
    else if (days <= 7) lastContact = 20;
    else if (days <= 14) lastContact = 15;
    else if (days <= 30) lastContact = 10;
    else if (days <= 60) lastContact = 5;
  }

  // Deal/Pipeline activity (0-15): deal=15, proposal=12, quote=8
  const dealActivity = hasActiveDeal ? 15 : hasActiveProposal ? 12 : hasActiveQuote ? 8 : 0;

  // Data completeness (0-10): email=4, phone=4, vat=2
  let dataCompleteness = 0;
  if (hasEmail) dataCompleteness += 4;
  if (hasPhone) dataCompleteness += 4;
  if (hasVat) dataCompleteness += 2;

  // Interaction frequency 30d (0-10): >=5=10, >=3=7, >=1=4, 0=0
  let interactionFrequency = 0;
  if (interactionCount30d >= 5) interactionFrequency = 10;
  else if (interactionCount30d >= 3) interactionFrequency = 7;
  else if (interactionCount30d >= 1) interactionFrequency = 4;

  const rawTotal = lastContact + dealActivity + dataCompleteness + interactionFrequency;
  // Map 0-60 to 0-100
  const score = Math.min(100, Math.round((rawTotal / 60) * 100));

  const { level, color, label } = getLevel(score);

  return {
    score,
    level,
    color,
    label,
    breakdown: {
      lastContact,
      dealActivity,
      dataCompleteness,
      interactionFrequency,
      total: rawTotal,
    },
  };
}

/**
 * Hook to calculate health scores for a batch of contacts.
 * Pass in the data maps and get back a function to compute per-entity.
 */
export function useContactHealthScore(params: {
  interactionCounts: Record<string, number>;
  lastInteractions: Record<string, string>;
  dealEntityIds: Set<string>;
  identityMap: Record<string, { email: string | null; phone: string | null; vat: string | null }>;
}) {
  const { interactionCounts, lastInteractions, dealEntityIds, identityMap } = params;

  const getScore = useMemo(() => {
    return (entityId: string, lastInteractionAt: string | null): HealthScore => {
      const identity = identityMap[entityId];
      return calculateHealthScore({
        lastInteractionAt: lastInteractions[entityId] || lastInteractionAt,
        hasActiveDeal: dealEntityIds.has(entityId),
        hasEmail: !!identity?.email,
        hasPhone: !!identity?.phone,
        hasVat: !!identity?.vat,
        interactionCount30d: interactionCounts[entityId] || 0,
      });
    };
  }, [interactionCounts, lastInteractions, dealEntityIds, identityMap]);

  return { getScore };
}

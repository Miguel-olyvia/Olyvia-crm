import { differenceInDays } from 'date-fns';

export type LeadHealthLevel = 'excellent' | 'good' | 'attention' | 'at_risk' | 'critical';

export interface LeadHealthBreakdown {
  contactResult: number;       // 0-35
  daysSinceContact: number;    // 0-25
  funnelStage: number;         // 0-20
  attemptsVsResult: number;    // 0-20
  total: number;               // 0-100
}

export interface LeadHealthScore {
  score: number;       // 0-100
  level: LeadHealthLevel;
  color: string;
  label: string;
  breakdown: LeadHealthBreakdown;
}

// Map contact result names to known positive/negative/neutral
const POSITIVE_RESULTS = ['Atendeu', 'Interessado', 'Visita Agendada'];

interface LeadHealthInput {
  /** Name of the last contact result (e.g. "Atendeu", "Não Atendeu") */
  lastContactResultName: string | null;
  /** ISO timestamp of the last contact */
  lastContactAt: string | null;
  /** ISO timestamp of when the lead was created */
  createdAt: string;
  /** Current lead status/stage */
  status: string;
  /** Number of contact attempts */
  contactAttempts: number;
}

function getLevel(score: number): { level: LeadHealthLevel; color: string; label: string } {
  if (score >= 80) return { level: 'excellent', color: 'text-green-600', label: 'Excelente' };
  if (score >= 60) return { level: 'good', color: 'text-blue-600', label: 'Bom' };
  if (score >= 40) return { level: 'attention', color: 'text-yellow-600', label: 'Atenção' };
  if (score >= 20) return { level: 'at_risk', color: 'text-orange-600', label: 'Risco' };
  return { level: 'critical', color: 'text-red-600', label: 'Crítico' };
}

/**
 * Component 1 — Last contact result (0-35)
 */
function scoreContactResult(resultName: string | null): number {
  if (!resultName) return 5; // never contacted
  const name = resultName.trim();
  if (name === 'Interessado' || name === 'Visita Agendada') return 35;
  if (name === 'Atendeu') return 25;
  if (name === 'Pediu Callback') return 20;
  if (name === 'Voicemail' || name === 'Ocupado') return 10;
  if (name === 'Não Atendeu') return 5;
  if (name === 'Número Errado' || name === 'Não Interessado') return 0;
  return 5; // unknown result, treat as neutral
}

/**
 * Component 2 — Days without contact (0-25)
 */
function scoreDaysSinceContact(lastContactAt: string | null, createdAt: string): number {
  const referenceDate = lastContactAt || createdAt;
  const days = differenceInDays(new Date(), new Date(referenceDate));
  if (days <= 0) return 25;
  if (days <= 2) return 20;
  if (days <= 5) return 15;
  if (days <= 7) return 10;
  if (days <= 14) return 5;
  return 0;
}

/**
 * Component 3 — Funnel stage (0-20)
 */
function scoreFunnelStage(status: string): number {
  const s = status.toLowerCase();
  if (s === 'visit_scheduled' || s === 'qualified') return 20;
  if (s === 'callback_scheduled') return 15;
  if (s === 'contacted' || s === 'no_answer') return 10;
  if (s === 'new') return 5;
  if (s === 'lost' || s === 'rejected') return 0;
  // proposal_sent, negotiation, won/converted
  if (s === 'proposal_sent' || s === 'negotiation') return 20;
  if (s === 'converted' || s === 'won') return 20;
  return 5;
}

/**
 * Component 4 — Attempts vs result (0-20)
 */
function scoreAttemptsVsResult(attempts: number, resultName: string | null): number {
  const isPositive = resultName ? POSITIVE_RESULTS.includes(resultName.trim()) : false;
  
  if (attempts === 0) return 10; // not yet attempted
  if (attempts <= 2) return isPositive ? 20 : 15;
  if (attempts <= 4) return isPositive ? 15 : 5;
  // 5+ attempts
  return isPositive ? 10 : 0;
}

export function calculateLeadHealthScore(input: LeadHealthInput): LeadHealthScore {
  const contactResult = scoreContactResult(input.lastContactResultName);
  const daysSinceContact = scoreDaysSinceContact(input.lastContactAt, input.createdAt);
  const funnelStage = scoreFunnelStage(input.status);
  const attemptsVsResult = scoreAttemptsVsResult(input.contactAttempts, input.lastContactResultName);

  const total = contactResult + daysSinceContact + funnelStage + attemptsVsResult;
  const score = Math.min(100, total);

  const { level, color, label } = getLevel(score);

  return {
    score,
    level,
    color,
    label,
    breakdown: {
      contactResult,
      daysSinceContact,
      funnelStage,
      attemptsVsResult,
      total: score,
    },
  };
}

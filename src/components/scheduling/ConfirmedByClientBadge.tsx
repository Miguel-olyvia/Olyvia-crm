import { CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/hooks/useTranslation';

interface ConfirmedByClientBadgeProps {
  /** schedule_items.confirmed_at (o cliente clicou em "Confirmo" no lembrete). */
  confirmedAt?: string | null;
  className?: string;
}

/**
 * Selo "Confirmado pelo cliente · HH:mm". Nao mostra nada sem confirmed_at.
 * A data completa vai no title e no aria-label.
 */
export function ConfirmedByClientBadge({ confirmedAt, className }: ConfirmedByClientBadgeProps) {
  const { t } = useTranslation();
  if (!confirmedAt) return null;
  const date = new Date(confirmedAt);
  if (Number.isNaN(date.getTime())) return null;

  const label = t('scheduling.confirmedByClient', { time: format(date, 'HH:mm') });
  const full = `${label} (${format(date, 'dd/MM/yyyy HH:mm')})`;

  return (
    <span
      title={full}
      aria-label={full}
      className={cn('inline-flex items-center gap-1 text-[10px] font-medium text-success', className)}
    >
      <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Mail, MessageSquare, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { useTranslation } from '@/hooks/useTranslation';
import {
  channelView,
  fetchVisitConfirmationStatus,
  requestVisitConfirmationResend,
  type ChannelView,
  type ConfirmationChannel,
  type VisitConfirmationStatus as StatusData,
} from '@/lib/scheduling/visitConfirmation';

interface VisitConfirmationStatusProps {
  itemId: string;
  /** Estado gravado da visita. */
  savedStatus: string;
  /** Estado escolhido no diálogo (ainda por gravar). */
  pendingStatus: string;
  /** Muda para voltar a ler (ex.: depois de gravar). */
  refreshKey?: number;
}

const TONE: Record<ChannelView['state'], string> = {
  not_sent: 'text-muted-foreground',
  sending: 'text-muted-foreground',
  sent: 'text-success',
  failed: 'text-destructive',
  no_contact: 'text-amber-700 dark:text-amber-400',
  disabled: 'text-muted-foreground',
  skipped: 'text-muted-foreground',
};

/**
 * Estado da confirmação ao cliente de uma visita no modo «confirmar na Agenda».
 * Não mostra nada para as visitas no modo de hoje (confirmação ao marcar).
 */
export function VisitConfirmationStatus({ itemId, savedStatus, pendingStatus, refreshKey }: VisitConfirmationStatusProps) {
  const { t } = useTranslation();
  const [data, setData] = useState<StatusData | null>(null);
  const [resending, setResending] = useState(false);

  const load = useCallback(async () => {
    const map = await fetchVisitConfirmationStatus([itemId]);
    setData(map.get(itemId) ?? null);
  }, [itemId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  if (!data || data.mode !== 'agenda_confirm') return null;

  const views: { channel: ConfirmationChannel; view: ChannelView }[] = [
    { channel: 'email', view: channelView(data.email) },
    { channel: 'sms', view: channelView(data.sms) },
  ];
  const nothingYet = views.every((v) => v.view.state === 'not_sent');
  const noContactAtAll = views.every((v) => v.view.state === 'no_contact');
  const resendable = views
    .filter((v) => v.view.state !== 'no_contact' && v.view.state !== 'disabled' && v.view.state !== 'not_sent')
    .map((v) => v.channel);
  const confirmedSaved = savedStatus === 'confirmed';

  const describe = (view: ChannelView): string => {
    switch (view.state) {
      case 'sent':
        return t('visitConfirmation.state.sent', { time: view.at ? format(new Date(view.at), 'HH:mm') : '—' });
      case 'failed':
        return t('visitConfirmation.state.failed', { error: view.error || '—' });
      case 'sending':
        return t('visitConfirmation.state.sending');
      case 'no_contact':
        return t('visitConfirmation.state.noContact');
      case 'disabled':
        return t('visitConfirmation.state.disabled');
      case 'skipped':
        return t('visitConfirmation.state.skipped', { reason: t(`visitConfirmation.reason.${view.reason}`) });
      default:
        return t('visitConfirmation.state.notSent');
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const res = await requestVisitConfirmationResend(itemId, resendable);
      if ('error' in res) toast.error(t('visitConfirmation.resendError', { error: res.error }));
      else toast.success(t('visitConfirmation.resendOk'));
      await load();
    } finally {
      setResending(false);
    }
  };

  return (
    <section aria-label={t('visitConfirmation.title')} className="rounded-md border bg-muted/30 px-3 py-2 text-xs space-y-1">
      <p className="font-medium text-foreground">{t('visitConfirmation.title')}</p>
      {!confirmedSaved && pendingStatus === 'confirmed' && (
        <p className="text-foreground">{t('visitConfirmation.willSendOnSave')}</p>
      )}
      {!confirmedSaved && pendingStatus !== 'confirmed' && nothingYet && (
        <p className="text-muted-foreground">{t('visitConfirmation.awaiting')}</p>
      )}
      {!nothingYet && (
        <ul className="space-y-0.5">
          {views.map(({ channel, view }) => (
            <li key={channel} className={cn('flex items-center gap-1.5', TONE[view.state])}>
              {channel === 'email'
                ? <Mail className="h-3 w-3 shrink-0" aria-hidden="true" />
                : <MessageSquare className="h-3 w-3 shrink-0" aria-hidden="true" />}
              <span className="font-medium">{t(`visitConfirmation.channel.${channel}`)}:</span>
              <span>{describe(view)}</span>
            </li>
          ))}
        </ul>
      )}
      {noContactAtAll && <p className="text-amber-700 dark:text-amber-400">{t('visitConfirmation.noContactHint')}</p>}
      {confirmedSaved && resendable.length > 0 && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={handleResend}
          disabled={resending}
        >
          <RefreshCw className={cn('h-3 w-3 mr-1', resending && 'animate-spin')} aria-hidden="true" />
          {t('visitConfirmation.resend')}
        </Button>
      )}
    </section>
  );
}

import { AlertCircle, Clock, CheckCircle2, Send, CalendarClock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { differenceInCalendarDays, differenceInDays } from "date-fns";

interface Contract {
  id: string;
  contract_number?: string;
  status: string;
  total_value?: number;
  start_date?: string;
  end_date?: string;
  created_at: string;
  _clientName?: string;
  entity_id?: string;
  [key: string]: any;
}

interface ContractsAlertBarsProps {
  contracts: Contract[];
  onAction?: (action: string, contract?: Contract) => void;
  expiringDays?: number;
  expiringUrgentDays?: number;
  expiringEnabled?: boolean;
  expiringUrgentEnabled?: boolean;
  draftStaleEnabled?: boolean;
  draftStaleDays?: number;
  expiredEnabled?: boolean;
  sentNoSignEnabled?: boolean;
  sentNoSignDays?: number;
}

export function ContractsAlertBars({
  contracts,
  onAction,
  expiringDays = 30,
  expiringUrgentDays = 7,
  expiringEnabled = true,
  expiringUrgentEnabled = true,
  draftStaleEnabled = true,
  draftStaleDays = 3,
  expiredEnabled = true,
  sentNoSignEnabled = true,
  sentNoSignDays = 5,
}: ContractsAlertBarsProps) {
  const now = new Date();

  const drafts = draftStaleEnabled
    ? contracts.filter(c => {
        if (c.status !== "draft") return false;
        const created = new Date(c.created_at);
        const daysSinceCreated = differenceInDays(now, created);
        return daysSinceCreated >= draftStaleDays;
      })
    : [];
  const computeDaysLeft = (c: Contract) =>
    differenceInCalendarDays(new Date(c.end_date!), now);
  const ELIGIBLE_FOR_EXPIRING = ["signed", "active", "pending_signature"];
  const isActiveExpiring = (c: Contract) =>
    !!c.end_date && ELIGIBLE_FOR_EXPIRING.includes(c.status);

  const expiringUrgent = expiringUrgentEnabled ? contracts.filter(c => {
    if (!isActiveExpiring(c)) return false;
    const d = computeDaysLeft(c);
    return d >= 0 && d <= expiringUrgentDays;
  }) : [];
  const expiringSoon = expiringEnabled ? contracts.filter(c => {
    if (!isActiveExpiring(c)) return false;
    const d = computeDaysLeft(c);
    return d > expiringUrgentDays && d <= expiringDays;
  }) : [];
  const sentNoSign = sentNoSignEnabled
    ? contracts.filter(c => {
        if (c.status !== "pending_signature") return false;
        const sent = new Date(c.updated_at || c.created_at);
        const days = Math.ceil((now.getTime() - sent.getTime()) / (1000 * 60 * 60 * 24));
        return days >= sentNoSignDays;
      })
    : [];
  const signedWithClient = contracts.filter(c => c.status === "signed" || c.status === "active");
  const expired = expiredEnabled
    ? contracts.filter(c => {
        if (c.status === "expired") return true;
        if (!c.end_date) return false;
        return new Date(c.end_date) < now && c.status !== "cancelled";
      })
    : [];

  const fmt = (v: number) => { const f = Math.abs(v).toFixed(2); const [i, d] = f.split('.'); return (v < 0 ? '-' : '') + '€' + i.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + d; };

  const alerts: JSX.Element[] = [];

  if (drafts.length > 0) {
    const d = drafts[0];
    const daysSinceCreated = differenceInDays(now, new Date(d.created_at));
    const ageLabel =
      daysSinceCreated <= 0 ? "criado hoje"
      : daysSinceCreated === 1 ? "criado há 1 dia"
      : `criado há ${daysSinceCreated} dias`;
    alerts.push(
      <div key="draft" className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-800">
        <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
        <span className="text-sm font-medium text-red-700 dark:text-red-400">
          {drafts.length} contrato{drafts.length > 1 ? "s" : ""} em Draft
        </span>
        <span className="text-sm text-red-600/80 dark:text-red-400/80 hidden md:inline">
          — {d.contract_number} ({d._clientName}, {fmt(d.total_value || 0)}) {ageLabel}. Enviar para assinatura para avançar o pipeline.
        </span>
        <Button size="sm" className="ml-auto bg-red-500 hover:bg-red-600 text-white" onClick={() => onAction?.("send_signature", d)}>
          <Send className="h-3 w-3 mr-1" /> Enviar para assinatura
        </Button>
      </div>
    );
  }

  if (expiringUrgent.length > 0) {
    const d = expiringUrgent[0];
    const daysLeft = computeDaysLeft(d);
    alerts.push(
      <div key="expiring-urgent" className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-800">
        <CalendarClock className="h-4 w-4 text-red-600 shrink-0" />
        <span className="text-sm font-medium text-red-700 dark:text-red-400">
          {expiringUrgent.length} contrato{expiringUrgent.length > 1 ? "s" : ""} expira em {daysLeft} dia{daysLeft > 1 ? "s" : ""}
        </span>
        <span className="text-sm text-red-600/80 dark:text-red-400/80 hidden md:inline">
          — {d.contract_number} ({d._clientName}, {fmt(d.total_value || 0)}). Acção urgente.
        </span>
        <Button size="sm" className="ml-auto bg-red-600 hover:bg-red-700 text-white" onClick={() => onAction?.("schedule_reminder", d)}>
          <CalendarClock className="h-3 w-3 mr-1" /> Renovar
        </Button>
      </div>
    );
  }

  if (expiringSoon.length > 0) {
    const d = expiringSoon[0];
    const daysLeft = computeDaysLeft(d);
    alerts.push(
      <div key="expiring" className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-yellow-50 border border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-800">
        <CalendarClock className="h-4 w-4 text-yellow-600 shrink-0" />
        <span className="text-sm font-medium text-yellow-700 dark:text-yellow-400">
          {expiringSoon.length} contrato{expiringSoon.length > 1 ? "s" : ""} expira em {daysLeft} dias
        </span>
        <span className="text-sm text-yellow-600/80 dark:text-yellow-400/80 hidden md:inline">
          — {d.contract_number} ({d._clientName}, {fmt(d.total_value || 0)}). Agendar lembrete de renovação.
        </span>
        <Button size="sm" variant="outline" className="ml-auto border-yellow-400 text-yellow-700 hover:bg-yellow-100" onClick={() => onAction?.("schedule_reminder", d)}>
          <CalendarClock className="h-3 w-3 mr-1" /> Agendar lembrete
        </Button>
      </div>
    );
  }

  if (sentNoSign.length > 0) {
    const d = sentNoSign[0];
    alerts.push(
      <div key="nosign" className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-orange-50 border border-orange-200 dark:bg-orange-950/20 dark:border-orange-800">
        <Clock className="h-4 w-4 text-orange-500 shrink-0" />
        <span className="text-sm font-medium text-orange-700 dark:text-orange-400">
          {sentNoSign.length} contrato{sentNoSign.length > 1 ? "s" : ""} enviado{sentNoSign.length > 1 ? "s" : ""} sem assinatura há +{sentNoSignDays} dias
        </span>
        <span className="text-sm text-orange-600/80 hidden md:inline">
          — {d.contract_number} ({d._clientName}, {fmt(d.total_value || 0)}). Considere um follow-up.
        </span>
        <Button size="sm" variant="outline" className="ml-auto border-orange-400 text-orange-700 hover:bg-orange-100" onClick={() => onAction?.("followup", d)}>
          Follow-up
        </Button>
      </div>
    );
  }

  if (signedWithClient.length > 0) {
    const recent = signedWithClient.find(c => {
      const signed = new Date(c.updated_at || c.created_at);
      return (now.getTime() - signed.getTime()) < 7 * 24 * 60 * 60 * 1000;
    });
    if (recent) {
      alerts.push(
        <div key="signed" className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-green-50 border border-green-200 dark:bg-green-950/20 dark:border-green-800">
          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          <span className="text-sm font-medium text-green-700 dark:text-green-400">
            {signedWithClient.length} contrato{signedWithClient.length > 1 ? "s" : ""} assinado{signedWithClient.length > 1 ? "s" : ""}
          </span>
          <span className="text-sm text-green-600/80 hidden md:inline">
            — {recent._clientName} foi convertido para Cliente automaticamente.
          </span>
          <a href="#" className="text-sm text-green-700 underline hidden md:inline" onClick={(e) => { e.preventDefault(); onAction?.("view_client", recent); }}>
            Ver ficha do cliente
          </a>
          <Button size="sm" className="ml-auto bg-green-600 hover:bg-green-700 text-white" onClick={() => onAction?.("view_client", recent)}>
            Ver cliente
          </Button>
        </div>
      );
    }
  }

  if (expired.length > 0) {
    const totalLost = expired.reduce((s, c) => s + (c.total_value || 0), 0);
    alerts.push(
      <div key="expired" className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-800">
        <XCircle className="h-4 w-4 text-red-500 shrink-0" />
        <span className="text-sm font-medium text-red-700 dark:text-red-400">
          {expired.length} contrato{expired.length > 1 ? "s" : ""} expirado{expired.length > 1 ? "s" : ""} não renovado{expired.length > 1 ? "s" : ""}
        </span>
        <span className="text-sm text-red-600/80 hidden md:inline">
          — {fmt(totalLost)} em valor perdido
        </span>
      </div>
    );
  }

  if (alerts.length === 0) return null;

  return <div className="space-y-2">{alerts}</div>;
}

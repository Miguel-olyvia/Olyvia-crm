/**
 * Regras puras do ecrã "Hoje" (`/home`).
 *
 * O ecrã responde a "o que tenho de fazer agora?" e cada linha leva a pessoa
 * ao sítio onde a coisa se resolve. As decisões — que saudação, para onde
 * aponta o botão de um agendamento, que alertas se mostram a quem — vivem aqui,
 * fora do componente, para poderem ser testadas sem montar a página.
 */
import type { AgendaItem } from "./types";

/** Chave de tradução da saudação, conforme a hora local. */
export function getGreetingKey(now: Date): "today.greeting.morning" | "today.greeting.afternoon" | "today.greeting.evening" {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return "today.greeting.morning";
  if (hour >= 12 && hour < 20) return "today.greeting.afternoon";
  return "today.greeting.evening";
}

/** Primeiro nome, para a saudação não ficar com o nome completo. */
export function getFirstName(fullName: string | null | undefined): string {
  const clean = (fullName ?? "").trim();
  if (!clean) return "";
  return clean.split(/\s+/)[0];
}

export interface TodayAction {
  href: string;
  /** Chave de tradução do botão. */
  labelKey: string;
}

type HasPermission = (permission: string) => boolean;

/**
 * Para onde leva o botão de um agendamento.
 *
 * Por ordem: a lead ou o cliente associado (as listagens abrem a ficha pelo
 * parâmetro `open`), o negócio (`/deals?open=`), e por fim a própria agenda.
 * Cada destino só é escolhido se a pessoa tiver a permissão que a rota exige —
 * senão o botão levava a um "sem acesso".
 */
export function getAgendaItemAction(item: AgendaItem, hasPermission: HasPermission): TodayAction {
  if (item.entity?.kind === "lead" && hasPermission("leads.view")) {
    return { href: `/leads?open=${encodeURIComponent(item.entity.id)}`, labelKey: "today.action.openLead" };
  }
  if (item.entity?.kind === "client" && hasPermission("clients.view")) {
    return { href: `/clients?open=${encodeURIComponent(item.entity.id)}`, labelKey: "today.action.openClient" };
  }
  if (item.deal_id && hasPermission("deals.view")) {
    return { href: `/deals?open=${encodeURIComponent(item.deal_id)}`, labelKey: "today.action.openDeal" };
  }
  return { href: "/scheduling", labelKey: "today.action.openAgenda" };
}

/**
 * Contagens de alertas por tipo de entidade, tal como as lê a barra lateral
 * (`AlertCounts` em useSidebarAlertCounts). Aceita-se qualquer objeto para não
 * acoplar esta regra pura à interface do hook.
 */
export type AlertCountsByEntity = object;

export interface TodayAlertRow {
  id: string;
  labelKey: string;
  count: number;
  href: string;
}

/**
 * Alertas comerciais por tratar, agrupados pelo ecrã onde se resolvem.
 *
 * Os números vêm da tabela `notifications` (os mesmos que acendem os
 * contadores da barra lateral): não há aqui query nova nenhuma. Só entram as
 * linhas com alertas e cuja página a pessoa pode abrir — a permissão é a da
 * rota em `App.tsx`.
 */
const ALERT_GROUPS: { id: string; entityTypes: string[]; labelKey: string; href: string; permission: string }[] = [
  { id: "leads", entityTypes: ["lead", "contact"], labelKey: "today.alerts.leads", href: "/leads", permission: "leads.view" },
  { id: "clients", entityTypes: ["client"], labelKey: "today.alerts.clients", href: "/clients", permission: "clients.view" },
  { id: "quotes", entityTypes: ["quote"], labelKey: "today.alerts.quotes", href: "/quotes", permission: "quotes.view" },
  { id: "proposals", entityTypes: ["proposal"], labelKey: "today.alerts.proposals", href: "/proposals", permission: "proposals.view" },
  { id: "contracts", entityTypes: ["contract"], labelKey: "today.alerts.contracts", href: "/client-contracts", permission: "client_contracts.view" },
];

export function buildAlertRows(counts: AlertCountsByEntity, hasPermission: HasPermission): TodayAlertRow[] {
  const rows: TodayAlertRow[] = [];
  for (const group of ALERT_GROUPS) {
    const byType = counts as Record<string, number | undefined>;
    const count = group.entityTypes.reduce((sum, type) => sum + (byType[type] ?? 0), 0);
    if (count <= 0 || !hasPermission(group.permission)) continue;
    rows.push({ id: group.id, labelKey: group.labelKey, count, href: group.href });
  }
  return rows;
}

// Pílulas do fornecedor no novo Inventário (.pill do artefacto vault/inventario-redesenho-completo.html): SLA, Portal,
// Contrato e Ativo/Inativo. Partilhadas pelos cartões (FornCartoes) e pelo cabeçalho da ficha embebida (SupplierSheet).
// Só apresentação: os estados vêm de useSupplierListStats / useSupplierContractOrgStatuses, com as mesmas regras de cor
// das colunas da tabela clássica (SupplierSla ≥ 90 / ≥ 75, SupplierPortalBadge, SupplierContractBadge).
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { toneBadge, type InventoryTone } from "@/components/inventory/ui/tones";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/supplierContracts/tipos";
import type { SupplierPortalState } from "../useSupplierListStats";
import type { SupplierContractListState } from "../contract/useSupplierContracts";

/** Estilo de .pill do artefacto (26px, 12.5px, semibold); o tom neutro é o --muted/--mfg. */
export const PILULA =
  "inline-flex h-[26px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12.5px] font-semibold";

const TOM: Record<InventoryTone, string> = { ...toneBadge };

export function FornPilula({ tom = "neutral", children, className }: { tom?: InventoryTone; children: ReactNode; className?: string }) {
  return <span className={cn(PILULA, TOM[tom], className)}>{children}</span>;
}

export const pilulaTom = (tom: InventoryTone): string => TOM[tom];

// ------------------------------------------------------------------ textos

export interface PilulaTexto {
  texto: string;
  tom: InventoryTone;
}

/** "SLA 72% · prazo 5 d" — as mesmas cores da coluna SLA % (≥ 90 verde, ≥ 75 âmbar, abaixo vermelho). */
export function slaPilula(pct: number | null | undefined, prazoDias: number | null | undefined): PilulaTexto {
  const prazo = prazoDias != null ? `prazo ${prazoDias} d` : "sem prazo";
  if (pct == null) return { texto: `SLA — · ${prazo}`, tom: "neutral" };
  const tom: InventoryTone = pct >= 90 ? "ok" : pct >= 75 ? "warn" : "bad";
  return { texto: `SLA ${Math.round(pct)}% · ${prazo}`, tom };
}

const PORTAL_CURTO: Record<SupplierPortalState, string> = {
  awaiting: "Convidado",
  active: "Ativo",
  suspended: "Suspenso",
  revoked: "Revogado",
  none: "Sem acesso",
};

const PORTAL_TOM: Record<SupplierPortalState, InventoryTone> = {
  awaiting: "info",
  active: "ok",
  suspended: "warn",
  revoked: "bad",
  none: "neutral",
};

/** "Portal: Ativo" (null = outra empresa / a carregar → "—"). */
export function portalPilula(state: SupplierPortalState | null | undefined): PilulaTexto {
  if (state == null) return { texto: "Portal: —", tom: "neutral" };
  return { texto: `Portal: ${PORTAL_CURTO[state]}`, tom: PORTAL_TOM[state] };
}

/** "Contrato: Assinado · expira em 12 d" — a mesma regra do SupplierContractBadge (≤ 7 dias a vermelho). */
export function contratoPilula(state: SupplierContractListState | null | undefined): PilulaTexto {
  if (state === undefined) return { texto: "Contrato: —", tom: "neutral" };
  if (state === null) return { texto: "Contrato: Sem contrato", tom: "neutral" };
  if (state.status === "signed" && state.daysLeft !== null) {
    const d = state.daysLeft;
    const prazo = d < 0 ? "fora de prazo" : d === 0 ? "expira hoje" : `expira em ${d} d`;
    return { texto: `Contrato: ${STATUS_LABEL.signed} · ${prazo}`, tom: d <= 7 ? "bad" : "warn" };
  }
  return { texto: `Contrato: ${STATUS_LABEL[state.status]}`, tom: STATUS_TONE[state.status] };
}

/** O nº e a versão do contrato (e a versão nova em curso), como as linhas pequenas da coluna Contrato. */
export function contratoDetalhe(state: SupplierContractListState | null | undefined): string | null {
  if (!state) return null;
  const base = `${state.contractNumber} · v${state.version}`;
  return state.openVersion
    ? `${base} · v${state.openVersion.version}: ${STATUS_LABEL[state.openVersion.status].toLowerCase()}`
    : base;
}

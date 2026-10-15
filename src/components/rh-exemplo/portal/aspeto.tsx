// O aspeto dos estados do portal: ícone + texto + tom, nunca só a cor.
import type { ReactNode } from "react";
import {
  BadgeCheck, CheckCircle2, Eye, FilePlus2, Hourglass, Inbox, Send, Sparkles, Undo2, XCircle, type LucideIcon,
} from "lucide-react";
import type {
  EstadoPedidoPessoa, EstadoPedidoRh, EstadoRecebido,
} from "@/components/rh-exemplo/lib/portalDocumentos";
import type { TraduzirFn } from "@/components/rh-exemplo/lib/errosAdmissao";
import { cn } from "@/lib/utils";

type Tom = "neutro" | "info" | "aviso" | "ok" | "erro";

const TONS: Record<Tom, string> = {
  neutro: "border-border text-muted-foreground",
  info: "border-sky-500/50 text-sky-800 dark:text-sky-300",
  aviso: "border-amber-500/70 bg-amber-500/10 font-medium text-amber-900 dark:text-amber-300",
  ok: "border-emerald-600/50 text-emerald-800 dark:text-emerald-300",
  erro: "border-destructive/50 text-destructive",
};

export function SeloEstado({ tom, Icone, children }: { tom: Tom; Icone: LucideIcon; children: ReactNode }) {
  return (
    <span className={cn("inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs", TONS[tom])}>
      <Icone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {children}
    </span>
  );
}

const RECEBIDO: Record<EstadoRecebido, { tom: Tom; Icone: LucideIcon }> = {
  novo: { tom: "aviso", Icone: Sparkles }, visto: { tom: "neutro", Icone: Eye }, assinado: { tom: "ok", Icone: BadgeCheck },
};
const PEDIDO_RH: Record<EstadoPedidoRh, { tom: Tom; Icone: LucideIcon }> = {
  por_enviar: { tom: "aviso", Icone: FilePlus2 }, enviado: { tom: "info", Icone: Send },
  aceite: { tom: "ok", Icone: CheckCircle2 }, recusado: { tom: "erro", Icone: XCircle },
};
const PEDIDO_PESSOA: Record<EstadoPedidoPessoa, { tom: Tom; Icone: LucideIcon }> = {
  pedido: { tom: "info", Icone: Inbox }, em_preparacao: { tom: "aviso", Icone: Hourglass },
  disponivel: { tom: "ok", Icone: CheckCircle2 }, recusado: { tom: "erro", Icone: Undo2 },
};

export function SeloRecebido({ estado, recusado, t }: { estado: EstadoRecebido; recusado: boolean; t: TraduzirFn }) {
  if (recusado) return <SeloEstado tom="erro" Icone={XCircle}>{t("rhPortal.recebidos.assinaturaRecusada")}</SeloEstado>;
  const { tom, Icone } = RECEBIDO[estado];
  return <SeloEstado tom={tom} Icone={Icone}>{t(`rhPortal.recebidos.estado.${estado}`)}</SeloEstado>;
}

export function SeloPedidoRh({ estado, t }: { estado: EstadoPedidoRh; t: TraduzirFn }) {
  const { tom, Icone } = PEDIDO_RH[estado];
  return <SeloEstado tom={tom} Icone={Icone}>{t(`rhPortal.pedidosRh.estado.${estado}`)}</SeloEstado>;
}

export function SeloPedidoPessoa({ estado, t }: { estado: EstadoPedidoPessoa; t: TraduzirFn }) {
  const { tom, Icone } = PEDIDO_PESSOA[estado];
  return <SeloEstado tom={tom} Icone={Icone}>{t(`rhPortal.meus.estado.${estado}`)}</SeloEstado>;
}

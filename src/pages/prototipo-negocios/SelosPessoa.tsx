// As etiquetas e os selos pequenos da lista e da ficha de Pessoas: o resultado do último contacto, a qualificação (MQL ou SQL), "Empresa",
// "Perdida", "Voltou a contactar" e "exemplo". Sempre texto (com ícone quando há), 15 px no mínimo; a cor fica nos ícones.
import type { ReactNode } from "react";
import { Ban, PhoneForwarded, PhoneIncoming, PhoneMissed, PhoneOff, Repeat, ThumbsDown, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { NOME_QUALIFICACAO, type Qualificacao } from "./pessoasExemplo";
import { SEM_CONTACTO } from "./camposPessoa";

const ICONE_RESULTADO: Record<string, LucideIcon> = {
  "Atendeu · interessado": PhoneIncoming, "Atendeu · ligar mais tarde": PhoneForwarded, "Não atendeu": PhoneMissed,
  "Sem interesse": ThumbsDown, "Número errado": Ban, [SEM_CONTACTO]: PhoneOff,
};

/** O resultado do último contacto, em texto com ícone, junto do "há N dias". */
export function ResultadoSelo({ resultado, className }: { resultado: string; className?: string }) {
  const I = ICONE_RESULTADO[resultado] ?? PhoneIncoming;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[15px] font-medium text-foreground", className)}>
      <I className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="sr-only">Resultado do último contacto: </span>{resultado}
    </span>
  );
}

/** Uma etiqueta em texto (Empresa, MQL, SQL), com contorno e sem cor. */
export function Etiqueta({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-full border border-border px-2 text-[15px] leading-5 text-foreground">{children}</span>;
}

/** MQL ou SQL, só nalgumas pessoas. O significado vai num texto só para leitores de ecrã (e, em texto visível, na ficha: Resumo > Sobre a pessoa). */
export const EtiquetaQualificacao = ({ q }: { q: Qualificacao }) => (
  <Etiqueta>{q}<span className="sr-only"> ({NOME_QUALIFICACAO[q]})</span></Etiqueta>
);

/** "Exemplo" em texto pequeno, para as pessoas inventadas. */
export const MarcaExemplo = ({ className }: { className?: string }) => <span className={cn("text-[15px] text-muted-foreground", className)}>exemplo</span>;

/** O aviso "Voltou a contactar" (derivado, ver camposPessoa.ts). */
export function VoltouAContactar({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-[15px] font-medium text-foreground", className)}>
      <Repeat className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />Voltou a contactar
    </span>
  );
}

/** A etiqueta "Perdida" junto ao nome, como a de "Atrasada": ícone e texto. */
export function Perdida({ className }: { className?: string }) {
  return (
    <span className={cn("mr-1.5 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 align-middle text-[15px] font-medium text-foreground", className)}>
      <XCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />Perdida
    </span>
  );
}

/** O ícone da etapa de uma lead perdida (no lugar do ícone da fase), com o mesmo tamanho. */
export function IconePerdida() {
  return <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-muted text-destructive [&_svg]:h-4 [&_svg]:w-4" aria-hidden="true"><XCircle /></span>;
}

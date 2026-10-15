/**
 * O aspecto do indicador de justificação de um dia: que texto, que ícone e que cor, por estado e por quem vê. A pessoa vê
 * o que pode fazer («Podes justificar») e o que já fez; o RH vê o que tem para decidir. Sem React: serve também a descrição
 * falada da célula.
 */
import { CheckCircle2, Clock, Hourglass, MessageSquarePlus, XCircle, type LucideIcon } from "lucide-react";
import type { EstadoDoDia } from "@/components/rh-exemplo/lib/justificacaoDia";

export interface Aspecto {
  chave: string;
  Icone: LucideIcon;
  classes: string;
}

const AVISO = "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300";
const BOM = "border-emerald-600/50 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300";
const MAU = "border-destructive/50 bg-destructive/10 text-destructive";
const NEUTRO = "border-border bg-muted text-muted-foreground";

/** O que cada estado mostra na célula; `null` quando não há nada a dizer a quem vê. */
export function aspectoDoIndicador(estado: EstadoDoDia, souAPessoa: boolean): Aspecto | null {
  switch (estado) {
    case "pode_justificar": return souAPessoa ? { chave: "rhJust.cel.podes", Icone: MessageSquarePlus, classes: AVISO } : null;
    case "prazo_terminado": return souAPessoa ? { chave: "rhJust.cel.semJustificacao", Icone: Clock, classes: NEUTRO } : null;
    case "enviada": return { chave: souAPessoa ? "rhJust.cel.enviada" : "rhJust.cel.porDecidir", Icone: Hourglass, classes: AVISO };
    case "aceite_paga": return { chave: "rhJust.cel.aceite_paga", Icone: CheckCircle2, classes: BOM };
    case "aceite_nao_paga": return { chave: "rhJust.cel.aceite_nao_paga", Icone: CheckCircle2, classes: BOM };
    case "recusada_com_prazo":
    case "recusada_sem_prazo": return { chave: "rhJust.cel.recusada", Icone: XCircle, classes: MAU };
    case "nao_aplica": return null;
  }
}

/** O texto do indicador, para a descrição falada da célula. */
export function textoDoIndicador(estado: EstadoDoDia, souAPessoa: boolean, t: (chave: string) => string): string | null {
  const aspecto = aspectoDoIndicador(estado, souAPessoa);
  return aspecto ? t(aspecto.chave) : null;
}


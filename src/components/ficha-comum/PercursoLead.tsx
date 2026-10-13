// O percurso de uma lead: 5 passos (Lead, Contacto, Visita, Negócio, Cliente), cada um com ícone e texto. O estado de cada
// passo diz-se em texto para leitores de ecrã (feito, atual, por fazer). Uma lead perdida mostra os passos anteriores como
// feitos, o passo onde se perdeu com o ícone de perda, e os seguintes apagados e "fora de alcance". Os textos chegam por
// props: este ficheiro não importa de pessoas nem de negocio-metas.
import { XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { estadosPercurso, type EstadoPasso } from "./estadosPercurso";

export interface PassoPercurso {
  chave: string;
  nome: string;
  icone: LucideIcon;
}

export interface TextosPercurso {
  feito: string;
  atual: string;
  porFazer: string;
  foraAlcance: string;
  /** "Perdida em Visita". */
  perdidaEm: (nome: string) => string;
  /** "Etapa atual: Visita" (só para ecrãs estreitos, onde os nomes não cabem). */
  etapaAtual: (nome: string) => string;
}

interface PercursoLeadProps {
  /** O nome acessível da lista. */
  rotulo: string;
  passos: PassoPercurso[];
  atual: number;
  perdidaEm?: number | null;
  concluido?: boolean;
  textos: TextosPercurso;
  /** "Perdida · Preço · 03/10", por baixo da lista. */
  resumoPerda?: string;
}

const LI = "flex min-h-11 flex-1 items-center justify-center gap-1.5 border-t-2 px-1 pt-2 text-sm sm:justify-start";

const TEXTO_ESTADO = (e: Exclude<EstadoPasso, "perdido">, t: TextosPercurso): string =>
  ({ feito: t.feito, atual: t.atual, porFazer: t.porFazer, foraAlcance: t.foraAlcance })[e];

function Passo(p: { passo: PassoPercurso; estado: EstadoPasso; textos: TextosPercurso }) {
  const { passo, estado, textos } = p;
  const Icone = estado === "perdido" ? XCircle : passo.icone;
  return (
    <li
      aria-current={estado === "atual" ? "step" : undefined}
      className={cn(
        LI,
        estado === "atual" ? "border-primary font-bold text-foreground" : "border-border",
        estado === "feito" && "text-foreground",
        estado === "porFazer" && "text-muted-foreground",
        estado === "perdido" && "border-destructive font-medium text-foreground",
        estado === "foraAlcance" && "border-border text-muted-foreground",
      )}
    >
      <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
      {/* Em ecrãs estreitos só o ícone se vê, mas o nome continua a ser lido. */}
      <span className="max-sm:sr-only">{estado === "perdido" ? textos.perdidaEm(passo.nome) : passo.nome}</span>
      {estado !== "perdido" && <span className="sr-only">, {TEXTO_ESTADO(estado, textos)}</span>}
    </li>
  );
}

export function PercursoLead({ rotulo, passos, atual, perdidaEm = null, concluido = false, textos, resumoPerda }: PercursoLeadProps) {
  const estados = estadosPercurso(passos.length, atual, perdidaEm, concluido);
  const nomeAtual = passos[atual]?.nome;
  return (
    <div className="space-y-1.5">
      <ol aria-label={rotulo} className="flex gap-1">
        {passos.map((passo, i) => <Passo key={passo.chave} passo={passo} estado={estados[i]} textos={textos} />)}
      </ol>
      {perdidaEm === null && !concluido && nomeAtual && <p className="text-sm text-foreground sm:hidden">{textos.etapaAtual(nomeAtual)}</p>}
      {resumoPerda && <p className="text-sm font-medium text-foreground">{resumoPerda}</p>}
    </div>
  );
}

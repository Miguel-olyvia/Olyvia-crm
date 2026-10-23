// O percurso de uma lead: 5 passos (Lead, Contacto, Visita, Negócio, Cliente), cada um com o ícone num chip redondo com a
// cor do passo. Os feitos têm um chip pastel com visto e a linha de cima escura, o atual leva o ícone do passo, a linha na cor do passo e negrito, os futuros ficam em cinzento. O estado de cada
// passo diz-se também em texto para leitores de ecrã (feito, atual, por fazer): nunca só por cor. Uma lead perdida mostra
// os passos anteriores como feitos, o passo onde se perdeu a vermelho com o ícone de perda, e os seguintes apagados e "fora
// de alcance". Os textos chegam por props: este ficheiro não importa de pessoas nem de negocio-metas.
import { Check, XCircle, type LucideIcon } from "lucide-react";
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

interface CorPasso {
  /** A linha de cima do passo atual. */
  linha: string;
  /** O chip pastel de um passo feito (leva o visto) e o, um pouco mais forte, do atual (leva o ícone do passo). */
  feito: string;
  atual: string;
}

// Lead sky, Contacto teal, Visita amber, Negócio violet, Cliente emerald (por posição). As classes escrevem-se por
// inteiro para o Tailwind as encontrar. O texto do nome é sempre `text-foreground`; a cor fica no chip e na linha.
const CORES: readonly CorPasso[] = [
  { linha: "border-sky-600 dark:border-sky-400", feito: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300", atual: "bg-sky-200 text-sky-800 dark:bg-sky-900 dark:text-sky-200" },
  { linha: "border-teal-600 dark:border-teal-400", feito: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300", atual: "bg-teal-200 text-teal-800 dark:bg-teal-900 dark:text-teal-200" },
  { linha: "border-amber-500 dark:border-amber-400", feito: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300", atual: "bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-200" },
  { linha: "border-violet-600 dark:border-violet-400", feito: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300", atual: "bg-violet-200 text-violet-800 dark:bg-violet-900 dark:text-violet-200" },
  { linha: "border-emerald-600 dark:border-emerald-400", feito: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300", atual: "bg-emerald-200 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200" },
];
const CHIP_VAZIO = "bg-muted text-muted-foreground";
const CHIP_PERDIDO = "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300";

const LI = "flex min-h-9 flex-1 items-center justify-center gap-1.5 border-t-2 px-1 pt-1.5 text-sm sm:justify-start";
const CHIP = "flex size-6 shrink-0 items-center justify-center rounded-full";

const TEXTO_ESTADO = (e: Exclude<EstadoPasso, "perdido">, t: TextosPercurso): string =>
  ({ feito: t.feito, atual: t.atual, porFazer: t.porFazer, foraAlcance: t.foraAlcance })[e];

interface PassoProps {
  passo: PassoPercurso;
  estado: EstadoPasso;
  posicao: number;
  /** O passo em destaque: o atual, ou o último de um percurso concluído (cliente). */
  destaque: boolean;
  textos: TextosPercurso;
}

function Passo({ passo, estado, posicao, destaque, textos }: PassoProps) {
  const cor = CORES[posicao % CORES.length];
  // Feito: visto; o destaque (o atual, ou o último de um percurso concluído) mostra o ícone do passo; perdido: XCircle.
  const feito = estado === "feito" && !destaque;
  const emDestaque = destaque && (estado === "atual" || estado === "feito");
  const vazio = estado === "porFazer" || estado === "foraAlcance";
  const Icone = estado === "perdido" ? XCircle : feito ? Check : passo.icone;
  return (
    <li
      aria-current={estado === "atual" ? "step" : undefined}
      className={cn(
        LI,
        feito && "border-foreground",
        emDestaque && cor.linha,
        estado === "perdido" && "border-destructive",
        vazio && "border-border",
        destaque ? "font-bold text-foreground" : "font-medium",
        (estado === "feito" || estado === "perdido") && "text-foreground",
        vazio && "text-muted-foreground",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(CHIP, feito && cor.feito, emDestaque && cor.atual, estado === "perdido" && CHIP_PERDIDO, vazio && CHIP_VAZIO)}
      >
        <Icone className="h-3.5 w-3.5" />
      </span>
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
    <div className="space-y-1">
      <ol aria-label={rotulo} className="flex gap-1">
        {passos.map((passo, i) => (
          <Passo
            key={passo.chave} passo={passo} estado={estados[i]} posicao={i} textos={textos}
            destaque={estados[i] === "atual" || (concluido && i === passos.length - 1)}
          />
        ))}
      </ol>
      {perdidaEm === null && !concluido && nomeAtual && <p className="text-sm text-foreground sm:hidden">{textos.etapaAtual(nomeAtual)}</p>}
      {resumoPerda && <p className="text-sm font-medium text-foreground">{resumoPerda}</p>}
    </div>
  );
}

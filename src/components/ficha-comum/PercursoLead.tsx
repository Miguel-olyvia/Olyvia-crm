// O percurso de uma lead: 5 passos (Lead, Contacto, Visita, Negócio, Cliente), cada um com o ícone num chip redondo com a
// cor do passo. Os feitos têm o chip preenchido, o atual leva anel e negrito, os futuros ficam em cinzento. O estado de cada
// passo diz-se também em texto para leitores de ecrã (feito, atual, por fazer): nunca só por cor. Uma lead perdida mostra
// os passos anteriores como feitos, o passo onde se perdeu a vermelho com o ícone de perda, e os seguintes apagados e "fora
// de alcance". Os textos chegam por props: este ficheiro não importa de pessoas nem de negocio-metas.
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

interface CorPasso {
  /** A linha de cima e o anel (passo feito ou atual). */
  linha: string;
  anel: string;
  /** O chip preenchido (feito ou atual). */
  chip: string;
}

// Lead sky, Contacto teal, Visita amber, Negócio violet, Cliente emerald (por posição). As classes escrevem-se por
// inteiro para o Tailwind as encontrar. O texto do nome é sempre `text-foreground`; a cor fica no chip e na linha.
const CORES: readonly CorPasso[] = [
  { linha: "border-sky-600 dark:border-sky-400", anel: "ring-sky-600 dark:ring-sky-400", chip: "bg-sky-700 text-white dark:bg-sky-500 dark:text-sky-950" },
  { linha: "border-teal-600 dark:border-teal-400", anel: "ring-teal-600 dark:ring-teal-400", chip: "bg-teal-700 text-white dark:bg-teal-500 dark:text-teal-950" },
  { linha: "border-amber-500 dark:border-amber-400", anel: "ring-amber-500 dark:ring-amber-400", chip: "bg-amber-600 text-white dark:bg-amber-500 dark:text-amber-950" },
  { linha: "border-violet-600 dark:border-violet-400", anel: "ring-violet-600 dark:ring-violet-400", chip: "bg-violet-700 text-white dark:bg-violet-500 dark:text-violet-950" },
  { linha: "border-emerald-600 dark:border-emerald-400", anel: "ring-emerald-600 dark:ring-emerald-400", chip: "bg-emerald-700 text-white dark:bg-emerald-500 dark:text-emerald-950" },
];
const CHIP_VAZIO = "bg-muted text-muted-foreground";
const CHIP_PERDIDO = "bg-red-700 text-white dark:bg-red-500 dark:text-red-950";

const LI = "flex min-h-11 flex-1 items-center justify-center gap-2 border-t-2 px-1 pt-2 text-sm sm:justify-start";
const CHIP = "flex h-7 w-7 shrink-0 items-center justify-center rounded-full";

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
  const Icone = estado === "perdido" ? XCircle : passo.icone;
  const colorido = estado === "feito" || estado === "atual";
  return (
    <li
      aria-current={estado === "atual" ? "step" : undefined}
      className={cn(
        LI,
        colorido && cor.linha,
        estado === "perdido" && "border-destructive",
        !colorido && estado !== "perdido" && "border-border",
        destaque ? "font-bold text-foreground" : "font-medium",
        estado === "feito" && "text-foreground",
        estado === "perdido" && "text-foreground",
        (estado === "porFazer" || estado === "foraAlcance") && "text-muted-foreground",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          CHIP,
          colorido ? cor.chip : estado === "perdido" ? CHIP_PERDIDO : CHIP_VAZIO,
          destaque && cn("ring-2 ring-offset-2 ring-offset-background", cor.anel),
          estado === "perdido" && "ring-2 ring-offset-2 ring-offset-background ring-red-700 dark:ring-red-500",
        )}
      >
        <Icone className="h-4 w-4" />
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
    <div className="space-y-1.5">
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

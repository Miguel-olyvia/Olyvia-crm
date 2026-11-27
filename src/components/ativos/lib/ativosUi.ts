/**
 * O desenho do ecrã de Ativos, sem contas novas: as cores de cada grupo e de cada estado (a partir dos tons do Inventário, `tones.ts`),
 * o ícone de cada tipo, o que a micro-barra de vida da lista mostra e a faixa «quem o teve» da ficha. Tudo parte dos cálculos que já
 * existem (`resumoAmortizacao`, `contaAtivo.ts`, `estadoDoAtivo`); aqui só se decide a forma. As classes têm sempre a variante `dark:`
 * para os dois modos seguirem a app, e o texto fica com contraste AA nos dois.
 */
import {
  Armchair,
  Ban,
  Car,
  CircleCheck,
  CircleMinus,
  Laptop,
  Monitor,
  Package,
  Shirt,
  Smartphone,
  TriangleAlert,
  Users,
  Warehouse,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { toneBadge } from "@/components/inventory/ui/tones";
import { somarMesesAoMes } from "@/components/rh-exemplo/lib/comoConta";
import { indiceDoMes, mesDaData, type MesIso } from "@/components/rh-exemplo/lib/custo";
import { contaDoAtivo, resumoAmortizacao } from "./amortizacaoAtivo";
import { donoDoMes, valorDoAtivoNoMes, type AtivoParaConta, type OcupacaoParaConta } from "./contaAtivo";
import { mesPt, type ChaveEstado } from "./resumoAtivo";
import type { Ativo, GrupoAtivo } from "./tipos";

/** O quadrado do ícone de cada grupo: Serviço azul (info), Estrutura violeta (primária), Pessoas verde-azulado. */
export const TOM_GRUPO: Record<GrupoAtivo, string> = {
  servico: toneBadge.info,
  estrutura: toneBadge.violet,
  // Não há tom «teal» nos tons do Inventário: 800 sobre o fundo tingido no claro, 300 no escuro (ambos acima de 4,5:1).
  pessoa: "bg-teal-500/15 text-teal-800 dark:bg-teal-400/15 dark:text-teal-300",
};

export const ICONE_GRUPO: Record<GrupoAtivo, LucideIcon> = { servico: Wrench, estrutura: Warehouse, pessoa: Users };

const ICONE_TIPO: Record<string, LucideIcon> = {
  "estrutura.instalacoes": Warehouse,
  "estrutura.mobiliario": Armchair,
  "estrutura.eletronica": Monitor,
  "estrutura.outro": Package,
  "pessoa.telemovel": Smartphone,
  "pessoa.portatil": Laptop,
  "pessoa.viatura": Car,
  "pessoa.fardamento": Shirt,
  "pessoa.ferramentas": Wrench,
  "pessoa.outro": Package,
};

/** O ícone de um ativo: o do tipo, ou o do grupo (o serviço não tem tipo). */
export function iconeDoAtivo(grupo: GrupoAtivo, tipo: string | null | undefined): LucideIcon {
  return (tipo && ICONE_TIPO[`${grupo}.${tipo}`]) || ICONE_GRUPO[grupo];
}

/** A etiqueta de cada estado: cor, ícone e texto (nunca só cor). */
export const TOM_ESTADO: Record<ChaveEstado, { classes: string; Icone: LucideIcon }> = {
  emUso: { classes: toneBadge.ok, Icone: CircleCheck },
  semEquipamento: { classes: toneBadge.warn, Icone: TriangleAlert },
  semPessoa: { classes: toneBadge.neutral, Icone: CircleMinus },
  desativado: { classes: toneBadge.neutral, Icone: Ban },
};

/** O aviso âmbar (com «amber» no nome da classe: o teste do aviso confere-o) e o erro. */
export const TOM_AVISO = {
  aviso: "rounded-xl border border-warning/40 bg-warning/10 p-3 text-amber-800 dark:border-warning/30 dark:bg-warning/10 dark:text-warning",
  erro: "rounded-xl border border-destructive/40 bg-destructive/10 p-3 font-medium text-red-700 dark:bg-destructive/20 dark:text-red-400",
} as const;

/** As cores das pessoas na faixa «quem o teve» (a estrutura vai às riscas). Texto escuro sobre o verde-azulado, nos dois modos. */
export const CORES_POSSE = [
  "bg-teal-500 text-teal-950",
  "bg-teal-300 text-teal-950 dark:bg-teal-600 dark:text-teal-50",
  "bg-teal-200 text-teal-950 dark:bg-teal-800 dark:text-teal-50",
] as const;
export const corDaPessoa = (i: number): string => CORES_POSSE[i % CORES_POSSE.length];

/** As riscas da estrutura («ninguém o tinha»), com as cores do tema. */
export const RISCAS_ESTRUTURA = {
  backgroundImage: "repeating-linear-gradient(135deg, hsl(var(--border)) 0 6px, hsl(var(--muted)) 6px 12px)",
} as const;

/**
 * Parte um texto traduzido à volta do valor: «Rendas: {valor} por mês (1 alugado)» -> ["Rendas: ", " por mês (1 alugado)"]. Serve para
 * pôr o número em grande sem mudar o texto (o conteúdo do elemento continua igual à frase inteira).
 */
export function partirTexto(texto: string, marca: string): [string, string] {
  const i = texto.indexOf(marca);
  return i < 0 ? [texto, ""] : [texto.slice(0, i), texto.slice(i + marca.length)];
}
/** A marca a pôr no lugar do valor antes de partir o texto. */
export const MARCA_VALOR = "\u0000";

export type VidaDaLinha =
  /** Comprado a amortizar: acaba em `fim`. */
  | { tipo: "acaba"; pct: number; fim: string }
  /** Comprado já totalmente amortizado. */
  | { tipo: "concluida"; pct: number; fim: string }
  /** Desativado: parou em `fim`. */
  | { tipo: "parou"; pct: number; fim: string }
  /** Alugado com fim. */
  | { tipo: "contrato"; pct: number; fim: string }
  /** Alugado sem fim (renova-se). */
  | { tipo: "semFim"; pct: null }
  /** Comprado sem vida em meses (por uso, ou sem vida definida). */
  | { tipo: "semTempo"; pct: null };

/** Os meses de `de` a `ate`, ambos incluídos (0 se `ate` é antes). */
const mesesIncluidos = (de: MesIso, ate: MesIso): number => Math.max(0, indiceDoMes(ate) - indiceDoMes(de) + 1);

/** Onde está hoje num contrato de aluguer com fim, de 0 a 100 (os meses que o contrato já tocou sobre os meses que tem). */
export function posicaoNoContrato(inicio: string, fim: string, mes: MesIso): number {
  const total = mesesIncluidos(mesDaData(inicio), mesDaData(fim));
  if (total <= 0) return 100;
  return Math.min(100, Math.round((mesesIncluidos(mesDaData(inicio), mes) / total) * 100));
}

/**
 * A micro-barra de vida de uma linha da lista. Comprado: a percentagem amortizada de `resumoAmortizacao` (a mesma da ficha) e o mês em
 * que acaba. Alugado: onde está hoje no contrato. Sem vida em meses, não há barra.
 */
export function vidaDaLinha(a: Ativo, mes: MesIso): VidaDaLinha {
  const desativado = a.estado === "desativado";
  if (a.forma === "alugado") {
    if (desativado && a.desativadoEm) return { tipo: "parou", pct: 100, fim: mesPt(mesDaData(a.desativadoEm)) };
    if (!a.inicioAluguer || !a.fimAluguer) return { tipo: "semFim", pct: null };
    return { tipo: "contrato", pct: posicaoNoContrato(a.inicioAluguer, a.fimAluguer, mes), fim: mesPt(mesDaData(a.fimAluguer)) };
  }
  const conta = contaDoAtivo(a);
  const resumo = conta?.forma === "comprado" ? resumoAmortizacao(conta, mes) : null;
  if (!resumo) return { tipo: "semTempo", pct: null };
  const fim = mesPt(resumo.fim);
  if (desativado) return { tipo: "parou", pct: resumo.percentagem, fim };
  return resumo.concluida && resumo.percentagem >= 100
    ? { tipo: "concluida", pct: 100, fim }
    : { tipo: "acaba", pct: resumo.percentagem, fim };
}

/** Uma barra a partir de 80 % fica em âmbar (está a acabar). */
export const vidaATerminar = (pct: number | null): boolean => pct !== null && pct >= 80;

export interface SegmentoDePosse {
  /** O índice da ocupação (a pessoa), ou -1 para a estrutura. */
  dono: number;
  meses: number;
}

/**
 * Os meses de um ativo, por ordem, agrupados por quem os pagou: a mesma regra de `repartoDoAtivo` (cada mês com custo é de quem tem o
 * equipamento no dia de referência; ninguém = estrutura), só que sem somar: serve para desenhar a faixa pela ordem do tempo. A soma dos
 * meses de cada dono é a de `repartoDoAtivo`.
 */
export function segmentosDePosse(conta: AtivoParaConta, ocupacoes: readonly OcupacaoParaConta[], mes: MesIso, hoje: string): SegmentoDePosse[] {
  const inicio = mesDaData(conta.forma === "comprado" ? conta.dataCompra : conta.inicioAluguer);
  const total = indiceDoMes(mes) - indiceDoMes(inicio);
  const segmentos: SegmentoDePosse[] = [];
  for (let k = 0; k <= total; k += 1) {
    const m = somarMesesAoMes(inicio, k);
    if (valorDoAtivoNoMes(conta, m) === 0) continue;
    const dono = ocupacoes.findIndex((o) => donoDoMes(o, conta, m, hoje));
    const ultimo = segmentos[segmentos.length - 1];
    if (ultimo && ultimo.dono === dono) ultimo.meses += 1;
    else segmentos.push({ dono, meses: 1 });
  }
  return segmentos;
}

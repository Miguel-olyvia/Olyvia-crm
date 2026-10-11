// Barras horizontais à mão (HTML e CSS, sem biblioteca): cada linha tem o nome, o número em texto (nunca só a cor) e uma barra neutra;
// só a maior leva a cor de destaque. Com `aoEscolher` cada linha é um botão que aplica o filtro; sem ação é só texto. O gráfico é uma lista.
import { cn } from "@/lib/utils";
import { eurosTexto, pctTexto, type BarraG } from "./graficosTipos";

const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
/** Cinzento com cerca de 4,6:1 sobre o fundo (o mínimo para elementos gráficos é 3:1). */
const NEUTRO = "bg-[hsl(220_10%_45%)]";

export interface LinhaBarraProps {
  rotulo: string;
  /** O número, em texto, à direita do nome. */
  texto: string;
  /** Largura da barra, de 0 a 100. */
  largura: number;
  destaque?: boolean;
  /** O que o botão faz, só para leitores de ecrã. */
  acaoRotulo?: string;
  aoClicar?: () => void;
}

/** Uma linha de um gráfico de barras: botão com ação, texto sem ela. */
export function LinhaBarra({ rotulo, texto, largura, destaque, acaoRotulo, aoClicar }: LinhaBarraProps) {
  const corpo = (
    <>
      <span className="flex items-baseline justify-between gap-3 text-[15px] leading-5">
        <span className="min-w-0 break-words text-foreground">{rotulo}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{texto}</span>
      </span>
      <span className="mt-1 block h-2.5 w-full rounded-full bg-muted" aria-hidden="true">
        <span className={cn("block h-full rounded-full", destaque ? "bg-primary" : NEUTRO)} style={{ width: `${Math.max(largura, largura > 0 ? 2 : 0)}%` }} />
      </span>
    </>
  );
  if (!aoClicar) return <li className="py-1.5">{corpo}</li>;
  return (
    <li>
      <button type="button" onClick={aoClicar} className={cn("block min-h-11 w-full cursor-pointer rounded-md px-1 py-1.5 text-left hover:bg-muted/60 motion-reduce:transition-none", FOCO)}>
        {corpo}
        {acaoRotulo && <span className="sr-only">. {acaoRotulo}</span>}
      </button>
    </li>
  );
}

interface BarrasProps<A> {
  /** O nome da lista, para quem usa leitor de ecrã. */
  nome: string;
  barras: readonly BarraG<A>[];
  /** O total para a percentagem de cada barra. */
  total: number;
  /** O que acontece ao carregar numa barra; recebe também o nome dela (para o aviso "Lista filtrada por Lisboa"). */
  aoEscolher?: (acao: A, rotulo: string) => void;
  /** O que o botão de cada barra diz a quem usa leitor de ecrã (por exemplo "Filtrar por Lisboa: 10 pessoas"). */
  acaoRotulo?: (b: BarraG<A>) => string;
  /** Mostra também o valor em euros de cada barra (Negócios). */
  euros?: boolean;
}

function texto<A>(b: BarraG<A>, total: number, euros: boolean | undefined): string {
  return [`${b.n}`, pctTexto(b.n, total), ...(euros ? [eurosTexto(b.euros ?? 0)] : [])].join(" · ");
}

export function BarrasH<A>({ nome, barras, total, aoEscolher, acaoRotulo, euros }: BarrasProps<A>) {
  const max = Math.max(0, ...barras.map((b) => (euros ? (b.euros ?? 0) : b.n)));
  const primeiro = barras.findIndex((b) => (euros ? (b.euros ?? 0) : b.n) === max && max > 0);
  return (
    <ul aria-label={nome} className="grid gap-0.5">
      {barras.map((b, i) => (
        <LinhaBarra key={b.id} rotulo={b.rotulo} texto={texto(b, total, euros)} largura={max > 0 ? (100 * (euros ? (b.euros ?? 0) : b.n)) / max : 0} destaque={i === primeiro}
          acaoRotulo={acaoRotulo ? acaoRotulo(b) : undefined} aoClicar={b.acao !== undefined && aoEscolher ? () => aoEscolher(b.acao as A, b.rotulo) : undefined} />
      ))}
    </ul>
  );
}

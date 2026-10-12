// A barra de filtros da V2 de Negócios, única e partilhada pelo Quadro e pelo Dashboard: pesquisa, os chips rápidos de sempre (Os meus, Todos, Com atraso,
// Casa de banho, Cozinha), o botão Filtros com o painel, os filtros ativos (chips removíveis, com Limpar tudo) e o contador de resultados (aria-live).
import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  NOME_FAIXA, NOME_PARADO, NOME_SERVICO, SEM_FILTROS_N, chipsAtivosN, opcoesN, type FiltrosN, type LinhaN,
} from "./filtrosNegocios";
import { COLUNAS_V2 } from "./negociosDocs";
import { Escolher, FiltrosPopover } from "./FiltrosPopover";
import { ChipsFiltros } from "./ChipsFiltros";
import type { Ctx } from "./pecas";

/** Os chips rápidos: o que o Estado lembra (S.filtro). */
export const RAPIDOS: [string, string][] = [["meus", "Os meus"], ["todos", "Todos"], ["atraso", "Com atraso"], ["wc", "Casa de banho"], ["coz", "Cozinha"]];

const TIPOS = [{ valor: "contrato", nome: "Com contrato" }, { valor: "direta", nome: "Venda direta" }];
const ORCAMENTOS = [{ valor: "1", nome: "Um orçamento" }, { valor: "2+", nome: "2 ou mais orçamentos" }];
const PERIODOS = [{ valor: "7", nome: "Últimos 7 dias" }, { valor: "30", nome: "Últimos 30 dias" }, { valor: "90", nome: "Últimos 90 dias" }];
const em = <K extends string>(nomes: Record<K, string>): { valor: string; nome: string }[] => (Object.keys(nomes) as K[]).map((k) => ({ valor: k, nome: nomes[k] }));

export const contagemNegocios = (n: number): string => (n === 0 ? "Nenhum negócio" : n === 1 ? "1 negócio" : `${n} negócios`);

interface PainelProps { linhas: readonly LinhaN[]; f: FiltrosN; setF: (v: Partial<FiltrosN>) => void; leitura: boolean }

/** O painel dos filtros: comercial, fase, tipo, número de orçamentos, faixa de valor, distrito, período, tempo parado e serviço. */
function Painel({ linhas, f, setF, leitura }: PainelProps) {
  const o = opcoesN(linhas), ativos = chipsAtivosN(f).length;
  const fases = COLUNAS_V2.map((c) => ({ valor: c.id, nome: c.nome }));
  return (
    <FiltrosPopover ativos={ativos} leitura={leitura}>
      <Escolher rotulo="Comercial" valor={f.comercial} aoMudar={(v) => setF({ comercial: v })} todas="Todos os comerciais" opcoes={o.comercial} />
      <Escolher rotulo="Fase" valor={f.fase} aoMudar={(v) => setF({ fase: v as FiltrosN["fase"] })} todas="Todas as fases" opcoes={fases} />
      <Escolher rotulo="Tipo" valor={f.tipo} aoMudar={(v) => setF({ tipo: v as FiltrosN["tipo"] })} todas="Com contrato e venda direta" opcoes={TIPOS} />
      <Escolher rotulo="Número de orçamentos" valor={f.orcamentos} aoMudar={(v) => setF({ orcamentos: v as FiltrosN["orcamentos"] })} todas="Qualquer número" opcoes={ORCAMENTOS} />
      <Escolher rotulo="Valor" valor={f.faixa} aoMudar={(v) => setF({ faixa: v as FiltrosN["faixa"] })} todas="Qualquer valor" opcoes={em(NOME_FAIXA)} />
      <Escolher rotulo="Distrito da pessoa" valor={f.distrito} aoMudar={(v) => setF({ distrito: v })} todas="Todos os distritos" opcoes={o.distrito} />
      <Escolher rotulo="Criado" valor={f.periodo} aoMudar={(v) => setF({ periodo: v as FiltrosN["periodo"] })} todas="Em qualquer altura" opcoes={PERIODOS} />
      <Escolher rotulo="Parado em Orçamento ou Proposta" valor={f.parado} aoMudar={(v) => setF({ parado: v as FiltrosN["parado"] })} todas="Qualquer" opcoes={em(NOME_PARADO)} />
      <Escolher rotulo="Serviço" valor={f.servico} aoMudar={(v) => setF({ servico: v as FiltrosN["servico"] })} todas="Todos os serviços" opcoes={em(NOME_SERVICO)} />
    </FiltrosPopover>
  );
}

interface BarraProps extends Pick<Ctx, "S" | "A" | "go" | "q"> {
  setQ: (v: string) => void;
  linhas: readonly LinhaN[];
  f: FiltrosN;
  setF: (v: Partial<FiltrosN>) => void;
  total: number;
  /** Uma fila de chips (as vistas rápidas) por baixo da pesquisa, só na V2. */
  vistas?: ReactNode;
  /** A margem de cima (por defeito a de sempre). */
  margem?: string;
}

export function BarraFiltrosN({ S, A, go, q, setQ, linhas, f, setF, total, vistas, margem = "mt-6" }: BarraProps) {
  const rapido = S.filtro;
  const limparTudo = go(() => { setQ(""); A.filtro("todos"); setF({ ...SEM_FILTROS_N }); });
  const chips = [
    ...(q.trim() ? [{ id: "q", texto: `Pesquisa: ${q.trim()}`, remover: () => setQ("") }] : []),
    ...(rapido !== "todos" ? [{ id: "rapido", texto: RAPIDOS.find(([k]) => k === rapido)?.[1] ?? rapido, remover: go(() => A.filtro("todos")) }] : []),
    ...chipsAtivosN(f).map((c) => ({ id: c.id, texto: c.texto, remover: () => setF(c.limpar) })),
  ];
  return (
    <div className={cn(margem, "grid gap-2")}>
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative w-full sm:w-80">
          <span className="sr-only">Procurar</span>
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input type="search" placeholder="Procurar nome, telefone ou serviço" value={q} onChange={(e) => setQ(e.target.value)}
            className="h-11 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
        </label>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden" role="group" aria-label="Mostrar">
          {RAPIDOS.map(([k, l]) => (
            <button key={k} type="button" aria-pressed={rapido === k} onClick={go(() => A.filtro(k))}
              className={cn("min-h-11 shrink-0 rounded-full border px-4 text-[15px] transition-colors", rapido === k ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-foreground/40")}>
              {l}
            </button>
          ))}
        </div>
        <Painel linhas={linhas} f={f} setF={setF} leitura={!!S.leitura} />
      </div>
      {vistas}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <ChipsFiltros chips={chips} limparTudo={limparTudo} />
        <p role="status" aria-live="polite" aria-atomic="true" className="text-[15px] tabular-nums text-muted-foreground">{contagemNegocios(total)}</p>
      </div>
    </div>
  );
}

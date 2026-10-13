import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AcoesNegocio } from "./AcoesNegocio";
import { LinhaNegocio } from "./LinhaNegocio";
import { RodapeLista } from "./RodapeLista";
import { FOCO } from "./estilos";
import type { TotalFase } from "./logicaQuadro";
import type { FaseNegocio, NegocioMes } from "./negocioMetas";
import { proximaOrdem, type ColunaLista, type Ordem } from "./ordenacaoQuadro";

interface ColunaCabecalho {
  id: string;
  chave: string;
  /** Coluna por que se ordena ao clicar no cabeçalho; sem ela o cabeçalho é só texto. */
  ordem?: ColunaLista;
  direita?: boolean;
  /** O cabeçalho só existe para leitores de ecrã (colunas de controlos). */
  soLeitor?: boolean;
}

const COLUNAS: readonly ColunaCabecalho[] = [
  { id: "selecao", chave: "businessGoals.deals.select", soLeitor: true },
  { id: "expandir", chave: "businessGoals.deals.expand", soLeitor: true },
  { id: "pessoa", chave: "businessGoals.deals.person", ordem: "pessoa" },
  { id: "fase", chave: "businessGoals.deals.phase", ordem: "fase" },
  { id: "valor", chave: "businessGoals.deals.value", ordem: "valor", direita: true },
  { id: "orcamentos", chave: "businessGoals.deals.quotes" },
  { id: "proposta", chave: "businessGoals.deals.proposal" },
  { id: "contrato", chave: "businessGoals.deals.contract" },
  { id: "saude", chave: "businessGoals.deals.health", ordem: "saude" },
  { id: "proximo", chave: "businessGoals.deals.nextDue", ordem: "prazo" },
  { id: "comercial", chave: "businessGoals.deals.rep", ordem: "comercial" },
  { id: "acoes", chave: "businessGoals.deals.actions", soLeitor: true },
];

interface ListaNegociosProps {
  /** As linhas já filtradas e ordenadas. */
  negocios: NegocioMes[];
  hoje: string;
  ordem: Ordem | null;
  totaisFase: Record<FaseNegocio, TotalFase>;
  ocultarComercial: boolean;
  selecionados: ReadonlySet<string>;
  acoes: AcoesNegocio;
  aoMudarOrdem: (ordem: Ordem | null) => void;
  aoAbrir: (negocio: NegocioMes) => void;
  aoAlternarSelecao: (id: string) => void;
}

function SetaOrdem({ ordem, coluna }: { ordem: Ordem | null; coluna: ColunaLista }) {
  if (ordem?.coluna !== coluna) return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden="true" />;
  const Seta = ordem.dir === "asc" ? ArrowUp : ArrowDown;
  return <Seta className="h-3.5 w-3.5" aria-hidden="true" />;
}

interface BotaoOrdenarProps {
  coluna: ColunaLista;
  texto: string;
  direita?: boolean;
  ordem: Ordem | null;
  aoMudarOrdem: (ordem: Ordem | null) => void;
}

/** O cabeçalho que ordena: botão de 44 px com a seta da direção. */
function BotaoOrdenar({ coluna, texto, direita, ordem, aoMudarOrdem }: BotaoOrdenarProps) {
  return (
    <button
      type="button" onClick={() => aoMudarOrdem(proximaOrdem(ordem, coluna))}
      className={cn("inline-flex min-h-11 cursor-pointer items-center gap-1 font-semibold", direita && "w-full justify-end", FOCO)}
    >
      {texto}
      <SetaOrdem ordem={ordem} coluna={coluna} />
    </button>
  );
}

interface CabecalhoProps {
  colunas: ColunaCabecalho[];
  ordem: Ordem | null;
  aoMudarOrdem: (ordem: Ordem | null) => void;
}

/** Cabeçalhos fixos ao rolar; os ordenáveis são botões com seta e `aria-sort`. */
function CabecalhoLista({ colunas, ordem, aoMudarOrdem }: CabecalhoProps) {
  const { t } = useTranslation();
  const sort = (c: ColunaLista) =>
    ordem?.coluna === c ? (ordem.dir === "asc" ? "ascending" : "descending") : "none";
  return (
    <TableHeader>
      <TableRow className="hover:bg-transparent">
        {colunas.map((c) => (
          <TableHead
            key={c.id} scope="col" aria-sort={c.ordem ? sort(c.ordem) : undefined}
            className={cn("sticky top-0 z-10 bg-card px-3 shadow-[inset_0_-1px_0_hsl(var(--border))]", c.direita && "text-right")}
          >
            {c.ordem ? (
              <BotaoOrdenar coluna={c.ordem} texto={t(c.chave)} direita={c.direita} ordem={ordem} aoMudarOrdem={aoMudarOrdem} />
            ) : (
              <span className={cn(c.soLeitor && "sr-only")}>{t(c.chave)}</span>
            )}
          </TableHead>
        ))}
      </TableRow>
    </TableHeader>
  );
}

/**
 * Lista: uma linha por negócio, expansível (cadeia, orçamentos e contacto). Cabeçalhos
 * que ordenam (aria-sort e seta) e ficam fixos ao rolar; "Expandir tudo" abre ou fecha
 * todas as linhas; o rodapé tem o total visível e os totais por fase. Até umas dezenas
 * de negócios por mês não precisa de paginação.
 */
export function ListaNegocios({ negocios, ocultarComercial, ...p }: ListaNegociosProps) {
  const { t } = useTranslation();
  const [expandidos, setExpandidos] = useState<ReadonlySet<string>>(new Set());
  const colunas = COLUNAS.filter((c) => !(ocultarComercial && c.id === "comercial"));
  const todosAbertos = negocios.length > 0 && negocios.every((n) => expandidos.has(n.id));

  const alternar = (id: string) =>
    setExpandidos((atual) => {
      const novo = new Set(atual);
      if (!novo.delete(id)) novo.add(id);
      return novo;
    });
  const alternarTodos = () => setExpandidos(todosAbertos ? new Set() : new Set(negocios.map((n) => n.id)));

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} aria-expanded={todosAbertos} onClick={alternarTodos}>
          {t("businessGoals.list.expandAll")}
        </Button>
      </div>
      <div className="rounded-xl border border-border/70 bg-card">
        <Table className="min-w-[1100px] text-sm" containerClassName="max-h-[70vh] scroll-pt-14 rounded-xl">
          <TableCaption className="sr-only">{t("businessGoals.list.caption")}</TableCaption>
          <CabecalhoLista colunas={colunas} ordem={p.ordem} aoMudarOrdem={p.aoMudarOrdem} />
          <TableBody>
            {negocios.map((n, pos) => (
              <LinhaNegocio
                key={n.id} negocio={n} hoje={p.hoje} pos={pos} colunas={colunas.length} ocultarComercial={ocultarComercial}
                selecionado={p.selecionados.has(n.id)} expandido={expandidos.has(n.id)} acoes={p.acoes}
                aoAbrir={p.aoAbrir} aoAlternarSelecao={p.aoAlternarSelecao} aoAlternarExpandir={alternar}
              />
            ))}
          </TableBody>
          <RodapeLista negocios={negocios} totaisFase={p.totaisFase} colunas={colunas.length} />
        </Table>
      </div>
    </div>
  );
}

// Movimentos dentro do novo Inventário (V.mov + movCard do artefacto vault/inventario-redesenho-completo.html).
//
//   <MovimentosBarra …/>   — pesquisa + Filtros (Tipo, Armazém, Documento, De, Até) + Cartões/Tabela + Exportar + Registar.
//   <MovimentosCartoes …/> — a grelha de cartões do livro: "data hora · armazém" e a quantidade com sinal em cima, uma frase
//                            (utilizador, produto), a contraparte/notas (e o custo, com products.view_cost) e, em mono,
//                            "tipo · documento · fica N".
//
// Só apresentação: as linhas, os filtros, a pesquisa, a exportação, o diálogo de movimento, as ligações dos documentos
// (renderDocument) e as permissões são os do StockMovements.tsx, que os passa por props. Fora da moldura nada disto aparece.
import { useId, type ReactNode } from "react";
import { ArrowLeftRight, Download, Lock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PermissionGate } from "@/components/PermissionGate";
import { MOVEMENT_TYPES, movementTypeLabel, signedMovementQty } from "@/components/inventory/ui/movementTypes";
import { toneText } from "@/components/inventory/ui/tones";
import {
  AlternadorVista,
  BOTAO_FANTASMA,
  BOTAO_PRIMARIO,
  BotaoFiltros,
  CARTAO,
  CampoFiltro,
  GRELHA,
  MONO,
  Pesquisa,
  SUB,
  type ModoVista,
} from "./pecas";

/* ------------------------------------------------------------------------------------------------ a barra */

export interface MovimentosBarraProps {
  pesquisa: string;
  aoPesquisar: (v: string) => void;
  tipo: string;
  aoTipo: (v: string) => void;
  armazem: string;
  aoArmazem: (v: string) => void;
  armazens: { id: string; name: string }[];
  documento: string;
  aoDocumento: (v: string) => void;
  de: string;
  aoDe: (v: string) => void;
  ate: string;
  aoAte: (v: string) => void;
  /** Há algum filtro (o hasActiveFilters da página, que inclui a pesquisa e o produto do URL). */
  temFiltros: boolean;
  aoLimpar: () => void;
  modo: ModoVista;
  aoMudarModo: (m: ModoVista) => void;
  aoExportar: () => void;
  exportando: boolean;
  aoRegistar: () => void;
}

export function MovimentosBarra(p: MovimentosBarraProps) {
  const id = useId();
  const cartoes = p.modo === "cartoes";
  // Os filtros do painel (a pesquisa está na barra; o produto do URL tem a sua pílula).
  const ativos = (p.tipo !== "all" ? 1 : 0) + (p.armazem !== "all" ? 1 : 0) + (p.documento ? 1 : 0) + (p.de ? 1 : 0) + (p.ate ? 1 : 0);
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="movimentos-barra">
      {/* Na vista Tabela a pesquisa e os filtros são os do cartão clássico (tal como está). */}
      {cartoes ? (
        <Pesquisa
          valor={p.pesquisa}
          aoMudar={p.aoPesquisar}
          placeholder="Produto, SKU ou EAN"
          rotulo="Pesquisar por produto, SKU ou EAN"
        />
      ) : null}
      {cartoes ? (
        <BotaoFiltros ativos={ativos}>
          <CampoFiltro rotulo="Tipo">
            <Select value={p.tipo} onValueChange={p.aoTipo}>
              <SelectTrigger aria-label="Tipo">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                {Object.entries(MOVEMENT_TYPES).map(([value, def]) => (
                  <SelectItem key={value} value={value}>{def.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CampoFiltro>
          <CampoFiltro rotulo="Armazém">
            <Select value={p.armazem} onValueChange={p.aoArmazem}>
              <SelectTrigger aria-label="Armazém">
                <SelectValue placeholder="Armazém" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os armazéns</SelectItem>
                {p.armazens.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
                {/* Armazém do URL que já não está na lista (ex.: eliminado) — como no ecrã clássico. */}
                {p.armazem !== "all" && !p.armazens.some((w) => w.id === p.armazem) ? (
                  <SelectItem value={p.armazem}>Armazém selecionado</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
          </CampoFiltro>
          <CampoFiltro rotulo="Documento" htmlFor={`${id}-doc`}>
            <Input
              id={`${id}-doc`}
              type="search"
              placeholder="PO, EC, INV, TR"
              value={p.documento}
              onChange={(e) => p.aoDocumento(e.target.value)}
            />
          </CampoFiltro>
          <div className="grid grid-cols-2 gap-2">
            <CampoFiltro rotulo="De" htmlFor={`${id}-de`}>
              <Input id={`${id}-de`} type="date" value={p.de} max={p.ate || undefined} onChange={(e) => p.aoDe(e.target.value)} />
            </CampoFiltro>
            <CampoFiltro rotulo="Até" htmlFor={`${id}-ate`}>
              <Input id={`${id}-ate`} type="date" value={p.ate} min={p.de || undefined} onChange={(e) => p.aoAte(e.target.value)} />
            </CampoFiltro>
          </div>
          {p.temFiltros ? (
            <Button type="button" variant="ghost" size="sm" onClick={p.aoLimpar}>
              <X className="mr-1.5 h-4 w-4" aria-hidden="true" /> Limpar filtros
            </Button>
          ) : null}
        </BotaoFiltros>
      ) : null}
      <div className={cn("flex flex-wrap items-center gap-2", !cartoes && "flex-1")}>
        <PermissionGate permission="inventory.export">
          <Button type="button" variant="ghost" className={BOTAO_FANTASMA} onClick={p.aoExportar} disabled={p.exportando}>
            <Download className="mr-2 h-4 w-4" aria-hidden="true" /> {p.exportando ? "A exportar…" : "Exportar"}
          </Button>
        </PermissionGate>
        <PermissionGate permission="inventory.edit">
          <Button type="button" className={BOTAO_PRIMARIO} onClick={p.aoRegistar}>
            <ArrowLeftRight className="mr-2 h-4 w-4" aria-hidden="true" /> Registar
          </Button>
        </PermissionGate>
      </div>
      <div className="ml-auto">
        <AlternadorVista modo={p.modo} aoMudar={p.aoMudarModo} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ os cartões */

/** Os campos de uma linha do livro que os cartões usam (o MovementRow do StockMovements.tsx tem-nos todos). */
export interface MovimentoCartao {
  id: string;
  movement_type: string;
  quantity: number;
  balance_after: number;
  document_number: string;
  counterparty: string | null;
  notes: string | null;
  created_at: string;
  warehouse_id: string;
  unit_cost_at_time?: number | null;
  products?: { name: string; sku: string | null } | null;
  warehouses?: { name: string } | null;
  created_by_user?: { name: string | null } | null;
}

/** O verbo do movSay() do artefacto, para os tipos reais de stock_movements. */
const VERBO: Record<string, string> = {
  entrada: "recebeu",
  saida: "deu saída de",
  venda: "deu saída de",
  estorno_venda: "repôs (estorno de venda)",
  transferencia_entrada: "recebeu por transferência",
  transferencia_saida: "transferiu (saída)",
  ajuste_positivo: "acertou (+)",
  ajuste_negativo: "acertou (−)",
  devolucao_fornecedor: "devolveu ao fornecedor",
  quebra: "registou quebra de",
};

export const SEM_UTILIZADOR = "Utilizador desconhecido";

/** O verbo da frase do cartão (movSay() do artefacto); um tipo desconhecido diz-se pelo nome. */
export const verboMovimento = (tipo: string): string => VERBO[tipo] ?? `registou (${movementTypeLabel(tipo)})`;

interface MovimentosCartoesProps<M extends MovimentoCartao> {
  linhas: M[];
  carregando: boolean;
  armazemDe: (m: M) => string;
  formatQty: (n: number) => string;
  formatDataHora: (iso: string) => string;
  /** O renderDocument da página (as mesmas ligações e permissões da coluna Documento). */
  documento: (m: M) => ReactNode;
  /** null = sem products.view_cost (o custo não aparece, como na tabela). */
  formatCusto: ((n: number) => string) | null;
  /** O rodapé da tabela: "A mostrar N de T" + "Carregar mais". */
  rodape: ReactNode;
}

function Cartao<M extends MovimentoCartao>({ m, p }: { m: M; p: MovimentosCartoesProps<M> }) {
  const qty = signedMovementQty(m.movement_type, m.quantity);
  const quem = m.created_by_user?.name || SEM_UTILIZADOR;
  const verbo = verboMovimento(m.movement_type);
  const contraparte = [m.counterparty, m.notes].filter(Boolean).join(" · ");
  const custo = p.formatCusto && m.unit_cost_at_time != null ? p.formatCusto(Number(m.unit_cost_at_time)) : null;
  return (
    <article className={CARTAO} data-testid="mov-cartao" aria-label={`${movementTypeLabel(m.movement_type)} · ${m.products?.name ?? "—"}`}>
      <div className="flex items-start justify-between gap-2">
        <span className={SUB} data-testid="mov-cartao-quando">
          {p.formatDataHora(m.created_at)} · {p.armazemDe(m)}
        </span>
        <span
          className={cn("whitespace-nowrap text-[1.1rem] font-extrabold tabular-nums", qty > 0 ? toneText.ok : qty < 0 ? toneText.bad : "text-foreground")}
          data-testid="mov-cartao-qtd"
        >
          {qty > 0 ? "+" : "−"}
          {p.formatQty(Math.abs(qty))}
        </span>
      </div>
      <p className="text-sm leading-snug" data-testid="mov-cartao-frase">
        <span className="font-semibold">{quem}</span> {verbo} <b className="tabular-nums">{p.formatQty(Math.abs(m.quantity))}</b> de{" "}
        {m.products?.name ?? "—"}
        {m.products?.sku ? <span className={cn(MONO, "ml-1")}>({m.products.sku})</span> : null}
      </p>
      {contraparte || custo ? (
        <p className={SUB} data-testid="mov-cartao-notas">
          {contraparte ? <span>{contraparte}</span> : null}
          {contraparte && custo ? " · " : null}
          {custo ? <span className="tabular-nums">custo {custo}/un</span> : null}
        </p>
      ) : null}
      <div className={cn(MONO, "flex flex-wrap items-center gap-x-1")} data-testid="mov-cartao-mono">
        <span>{movementTypeLabel(m.movement_type)}</span>
        <span aria-hidden="true">·</span>
        <span className="min-w-0">{p.documento(m)}</span>
        <span aria-hidden="true">·</span>
        <span className="tabular-nums">fica {p.formatQty(m.balance_after)}</span>
      </div>
    </article>
  );
}

export function MovimentosCartoes<M extends MovimentoCartao>(p: MovimentosCartoesProps<M>) {
  return (
    <div data-testid="movimentos-cartoes">
      {p.carregando ? (
        <p className="py-8 text-center text-muted-foreground" role="status">A carregar…</p>
      ) : (
        <div className={GRELHA}>
          {p.linhas.map((m) => (
            <Cartao key={m.id} m={m} p={p} />
          ))}
        </div>
      )}
      {p.rodape}
    </div>
  );
}

/** O que no ecrã clássico vive no cartão de filtros e não cabe na barra: o produto do URL, o aviso de pesquisa truncada e a regra do livro. */
export function MovimentosAvisos({
  produto,
  aoRemoverProduto,
  truncadoEm,
}: {
  /** Texto do produto do URL (?product=); null = sem filtro de produto. */
  produto: string | null;
  aoRemoverProduto: () => void;
  /** Limite da pesquisa quando foi cortada; null = não foi. */
  truncadoEm: number | null;
}) {
  return (
    <div className="space-y-2">
      {produto ? (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Produto:</span>
          <span className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5">
            {produto}
            <button
              type="button"
              onClick={aoRemoverProduto}
              className="rounded-full p-0.5 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Remover filtro de produto"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        </div>
      ) : null}
      {truncadoEm != null ? (
        <p className="text-xs text-muted-foreground">
          A pesquisa corresponde a muitos produtos — só os primeiros {truncadoEm} entram no filtro. Refine o termo.
        </p>
      ) : null}
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          O livro nunca se edita nem apaga: correções fazem-se com novos movimentos (ajuste, estorno, reversão).
          Uma saída que deixaria o stock abaixo de zero falha por inteiro.
        </span>
      </p>
    </div>
  );
}

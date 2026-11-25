// Fornecedores dentro da moldura do novo Inventário (V.forn do artefacto vault/inventario-redesenho-completo.html):
// aviso azul (.note.blue), barra (pesquisa + Filtros + Exportar/Importar + "+ Novo" + Cartões/Tabela), chips com
// contagem (.chips) e a grelha de cartões (.grid/.card/.pill).
//
// Só apresentação: os dados, o estado, os filtros e os handlers são os de src/pages/Suppliers.tsx (lista paginada,
// useSupplierOrgStats/useSupplierRowStats, contratos, seleção e ações em massa, menu da linha com as mesmas permissões).
// Nenhuma leitura nova. Fora da moldura (InventarioEmbebido = false) nada disto aparece.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Info, LayoutGrid, List, Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DisabledReason } from "@/components/inventory/ui/DisabledReason";
import { InventoryStatusBadge } from "@/components/inventory/ui/InventoryStatusBadge";
import { purchaseOrdersLink } from "@/components/inventory/ui/inventoryLinks";
import type { SupplierPortalState } from "../useSupplierListStats";
import type { SupplierContractListState } from "../contract/useSupplierContracts";
import { FornPilula, PILULA, contratoDetalhe, contratoPilula, pilulaTom, portalPilula, slaPilula } from "./fornPilulas";

export type FornVista = "cartoes" | "tabela";

const SEG =
  "inline-flex min-h-9 items-center gap-1.5 rounded-[10px] px-3 text-[13.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

// ------------------------------------------------------------------ barra (no lugar do cabeçalho clássico)

interface FornBarraProps {
  pesquisa: string;
  aoPesquisar: (valor: string) => void;
  vista: FornVista;
  aoMudarVista: (vista: FornVista) => void;
  /** Painel do botão "Filtros" (FornFiltros: Estado, Empresa). */
  filtros: ReactNode;
  filtrosAtivos: number;
  /** As ações de sempre (FAQ, Exportar, Importar com o diálogo, "+ Novo"), com os mesmos PermissionGate. */
  acoes: ReactNode;
}

export function FornBarra({ pesquisa, aoPesquisar, vista, aoMudarVista, filtros, filtrosAtivos, acoes }: FornBarraProps) {
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const painelId = useId();
  // Na vista Tabela a pesquisa e os filtros são os do cartão clássico; a barra fica com as ações e o alternador.
  const cartoes = vista === "cartoes";
  return (
    <div data-testid="forn-barra">
      <div className="flex flex-wrap items-center gap-2">
        {cartoes && (
          <label className="flex min-h-11 flex-[1_1_240px] items-center gap-2 rounded-[14px] border bg-card px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
            <Search className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            <input
              type="search"
              value={pesquisa}
              onChange={(e) => aoPesquisar(e.target.value)}
              placeholder="Nome, código, NIF, cidade, contacto"
              aria-label="Pesquisar fornecedores"
              className="min-w-0 flex-1 border-0 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
        )}
        {cartoes && (
          <Button
            type="button"
            variant="ghost"
            aria-expanded={filtrosAbertos}
            aria-controls={painelId}
            onClick={() => setFiltrosAbertos((v) => !v)}
            className={cn("min-h-11 rounded-[14px]", filtrosAbertos && "bg-muted")}
          >
            <SlidersHorizontal className="mr-2 h-4 w-4" aria-hidden="true" />
            Filtros
            {filtrosAtivos > 0 && (
              <span className="ml-1.5 rounded-full bg-primary px-1.5 text-xs leading-5 text-primary-foreground">
                {filtrosAtivos}
                <span className="sr-only"> ativos</span>
              </span>
            )}
          </Button>
        )}
        <div className="flex flex-wrap items-center gap-2">{acoes}</div>
        <div role="group" aria-label="Vista" className="ml-auto inline-flex rounded-[14px] border bg-card p-1">
          <button
            type="button"
            aria-pressed={vista === "cartoes"}
            onClick={() => aoMudarVista("cartoes")}
            className={cn(SEG, vista === "cartoes" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}
          >
            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
            Cartões
          </button>
          <button
            type="button"
            aria-pressed={vista === "tabela"}
            onClick={() => aoMudarVista("tabela")}
            className={cn(SEG, vista === "tabela" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}
          >
            <List className="h-4 w-4" aria-hidden="true" />
            Tabela
          </button>
        </div>
      </div>
      {cartoes && filtrosAbertos && (
        <div id={painelId} role="region" aria-label="Filtros" className="mt-2 rounded-[20px] border bg-card p-4 shadow-sm">
          {filtros}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ painel "Filtros" (Estado + Empresa)

interface FornFiltrosProps {
  estado: string;
  aoEstado: (v: string) => void;
  empresa: string;
  aoEmpresa: (v: string) => void;
  empresas: { id: string; name: string }[];
  temFiltros: boolean;
  limpar: () => void;
  rotuloLimpar: string;
}

/** Os mesmos Selects do cartão de filtros clássico (as caixas passaram para os chips, a pesquisa para a barra). */
export function FornFiltros(p: FornFiltrosProps) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Select value={p.estado} onValueChange={p.aoEstado}>
        <SelectTrigger className="w-full md:w-[170px]" aria-label="Estado">
          <SelectValue placeholder="Todos os estados" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os estados</SelectItem>
          <SelectItem value="active">Ativos</SelectItem>
          <SelectItem value="inactive">Inativos</SelectItem>
        </SelectContent>
      </Select>
      <Select value={p.empresa} onValueChange={p.aoEmpresa}>
        <SelectTrigger className="w-full md:w-[200px]" aria-label="Empresa">
          <SelectValue placeholder="Todas as empresas" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as empresas</SelectItem>
          {p.empresas.map((org) => (
            <SelectItem key={org.id} value={org.id}>
              {org.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {p.temFiltros && (
        <Button variant="ghost" size="sm" onClick={p.limpar} className="gap-1.5">
          <X className="h-4 w-4" />
          {p.rotuloLimpar}
        </Button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ aviso azul (.note.blue)

interface FornAvisoProps {
  aEspera: { id: string; name: string }[];
  /** null = sem suppliers.view: os nomes ficam em texto, sem "Abrir". */
  abrir: ((id: string) => void) | null;
  filtrar: () => void;
}

const LK =
  "inline-flex min-h-6 items-center rounded-sm font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-violet-300";

/** "Placo está à espera de preencher a ficha no portal. Abrir" — os mesmos dados e ações do aviso clássico. */
export function FornAviso({ aEspera, abrir, filtrar }: FornAvisoProps) {
  if (aEspera.length === 0) return null;
  const um = aEspera.length === 1;
  return (
    <div role="status" data-testid="forn-aviso" className="flex items-start gap-2.5 rounded-2xl bg-info/15 px-3.5 py-3 text-sm text-foreground">
      <Info className="mt-0.5 h-[18px] w-[18px] shrink-0 text-sky-700 dark:text-info" aria-hidden="true" />
      <div className="min-w-0">
        {um ? (
          <>
            <b className="font-semibold">{aEspera[0].name}</b> está à espera de preencher a ficha no portal.{" "}
            {abrir && (
              <button type="button" className={LK} onClick={() => abrir(aEspera[0].id)} aria-label={`Abrir ${aEspera[0].name}`}>
                Abrir
              </button>
            )}
          </>
        ) : (
          <>
            <b className="font-semibold">{aEspera.length} fornecedores</b> estão à espera de preencher a ficha no portal:{" "}
            {aEspera.map((s, i) => (
              <span key={s.id}>
                {i ? ", " : ""}
                {abrir ? (
                  <button type="button" className={LK} onClick={() => abrir(s.id)} aria-label={`Abrir ${s.name}`}>
                    {s.name}
                  </button>
                ) : (
                  s.name
                )}
              </span>
            ))}
            .
          </>
        )}{" "}
        <button type="button" className={LK} onClick={filtrar}>
          Filtrar
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ chips

export type FornCaixa = "aEspera" | "catalogo" | "precos" | "eliminados";

interface FornChipsProps {
  ativos: Record<FornCaixa, boolean>;
  /** null = contagem desconhecida (não se mostra número). */
  contagens: { todos: number | null; aEspera: number | null; catalogo: number | null; precos: number | null };
  /** Motivo para "Com preços por aprovar" bloqueado (sem suppliers.view_pricing / products.view_cost); null = livre. */
  bloqueioPrecos: string | null;
  aoTodos: () => void;
  aoAlternar: (caixa: FornCaixa, valor: boolean) => void;
}

const CHIP =
  "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Os chips são as mesmas caixas do cartão de filtros clássico (combinam-se: intersecção), mais "Todos" que as limpa.
 */
export function FornChips({ ativos, contagens, bloqueioPrecos, aoTodos, aoAlternar }: FornChipsProps) {
  const todos = !ativos.aEspera && !ativos.catalogo && !ativos.precos && !ativos.eliminados;
  const chip = (on: boolean) => cn(CHIP, on ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted");
  const num = (on: boolean, n: number | null) =>
    n == null ? null : <b className={cn("tabular-nums", on ? "text-background" : "text-foreground")}>{n}</b>;
  const item = (k: Exclude<FornCaixa, "precos">, rotulo: string, n: number | null) => (
    <button key={k} type="button" aria-pressed={ativos[k]} onClick={() => aoAlternar(k, !ativos[k])} className={chip(ativos[k])}>
      {rotulo} {num(ativos[k], n)}
    </button>
  );
  return (
    <div role="group" aria-label="Filtrar fornecedores" className="flex flex-wrap gap-1.5">
      <button type="button" aria-pressed={todos} onClick={aoTodos} className={chip(todos)}>
        Todos {num(todos, contagens.todos)}
      </button>
      {item("aEspera", "À espera do fornecedor", contagens.aEspera)}
      {item("catalogo", "Com catálogo por ligar", contagens.catalogo)}
      {bloqueioPrecos ? (
        <DisabledReason reason={bloqueioPrecos}>
          <button
            type="button"
            aria-pressed={ativos.precos}
            aria-disabled="true"
            onClick={(e) => e.stopPropagation()}
            className={cn(chip(ativos.precos), "cursor-not-allowed opacity-50")}
          >
            Com preços por aprovar
          </button>
        </DisabledReason>
      ) : (
        <button type="button" aria-pressed={ativos.precos} onClick={() => aoAlternar("precos", !ativos.precos)} className={chip(ativos.precos)}>
          Com preços por aprovar {num(ativos.precos, contagens.precos)}
        </button>
      )}
      {item("eliminados", "Ver eliminados", null)}
    </div>
  );
}

/**
 * O número de "Todos" é o total da lista sem caixas (com a pesquisa, o estado e a empresa de agora). Quando uma caixa
 * está ativa o total da página é o filtrado — guarda-se o último total sem caixas; muda a pesquisa/estado/empresa, esquece-se.
 */
export function useTotalSemCaixas(total: number, aCarregar: boolean, semCaixas: boolean, chaveFiltros: string): number | null {
  const [guardado, setGuardado] = useState<{ chave: string; total: number } | null>(null);
  const chaveRef = useRef(chaveFiltros);
  chaveRef.current = chaveFiltros;
  const semCaixasRef = useRef(semCaixas);
  semCaixasRef.current = semCaixas;
  const antes = useRef(aCarregar);
  // Só no fim de uma leitura (a carregar → carregado): o total é então o da lista que acabou de chegar.
  useEffect(() => {
    if (antes.current && !aCarregar && semCaixasRef.current) setGuardado({ chave: chaveRef.current, total });
    antes.current = aCarregar;
  }, [aCarregar, total]);
  return guardado && guardado.chave === chaveFiltros ? guardado.total : null;
}

// ------------------------------------------------------------------ cartões

/** Um cartão = uma linha da lista, já com os dados que a tabela clássica mostra. */
export interface FornCartao {
  id: string;
  nome: string;
  codigo: string | null;
  cidade: string | null;
  /** Nome da empresa (como a 2.ª linha da coluna Nome); null = não se mostra. */
  empresa: string | null;
  contacto: string | null;
  email: string | null;
  telefone: string | null;
  ativo: boolean;
  eliminado: boolean;
  /** Pedidos de preço por aprovar; null = sem dados/sem permissão. */
  precos: number | null;
  /** SLA % (null = sem dados). */
  slaPct: number | null | undefined;
  prazoDias: number | null;
  /** null = outra empresa / a carregar. */
  portal: SupplierPortalState | null;
  /** undefined = sem dados; null = sem contrato. */
  contrato: SupplierContractListState | null | undefined;
  /** null = sem dados. */
  posAbertas: number | null;
}

interface FornGrelhaProps {
  cartoes: FornCartao[];
  /** null = o cartão não abre (eliminado, ou sem suppliers.view) — como a linha da tabela. */
  abrir: (c: FornCartao) => (() => void) | null;
  /** Abrir a ficha em "Preços por aprovar" (null = sem suppliers.view: a pílula fica em texto). */
  abrirPrecos: ((id: string) => void) | null;
  /** Abrir a ficha no Contrato (null = sem suppliers.view). */
  abrirContrato: ((id: string) => void) | null;
  /** RowActions da linha (⋯ ou Restaurar), com os mesmos handlers e gates. */
  acoes: (id: string) => ReactNode;
  selecionados: Set<string>;
  aoSelecionar: (id: string) => void;
}

function Cartao({ c, p }: { c: FornCartao; p: FornGrelhaProps }) {
  const abre = p.abrir(c);
  const sel = p.selecionados.has(c.id);
  const sla = slaPilula(c.slaPct, c.prazoDias);
  const portal = portalPilula(c.portal);
  const contrato = contratoPilula(c.contrato);
  const detalheContrato = contratoDetalhe(c.contrato);
  const contactos = [c.contacto, c.email, c.telefone].filter(Boolean).join(" · ");
  const sub = [c.codigo || "—", c.cidade || "—"].join(" · ");
  const contratoClicavel = !!p.abrirContrato && c.contrato != null && !c.eliminado;
  return (
    <article
      data-testid="forn-cartao"
      aria-label={c.nome}
      className={cn(
        "relative flex flex-col gap-2.5 rounded-[20px] border bg-card px-4 py-[15px] text-card-foreground shadow-sm transition-[transform,border-color] duration-150",
        abre && "hover:-translate-y-0.5 hover:border-primary focus-within:border-primary motion-reduce:hover:translate-y-0",
        sel && "border-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.15)]",
        c.eliminado && "opacity-70",
      )}
    >
      {/* O cartão inteiro abre a ficha: um botão por baixo do conteúdo (os controlos ficam por cima com z-10). */}
      {abre && (
        <button
          type="button"
          onClick={abre}
          aria-label={`Abrir ficha de ${c.nome}`}
          className="absolute inset-0 rounded-[20px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        />
      )}
      <div className="pointer-events-none relative flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="pointer-events-auto relative z-10 -m-1 inline-flex h-7 w-7 shrink-0 items-center justify-center">
            <Checkbox aria-label={`Selecionar ${c.nome}`} checked={sel} onCheckedChange={() => p.aoSelecionar(c.id)} />
          </span>
          <div className="min-w-0">
            <div className="text-[15.5px] font-bold leading-snug">
              {c.nome}
              {c.eliminado && <InventoryStatusBadge className="ml-1.5 align-middle">Eliminado</InventoryStatusBadge>}
            </div>
            <div className="font-mono text-[12.5px] text-muted-foreground">{sub}</div>
            {c.empresa && <div className="text-xs text-muted-foreground">{c.empresa}</div>}
          </div>
        </div>
        {c.precos ? (
          p.abrirPrecos ? (
            <button
              type="button"
              onClick={() => p.abrirPrecos?.(c.id)}
              aria-label={`${c.precos} preços por aprovar de ${c.nome}`}
              className={cn(
                PILULA,
                pilulaTom("warn"),
                "pointer-events-auto relative z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              )}
            >
              {c.precos} preços por aprovar
            </button>
          ) : (
            <FornPilula tom="warn">{c.precos} preços por aprovar</FornPilula>
          )
        ) : null}
      </div>
      <div className="pointer-events-none relative min-w-0 break-words text-[13px] text-muted-foreground">
        {contactos || "Sem contacto"}
      </div>
      <div className="pointer-events-none relative flex flex-wrap items-center gap-1.5">
        <FornPilula tom={sla.tom} className="pointer-events-none">
          {sla.texto}
        </FornPilula>
        <FornPilula tom={portal.tom} className="pointer-events-none">
          {portal.texto}
        </FornPilula>
        {contratoClicavel ? (
          <button
            type="button"
            onClick={() => p.abrirContrato?.(c.id)}
            aria-label={`Abrir o contrato de ${c.nome}: ${contrato.texto.replace("Contrato: ", "")}`}
            className={cn(
              PILULA,
              pilulaTom(contrato.tom),
              "pointer-events-auto relative z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            )}
          >
            {contrato.texto}
          </button>
        ) : (
          <FornPilula tom={contrato.tom} className="pointer-events-none">
            {contrato.texto}
          </FornPilula>
        )}
      </div>
      {detalheContrato && (
        <div className="pointer-events-none relative -mt-1 font-mono text-[11.5px] text-muted-foreground">{detalheContrato}</div>
      )}
      <div className="pointer-events-none relative flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] text-muted-foreground">
          {c.posAbertas == null ? (
            "— POs abertas"
          ) : c.posAbertas > 0 ? (
            <Link
              to={purchaseOrdersLink({ supplier: c.id })}
              onClick={(e) => e.stopPropagation()}
              aria-label={`${c.posAbertas} encomenda(s) em aberto de ${c.nome}`}
              className="pointer-events-auto relative z-10 rounded-sm font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-violet-300"
            >
              {c.posAbertas} POs abertas
            </Link>
          ) : (
            "0 POs abertas"
          )}
          {" · "}
          {c.ativo ? "Ativo" : "Inativo"}
        </span>
        <div className="pointer-events-auto relative z-10">{p.acoes(c.id)}</div>
      </div>
    </article>
  );
}

export function FornGrelha(p: FornGrelhaProps) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2.5" data-testid="forn-grelha">
      {p.cartoes.map((c) => (
        <Cartao key={c.id} c={c} p={p} />
      ))}
    </div>
  );
}

/** "Selecionar todos" por cima da grelha (o da tabela fica no cabeçalho da coluna). */
export function FornSelecionarTodos({ total, selecionados, aoAlternar }: { total: number; selecionados: number; aoAlternar: () => void }) {
  if (total === 0) return null;
  return (
    <label className="inline-flex min-h-6 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
      <Checkbox aria-label="Selecionar todos" checked={selecionados === total && total > 0} onCheckedChange={aoAlternar} />
      Selecionar todos
      {selecionados > 0 ? <span className="tabular-nums text-foreground">({selecionados})</span> : null}
    </label>
  );
}

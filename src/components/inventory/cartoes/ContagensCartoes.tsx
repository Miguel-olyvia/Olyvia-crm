// Contagens dentro do novo Inventário (V.cnt do artefacto vault/inventario-redesenho-completo.html).
//
//   <ContagensBarra …/>   — chips Todas · Em contagem · Finalizadas · Canceladas (com contagem), a pílula das paradas
//                           (?stalled=1), Filtros (documento, armazém, categoria), Cartões/Tabela e "+ Nova contagem".
//   <ContagensCartoes …/> — a grelha de cartões: "Armazém · Categoria" e o documento em mono, a pílula de estado
//                           ("Parada há N dias" a âmbar), a percentagem grande, a barra de progresso e as discrepâncias.
//                           O cartão inteiro abre o mesmo InventoryCountDetailDialog (onOpen da página).
//
// Só apresentação: as linhas (com os agregados), os contadores, os filtros no URL, o diálogo de criação e o de detalhe
// são os do StockCounts.tsx. As regras (paradas, progresso, discrepâncias) são as da StockCountsTable.
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeftRight, Eye, ListChecks, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BlockedButton } from "@/components/inventory/ui/DisabledReason";
import { InventoryEmptyState } from "@/components/inventory/ui/InventoryEmptyState";
import { RowActions } from "@/components/inventory/ui/RowActions";
import { stockMovementsLink } from "@/components/inventory/ui/inventoryLinks";
import { toneText, type InventoryTone } from "@/components/inventory/ui/tones";
import { stalledDays, type StockCountRow } from "@/components/inventory/counts/StockCountsTable";
import {
  AlternadorVista,
  BOTAO_PRIMARIO,
  BarraProgresso,
  BotaoFiltros,
  CARTAO,
  CARTAO_CLICAVEL,
  CampoFiltro,
  Chip,
  GRANDE,
  GRANDE_SMALL,
  GRELHA,
  MONO,
  Pilula,
  SUB,
  TITULO,
  type ModoVista,
} from "./pecas";

/* ------------------------------------------------------------------------------------------------ a barra */

export interface OpcaoEstadoContagem<V extends string> {
  value: V;
  label: ReactNode;
  count: number | null;
  pressed: boolean;
}

export interface ContagensBarraProps<V extends string> {
  estados: OpcaoEstadoContagem<V>[];
  aoEstado: (v: V) => void;
  /** ?stalled=1: a pílula "Paradas há mais de N dias" (clicar remove o filtro). null = sem o filtro. */
  paradas: { rotulo: string; aoRemover: () => void } | null;
  pesquisa: string;
  aoPesquisar: (v: string) => void;
  rotuloPesquisa: string;
  armazem: string;
  aoArmazem: (v: string) => void;
  armazens: { id: string; name: string }[];
  rotuloTodosArmazens: string;
  categoria: string;
  aoCategoria: (v: string) => void;
  categorias: { id: string; name: string }[];
  rotuloTodasCategorias: string;
  /** Há filtros ou estado escolhidos (o mesmo critério do botão "Limpar filtros" da página). */
  temFiltros: boolean;
  aoLimpar: () => void;
  rotuloLimpar: string;
  modo: ModoVista;
  aoMudarModo: (m: ModoVista) => void;
  /** O mesmo gate da página (inventory.count OU inventory.edit): bloqueado mostra o motivo. */
  novaContagem: { permitido: boolean; motivo: string | undefined; aoClicar: () => void };
}

export function ContagensBarra<V extends string>(p: ContagensBarraProps<V>) {
  const cartoes = p.modo === "cartoes";
  const ativos = (p.pesquisa ? 1 : 0) + (p.armazem !== "all" ? 1 : 0) + (p.categoria !== "all" ? 1 : 0);
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="contagens-barra">
      {/* Na vista Tabela os chips e os filtros são os clássicos (por cima da tabela, tal como estão). */}
      {cartoes ? (
        <div role="group" aria-label="Estado das contagens" className="flex flex-wrap gap-1.5">
          {p.estados.map((o) => (
            <Chip key={o.value} pressionado={o.pressed} contagem={o.count} onClick={() => p.aoEstado(o.value)}>
              {o.label}
            </Chip>
          ))}
          {p.paradas ? (
            <Chip pressionado contagem={null} onClick={p.paradas.aoRemover}>
              {p.paradas.rotulo}
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">(remover filtro)</span>
            </Chip>
          ) : null}
        </div>
      ) : null}
      <span className="flex-1" aria-hidden="true" />
      {cartoes ? (
        <BotaoFiltros ativos={ativos}>
          <CampoFiltro rotulo="Documento" htmlFor="contagens-pesquisa">
            <Input
              id="contagens-pesquisa"
              type="search"
              placeholder={p.rotuloPesquisa}
              value={p.pesquisa}
              onChange={(e) => p.aoPesquisar(e.target.value)}
            />
          </CampoFiltro>
          <CampoFiltro rotulo="Armazém">
            <Select value={p.armazem} onValueChange={p.aoArmazem}>
              <SelectTrigger aria-label="Armazém">
                <SelectValue placeholder="Armazém" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{p.rotuloTodosArmazens}</SelectItem>
                {p.armazens.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CampoFiltro>
          <CampoFiltro rotulo="Categoria">
            <Select value={p.categoria} onValueChange={p.aoCategoria}>
              <SelectTrigger aria-label="Categoria">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{p.rotuloTodasCategorias}</SelectItem>
                {p.categorias.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CampoFiltro>
          {p.temFiltros ? (
            <Button type="button" variant="ghost" size="sm" onClick={p.aoLimpar}>
              <X className="mr-1.5 h-4 w-4" aria-hidden="true" /> {p.rotuloLimpar}
            </Button>
          ) : null}
        </BotaoFiltros>
      ) : null}
      <AlternadorVista modo={p.modo} aoMudar={p.aoMudarModo} />
      <BlockedButton
        type="button"
        className={BOTAO_PRIMARIO}
        blockedReason={p.novaContagem.permitido ? null : (p.novaContagem.motivo ?? "Sem permissão")}
        onClick={p.novaContagem.aoClicar}
      >
        <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Nova contagem
      </BlockedButton>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ os cartões */

// Os mesmos rótulos e tons da StockCountsTable.
const ESTADO: Record<string, { rotulo: string; tom: InventoryTone }> = {
  em_contagem: { rotulo: "Em contagem", tom: "info" },
  finalizada: { rotulo: "Finalizada", tom: "ok" },
  cancelada: { rotulo: "Cancelada", tom: "neutral" },
};

const formatDataHora = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

interface ContagensCartoesProps {
  linhas: StockCountRow[];
  carregando: boolean;
  /** "Todas" — a categoria de uma contagem sem categoria. */
  rotuloTodasCategorias: string;
  rotuloNaoContadasComStock: (n: number) => string;
  abrir: (id: string) => void;
}

function Cartao({ c, p, agora }: { c: StockCountRow; p: ContagensCartoesProps; agora: number }) {
  const navigate = useNavigate();
  const dias = stalledDays(c, agora);
  const estado = ESTADO[c.status] ?? { rotulo: c.status, tom: "neutral" as InventoryTone };
  const feito = c.counted_lines ?? 0;
  const total = c.total_lines ?? 0;
  const pct = total > 0 ? Math.round(Math.min(100, (feito / total) * 100)) : 0;
  const disc = c.discrepancies ?? 0;
  const porResolver = c.pending_discrepancies ?? 0;
  const naoContadas = c.uncounted_with_stock ?? 0;
  const titulo = `${c.warehouses?.name || "—"} · ${c.product_categories?.name || p.rotuloTodasCategorias}`;
  return (
    <article className={cn(CARTAO, CARTAO_CLICAVEL)} data-testid="contagem-cartao">
      {/* O cartão inteiro abre o detalhe: um botão por baixo do conteúdo (as ações ficam por cima com z-10). */}
      <button
        type="button"
        onClick={() => p.abrir(c.id)}
        aria-label={`Abrir a contagem ${c.document_number} · ${titulo}`}
        className="absolute inset-0 rounded-[20px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      />
      <div className="pointer-events-none relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={TITULO}>{titulo}</div>
          <div className={MONO}>{c.document_number}</div>
        </div>
        {dias !== null ? (
          <Pilula tom="warn">Parada há {dias} dias</Pilula>
        ) : (
          <Pilula tom={estado.tom}>{estado.rotulo}</Pilula>
        )}
      </div>
      <div className="pointer-events-none relative">
        <div className={GRANDE} data-testid="contagem-cartao-pct">
          {pct}
          <small className={GRANDE_SMALL}>% contado</small>
        </div>
      </div>
      <div className="pointer-events-none relative space-y-1">
        <BarraProgresso feito={feito} total={total} rotulo={`${feito} de ${total} contadas`} />
        <span className={cn(SUB, "block tabular-nums")}>
          {feito} / {total} contadas · {dias !== null ? `${estado.rotulo} · ` : ""}Iniciada {formatDataHora(c.started_at)}
        </span>
      </div>
      <div className="pointer-events-none relative flex flex-wrap items-center justify-between gap-2 [&_a]:pointer-events-auto [&_button]:pointer-events-auto">
        <span className={cn(SUB, "pointer-events-none")} data-testid="contagem-cartao-disc">
          {disc ? `${disc} ${disc === 1 ? "discrepância" : "discrepâncias"}` : "Sem discrepâncias"}
          {porResolver > 0 && c.status === "em_contagem" ? (
            <>
              {" · "}
              <span className={cn("font-semibold", toneText.bad)}>{porResolver} por resolver</span>
            </>
          ) : null}
          {naoContadas > 0 ? (
            <>
              {" · "}
              <span className={cn("font-semibold", toneText.warn)}>{p.rotuloNaoContadasComStock(naoContadas)}</span>
            </>
          ) : null}
        </span>
        <div className="relative z-10">
          <RowActions
            modal={false}
            items={[
              { label: "Abrir detalhe", icon: Eye, onSelect: () => p.abrir(c.id) },
              {
                label: "Ver movimentos de ajuste",
                icon: ArrowLeftRight,
                onSelect: () => navigate(stockMovementsLink({ doc: c.document_number })),
                hidden: c.status !== "finalizada",
              },
            ]}
            menuLabel={`Mais ações para ${c.document_number}`}
          />
        </div>
      </div>
    </article>
  );
}

export function ContagensCartoes(p: ContagensCartoesProps) {
  const agora = Date.now();
  if (p.carregando) {
    return <p className="py-8 text-center text-muted-foreground" role="status">A carregar…</p>;
  }
  if (p.linhas.length === 0) {
    return <InventoryEmptyState title="Sem contagens" icon={ListChecks} />;
  }
  return (
    <div className={GRELHA} data-testid="contagens-cartoes">
      {p.linhas.map((c) => (
        <Cartao key={c.id} c={c} p={p} agora={agora} />
      ))}
    </div>
  );
}

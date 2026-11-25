// Armazéns dentro do novo Inventário (V.arm do artefacto vault/inventario-redesenho-completo.html).
//
//   <ArmazensBarra …/>   — Ver eliminados · Exportar · Importar · "+ Novo armazém" e o alternador Cartões / Detalhe
//                          (o Armazéns não tem tabela: o "Detalhe" é a grelha clássica, com todos os campos e botões).
//   <ArmazensCartoes …/> — a grelha: o nome e a pílula "Serve clientes" / "Não serve clientes", a morada, o valor em grande
//                          (só com products.view_cost, como hoje), "N produtos", os interruptores Ativo / Serve clientes
//                          (bloqueados mostram o «i» com o motivo) e o ⋯ (Editar, Movimentos recentes, Registar movimento,
//                          Ver no livro de movimentos, Eliminar/Restaurar) com os mesmos gates. O cartão abre as Existências
//                          desse armazém (data-tab="exi" do artefacto).
//
// Só apresentação: os armazéns, as estatísticas, os diálogos e os handlers são os do Warehouses.tsx.
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeftRight, Download, History, List, Pencil, Plus, Trash2, Undo2, Upload, Warehouse } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { PermissionGate } from "@/components/PermissionGate";
import { DisabledReasonInfo } from "@/components/inventory/ui/DisabledReason";
import { InventoryEmptyState } from "@/components/inventory/ui/InventoryEmptyState";
import { RowActions } from "@/components/inventory/ui/RowActions";
import { stockMovementsLink, stocksLink } from "@/components/inventory/ui/inventoryLinks";
import { toneText } from "@/components/inventory/ui/tones";
import {
  AlternadorVista,
  BOTAO_FANTASMA,
  BOTAO_PRIMARIO,
  CARTAO,
  CARTAO_CLICAVEL,
  GRANDE,
  GRELHA,
  MONO,
  Pilula,
  SUB,
  TITULO,
  type ModoVista,
} from "./pecas";

/* ------------------------------------------------------------------------------------------------ a barra */

export interface ArmazensBarraProps {
  verEliminados: boolean;
  aoVerEliminados: () => void;
  rotuloVerEliminados: string;
  aoExportar: () => void;
  rotuloExportar: string;
  aoImportar: () => void;
  rotuloImportar: string;
  aoNovo: () => void;
  rotuloNovo: string;
  modo: ModoVista;
  aoMudarModo: (m: ModoVista) => void;
}

export function ArmazensBarra(p: ArmazensBarraProps) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="armazens-barra">
      <AlternadorVista modo={p.modo} aoMudar={p.aoMudarModo} rotuloTabela="Detalhe" IconeTabela={List} />
      <Button
        type="button"
        variant="ghost"
        aria-pressed={p.verEliminados}
        onClick={p.aoVerEliminados}
        className={cn(BOTAO_FANTASMA, p.verEliminados && "bg-muted")}
      >
        <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" /> {p.rotuloVerEliminados}
      </Button>
      <span className="flex-1" aria-hidden="true" />
      <PermissionGate permission="warehouses.export">
        <Button type="button" variant="ghost" className={BOTAO_FANTASMA} onClick={p.aoExportar}>
          <Download className="mr-2 h-4 w-4" aria-hidden="true" /> {p.rotuloExportar}
        </Button>
      </PermissionGate>
      <PermissionGate permission="warehouses.import">
        <Button type="button" variant="ghost" className={BOTAO_FANTASMA} onClick={p.aoImportar}>
          <Upload className="mr-2 h-4 w-4" aria-hidden="true" /> {p.rotuloImportar}
        </Button>
      </PermissionGate>
      <PermissionGate permission="warehouses.create">
        <Button type="button" className={BOTAO_PRIMARIO} onClick={p.aoNovo}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> {p.rotuloNovo}
        </Button>
      </PermissionGate>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ os cartões */

/** Os campos de um armazém que os cartões usam (o WarehouseData do Warehouses.tsx tem-nos todos). */
export interface ArmazemCartao {
  id: string;
  name: string;
  code: string;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  is_active: boolean;
  serves_customers: boolean;
  deleted_at: string | null;
}

interface EstatisticasArmazem {
  products: number;
  value: number;
  belowReorder: number;
}

interface ArmazensCartoesProps<W extends ArmazemCartao> {
  armazens: W[];
  /** null = ainda a carregar ("…", como no ecrã clássico). */
  estatisticas: (w: W) => EstatisticasArmazem | null;
  /** false = sem products.view_cost: o valor fica "—". */
  verCusto: boolean;
  formatEur: (n: number) => string;
  armazemPorDefeito: string | null;
  eCarrinha: (w: W) => boolean;
  /** O gate warehouses.edit da página (usePermissionGate). */
  editar: { allowed: boolean; reason?: string };
  aGravar: string | null;
  /** Os mesmos handlers dos interruptores da página (ligar grava; desligar pede confirmação). */
  aoAtivo: (w: W, valor: boolean) => void;
  aoServir: (w: W, valor: boolean) => void;
  aoEditar: (w: W) => void;
  aoHistorico: (w: W) => void;
  aoMovimento: (w: W) => void;
  aoEliminar: (w: W) => void;
  aoRestaurar: (w: W) => void;
  rotulos: { ativo: string; restaurar: string };
  verEliminados: boolean;
  semArmazens: string;
}

function morada(w: ArmazemCartao): string {
  return [w.address, [w.postal_code, w.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || "Sem morada";
}

function Cartao<W extends ArmazemCartao>({ w, p }: { w: W; p: ArmazensCartoesProps<W> }) {
  const navigate = useNavigate();
  const eliminado = !!w.deleted_at;
  const est = p.estatisticas(w);
  const carrinha = p.eCarrinha(w);
  const switchAtivo = `whc-active-${w.id}`;
  const switchServe = `whc-serves-${w.id}`;
  return (
    <article
      aria-labelledby={`whc-nome-${w.id}`}
      data-testid="armazem-cartao"
      className={cn(CARTAO, CARTAO_CLICAVEL, eliminado && "opacity-60")}
    >
      {/* O cartão inteiro abre as Existências deste armazém (as ações ficam por cima com z-10). */}
      <Link
        to={stocksLink({ warehouse: w.id })}
        aria-label={`Ver existências de ${w.name}`}
        className="absolute inset-0 rounded-[20px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      />
      <div className="pointer-events-none relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={`whc-nome-${w.id}`} className={cn(TITULO, "truncate")}>{w.name}</h3>
          <div className={MONO}>{w.code}</div>
        </div>
        {eliminado ? (
          <Pilula tom="neutral">Eliminado</Pilula>
        ) : w.serves_customers ? (
          <Pilula tom="ok">Serve clientes</Pilula>
        ) : (
          <Pilula tom="neutral">Não serve clientes</Pilula>
        )}
      </div>
      <span className={cn(SUB, "pointer-events-none relative")}>{morada(w)}</span>
      <span className={cn(GRANDE, "pointer-events-none relative")} data-testid="armazem-cartao-valor">
        {!p.verCusto ? "—" : est ? p.formatEur(est.value) : "…"}
        {!p.verCusto ? <small className="ml-1.5 text-[13px] font-semibold tracking-normal text-muted-foreground">sem acesso aos custos</small> : null}
      </span>
      <span className={cn(SUB, "pointer-events-none relative")} data-testid="armazem-cartao-produtos">
        {est ? est.products : "…"} produtos
        {est ? (
          <>
            {" · "}
            <span className={est.belowReorder ? toneText.bad : undefined}>{est.belowReorder} abaixo do ponto de encomenda</span>
          </>
        ) : null}
      </span>

      <div className="pointer-events-none relative z-10 flex flex-wrap items-center justify-between gap-2 [&_a]:pointer-events-auto [&_button]:pointer-events-auto [&_label]:pointer-events-auto">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {eliminado ? null : (
            <>
              <div className="flex items-center gap-2">
                <Switch
                  id={switchAtivo}
                  checked={w.is_active}
                  disabled={!p.editar.allowed || p.aGravar === w.id}
                  onCheckedChange={(v) => p.aoAtivo(w, v)}
                />
                <Label htmlFor={switchAtivo} className="text-sm font-normal">{p.rotulos.ativo}</Label>
                {p.editar.allowed || !p.editar.reason ? null : <DisabledReasonInfo label={p.rotulos.ativo} reason={p.editar.reason} />}
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id={switchServe}
                  checked={w.serves_customers}
                  disabled={!p.editar.allowed || p.aGravar === w.id || carrinha}
                  onCheckedChange={(v) => p.aoServir(w, v)}
                />
                <Label htmlFor={switchServe} className="text-sm font-normal">Serve clientes</Label>
                {p.editar.allowed || !p.editar.reason ? null : <DisabledReasonInfo label="Serve clientes" reason={p.editar.reason} />}
              </div>
            </>
          )}
          {p.armazemPorDefeito === w.id ? <Pilula tom="info">Por defeito</Pilula> : null}
          {carrinha ? <Pilula tom="neutral">Carrinha (Frota)</Pilula> : null}
        </div>
        <RowActions
          modal={false}
          menuLabel={`Mais ações para ${w.name}`}
          items={[
            {
              label: "Editar",
              icon: Pencil,
              permission: "warehouses.edit",
              disabled: eliminado,
              disabledReason: "Armazém eliminado",
              onSelect: () => p.aoEditar(w),
            },
            { label: "Movimentos recentes", icon: History, onSelect: () => p.aoHistorico(w) },
            {
              label: "Registar movimento",
              icon: ArrowLeftRight,
              permission: "inventory.edit",
              disabled: eliminado,
              disabledReason: "Armazém eliminado: restaure-o primeiro",
              onSelect: () => p.aoMovimento(w),
            },
            { label: "Ver no livro de movimentos", icon: List, onSelect: () => navigate(stockMovementsLink({ warehouse: w.id })) },
            "separator",
            eliminado
              ? { label: p.rotulos.restaurar, icon: Undo2, permission: "warehouses.delete", onSelect: () => p.aoRestaurar(w) }
              : { label: "Eliminar", icon: Trash2, destructive: true, permission: "warehouses.delete", onSelect: () => p.aoEliminar(w) },
          ]}
        />
      </div>
    </article>
  );
}

export function ArmazensCartoes<W extends ArmazemCartao>(p: ArmazensCartoesProps<W>) {
  if (p.armazens.length === 0) {
    return (
      <InventoryEmptyState
        icon={Warehouse}
        title={p.verEliminados ? "Sem armazéns eliminados" : "Sem armazéns"}
        description={p.verEliminados ? undefined : p.semArmazens}
      />
    );
  }
  return (
    <div className={GRELHA} data-testid="armazens-cartoes">
      {p.armazens.map((w) => (
        <Cartao key={w.id} w={w} p={p} />
      ))}
    </div>
  );
}

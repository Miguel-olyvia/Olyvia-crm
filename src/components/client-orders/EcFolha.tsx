// A folha da Encomenda Cliente dentro da moldura do novo Inventário, com o visual do painel do artefacto aprovado
// (renderPanel, p.k==='ec': .kv, .sect, .ln). Só apresentação: os valores, os lápis de editar, as ações por linha
// (com os mesmos BlockedButton) e a ligação à PO vêm de ClientOrders.tsx — os mesmos da tabela clássica.
import type { ReactNode } from "react";
import { Lock, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClientOrderInfoItem } from "./ClientOrderDetailSheet";
import { ClientOrderLineStateBadge, type ClientOrderLineState } from "./clientOrderLineState";
import { EcPilula } from "./EcCartoes";

/** Pares chave/valor (.kv do artefacto: rótulo de 120px à esquerda), com o mesmo lápis de editar da grelha clássica. */
export function EcFolhaKv({ items }: { items: readonly ClientOrderInfoItem[] }) {
  return (
    <dl className="my-3 grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
      {items.map((item) => (
        <div key={item.label} className="contents">
          <dt className="text-muted-foreground">{item.label}</dt>
          <dd className="m-0 flex min-w-0 items-start gap-1 font-medium">
            <span className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">{item.value}</span>
            {item.onEdit ? (
              <button
                type="button"
                onClick={item.onEdit}
                disabled={item.editDisabled}
                aria-label={item.editLabel ?? `Editar ${item.label.toLowerCase()}`}
                title={item.editLabel ?? `Editar ${item.label.toLowerCase()}`}
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Estado de uma linha: a mesma pílula da tabela; à espera de uma PO, "À espera · PO-x" é um botão que leva à PO
 * (o mesmo openPurchaseOrder da coluna "De onde vem").
 */
export function EcEstadoLinha({
  state,
  title,
  poNumber,
  onOpenPo,
}: {
  state: ClientOrderLineState;
  title?: string;
  poNumber?: string | null;
  onOpenPo?: (() => void) | null;
}) {
  if (state === "waitpo" && poNumber && onOpenPo) {
    return (
      <button
        type="button"
        onClick={onOpenPo}
        title={title}
        aria-label={`À espera · ${poNumber} — abrir a encomenda ao fornecedor`}
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <EcPilula tone="info" className="cursor-pointer hover:brightness-95">À espera · {poNumber}</EcPilula>
      </button>
    );
  }
  return <ClientOrderLineStateBadge state={state} title={title} />;
}

export interface EcFolhaLinhaVista {
  key: string;
  nome: string;
  sku: string | null;
  /** Consumível: para que serviços. */
  para: readonly string[];
  fase: ReactNode;
  qtd: string;
  trancada: boolean;
  /** "servido X · reservado Y" (só produtos). */
  servido: string | null;
  origem: ReactNode;
  estado: ReactNode;
  acoes: ReactNode;
}

export interface EcFolhaSeccaoVista {
  key: string;
  titulo: string;
  linhas: readonly EcFolhaLinhaVista[];
}

/** As linhas por secções (Produtos / Serviços / Consumíveis), cada uma num cartão muted (.ln do artefacto). */
export function EcFolhaLinhas({ seccoes, vazio }: { seccoes: readonly EcFolhaSeccaoVista[]; vazio: string }) {
  if (seccoes.every((s) => s.linhas.length === 0)) {
    return <p className="rounded-2xl bg-muted px-3 py-4 text-center text-sm text-muted-foreground">{vazio}</p>;
  }
  return (
    <div className="flex flex-col">
      {seccoes.map((s) =>
        s.linhas.length === 0 ? null : (
          <section key={s.key} aria-label={`${s.titulo} (${s.linhas.length})`}>
            <h3 className="mx-0.5 mb-2 mt-3 text-[12.5px] font-bold uppercase tracking-[.12em] text-muted-foreground">
              {s.titulo} · {s.linhas.length}
            </h3>
            {s.linhas.map((l) => (
              <div
                key={l.key}
                data-testid="ec-folha-linha"
                className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2.5 rounded-2xl bg-muted px-3 py-[11px] dark:bg-muted/60"
              >
                <div className="min-w-0">
                  <b className="block font-semibold text-foreground">
                    {l.nome}
                    {l.trancada ? (
                      <span className="ml-1 inline-flex align-[-2px] text-muted-foreground" title="Linha trancada: já saiu de stock ou foi pedida ao fornecedor">
                        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="sr-only">Linha trancada</span>
                      </span>
                    ) : null}
                  </b>
                  <small className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-muted-foreground">
                    <span className="tabular-nums">{l.qtd}</span>
                    {l.sku ? <span className="font-mono">· {l.sku}</span> : null}
                    {l.fase ? <span className="inline-flex items-center gap-1">· {l.fase}</span> : null}
                  </small>
                  {l.para.length > 0 ? <small className="block text-xs text-muted-foreground">para: {l.para.join(", ")}</small> : null}
                  {l.servido ? <small className="block text-xs text-muted-foreground">{l.servido}</small> : null}
                  <div className={cn("mt-1 text-[12.5px]")}>{l.origem}</div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  {l.estado}
                  {l.acoes}
                </div>
              </div>
            ))}
          </section>
        ),
      )}
    </div>
  );
}

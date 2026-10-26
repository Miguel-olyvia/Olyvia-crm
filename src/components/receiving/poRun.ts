// "Dar entrada" de uma PO no painel da Receção: o estado que Receiving.tsx expõe ao painel. A receção em si é a do
// cesto (uma entrada por linha da PO, presa à linha por p_purchase_order_item_id, enviada por rpc_receive_by_code com
// request_id, pendente gravada em localStorage antes da chamada e a mesma recuperação). Este ficheiro só tem tipos e
// funções puras para o painel mostrar o progresso.

/** preparing = no cesto, à espera da pré-visualização (dry-run); review = avisos da guia por confirmar ou sem ligação;
 *  submitting = a receber; done = terminou (cada linha diz como correu); failed = nada foi enviado. */
export type PoRunPhase = "preparing" | "review" | "submitting" | "done" | "failed";

export interface PoRunLineView {
  entryId: string;
  poItemId: string;
  name: string;
  /** Quantidade na unidade da linha. */
  quantity: number;
  unitLabel: string;
  previewStatus: "none" | "loading" | "ok" | "error" | "transient";
  /** Resumo do dry-run: "8 un para EC-… · 2 un para stock". */
  previewText?: string;
  previewError?: string;
  /** Avisos da guia que exigem confirmação (rótulos já traduzidos). */
  noteChecks: string[];
  acked: boolean;
  outcome?: "ok" | "failed" | "uncertain" | "not_sent";
  message?: string;
  unitsToOrder?: number;
  unitsToStock?: number;
  contractNumbers?: string[];
  replayed?: boolean;
}

export interface PoRunView {
  poId: string;
  phase: PoRunPhase;
  /** Mensagem geral (falha antes de enviar). */
  error?: string | null;
  /** Com guia, a pré-visualização ficou sem ligação depois das tentativas automáticas. */
  offline?: boolean;
  warehouseName?: string | null;
  lines: PoRunLineView[];
}

export interface PoRunTotals {
  ok: number;
  failed: number;
  uncertain: number;
  unitsToOrder: number;
  unitsToStock: number;
  contractNumbers: string[];
}

export function runTotals(run: PoRunView): PoRunTotals {
  const t: PoRunTotals = { ok: 0, failed: 0, uncertain: 0, unitsToOrder: 0, unitsToStock: 0, contractNumbers: [] };
  const ecs = new Set<string>();
  for (const l of run.lines) {
    if (l.outcome === "ok") {
      t.ok += 1;
      t.unitsToOrder += l.unitsToOrder ?? 0;
      t.unitsToStock += l.unitsToStock ?? 0;
      (l.contractNumbers ?? []).forEach((c) => ecs.add(c));
    } else if (l.outcome === "uncertain") t.uncertain += 1;
    else if (l.outcome === "failed" || l.outcome === "not_sent") t.failed += 1;
  }
  t.contractNumbers = [...ecs];
  return t;
}

const nf = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 4 });

/** "Entrou no Armazém Central · 8 un reservadas para Tiago Almeida · 2 un para stock." */
export function textoEntrada(t: PoRunTotals, warehouseName: string | null | undefined, para: string | null): string {
  const parts = [
    warehouseName ? `Entrou no ${warehouseName}` : "Entrou no armazém",
    t.unitsToOrder ? `${nf.format(t.unitsToOrder)} un reservadas para ${para || t.contractNumbers.join(", ") || "a encomenda de cliente"}` : "",
    t.unitsToStock ? `${nf.format(t.unitsToStock)} un para stock` : "",
  ];
  return parts.filter(Boolean).join(" · ") + ".";
}

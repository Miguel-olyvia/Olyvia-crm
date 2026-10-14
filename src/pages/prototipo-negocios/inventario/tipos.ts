// Os tipos do Inventário nativo da V2 (portado de mockup-inventario-ui.html). Os nomes dos campos seguem o mockup (sku, wh, sup, qty...) para a
// leitura lado a lado com o original; as funções e os ecrãs é que estão em português. Tudo isto é de exemplo e vive só em memória (loja.ts).

export type TipoMov = "in" | "out" | "tin" | "tout" | "adjp" | "adjm" | "ret" | "loss";
export type Tom = "ok" | "info" | "warn" | "bad" | "violet" | "neu";

export interface Produto {
  sku: string; ean: string; name: string; cat: string; sub: string; unit: string;
  sale: number; cost: number; avg: number; codes: string[]; deleted: boolean;
  /** Um pacote não tem stock próprio: expande-se nos componentes. */
  kit?: { sku: string; qty: number }[];
}

export interface Armazem {
  id: string; name: string; code: string; addr: string; cp: string; city: string; lat: number | null; lng: number | null;
  manager: string; phone: string; email: string; cap: string; active: boolean; serves: boolean; deleted: boolean;
  /** Um armazém móvel: a carrinha de uma viatura da Frota (frota/), com a matrícula. Os armazéns fixos não têm tipo. */
  tipo?: "viatura"; matricula?: string;
}

export interface LinhaStock { id: string; sku: string; wh: string; loc: string; min: number; max: number; rop: number; qty: number; deleted: boolean }

export type PortalForn = "none" | "invited" | "active" | "revoked";

export interface Fornecedor {
  id: string; name: string; code: string; contact: string; email: string; phone: string; nif: string; company: string; sla: number;
  addr: string; city: string; cp: string; country: string; web: string; notes: string; active: boolean; deleted: boolean;
  portal: PortalForn; portalUsers: number; lastAccess: string | null; dataConfirmed: boolean; invitedAt: string | null; awaiting: boolean;
  /** O convite ao portal (quem o recebe e em que estado está), os emails enviados e quando o fornecedor atualizou a ficha. */
  invite?: { email: string; name: string; state: "pending" | "active" | "revoked"; at: string }; emails?: { at: string; to: string; t: string; ok: boolean }[]; dataUpdatedAt?: string | null;
}

/** Um artigo do fornecedor ligado a um produto (preço por embalagem). */
export interface Artigo { id: string; sup: string; sku: string; ref: string; packN: number; unitLabel: string; price: number; pref: boolean; moq: number; lead: number; history?: { at: string; from: number; to: number }[] }

export type EstadoCatalogo = "linked" | "unlinked" | "dismissed";
export interface ItemCatalogo { id: string; sup: string; ref: string; name: string; price: number; packN: number; unitLabel: string; state: EstadoCatalogo; link: string | null; sug: { sku: string; conf: string } | null; ean?: string; moq?: number; lead?: number }
export interface AlteracaoPreco { id: string; sup: string; itemId: string; cur: number; nw: number; state: "pending" | "accepted" | "rejected"; at: string; note: string; decidedAt?: string; by?: string }

export type EstadoPortal = "none" | "sent" | "seen" | "confirmed" | "withdrawn" | "email";
export interface PoPortal { state: EstadoPortal; sent: string | null; seen: string | null; confirmed: string | null; promised: string | null; comment: string; withdrawn?: string; emails?: { at: string; to: string; t: string; ok: boolean; err?: string }[] }
export interface PoOrigem { k: "stock" | "CT" | "VD" | "PR" | "manual" | "EC"; ref?: string | null; client?: string; ec?: string; proforma?: string | null }

export interface PoLinha {
  id: string; sku: string; itemId: string; packN: number; unitLabel: string; packs: number; price: number; iva: number;
  recv: number; cancelled: number; ec: string | null; ecLine: string | null; ecUnits: number; ecRecv: number;
}
export interface PoRecibo {
  id: string; at: string; lineId: string; sku: string; type: "Receção" | "Passagem para stock"; qty: number; toEC: number; toStock: number;
  ec: string | null; inactive?: boolean; wh: string; guia: string | null; state: "Ativa" | "Revertida"; user: string; reason?: string; released?: boolean;
}
export interface PoAnulacao {
  id: string; batch: string; lineId: string; sku: string; qty: number; ecCut: number; ec: string | null; reason: string; note: string; at: string; user: string; undone: boolean; locked?: boolean;
}
export type EstadoPoGuardado = "pending" | "ordered" | "cancelled";
export type EstadoPo = EstadoPoGuardado | "partial" | "received";
export interface Po {
  id: string; sup: string; origin: PoOrigem; originKey: string | null; wh: string; date: string; due: string; status: EstadoPoGuardado; deleted: boolean; auto: boolean;
  sentAt?: string; importRef?: string; portal: PoPortal; promiseAccepted: boolean; notesInt: string; notesSup: string;
  lines: PoLinha[]; receipts: PoRecibo[]; cancels: PoAnulacao[]; log: { at: string; t: string }[];
}

export interface EcSaida { id: number; wh: string; qty: number; at: string; reverted: boolean }
export interface EcLinha {
  id: string; sku: string | null; desc: string; qty: number; price: number; stockQty: number; nosupQty: number; served: number; voided: boolean; fromKit: string | null; exits: EcSaida[];
}
export interface Ec {
  id: string; seq: number; origin: { k: "CT" | "VD" | "PR" | "manual"; ref: string | null; proforma?: string | null }; client: string; addr: string; wh: string; notes: string; date: string;
  deleted: boolean; deleteReason?: string; deletedAt?: string; diag: { text: string; items: string[] } | null; lines: EcLinha[]; log: { at: string; t: string }[];
}

export interface Transferencia { id: string; sku: string; from: string; to: string; qty: number; ec: string | null; state: "pending" | "done" | "cancelled"; at: string; auto: boolean; reason: string; doneAt?: string }
export interface Guia {
  id: string; sup: string; date: string; wh: string; ann: { sku: string; qty: number }[]; pos: string[]; state: "open" | "closed" | "cancelled"; note: string; history: { at: string; t: string }[];
}
export type Resolucao = "" | "adjusted" | "accepted" | "recount";
export interface LinhaContagem { sku: string; sys: number; counted: number | null; res: Resolucao; note: string }
export interface Contagem {
  id: string; wh: string; cat: string; state: "open" | "final" | "cancelled"; started: string; last: string; startSeq: number; init: "blank" | "system";
  lines: LinhaContagem[]; moves: number[]; user: string; cancelReason?: string; finished?: string;
}
export interface Movimento { id: number; at: string; type: TipoMov; sku: string; wh: string; qty: number; bal: number; doc: string; note: string; user: string; cost: number | null; noteEdited?: string; noteBy?: string }

export interface Definicoes { autoPO: "direct" | "approval"; deduction: "contract" | "proposal"; defaultWh: string }

/** A base de dados de exemplo do módulo. Imutável para os ecrãs: cada ação trabalha numa cópia (loja.ts). */
export interface Inventario {
  v: number; seq: number; n: { po: number; ec: number; tr: number; inv: number }; settings: Definicoes;
  products: Produto[]; warehouses: Armazem[]; stocks: LinhaStock[]; suppliers: Fornecedor[]; items: Artigo[]; catalog: ItemCatalogo[]; prices: AlteracaoPreco[];
  pos: Po[]; ecs: Ec[]; guias: Guia[]; counts: Contagem[]; transfers: Transferencia[]; moves: Movimento[]; vds: { ref: string; state: string }[];
  /** Relógio fixo (testes e seed). Sem ele, a hora é a do relógio real, no dia de hoje do exemplo. */
  relogio: string | null;
  /** A receção por código no telemóvel (DB.rc do mockup). */
  rc: Recepcao;
}

/** O cesto da receção por código, as leituras pendentes (sem rede, não aceites, por enviar, por confirmar) e o resultado da última confirmação. */
export interface CestoItem { key: string; sku: string; qty: number; line: string }
export interface ResumoCesto { n: number; ec: Record<string, number>; st: number; avg: string[] }
export interface Recepcao {
  wh: string; guia: string; sup: string; poFilter: string; mode: "scanner" | "keyboard"; basket: CestoItem[];
  rejected: { code: string; at: string }[]; queued: { code: string; at: string }[]; toSend: { sku: string; qty: number; at: string }[];
  toConfirm: { items: { sku: string; qty: number }[]; at: string; err: string }[]; session: { at: string; t: string }[];
  ack: boolean; net: boolean; result: ResumoCesto | null; openPend?: boolean;
}

export interface MovPedido { type: TipoMov; sku: string; wh: string; qty: number; doc?: string; note?: string; cost?: number | null; user?: string }

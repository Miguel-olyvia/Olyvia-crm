// O Hoje do Inventário, igual ao do mockup (scrHoje): o fluxo em cinco passos (cartões numerados, a bifurcação "Sim / Não"), a fila de trabalho (cada cartão abre a lista
// já filtrada), as POs automáticas e os últimos movimentos. Os números vêm do estado atual. O botão primário é só um: "Simular venda assinada".
import { useState, type ReactNode } from "react";
import { ArrowLeftRight, ArrowRight, GitFork, Play, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { eur, fmtDT, N, nomeArm, nomeProd } from "./base";
import { AcoesCab, Fonte } from "./cabInv";
import { contadores, type Contadores } from "./contadores";
import { useCtxInv, type Destino } from "./ctxInv";
import { TIPOS_MOV } from "./stock";
import { MovimentoDialogo } from "./MovimentoDialogo";
import { VendaDialogo } from "./VendaDialogo";
import type { Tom } from "./tipos";

interface ItemFila { n: number; titulo: string; desc: string; tom: Tom; destino: Destino; fonte: string }
const fila = (c: Contadores): ItemFila[] => [
  { n: c.pending, titulo: "POs por aprovar", desc: "Rascunhos (manuais ou automáticos, se a aprovação estiver ativa). Passar a Encomendado exige purchase_orders.approve.", tom: "warn", destino: { aba: "po", f: { status: "pending" } }, fonte: "purchase_orders.status = pending" },
  { n: c.late, titulo: "POs atrasadas", desc: "Entrega prevista ultrapassada sem receção completa.", tom: "bad", destino: { aba: "po", f: { status: "late" } }, fonte: "purchase_orders.expected_delivery_date" },
  { n: c.ecReady, titulo: "ECs prontas a expedir", desc: "Têm linhas com stock reservado (FIFO) à espera de saída.", tom: "ok", destino: { aba: "ec", f: { prontas: true } }, fonte: "fn_client_order_line_reservations" },
  { n: c.ecNoSup, titulo: "ECs sem fornecedor preferencial", desc: "Há quantidades em falta sem fornecedor para encomendar.", tom: "bad", destino: { aba: "ec", f: { status: "nosup" } }, fonte: "item_suppliers.is_preferred" },
  { n: c.transfers, titulo: "Pedidos de transferência", desc: "Entre armazéns, ligados a ECs.", tom: "info", destino: { aba: "stock", f: { transferencias: true } }, fonte: "stock_transfer_requests · rpc_list_stock_transfer_requests" },
  { n: c.prices, titulo: "Alterações de preço por aprovar", desc: "Submetidas pelos fornecedores no portal.", tom: "warn", destino: { aba: "sup", f: { precos: true } }, fonte: "supplier_price_change_requests · rpc_price_changes_list" },
  { n: c.low, titulo: "Produtos abaixo do ponto de encomenda", desc: "Stock livre (sem reservas) abaixo do ponto de encomenda.", tom: "warn", destino: { aba: "stock", f: { state: "low" } }, fonte: "stocks.reorder_point" },
  { n: c.stalled, titulo: "Contagem parada", desc: "Em curso sem atividade há 7 dias ou mais.", tom: "neu", destino: { aba: "cont", f: { estado: "open" } }, fonte: "inventory_counts" },
  { n: c.awaiting, titulo: "Fornecedores à espera da ficha", desc: "Convidados para o portal: ainda não preencheram a ficha.", tom: "info", destino: { aba: "sup", f: { aguardam: true } }, fonte: "supplier_portal_user_access (convite pendente)" },
  { n: c.catUnlinked, titulo: "Artigos do portal por ligar", desc: "Catálogo carregado pelos fornecedores, com sugestões.", tom: "neu", destino: { aba: "sup", f: { catalogo: true } }, fonte: "supplier_catalog_items · rpc_catalog_link_suggestions" },
  { n: c.guiasDiv, titulo: "Guias abertas com divergências", desc: "Anunciado diferente do recebido.", tom: "bad", destino: { aba: "guia", f: { estado: "div" } }, fonte: "supplier_delivery_notes · fn_delivery_note_summary" },
];

const Seta = ({ garfo }: { garfo?: boolean }) => <span className="stage-arrow" aria-hidden="true">{garfo ? <GitFork className="ic" /> : <ArrowRight className="ic" />}</span>;
const Selo = ({ tom, children }: { tom: "ok" | "warn" | "bad"; children: ReactNode }) => <span className={`badge b-${tom}`}>{children}</span>;
const Num = ({ n }: { n: number }) => <span className="no" style={{ width: 18, height: 18, fontSize: 10, background: "var(--i-primary)", color: "var(--i-primary-fg)", borderRadius: "50%", display: "inline-grid", placeItems: "center" }}>{n}</span>;
function Cnt({ r, n, ir, tom }: { r: string; n: string | number; ir: () => void; tom?: "ok" | "bad" | "warn" }) {
  return <button type="button" className="cnt-btn" onClick={ir}><span>{r}</span><b style={tom && n ? { color: `var(--i-${tom})` } : undefined}>{n}</b></button>;
}

function Etapas12({ c }: { c: Contadores }) {
  const { db, ir } = useCtxInv();
  const por = (k: string): number => db.ecs.filter((e) => !e.deleted && e.origin.k === k).length;
  const ded = db.settings.deduction === "contract" ? "contrato assinado" : "proposta aceite";
  return (
    <>
      <div className="stage"><h3><span className="no">1</span>Vendas assinadas</h3>
        <Cnt r="Contratos" n={por("CT")} ir={() => ir({ aba: "ec", f: { q: "CT-" } })} /><Cnt r="Vendas diretas" n={por("VD")} ir={() => ir({ aba: "ec", f: { q: "VD-" } })} /><Cnt r="Encomendas manuais" n={por("manual")} ir={() => ir({ aba: "ec", f: { q: "Manual" } })} />
        <small className="muted">Baixa no momento definido: <b>{ded}</b> (nunca os dois).</small>
        <Fonte>client_contracts · proposals · direct_sales · organization_inventory_settings.stock_deduction_trigger</Fonte><Seta /></div>
      <div className="stage"><h3><span className="no">2</span>Encomendas Clientes</h3>
        <Cnt r="Em aberto" n={c.ecOpen} ir={() => ir({ aba: "ec" })} /><Cnt r="Prontas a expedir" n={c.ecReady} tom="ok" ir={() => ir({ aba: "ec", f: { prontas: true } })} /><Cnt r="Sem fornecedor" n={c.ecNoSup} tom="bad" ir={() => ir({ aba: "ec", f: { status: "nosup" } })} />
        <small className="muted">Cada linha: há stock livre (stock − reservas anteriores)?</small>
        <Fonte>client_orders · client_order_items · fn_client_order_line_reservations</Fonte><Seta garfo /></div>
    </>
  );
}

function Bifurcacao({ c }: { c: Contadores }) {
  const { ir } = useCtxInv();
  const Lig = ({ aoClicar, children }: { aoClicar: () => void; children: ReactNode }) => <button type="button" className="link" onClick={aoClicar} style={{ fontWeight: 700 }}>{children}</button>;
  return (
    <div className="fork">
      <div className="branch"><h4><Selo tom="ok">Sim</Selo> Há stock → serve do stock</h4>
        <div className="steps">
          <span className="st">Reserva FIFO <Lig aoClicar={() => ir({ aba: "stock", f: { vista: "product" } })}>{N(c.reservedUnits)} un</Lig></span><span className="arrow">→</span>
          <span className="st">Saída <Lig aoClicar={() => ir({ aba: "ec", f: { prontas: true } })}>{c.ecReady} EC</Lig></span><span className="arrow">→</span>
          <span className="st">Encomenda servida</span>
        </div>
        <Fonte>stocks − reservas · rpc_confirm_client_order_stock_exit · stock_movements</Fonte></div>
      <div className="branch"><h4><Selo tom="warn">Não</Selo> Falta → encomenda ao fornecedor preferencial</h4>
        <div className="steps">
          <span className="st"><Num n={3} />PO <Lig aoClicar={() => ir({ aba: "po", f: { status: "pending" } })}>{c.pending} por aprovar</Lig></span><span className="arrow">→</span>
          <span className="st">Publicada no portal <Lig aoClicar={() => ir({ aba: "po", f: { status: "portal" } })}>{c.portalUnseen} por ver</Lig></span><span className="arrow">→</span>
          <span className="st">Fornecedor confirma <Lig aoClicar={() => ir({ aba: "po", f: { status: "portal" } })}>{c.portalConfirmed}</Lig></span><span className="arrow">→</span>
          <span className="st"><Num n={4} />Receção <Lig aoClicar={() => ir({ aba: "guia" })}>{c.guiasOpen} guias abertas</Lig></span><span className="arrow">→</span>
          <span className="st">Serve a EC</span>
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          {c.late ? <button type="button" className="btn btn-xs" onClick={() => ir({ aba: "po", f: { status: "late" } })}><Selo tom="bad">{c.late} atrasadas</Selo></button> : null}
          <button type="button" className="btn btn-xs" onClick={() => ir({ aba: "guia" })}><Truck className="ic sm" aria-hidden="true" />Receber</button>
        </div>
        <Fonte>purchase_orders · supplier_po_publications · rpc_receive_by_code · fn_po_receipt_allocation</Fonte></div>
    </div>
  );
}

function Fluxo({ c }: { c: Contadores }) {
  const { ir } = useCtxInv();
  return (
    <section aria-labelledby="h-flow" className="stack" style={{ marginBottom: 22 }}>
      <h2 id="h-flow" style={{ fontSize: 16 }}>Fluxo</h2>
      <div className="flowline"><Etapas12 c={c} /><Bifurcacao c={c} /></div>
      <div className="stage"><h3><span className="no">5</span>Stock</h3>
        <div className="flow-top">
          <Cnt r="Abaixo do ponto de encomenda" n={c.low} tom="warn" ir={() => ir({ aba: "stock", f: { state: "low" } })} /><Cnt r="Transferências pendentes" n={c.transfers} ir={() => ir({ aba: "stock", f: { transferencias: true } })} />
          <Cnt r="Contagens em curso" n={c.countsOpen} ir={() => ir({ aba: "cont", f: { estado: "open" } })} /><Cnt r="Valor em stock (custo médio)" n={eur(c.stockValue)} ir={() => ir({ aba: "stock" })} />
        </div>
        <small className="muted">A receção fecha o ciclo: a parte “para EC” fica reservada e serve a encomenda; a parte “para stock” entra livre e atualiza o custo médio ponderado.</small>
        <Fonte>stocks · stock_movements · products.average_cost</Fonte></div>
    </section>
  );
}

function Fila({ c }: { c: Contadores }) {
  const { ir } = useCtxInv();
  return (
    <section aria-labelledby="h-q" style={{ marginBottom: 22 }}>
      <div className="row between" style={{ marginBottom: 10 }}><h2 id="h-q" style={{ fontSize: 16 }}>Fila de trabalho</h2><span className="muted" style={{ fontSize: 12.5 }}>Equivale aos alertas atuais do menu (alert_settings), agora com destino filtrado.</span></div>
      <div className="queue">
        {fila(c).map((q) => (
          <button key={q.titulo} type="button" className={cn("qcard", `t-${q.tom}`, !q.n && "zero")} onClick={() => ir(q.destino)}>
            <span className="qn">{q.n}</span>
            <span><span className="qt">{q.titulo}</span><br /><span className="qd">{q.desc}</span><br /><span className="go">{q.n ? "Abrir lista filtrada" : "Nada pendente"}<ArrowRight className="ic sm" aria-hidden="true" /></span><Fonte>{q.fonte}</Fonte></span>
          </button>
        ))}
      </div>
    </section>
  );
}

function AutoPo() {
  const { db, agir } = useCtxInv();
  const escolher = (v: "direct" | "approval"): void => { agir((d) => { d.settings.autoPO = v; }, v === "direct" ? "POs automáticas passam a ser enviadas diretamente." : "POs automáticas voltam a nascer como rascunho."); };
  return (
    <section className="card pad stack" aria-labelledby="h-set"><h2 id="h-set" style={{ fontSize: 15 }}>POs automáticas</h2>
      <label className="check"><input type="radio" name="autopo" checked={db.settings.autoPO === "direct"} onChange={() => escolher("direct")} /> Envio direto ao fornecedor (portal ou email) <span className="badge b-warn">Proposta do mockup</span></label>
      <label className="check"><input type="radio" name="autopo" checked={db.settings.autoPO === "approval"} onChange={() => escolher("approval")} /> Rascunho (pending) com aprovação <span className="badge b-neu">Comportamento atual</span></label>
      <p className="muted" style={{ fontSize: 12.5 }}>Decisão a confirmar. Com aprovação, “Aprovar e enviar” continua a exigir <span className="mono">purchase_orders.approve</span>.</p>
      <Fonte>organization_inventory_settings (mockup) · generate PO drafts</Fonte></section>
  );
}

function Ultimos() {
  const { db, ir } = useCtxInv();
  const recentes = db.moves.slice(-6).reverse();
  return (
    <section className="card pad stack" aria-labelledby="h-act"><div className="row between"><h2 id="h-act" style={{ fontSize: 15 }}>Últimos movimentos</h2><button type="button" className="btn btn-sm" onClick={() => ir({ aba: "mov" })}>Ver livro completo</button></div>
      {recentes.length === 0 ? <p className="muted">Sem movimentos.</p> : recentes.map((m) => (
        <div key={m.id} className="row" style={{ gap: 8, fontSize: 13 }}>
          <span className={`badge b-${TIPOS_MOV[m.type].tone}`}>{TIPOS_MOV[m.type].t}</span>
          <span className="grow">{m.qty > 0 ? "+" : ""}{N(m.qty)} {nomeProd(db, m.sku)} · {nomeArm(db, m.wh)}</span><span className="muted nowrap">{fmtDT(m.at)}</span>
        </div>))}
      <Fonte>stock_movements</Fonte></section>
  );
}

export function HojeInv() {
  const { db, ir } = useCtxInv();
  const c = contadores(db);
  const [dlg, setDlg] = useState<"venda" | "mov" | null>(null);
  const acoes = (
    <>
      <button type="button" className="btn" onClick={() => setDlg("mov")}><ArrowLeftRight className="ic" aria-hidden="true" />Registar movimento</button>
      <button type="button" className="btn" onClick={() => ir({ aba: "guia" })}><Truck className="ic" aria-hidden="true" />Receber</button>
      <button type="button" className="btn btn-p" onClick={() => setDlg("venda")}><Play className="ic" aria-hidden="true" />Simular venda assinada</button>
    </>
  );
  return (
    <div>
      <AcoesCab>{acoes}</AcoesCab>
      <Fluxo c={c} />
      <Fila c={c} />
      <div className="flow-top" style={{ alignItems: "start" }}><AutoPo /><Ultimos /></div>
      {dlg === "venda" && <VendaDialogo aberto aoFechar={() => setDlg(null)} />}
      {dlg === "mov" && <MovimentoDialogo aberto aoFechar={() => setDlg(null)} />}
    </div>
  );
}

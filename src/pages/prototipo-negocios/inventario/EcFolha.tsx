// A folha de uma Encomenda Cliente (ecSheet do mockup): cabeçalho com a informação editável na própria célula, de onde vem cada linha (stock, PO do fornecedor, sem fornecedor, transferência),
// as saídas e a ação de pedir o que falta. Eliminar, anular o contrato, editar e o PDF vêm do menu "Mais ações".
import { useState } from "react";
import { Info, Lock, Printer, ShoppingCart, Truck } from "lucide-react";
import { eur, fmtD, fmtDT, nomeProd, produto } from "./base";
import { Fonte } from "./cabInv";
import { useCtxInv } from "./ctxInv";
import { Folha } from "./DialogosInv";
import { EC_ESTADOS, EC_LINHA_ESTADOS, ecEstado, ecLinhaInfo, ecProntas, ecValor, mudarArmazemEc, origemTexto, pedirEmFalta, type EstadoLinhaEc } from "./ec";
import { definirCampoEc, definirQtdLinhaEc, type CampoEc } from "./ecAcoes";
import { EcPdf, EcReverter } from "./EcDialogos";
import { DeOnde } from "./EcDeOnde";
import { OrigemChip } from "./ecPecas";
import { MenuEc } from "./EcMenu";
import { Ed } from "./mockPecas";
import { opcoesExpedicao } from "./opcoes";
import { can, porqueNao } from "./perfil";
import { Dados, Selo } from "./pecasInv";
import { SaidaDialogo } from "./SaidaDialogo";
import { TabelaInv } from "./TabelaInv";
import type { Ec, EcLinha, Inventario, Tom } from "./tipos";

const TOM_L: Record<EstadoLinhaEc, Tom> = { served: "ok", recvpo: "info", waitpo: "info", ready: "violet", partial: "warn", missing: "bad", nosup: "bad", service: "neu", void: "neu" };
const TOM_E: Record<string, Tom> = { full: "ok", partial: "warn", waiting: "info", nosup: "bad", deleted: "neu" };
type Dlg = "saida" | "pdf" | { t: "saida1" | "reverter"; id: string };
const PERM = "inventory.manage";
const semPerm = (): { disabled: boolean; title?: string } => (can(PERM) ? { disabled: false } : { disabled: true, title: porqueNao(PERM) });

/** ecIE(): cliente, morada e notas editam-se na própria célula; ficam trancados numa encomenda eliminada e o cliente também fora das manuais. */
function CampoEd({ e, k, tipo }: { e: Ec; k: CampoEc; tipo?: "textarea" }) {
  const { agir } = useCtxInv();
  const bloqueio = e.deleted ? "Encomenda eliminada" : k === "client" && e.origin.k !== "manual" ? `Vem do ${e.origin.k === "VD" ? "documento de venda direta " : "contrato "}${e.origin.ref ?? ""}: altere-o na origem` : undefined;
  return <Ed valor={e[k]} tipo={tipo ?? "text"} perm={PERM} bloqueio={bloqueio} mostrar={e[k] || "—"} aoGravar={(v) => agir((d) => definirCampoEc(d, e.id, k, String(v)), "Gravado.")} />;
}

/** ecQtyCell(): a quantidade edita-se na própria célula só numa encomenda manual e enquanto a linha não estiver servida. */
function QtdEd({ e, l, aoReverter }: { e: Ec; l: EcLinha; aoReverter: () => void }) {
  const { agir } = useCtxInv();
  const disp = <b>{l.qty}</b>;
  if (!l.sku) return disp;
  if (e.deleted) return <Ed valor={l.qty} mostrar={disp} bloqueio="Encomenda eliminada" aoGravar={() => undefined} />;
  if (e.origin.k !== "manual") return <Ed valor={l.qty} mostrar={disp} bloqueio={`Quantidade definida pelo ${origemTexto(e).toLowerCase()}: altere na origem`} aoGravar={() => undefined} />;
  if (l.served >= l.qty) return <Ed valor={l.qty} mostrar={disp} bloqueio={`Linha servida (${l.served} un saíram)`} aoGravar={() => undefined} desbloquear={<> <button type="button" className="btn btn-xs" onClick={(ev) => { ev.stopPropagation(); aoReverter(); }}><Lock className="ic sm" aria-hidden="true" />Reverter saída</button></>} />;
  return <><Ed valor={l.qty} tipo="number" perm={PERM} mostrar={disp} atributos={{ min: Math.max(1, l.served), step: 1, style: { width: 80 } }} aoGravar={(v) => agir((d) => definirQtdLinhaEc(d, e.id, l.id, Number(v)), "Gravado.")} />{l.served ? <><br /><small className="muted">mín. {l.served} (já servidas)</small></> : null}</>;
}

function Cabecalho({ db, e, agir }: { db: Inventario; e: Ec; agir: ReturnType<typeof useCtxInv>["agir"] }) {
  const podeWh = !e.deleted && !e.lines.some((l) => l.served > 0) && can(PERM);
  return (
    <>
      <Dados itens={[
        ["Cliente", <CampoEd key="c" e={e} k="client" />], ["Encomenda · data", `${e.id} · ${fmtD(e.date)}`], ["Valor", eur(ecValor(e))], ["Morada", <CampoEd key="a" e={e} k="addr" />], ["Notas", <CampoEd key="n" e={e} k="notes" tipo="textarea" />],
        ["Origem", <>{origemTexto(e)}{e.origin.proforma ? <><br /><small className="muted">Proforma {e.origin.proforma}</small></> : null}</>],
        ["Armazém de expedição", <><select id="ec-wh" value={e.wh} disabled={!podeWh} title={podeWh ? undefined : "Já há saídas: o armazém fica fixo"} onChange={(ev) => agir((d) => mudarArmazemEc(d, d.ecs.find((x) => x.id === e.id) as Ec, ev.target.value), "Armazém de expedição alterado: reservas recalculadas.")}>{opcoesExpedicao(db).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select><Fonte>rpc_set_client_order_warehouse</Fonte></>],
        ...(e.deleted ? [["Eliminada", <>{fmtDT(e.deletedAt)} · {e.deleteReason}</>] as const] : []),
      ]} />
      {e.diag && (
        <details className="box" style={{ marginBottom: 12 }}><summary>Diagnóstico da obra (só leitura)</summary>
          <div><p>{e.diag.text}</p>{e.diag.items.length ? <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>{e.diag.items.map((x) => <li key={x}>{x}</li>)}</ul> : null}
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Informativo: não cria linhas nesta encomenda.</p><Fonte>deal_need_diagnostic_materials (leitura)</Fonte></div>
        </details>
      )}
    </>
  );
}

export function EcFolha({ id, aoFechar }: { id: string; aoFechar: () => void }) {
  const { db, agir } = useCtxInv();
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const e = db.ecs.find((x) => x.id === id);
  if (!e) return null;
  const st = ecEstado(db, e), prontas = ecProntas(db, e);
  const falta = e.lines.some((l) => l.sku && !l.voided && (l.nosupQty || ecLinhaInfo(db, e, l).missing));
  const pedir = (semPos: string, comPos: (p: string[]) => string): void => { agir((d) => pedirEmFalta(d, d.ecs.find((x) => x.id === id) as Ec), (r) => (r.pos.length ? comPos(r.pos) : semPos)); };
  const rodape = e.deleted ? <button type="button" className="btn" onClick={aoFechar}>Fechar</button> : (
    <>
      <div className="left"><button type="button" className="btn btn-ghost" onClick={() => setDlg("pdf")}><Printer className="ic" aria-hidden="true" />PDF</button></div>
      <button type="button" className="btn" disabled={!falta} title={falta ? undefined : "Nada em falta"} onClick={() => pedir("Sem fornecedor preferencial para o que falta.", (p) => `Pedido ao fornecedor: ${p.join(", ")}`)}><ShoppingCart className="ic" aria-hidden="true" />Pedir em falta ao fornecedor</button>
      <button type="button" className="btn btn-p" {...(prontas ? semPerm() : { disabled: true, title: "Nada pronto a sair: as linhas esperam stock ou a encomenda ao fornecedor" })} onClick={() => setDlg("saida")}><Truck className="ic" aria-hidden="true" />Confirmar saída ({prontas})</button>
    </>
  );
  return (
    <Folha aberta aoFechar={aoFechar} chave={id} titulo={e.id} subtitulo="Armazém › Saídas para clientes" rodape={rodape} acoesTopo={<MenuEc id={id} />}
      selos={<><Selo tom={TOM_E[st]}>{EC_ESTADOS[st]}</Selo><OrigemChip e={e} />{prontas > 0 && <Selo tom="violet">{prontas} linha(s) pronta(s) a sair</Selo>}</>}
      abas={<Cabecalho db={db} e={e} agir={agir} />}>
      <div className="legend" style={{ marginBottom: 8 }}>{Object.entries(EC_LINHA_ESTADOS).map(([k, t]) => <Selo key={k} tom={TOM_L[k as EstadoLinhaEc]}>{t}</Selo>)}</div>
      <TabelaInv titulo="Linhas da encomenda" minimo={900} chave={(l) => l.id} linhas={e.lines}
        colunas={[
          { id: "sku", titulo: "SKU", classe: () => "mono", celula: (l) => l.sku ?? "—" },
          { id: "p", titulo: "Produto", celula: (l) => <>{l.sku ? nomeProd(db, l.sku) : l.desc}{l.fromKit ? <><br /><small className="muted">de {l.fromKit}</small></> : null}</> },
          { id: "q", titulo: "Qtd", direita: true, celula: (l) => { const i = ecLinhaInfo(db, e, l); return <><QtdEd e={e} l={l} aoReverter={() => setDlg({ t: "reverter", id: l.id })} /> {l.sku ? produto(db, l.sku)?.unit : ""}{l.sku ? <><br /><small className="muted">servido {l.served}{i.want ? ` · reservado ${i.want}` : ""}</small></> : null}</>; } },
          { id: "o", titulo: "De onde vem", largura: "240px", estilo: { fontSize: 12.5 }, celula: (l) => <DeOnde db={db} e={e} l={l} /> },
          { id: "s", titulo: "Estado", celula: (l) => { const s = ecLinhaInfo(db, e, l).st; return <Selo tom={TOM_L[s]}>{EC_LINHA_ESTADOS[s]}</Selo>; } },
        ]}
        acoes={(l) => {
          if (!l.sku || e.deleted) return null;
          const i = ecLinhaInfo(db, e, l);
          return <>
            {i.ready > 0 && <button type="button" className="btn btn-sm btn-p" {...semPerm()} onClick={() => setDlg({ t: "saida1", id: l.id })}>Confirmar saída</button>}
            {l.served > 0 && <> <button type="button" className="btn btn-sm" {...semPerm()} onClick={() => setDlg({ t: "reverter", id: l.id })}>Reverter saída</button></>}
            {(l.nosupQty || i.missing) ? <> <button type="button" className="btn btn-sm" onClick={() => pedir("Ainda sem fornecedor preferencial: ligue um artigo em Fornecedores.", (p) => `Pedido: ${p.join(", ")}`)}>Pedir em falta</button></> : null}
          </>;
        }} />
      <p className="rules" style={{ marginTop: 8 }}><Info className="ic sm" aria-hidden="true" />Regra: se há stock livre (stock − reservas anteriores), serve do stock; o que falta vai logo para a encomenda ao fornecedor preferencial (uma por fornecedor e contrato), que a recebe no portal. A receção serve a EC.</p>
      <h3 style={{ margin: "14px 0 6px" }}>Histórico</h3>
      <ol style={{ paddingLeft: 18, margin: 0, fontSize: 13 }}>{e.log.slice().reverse().map((x, i) => <li key={i}>{fmtDT(x.at)} — {x.t}</li>)}</ol>
      <Fonte>client_order_items · fn_client_order_line_reservations · fn_client_order_request_missing</Fonte>
      {dlg === "saida" && <SaidaDialogo ecId={id} aoFechar={() => setDlg(null)} />}
      {typeof dlg === "object" && dlg?.t === "saida1" && <SaidaDialogo ecId={id} apenas={[dlg.id]} aoFechar={() => setDlg(null)} />}
      {typeof dlg === "object" && dlg?.t === "reverter" && <EcReverter id={id} linha={dlg.id} aoFechar={() => setDlg(null)} />}
      {dlg === "pdf" && <EcPdf id={id} aoFechar={() => setDlg(null)} />}
    </Folha>
  );
}

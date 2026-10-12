// A folha de uma Encomenda Cliente: de onde vem cada linha (stock, PO do fornecedor, sem fornecedor, transferência), as saídas e as ações (pedir o que falta, editar, eliminar ou anular o contrato).
import { useState } from "react";
import { eur, fmtD, fmtDT, nomeArm, nomeProd, poPorId, produto } from "./base";
import { useCtxInv } from "./ctxInv";
import { Confirmar, Folha } from "./DialogosInv";
import { EC_ESTADOS, EC_LINHA_ESTADOS, ecEstado, ecLinhaInfo, ecProntas, ecValor, eliminarEc, mudarArmazemEc, origemTexto, pedirEmFalta, reverterSaida, type EstadoLinhaEc } from "./ec";
import { EcFormDialogo } from "./EcFormDialogo";
import { opcoesExpedicao } from "./opcoes";
import { Dados, Ligacao, Lista, Pri, Sec, Selo } from "./pecasInv";
import { poStatus, poStatusLabel } from "./po";
import { SaidaDialogo } from "./SaidaDialogo";
import { TabelaInv } from "./TabelaInv";
import type { Ec, EcLinha, Inventario, Po, Tom } from "./tipos";

const TOM_L: Record<EstadoLinhaEc, Tom> = { served: "ok", recvpo: "info", waitpo: "info", ready: "violet", partial: "warn", missing: "bad", nosup: "bad", service: "neu", void: "neu" };

function textoPo(p: Po): string {
  const st = poStatus(p), x = p.portal;
  if (p.deleted) return "eliminada";
  if (st === "pending") return "rascunho por aprovar";
  if (st === "received") return "recebida";
  if (st === "cancelled") return "cancelada";
  return x.state === "confirmed" ? `no portal, confirmada (entrega ${fmtD(x.promised).slice(0, 5)})` : x.state === "seen" ? "no portal, vista" : x.state === "sent" ? "no portal, por ver" : x.state === "withdrawn" ? "retirada do portal" : x.state === "email" ? "enviada por email" : poStatusLabel[st].toLowerCase();
}

function DeOnde({ db, e, l }: { db: Inventario; e: Ec; l: EcLinha }) {
  const { abrir } = useCtxInv();
  if (!l.sku) return <span className="text-muted-foreground">Serviço (sem stock)</span>;
  const i = ecLinhaInfo(db, e, l);
  return (
    <span className="grid gap-0.5">
      {l.stockQty > 0 && <span><b>{l.stockQty}</b> do stock · {nomeArm(db, e.wh)}</span>}
      {i.d.links.map(([p, pl]) => <span key={pl.id}><b>{pl.ecUnits}</b> do fornecedor · <Ligacao aoClicar={() => abrir({ t: "po", id: p.id })}>{p.id}</Ligacao> · {textoPo(poPorId(db, p.id) ?? p)}{pl.ecRecv ? ` · ${pl.ecRecv} recebidas` : ""}</span>)}
      {l.nosupQty > 0 && <span><b>{l.nosupQty}</b> sem fornecedor preferencial</span>}
      {i.missing > 0 && <span><b>{i.missing}</b> em falta (encomenda anulada ou eliminada)</span>}
      {i.notReady > 0 && !i.tr && <span><b>{i.notReady}</b> reservadas mas sem stock físico em {nomeArm(db, e.wh)}</span>}
      {i.tr && <span>A transferir de {nomeArm(db, i.tr.from)} ({i.tr.qty} un, {i.tr.id})</span>}
    </span>
  );
}

type Dlg3 = "saida" | "editar" | "eliminar" | { t: "saida1"; id: string } | { t: "reverter"; id: string };

function DialogosEc({ id, e, dlg, fechar }: { id: string; e: Ec; dlg: Dlg3 | null; fechar: () => void }) {
  const { agir } = useCtxInv();
  const ct = e.origin.k === "CT";
  return (
    <>
      {dlg === "saida" && <SaidaDialogo ecId={id} aoFechar={fechar} />}
      {typeof dlg === "object" && dlg?.t === "saida1" && <SaidaDialogo ecId={id} apenas={[dlg.id]} aoFechar={fechar} />}
      {dlg === "editar" && <EcFormDialogo aberto aoFechar={fechar} id={id} />}
      {dlg === "eliminar" && <Confirmar aberto aoFechar={fechar} titulo={ct ? `Anular contrato ${e.origin.ref}` : `Eliminar ${id}`} ok={ct ? "Anular contrato" : "Eliminar encomenda"} perigo motivo="Motivo"
        texto={<p>{ct ? "Simula a anulação do contrato: " : ""}estorna as saídas já feitas (entradas no livro), liberta as reservas, anula o resto das encomendas a fornecedor ligadas{e.origin.k === "VD" ? ` e cancela a venda direta ${e.origin.ref}` : ""}. Fica registado e não apaga movimentos.</p>}
        aoConfirmar={(m) => agir((d) => eliminarEc(d, d.ecs.find((x) => x.id === id) as Ec, m, { contrato: ct }), ct ? "Contrato anulado." : `${id} eliminada.`)} />}
      {typeof dlg === "object" && dlg?.t === "reverter" && <Confirmar aberto aoFechar={fechar} titulo="Reverter saída" ok="Reverter saída"
        texto={<p>As unidades voltam a entrar no armazém (movimento de estorno no livro; o original não é apagado).</p>}
        aoConfirmar={() => agir((d) => { const ec = d.ecs.find((x) => x.id === id) as Ec; reverterSaida(d, ec, ec.lines.find((l) => l.id === dlg.id) as EcLinha); }, "Saída revertida.")} />}
    </>
  );
}

export function EcFolha({ id, aoFechar }: { id: string; aoFechar: () => void }) {
  const { db, agir } = useCtxInv();
  const [dlg, setDlg] = useState<Dlg3 | null>(null);
  const e = db.ecs.find((x) => x.id === id);
  if (!e) return null;
  const st = ecEstado(db, e), prontas = ecProntas(db, e);
  const falta = e.lines.some((l) => l.sku && !l.voided && (l.nosupQty || ecLinhaInfo(db, e, l).missing));
  const podeMudarWh = !e.deleted && !e.lines.some((l) => l.served > 0);
  const ct = e.origin.k === "CT", eliminavel = ["manual", "VD"].includes(e.origin.k);
  const pedir = (): void => { agir((d) => pedirEmFalta(d, d.ecs.find((x) => x.id === id) as Ec), (r) => (r.pos.length ? `Pedido ao fornecedor: ${r.pos.join(", ")}` : "Sem novas encomendas: falta um fornecedor preferencial ou já está pedido.")); };
  const rodape = e.deleted ? <Sec onClick={aoFechar}>Fechar</Sec> : (
    <>
      <span className="mr-auto flex flex-wrap gap-2">
        {e.origin.k === "manual" && <Sec onClick={() => setDlg("editar")}>Editar</Sec>}
        {(eliminavel || ct) && <Sec onClick={() => setDlg("eliminar")}>{ct ? "Simular: anular contrato" : "Eliminar"}</Sec>}
      </span>
      <Sec disabled={!falta} title={falta ? undefined : "Nada em falta"} onClick={pedir}>Pedir em falta ao fornecedor</Sec>
      <Pri disabled={!prontas} title={prontas ? undefined : "Nada pronto a sair: as linhas esperam stock ou a encomenda ao fornecedor"} onClick={() => setDlg("saida")}>Confirmar saída ({prontas})</Pri>
    </>
  );
  return (
    <Folha aberta aoFechar={aoFechar} chave={id} titulo={e.id} subtitulo="Armazém › Encomendas de cliente" rodape={rodape}
      selos={<><Selo tom={st === "full" ? "ok" : st === "nosup" ? "bad" : st === "waiting" ? "info" : "warn"}>{EC_ESTADOS[st]}</Selo><Selo>{origemTexto(e)}</Selo>{prontas > 0 && <Selo tom="violet">{prontas} linha(s) pronta(s) a sair</Selo>}</>}>
      <Dados itens={[["Cliente", e.client], ["Encomenda · data", `${e.id} · ${fmtD(e.date)}`], ["Valor", eur(ecValor(e))], ["Morada", e.addr || "—"], ["Notas", e.notes || "—"],
        ["Origem", origemTexto(e) + (e.origin.proforma ? ` · proforma ${e.origin.proforma}` : "")], ...(e.deleted ? [["Eliminada", `${fmtDT(e.deletedAt)} · ${e.deleteReason}`] as const] : [])]} />
      <Lista rotulo="Armazém de expedição" valor={e.wh} desativado={!podeMudarWh} aoMudar={(v) => agir((d) => mudarArmazemEc(d, d.ecs.find((x) => x.id === id) as Ec, v), "Armazém de expedição alterado: reservas recalculadas.")} opcoes={opcoesExpedicao(db)} ajuda={podeMudarWh ? undefined : "Já há saídas: o armazém fica fixo."} />
      {e.diag && <details className="text-[15px]"><summary className="min-h-11 cursor-pointer">Diagnóstico da obra (só leitura)</summary><p>{e.diag.text}</p><ul className="list-disc pl-5">{e.diag.items.map((x) => <li key={x}>{x}</li>)}</ul></details>}
      <TabelaInv rolar titulo="Linhas da encomenda" chave={(l) => l.id} linhas={e.lines}
        colunas={[
          { id: "sku", titulo: "SKU · produto", celula: (l) => <>{l.sku ?? "—"} · {l.sku ? nomeProd(db, l.sku) : l.desc}{l.fromKit ? ` (de ${l.fromKit})` : ""}</> },
          { id: "q", titulo: "Qtd", direita: true, celula: (l) => <>{l.qty} {l.sku ? produto(db, l.sku)?.unit : ""}{l.sku ? <span className="block text-muted-foreground">servido {l.served}{ecLinhaInfo(db, e, l).want ? ` · reservado ${ecLinhaInfo(db, e, l).want}` : ""}</span> : null}</> },
          { id: "o", titulo: "De onde vem", celula: (l) => <DeOnde db={db} e={e} l={l} /> },
          { id: "s", titulo: "Estado", celula: (l) => { const s = ecLinhaInfo(db, e, l).st; return <Selo tom={TOM_L[s]}>{EC_LINHA_ESTADOS[s]}</Selo>; } },
        ]}
        acoes={e.deleted ? undefined : (l) => { const i = ecLinhaInfo(db, e, l); return <>
          {i.ready > 0 && <Sec onClick={() => setDlg({ t: "saida1", id: l.id })}>Confirmar saída</Sec>}
          {l.served > 0 && <Sec onClick={() => setDlg({ t: "reverter", id: l.id })}>Reverter saída</Sec>}</>; }} />
      <p className="text-[15px] text-muted-foreground">Regra: se há stock livre (stock − reservas anteriores), serve do stock; o que falta vai logo para a encomenda ao fornecedor preferencial (uma por fornecedor e contrato). A receção serve a EC.</p>
      <h3 className="text-base font-semibold">Histórico</h3>
      <ol className="grid gap-1 pl-5 text-[15px]" style={{ listStyle: "decimal" }}>{e.log.slice().reverse().map((x, i) => <li key={i}>{fmtDT(x.at)} — {x.t}</li>)}</ol>
      <DialogosEc id={id} e={e} dlg={dlg} fechar={() => setDlg(null)} />
    </Folha>
  );
}

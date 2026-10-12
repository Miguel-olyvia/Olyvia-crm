// Os diálogos de uma Encomenda Cliente que se abrem da folha e do menu "Mais ações": eliminar ou anular o contrato (ecDelete), reverter saída (revertExitDlg) e o PDF (ecPDF/printDoc).
import { Printer } from "lucide-react";
import { HOJE, ecPorId, fmtD, nomeArm, nomeProd } from "./base";
import { useCtxInv } from "./ctxInv";
import { Confirmar, Dlg } from "./DialogosInv";
import { EC_LINHA_ESTADOS, ecLinhaInfo, eliminarEc, origemTexto } from "./ec";
import { desfazerSaida } from "./ecAcoes";
import { Nota, Pri, Sec } from "./pecasInv";
import type { Ec, EcLinha } from "./tipos";

/** ecDelete(): "Eliminar" (manual, venda direta) ou "Anular contrato" (simulação); o motivo é obrigatório. */
export function EcEliminar({ id, aoFechar }: { id: string; aoFechar: () => void }) {
  const { db, agir } = useCtxInv();
  const e = ecPorId(db, id);
  if (!e) return null;
  const ct = e.origin.k === "CT";
  return (
    <Confirmar aberto aoFechar={aoFechar} titulo={ct ? `Anular contrato ${e.origin.ref}` : `Eliminar ${id}`} ok={ct ? "Anular contrato" : "Eliminar encomenda"} perigo motivo="Motivo"
      texto={<>
        <p>{ct ? "Simula a anulação do contrato: " : ""}Estorna as saídas já feitas (entradas no livro), liberta as reservas, anula o resto das encomendas a fornecedor ligadas{e.origin.k === "VD" ? ` e cancela a venda direta ${e.origin.ref}` : ""}.</p>
        <Nota tom="warn">Esta ação fica registada e não apaga movimentos.</Nota>
      </>}
      aoConfirmar={(m) => agir((d) => eliminarEc(d, ecPorId(d, id) as Ec, m, { contrato: ct }))} />
  );
}

/** revertExitDlg(): estorna a última saída da linha. */
export function EcReverter({ id, linha, aoFechar }: { id: string; linha: string; aoFechar: () => void }) {
  const { db, agir } = useCtxInv();
  const e = ecPorId(db, id), l = e?.lines.find((x) => x.id === linha);
  if (!e || !l) return null;
  const x = [...l.exits].reverse().find((z) => !z.reverted);
  return (
    <Confirmar aberto aoFechar={aoFechar} titulo="Reverter saída" ok="Reverter saída"
      texto={<p>{x ? `${x.qty} un de ${nomeProd(db, l.sku as string)} voltam a entrar em ${nomeArm(db, x.wh)}` : "Sem saídas"} (movimento de estorno no livro; o original não é apagado).</p>}
      aoConfirmar={() => agir((d) => { const ec = ecPorId(d, id) as Ec; desfazerSaida(d, ec, ec.lines.find((z) => z.id === linha) as EcLinha); })} />
  );
}

/** ecPDF(): a pré-visualização do documento (printDoc do mockup). */
export function EcPdf({ id, aoFechar }: { id: string; aoFechar: () => void }) {
  const { db } = useCtxInv();
  const e = ecPorId(db, id);
  if (!e) return null;
  const titulo = `Encomenda Cliente ${id}`;
  return (
    <Dlg aberto aoFechar={aoFechar} largo titulo={`${titulo} — pré-visualização`}
      rodape={<><Sec onClick={aoFechar}>Fechar</Sec><Pri onClick={() => window.print()}><Printer className="ic" aria-hidden="true" />Imprimir / guardar PDF</Pri></>}>
      <div className="print-area">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
          <div><b style={{ fontSize: 18 }}>Olyvia</b><br /><span style={{ color: "#555" }}>Empresa A (Lisboa) · NIF 500000000</span></div>
          <div style={{ textAlign: "right" }}><b>{titulo}</b><br /><span style={{ color: "#555" }}>Emitido a {fmtD(HOJE)}</span></div>
        </div>
        <p><b>Cliente:</b> {e.client}<br /><b>Morada:</b> {e.addr}<br /><b>Origem:</b> {origemTexto(e)}{e.origin.proforma ? ` · Proforma ${e.origin.proforma}` : ""}<br /><b>Armazém de expedição:</b> {nomeArm(db, e.wh)}</p>
        <table>
          <thead><tr><th>SKU</th><th>Produto</th><th>Qtd</th><th>Servido</th><th>Estado</th></tr></thead>
          <tbody>{e.lines.map((l) => <tr key={l.id}><td>{l.sku ?? "—"}</td><td>{l.sku ? nomeProd(db, l.sku) : l.desc}</td><td>{l.qty}</td><td>{l.served}</td><td>{EC_LINHA_ESTADOS[ecLinhaInfo(db, e, l).st]}</td></tr>)}</tbody>
        </table>
      </div>
    </Dlg>
  );
}

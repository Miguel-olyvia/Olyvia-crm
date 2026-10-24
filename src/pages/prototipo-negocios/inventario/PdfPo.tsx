// A pré-visualização imprimível da encomenda (poPDF e printDoc do mockup): cabeçalho Olyvia, dados, linhas e totais.
import { Printer } from "lucide-react";
import { HOJE, armazem, fmtD, fornecedor, nomeProd } from "./base";
import { useCtxInv } from "./ctxInv";
import { Dlg } from "./DialogosInv";
import { Pri, Sec } from "./pecasInv";
import { Dinheiro } from "./poPecas";
import { poTotals, poUnits } from "./po";
import type { Po } from "./tipos";

const DIR = { textAlign: "right" } as const;

export function PdfPo({ p, aoFechar }: { p: Po; aoFechar: () => void }) {
  const { db } = useCtxInv();
  const s = fornecedor(db, p.sup), w = armazem(db, p.wh), t = poTotals(p);
  const titulo = "Encomenda " + p.id;
  return (
    <Dlg aberto aoFechar={aoFechar} largo titulo={titulo + " — pré-visualização"}
      rodape={<><Sec onClick={aoFechar}>Fechar</Sec><Pri onClick={() => window.print()}><Printer className="ic" aria-hidden="true" />Imprimir / guardar PDF</Pri></>}>
      <div className="print-area">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
          <div><b style={{ fontSize: 18 }}>Olyvia</b><br /><span style={{ color: "#555" }}>Empresa A (Lisboa) · NIF 500000000</span></div>
          <div style={DIR}><b>{titulo}</b><br /><span style={{ color: "#555" }}>Emitido a {fmtD(HOJE)}</span></div>
        </div>
        <p><b>Fornecedor:</b> {s?.name} · NIF {s?.nif}<br /><b>Entregar em:</b> {w?.name ?? p.wh} — {w?.addr}<br /><b>Data:</b> {fmtD(p.date)} · <b>Entrega prevista:</b> {fmtD(p.due)}{p.origin.ref ? <><br /><b>Referência:</b> {p.origin.ref}</> : null}</p>
        <table>
          <thead><tr><th>Ref.</th><th>Descrição</th><th>Qtd</th><th>Embalagem</th><th style={DIR}>Preço</th><th style={DIR}>Total</th></tr></thead>
          <tbody>{p.lines.map((l) => (
            <tr key={l.id}><td>{db.items.find((i) => i.id === l.itemId)?.ref || l.sku}</td><td>{nomeProd(db, l.sku)}</td><td>{l.packs} (= {poUnits(l)} un)</td><td>{l.unitLabel}</td><td style={DIR}><Dinheiro n={l.price} /></td><td style={DIR}><Dinheiro n={l.packs * l.price} /></td></tr>
          ))}</tbody>
        </table>
        <p style={{ textAlign: "right", marginTop: 10 }}>Subtotal <Dinheiro n={t.sub} /> · IVA <Dinheiro n={t.iva} /> · <b>Total <Dinheiro n={t.total} /></b></p>
        {p.notesSup ? <p><b>Notas:</b> {p.notesSup}</p> : null}
      </div>
    </Dlg>
  );
}

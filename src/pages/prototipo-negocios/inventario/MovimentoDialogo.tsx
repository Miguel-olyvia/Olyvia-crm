// "Registar movimento" em dois passos, igual ao mockup (openMove, mwHtml, mwGo): escolhe-se o tipo (`typecards`) e preenche-se o formulário.
// As linhas que falham ficam no diálogo com a mensagem; as outras entram no livro.
import { useState } from "react";
import { AlertTriangle, ArrowLeftRight, Check, ClipboardList, Download, Undo2, Upload, type LucideIcon } from "lucide-react";
import { Fonte } from "./cabInv";
import { useCtxInv } from "./ctxInv";
import { Dlg } from "./DialogosInv";
import { PassoDois, type EstadoMov, type LinhaMov } from "./MovimentoForm";
import { TIPOS_REGISTO, registarMovimento, type TipoRegisto } from "./movimentos";
import { Pri, Sec } from "./pecasInv";
import { ListaProdutos, analisarProduto, textoProduto } from "./ProdutoCampo";
import type { Inventario } from "./tipos";

export interface PreMov { type?: TipoRegisto; sku?: string; wh?: string; tr?: string; qty?: number }
const ICONES: Record<TipoRegisto, LucideIcon> = { in: Download, out: Upload, transfer: ArrowLeftRight, adjust: ClipboardList, ret: Undo2, loss: AlertTriangle };
const FONTES = "rpc_register_stock_entry · rpc_decrement_stock · rpc_register_stock_transfer · rpc_adjust_stock · rpc_register_supplier_return · rpc_register_stock_loss";

function inicio(db: Inventario, pre: PreMov): EstadoMov {
  const t = db.transfers.find((x) => x.id === pre.tr);
  const linha: LinhaMov = { p: pre.sku ? textoProduto(db, pre.sku) : "", qty: pre.qty || 1, cost: "" };
  return { passo: pre.type ? 2 : 1, type: pre.type ?? "in", wh: pre.wh ?? db.settings.defaultWh, from: t?.from ?? pre.wh ?? "LIS", to: t?.to ?? "POR", tr: pre.tr ?? "", ec: "", sign: "+", reason: "", note: "", supplier: "", doc: "", linhas: [linha], erro: "", resultado: null };
}

function Tipos({ escolher }: { escolher: (t: TipoRegisto) => void }) {
  return (
    <>
      <p className="muted">Que tipo de movimento? O stock só muda por movimentos e todos ficam no livro.</p>
      <div className="typecards">
        {TIPOS_REGISTO.map((t) => { const I = ICONES[t.id]; return <button key={t.id} type="button" className="tcard" onClick={() => escolher(t.id)}><b><I className="ic" aria-hidden="true" />{t.nome}</b><span>{t.desc}</span></button>; })}
      </div>
      <Fonte>{FONTES}</Fonte>
    </>
  );
}

export function MovimentoDialogo({ aberto, aoFechar, pre = {} }: { aberto: boolean; aoFechar: () => void; pre?: PreMov }) {
  const { db, agir, avisar } = useCtxInv();
  const [f, setF] = useState<EstadoMov>(() => inicio(db, pre));
  const [leitor, setLeitor] = useState<number | null>(null);
  const mudar = (p: Partial<EstadoMov>): void => setF((x) => ({ ...x, ...p, erro: "" }));
  const T = TIPOS_REGISTO.find((t) => t.id === f.type);
  const registar = (): void => {
    const erro = ["adjust", "loss"].includes(f.type) && !f.reason ? "Motivo obrigatório." : f.type === "ret" && !f.supplier ? "Indique o fornecedor da devolução." : "";
    if (erro) { setF((x) => ({ ...x, erro })); return; }
    const lines = f.linhas.map((l) => ({ sku: analisarProduto(db, l.p) ?? "", qty: Number(l.qty), cost: l.cost === "" ? null : Number(l.cost) }));
    const r = agir((d) => registarMovimento(d, { type: f.type, wh: f.wh, from: f.from, to: f.to, tr: f.tr, ec: f.ec, sign: f.sign, reason: f.reason, note: f.note, supplier: f.supplier, doc: f.doc, lines }));
    if (!r.ok) { setF((x) => ({ ...x, erro: r.erro })); return; }
    const { ok, failed } = r.valor;
    if (!failed.length) { aoFechar(); avisar(`${ok.length} linha(s) registadas no livro. Existências atualizadas.`); return; }
    const falhadas = new Set(failed.map((x) => x.i));
    setF((x) => ({ ...x, resultado: { ok, failed: failed.map((e, k) => ({ i: k, msg: e.msg })) }, linhas: x.linhas.filter((_, i) => falhadas.has(i)), erro: "" }));
    avisar(`${ok.length} de ${ok.length + failed.length} registados; ${failed.length} falhada(s).`, !ok.length);
  };
  const res = f.resultado;
  return (
    <Dlg aberto={aberto} aoFechar={aoFechar} largo titulo={f.passo === 1 ? "Registar movimento · 1 de 2" : `Registar movimento · 2 de 2 · ${T?.nome}`}
      rodape={f.passo === 1 ? <Sec onClick={aoFechar}>Cancelar</Sec> : <><Sec onClick={aoFechar}>{res?.ok.length ? "Fechar" : "Cancelar"}</Sec><Pri onClick={registar}><Check className="ic" aria-hidden="true" />Registar {f.linhas.length} linha(s)</Pri></>}>
      {f.passo === 1 ? <Tipos escolher={(t) => mudar({ type: t, passo: 2 })} /> : (
        <>
          <ListaProdutos db={db} />
          <PassoDois f={f} mudar={mudar} leitor={leitor} aoLeitor={setLeitor} />
          {res ? <div className={`alert ${res.failed.length ? "warn" : "ok"}`} role="status">{res.failed.length ? <AlertTriangle className="ic" aria-hidden="true" /> : <Check className="ic" aria-hidden="true" />}<span><b>{res.ok.length} de {res.ok.length + res.failed.length} registados</b>{res.failed.length ? "; linha(s) falhada(s) mantida(s) para corrigir." : "."}</span></div> : null}
          {f.erro ? <div className="alert bad"><AlertTriangle className="ic" aria-hidden="true" />{f.erro}</div> : null}
        </>
      )}
    </Dlg>
  );
}

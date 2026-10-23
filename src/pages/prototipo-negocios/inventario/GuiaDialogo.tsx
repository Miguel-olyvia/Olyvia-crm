// Os diálogos da guia e da receção por código, com o DOM do mockup: nova/editar guia (guiaForm), associar código a produto (learnDlg e learnDlg2),
// escolher entre vários produtos para o mesmo código, câmara simulada e a pré-visualização do comprovativo de receção (guiaPDF).
import { useState } from "react";
import { AlertTriangle, Plus, Printer, X } from "lucide-react";
import { fmtD, fmtDT, HOJE, nomeArm, nomeForn, nomeProd, guiaPorId } from "./base";
import { Fonte } from "./cabInv";
import { useCtxInv } from "./ctxInv";
import { Dlg } from "./DialogosInv";
import { GUIA_ESTADOS, guardarGuia, resumoGuia } from "./guias";
import { opcoesArmazens, opcoesFornecedores } from "./opcoes";
import { Lista, Pri, Rotulo, Sec, Texto } from "./pecasInv";
import { adicionarAoCesto, aprenderCodigo, fixarRececao, produtoDeTexto } from "./rececao";
import type { Inventario } from "./tipos";

/** A lista de produtos para os campos com sugestões (prodOptsHtml do mockup): "SKU — nome" e o EAN. */
export function ListaProdutos({ db }: { db: Inventario }) {
  return <datalist id="dl-prod">{db.products.filter((p) => !p.deleted).map((p) => <option key={p.sku} value={`${p.sku} — ${p.name}`}>{`EAN ${p.ean}`}</option>)}</datalist>;
}

interface LinhaAnn { p: string; qty: number | "" }

/** Nova guia do fornecedor ou editar uma aberta (guiaForm + guiaFormGo). Uma guia nova fica logo escolhida na receção. */
export function GuiaForm({ id, aoFechar }: { id?: string; aoFechar: () => void }) {
  const { db, agir, avisar, abrir } = useCtxInv();
  const g = id ? guiaPorId(db, id) : undefined;
  const [f, setF] = useState(() => ({
    no: g?.id ?? "", sup: g?.sup ?? db.rc.sup ?? "", date: g?.date ?? HOJE, wh: g?.wh ?? db.rc.wh,
    ann: (g ? g.ann.map((a): LinhaAnn => ({ p: `${a.sku} — ${nomeProd(db, a.sku)}`, qty: a.qty })) : [{ p: "", qty: 1 }]) as LinhaAnn[],
  }));
  const m = (p: Partial<typeof f>): void => setF((x) => ({ ...x, ...p }));
  const linha = (i: number, p: Partial<LinhaAnn>): void => m({ ann: f.ann.map((a, j) => (j === i ? { ...a, ...p } : a)) });
  const dup = f.no.trim() && f.sup ? db.guias.find((x) => x.id.toLowerCase() === f.no.trim().toLowerCase() && x.sup === f.sup && x.id !== id) : undefined;
  const gravar = (): void => {
    const ann: { sku: string; qty: number }[] = [];
    for (const a of f.ann) {
      if (!String(a.p).trim()) continue;
      const sku = produtoDeTexto(db, a.p);
      if (!sku) { avisar("Produto não reconhecido: " + a.p, true); return; }
      if (!Number.isInteger(a.qty) || (a.qty as number) < 1) { avisar("Quantidades inteiras.", true); return; }
      ann.push({ sku, qty: a.qty as number });
    }
    const r = agir((d) => { const nova = guardarGuia(d, { orig: id ?? null, no: f.no, sup: f.sup, date: f.date, wh: f.wh, ann }); if (!id) fixarRececao(d, { guia: nova.id }); return nova; }, "Guia gravada.");
    if (r.ok) aoFechar();
  };
  const existente = (): void => {
    aoFechar();
    if (!dup) return;
    if (dup.state === "open") agir((d) => fixarRececao(d, { guia: dup.id })); else abrir({ t: "guia", id: dup.id });
  };
  return (
    <Dlg aberto aoFechar={aoFechar} titulo={g ? `Editar guia ${g.id}` : "Nova guia do fornecedor"}
      rodape={<><Sec onClick={aoFechar}>Cancelar</Sec><Pri disabled={!!dup} title={dup ? "Guia duplicada: use a existente (ligação acima)" : undefined} onClick={gravar}>Gravar guia</Pri></>}>
      <div className="fg">
        <Texto rotulo="Nº da guia" valor={f.no} aoMudar={(v) => m({ no: v })} obrigatorio atributos={{ placeholder: "GR 2026/313" }} />
        <Lista rotulo="Fornecedor" valor={f.sup} aoMudar={(v) => m({ sup: v })} opcoes={[["", "Escolher…"], ...opcoesFornecedores(db)]} obrigatorio />
        <Texto rotulo="Data" tipo="date" valor={f.date} aoMudar={(v) => m({ date: v })} />
        <Lista rotulo="Armazém" valor={f.wh} aoMudar={(v) => m({ wh: v })} opcoes={opcoesArmazens(db)} />
      </div>
      {dup && (
        <div className="alert warn"><AlertTriangle className="ic" aria-hidden="true" />
          <div><b>Guia duplicada:</b> {dup.id} de {nomeForn(db, dup.sup)} já existe ({GUIA_ESTADOS[dup.state].toLowerCase()}). <button type="button" className="link" onClick={existente}>{dup.state === "open" ? "Usar a existente" : "Ver a existente"}</button></div>
        </div>
      )}
      <ListaProdutos db={db} />
      <div className="stack" style={{ gap: 6 }}>
        <b style={{ fontSize: 13 }}>Anunciado na guia</b>
        {f.ann.map((a, i) => (
          <div key={i} className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
            <input className="grow" list="dl-prod" value={a.p} aria-label="Produto" onChange={(e) => linha(i, { p: e.target.value })} />
            <input type="number" min={1} step={1} style={{ width: 90 }} value={a.qty} aria-label="Quantidade" onChange={(e) => linha(i, { qty: e.target.value === "" ? "" : Number(e.target.value) })} />
            <button type="button" className="btn btn-sm btn-ghost btn-icon" aria-label="Remover" onClick={() => m({ ann: f.ann.filter((_, j) => j !== i) })}><X className="ic" aria-hidden="true" /></button>
          </div>
        ))}
        <div><Sec className="btn-sm" onClick={() => m({ ann: [...f.ann, { p: "", qty: 1 }] })}><Plus className="ic" aria-hidden="true" />Linha</Sec></div>
      </div>
      <Fonte>rpc_delivery_note_save</Fonte>
    </Dlg>
  );
}

/** Associar um código lido a um produto. Com `k` vem das leituras não aceites (learnDlg) e o produto segue para o cesto; sem `k` é a associação solta da folha (learnDlg2). */
export function AprenderDlg({ code: inicial, k, aoFechar }: { code: string; k: number | null; aoFechar: () => void }) {
  const { db, agir, avisar } = useCtxInv();
  const solto = k === null;
  const [code, setCode] = useState(inicial);
  const [p, setP] = useState("");
  const ir = (): void => {
    if (solto && !code.trim()) { avisar("Indique o código.", true); return; }
    const sku = produtoDeTexto(db, p);
    if (!sku) { avisar("Escolha um produto.", true); return; }
    if (agir((d) => aprenderCodigo(d, code, sku, k), `Código associado a ${sku}.`).ok) aoFechar();
  };
  const campoProduto = <Rotulo rotulo="Produto" obrigatorio ajuda={solto ? undefined : "Da próxima vez este código é reconhecido."}>{(id) => <input id={id} list="dl-prod" value={p} onChange={(e) => setP(e.target.value)} />}</Rotulo>;
  return (
    <Dlg aberto aoFechar={aoFechar} titulo={solto ? "Associar código a produto" : `Associar código “${inicial}”`}
      rodape={<><Sec onClick={aoFechar}>Cancelar</Sec><Pri onClick={ir}>{solto ? "Associar" : "Associar e adicionar ao cesto"}</Pri></>}>
      <ListaProdutos db={db} />
      {solto ? <div className="fg"><Texto rotulo="Código lido" valor={code} aoMudar={setCode} obrigatorio />{campoProduto}</div> : campoProduto}
      <Fonte>{solto ? "rpc_product_code_learn" : "rpc_product_code_learn · product_codes"}</Fonte>
    </Dlg>
  );
}

/** O código corresponde a vários produtos: escolher o que se tem na mão. */
export function EscolherProdutoDlg({ code, skus, aoFechar }: { code: string; skus: string[]; aoFechar: () => void }) {
  const { db, agir } = useCtxInv();
  return (
    <Dlg aberto aoFechar={aoFechar} titulo={`O código “${code}” corresponde a vários produtos`} rodape={<Sec onClick={aoFechar}>Cancelar</Sec>}>
      <p>Escolha o produto que tem na mão:</p>
      <div className="stack" style={{ gap: 6 }}>
        {skus.map((s) => <Sec key={s} style={{ justifyContent: "flex-start" }} onClick={() => { aoFechar(); agir((d) => adicionarAoCesto(d, s)); }}>{nomeProd(db, s)} <span className="muted mono">{s}</span></Sec>)}
      </div>
      <Fonte>rpc_receiving_lookup · product_codes</Fonte>
    </Dlg>
  );
}

/** A câmara simulada: escolher o produto que “vê” equivale a ler o EAN dele. */
export function CameraDlg({ aoFechar, aoLer }: { aoFechar: () => void; aoLer: (code: string) => void }) {
  const { db } = useCtxInv();
  return (
    <Dlg aberto aoFechar={aoFechar} titulo="Câmara (simulada)" rodape={<Sec onClick={aoFechar}>Fechar</Sec>}>
      <p className="muted">Aponte a câmara ao código. Neste mockup, escolha o que “vê”:</p>
      <div className="stack" style={{ gap: 6 }}>
        {db.products.filter((p) => !p.kit && !p.deleted).map((p) => <Sec key={p.sku} style={{ justifyContent: "space-between" }} onClick={() => { aoFechar(); aoLer(p.ean); }}><span>{p.name}</span><span className="mono muted">{p.ean}</span></Sec>)}
      </div>
    </Dlg>
  );
}

/** O comprovativo de receção da guia (guiaPDF + printDoc): pré-visualização A4 e imprimir. */
export function PdfGuiaDlg({ id, aoFechar }: { id: string; aoFechar: () => void }) {
  const { db } = useCtxInv();
  const g = guiaPorId(db, id);
  if (!g) return null;
  const s = resumoGuia(db, g);
  const recs = db.pos.flatMap((p) => p.receipts.filter((r) => r.guia === g.id && r.state === "Ativa").map((r) => [p, r] as const));
  const titulo = "Comprovativo de receção · " + g.id;
  return (
    <Dlg aberto largo aoFechar={aoFechar} titulo={titulo + " — pré-visualização"}
      rodape={<><Sec onClick={aoFechar}>Fechar</Sec><Pri onClick={() => window.print()}><Printer className="ic" aria-hidden="true" />Imprimir / guardar PDF</Pri></>}>
      <div className="print-area">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
          <div><b style={{ fontSize: 18 }}>Olyvia</b><br /><span style={{ color: "#555" }}>Empresa A (Lisboa) · NIF 500000000</span></div>
          <div style={{ textAlign: "right" }}><b>{titulo}</b><br /><span style={{ color: "#555" }}>Emitido a {fmtD(HOJE)}</span></div>
        </div>
        <p><b>Fornecedor:</b> {nomeForn(db, g.sup)}<br /><b>Armazém:</b> {nomeArm(db, g.wh)}<br /><b>Data da guia:</b> {fmtD(g.date)}</p>
        <table><thead><tr><th>Produto</th><th>Anunciado</th><th>Recebido</th><th>Diferença</th></tr></thead>
          <tbody>{s.rows.map((r) => <tr key={r.sku}><td>{nomeProd(db, r.sku)}</td><td>{r.ann}</td><td>{r.rec}</td><td>{r.diff}</td></tr>)}</tbody></table>
        <p style={{ marginTop: 10 }}><b>Receções:</b> {recs.map(([p, r]) => `${fmtDT(r.at)} ${p.id} ${r.qty}× ${r.sku}`).join("; ") || "—"}</p>
        <p style={{ marginTop: 30 }}>Recebido por: ____________________ &nbsp; Assinatura: ____________________</p>
        <p style={{ color: "#777", fontSize: 11 }}>Comprovativo interno de receção; não é guia de transporte AT.</p>
      </div>
    </Dlg>
  );
}

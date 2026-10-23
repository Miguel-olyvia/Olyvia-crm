// O separador Linhas da folha de uma PO (poTab 'lines' do mockup): aviso de bloqueio ou de edição, acrescentar artigos, a tabela editável na própria célula, os totais e o cabeçalho.
import { useState } from "react";
import { Lock, Pencil, Plus, ScanLine, Search, Trash2 } from "lucide-react";
import { eur, nomeForn, nomeProd, produto, un } from "./base";
import { Fonte } from "./cabInv";
import { useCtxInv } from "./ctxInv";
import { Ed } from "./mockPecas";
import { Peq, Sec, Vazio } from "./pecasInv";
import { can } from "./perfil";
import { PoHdr, bloqueioPo, poDe } from "./PoCab";
import { adicionarLinhaPo, editarLinhaPo, poTotals, poUnits, removerLinhaPo, resolverArtigoPo, type CampoLinhaPo } from "./po";
import { Desbloquear, Dinheiro } from "./poPecas";
import type { AcoesPo, EstadoPd } from "./poTipos";
import { TabelaInv, type Coluna } from "./TabelaInv";
import type { Po, PoLinha } from "./tipos";

const PM = "purchase_orders.manage";
const OPCOES_IVA = [["0", "0 %"], ["6", "6 %"], ["13", "13 %"], ["23", "23 %"]] as const;
interface Props { p: Po; a: AcoesPo; pd: EstadoPd; setPd: (f: (x: EstadoPd) => EstadoPd) => void }

/** O campo para acrescentar artigos do catálogo do fornecedor (pesquisa, "Ler código" e "Adicionar itens"). */
function Acrescentar({ p, pd, setPd }: Omit<Props, "a">) {
  const { db, agir, avisar } = useCtxInv();
  const [dica, setDica] = useState("Pesquisar no catálogo do fornecedor (nome, SKU, EAN, ref.)");
  const itens = db.items.filter((i) => i.sup === p.sup);
  const adicionar = (): void => {
    const it = resolverArtigoPo(db, p, pd.add);
    if (!it) { avisar(`Sem artigo correspondente em ${nomeForn(db, p.sup)}. Ligue-o em Fornecedores › Artigos e preços.`, true); return; }
    const r = agir((d) => adicionarLinhaPo(d, poDe(d, p.id), it.sku), `${nomeProd(db, it.sku)} adicionado.`);
    if (r.ok) setPd((x) => ({ ...x, add: "" }));
  };
  return (
    <>
      <div className="row" style={{ marginBottom: 10 }}>
        <div className="inp-ic grow"><Search className="ic" aria-hidden="true" />
          <input id="pl-add" list="dl-supitems" placeholder={dica} aria-label="Pesquisar no catálogo do fornecedor" value={pd.add} onChange={(e) => setPd((x) => ({ ...x, add: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") adicionar(); }} /></div>
        <datalist id="dl-supitems">{itens.map((i) => <option key={i.id} value={`${i.sku} — ${nomeProd(db, i.sku)}`}>{`${i.ref} · ${i.unitLabel}`}</option>)}</datalist>
        <Sec onClick={() => { setPd((x) => ({ ...x, add: "" })); setDica(`Leitor pronto: leia o código (ex.: ${itens[0] ? produto(db, itens[0].sku)?.ean : ""}) e Enter`); document.getElementById("pl-add")?.focus(); }}><ScanLine className="ic" aria-hidden="true" />Ler código</Sec>
        <Sec onClick={adicionar}><Plus className="ic" aria-hidden="true" />Adicionar itens</Sec>
      </div>
      <Fonte>item_suppliers · rpc_supplier_catalog_search · product_codes</Fonte>
    </>
  );
}

function colunas(p: Po, a: AcoesPo): Coluna<PoLinha>[] {
  return [
    { id: "sku", titulo: "SKU / Ref.", classe: () => "mono", celula: (l) => <LinhaSku l={l} /> },
    { id: "desc", titulo: "Descrição", celula: (l) => <Descricao l={l} /> },
    { id: "qtd", titulo: "Qtd", celula: (l) => <CelulaQtd p={p} l={l} a={a} /> },
    { id: "emb", titulo: "Unidade / embalagem", celula: (l) => <CelulaEmb p={p} l={l} a={a} /> },
    { id: "pr", titulo: "Preço", direita: true, celula: (l) => <CelulaPreco p={p} l={l} a={a} /> },
    { id: "iva", titulo: "IVA", direita: true, celula: (l) => <Campo p={p} l={l} a={a} k="iva" tipo="select" mostrar={`${l.iva} %`} /> },
    { id: "tot", titulo: "Total", direita: true, celula: (l) => <Dinheiro n={l.packs * l.price} /> },
  ];
}
const LinhaSku = ({ l }: { l: PoLinha }) => { const { db } = useCtxInv(); return <>{l.sku}<br /><small className="muted">{db.items.find((i) => i.id === l.itemId)?.ref ?? ""}</small></>; };
const Descricao = ({ l }: { l: PoLinha }) => { const { db } = useCtxInv(); return <>{nomeProd(db, l.sku)}{l.ec ? <><br /><small className="muted">para {l.ec} ({l.ecUnits} un) · resto para stock</small></> : null}</>; };

/** Um valor editável da linha: grava logo, com as regras da encomenda (setPOLine); com bloqueio mostra o cadeado e o botão que o levanta. */
function Campo({ p, l, a, k, tipo, mostrar, atributos, bloqueio }: { p: Po; l: PoLinha; a: AcoesPo; k: CampoLinhaPo; tipo?: "number" | "select"; mostrar?: React.ReactNode; atributos?: React.InputHTMLAttributes<HTMLInputElement>; bloqueio?: { msg: string; unlock: React.ReactNode } | null }) {
  const { agir } = useCtxInv();
  const lk = bloqueio === undefined ? bloqueioPo(p, a) : bloqueio;
  return <Ed valor={String(l[k])} aoGravar={(v) => agir((d) => editarLinhaPo(d, poDe(d, p.id), l.id, k, String(v)), "Gravado.")} tipo={tipo} opcoes={tipo === "select" ? OPCOES_IVA : undefined} atributos={atributos} mostrar={mostrar} perm={PM} bloqueio={lk?.msg} desbloquear={lk?.unlock} />;
}

function CelulaQtd({ p, l, a }: { p: Po; l: PoLinha; a: AcoesPo }) {
  const lk = bloqueioPo(p, a);
  return (
    <>
      <Campo p={p} l={l} a={a} k="packs" tipo="number" atributos={{ min: 1, step: 1 }} mostrar={<b>{l.packs}</b>} /> <small className="muted">= {un(poUnits(l))}</small>
      {l.recv || l.cancelled ? <><br /><small className="muted">recebidas {l.recv}{l.cancelled ? ` · anuladas ${l.cancelled}` : ""}</small>{l.recv && !lk ? <Desbloquear rotulo="Reverter receção" aoClicar={() => a.irTab("rec")} /> : null}</> : null}
    </>
  );
}

function CelulaEmb({ p, l, a }: { p: Po; l: PoLinha; a: AcoesPo }) {
  const { db } = useCtxInv();
  const lk = bloqueioPo(p, a);
  const unidade = produto(db, l.sku)?.unit ?? "";
  const recBloq = l.recv ? { msg: `Linha com ${l.recv} un recebidas: para mudar a embalagem, reverta a receção`, unlock: <Desbloquear rotulo="Reverter receção" aoClicar={() => a.irTab("rec")} /> } : null;
  return (
    <>
      <Campo p={p} l={l} a={a} k="unitLabel" /><br />
      <small className="muted"><Campo p={p} l={l} a={a} k="packN" tipo="number" atributos={{ min: 1, step: 1 }} mostrar={`${l.packN} ${unidade} por embalagem`} bloqueio={lk ?? recBloq} /></small>
    </>
  );
}

function CelulaPreco({ p, l, a }: { p: Po; l: PoLinha; a: AcoesPo }) {
  const { db } = useCtxInv();
  if (!can("purchase_orders.view_prices")) return <Dinheiro n={l.price} />;
  return (
    <>
      <Campo p={p} l={l} a={a} k="price" tipo="number" atributos={{ min: 0, step: 0.01 }} mostrar={eur(l.price)} />
      {l.packN > 1 ? <><br /><small className="muted">{eur(l.price / l.packN)}/{produto(db, l.sku)?.unit}</small></> : null}
    </>
  );
}

function RemoverLinha({ p, l }: { p: Po; l: PoLinha }) {
  const { agir } = useCtxInv();
  return <Peq className="btn-ghost btn-icon" aria-label="Remover linha" onClick={() => agir((d) => removerLinhaPo(d, poDe(d, p.id), l.id), "Linha removida.")}><Trash2 className="ic" aria-hidden="true" /></Peq>;
}

function CabecalhoCard({ p, a }: { p: Po; a: AcoesPo }) {
  const campo = (k: "sup" | "date" | "due" | "wh" | "status", t: string): JSX.Element => <div key={k}><span className="lbl">{t}</span><PoHdr p={p} k={k} a={a} /></div>;
  return (
    <div className="card pad stack" style={{ boxShadow: "none" }}><b style={{ fontSize: 13 }}>Cabeçalho</b>
      <div className="fg">{campo("sup", "Fornecedor")}{campo("date", "Data da encomenda")}{campo("due", "Entrega prevista")}{campo("wh", "Entregar em")}{campo("status", "Estado")}</div>
      <small className="muted">“Recebida” e “Parcialmente recebida” não se escolhem: são calculadas pelas receções. Encomendado requer purchase_orders.approve.</small><Fonte>rpc_update_purchase_order</Fonte>
    </div>
  );
}

export function TabLinhas({ p, a, pd, setPd }: Props) {
  const lk = bloqueioPo(p, a);
  const editavel = !lk && can(PM);
  const t = poTotals(p);
  return (
    <>
      {lk ? <div className="alert warn"><Lock className="ic" aria-hidden="true" /><div><b>{lk.msg}.</b>{lk.unlock}</div></div>
        : <p className="rules" style={{ marginBottom: 8 }}><Pencil className="ic sm" aria-hidden="true" />Clique num valor para editar: Enter grava, Esc cancela. Grava logo, com as regras da encomenda.</p>}
      {editavel && <Acrescentar p={p} pd={pd} setPd={setPd} />}
      <TabelaInv titulo="Linhas da encomenda" minimo={900} colunas={colunas(p, a)} linhas={p.lines} chave={(l) => l.id}
        acoes={(l) => (editavel && !l.recv && !l.ecLine ? <RemoverLinha p={p} l={l} /> : null)}
        vazio={<Vazio titulo="Sem linhas" texto="Pesquise no catálogo do fornecedor para adicionar." />} />
      <div className="totals"><span>Subtotal</span><span className="num"><Dinheiro n={t.sub} /></span><span>IVA</span><span className="num"><Dinheiro n={t.iva} /></span><b>Total</b><b className="num"><Dinheiro n={t.total} /></b></div>
      <CabecalhoCard p={p} a={a} />
    </>
  );
}

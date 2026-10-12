// O separador "Artigos e preços" da ficha do fornecedor (supTab 'artigos', itemAddForm e supDraftTab do mockup): a tabela com ★ do preferido e edição na própria célula,
// exportar e importar, o formulário "Adicionar artigo" e remover. No rascunho os artigos ficam preparados e só se gravam com o fornecedor.
import { useState } from "react";
import { Plus, Star, Trash2, Upload } from "lucide-react";
import { ErroInv, eur, fornecedor, nomeProd, produto } from "./base";
import { adicionarArtigo, definirPreferido, removerArtigo, type DadosArtigo } from "./cadastros";
import { Fonte } from "./cabInv";
import { useCtxInv } from "./ctxInv";
import { Confirmar } from "./DialogosInv";
import { defArtigos } from "./impForn";
import { BotaoExportar, ImportarDlg } from "./ImportarInv";
import { Ed } from "./mockPecas";
import { Rotulo, Sec, Vazio } from "./pecasInv";
import { can } from "./perfil";
import { PM, perm } from "./permForn";
import { ListaProdutos, analisarProduto, dinheiro } from "./ProdutoCampo";
import { definirCampoArtigo, novoArtigoRascunho, type ArtigoRascunho, type CampoArtigo } from "./regrasForn";
import { TabelaInv } from "./TabelaInv";
import type { Artigo } from "./tipos";

interface NA { p: string; ref: string; packN: string; unit: string; price: string; moq: string; lead: string }

/** O formulário "Adicionar artigo": `aoAdicionar` devolve se ficou feito (e então o formulário limpa-se). */
function FormArtigo({ sla, aoAdicionar }: { sla: number; aoAdicionar: (d: DadosArtigo) => boolean }) {
  const { db } = useCtxInv();
  const vazio: NA = { p: "", ref: "", packN: "1", unit: "Unidade", price: "", moq: "1", lead: String(Number(sla) || 5) };
  const [n, setN] = useState<NA>(vazio);
  const campo = (k: keyof NA, rotulo: string, req = false, extra: React.InputHTMLAttributes<HTMLInputElement> = {}): React.ReactNode => (
    <Rotulo rotulo={rotulo} obrigatorio={req}>{(id) => <input id={id} value={n[k]} onChange={(e) => setN((x) => ({ ...x, [k]: e.target.value }))} {...extra} />}</Rotulo>
  );
  const juntar = (): void => {
    const ok = aoAdicionar({ sku: analisarProduto(db, n.p) ?? "", ref: n.ref, packN: Number(n.packN), unitLabel: n.unit, price: n.price === "" ? null : Number(n.price), moq: Number(n.moq), lead: Number(n.lead) });
    if (ok) setN(vazio);
  };
  return (
    <>
      <ListaProdutos db={db} />
      <div className="card pad stack" style={{ boxShadow: "none", marginTop: 12 }}><b style={{ fontSize: 13 }}>Adicionar artigo</b>
        <div className="fg">
          {campo("p", "Produto", true, { list: "dl-prod" })}{campo("ref", "Ref. fornecedor", true)}{campo("packN", "Unidades por embalagem", false, { type: "number", min: 1, step: 1 })}{campo("unit", "Embalagem")}
          {campo("price", "Preço por embalagem", true, { type: "number", min: 0, step: 0.01 })}{campo("moq", "MOQ", false, { type: "number", min: 1, step: 1 })}{campo("lead", "Prazo (dias)", false, { type: "number", min: 0, step: 1 })}
        </div>
        <div><button type="button" className="btn btn-sm btn-p" {...perm(PM)} onClick={juntar}><Plus className="ic" aria-hidden="true" />Adicionar artigo</button></div>
      </div>
    </>
  );
}

export function ArtigosForn({ id }: { id: string }) {
  const { db, agir } = useCtxInv();
  const [rem, setRem] = useState<Artigo | null>(null);
  const [imp, setImp] = useState(false);
  const s = fornecedor(db, id);
  const its = db.items.filter((i) => i.sup === id);
  const grava = (i: Artigo, k: CampoArtigo) => (v: string | boolean): unknown => agir((d) => definirCampoArtigo(d, i.id, k, String(v)), "Gravado.");
  const num = (i: Artigo, k: CampoArtigo, extra: Partial<React.ComponentProps<typeof Ed>>): React.ReactNode => <Ed valor={i[k] as number} tipo="number" perm={PM} aoGravar={grava(i, k)} {...extra} />;
  const def = defArtigos(id, () => its);
  return (
    <>
      <div className="row between" style={{ marginBottom: 10 }}><p className="muted" style={{ fontSize: 12.5 }}>★ = preferido (recebe os rascunhos automáticos). Clique num valor para editar. Preço por embalagem; o stock conta sempre em unidades.</p>
        <div className="row"><BotaoExportar def={def} pequeno /><Sec className="btn-sm" {...perm(PM)} onClick={() => setImp(true)}><Upload className="ic" aria-hidden="true" />Importar</Sec></div></div>
      <TabelaInv titulo="Artigos do fornecedor" minimo={900} linhas={its} chave={(i) => i.id} vazio={<Vazio titulo="Sem artigos" texto="Adicione abaixo ou ligue do catálogo do portal." />}
        colunas={[
          { id: "pf", titulo: "★", nome: "Preferido", celula: (i) => <button type="button" className="btn btn-sm btn-ghost btn-icon" aria-pressed={i.pref} aria-label={i.pref ? "Fornecedor preferido" : "Marcar como preferido"} {...perm(PM)} style={{ color: i.pref ? "hsl(42 95% 45%)" : "var(--i-muted-fg)" }} onClick={() => agir((d) => definirPreferido(d, i.id), "Fornecedor preferido atualizado.")}><Star className="ic" aria-hidden="true" /></button> },
          { id: "r", titulo: "Ref. fornecedor", classe: () => "mono", celula: (i) => <Ed valor={i.ref} perm={PM} aoGravar={grava(i, "ref")} /> },
          { id: "p", titulo: "Produto", celula: (i) => nomeProd(db, i.sku) }, { id: "k", titulo: "SKU", classe: () => "mono", celula: (i) => i.sku },
          { id: "u", titulo: "Unidade / embalagem", celula: (i) => <><Ed valor={i.unitLabel} perm={PM} aoGravar={grava(i, "unitLabel")} /><br /><small className="muted">{num(i, "packN", { atributos: { min: 1, step: 1 }, mostrar: `${i.packN} ${produto(db, i.sku)?.unit ?? ""} por embalagem` })}</small></> },
          { id: "pr", titulo: "Preço", direita: true, celula: (i) => (can("purchase_orders.view_prices") ? <>{num(i, "price", { atributos: { min: 0, step: 0.01 }, mostrar: eur(i.price) })}{i.packN > 1 ? <><br /><small className="muted">{eur(i.price / i.packN)}/{produto(db, i.sku)?.unit}</small></> : null}</> : dinheiro(i.price)) },
          { id: "m", titulo: "MOQ", direita: true, celula: (i) => num(i, "moq", { atributos: { min: 1, step: 1 } }) },
          { id: "l", titulo: "Prazo", direita: true, celula: (i) => num(i, "lead", { atributos: { min: 0, step: 1 }, mostrar: `${i.lead} d` }) },
        ]}
        acoes={(i) => <button type="button" className="btn btn-sm btn-ghost btn-icon" aria-label="Remover artigo" {...perm(PM)} onClick={() => setRem(i)}><Trash2 className="ic" aria-hidden="true" /></button>} />
      {can(PM) && <FormArtigo sla={s?.sla ?? 5} aoAdicionar={(d) => agir((x) => adicionarArtigo(x, id, d), "Artigo adicionado.").ok} />}
      <Fonte>item_suppliers · item_supplier_price_history · rpc_delete_item_supplier</Fonte>
      {rem && <Confirmar aberto aoFechar={() => setRem(null)} titulo={`Remover artigo ${rem.ref}`} ok="Remover" perigo texto={<p>O artigo deixa de estar disponível para encomendas a {s?.name}.</p>} aoConfirmar={() => agir((d) => removerArtigo(d, rem.id))} />}
      {imp && <ImportarDlg def={def} aoFechar={() => setImp(false)} />}
    </>
  );
}

/** Os artigos preparados num fornecedor ainda por gravar. */
export function ArtigosRascunho({ items, setItems, sla }: { items: ArtigoRascunho[]; setItems: (i: ArtigoRascunho[]) => void; sla: number }) {
  const { db, avisar } = useCtxInv();
  const juntar = (d: DadosArtigo): boolean => {
    try { setItems([...items, novoArtigoRascunho(db, d, items)]); avisar("Artigo preparado no rascunho."); return true; }
    catch (e) { if (e instanceof ErroInv) { avisar(e.message, true); return false; } throw e; }
  };
  return (
    <>
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Artigos preparados no rascunho: gravados juntamente com o fornecedor. ★ = preferido (só se o produto ainda não tiver preferido).</p>
      <TabelaInv titulo="Artigos preparados" minimo={900} linhas={items} chave={(i) => i.ref} vazio={<span className="muted">Nenhum artigo ainda.</span>}
        colunas={[
          { id: "r", titulo: "Ref. fornecedor", classe: () => "mono", celula: (i) => i.ref }, { id: "p", titulo: "Produto", celula: (i) => nomeProd(db, i.sku) }, { id: "k", titulo: "SKU", classe: () => "mono", celula: (i) => i.sku },
          { id: "u", titulo: "Embalagem", celula: (i) => `${i.unitLabel} (${i.packN})` }, { id: "pr", titulo: "Preço", direita: true, celula: (i) => eur(i.price) },
          { id: "m", titulo: "MOQ", direita: true, celula: (i) => i.moq }, { id: "l", titulo: "Prazo", direita: true, celula: (i) => `${i.lead} d` },
        ]}
        acoes={(i) => <button type="button" className="btn btn-sm btn-ghost btn-icon" aria-label="Remover" onClick={() => setItems(items.filter((x) => x !== i))}><Trash2 className="ic" aria-hidden="true" /></button>} />
      <FormArtigo sla={sla} aoAdicionar={juntar} />
    </>
  );
}

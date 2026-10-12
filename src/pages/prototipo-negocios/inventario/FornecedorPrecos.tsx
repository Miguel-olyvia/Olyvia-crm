// O separador "Preços por aprovar" da ficha do fornecedor (supTab 'precos' e rejectPrices do mockup): o preço atual → novo, a diferença, se o custo muda e a margem antes e depois,
// aceitar ou recusar (uma, várias ou todas) e o registo dos decididos. Decidir exige products.manage_prices.
import { useState } from "react";
import { Lock } from "lucide-react";
import { fmtDT, nomeProd, pct, produto } from "./base";
import { decidirPreco } from "./cadastros";
import { Fonte } from "./cabInv";
import { useCtxInv } from "./ctxInv";
import { Dlg } from "./DialogosInv";
import { margem, precosPorAprovar } from "./fornecedores";
import { Notas, Peq, Pri, Sec, Selo, Vazio } from "./pecasInv";
import { can } from "./perfil";
import { perm } from "./permForn";
import { dinheiro } from "./ProdutoCampo";
import { TabelaInv } from "./TabelaInv";
import type { AlteracaoPreco, Artigo, Inventario } from "./tipos";

const PP = "products.manage_prices";
const SEM_LINHAS = { disabled: true, title: "Selecione linhas primeiro" };

function Recusar({ ids, aoFechar, aoFeito }: { ids: string[]; aoFechar: () => void; aoFeito: () => void }) {
  const { agir } = useCtxInv();
  const [nota, setNota] = useState("");
  const recusar = (): void => { if (agir((d) => { for (const k of ids) decidirPreco(d, k, false, nota); }, "Alteração recusada.").ok) aoFeito(); aoFechar(); };
  return (
    <Dlg aberto aoFechar={aoFechar} titulo={`Recusar ${ids.length} alteração(ões) de preço`} rodape={<><Sec onClick={aoFechar}>Cancelar</Sec><Pri variant="destructive" onClick={recusar}>Recusar</Pri></>}>
      <p>O fornecedor vê a recusa e a nota no portal. O preço atual mantém-se.</p>
      <Notas rotulo="Nota para o fornecedor" valor={nota} aoMudar={setNota} />
    </Dlg>
  );
}

function Linhas({ db, lista, sel, marcar }: { db: Inventario; lista: AlteracaoPreco[]; sel: Record<string, boolean>; marcar: (id: string, v: boolean) => void }) {
  const { agir } = useCtxInv();
  const [rec, setRec] = useState<string | null>(null);
  const artigo = (c: AlteracaoPreco): Artigo => db.items.find((x) => x.id === c.itemId) as Artigo;
  return (
    <>
      <TabelaInv titulo="Preços por aprovar" minimo={1000} linhas={lista} chave={(c) => c.id}
        colunas={[
          { id: "s", titulo: "", celula: (c) => <input type="checkbox" aria-label="Selecionar" checked={!!sel[c.id]} onChange={(e) => marcar(c.id, e.target.checked)} /> },
          { id: "p", titulo: "Produto", celula: (c) => <>{nomeProd(db, artigo(c).sku)}<br /><small className="muted mono">{artigo(c).sku}</small></> },
          { id: "a", titulo: "Artigo do fornecedor", celula: (c) => <><span className="mono">{artigo(c).ref}</span><br /><small className="muted">{artigo(c).unitLabel}</small></> },
          { id: "n", titulo: "Atual → novo", direita: true, classe: () => "nowrap", celula: (c) => <>{dinheiro(c.cur)} → <b>{dinheiro(c.nw)}</b></> },
          { id: "d", titulo: "Dif. %", direita: true, celula: (c) => { const d = ((c.nw - c.cur) / c.cur) * 100; return <Selo tom={d > 5 ? "bad" : d > 0 ? "warn" : "ok"}>{d > 0 ? "+" : ""}{pct(d)}</Selo>; } },
          { id: "cm", titulo: "Custo muda?", celula: (c) => (artigo(c).pref ? <Selo tom="info">Sim · preferido</Selo> : <Selo tom="neu">Não</Selo>) },
          { id: "m", titulo: "Margem atual → nova", direita: true, classe: () => "nowrap", celula: (c) => {
            const i = artigo(c), p = produto(db, i.sku);
            if (!p) return "—";
            const m0 = margem(p.sale, p.cost), m1 = margem(p.sale, i.pref ? c.nw / i.packN : p.cost);
            return <>{pct(m0)} → <b style={{ color: `var(--i-${m1 < m0 ? "bad" : "ok"})` }}>{pct(m1)}</b></>;
          } },
          { id: "w", titulo: "", celula: (c) => { const d = ((c.nw - c.cur) / c.cur) * 100, p = produto(db, artigo(c).sku), i = artigo(c); const m1 = p ? margem(p.sale, i.pref ? c.nw / i.packN : p.cost) : 100; return <>{Math.abs(d) > 5 ? <Selo tom="bad">Variação alta</Selo> : null}{m1 < 25 ? <> <Selo tom="warn">Margem baixa</Selo></> : null}</>; } },
        ]}
        acoes={(c) => <><Peq {...perm(PP)} onClick={() => agir((d) => decidirPreco(d, c.id, true), "Preço aceite: artigo e custo de referência atualizados.")}>Aceitar</Peq><Peq {...perm(PP)} onClick={() => setRec(c.id)}>Recusar</Peq></>} />
      {rec && <Recusar ids={[rec]} aoFechar={() => setRec(null)} aoFeito={() => marcar(rec, false)} />}
    </>
  );
}

export function PrecosForn({ id }: { id: string }) {
  const { db, agir } = useCtxInv();
  const [psel, setPsel] = useState<Record<string, boolean>>({});
  const [lote, setLote] = useState<string[] | null>(null);
  const lista = precosPorAprovar(db, id);
  const decididos = db.prices.filter((c) => c.sup === id && c.state !== "pending");
  const sel = Object.keys(psel).filter((k) => psel[k] && lista.some((c) => c.id === k));
  const aceitarLote = (): void => { agir((d) => { for (const k of sel) { const c = d.prices.find((x) => x.id === k); if (c && c.state === "pending") decidirPreco(d, k, true); } }, "Preços aceites em lote."); setPsel({}); };
  return (
    <>
      {!can(PP) && <div className="alert warn" style={{ marginBottom: 10 }}><Lock className="ic" aria-hidden="true" /><span>Decidir preços exige <span className="mono">{PP}</span>: peça a um administrador. Vista só de leitura.</span></div>}
      {lista.length ? (
        <>
          <div className="row" style={{ marginBottom: 10 }}>
            <Peq onClick={() => setPsel(Object.fromEntries(lista.map((c) => [c.id, true])))}>Selecionar tudo</Peq>
            <button type="button" className="btn btn-sm btn-p" {...(sel.length ? perm(PP) : SEM_LINHAS)} onClick={aceitarLote}>Aceitar selecionados ({sel.length})</button>
            <Peq {...(sel.length ? perm(PP) : SEM_LINHAS)} onClick={() => setLote(sel)}>Recusar selecionados ({sel.length})</Peq>
          </div>
          <Linhas db={db} lista={lista} sel={psel} marcar={(k, v) => setPsel((x) => ({ ...x, [k]: v }))} />
        </>
      ) : <Vazio titulo="Sem preços por aprovar" texto="Quando o fornecedor submeter novos preços no portal, aparecem aqui." />}
      {decididos.length > 0 && (
        <details className="box" style={{ marginTop: 14 }}><summary>Decididos ({decididos.length})</summary>
          <div>{decididos.map((c) => { const i = db.items.find((x) => x.id === c.itemId); return (
            <div key={c.id} style={{ fontSize: 13, padding: "4px 0" }}><Selo tom={c.state === "accepted" ? "ok" : "bad"}>{c.state === "accepted" ? "Aceite" : "Recusado"}</Selo> {i?.ref ?? ""} {dinheiro(c.cur)} → {dinheiro(c.nw)} · {fmtDT(c.decidedAt)} · {c.by ?? ""}{c.note ? ` · “${c.note}”` : ""}</div>
          ); })}</div></details>
      )}
      <Fonte>supplier_price_change_requests · rpc_price_changes_decide · fn_price_change_cost_plan · calculate_product_margin</Fonte>
      {lote && <Recusar ids={lote} aoFechar={() => setLote(null)} aoFeito={() => setPsel({})} />}
    </>
  );
}

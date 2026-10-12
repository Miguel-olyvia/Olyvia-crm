// A pesquisa global do topo do mockup (gSearch): PO, EC, produto, SKU, EAN, fornecedor e guia, numa só caixa. Cada resultado leva ao ecrã certo e abre o detalhe.
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useCtxInv } from "./ctxInv";
import { procurar, type Resultado } from "./procurarInv";

export function PesquisaGlobal() {
  const { db, ir } = useCtxInv();
  const [q, setQ] = useState("");
  const [aberta, setAberta] = useState(false);
  const res = useMemo(() => procurar(db, q), [db, q]);
  const escolher = (r: Resultado): void => { setAberta(false); ir(r.destino, r.detalhe); };
  return (
    <div className="gsearch" role="search">
      <label className="sr" htmlFor="gs">Pesquisa global</label>
      <Search className="ic" aria-hidden="true" />
      <input id="gs" type="search" autoComplete="off" placeholder="Procurar PO, EC, produto, SKU, EAN, fornecedor…" value={q}
        onChange={(e) => { setQ(e.target.value); setAberta(true); }} onFocus={() => setAberta(true)}
        onKeyDown={(e) => { if (e.key === "Escape") { setQ(""); setAberta(false); } }} />
      {aberta && q.trim() ? (
        <div className="gres" role="listbox" aria-label="Resultados da pesquisa">
          {res.length ? res.map((r) => (
            <button key={r.tipo + r.titulo} type="button" role="option" aria-selected="false" onClick={() => escolher(r)}><span className="gk">{r.tipo}</span><b>{r.titulo}</b><small>{r.sub}</small></button>
          )) : <div className="empty" style={{ padding: 14 }}>Sem resultados para “{q.trim()}”.</div>}
        </div>
      ) : null}
    </div>
  );
}

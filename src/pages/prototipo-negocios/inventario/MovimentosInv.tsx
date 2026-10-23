// Armazém › Movimentos, igual ao mockup (scrMov): o livro completo e imutável, com filtros, "Carregar mais", exportação e a nota de cada movimento editável no sítio.
import { useState } from "react";
import { Lock, Plus } from "lucide-react";
import { N, contagemPorId, ecPorId, fmtDT, nomeArm, nomeProd, poPorId } from "./base";
import { AcoesCab, Fonte } from "./cabInv";
import { useCtxInv } from "./ctxInv";
import { FILTROS_VAZIOS, filtrarMovs } from "./filtros";
import { BotaoExportar } from "./ImportarInv";
import { Ed } from "./mockPecas";
import { MovimentoDialogo } from "./MovimentoDialogo";
import { opcoesArmazens } from "./opcoes";
import { can } from "./perfil";
import { Ligacao, Pesquisa, Selo, Vazio } from "./pecasInv";
import { dinheiro } from "./ProdutoCampo";
import { TIPOS_MOV, anotarMovimento } from "./stock";
import { defMovs } from "./stockAcoes";
import { TabelaInv, type Coluna } from "./TabelaInv";
import type { Movimento, TipoMov } from "./tipos";

const REGRA = "O livro nunca se edita nem apaga: correções fazem-se com novos movimentos (ajuste, estorno, reversão). Só as notas/contraparte são editáveis (clique na nota) e ficam marcadas como editadas. Uma saída que deixaria o stock abaixo de zero falha por inteiro.";

function Filtros() {
  const { db, filtros, setFiltros } = useCtxInv();
  const f = filtros.mov;
  const filtrado = !!(f.q || f.type || f.wh || f.doc || f.de || f.ate);
  return (
    <div className="card filters">
      <div className="frow">
        <Pesquisa valor={f.q} aoMudar={(q) => setFiltros("mov", { q })} rotulo="Produto" dica="Produto, SKU ou EAN" />
        <select aria-label="Tipo" value={f.type} onChange={(e) => setFiltros("mov", { type: e.target.value as TipoMov | "" })}>
          <option value="">Todos os tipos</option>{(Object.keys(TIPOS_MOV) as TipoMov[]).map((k) => <option key={k} value={k}>{TIPOS_MOV[k].t}</option>)}
        </select>
        <select aria-label="Armazém" value={f.wh} onChange={(e) => setFiltros("mov", { wh: e.target.value })}>
          <option value="">Todos os armazéns</option>{opcoesArmazens(db, true).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
        <input id="mv-doc" type="search" placeholder="Documento (PO, EC, INV, TR)" aria-label="Documento" value={f.doc} onChange={(e) => setFiltros("mov", { doc: e.target.value })} />
        <label className="inl">De <input type="date" value={f.de} onChange={(e) => setFiltros("mov", { de: e.target.value })} /></label>
        <label className="inl">Até <input type="date" value={f.ate} onChange={(e) => setFiltros("mov", { ate: e.target.value })} /></label>
        {filtrado ? <button type="button" className="btn btn-sm btn-ghost" onClick={() => setFiltros("mov", FILTROS_VAZIOS.mov)}>Limpar filtros</button> : null}
      </div>
      <div className="rules"><Lock className="ic sm" aria-hidden="true" /><span>{REGRA}</span></div>
    </div>
  );
}

function Documento({ d }: { d: string }) {
  const { db, abrir, setFiltros } = useCtxInv();
  if (!d) return <>—</>;
  if (/^PO-/.test(d) && poPorId(db, d)) return <Ligacao className="mono" aoClicar={() => abrir({ t: "po", id: d })}>{d}</Ligacao>;
  if (/^EC-/.test(d) && ecPorId(db, d) && can("contracts.view")) return <Ligacao className="mono" aoClicar={() => abrir({ t: "ec", id: d })}>{d}</Ligacao>;
  if (/^INV-/.test(d) && contagemPorId(db, d)) return <Ligacao className="mono" aoClicar={() => abrir({ t: "cont", id: d })}>{d}</Ligacao>;
  if (/^TR-/.test(d)) return <Ligacao className="mono" aoClicar={() => setFiltros("mov", { doc: d })}>{d}</Ligacao>;
  return <span className="mono">{d}</span>;
}

function Nota({ m }: { m: Movimento }) {
  const { agir } = useCtxInv();
  return (
    <>
      <Ed valor={m.note} perm="inventory.manage" rotulo="Editar nota" aoGravar={(v) => agir((d) => anotarMovimento(d, m.id, String(v)), "Gravado.")} />
      {m.noteEdited ? <><br /><small className="muted">nota editada {fmtDT(m.noteEdited)} · {m.noteBy ?? ""}</small></> : null}
      {m.cost != null && can("purchase_orders.view_prices") ? <><br /><small className="muted">custo {dinheiro(m.cost)}/un</small></> : null}
    </>
  );
}

export function MovimentosInv() {
  const { db, filtros, setFiltros } = useCtxInv();
  const f = filtros.mov;
  const lista = filtrarMovs(db, f), mostradas = lista.slice(0, f.limite);
  const [dlg, setDlg] = useState(false);
  const cols: Coluna<Movimento>[] = [
    { id: "at", titulo: "Data", celula: (m) => <span className="nowrap">{fmtDT(m.at)}</span> },
    { id: "t", titulo: "Tipo", celula: (m) => <Selo tom={TIPOS_MOV[m.type].tone}>{TIPOS_MOV[m.type].t}</Selo> },
    { id: "p", titulo: "Produto", celula: (m) => <>{nomeProd(db, m.sku)}<br /><small className="muted mono">{m.sku}</small></> },
    { id: "w", titulo: "Armazém", celula: (m) => nomeArm(db, m.wh) },
    { id: "q", titulo: "Qtd", direita: true, celula: (m) => <span style={{ fontWeight: 650, color: `var(--i-${m.qty > 0 ? "ok" : "bad"})` }}>{m.qty > 0 ? "+" : "−"}{N(Math.abs(m.qty))}</span> },
    { id: "b", titulo: "Saldo depois", direita: true, celula: (m) => N(m.bal) },
    { id: "d", titulo: "Documento", celula: (m) => <Documento d={m.doc} /> },
    { id: "n", titulo: "Notas / contraparte", celula: (m) => <Nota m={m} /> },
    { id: "u", titulo: "Utilizador", celula: (m) => m.user },
  ];
  return (
    <>
      <AcoesCab>
        <BotaoExportar def={defMovs(db, () => lista)} />
        <button type="button" className="btn btn-p" {...(can("inventory.manage") ? {} : { disabled: true, title: "Requer inventory.manage" })} onClick={() => setDlg(true)}><Plus className="ic" aria-hidden="true" />Registar movimento</button>
      </AcoesCab>
      <Filtros />
      {mostradas.length ? <TabelaInv titulo="Livro de movimentos" minimo={1000} colunas={cols} linhas={mostradas} chave={(m) => String(m.id)} /> : <Vazio titulo="Sem movimentos com estes filtros" />}
      <div className="tbl-foot">
        <span>A mostrar {mostradas.length} de {lista.length} movimento(s)</span>
        {lista.length > mostradas.length ? <button type="button" className="btn btn-sm" onClick={() => setFiltros("mov", { limite: f.limite + 40 })}>Carregar mais</button> : null}
        <Fonte>stock_movements (livro imutável)</Fonte>
      </div>
      {dlg && <MovimentoDialogo aberto aoFechar={() => setDlg(false)} />}
    </>
  );
}

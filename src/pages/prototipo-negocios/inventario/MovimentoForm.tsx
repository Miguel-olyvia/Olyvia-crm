// O passo 2 de "Registar movimento", com o DOM do mockup (mwHtml): os campos do tipo escolhido e as linhas de produto, com os avisos de cada linha.
import { AlertTriangle, Plus, ScanLine, Trash2, X } from "lucide-react";
import { ecPorId, produto } from "./base";
import { useCtxInv } from "./ctxInv";
import { ecLinhaInfo } from "./ec";
import { MOTIVOS_AJUSTE, MOTIVOS_QUEBRA, TIPOS_REGISTO, avisosLinha, type ResultadoRegisto, type TipoRegisto } from "./movimentos";
import { opcoesArmazens, opcoesFornecedores } from "./opcoes";
import { can } from "./perfil";
import { Lista, Texto } from "./pecasInv";
import { analisarProduto, dinheiro, textoProduto } from "./ProdutoCampo";

export interface LinhaMov { p: string; qty: number | ""; cost: string }
export interface EstadoMov {
  passo: 1 | 2; type: TipoRegisto; wh: string; from: string; to: string; tr: string; ec: string; sign: "+" | "-"; reason: string; note: string; supplier: string; doc: string;
  linhas: LinhaMov[]; erro: string; resultado: ResultadoRegisto | null;
}
type Mudar = (p: Partial<EstadoMov>) => void;
const COMPACTO = { padding: "6px 10px" };

function LinhaCampos({ f, i, mudar, leitor, aoLeitor }: { f: EstadoMov; i: number; mudar: Mudar; leitor: boolean; aoLeitor: () => void }) {
  const { db } = useCtxInv();
  const l = f.linhas[i];
  const sku = analisarProduto(db, l.p);
  const item = sku && f.supplier ? db.items.find((x) => x.sup === f.supplier && x.sku === sku) : undefined;
  const pre = item ? item.price / item.packN : produto(db, sku ?? "")?.avg ?? 0;
  const custo = f.type === "in";
  const avisos = !l.p.trim() ? [] : !sku ? [{ tom: "bad" as const, msg: "Produto não reconhecido. Escolha da lista ou leia o código." }]
    : avisosLinha(db, f, f.linhas.map((x) => ({ sku: analisarProduto(db, x.p) ?? "", qty: x.qty })), i);
  const falhou = f.resultado?.failed.find((x) => x.i === i);
  const muda = (p: Partial<LinhaMov>): void => mudar({ linhas: f.linhas.map((x, j) => (j === i ? { ...x, ...p } : x)) });
  return (
    <div className="card pad stack" style={{ boxShadow: "none", padding: 10, gap: 6 }}>
      <div className="row" style={{ gap: 6, alignItems: "flex-end" }}>
        <label className="fl grow" style={{ minWidth: 200 }}><span>Produto</span>
          <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
            <input id={`mw-p${i}`} className="grow" list="dl-prod" placeholder={leitor ? "Leitor pronto: leia o código e Enter" : "Pesquisar nome, SKU ou EAN"} value={l.p} onChange={(e) => muda({ p: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} />
            <button type="button" className="btn btn-sm" title="Leitor de código" onClick={() => { muda({ p: "" }); aoLeitor(); document.getElementById(`mw-p${i}`)?.focus(); }}><ScanLine className="ic" aria-hidden="true" /><span className="sr">Ler código</span></button>
          </span>
        </label>
        <label className="fl" style={{ width: 110 }}><span>Quantidade</span>
          <input id={`mw-q${i}`} type="number" min={1} step={1} inputMode="numeric" value={l.qty} onChange={(e) => muda({ qty: e.target.value === "" ? "" : Number(e.target.value) })} />
        </label>
        {custo ? <label className="fl" style={{ width: 140 }}><span>Custo unitário</span><input id={`mw-c${i}`} type="number" min={0} step={0.01} value={l.cost} onChange={(e) => muda({ cost: e.target.value })} /></label> : null}
        <button type="button" className="btn btn-sm btn-ghost btn-icon" aria-label="Remover linha" {...(f.linhas.length < 2 ? { disabled: true, title: "É preciso pelo menos uma linha" } : {})} onClick={() => mudar({ linhas: f.linhas.filter((_, j) => j !== i) })}><Trash2 className="ic" aria-hidden="true" /></button>
      </div>
      {custo && sku ? (
        <small className="muted">{item ? <>Preço do fornecedor: {dinheiro(item.price / item.packN)}/un ({item.unitLabel} a {dinheiro(item.price)})</> : <>Custo médio atual: {dinheiro(produto(db, sku)?.avg ?? 0)}</>} · <button type="button" className="link" onClick={() => muda({ cost: String(Math.round(pre * 100) / 100) })}>usar</button> · sem custo, o custo médio não muda.</small>
      ) : null}
      {avisos.map((a) => <div key={a.msg} className={`alert ${a.tom}`} style={COMPACTO}><AlertTriangle className="ic sm" aria-hidden="true" /><span>{a.msg}</span></div>)}
      {falhou ? <div className="alert bad" style={COMPACTO}><X className="ic sm" aria-hidden="true" /><span>Falhou: {falhou.msg}</span></div> : null}
    </div>
  );
}

function Campos({ f, mudar }: { f: EstadoMov; mudar: Mudar }) {
  const { db } = useCtxInv();
  const trs = db.transfers.filter((t) => t.state === "pending");
  const ecs = db.ecs.filter((e) => !e.deleted && e.wh === f.wh && e.lines.some((l) => l.sku && !l.voided && l.served < l.qty));
  const arm = opcoesArmazens(db);
  const escolherTr = (id: string): void => {
    const t = trs.find((x) => x.id === id);
    mudar(t ? { tr: id, from: t.from, to: t.to, linhas: [{ p: textoProduto(db, t.sku), qty: t.qty, cost: "" }] } : { tr: id });
  };
  const escolherEc = (id: string): void => {
    const e = ecPorId(db, id);
    const ls = e ? e.lines.filter((l) => l.sku && !l.voided && l.served < l.qty).map((l): LinhaMov => ({ p: textoProduto(db, l.sku as string), qty: Math.max(1, ecLinhaInfo(db, e, l).ready || 0), cost: "" })) : [];
    mudar({ ec: id, ...(ls.length ? { linhas: ls } : {}) });
  };
  return (
    <div className="fg">
      {f.type === "transfer" ? (
        <>
          <Lista rotulo="Origem" valor={f.from} aoMudar={(v) => mudar({ from: v })} opcoes={arm} obrigatorio />
          <Lista rotulo="Destino" valor={f.to} aoMudar={(v) => mudar({ to: v })} opcoes={arm} obrigatorio />
          <Lista rotulo="Pedido de transferência (opcional)" valor={f.tr} aoMudar={escolherTr} opcoes={[["", "Nenhum"], ...trs.map((t) => [t.id, `${t.id} · ${t.qty}× ${t.sku} · ${db.warehouses.find((w) => w.id === t.from)?.code}→${db.warehouses.find((w) => w.id === t.to)?.code}`] as const)]} />
        </>
      ) : <Lista rotulo="Armazém" valor={f.wh} aoMudar={(v) => mudar({ wh: v })} opcoes={arm} obrigatorio />}
      {f.type === "out" && can("contracts.view") ? <Lista rotulo="Encomenda Cliente de origem (opcional)" valor={f.ec} aoMudar={escolherEc} opcoes={[["", "Sem EC"], ...ecs.map((e) => [e.id, `${e.id} · ${e.client}`] as const)]} ajuda="Preenche as linhas com o que está pronto a sair." /> : null}
      {f.type === "adjust" ? <Lista rotulo="Sentido" valor={f.sign} aoMudar={(v) => mudar({ sign: v as "+" | "-" })} opcoes={[["+", "Aumentar (+)"], ["-", "Diminuir (−)"]]} /> : null}
      {f.type === "in" || f.type === "ret" ? <Lista rotulo={`Fornecedor${f.type === "ret" ? "" : " (opcional)"}`} valor={f.supplier} aoMudar={(v) => mudar({ supplier: v })} opcoes={[["", "—"], ...opcoesFornecedores(db)]} /> : null}
      {f.type === "adjust" || f.type === "loss" ? <Lista rotulo="Motivo" valor={f.reason} aoMudar={(v) => mudar({ reason: v })} obrigatorio erro={f.erro && !f.reason ? "Motivo obrigatório." : ""}
        opcoes={[["", "Escolher…"], ...(f.type === "adjust" ? MOTIVOS_AJUSTE : MOTIVOS_QUEBRA).map((r) => [r, r] as const)]} /> : null}
      <Texto rotulo="Documento (opcional)" valor={f.doc} aoMudar={(v) => mudar({ doc: v })} atributos={{ placeholder: "Ex.: guia, fatura" }} />
      <Texto rotulo="Notas" valor={f.note} aoMudar={(v) => mudar({ note: v })} />
    </div>
  );
}

/** O corpo do passo 2: a descrição do tipo, os campos e as linhas. */
export function PassoDois({ f, mudar, leitor, aoLeitor }: { f: EstadoMov; mudar: Mudar; leitor: number | null; aoLeitor: (i: number) => void }) {
  const T = TIPOS_REGISTO.find((t) => t.id === f.type);
  return (
    <>
      <div className="row between"><span className="muted">{T?.desc}</span><button type="button" className="link" onClick={() => mudar({ passo: 1, resultado: null })}>Mudar tipo</button></div>
      <Campos f={f} mudar={mudar} />
      <div className="stack" style={{ gap: 8 }}>
        {f.linhas.map((_, i) => <LinhaCampos key={i} f={f} i={i} mudar={mudar} leitor={leitor === i} aoLeitor={() => aoLeitor(i)} />)}
        <div><button type="button" className="btn btn-sm" onClick={() => mudar({ linhas: [...f.linhas, { p: "", qty: 1, cost: "" }] })}><Plus className="ic" aria-hidden="true" />Adicionar linha</button></div>
      </div>
    </>
  );
}

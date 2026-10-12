// "Receber" numa PO e "Não vou receber o resto" (receivePO, rvHtml e rvGo do mockup): quantidades por linha (nunca mais do que falta), a repartição entre a EC e o stock à vista,
// guia opcional e, se não se vai receber o resto, o motivo (e a nota se for "Outro"). Receber e anular o resto acontecem juntos ou nenhum.
import { useState } from "react";
import { Check as Visto, ScanLine } from "lucide-react";
import { HOJE, nomeProd, poPorId, un } from "./base";
import { Fonte } from "./cabInv";
import { useCtxInv } from "./ctxInv";
import { Dlg } from "./DialogosInv";
import { repartirRececao } from "./ec";
import { Check } from "./mockPecas";
import { opcoesArmazens } from "./opcoes";
import { Lista, Nota, Notas, Pri, Sec, Selo, Texto } from "./pecasInv";
import { can, porqueNao } from "./perfil";
import { poRem, poUnits } from "./po";
import { fixarRececao } from "./rececao";
import { MOTIVOS_RESTO, anularResto, receberLinhas, type ResultadoRececao } from "./receber";
import { TabelaInv } from "./TabelaInv";
import type { Po, PoLinha } from "./tipos";

interface LinhaRec { id: string; now: number; close: boolean }
interface Estado { wh: string; date: string; guia: string; linhas: LinhaRec[]; todo: boolean; reason: string; note: string; erro: string }
type Repart = ReturnType<typeof repartirRececao>;
interface Item { l: PoLinha; v: LinhaRec; sp: Repart; i: number }

function inicio(p: Po, soResto: boolean): Estado {
  return { wh: p.wh, date: HOJE, guia: "", todo: soResto, reason: "", note: "", erro: "", linhas: p.lines.map((l) => ({ id: l.id, now: soResto ? 0 : Math.max(0, poRem(l)), close: soResto && poRem(l) > 0 })) };
}

function Passo({ item, aoMudar }: { item: Item; aoMudar: (n: number) => void }) {
  const { l, v } = item;
  const { db } = useCtxInv();
  const rem = poRem(l), nome = nomeProd(db, l.sku);
  return (
    <>
      <div className="stepper">
        <button type="button" aria-label="Menos" onClick={() => aoMudar(Math.max(0, Math.min(rem, v.now - 1)))}>−</button>
        <input type="number" inputMode="numeric" min={0} max={rem} step={1} value={v.now} aria-label={`Receber agora ${nome}`}
          onChange={(e) => { const n = parseInt(e.target.value, 10); aoMudar(Math.max(0, Math.min(rem, isNaN(n) ? 0 : n))); }} />
        <button type="button" aria-label="Mais" onClick={() => aoMudar(Math.max(0, Math.min(rem, v.now + 1)))}>+</button>
      </div>
      <br /><small className="muted">faltam {rem} un</small>
    </>
  );
}

function TabelaLinhas({ p, f, soResto, mudarLinha, mudarClose }: { p: Po; f: Estado; soResto: boolean; mudarLinha: (i: number, n: number) => void; mudarClose: (i: number, c: boolean) => void }) {
  const { db } = useCtxInv();
  const itens: Item[] = p.lines.map((l, i) => ({ l, v: f.linhas[i], sp: repartirRececao(db, l, f.linhas[i].now), i }));
  return (
    <TabelaInv titulo="Linhas a receber" minimo={900} linhas={itens} chave={(x) => x.l.id} colunas={[
      { id: "p", titulo: "Produto", celula: ({ l }) => <>{nomeProd(db, l.sku)}<br /><small className="muted mono">{l.sku}</small></> },
      { id: "e", titulo: "Encomendada", direita: true, celula: ({ l }) => <>{un(poUnits(l))}<br /><small className="muted">{l.packs} × {l.unitLabel}</small></> },
      { id: "r", titulo: "Já recebida", direita: true, celula: ({ l }) => <>{l.recv}{l.cancelled ? <><br /><small className="muted">anuladas {l.cancelled}</small></> : null}</> },
      { id: "a", titulo: soResto ? "Receber agora" : "Receber agora (un)", celula: (x) => (soResto ? "—" : poRem(x.l) > 0 ? <Passo item={x} aoMudar={(n) => mudarLinha(x.i, n)} /> : <Selo tom="ok">Completa</Selo>) },
      { id: "s", titulo: "Repartição", celula: ({ v, sp }) => (
        <div className="split">
          {v.now ? <>{sp.toEC ? <span className="to-ec">{sp.toEC} → {sp.ec}</span> : null}{sp.toStock ? <span className="to-st">{sp.toStock} → stock</span> : null}</> : <span className="muted">—</span>}
          {sp.inactive ? <span className="badge b-warn">EC {sp.ec} inativa: vai para stock</span> : null}
        </div>) },
      { id: "x", titulo: "Resto", celula: ({ l, v, i }) => (poRem(l) - v.now > 0 ? <Check rotulo={`Não vou receber o resto (${poRem(l) - v.now})`} ativo={v.close} aoMudar={(c) => mudarClose(i, c)} /> : null) },
    ]} />
  );
}

function MotivoResto({ f, mudar }: { f: Estado; mudar: (x: Partial<Estado>) => void }) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }} className="stack">
      <legend className="fl" style={{ marginBottom: 6 }}>Motivo <b className="req">*</b></legend>
      <div className="row">{MOTIVOS_RESTO.map((m) => <label key={m} className="check"><input type="radio" name="rv-r" checked={f.reason === m} onChange={() => mudar({ reason: m })} /> {m}</label>)}</div>
      <Notas rotulo={"Nota" + (f.reason === "Outro" ? " (obrigatória)" : "")} valor={f.note} aoMudar={(v) => mudar({ note: v })} linhas={2} />
    </fieldset>
  );
}

/** O aviso depois de confirmar (toast do mockup): o que serviu Encomendas Clientes, o que entrou no stock, e se o resto foi anulado. */
function textoRececao(out: ResultadoRececao | null, anulou: boolean): string {
  if (!out) return "Resto anulado. Pode desfazer em Anulações.";
  const ec = out.res.reduce((a, r) => a + r.toEC, 0), st = out.res.reduce((a, r) => a + r.toStock, 0);
  return "Receção registada: " + (ec ? ec + " un servem Encomendas Clientes · " : "") + st + " un entraram no stock (custo médio atualizado)." + (anulou ? " Resto anulado." : "");
}

export function ReceberDialogo({ aberto, aoFechar, id, soResto = false }: { aberto: boolean; aoFechar: () => void; id: string; soResto?: boolean }) {
  const { db, agir, ir } = useCtxInv();
  const p = poPorId(db, id);
  const [f, setF] = useState<Estado | null>(() => (p ? inicio(p, soResto) : null));
  if (!p || !f) return null;
  const mudar = (x: Partial<Estado>): void => setF((e) => (e ? { ...e, ...x, erro: "" } : e));
  const linhas = (fn: (v: LinhaRec, i: number) => LinhaRec): void => mudar({ linhas: f.linhas.map(fn) });
  const ids = f.linhas.filter((v, i) => v.close && poRem(p.lines[i]) - v.now > 0).map((v) => v.id);
  const rep = p.lines.map((l, i) => repartirRececao(db, l, f.linhas[i].now));
  const tN = f.linhas.reduce((a, v) => a + v.now, 0), tEC = rep.reduce((a, r) => a + r.toEC, 0), tSt = rep.reduce((a, r) => a + r.toStock, 0);
  const pode = can(soResto ? "purchase_orders.manage" : "inventory.receive");
  const confirmar = (): void => {
    const itens = f.linhas.filter((v) => v.now > 0).map((v) => ({ lineId: v.id, qty: v.now }));
    const erro = ids.length && !f.reason ? "Escolha o motivo para não receber o resto."
      : ids.length && f.reason === "Outro" && f.note.trim().length < 3 ? "Com motivo “Outro”, escreva uma nota (mínimo 3 caracteres)."
      : !itens.length && !ids.length ? "Indique quantidades a receber ou marque o resto a anular." : "";
    if (erro) { setF({ ...f, erro }); return; }
    const r = agir((d) => {
      const po = poPorId(d, id) as Po;
      const out = itens.length ? receberLinhas(d, po, itens, f.wh, f.guia || null, { date: f.date }) : null;
      if (ids.length) anularResto(d, po, ids, f.reason, f.note);
      return out;
    }, (out) => textoRececao(out, ids.length > 0));
    if (r.ok) aoFechar(); else setF({ ...f, erro: r.erro });
  };
  const porCodigo = (): void => { agir((d) => fixarRececao(d, { sup: p.sup, poFilter: id, wh: f.wh })); aoFechar(); ir({ aba: "guia" }); };
  return (
    <Dlg aberto={aberto} aoFechar={aoFechar} largo titulo={(soResto ? "Não vou receber o resto — " : "Receber ") + p.id}
      rodape={<><span className="left muted">{soResto ? "" : `${tN} un a receber`}</span><Sec onClick={aoFechar}>Cancelar</Sec>
        <Pri disabled={!pode} title={pode ? undefined : porqueNao(soResto ? "purchase_orders.manage" : "inventory.receive")} onClick={confirmar}>{soResto ? "Anular resto" : <><Visto className="ic" aria-hidden="true" />{"Confirmar receção" + (ids.length ? " e anular resto" : "")}</>}</Pri></>}>
      {!soResto && (
        <>
          <div className="fg">
            <Lista rotulo="Armazém de destino" valor={f.wh} aoMudar={(v) => mudar({ wh: v })} opcoes={opcoesArmazens(db)} obrigatorio />
            <Texto rotulo="Data real de entrega" tipo="date" valor={f.date} aoMudar={(v) => mudar({ date: v })} atributos={{ max: HOJE }} />
            <Lista rotulo="Guia do fornecedor (opcional)" valor={f.guia} aoMudar={(v) => mudar({ guia: v })} opcoes={[["", "Sem guia"], ...db.guias.filter((g) => g.state === "open" && g.sup === p.sup).map((g) => [g.id, g.id] as const)]} ajuda="Nova guia: em Armazém › Receção." />
          </div>
          <div className="row between">
            <div className="row">
              <Sec className="btn-sm" onClick={() => linhas((v, i) => ({ ...v, now: Math.max(0, poRem(p.lines[i])) }))}>Selecionar tudo</Sec>
              <Sec className="btn-sm btn-ghost" onClick={() => linhas((v) => ({ ...v, now: 0 }))}>Limpar</Sec>
            </div>
            <button type="button" className="link" onClick={porCodigo}><ScanLine className="ic sm" aria-hidden="true" /> Abrir receção por código (filtrada por esta PO)</button>
          </div>
        </>
      )}
      <TabelaLinhas p={p} f={f} soResto={soResto} mudarLinha={(i, n) => linhas((v, j) => (j === i ? { ...v, now: n } : v))} mudarClose={(i, c) => linhas((v, j) => (j === i ? { ...v, close: c } : v))} />
      {!soResto && <Nota tom="info">Pré-visualização: <b>{tN} un</b> · <span className="to-ec" style={{ padding: "0 4px", borderRadius: 4 }}>{tEC} para Encomendas Clientes</span> (ficam reservadas e servem a EC) · <span className="to-st" style={{ padding: "0 4px", borderRadius: 4 }}>{tSt} para stock</span> (livres, custo médio atualizado). Quantidades inteiras; nunca mais do que falta.</Nota>}
      <div className="card pad stack" style={{ boxShadow: "none" }}>
        <label className="check"><input type="checkbox" checked={f.todo} onChange={(e) => mudar({ todo: e.target.checked, linhas: f.linhas.map((v, i) => ({ ...v, close: e.target.checked && poRem(p.lines[i]) - v.now > 0 })) })} /> <b>Não vou receber o resto</b> de toda a encomenda</label>
        {ids.length ? <MotivoResto f={f} mudar={mudar} /> : <span className="muted" style={{ fontSize: 12.5 }}>Marque linhas em “Resto” ou toda a encomenda para anular o que falta. Pode desfazer depois em Anulações.</span>}
      </div>
      {f.erro && <Nota tom="bad" alerta>{f.erro}</Nota>}
      <Fonte>rpc_preview_po_receipt · rpc_receive_purchase_order_lines · fn_po_receipt_allocation · rpc_cancel_po_line_remainder</Fonte>
    </Dlg>
  );
}

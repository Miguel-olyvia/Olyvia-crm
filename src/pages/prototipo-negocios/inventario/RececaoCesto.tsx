// O interior do telemóvel da receção, por baixo da leitura: as leituras pendentes (sem rede, não aceites, por enviar, por confirmar), o cesto com a repartição
// por PO, os erros, notas e avisos do plano, o resultado e o que se recebeu nesta sessão. DOM e textos do mockup (função scrRec).
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check as Visto, Info, RefreshCw, X } from "lucide-react";
import { agora, fmtDT, nomeProd, produto, proximoId } from "./base";
import { useCtxInv } from "./ctxInv";
import { executar } from "./loja";
import { Ligacao } from "./pecasInv";
import { poRem } from "./po";
import { adicionarAoCesto, candidatas, lerCodigo, mudarQuantidade, type AvisoRec, type ItemPlano, type PlanoRececao } from "./rececao";
import type { CestoItem, Inventario, Recepcao } from "./tipos";

export const SEM_REDE = "Sem rede: desligue “Simular falha de rede”";
export const MODO_CONSULTA = "Modo consulta: requer inventory.receive. Peça acesso a um administrador.";
/** Os atributos de um controlo desativado pelo modo consulta. */
export const bloqueio = (ro: boolean): { disabled?: boolean; title?: string } => (ro ? { disabled: true, title: MODO_CONSULTA } : {});

/** Corre uma ação sobre a receção e mostra o que ela diz (o aviso do contexto); uma regra recusada aparece como erro. */
export function useRecAcao(): (fn: (db: Inventario) => AvisoRec | void) => void {
  const { avisar } = useCtxInv();
  return useCallback((fn) => {
    const r = executar(fn);
    if (!r.ok) avisar(r.erro, true); else if (r.valor) avisar(r.valor.texto, !!r.valor.erro);
  }, [avisar]);
}

/** A quantidade de um item do cesto: o campo aceita escrever (só grava inteiros ≥ 1) e acompanha os botões − e +. */
function Quantidade({ k, qty, ro }: { k: number; qty: number; ro: boolean }) {
  const correr = useRecAcao();
  const [rascunho, setRascunho] = useState(String(qty));
  useEffect(() => { if (parseInt(rascunho, 10) !== qty) setRascunho(String(qty)); }, [qty]); // eslint-disable-line react-hooks/exhaustive-deps
  const dis = bloqueio(ro);
  return (
    <div className="stepper">
      <button type="button" {...dis} aria-label="Menos" onClick={() => correr((d) => mudarQuantidade(d, k, d.rc.basket[k].qty - 1))}>−</button>
      <input type="number" min={1} step={1} value={rascunho} {...dis} aria-label="Quantidade" onChange={(e) => { setRascunho(e.target.value); const n = parseInt(e.target.value, 10); if (!isNaN(n) && n >= 1) correr((d) => mudarQuantidade(d, k, n)); }} />
      <button type="button" {...dis} aria-label="Mais" onClick={() => correr((d) => mudarQuantidade(d, k, d.rc.basket[k].qty + 1))}>+</button>
    </div>
  );
}

function ItemCesto({ b, k, x, ro }: { b: CestoItem; k: number; x: ItemPlano; ro: boolean }) {
  const { db } = useCtxInv();
  const correr = useRecAcao();
  const dis = bloqueio(ro);
  const p = produto(db, b.sku);
  const cands = candidatas(db, b.sku);
  return (
    <div className="bitem">
      <div className="top"><div><b>{nomeProd(db, b.sku)}</b><div className="mini mono">{b.sku} · EAN {p?.ean}</div></div><Quantidade k={k} qty={b.qty} ro={ro} /></div>
      <div className="split">
        {x.allocs.map((a, i) => <span key={a.l.id + i}>{i > 0 ? " " : ""}<span className="mono" style={{ fontSize: 11.5 }}>{a.p.id.replace("PO-2026-", "PO-")}</span>{a.toEC ? <span className="to-ec">{a.toEC} para {a.ec}</span> : null}{a.toStock ? <span className="to-st">{a.toStock} para stock</span> : null}</span>)}
        {x.rest ? <span className="badge b-bad">{x.rest} sem encomenda</span> : null}
      </div>
      <details><summary className="mini" style={{ cursor: "pointer" }}>Escolher linha de encomenda (avançado)</summary>
        <select style={{ width: "100%", marginTop: 4 }} {...dis} value={b.line} aria-label="Linha de encomenda" onChange={(e) => correr((d) => { d.rc.basket[k].line = e.target.value; })}>
          <option value="">Automático (FIFO por data da encomenda)</option>
          {cands.map(([po, l]) => <option key={l.id} value={`${po.id}|${l.id}`}>{po.id} · faltam {poRem(l)}{l.ec ? " · " + l.ec : ""}</option>)}
        </select>
      </details>
      <div className="row" style={{ gap: 6 }}>
        <button type="button" className="btn btn-xs" {...dis} onClick={() => correr((d) => { d.rc.toSend.push({ sku: b.sku, qty: b.qty, at: agora(d) }); d.rc.basket.splice(k, 1); })}>Pôr de parte</button>
        <button type="button" className="btn btn-xs btn-ghost" {...dis} onClick={() => correr((d) => { d.rc.basket.splice(k, 1); })}>Remover</button>
      </div>
    </div>
  );
}

export function Pendentes({ rc, ro, aoAprender, aoVarios }: { rc: Recepcao; ro: boolean; aoAprender: (k: number) => void; aoVarios: (code: string, skus: string[]) => void }) {
  const { db, avisar } = useCtxInv();
  const correr = useRecAcao();
  const dis = bloqueio(ro);
  const semRede = !rc.net ? { disabled: true, title: SEM_REDE } : dis;
  const n = rc.queued.length + rc.toSend.length + rc.toConfirm.length + rc.rejected.length;
  const processar = (): void => {
    const r = executar((d) => { const q = d.rc.queued.splice(0); return q.map((x) => lerCodigo(d, x.code)); });
    if (!r.ok) { avisar(r.erro, true); return; }
    const varios = r.valor.find((v) => v?.t === "varios");
    if (varios?.t === "varios") aoVarios(varios.code, varios.skus);
    const aviso = [...r.valor].reverse().find((v) => v?.t === "aviso");
    if (aviso?.t === "aviso") avisar(aviso.aviso.texto, !!aviso.aviso.erro);
  };
  if (!n) return null;
  return (
    <details className="cardlet" open={!!rc.openPend} onToggle={(e) => { const aberto = e.currentTarget.open; if (aberto !== !!rc.openPend) correr((d) => { d.rc.openPend = aberto; }); }}>
      <summary style={{ cursor: "pointer", fontWeight: 650 }}>{n} pendente(s) ▸</summary>
      <div className="stack" style={{ gap: 8, marginTop: 8 }}>
        {rc.queued.length > 0 && <div><b className="mini">Leituras por processar (falha de rede)</b>{rc.queued.map((x, i) => <div key={i} className="mini">{x.code} · {fmtDT(x.at)}</div>)}<button type="button" className="btn btn-xs" {...semRede} onClick={processar}>Processar agora</button></div>}
        {rc.rejected.length > 0 && <div><b className="mini">Leituras não aceites</b>{rc.rejected.map((x, k) => (
          <div key={k} className="row" style={{ gap: 6 }}><span className="mini mono grow">{x.code}</span>
            <button type="button" className="btn btn-xs" {...dis} onClick={() => aoAprender(k)}>Associar a um produto</button>
            <button type="button" className="btn btn-xs btn-ghost" {...dis} onClick={() => correr((d) => { d.rc.rejected.splice(k, 1); })}>Dispensar</button></div>))}</div>}
        {rc.toSend.length > 0 && <div><b className="mini">Por enviar</b>{rc.toSend.map((x, k) => (
          <div key={k} className="row" style={{ gap: 6 }}><span className="mini grow">{x.qty}× {nomeProd(db, x.sku)}</span>
            <button type="button" className="btn btn-xs" {...dis} onClick={() => correr((d) => { const [y] = d.rc.toSend.splice(k, 1); adicionarAoCesto(d, y.sku, y.qty); })}>Voltar ao cesto</button>
            <button type="button" className="btn btn-xs btn-ghost" {...dis} onClick={() => correr((d) => { d.rc.toSend.splice(k, 1); })}>Dispensar</button></div>))}</div>}
        {rc.toConfirm.length > 0 && <div><b className="mini">Receção por confirmar</b>{rc.toConfirm.map((x, k) => (
          <div key={k} className="row" style={{ gap: 6 }}><span className="mini grow">{x.items.map((i) => `${i.qty}× ${i.sku}`).join(", ")} · {x.err}</span>
            <button type="button" className="btn btn-xs" {...semRede} onClick={() => correr((d) => { const [y] = d.rc.toConfirm.splice(k, 1); y.items.forEach((i) => d.rc.basket.push({ key: proximoId(d, "B"), sku: i.sku, qty: i.qty, line: "" })); })}>Tentar de novo</button>
            <button type="button" className="btn btn-xs btn-ghost" {...dis} onClick={() => correr((d) => { d.rc.toConfirm.splice(k, 1); })}>Descartar</button></div>))}</div>}
      </div>
    </details>
  );
}

const EXEMPLOS: readonly [string, string][] = [["5601234000028", ""], ["CS-6", ""], ["CX-10", " (2 produtos)"], ["999", " (desconhecido)"]];

/** O cesto (ou a dica para começar), com o plano por baixo: erros, notas, avisos a confirmar e o resultado. */
export function Cesto({ rc, plano, ro }: { rc: Recepcao; plano: PlanoRececao; ro: boolean }) {
  const { abrir } = useCtxInv();
  const correr = useRecAcao();
  const dis = bloqueio(ro);
  const ler = (code: string): void => correr((d) => { const r = lerCodigo(d, code); return r?.t === "aviso" ? r.aviso : undefined; });
  return (
    <>
      <div className="row between"><b>Cesto ({rc.basket.length})</b><button type="button" className="btn btn-xs" onClick={() => correr(() => undefined)}><RefreshCw className="ic sm" aria-hidden="true" />Recalcular</button></div>
      {rc.basket.length ? rc.basket.map((b, k) => <ItemCesto key={b.key} b={b} k={k} x={plano.items[k]} ro={ro} />) : (
        <p className="mini">Leia um código para começar. Experimente: {EXEMPLOS.map(([c, nota], i) => <span key={c}>{i > 0 ? (i === EXEMPLOS.length - 1 ? " ou " : ", ") : ""}<button type="button" className="link" {...dis} onClick={() => ler(c)}>{c}</button>{nota}</span>)}.</p>
      )}
      {plano.errors.map((m) => <div key={m} className="alert bad" style={{ padding: "6px 10px" }}><X className="ic sm" aria-hidden="true" /><span>{m}</span></div>)}
      {plano.infos.map((m) => <div key={m} className="alert info" style={{ padding: "6px 10px" }}><Info className="ic sm" aria-hidden="true" /><span>{m}</span></div>)}
      {plano.warns.length > 0 && (
        <div className="alert warn" style={{ padding: "8px 10px", flexDirection: "column", gap: 4 }}>
          {plano.warns.map((m) => <span key={m}><AlertTriangle className="ic sm" aria-hidden="true" /> {m}</span>)}
          <label className="check"><input type="checkbox" checked={rc.ack} {...dis} onChange={(e) => correr((d) => { d.rc.ack = e.target.checked; })} /> Confirmo que recebo mesmo assim</label>
        </div>
      )}
      {rc.result && (
        <div className="alert ok" style={{ flexDirection: "column", gap: 4 }}><Visto className="ic" aria-hidden="true" /><b>Recebido: {rc.result.n} un</b>
          {Object.entries(rc.result.ec).map(([k, v]) => <span key={k}>{v} un servem <Ligacao aoClicar={() => abrir({ t: "ec", id: k })}>{k}</Ligacao> (prontas a sair)</span>)}
          {rc.result.st ? <span>{rc.result.st} un entraram no stock livre</span> : null}
          {rc.result.avg.map((a) => <small key={a}>{a}</small>)}
        </div>
      )}
      {rc.session.length > 0 && (
        <details className="cardlet"><summary style={{ cursor: "pointer", fontWeight: 650 }}>Recebido nesta sessão ({rc.session.length})</summary>
          {rc.session.slice(0, 12).map((x, i) => <div key={i} className="mini">{fmtDT(x.at).slice(11)} · {x.t}</div>)}
        </details>
      )}
    </>
  );
}

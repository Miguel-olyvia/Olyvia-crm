// As abas da folha de uma PO: Linhas (editáveis com as regras da encomenda), Receções, Guias, Portal, Anulações, Notas e Histórico.
import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Campo, numero } from "../pecas";
import { CAMPO, Lista, Ligacao, Nota, Notas, Pri, Sec, Selo, Vazio } from "./pecasInv";
import { ecPorId, eur, un, fmtD, fmtDT, guiaPorId, nomeArm, nomeProd, produto, somarDias } from "./base";
import { useCtxInv } from "./ctxInv";
import { opcoesArmazens, opcoesArtigosDe } from "./opcoes";
import { aceitarDataPrometida, adicionarLinhaPo, editarCabecalhoPo, editarPacksLinha, gravarNotasPo, motivoBloqueioPo, poLocked, poOpen, poPublished, poTotals, poUnits, portalConfirmar, portalVista, removerLinhaPo } from "./po";
import { desfazerAnulacao, passarParaStock } from "./receber";
import { resumoGuia, GUIA_ESTADOS } from "./guias";
import { TabelaInv } from "./TabelaInv";
import type { Inventario, Po, PoLinha } from "./tipos";

export type DlgPo = { t: "retirar" } | { t: "reverter"; rid: string } | { t: "receber" } | { t: "resto" } | { t: "enviar" } | { t: "eliminar" };
interface P { p: Po; pedir: (d: DlgPo) => void }
const poDe = (d: Inventario, id: string): Po => d.pos.find((x) => x.id === id) as Po;

/** O motivo do bloqueio e o que fazer para o levantar (o botão leva à ação dentro da regra). */
function Bloqueio({ p, pedir }: P) {
  const { agir } = useCtxInv();
  const m = motivoBloqueioPo(p);
  if (!m) return null;
  return (
    <Nota tom="warn"><b>{m}.</b>{" "}
      {p.deleted ? <Sec onClick={() => agir((d) => { poDe(d, p.id).deleted = false; }, `${p.id} restaurada.`)}>Restaurar</Sec>
        : poLocked(p) ? <Sec onClick={() => pedir({ t: "retirar" })}>Retirar do portal para editar</Sec> : null}
    </Nota>
  );
}

export function TabLinhas({ p, pedir }: P) {
  const { db, agir } = useCtxInv();
  const [novo, setNovo] = useState("");
  const [tick, setTick] = useState(0);
  const bloq = motivoBloqueioPo(p);
  const editavel = !bloq;
  const t = poTotals(p);
  const gravar = <T,>(fn: (d: Inventario) => T, ok: string): void => { if (!agir(fn, ok).ok) setTick((x) => x + 1); };
  const cols = [
    { id: "sku", titulo: "SKU / Ref.", celula: (l: PoLinha) => <>{l.sku} · {db.items.find((i) => i.id === l.itemId)?.ref}</> },
    { id: "desc", titulo: "Descrição", celula: (l: PoLinha) => <>{nomeProd(db, l.sku)}{l.ec ? <span className="block text-muted-foreground">para {l.ec} ({l.ecUnits} un) · resto para stock</span> : null}</> },
    { id: "qtd", titulo: "Embalagens", celula: (l: PoLinha) => (
      <span className="grid gap-1">
        {editavel ? <Campo id={`pq-${l.id}-${tick}`} type="number" min="1" step="1" value={l.packs} ariaLabel={`Embalagens de ${nomeProd(db, l.sku)}`} className="h-11 w-24 rounded-md border border-[hsl(220_10%_45%)] bg-card px-2 text-right"
          onCommit={(v) => gravar((d) => editarPacksLinha(d, poDe(d, p.id), l.id, numero(v)), "Linha gravada.")} /> : <b>{l.packs}</b>}
        <span className="text-muted-foreground">= {un(poUnits(l))}{l.recv || l.cancelled ? ` · recebidas ${l.recv}${l.cancelled ? ` · anuladas ${l.cancelled}` : ""}` : ""}</span>
      </span>) },
    { id: "emb", titulo: "Unidade / embalagem", celula: (l: PoLinha) => <>{l.unitLabel}<span className="block text-muted-foreground">{l.packN} {produto(db, l.sku)?.unit} por embalagem</span></> },
    { id: "pr", titulo: "Preço", direita: true, celula: (l: PoLinha) => <>{eur(l.price)}{l.packN > 1 ? <span className="block text-muted-foreground">{eur(l.price / l.packN)}/un</span> : null}</> },
    { id: "iva", titulo: "IVA", direita: true, celula: (l: PoLinha) => `${l.iva} %` },
    { id: "tot", titulo: "Total", direita: true, celula: (l: PoLinha) => eur(l.packs * l.price) },
  ];
  return (
    <div className="grid gap-4">
      <Bloqueio p={p} pedir={pedir} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Lista rotulo="Entregar em" valor={p.wh} desativado={!editavel} aoMudar={(v) => gravar((d) => editarCabecalhoPo(d, poDe(d, p.id), "wh", v), "Armazém de entrega gravado.")} opcoes={opcoesArmazens(db, true)} />
        <label className="text-[15px] text-muted-foreground">Data da encomenda<input type="date" readOnly value={p.date} className={CAMPO + " text-foreground"} /></label>
        <label className="text-[15px] text-muted-foreground">Entrega prevista<input type="date" key={p.due + tick} defaultValue={p.due} disabled={!editavel} onBlur={(e) => { if (e.target.value && e.target.value !== p.due) gravar((d) => editarCabecalhoPo(d, poDe(d, p.id), "due", e.target.value), "Entrega prevista gravada."); }} className={CAMPO + " text-foreground"} /></label>
      </div>
      {editavel && (
        <div className="flex flex-wrap items-end gap-2">
          <Lista className="min-w-0 flex-1 basis-60" rotulo="Acrescentar artigo do fornecedor" valor={novo} aoMudar={setNovo} opcoes={[["", "Escolher artigo…"], ...opcoesArtigosDe(db, p.sup)]} />
          <Sec disabled={!novo} onClick={() => { gravar((d) => adicionarLinhaPo(d, poDe(d, p.id), novo), `${nomeProd(db, novo)} adicionado.`); setNovo(""); }}>Adicionar</Sec>
        </div>
      )}
      {p.lines.length === 0 ? <Vazio titulo="Sem linhas" texto="Escolha um artigo do fornecedor para adicionar." /> : (
        <TabelaInv rolar titulo="Linhas da encomenda" colunas={cols} linhas={p.lines} chave={(l) => l.id}
          acoes={editavel ? (l) => (!l.recv && !l.ecLine ? <Sec aria-label={`Remover a linha de ${nomeProd(db, l.sku)}`} onClick={() => gravar((d) => removerLinhaPo(d, poDe(d, p.id), l.id), "Linha removida.")}><Trash2 className="h-4 w-4" aria-hidden="true" /></Sec> : null) : undefined} />
      )}
      <dl className="ml-auto grid w-full max-w-xs grid-cols-2 gap-x-4 text-[15px] tabular-nums"><dt>Subtotal</dt><dd className="text-right">{eur(t.sub)}</dd><dt>IVA</dt><dd className="text-right">{eur(t.iva)}</dd><dt className="font-semibold">Total</dt><dd className="text-right font-semibold">{eur(t.total)}</dd></dl>
    </div>
  );
}

export function TabRececoes({ p, pedir }: P) {
  const { db, agir, abrir } = useCtxInv();
  if (!p.receipts.length) return <Vazio titulo="Sem receções" texto={poOpen(p) ? "Use «Receber» para registar a chegada da mercadoria." : ""} />;
  const rows = p.receipts.slice().reverse();
  return (
    <div className="grid gap-3">
      <TabelaInv rolar titulo="Receções" chave={(r) => r.id} linhas={rows}
        colunas={[
          { id: "at", titulo: "Data", celula: (r) => fmtDT(r.at) }, { id: "sku", titulo: "Linha", celula: (r) => nomeProd(db, r.sku) }, { id: "t", titulo: "Tipo", celula: (r) => r.type },
          { id: "q", titulo: "Qtd", direita: true, celula: (r) => r.qty }, { id: "ec", titulo: "Para EC", direita: true, celula: (r) => (r.toEC ? `${r.toEC} · ${r.ec}` : "—") },
          { id: "st", titulo: "Para stock", direita: true, celula: (r) => r.toStock }, { id: "wh", titulo: "Armazém", celula: (r) => nomeArm(db, r.wh) },
          { id: "g", titulo: "Guia", celula: (r) => (r.guia && guiaPorId(db, r.guia) ? <Ligacao aoClicar={() => abrir({ t: "guia", id: r.guia as string })}>{r.guia}</Ligacao> : (r.guia ?? "—")) },
          { id: "e", titulo: "Estado", celula: (r) => <Selo tom={r.state === "Ativa" ? "ok" : "neu"}>{r.state}{r.reason ? ` · ${r.reason}` : ""}</Selo> },
        ]}
        acoes={(r) => {
          const e = r.ec ? ecPorId(db, r.ec) : undefined;
          return <>
            {r.state === "Ativa" && r.type === "Receção" && <Sec onClick={() => pedir({ t: "reverter", rid: r.id })}>Reverter receção</Sec>}
            {r.state === "Ativa" && r.toEC > 0 && !r.released && r.type === "Receção" && <Sec disabled={!!e && !e.deleted} title={e && !e.deleted ? "Só com a Encomenda Cliente inativa" : undefined} onClick={() => agir((d) => passarParaStock(d, poDe(d, p.id), r.id), "Passado para stock.")}>Passar para stock</Sec>}
          </>;
        }} />
      <p className="text-[15px] text-muted-foreground">Nunca mais do que falta. Reverter exige motivo (≥3 caracteres) e falha se as unidades já saíram para o cliente. "Passar para stock" só com a Encomenda Cliente inativa.</p>
    </div>
  );
}

export function TabGuias({ p }: { p: Po }) {
  const { db, abrir } = useCtxInv();
  const gs = db.guias.filter((g) => g.pos.includes(p.id));
  if (!gs.length) return <Vazio titulo="Sem guias ligadas" texto="A guia do fornecedor liga-se na receção." />;
  return (
    <TabelaInv titulo="Guias da encomenda" chave={(g) => g.id} linhas={gs} abrir={(g) => abrir({ t: "guia", id: g.id })}
      colunas={[
        { id: "id", titulo: "Nº guia", celula: (g) => g.id }, { id: "d", titulo: "Data", celula: (g) => fmtD(g.date) },
        { id: "ar", titulo: "Anunciado / Recebido", celula: (g) => `${resumoGuia(db, g).annT} / ${resumoGuia(db, g).recT}` },
        { id: "dv", titulo: "Divergências", celula: (g) => <Selo tom={resumoGuia(db, g).div ? "bad" : "ok"}>{resumoGuia(db, g).div ? `${resumoGuia(db, g).div} divergência(s)` : "Sem divergências"}</Selo> },
        { id: "e", titulo: "Estado", celula: (g) => GUIA_ESTADOS[g.state] },
      ]} />
  );
}

export function TabPortal({ p, pedir }: P) {
  const { db, agir } = useCtxInv();
  const [prom, setProm] = useState(somarDias(p.due, 2));
  const x = p.portal, s = db.suppliers.find((y) => y.id === p.sup);
  const estado = x.state === "none" ? "Não publicada" : x.state === "email" ? "Sem portal (email)" : x.state === "withdrawn" ? "Retirada" : x.state === "sent" ? "Publicada, por ver" : x.state === "seen" ? "Vista" : "Confirmada";
  return (
    <div className="grid gap-3">
      <dl className="grid gap-x-4 gap-y-2 text-[15px] sm:grid-cols-2">
        {([["Estado no portal", estado], ["Enviada", fmtDT(x.sent ?? p.sentAt)], ["Vista", fmtDT(x.seen)], ["Confirmada", fmtDT(x.confirmed)], ["Data prometida", x.promised ? fmtD(x.promised) + (p.promiseAccepted ? " (aceite)" : "") : "—"], ["Portal do fornecedor", s?.portal === "active" ? "Ativo" : "Sem portal ativo"]] as const).map(([a, b]) => <div key={a}><dt className="text-muted-foreground">{a}</dt><dd>{b}</dd></div>)}
      </dl>
      {x.comment && <Nota tom="info"><b>Comentário do fornecedor:</b> {x.comment}</Nota>}
      <div className="flex flex-wrap gap-2">
        {poPublished(p) && <Sec onClick={() => pedir({ t: "retirar" })}>Retirar do portal</Sec>}
        {x.state === "confirmed" && !p.promiseAccepted && poOpen(p) && <Sec onClick={() => agir((d) => aceitarDataPrometida(d, poDe(d, p.id)), "Data prometida aceite.")}>Aceitar data prometida</Sec>}
      </div>
      {poOpen(p) && s?.portal === "active" && ["sent", "seen"].includes(x.state) && (
        <fieldset className="grid gap-2 border-t border-border pt-3"><legend className="text-[15px] font-medium">Simular o lado do fornecedor</legend>
          <div className="flex flex-wrap items-end gap-2">
            {x.state === "sent" && <Sec onClick={() => agir((d) => portalVista(d, poDe(d, p.id)), "Fornecedor abriu a encomenda.")}>Fornecedor abre a encomenda</Sec>}
            <label className="text-[15px] text-muted-foreground">Data prometida<input type="date" value={prom} onChange={(e) => setProm(e.target.value)} className={CAMPO + " text-foreground"} /></label>
            <Sec onClick={() => agir((d) => portalConfirmar(d, poDe(d, p.id), prom, "Confirmado pelo portal (simulação)."), "Fornecedor confirmou.")}>Fornecedor confirma</Sec>
          </div>
        </fieldset>
      )}
    </div>
  );
}

export function TabAnulacoes({ p }: { p: Po }) {
  const { db, agir } = useCtxInv();
  const cs = p.cancels.slice().reverse();
  if (!cs.length) return <Vazio titulo="Sem anulações" texto="Quando não vai receber o resto de uma linha ou da encomenda, fica aqui registado e pode ser desfeito." />;
  const lotes = [...new Set(cs.filter((c) => !c.undone && !c.locked).map((c) => c.batch))];
  return (
    <div className="grid gap-3">
      <TabelaInv rolar titulo="Anulações" chave={(c) => c.id} linhas={cs}
        colunas={[
          { id: "at", titulo: "Data", celula: (c) => fmtDT(c.at) }, { id: "l", titulo: "Linha", celula: (c) => nomeProd(db, c.sku) }, { id: "q", titulo: "Qtd anulada", direita: true, celula: (c) => c.qty },
          { id: "m", titulo: "Motivo", celula: (c) => c.reason + (c.note ? ` · ${c.note}` : "") }, { id: "u", titulo: "Utilizador", celula: (c) => c.user },
          { id: "s", titulo: "Estado", celula: (c) => <Selo tom={c.undone ? "neu" : "warn"}>{c.undone ? "Desfeita" : "Ativa"}</Selo> },
        ]}
        acoes={(c) => (!c.undone && !c.locked ? <Sec onClick={() => agir((d) => desfazerAnulacao(d, poDe(d, p.id), c.id, false), "Anulação desfeita.")}>Desfazer</Sec> : null)} />
      {lotes.length > 0 && <div className="flex flex-wrap gap-2">{lotes.map((b) => { const c0 = cs.find((c) => c.batch === b)!; return <Sec key={b} onClick={() => agir((d) => desfazerAnulacao(d, poDe(d, p.id), c0.id, true), "Anulação desfeita.")}>Desfazer toda ({fmtDT(c0.at)})</Sec>; })}</div>}
      <p className="text-[15px] text-muted-foreground">Anular resto exige motivo; a Encomenda Cliente ligada reage sozinha (a parte anulada passa a "Em falta").</p>
    </div>
  );
}

export function TabNotas({ p }: { p: Po }) {
  const { agir } = useCtxInv();
  const [ni, setNi] = useState(p.notesInt), [ns, setNs] = useState(p.notesSup);
  return (
    <div className="grid gap-3">
      <Notas rotulo="Notas internas" valor={ni} aoMudar={setNi} linhas={5} ajuda="Só para a equipa." />
      <Notas rotulo="Notas para o fornecedor" valor={ns} aoMudar={setNs} linhas={5} maximo={2000} ajuda={`${ns.length}/2000 caracteres · aparece no PDF e no portal.`} />
      <div><Pri disabled={ni === p.notesInt && ns === p.notesSup} onClick={() => agir((d) => gravarNotasPo(poDe(d, p.id), ni, ns), "Notas gravadas.")}>Gravar notas</Pri></div>
    </div>
  );
}

export function TabHistorico({ p }: { p: Po }) {
  return <ol className="grid gap-1.5 pl-5 text-[15px]" style={{ listStyle: "decimal" }}>{p.log.slice().reverse().map((l, i) => <li key={i}><b>{fmtDT(l.at)}</b> — {l.t}</li>)}</ol>;
}


// "Receber" numa PO (e "Não vou receber o resto"): quantidades por linha (nunca mais do que falta), a repartição entre a EC e o stock à vista,
// guia opcional e, se não se vai receber o resto, o motivo (e a nota se for "Outro"). Receber e anular o resto acontecem juntos ou nenhum.
import { useState } from "react";
import { cn } from "@/lib/utils";
import { BORDA_CTRL } from "../PessoaLinha";
import { HOJE, nomeProd, poPorId, un } from "./base";
import { useCtxInv } from "./ctxInv";
import { Dlg } from "./DialogosInv";
import { repartirRececao } from "./ec";
import { opcoesArmazens } from "./opcoes";
import { Lista, Nota, Notas, Pri, Sec, Texto } from "./pecasInv";
import { poRem, poUnits } from "./po";
import { MOTIVOS_RESTO, anularResto, receberLinhas } from "./receber";
import type { Po, PoLinha } from "./tipos";

interface LinhaRec { id: string; now: number; close: boolean }
interface Estado { wh: string; date: string; guia: string; linhas: LinhaRec[]; todo: boolean; reason: string; note: string; erro: string }
type Repart = ReturnType<typeof repartirRececao>;

function inicio(p: Po, soResto: boolean): Estado {
  return { wh: p.wh, date: HOJE, guia: "", todo: soResto, reason: "", note: "", erro: "", linhas: p.lines.map((l) => ({ id: l.id, now: soResto ? 0 : Math.max(0, poRem(l)), close: soResto && poRem(l) > 0 })) };
}

const BTN = cn("h-11 w-11 cursor-pointer rounded-md border bg-card", BORDA_CTRL);
function Quantidade({ nome, v, rem, aoMudar }: { nome: string; v: number; rem: number; aoMudar: (n: number) => void }) {
  return (
    <label className="text-[15px]">Receber agora (un)
      <span className="mt-1 flex items-center gap-1">
        <button type="button" aria-label={`Menos, ${nome}`} onClick={() => aoMudar(Math.max(0, v - 1))} className={BTN}>−</button>
        <input type="number" inputMode="numeric" min={0} max={rem} step={1} value={v} onChange={(e) => aoMudar(Math.max(0, Math.min(rem, parseInt(e.target.value, 10) || 0)))} aria-label={`Receber agora ${nome}`} className={cn("h-11 w-24 rounded-md border bg-card px-2 text-center", BORDA_CTRL)} />
        <button type="button" aria-label={`Mais, ${nome}`} onClick={() => aoMudar(Math.min(rem, v + 1))} className={BTN}>+</button>
      </span>
    </label>
  );
}

function LinhaReceber({ l, v, sp, soResto, aoMudar }: { l: PoLinha; v: LinhaRec; sp: Repart; soResto: boolean; aoMudar: (x: Partial<LinhaRec>) => void }) {
  const { db } = useCtxInv();
  const rem = poRem(l), nome = nomeProd(db, l.sku);
  return (
    <li className="grid gap-2 p-3">
      <p className="text-[15px]"><b>{nome}</b> · encomendado {un(poUnits(l))} ({l.packs} × {l.unitLabel}) · já recebido {l.recv}{l.cancelled ? ` · anulado ${l.cancelled}` : ""} · falta {rem}</p>
      <div className="flex flex-wrap items-center gap-3">
        {!soResto && (rem > 0 ? <Quantidade nome={nome} v={v.now} rem={rem} aoMudar={(n) => aoMudar({ now: n })} /> : <span className="text-[15px]">Completa</span>)}
        {!soResto && v.now > 0 && <span className="text-[15px]">{sp.toEC ? `${sp.toEC} → ${sp.ec} ` : ""}{sp.toStock ? `${sp.toStock} → stock` : ""}{sp.inactive ? ` · EC ${sp.ec} inativa: vai para stock` : ""}</span>}
        {rem - v.now > 0 && <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[15px]"><input type="checkbox" checked={v.close} onChange={(e) => aoMudar({ close: e.target.checked })} className="h-5 w-5 accent-foreground" />Não vou receber o resto ({rem - v.now})</label>}
      </div>
    </li>
  );
}

function MotivoResto({ f, mudar }: { f: Estado; mudar: (x: Partial<Estado>) => void }) {
  return (
    <fieldset className="grid gap-2"><legend className="text-[15px] font-medium">Motivo para não receber o resto <span aria-hidden="true">*</span></legend>
      <div className="flex flex-wrap gap-3">{MOTIVOS_RESTO.map((m) => <label key={m} className="flex min-h-11 cursor-pointer items-center gap-2 text-[15px]"><input type="radio" name="motivo-resto" checked={f.reason === m} onChange={() => mudar({ reason: m })} className="h-5 w-5 accent-foreground" />{m}</label>)}</div>
      <Notas rotulo={"Nota" + (f.reason === "Outro" ? " (obrigatória)" : "")} valor={f.note} aoMudar={(v) => mudar({ note: v })} linhas={2} />
    </fieldset>
  );
}

export function ReceberDialogo({ aberto, aoFechar, id, soResto = false }: { aberto: boolean; aoFechar: () => void; id: string; soResto?: boolean }) {
  const { db, agir } = useCtxInv();
  const p = poPorId(db, id);
  const [f, setF] = useState<Estado | null>(() => (p ? inicio(p, soResto) : null));
  if (!p || !f) return null;
  const mudar = (x: Partial<Estado>): void => setF((e) => (e ? { ...e, ...x, erro: "" } : e));
  const linha = (i: number, x: Partial<LinhaRec>): void => mudar({ linhas: f.linhas.map((l, j) => (j === i ? { ...l, ...x } : l)) });
  const ids = f.linhas.filter((v, i) => v.close && poRem(p.lines[i]) - v.now > 0).map((v) => v.id);
  const repart = p.lines.map((l, i) => repartirRececao(db, l, f.linhas[i].now));
  const total = f.linhas.reduce((a, v) => a + v.now, 0), paraEc = repart.reduce((a, r) => a + r.toEC, 0), paraStock = repart.reduce((a, r) => a + r.toStock, 0);
  const confirmar = (): void => {
    const itens = f.linhas.filter((v) => v.now > 0).map((v) => ({ lineId: v.id, qty: v.now }));
    if (ids.length && !f.reason) { setF({ ...f, erro: "Escolha o motivo para não receber o resto." }); return; }
    if (!itens.length && !ids.length) { setF({ ...f, erro: "Indique quantidades a receber ou marque o resto a anular." }); return; }
    const r = agir((d) => {
      const po = poPorId(d, id)!;
      const out = itens.length ? receberLinhas(d, po, itens, f.wh, f.guia || null, { date: f.date }) : null;
      if (ids.length) anularResto(d, po, ids, f.reason, f.note);
      return out;
    }, (out) => (out ? `Receção registada: ${out.res.reduce((a, x) => a + x.toEC, 0)} un servem Encomendas Clientes · ${out.res.reduce((a, x) => a + x.toStock, 0)} un entraram no stock.${ids.length ? " Resto anulado." : ""}` : "Resto anulado. Pode desfazer em Anulações."));
    if (r.ok) aoFechar(); else setF({ ...f, erro: r.erro });
  };
  return (
    <Dlg aberto={aberto} aoFechar={aoFechar} largo titulo={(soResto ? "Não vou receber o resto — " : "Receber ") + p.id}
      descricao={soResto ? "Anula o que falta, com motivo. Pode desfazer depois em Anulações." : "Escolha o que chegou. Nunca mais do que falta."}
      rodape={<><span className="mr-auto text-[15px] text-muted-foreground">{soResto ? "" : `${un(total)} a receber`}</span><Sec onClick={aoFechar}>Cancelar</Sec><Pri onClick={confirmar}>{soResto ? "Anular resto" : ids.length ? "Confirmar receção e anular resto" : "Confirmar receção"}</Pri></>}>
      {!soResto && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Lista rotulo="Armazém de destino" valor={f.wh} aoMudar={(v) => mudar({ wh: v })} opcoes={opcoesArmazens(db)} obrigatorio />
          <Texto rotulo="Data real de entrega" tipo="date" valor={f.date} aoMudar={(v) => mudar({ date: v })} atributos={{ max: HOJE }} />
          <Lista rotulo="Guia do fornecedor (opcional)" valor={f.guia} aoMudar={(v) => mudar({ guia: v })} opcoes={[["", "Sem guia"], ...db.guias.filter((g) => g.state === "open" && g.sup === p.sup).map((g) => [g.id, g.id] as const)]} ajuda="Nova guia: no separador Guias." />
        </div>
      )}
      <ul className="divide-y divide-border rounded-xl border border-border">{p.lines.map((l, i) => <LinhaReceber key={l.id} l={l} v={f.linhas[i]} sp={repart[i]} soResto={soResto} aoMudar={(x) => linha(i, x)} />)}</ul>
      {!soResto && (
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[15px]">
          <input type="checkbox" checked={f.todo} onChange={(e) => mudar({ todo: e.target.checked, linhas: f.linhas.map((v, i) => ({ ...v, close: e.target.checked && poRem(p.lines[i]) - v.now > 0 })) })} className="h-5 w-5 accent-foreground" />
          <b>Não vou receber o resto</b> de toda a encomenda
        </label>
      )}
      {!soResto && <Nota tom="info">Pré-visualização: <b>{un(total)}</b> · {un(paraEc)} para Encomendas Clientes (ficam reservadas e servem a EC) · {un(paraStock)} para stock (livres, custo médio atualizado).</Nota>}
      {ids.length > 0 && <MotivoResto f={f} mudar={mudar} />}
      {f.erro && <Nota tom="bad" alerta>{f.erro}</Nota>}
    </Dlg>
  );
}

// 25/11 (Rúben: «queremos estes serviços e microtarefas na Olyvia, e substituir em todo o lado»). As microtarefas na ficha do serviço
// (Catálogo e custos): a lista de verificação que o técnico marca na obra, igual em todas as obras deste serviço. Propõe as tarefas da
// Mudelar no Infraspeak; o gestor junta, muda o nome e as horas, muda a ordem e tira, e grava (real/microtarefasServico.ts). As obras que
// já existem passam à lista nova pela «Atualizar as microtarefas das obras» (só mudam nomes e juntam as novas).
import { useState, useSyncExternalStore } from "react";
import { ArrowDown, ArrowUp, Check, ListChecks, Plus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { nfmt, type Tarefa } from "./motor";
import { tarefaMudelar, tarefasMudelarDe } from "./microtarefasMudelar";
import { gravarMicrotarefasServico, microtarefasDoServico, ouvirMicrotarefasServicos, versaoMicrotarefasServicos, type MicroServico } from "./real/microtarefasServico";

/** As tarefas do Infraspeak que se propõem a um serviço (pelo nome, pelo ofício e pela primeira fase dele). */
export function propostaDoServico(sid: string, nome: string, oficio: string, fase?: number): MicroServico[] {
  const t: Tarefa = { nome, svcs: [sid], dia: 0, dur: 1, sk: oficio, h: 0, tec: null, ...(fase ? { fase } : {}) };
  return tarefasMudelarDe(t, null).map((x) => ({ nome: x.n, ...(x.h ? { horas: x.h } : {}), quem: x.quem, checklist: [...x.det], ref: x.ref }));
}

const ENTRADA = "h-10 rounded-lg border border-input bg-background px-2 text-[15px]";

export function MicrotarefasServico({ sid, nome, oficio, fase, pode }: { sid: string; nome: string; oficio: string; fase?: number; pode: boolean }) {
  useSyncExternalStore(ouvirMicrotarefasServicos, versaoMicrotarefasServicos);
  const gravada = microtarefasDoServico(sid) ?? [];
  const [rascunho, setRascunho] = useState<MicroServico[] | null>(null);
  const [nova, setNova] = useState("");
  const [msg, setMsg] = useState<{ t: string; mau: boolean } | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const L = rascunho ?? gravada;
  const proposta = propostaDoServico(sid, nome, oficio, fase);
  const mudar = (f: (x: MicroServico[]) => MicroServico[]) => { setMsg(null); setRascunho(f(L.map((m) => ({ ...m, checklist: [...m.checklist] })))); };
  const mover = (k: number, d: number) => mudar((x) => { const [m] = x.splice(k, 1); x.splice(k + d, 0, m); return x; });
  const gravar = async () => {
    if (!rascunho) return;
    setAGravar(true);
    const r = await gravarMicrotarefasServico(sid, rascunho);
    setAGravar(false);
    if (r.ok) { setRascunho(null); setMsg({ t: "Microtarefas gravadas. As obras novas já as usam; as que existem mudam em «Atualizar as microtarefas das obras».", mau: false }); }
    else setMsg({ t: "erro" in r ? r.erro : "Não foi possível gravar.", mau: true });
  };
  const horasTotal = L.reduce((a, m) => a + (m.horas ?? 0), 0);

  return (
    <section aria-labelledby="micro-servico" className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="micro-servico" className="flex items-center gap-2 text-xl font-semibold tracking-tight"><ListChecks className="h-5 w-5 text-primary" aria-hidden="true" />Microtarefas</h2>
        {L.length > 0 && <span className="text-[16px] font-medium tabular-nums">{L.length} · {nfmt(horasTotal)} h</span>}
      </div>
      <p className="mt-1 text-[15px] text-muted-foreground">O que o técnico marca na obra, por esta ordem. Vale para todas as obras com este serviço.</p>

      {!L.length && (
        <div className="mt-3 rounded-xl bg-muted/50 p-3 text-[15px]">
          {proposta.length ? <>Ainda sem microtarefas próprias. As obras usam as {proposta.length} tarefas da Mudelar no Infraspeak para este trabalho.</> : "Sem microtarefas: as obras usam as instruções gerais do trabalho."}
        </div>
      )}
      <ol className="mt-3 space-y-1.5">
        {L.map((m, k) => (
          <li key={k} className="rounded-xl bg-muted/50 px-2 py-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-6 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{k + 1}.</span>
              {pode ? (
                <input aria-label={`Nome da microtarefa ${k + 1}`} value={m.nome} onChange={(e) => mudar((x) => { x[k].nome = e.target.value; return x; })} className={cn(ENTRADA, "min-w-0 flex-[1_1_14rem]")} />
              ) : <span className="min-w-0 flex-[1_1_14rem] text-[15px]">{m.nome}</span>}
              {pode ? (
                <label className="flex items-center gap-1 text-sm text-muted-foreground">
                  <input aria-label={`Horas de ${m.nome}`} type="number" min={0} step={0.25} value={m.horas ?? ""} onChange={(e) => mudar((x) => { const v = e.target.value.trim(); if (v) x[k].horas = Math.max(0, Number(v) || 0); else delete x[k].horas; return x; })}
                    className={cn(ENTRADA, "w-20 tabular-nums")} />h
                </label>
              ) : m.horas != null && <span className="text-sm tabular-nums text-muted-foreground">{nfmt(m.horas)} h</span>}
              {pode && (
                <span className="flex items-center">
                  <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30" disabled={k === 0} aria-label={`Subir «${m.nome}»`} onClick={() => mover(k, -1)}><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-30" disabled={k === L.length - 1} aria-label={`Descer «${m.nome}»`} onClick={() => mover(k, 1)}><ArrowDown className="h-4 w-4" /></button>
                  <button type="button" className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive" aria-label={`Tirar «${m.nome}»`} onClick={() => mudar((x) => x.filter((_, j) => j !== k))}><X className="h-4 w-4" /></button>
                </span>
              )}
            </div>
            {m.checklist.length > 0 && (
              <details className="pl-8 text-sm text-muted-foreground">
                <summary className="min-h-8 cursor-pointer select-none py-1">{m.checklist.length} {m.checklist.length === 1 ? "ponto" : "pontos"}{m.quem ? ` · ${m.quem}` : ""}</summary>
                <ul className="list-disc space-y-0.5 pb-1 pl-4">{m.checklist.map((c, j) => <li key={j}>{c}</li>)}</ul>
              </details>
            )}
          </li>
        ))}
      </ol>
      {pode && (
        <>
          <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (!nova.trim()) return; mudar((x) => [...x, { nome: nova.trim(), checklist: [] }]); setNova(""); }}>
            <input value={nova} onChange={(e) => setNova(e.target.value)} placeholder="Ex.: Fotografar antes de fechar" aria-label="Nova microtarefa do serviço" className={cn(ENTRADA, "min-w-0 flex-1")} />
            <Button type="submit" variant="outline" className="min-h-10" disabled={!nova.trim()}><Plus className="mr-1 h-4 w-4" aria-hidden="true" />Juntar</Button>
          </form>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {proposta.length > 0 && (
              <Button type="button" variant="ghost" className="min-h-10" onClick={() => { setMsg(null); setRascunho(proposta.map((m) => ({ ...m, checklist: [...m.checklist] }))); }}>
                <Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />{L.length ? "Trocar pelas" : "Usar as"} {proposta.length} tarefas do Infraspeak
              </Button>
            )}
            {rascunho && <>
              <Button type="button" variant="outline" className="min-h-10" disabled={aGravar} onClick={gravar}><Check className="mr-1.5 h-4 w-4" aria-hidden="true" />{aGravar ? "A gravar…" : "Gravar as microtarefas"}</Button>
              <Button type="button" variant="ghost" className="min-h-10" disabled={aGravar} onClick={() => { setRascunho(null); setMsg(null); }}>Cancelar</Button>
            </>}
          </div>
        </>
      )}
      {msg && <p role={msg.mau ? "alert" : "status"} className={cn("mt-2 text-[15px]", msg.mau ? "text-destructive" : "text-success")}>{msg.t}</p>}
    </section>
  );
}

/** 25/11: ligar de uma vez os serviços do Catálogo às tarefas da Mudelar no Infraspeak. Mostra cada serviço com a proposta, as horas do
 *  Infraspeak e as do Catálogo (por unidade), e grava os escolhidos. Os «MO Modelo» ficam de fora: na obra são uma tarefa por ofício e
 *  cada parte recebe as tarefas do seu trabalho. */
export function LigarMicrotarefas({ itens, horas, fase, pode }: {
  itens: { sid: string; n: string; oficio: string; un?: string }[];
  /** as horas de mão de obra por unidade do serviço no Catálogo */ horas: (sid: string) => number;
  fase: (sid: string, nome: string, oficio: string) => number | undefined;
  pode: boolean;
}) {
  useSyncExternalStore(ouvirMicrotarefasServicos, versaoMicrotarefasServicos);
  const [aberto, setAberto] = useState(false);
  const [fora, setFora] = useState<Set<string>>(new Set());
  const [estado, setEstado] = useState<{ feitos: number; total: number; erro?: string } | null>(null);
  const L = itens.filter((i) => !/^mo modelo/i.test(i.n.trim()))
    .map((i) => {
      const prop = propostaDoServico(i.sid, i.n, i.oficio, fase(i.sid, i.n, i.oficio)), atual = microtarefasDoServico(i.sid);
      // 25/11: «tem» = tem uma lista feita à mão, ou igual à proposta; uma lista posta pela app que já não bate com a proposta corrigida volta a ligar-se
      const auto = !!atual && atual.every((m) => !!m.ref && tarefaMudelar(m.ref)?.n === m.nome);
      const igual = !!atual && atual.length === prop.length && atual.every((m, k) => m.ref === prop[k].ref && m.nome === prop[k].nome);
      return { ...i, prop, tem: !!atual?.length && (igual || !auto), refazer: !!atual?.length && auto && !igual };
    })
    .filter((i) => i.prop.length > 0 || i.refazer); // 25/11: uma lista automática que a proposta corrigida já não tem também se corrige (fica vazia)
  const porLigar = L.filter((i) => !i.tem);
  if (!pode || !L.length) return null;
  const escolhidos = porLigar.filter((i) => !fora.has(i.sid));
  const gravar = async () => {
    setEstado({ feitos: 0, total: escolhidos.length });
    let feitos = 0;
    for (const i of escolhidos) {
      const r = await gravarMicrotarefasServico(i.sid, i.prop);
      if ("erro" in r) { setEstado({ feitos, total: escolhidos.length, erro: `${i.n}: ${r.erro}` }); return; }
      feitos++; setEstado({ feitos, total: escolhidos.length });
    }
  };
  return (
    <section aria-labelledby="ligar-micro" className="mb-4 rounded-2xl border border-primary/30 bg-primary/[0.04] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 id="ligar-micro" className="flex items-center gap-2 text-[17px] font-semibold"><ListChecks className="h-5 w-5 text-primary" aria-hidden="true" />Microtarefas do Infraspeak</h2>
          <p className="text-[15px] text-muted-foreground">{porLigar.length ? `${porLigar.length} ${porLigar.length === 1 ? "serviço pode ficar" : "serviços podem ficar"} com as tarefas reais da Mudelar${porLigar.some((i) => i.refazer) ? ` (${porLigar.filter((i) => i.refazer).length} a corrigir)` : ""}.` : "Todos os serviços com tarefas no Infraspeak já têm microtarefas."} {L.length - porLigar.length > 0 && `${L.length - porLigar.length} já têm.`}</p>
        </div>
        <Button type="button" variant="outline" className="min-h-10" onClick={() => setAberto(!aberto)} aria-expanded={aberto}>{aberto ? "Fechar" : "Rever e ligar"}</Button>
      </div>
      {aberto && (
        <div className="mt-3">
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-[15px]">
              <thead><tr className="border-b border-border text-left text-sm text-muted-foreground">
                <th className="px-3 py-2 font-medium">Ligar</th><th className="px-3 py-2 font-medium">Serviço</th><th className="px-3 py-2 font-medium">Tarefas do Infraspeak</th>
                <th className="px-3 py-2 text-right font-medium">Horas no Infraspeak</th><th className="px-3 py-2 text-right font-medium">Horas no Catálogo</th>
              </tr></thead>
              <tbody>
                {L.map((i) => {
                  const h = i.prop.reduce((a, m) => a + (m.horas ?? 0), 0);
                  return (
                    <tr key={i.sid} className="border-b border-border last:border-b-0 align-top">
                      <td className="px-3 py-2">{i.tem ? <span className="text-sm text-success">Já tem</span> : (
                        <input type="checkbox" aria-label={`Ligar ${i.n}`} checked={!fora.has(i.sid)} onChange={(e) => setFora((s) => { const n = new Set(s); if (e.target.checked) n.delete(i.sid); else n.add(i.sid); return n; })} className="h-5 w-5 accent-[hsl(var(--primary))]" />
                      )}</td>
                      <td className="px-3 py-2"><span className="font-medium">{i.n}</span>{i.refazer && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">a corrigir</span>}<span className="block text-sm text-muted-foreground">{i.oficio}</span></td>
                      <td className="px-3 py-2"><details><summary className="cursor-pointer">{i.prop.length ? `${i.prop.length} tarefas` : "nenhuma (limpa a lista)"}</summary><ol className="mt-1 list-decimal pl-5 text-sm text-muted-foreground">{i.prop.map((m, k) => <li key={k}>{m.nome}</li>)}</ol></details></td>
                      <td className="px-3 py-2 text-right tabular-nums">{nfmt(h)} h <span className="block text-xs text-muted-foreground">por obra</span></td>
                      <td className="px-3 py-2 text-right tabular-nums">{nfmt(horas(i.sid))} h <span className="block text-xs text-muted-foreground">por {i.un ?? "un"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">Os preços não mudam: as horas do Catálogo continuam a contar no orçamento. Depois de ligar, cada lista edita-se na ficha do serviço.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button type="button" className="min-h-10" disabled={!escolhidos.length || (!!estado && !estado.erro && estado.feitos < estado.total)} onClick={gravar}>
              <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />Ligar {escolhidos.length} {escolhidos.length === 1 ? "serviço" : "serviços"}
            </Button>
            {estado && <p role={estado.erro ? "alert" : "status"} className={cn("text-[15px]", estado.erro ? "text-destructive" : estado.feitos === estado.total ? "text-success" : "text-muted-foreground")}>
              {estado.erro ?? (estado.feitos === estado.total ? `${estado.feitos} ${estado.feitos === 1 ? "serviço ligado" : "serviços ligados"}. As obras que existem mudam em «Atualizar as microtarefas das obras».` : `A gravar ${estado.feitos + 1} de ${estado.total}…`)}</p>}
          </div>
        </div>
      )}
    </section>
  );
}

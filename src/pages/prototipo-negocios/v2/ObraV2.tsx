// A página de uma obra na V2 (13/10/2026): secções seguidas, sem separadores — Plano, Validar, Atrasos, Previsto contra real e Materiais.
// O plano e o estado vêm do motor; as validações, os atrasos e a aprovação vivem em estadoV2.ts. Um só botão primário: o do estado do
// plano (Aprovar plano, Arrancar a obra ou Registar o fim da obra). Cor só nos ícones.
import { useState } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, Clock, Minus, TrendingDown, TrendingUp, XCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PAPEIS, TECS, conflitos, eur, nfmt, type Negocio } from "../motor";
import type { Ctx } from "../pecas";
import {
  DIAS_ATRASO, MOTIVOS_ATRASO, MOTIVOS_REJEICAO, OPCOES_INICIO, SUPERVISORES, avisarCliente, datasTarefa, desvio, erroRejeicao, errosAtraso,
  estadoTarefa, faltaAprovar, feita, porValidar, previstoReal, registarAtraso, rejeitarTarefa, validarTarefa, validarTodas,
  type EstadoTarefa, type NovoAtraso, type RegObra,
} from "./operacoes";
import { guardarObra, regObra } from "./estadoV2";
import { fatoresDe } from "./realExemplo";
import { BOTAO, CHIP, INPUT } from "./estilo";
import { EstadoObra } from "./EstadoObra";

const TAREFA: Record<EstadoTarefa, { i: typeof Check; cor: string; t: string }> = {
  "por fazer": { i: Circle, cor: "text-muted-foreground", t: "Por fazer" },
  "por validar": { i: Clock, cor: "text-warning", t: "Feita · por validar" },
  validada: { i: CheckCircle2, cor: "text-success", t: "Validada" },
  rejeitada: { i: XCircle, cor: "text-destructive", t: "Rejeitada · voltou ao técnico" },
};
const tecNome = (id: string | null) => TECS.find((x) => x.id === id)?.n ?? "sem técnico";

function Secao({ id, titulo, children, extra }: { id: string; titulo: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="scroll-mt-6 border-t border-border pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id={`${id}-t`} className="text-xl font-semibold">{titulo}</h2>
        {extra}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function ObraV2({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const { S, A, go, run } = ctx;
  const p = d.obra.plano!, reg = regObra(S, d), pode = S.role === "operacoes";
  const mudar = (fn: (r: RegObra) => RegObra) => run(() => guardarObra(S, d.id, fn(regObra(S, d))));
  const horas = p.tasks.reduce((a, t) => a + t.h, 0);
  const pv = porValidar(p, reg);
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-6 sm:px-8 sm:pt-10">
      <button type="button" onClick={go(() => A.nav("operacoes"))} className="inline-flex min-h-11 items-center gap-2 text-[15px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Operações
      </button>
      <header className="mt-2">
        <h1 className="text-3xl font-semibold tracking-tight">{d.nome}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-base text-muted-foreground">
          <EstadoObra p={p} /> <span>· {d.servico} · {p.tasks.length} fases · {nfmt(horas)} h de equipa</span>
        </p>
        {!pode && (
          <p className="mt-3 text-[15px] text-muted-foreground">
            Esta página é de {PAPEIS.operacoes.n}.{" "}
            <button type="button" className="min-h-11 font-medium text-primary underline-offset-4 hover:underline" onClick={go(() => A.role("operacoes"))}>Mudar para Filipe</button>
          </p>
        )}
        <nav aria-label="Nesta página" className="mt-4 flex flex-wrap gap-x-4">
          {[["plano", "Plano"], ["validar", `Validar${pv.length ? ` (${pv.length})` : ""}`], ["atrasos", "Atrasos"], ["real", "Previsto contra real"], ["materiais", "Materiais"]].map(([id, t]) => (
            <a key={id} href={`#${id}`} className="inline-flex min-h-11 items-center text-[15px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t}</a>
          ))}
        </nav>
      </header>
      <div className="mt-6 space-y-10">
        <SecPlano ctx={ctx} d={d} reg={reg} pode={pode} mudar={mudar} />
        <SecValidar d={d} reg={reg} pode={pode} mudar={mudar} />
        <SecAtrasos d={d} reg={reg} pode={pode} mudar={mudar} />
        <SecReal ctx={ctx} d={d} />
        <SecMateriais ctx={ctx} d={d} />
      </div>
    </div>
  );
}

type Props = { d: Negocio; reg: RegObra; pode: boolean; mudar: (fn: (r: RegObra) => RegObra) => void };

function SecPlano({ ctx, d, reg, pode, mudar }: Props & { ctx: Ctx }) {
  const { A, go, run } = ctx;
  const p = d.obra.plano!, C = conflitos(p), e = d.obra.enc, matsOk = !e || e.estado === "recebida";
  const falta = faltaAprovar(p, reg);
  let frase = "", botao: React.ReactNode = null;
  if (p.estado === "por aprovar") {
    frase = falta.length ? `Plano por aprovar. Falta ${falta.join(", ")}.` : "Plano por aprovar: está tudo pronto.";
    botao = (
      <Button size="lg" className={BOTAO} disabled={!pode || !!falta.length} onClick={() => run(() => {
        A.campo(d.id, "responsavel", reg.aprovacao.supervisor!);
        A.campo(d.id, "inicio", reg.aprovacao.inicio!);
        A.aprovarPlano(d.id);
      })}>Aprovar plano</Button>
    );
  } else if (p.estado === "aprovado") {
    frase = matsOk ? "Plano aprovado e materiais garantidos. Pode arrancar." : "Plano aprovado. A obra só arranca com os materiais garantidos.";
    botao = <Button size="lg" className={BOTAO} disabled={!pode || !matsOk} onClick={go(() => A.arrancar(d.id))}>Arrancar a obra</Button>;
  } else if (p.estado === "em curso") {
    frase = `Obra em curso, no dia ${p.dia + 1}.`;
    botao = <Button size="lg" className={BOTAO} disabled={!pode} onClick={go(() => A.fimObra(d.id))}>Registar o fim da obra</Button>;
  } else frase = "Obra concluída.";
  const porAprovar = p.estado === "por aprovar";
  return (
    <Secao id="plano" titulo="Plano">
      <p className="text-base">{frase}</p>
      {porAprovar && (
        <div className="mt-5 space-y-5">
          <fieldset disabled={!pode}>
            <legend className="text-[15px] font-medium">Supervisor</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {SUPERVISORES.map((s) => (
                <button key={s} type="button" aria-pressed={reg.aprovacao.supervisor === s} className={CHIP(reg.aprovacao.supervisor === s)}
                  onClick={() => mudar((r) => ({ ...r, aprovacao: { ...r.aprovacao, supervisor: s } }))}>{s}</button>
              ))}
            </div>
          </fieldset>
          <fieldset disabled={!pode}>
            <legend className="text-[15px] font-medium">Início</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {OPCOES_INICIO.map((o) => (
                <button key={o.iso} type="button" aria-pressed={reg.aprovacao.inicio === o.iso} className={CHIP(reg.aprovacao.inicio === o.iso)}
                  onClick={() => mudar((r) => ({ ...r, aprovacao: { ...r.aprovacao, inicio: o.iso } }))}>{o.rotulo}</button>
              ))}
            </div>
          </fieldset>
          {C.map((c) => {
            const ti = p.tasks.indexOf(c.t);
            const alt = TECS.find((x) => x.sk === c.t.sk && x.id !== c.tec.id && !x.ferias.some((k) => k >= c.t.dia && k < c.t.dia + c.t.dur));
            return (
              <div key={ti} className="space-y-2">
                <p className="flex items-start gap-2 text-[15px]">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
                  {c.tec.n} está de férias em {datasTarefa(c.t)} ({c.t.nome.toLowerCase()}).
                </p>
                <div className="flex flex-wrap gap-2 pl-7">
                  {alt && <Button variant="outline" className={BOTAO} disabled={!pode} onClick={go(() => A.trocar(d.id, ti))}>Trocar por {alt.n}</Button>}
                  <Button variant="outline" className={BOTAO} disabled={!pode} onClick={go(() => A.adiar(d.id, ti))}>Adiar {c.t.nome.toLowerCase()}</Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <ol className="mt-5 divide-y divide-border rounded-2xl border border-border bg-card px-4 sm:px-5">
        {p.tasks.map((t, i) => {
          const est = TAREFA[estadoTarefa(p, reg, i)], conf = C.some((c) => c.t === t);
          const I = conf ? AlertTriangle : est.i;
          return (
            <li key={i} className="flex min-h-14 items-center gap-3 py-2.5">
              <I className={cn("h-5 w-5 shrink-0", conf ? "text-warning" : est.cor)} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">{t.nome}</span>
                <span className="block text-[15px] text-muted-foreground">{tecNome(t.tec)} · {datasTarefa(t)} · {nfmt(t.h)} h · {conf ? "técnico de férias" : est.t}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {botao && <div className="mt-5">{botao}</div>}
    </Secao>
  );
}

function SecValidar({ d, reg, pode, mudar }: Props) {
  const p = d.obra.plano!, pv = porValidar(p, reg);
  const rej = p.tasks.map((_, i) => i).filter((i) => estadoTarefa(p, reg, i) === "rejeitada");
  const nVal = p.tasks.filter((_, i) => estadoTarefa(p, reg, i) === "validada").length;
  const [aRejeitar, setARejeitar] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const rejeitar = (i: number) => {
    const e = erroRejeicao(motivo);
    setErro(e);
    if (e) return;
    mudar((r) => rejeitarTarefa(r, i, motivo));
    setARejeitar(null); setMotivo("");
  };
  return (
    <Secao id="validar" titulo="Validar"
      extra={pv.length > 1 && <Button variant="outline" className={BOTAO} disabled={!pode} onClick={() => mudar((r) => validarTodas(p, r))}>Validar todas ({pv.length})</Button>}>
      {!pv.length && !rej.length && (
        <p className="text-[15px] text-muted-foreground">
          {feita(p, 0) ? "Nada por validar." : "Nada por validar. As tarefas aparecem aqui quando o técnico as dá por feitas na app."}
          {nVal ? ` ${nVal} ${nVal === 1 ? "tarefa validada" : "tarefas validadas"}.` : ""}
        </p>
      )}
      {(pv.length > 0 || rej.length > 0) && (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card px-4 sm:px-5">
          {[...pv, ...rej].map((i) => {
            const t = p.tasks[i], est = estadoTarefa(p, reg, i), M = TAREFA[est];
            return (
              <li key={i} className="py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <M.i className={cn("h-5 w-5 shrink-0", M.cor)} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium">{t.nome}</span>
                    <span className="block text-[15px] text-muted-foreground">
                      {tecNome(t.tec)} · {datasTarefa(t)}{est === "rejeitada" ? ` · rejeitada: ${reg.rejeitadas[i]}` : " · feita, por validar"}
                    </span>
                  </span>
                  {aRejeitar !== i && (
                    <span className="flex gap-2">
                      <Button variant="outline" className={BOTAO} disabled={!pode} aria-label={`Validar ${t.nome}`} onClick={() => mudar((r) => validarTarefa(r, i))}>
                        <Check aria-hidden="true" />Validar
                      </Button>
                      {est === "por validar" && (
                        <Button variant="ghost" className={BOTAO} disabled={!pode} aria-label={`Rejeitar ${t.nome}`} onClick={() => { setARejeitar(i); setMotivo(""); setErro(null); }}>Rejeitar</Button>
                      )}
                    </span>
                  )}
                </div>
                {aRejeitar === i && (
                  <div className="mt-3 space-y-3 border-l-2 border-border pl-4">
                    <fieldset>
                      <legend className="text-[15px] font-medium">Porque rejeita? O técnico lê isto na app.</legend>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {MOTIVOS_REJEICAO.map((m) => <button key={m} type="button" aria-pressed={motivo === m} className={CHIP(motivo === m)} onClick={() => setMotivo(m)}>{m}</button>)}
                      </div>
                    </fieldset>
                    <div>
                      <label htmlFor={`mot-${i}`} className="text-[15px] font-medium">Motivo</label>
                      <input id={`mot-${i}`} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: falta o silicone da base" className={cn(INPUT, "mt-2")} />
                    </div>
                    {erro && <p role="alert" className="flex items-center gap-2 text-[15px]"><AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />{erro}</p>}
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" className={BOTAO} onClick={() => rejeitar(i)}>Rejeitar tarefa</Button>
                      <Button variant="ghost" className={BOTAO} onClick={() => setARejeitar(null)}>Cancelar</Button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Secao>
  );
}

const ATRASO_VAZIO: NovoAtraso = { tarefa: null, dias: 1, motivo: "", clienteAvisado: false };

function SecAtrasos({ d, reg, pode, mudar }: Props) {
  const p = d.obra.plano!;
  const [novo, setNovo] = useState<NovoAtraso | null>(null);
  const [erros, setErros] = useState<string[]>([]);
  const registar = () => {
    const e = errosAtraso(novo!, p);
    setErros(e);
    if (e.length) return;
    mudar((r) => registarAtraso(r, novo!));
    setNovo(null);
  };
  const aberta = p.estado !== "concluída";
  return (
    <Secao id="atrasos" titulo="Atrasos"
      extra={aberta && !novo && <Button variant="outline" className={BOTAO} disabled={!pode} onClick={() => { setNovo({ ...ATRASO_VAZIO, tarefa: p.tasks.findIndex((_, i) => !feita(p, i)) }); setErros([]); }}>Registar um atraso</Button>}>
      {!reg.atrasos.length && !novo && <p className="text-[15px] text-muted-foreground">Sem atrasos registados.</p>}
      {reg.atrasos.length > 0 && (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card px-4 sm:px-5">
          {reg.atrasos.map((a) => {
            const t = p.tasks[a.tarefa];
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                <AlertTriangle className="h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium">{t ? t.nome : "Obra"} · {a.dias} {a.dias === 1 ? "dia" : "dias"}{a.exemplo ? " · exemplo" : ""}</span>
                  <span className="block text-[15px] text-muted-foreground">{a.motivo}</span>
                </span>
                <label className="flex min-h-11 items-center gap-3 text-[15px]">
                  <Switch checked={a.clienteAvisado} disabled={!pode} onCheckedChange={(v) => mudar((r) => avisarCliente(r, a.id, v))} aria-label={`Cliente avisado: ${t ? t.nome : "obra"}`} />
                  Cliente avisado
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {novo && (
        <div className="mt-4 space-y-5 border-l-2 border-border pl-4">
          <fieldset>
            <legend className="text-[15px] font-medium">Que fase atrasa?</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {p.tasks.map((t, i) => !feita(p, i) && (
                <button key={i} type="button" aria-pressed={novo.tarefa === i} className={CHIP(novo.tarefa === i)} onClick={() => setNovo({ ...novo, tarefa: i })}>{t.nome}</button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-[15px] font-medium">Quantos dias?</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {DIAS_ATRASO.map((n) => <button key={n} type="button" aria-pressed={novo.dias === n} className={CHIP(novo.dias === n)} onClick={() => setNovo({ ...novo, dias: n })}>{n} {n === 1 ? "dia" : "dias"}</button>)}
            </div>
          </fieldset>
          <fieldset>
            <legend className="text-[15px] font-medium">Motivo</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {MOTIVOS_ATRASO.map((m) => <button key={m} type="button" aria-pressed={novo.motivo === m} className={CHIP(novo.motivo === m)} onClick={() => setNovo({ ...novo, motivo: m })}>{m}</button>)}
            </div>
          </fieldset>
          <label className="flex min-h-11 items-center gap-3 text-[15px]">
            <Switch checked={novo.clienteAvisado} onCheckedChange={(v) => setNovo({ ...novo, clienteAvisado: v })} aria-label="Cliente avisado" />
            Cliente avisado
          </label>
          {erros.length > 0 && <ul role="alert" className="space-y-1 text-[15px]">{erros.map((e) => <li key={e} className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />{e}</li>)}</ul>}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className={BOTAO} onClick={registar}>Registar atraso</Button>
            <Button variant="ghost" className={BOTAO} onClick={() => setNovo(null)}>Cancelar</Button>
          </div>
        </div>
      )}
    </Secao>
  );
}

function SecReal({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const R = previstoReal(d, ctx.S, fatoresDe(d.id));
  const mx = Math.max(1, ...R.linhas.flatMap((l) => [l.prev, l.real]));
  const total = desvio(R.prev, R.real);
  return (
    <Secao id="real" titulo="Previsto contra real" extra={<span className="text-[15px] text-muted-foreground">O real é de exemplo</span>}>
      {!R.fracao ? (
        <p className="text-[15px] text-muted-foreground">O real aparece quando a obra arrancar e as primeiras tarefas forem feitas.</p>
      ) : (
        <>
          <p className="text-[15px] text-muted-foreground">
            {R.fracao >= 1 ? "A obra inteira." : `A parte já feita (${Math.round(R.fracao * 100)}% das horas).`} O previsto vem da receita de cada serviço; o real, de dados de exemplo.
          </p>
          <ul className="mt-4 space-y-4">
            {R.linhas.map((l) => (
              <li key={l.k} className="grid gap-1.5">
                <span className="flex flex-wrap justify-between gap-2 text-[15px]">
                  <span className="font-medium">{l.nome}</span>
                  <span className="tabular-nums">{eur(l.real)} € de {eur(l.prev)} € previstos · <Desvio prev={l.prev} real={l.real} /></span>
                </span>
                <span className="grid gap-1" aria-hidden="true">
                  <span className="h-2 rounded-full bg-muted"><span className="block h-2 rounded-full bg-muted-foreground/40" style={{ width: `${(l.prev / mx) * 100}%` }} /></span>
                  <span className="h-2 rounded-full bg-muted"><span className="block h-2 rounded-full bg-foreground/70" style={{ width: `${(l.real / mx) * 100}%` }} /></span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 flex flex-wrap gap-4 text-[15px] text-muted-foreground" aria-hidden="true">
            <span className="inline-flex items-center gap-1.5"><i className="h-2 w-6 rounded-full bg-muted-foreground/40" />previsto</span>
            <span className="inline-flex items-center gap-1.5"><i className="h-2 w-6 rounded-full bg-foreground/70" />real</span>
          </p>
          <p className="mt-4 text-base font-medium tabular-nums">Total: {eur(R.real)} € de {eur(R.prev)} € previstos · <Desvio prev={R.prev} real={R.real} /></p>
          <p className="sr-only">Desvio total de {total.pct}%.</p>
        </>
      )}
    </Secao>
  );
}

function Desvio({ prev, real }: { prev: number; real: number }) {
  const v = desvio(prev, real);
  const I = v.sentido === "acima" ? TrendingUp : v.sentido === "abaixo" ? TrendingDown : Minus;
  const cor = v.sentido === "acima" ? "text-warning" : v.sentido === "abaixo" ? "text-success" : "text-muted-foreground";
  const t = v.sentido === "igual" ? "dentro do previsto" : `${v.pct > 0 ? "+" : ""}${v.pct}% (${v.dif > 0 ? "mais" : "menos"} ${eur(Math.abs(v.dif))} €)`;
  return <span className="inline-flex items-center gap-1"><I className={cn("h-4 w-4", cor)} aria-hidden="true" />{t}</span>;
}

function SecMateriais({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const { A, go } = ctx;
  const e = d.obra.enc;
  return (
    <Secao id="materiais" titulo="Materiais"
      extra={<Button variant="ghost" className={BOTAO} onClick={go(() => A.abrirInv())}>Abrir no Inventário<ArrowRight aria-hidden="true" /></Button>}>
      <p className="text-[15px]">{!e ? "Tudo em stock e reservado." : e.estado === "recebida" ? `Encomenda ${e.n} recebida: tudo reservado.` : `Encomenda ${e.n} ${e.estado}. O armazém trata no Inventário.`}</p>
      {(d.obra.mats || []).length > 0 && (
        <ul className="mt-3 divide-y divide-border">
          {d.obra.mats!.map((x) => (
            <li key={x.n} className="flex min-h-11 flex-wrap items-center justify-between gap-2 py-2 text-[15px]">
              <span>{x.n}</span>
              <span className="inline-flex items-center gap-1.5 tabular-nums text-muted-foreground">
                {x.falta > 0
                  ? <><AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />faltam {nfmt(x.falta)} de {nfmt(x.q)} {x.un}</>
                  : <><Check className="h-4 w-4 text-success" aria-hidden="true" />{nfmt(x.q)} {x.un} reservados</>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Secao>
  );
}

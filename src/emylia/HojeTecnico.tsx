// O Hoje do técnico (21/10/2026): o técnico faz tudo daqui, no telemóvel. Para cada tarefa de hoje:
// a obra (morada, contactos, a nota das Operações), o que levar e preparar, o passo a passo (marca-se à medida),
// o que verificar no fim e o registo do dia (horas, fotografias e o que fez). O registo vai para a página da obra
// (o responsável valida ou pede correção) e para o portal do cliente (fotografias e descrição, sem horas).
// O protótipo não tem relógio: "hoje" é o dia de cada obra em curso (as Operações mudam-no na página da obra).
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import {
  AlertTriangle, ArrowRight, Camera, Check, ChevronDown, Clock, HardHat, ImagePlus, ListChecks, MapPin, Minus, Package, Phone, Plus, ShieldCheck, Sparkles, Wrench, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TECS, nfmt, type Negocio } from "./motor";
import { hfmt } from "./horasFmt";
import type { Ctx } from "./pecas";
import { COR_FASE } from "./planoObra";
import { FASES_OBRA } from "./fasesObra";
import { rotuloDia } from "./preparacaoObra";
import { RESPONSAVEL_OBRA, equipamentosDaObra, estadoDe, fotoExemplo, materiaisPorFase, nomeCurtoTarefa } from "./obraOps";
import { useInventario } from "./inventario/loja";
import { resumoEcNegocio } from "./inventario/ponteNegocios";
import {
  aSeguirDoTecnico, diaDaTarefa, enviosDe, horasPorDia, instrucoesDe, passosFeitos, rotuloDiaTarefa, tecnicosComTrabalho, trabalhoDoTecnico, type ASeguir,
} from "./trabalhoObra";
import { AvatarTec, ChipEstado, EnvioItem, HistoricoTarefa, Miniaturas } from "./AcompanhamentoObra";
import { lerFoto } from "./ObraOperacoes";
import { AvisosDoTecnico } from "./AvisosTecnico";
import { RegistarImprevisto } from "./ImprevistosObra";

// 22/10: "A minha agenda" (a semana da pessoa do RH deste papel, a mesma da RH › Agenda; equipa/MinhaAgenda.tsx), carregada à parte
const MinhaAgenda = lazy(() => import("./equipa/MinhaAgenda"));

const saudacao = (h: number) => (h < 12 ? "Bom dia" : h < 20 ? "Boa tarde" : "Boa noite");
const CARTAO = "rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]";
const RAPIDAS = ["Correu como previsto.", "Falta acabar amanhã.", "Faltou material.", "O cliente pediu uma alteração."];

/** 23/10: o técnico real sem técnico de obra ligado à conta: em vez de ver (e poder trocar para) a agenda de outro técnico, o aviso. */
function SemTecnicoLigado() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-8 sm:px-8">
      <div className={cn(CARTAO, "p-6")} role="note">
        <HardHat className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">A sua conta não está ligada a um técnico</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          Sem essa ligação, a Olyvia não sabe que tarefas e que agenda são suas. Peça à Direção para ligar a sua conta ao seu técnico de obra
          em Utilizadores (campo "Técnico de obra") e volte a entrar.
        </p>
      </div>
    </div>
  );
}

/** 24/10: uma organização real sem técnicos de obra (sem os de exemplo): o "ver como" do técnico não tem quem mostrar. */
function SemTecnicos() {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-8 sm:px-8">
      <div className={cn(CARTAO, "p-6")} role="note">
        <HardHat className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Ainda não há técnicos de obra</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">Crie-os em Utilizadores (campo "Técnico de obra") para ver aqui o dia de cada um.</p>
      </div>
    </div>
  );
}

export function HojeTecnico(ctx: Ctx) {
  const { S, A, run } = ctx;
  const comTrabalho = tecnicosComTrabalho(S.deals);
  // 23/10: o técnico real fica no seu (o ligado à conta) e não troca; sem nenhum ligado, o aviso
  const fixo = ctx.tecnicoFixo;
  if (fixo && !(fixo.ref && TECS.some((x) => x.id === fixo.ref))) return <SemTecnicoLigado />;
  // 24/10: uma organização real ainda sem técnicos de obra (criam-se em Utilizadores): nada para ver como técnico
  if (!TECS.length) return <SemTecnicos />;
  const eu = fixo?.ref ? fixo.ref : S.tec && TECS.some((x) => x.id === S.tec) ? S.tec : comTrabalho[0] ?? "hn";
  const tec = TECS.find((x) => x.id === eu)!;
  const hoje = trabalhoDoTecnico(S.deals, eu);
  const seguir = aSeguirDoTecnico(S.deals, eu);
  const horas = hoje.reduce((a, x) => a + horasPorDia(x.t), 0);
  const obras = new Set(hoje.map((x) => x.d.id)).size;
  const agora = new Date();
  return (
    <div className="mx-auto w-full pb-28 sm:px-8 sm:pt-6">
      {/* fora do telemóvel: o controlo do protótipo (que técnico se vê); 23/10: o técnico real não troca */}
      {!fixo && <div role="group" aria-label="Ver como (no protótipo)" className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-2 px-4 pt-4 sm:pt-0">
        <span className="text-sm text-muted-foreground">A app do técnico · ver como</span>
        {TECS.map((x) => {
          const n = trabalhoDoTecnico(S.deals, x.id).length;
          return (
            <button key={x.id} type="button" aria-pressed={eu === x.id} onClick={() => run(() => A.souTec(x.id))}
              className={cn("flex min-h-10 items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-3 text-sm transition-colors", eu === x.id ? "border-primary bg-primary/[0.06] font-medium" : "border-input bg-card hover:border-foreground/40", !n && eu !== x.id && "opacity-60")}>
              <AvatarTec id={x.id} tam="h-7 w-7" />{x.n.split(" ")[0]}{n > 0 && <span className="rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">{n}</span>}
            </button>
          );
        })}
      </div>}
      {/* no computador, a app dentro de um telemóvel; no telemóvel, a app inteira */}
      <div className="mx-auto mt-4 w-full sm:mt-6 sm:max-w-[440px] sm:overflow-hidden sm:rounded-[2.75rem] sm:border-[10px] sm:border-neutral-900 sm:bg-background sm:shadow-2xl">
        <div className="hidden justify-center pt-2 sm:flex" aria-hidden="true"><span className="h-6 w-28 rounded-full bg-neutral-900" /></div>
        <div className="px-4 pb-10 pt-4 sm:px-4">
      <p className="text-[15px] text-muted-foreground first-letter:uppercase">{format(agora, "EEEE, d 'de' MMMM", { locale: pt })}</p>
      <div className="mt-1 flex items-center gap-3">
        <AvatarTec id={eu} tam="h-12 w-12 text-sm" />
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight">{saudacao(agora.getHours())}, {tec.n.split(" ")[0]}</h1>
          <p className="text-[15px] text-muted-foreground">{tec.sk}</p>
        </div>
      </div>
      <p className="mt-3 text-lg text-muted-foreground">
        {hoje.length ? <>Hoje tem <b className="font-semibold text-foreground">{hoje.length} {hoje.length === 1 ? "tarefa" : "tarefas"}</b> em {obras} {obras === 1 ? "obra" : "obras"} · cerca de {hfmt(horas)} h.</> : "Hoje não tem tarefas por fazer."}
      </p>

      <AvisosDoTecnico ctx={ctx} eu={eu} />
      <ul className="mt-6 space-y-6">
        {hoje.map((x) => <li key={x.d.id + ":" + x.ti}><TarefaDeHoje ctx={ctx} d={x.d} ti={x.ti} /></li>)}
      </ul>

      {!hoje.length && (
        <div className={cn(CARTAO, "mt-6 p-6 text-center")}>
          <Sparkles className="mx-auto h-8 w-8 text-primary" aria-hidden="true" />
          <p className="mt-2 text-[15px]">Sem trabalho para si hoje{comTrabalho.length && !fixo ? `. Experimente ver como ${TECS.find((t) => t.id === comTrabalho[0])?.n.split(" ")[0]}.` : "."}</p>
        </div>
      )}

      {seguir.length > 0 && (
        // 21/10: o que vem a seguir, com antecedência: quem está a trabalhar antes e o que preparar
        <section aria-labelledby="seguir-t" className="mt-10">
          <h2 id="seguir-t" className="text-xl font-semibold tracking-tight">A seguir</h2>
          <ul className="mt-3 space-y-3">{seguir.map((x) => <li key={x.d.id + ":" + x.ti}><TarefaASeguir x={x} eu={eu} /></li>)}</ul>
        </section>
      )}

      {/* 22/10: a semana do técnico (a linha dele na agenda do RH); 23/10: é sempre o técnico que se vê aqui (`tecnico`) */}
      <Suspense fallback={<p className="mt-10 text-[15px] text-muted-foreground" role="status">A carregar a agenda…</p>}>
        <MinhaAgenda S={S} tecnico={eu} irObra={(id) => run(() => A.abrirPlano(id))} irNegocio={(id) => run(() => A.abrir(id))} id="ht-minha-agenda" className="mt-10" />
      </Suspense>
        </div>
      </div>
    </div>
  );
}

/** Uma tarefa de hoje: tudo o que o técnico precisa, por ordem, com um primário de cada vez. */
function TarefaDeHoje({ ctx, d, ti }: { ctx: Ctx; d: Negocio; ti: number }) {
  const { A, run } = ctx;
  const p = d.obra.plano!, t = p.tasks[ti], ex = estadoDe(t), I = instrucoesDe(t), feitos = passosFeitos(t);
  const k = diaDaTarefa(t, p.dia) ?? 1, ultimoDia = k === t.dur;
  const cor = t.fase ? COR_FASE[t.fase] : "#7c5ce0";
  const fase = t.fase ? FASES_OBRA[t.fase - 1] : null;
  const envHoje = enviosDe(t).filter((e) => e.dia === p.dia && (e.k === "registo" || e.k === "feita"));
  const morada = d.f.morada || d.local;
  const corr = t.corrige != null, orig = corr ? p.tasks[t.corrige!] : null;
  const [abertoAntes, setAbertoAntes] = useState(ex === "por fazer");
  const [hist, setHist] = useState(false);
  // 21/10: uma só porta para os problemas: o imprevisto (impede, atrasa) ou só avisar o responsável (ImprevistosObra.tsx)
  const [problema, setProblema] = useState(false);
  const im = t.bloqueio ? d.obra.imprevistos?.find((x) => x.id === t.bloqueio) : undefined;
  const [mais, setMais] = useState(false);
  const todos = feitos.length === I.passos.length;

  return (
    <article className={cn(CARTAO, "overflow-hidden")} aria-label={`${t.nome} · ${d.nome}`}>
      {/* a obra */}
      <header className="relative p-5 pb-4 text-white" style={{ background: corr ? "linear-gradient(135deg, #dc2626, #7f1d1d)" : `linear-gradient(135deg, ${cor}, #2e1a6b)` }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-white/80">{fase ? `Fase ${t.fase} · ${fase.curto}` : t.sk} · {rotuloDiaTarefa(t, p.dia)}</p>
          <span className="rounded-full bg-white shadow-sm"><ChipEstado e={ex} /></span>
        </div>
        <h2 className="mt-0.5 text-2xl font-semibold tracking-tight" title={t.nome}>{nomeCurtoTarefa(t.nome)}</h2>
        <p className="mt-1 text-[15px] text-white/90">{d.nome} · {d.servico}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(morada)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white/15 px-3 text-sm hover:bg-white/25"><MapPin className="h-4 w-4" aria-hidden="true" />{morada}</a>
          <a href={`tel:${d.tel.replace(/\s/g, "")}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white/15 px-3 text-sm hover:bg-white/25"><Phone className="h-4 w-4" aria-hidden="true" />Cliente</a>
          <a href={`tel:${RESPONSAVEL_OBRA.tel.replace(/\s/g, "")}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-white/15 px-3 text-sm hover:bg-white/25"><Phone className="h-4 w-4" aria-hidden="true" />{RESPONSAVEL_OBRA.n.split(" ")[0]} (responsável)</a>
        </div>
      </header>

      <div className="space-y-6 p-5">
        {corr ? (
          // 21/10: a tarefa de correção: o pedido do responsável e o que enviou antes, para comparar
          <div className="rounded-xl border border-destructive/40 bg-destructive/[0.06] p-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
            <p className="flex items-start gap-2 text-[15px]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" /><span><b className="font-semibold">Nova tarefa de correção.</b> {RESPONSAVEL_OBRA.n.split(" ")[0]} pediu: {t.nota}. Corrija, fotografe e envie de novo: volta à validação.</span></p>
            {orig && enviosDe(orig).some((e) => e.fotos?.length) && <><p className="mt-2 text-sm text-muted-foreground">O que enviou antes:</p><Miniaturas fotos={enviosDe(orig).flatMap((e) => e.fotos ?? []).slice(-3)} tam="h-16 w-24" /></>}
          </div>
        ) : t.nota && <p className="flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/[0.08] px-3 py-2.5 text-[15px]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" /><span><b className="font-medium">Das Operações:</b> {t.nota}</span></p>}
        {ex === "corrigir" && t.exec?.motivo && (
          <p className="flex items-start gap-2 rounded-xl bg-destructive/[0.07] px-3 py-2.5 text-[15px]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" /><span><b className="font-medium">{RESPONSAVEL_OBRA.n.split(" ")[0]} pediu uma correção:</b> {t.exec.motivo}. Corrija e envie um novo registo.</span></p>
        )}

        {im && (
          <p role="status" className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/[0.06] px-3 py-2.5 text-[15px]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            <span><b className="font-semibold">Parada por um imprevisto:</b> {im.texto}. Não avance nesta tarefa: {im.estado === "proposta" ? "o cliente está a decidir a proposta" : im.estado === "recusado" ? "o responsável está a decidir" : "o responsável prepara a proposta ao cliente"}. Recebe um aviso quando puder continuar.</span></p>
        )}

        {/* 1. antes de começar */}
        <section aria-labelledby={`antes-${ti}`}>
          <button type="button" onClick={() => setAbertoAntes(!abertoAntes)} aria-expanded={abertoAntes} className="flex min-h-11 w-full items-center justify-between gap-3 text-left">
            <h3 id={`antes-${ti}`} className="flex items-center gap-2 text-[17px] font-semibold tracking-tight"><Num n={1} ok={ex !== "por fazer"} />Antes de começar</h3>
            <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform", abertoAntes && "rotate-180")} aria-hidden="true" />
          </button>
          {abertoAntes && (
            <div className="mt-2 space-y-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
              <Preparacao d={d} ti={ti} />
              {ex === "por fazer" && !im && (
                <Button size="lg" className="w-full sm:w-auto" onClick={() => run(() => { A.comecarTarefa(d.id, ti); setAbertoAntes(false); })}><HardHat className="mr-2 h-4 w-4" aria-hidden="true" />Começar a tarefa</Button>
              )}
            </div>
          )}
        </section>

        {ex !== "por fazer" && ex !== "feita" && !im && (
          <>
            {/* 2. o passo a passo */}
            <section aria-labelledby={`passos-${ti}`} className="border-t border-border pt-5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 id={`passos-${ti}`} className="flex items-center gap-2 text-[17px] font-semibold tracking-tight"><Num n={2} ok={todos} />Passo a passo</h3>
                <span className="text-sm tabular-nums text-muted-foreground">{feitos.length} de {I.passos.length}</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="h-full rounded-full bg-primary motion-safe:transition-[width] duration-500" style={{ width: `${(feitos.length / I.passos.length) * 100}%` }} /></div>
              <ul className="mt-3 space-y-2">
                {I.passos.map((x, i) => {
                  const on = feitos.includes(i);
                  return (
                    <li key={x}>
                      <button type="button" role="checkbox" aria-checked={on} onClick={() => run(() => A.marcarPasso(d.id, ti, i))}
                        className={cn("flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left text-[15px] transition-all active:scale-[0.99]", on ? "border-success/40 bg-success/[0.07]" : "border-input bg-card hover:border-foreground/40")}>
                        <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 transition-colors", on ? "border-success bg-success text-white" : "border-input")}>{on && <Check className="h-4 w-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200" aria-hidden="true" />}</span>
                        <span className={cn(on && "text-muted-foreground line-through decoration-muted-foreground/50")}>{x}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {(todos || ultimoDia) && (
                <div className="mt-4 rounded-xl bg-muted/60 p-3">
                  <p className="text-sm font-medium">Antes de dar por feita, verifique</p>
                  <ul className="mt-1.5 space-y-1 text-[15px]">{I.verificar.map((x) => <li key={x} className="flex gap-2"><Check className="mt-1 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />{x}</li>)}</ul>
                </div>
              )}
            </section>

            {/* 3. o registo de hoje */}
            <section aria-labelledby={`reg-${ti}`} className="border-t border-border pt-5">
              <h3 id={`reg-${ti}`} className="flex items-center gap-2 text-[17px] font-semibold tracking-tight"><Num n={3} ok={envHoje.length > 0} />Registo de hoje</h3>
              {envHoje.length > 0 && !mais ? (
                // enviado: o que foi (como o responsável e o cliente o veem) e, se for preciso, mais um registo
                <div className="mt-3 rounded-xl border border-success/30 bg-success/[0.06] p-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
                  <p className="flex items-center gap-2 text-[15px] font-medium text-success"><Check className="h-4 w-4" aria-hidden="true" />Registo enviado</p>
                  <ol className="mt-2">{envHoje.map((e, k) => <EnvioItem key={k} e={e} p={p} ultimo={k === envHoje.length - 1} />)}</ol>
                  <div className="mt-2 flex flex-wrap gap-x-5">
                    <button type="button" onClick={() => setMais(true)} className="min-h-11 text-[15px] font-medium text-primary underline-offset-4 hover:underline">{todos || ultimoDia ? "Terminar a tarefa" : "Enviar mais um registo"}</button>
                  </div>
                </div>
              ) : <RegistoDoDia ctx={ctx} d={d} ti={ti} podeTerminar={todos || ultimoDia} cor={cor} enviado={() => setMais(false)} />}
            </section>
          </>
        )}

        {ex === "feita" && (
          <p className="flex items-center gap-2 rounded-xl bg-warning/[0.1] px-3 py-3 text-[15px]"><Clock className="h-5 w-5 shrink-0 text-warning" aria-hidden="true" />Tarefa terminada. À espera da validação de {RESPONSAVEL_OBRA.n}.</p>
        )}

        {/* o histórico e um problema */}
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-4">
          <button type="button" onClick={() => setHist(!hist)} aria-expanded={hist} className="inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium text-primary underline-offset-4 hover:underline">
            {hist ? "Esconder o histórico" : `Histórico da tarefa (${enviosDe(t).length})`}<ChevronDown className={cn("h-4 w-4 transition-transform", hist && "rotate-180")} aria-hidden="true" />
          </button>
          {!problema && <button type="button" onClick={() => setProblema(true)} className="inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"><AlertTriangle className="h-4 w-4" aria-hidden="true" />Registar imprevisto</button>}
        </div>
        {hist && <div className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"><HistoricoTarefa t={t} p={p} /></div>}
        {problema && <RegistarImprevisto ctx={ctx} d={d} ti={ti} fechar={() => setProblema(false)} />}
      </div>
    </article>
  );
}

/** O que preparar para uma tarefa: o que fazer antes, a proteção, o material da fase e o que levar. */
function Preparacao({ d, ti }: { d: Negocio; ti: number }) {
  const p = d.obra.plano!, t = p.tasks[ti], I = instrucoesDe(t);
  const db = useInventario();
  const inv = d.obra.ec?.ref ? resumoEcNegocio(db, d.obra.ec.ref) : null;
  const mats = materiaisPorFase(d, inv).find((g) => g.fase === t.fase)?.itens ?? [];
  const equip = equipamentosDaObra(p).filter((e) => e.tarefas.includes(t.nome) || e.origem === "Frota");
  return (
    <>
      <ul className="space-y-1.5 text-[15px]">{I.antes.map((x) => <li key={x} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />{x}</li>)}</ul>
      <div>
        <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><ShieldCheck className="h-4 w-4" aria-hidden="true" />Proteção</p>
        <ul className="mt-1.5 flex flex-wrap gap-1.5">{I.epi.map((x) => <li key={x} className="rounded-full bg-muted px-2.5 py-1 text-sm">{x}</li>)}</ul>
      </div>
      {mats.length > 0 && (
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><Package className="h-4 w-4" aria-hidden="true" />Material desta fase</p>
          <ul className="mt-1.5 divide-y divide-border rounded-xl border border-border">
            {mats.map((m) => (
              <li key={m.n} className="flex items-center justify-between gap-3 px-3 py-2 text-[15px]">
                <span className="min-w-0">{m.n}</span>
                <span className={cn("shrink-0 text-sm tabular-nums", m.estado === "na obra" || m.estado === "na carrinha" || m.estado === "reservado" ? "text-success" : "text-warning")}>{nfmt(m.q)} {m.un} · {m.estado}{m.quando ? ` ${m.quando}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {equip.length > 0 && (
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><Wrench className="h-4 w-4" aria-hidden="true" />Levar</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">{equip.map((e) => <li key={e.n} className="rounded-full border border-border px-2.5 py-1 text-sm">{e.n}{e.origem === "Aluguer" ? " (aluguer)" : ""}</li>)}</ul>
        </div>
      )}
      <div>
        <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><ListChecks className="h-4 w-4" aria-hidden="true" />O passo a passo</p>
        <ol className="mt-1.5 space-y-1 text-[15px]">{I.passos.map((x, i) => <li key={x} className="flex gap-2"><span className="w-5 shrink-0 text-right tabular-nums text-muted-foreground">{i + 1}.</span>{x}</li>)}</ol>
      </div>
    </>
  );
}

/** 21/10: uma tarefa que vem a seguir: quando começa, quem está a trabalhar antes (ao vivo) e, num toque, o que preparar. */
function TarefaASeguir({ x, eu }: { x: ASeguir; eu: string }) {
  const { d, t, ti, antes, faltam } = x;
  const p = d.obra.plano!, cor = t.fase ? COR_FASE[t.fase] : "#7c5ce0";
  const [aberto, setAberto] = useState(false);
  // a data (o calendário salta os fins de semana: "daqui a N dias" enganava)
  const quando = faltam === 1 ? "amanhã" : rotuloDia(p, t.dia);
  const a = antes?.t, ea = a ? estadoDe(a) : null, outro = !!a && a.tec !== eu;
  const nomeA = a ? (outro ? TECS.find((y) => y.id === a.tec)?.n.split(" ")[0] ?? "a equipa" : "si") : "";
  const hojeA = a ? diaDaTarefa(a, p.dia) : null;
  // o estado do trabalho de antes, em linguagem do terreno
  const frase = !a ? null
    : ea === "validada" || ea === "feita" ? `${outro ? nomeA : "Já"} terminou${outro ? "" : " a sua tarefa"}. Está tudo pronto para si.`
    : hojeA != null ? `${outro ? nomeA : "Você"} ${ea === "por fazer" ? "tem-na hoje" : "está a fazê-la hoje"} (${rotuloDiaTarefa(a, p.dia)}). Acaba ${rotuloDia(p, a.dia + a.dur - 1)}.`
    : a.dia > p.dia ? `${outro ? nomeA : "Você"} começa ${rotuloDia(p, a.dia)} e acaba ${rotuloDia(p, a.dia + a.dur - 1)}.`
    : `Atrasada: devia ter acabado ${rotuloDia(p, a.dia + a.dur - 1)}.`;
  return (
    <article className={cn(CARTAO, "overflow-hidden")} aria-label={`${t.nome} · ${d.nome} · ${quando}`}>
      <div className="flex">
        <span className="w-1.5 shrink-0" style={{ background: cor }} aria-hidden="true" />
        <div className="min-w-0 flex-1 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-semibold" title={t.nome}>{nomeCurtoTarefa(t.nome)}</p>
              <p className="text-sm text-muted-foreground">{d.nome} · {d.f.localidade || d.local.split(",").pop()?.trim()}</p>
            </div>
            <span className="shrink-0 rounded-full bg-primary/[0.08] px-2.5 py-1 text-sm font-medium text-primary first-letter:uppercase">{quando}</span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{faltam === 1 ? `Começa ${rotuloDia(p, t.dia)} · ` : ""}{t.dur === 1 ? "1 dia" : `${t.dur} dias`} · cerca de {hfmt(horasPorDia(t))} h por dia</p>

          {a && (
            // quem trabalha antes: quando acabar, é a vez dele
            <div className={cn("mt-3 rounded-xl p-3", ea === "validada" || ea === "feita" ? "bg-success/[0.07]" : hojeA == null && a.dia <= p.dia ? "bg-warning/[0.1]" : "bg-muted/60")}>
              <p className="text-sm font-medium text-muted-foreground">Antes de si</p>
              <div className="mt-1.5 flex items-center gap-3">
                <AvatarTec id={a.tec} tam="h-9 w-9" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 text-[15px] font-medium"><span title={a.nome}>{nomeCurtoTarefa(a.nome)}</span><ChipEstado e={ea!} /></p>
                </div>
              </div>
              <p className="mt-2 text-[15px]">{frase}</p>
            </div>
          )}

          <button type="button" onClick={() => setAberto(!aberto)} aria-expanded={aberto} className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium text-primary underline-offset-4 hover:underline">
            {aberto ? "Esconder" : "Preparar com antecedência"}<ChevronDown className={cn("h-4 w-4 transition-transform", aberto && "rotate-180")} aria-hidden="true" />
          </button>
          {aberto && <div className="mt-2 space-y-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"><Preparacao d={d} ti={ti} /></div>}
        </div>
      </div>
    </article>
  );
}

function Num({ n, ok }: { n: number; ok: boolean }) {
  return <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold", ok ? "bg-success text-white" : "bg-primary/10 text-primary")} aria-hidden="true">{ok ? <Check className="h-3.5 w-3.5" /> : n}</span>;
}

/** O registo do dia: horas (as previstas para hoje, já sugeridas), fotografias e o que fez. Um envio: vai ao responsável e ao portal. */
function RegistoDoDia({ ctx, d, ti, podeTerminar, cor, enviado }: { ctx: Ctx; d: Negocio; ti: number; podeTerminar: boolean; cor: string; enviado: () => void }) {
  const { A, run } = ctx;
  const p = d.obra.plano!, t = p.tasks[ti];
  const [horas, setHoras] = useState(horasPorDia(t));
  const [fotos, setFotos] = useState<string[]>([]);
  const [nota, setNota] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const [camara, setCamara] = useState(false);
  const juntar = async (f?: File | null) => { if (!f) return; try { const u = await lerFoto(f); setFotos((x) => [...x, u].slice(-4)); } catch { /* sem leitura */ } };
  const falta = [!(horas > 0) && "as horas", !fotos.length && "uma fotografia", !nota.trim() && "o que fez hoje"].filter(Boolean) as string[];
  const enviar = (feita: boolean) => run(() => { A.enviarRegisto(d.id, ti, { horas, fotos, nota, feita }); setFotos([]); setNota(""); enviado(); });
  return (
    <div className="mt-3 space-y-4">
      {camara && <Camara titulo={t.nome} fechar={() => setCamara(false)} tirar={(u) => setFotos((x) => [...x, u].slice(-4))} semCamara={() => { setCamara(false); input.current?.click(); }} />}
      <div>
        <p className="text-sm font-medium text-muted-foreground">Horas de hoje <span className="font-normal">(previstas {hfmt(horasPorDia(t))} h)</span></p>
        <span role="group" aria-label="Horas de hoje" className="mt-1.5 inline-flex items-center rounded-xl border border-input bg-card p-0.5">
          <button type="button" aria-label="Menos meia hora" disabled={horas <= 0} onClick={() => setHoras(Math.max(0, horas - 0.5))} className="grid h-12 w-12 place-items-center rounded-lg hover:bg-muted disabled:opacity-30"><Minus className="h-4 w-4" /></button>
          <output className="min-w-[5.5rem] text-center text-xl font-semibold tabular-nums">{nfmt(horas)} h</output>
          <button type="button" aria-label="Mais meia hora" onClick={() => setHoras(horas + 0.5)} className="grid h-12 w-12 place-items-center rounded-lg hover:bg-muted"><Plus className="h-4 w-4" /></button>
        </span>
      </div>
      <div>
        <p className="text-sm font-medium text-muted-foreground">Fotografias do trabalho <span className="font-normal">(o cliente vê-as no portal)</span></p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {fotos.map((f, k) => (
            <span key={k} className="relative motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
              <img src={f} alt={`Fotografia ${k + 1}`} className="h-20 w-28 rounded-lg border border-border object-cover" />
              <button type="button" aria-label={`Tirar a fotografia ${k + 1}`} onClick={() => setFotos(fotos.filter((_, i) => i !== k))} className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full border border-border bg-card shadow"><X className="h-3.5 w-3.5" /></button>
            </span>
          ))}
          <input ref={input} type="file" accept="image/*" capture="environment" multiple className="sr-only" aria-label="Escolher fotografias" onChange={(e) => { for (const f of Array.from(e.target.files ?? [])) void juntar(f); e.target.value = ""; }} />
          <Button variant="outline" className="min-h-12" onClick={() => (temCamara() ? setCamara(true) : input.current?.click())}><Camera className="mr-1.5 h-4 w-4" aria-hidden="true" />Tirar fotografia</Button>
          {temCamara() && <button type="button" onClick={() => input.current?.click()} className="inline-flex min-h-11 items-center gap-1.5 px-1 text-[15px] font-medium text-primary underline-offset-4 hover:underline">Escolher da galeria</button>}
          <button type="button" onClick={() => setFotos((x) => [...x, fotoExemplo(t.nome, cor, enviosDe(t).length + x.length)].slice(-4))} className="inline-flex min-h-11 items-center gap-1.5 px-1 text-[15px] font-medium text-primary underline-offset-4 hover:underline"><ImagePlus className="h-4 w-4" aria-hidden="true" />Usar uma de exemplo</button>
        </div>
      </div>
      <div>
        <label htmlFor={`nota-${d.id}-${ti}`} className="text-sm font-medium text-muted-foreground">O que fez hoje</label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {RAPIDAS.map((r) => <button key={r} type="button" onClick={() => setNota((n) => (n.trim() ? n.trim() + " " : "") + r)} className="min-h-9 rounded-full border border-input px-3 text-sm hover:border-foreground/40">{r}</button>)}
        </div>
        <textarea id={`nota-${d.id}-${ti}`} value={nota} onChange={(e) => setNota(e.target.value)} rows={3} placeholder="Ex.: assentei as paredes do duche e metade do chão; amanhã betumo as juntas."
          className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2.5 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {podeTerminar ? (
          <>
            <Button size="lg" disabled={!!falta.length} onClick={() => enviar(true)}><Check className="mr-2 h-4 w-4" aria-hidden="true" />Enviar e terminar a tarefa</Button>
            <Button size="lg" variant="outline" disabled={!!falta.length} onClick={() => enviar(false)}>Enviar sem terminar</Button>
          </>
        ) : <Button size="lg" disabled={!!falta.length} onClick={() => enviar(false)}>Enviar o registo de hoje<ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Button>}
      </div>
      {falta.length > 0 && <p className="text-sm text-muted-foreground">Falta {falta.join(", ").replace(/, ([^,]*)$/, " e $1")}.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ a câmara na app (21/10) */
/** Há câmara ao vivo? (precisa de https ou localhost; sem ela, o botão abre a câmara do telemóvel pelo seletor de ficheiros) */
const temCamara = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;

/** A câmara dentro da app: vê-se o que se vai fotografar, tira-se num toque (várias seguidas) e volta-se ao registo. */
function Camara({ titulo, fechar, tirar, semCamara }: { titulo: string; fechar: () => void; tirar: (dataUrl: string) => void; semCamara: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [pronta, setPronta] = useState(false);
  const [flash, setFlash] = useState(0);
  const [n, setN] = useState(0);
  useEffect(() => {
    let fluxo: MediaStream | null = null, vivo = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false })
      .then((s) => {
        if (!vivo) { s.getTracks().forEach((x) => x.stop()); return; }
        fluxo = s;
        if (video.current) { video.current.srcObject = s; void video.current.play().then(() => setPronta(true)).catch(() => setPronta(true)); }
      })
      .catch(() => { if (vivo) semCamara(); });
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") fechar(); };
    window.addEventListener("keydown", esc);
    return () => { vivo = false; fluxo?.getTracks().forEach((x) => x.stop()); window.removeEventListener("keydown", esc); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const disparar = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const k = Math.min(1, 720 / v.videoWidth), c = document.createElement("canvas");
    c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
    c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
    tirar(c.toDataURL("image/jpeg", 0.72));
    setN((x) => x + 1); setFlash((x) => x + 1);
  };
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Câmara" className="fixed inset-0 z-[1000] flex flex-col bg-black text-white animate-in fade-in-0">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="min-w-0 truncate text-[15px]"><span className="text-white/70">Fotografia de</span> {titulo}</p>
        <button type="button" onClick={fechar} aria-label="Fechar a câmara" className="grid h-11 w-11 place-items-center rounded-full bg-white/15 hover:bg-white/25"><X className="h-5 w-5" /></button>
      </div>
      <div className="relative min-h-0 flex-1">
        <video ref={video} playsInline muted className="absolute inset-0 h-full w-full object-contain" />
        {!pronta && <p className="absolute inset-0 grid place-items-center text-white/70">A abrir a câmara…</p>}
        {flash > 0 && <span key={flash} className="pointer-events-none absolute inset-0 bg-white animate-out fade-out-0 duration-300 fill-mode-forwards" aria-hidden="true" />}
      </div>
      <div className="flex items-center justify-between px-6 pb-8 pt-4">
        <span className="w-24 text-sm text-white/80">{n ? `${n} ${n === 1 ? "tirada" : "tiradas"}` : ""}</span>
        <button type="button" onClick={disparar} disabled={!pronta} aria-label="Tirar a fotografia"
          className="grid h-20 w-20 place-items-center rounded-full border-4 border-white transition-transform active:scale-90 disabled:opacity-40"><span className="h-16 w-16 rounded-full bg-white" /></button>
        <button type="button" onClick={fechar} className="w-24 text-right text-[15px] font-semibold">{n ? "Concluído" : "Cancelar"}</button>
      </div>
    </div>,
    document.body,
  );
}

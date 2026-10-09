// "Hoje" do protótipo: a mesma forma do Hoje da Olyvia (src/pages/Home.tsx),
// com as pistas da agenda, das tarefas e dos alertas, mas com os negócios de exemplo.
import {
  ArrowRight, BellRing, CalendarCheck2, CalendarClock, CheckCircle2, ListTodo, MapPin, PartyPopper, Plus, UserRound,
} from "lucide-react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { DayTrack, TrackEmpty, TrackGroup } from "@/components/atividades/DayTrack";
import { cn } from "@/lib/utils";
import { FASES, PAPEIS, aberto, conflitos, eur, minhas, pct, tot, type Estado, type Negocio, type Papel } from "./motor";
import { fazer, type Ctx } from "./pecas";

interface Compromisso { id: string; hora: string; dia?: string; titulo: string; quem: string; onde?: string; acao: string; d: Negocio; atrasado?: boolean }

// A agenda de cada papel, tirada dos negócios.
export function agenda(S: Estado, r: Papel): Compromisso[] {
  const L: Compromisso[] = [];
  for (const d of aberto(S)) {
    const loc = d.f.localidade || d.local.split(",").pop()!.trim();
    // as visitas marcadas de cada negócio (pode haver várias)
    if (r === "comercial") for (const n of d.vis || []) {
      if (d.f[`v${n}_estado`] !== "Marcada") continue;
      const iso = d.f[`v${n}_data`] || "", hoje = new Date().toISOString().slice(0, 10), passou = !!iso && iso < hoje;
      const dia = iso ? new Date(iso + "T12:00:00").toLocaleDateString("pt-PT", { weekday: "short", day: "2-digit", month: "2-digit" }) : "por marcar";
      L.push({ id: `v${d.id}-${n}`, hora: d.f[`v${n}_hora`] || "—", dia, titulo: `${d.f[`v${n}_tipo`] || "Visita"} · ${d.servico}`, quem: d.nome, onde: loc, acao: passou ? "Registar" : "Preparar", d, atrasado: passou });
    }
    if (r === "operacoes" && d.fase === 5 && d.obra.plano?.estado === "em curso")
      L.push({ id: "o" + d.id, hora: "08:00", titulo: `Obra · dia ${d.obra.plano.dia + 1} de ${Math.max(...d.obra.plano.tasks.map((t) => t.dia + t.dur))}`, quem: d.nome, onde: loc, acao: "Abrir plano", d });
    if (r === "armazem" && d.obra.enc && d.obra.enc.estado === "encomendada")
      L.push({ id: "e" + d.id, hora: "—", titulo: "Receber " + d.obra.enc.n, quem: d.obra.enc.forn || "Fornecedor", acao: "Receber", d });
    if (r === "financeiro" && d.fin.fatura && !d.fin.pago)
      L.push({ id: "f" + d.id, hora: "—", titulo: d.fin.fatura.n + " · confirmar a transferência", quem: d.nome, acao: "Validar", d });
  }
  return L;
}

interface Alerta { id: string; n: number; t: string; abrir: () => void }
function alertasDia(S: Estado, A: Ctx["A"], r: Papel): Alerta[] {
  const ab = aberto(S), filtro = (f: string) => () => { A.nav("negocios"); A.filtro(f); };
  const L: Alerta[] = [
    { id: "lead", n: ab.filter((d) => d.fase === 0 && d.atraso).length, t: "Leads sem contacto há mais de 24 h", abrir: filtro("atraso") },
    { id: "prop", n: ab.filter((d) => d.fase === 3 && d.orc?.enviada && !d.orc.aceite).length, t: "Propostas à espera do cliente", abrir: filtro("todos") },
    { id: "aprov", n: ab.filter((d) => d.orc?.aprov === "pedida").length, t: "Exceções à margem por aprovar", abrir: () => A.nav("hoje") },
    { id: "fat", n: ab.filter((d) => d.fase === 4 && !d.fin.fatura).length, t: "Faturas por emitir", abrir: filtro("todos") },
    { id: "pag", n: ab.filter((d) => d.fin.fatura && !d.fin.pago).length, t: "Pagamentos por validar", abrir: filtro("todos") },
    { id: "enc", n: ab.filter((d) => d.obra.enc?.estado === "por confirmar").length, t: "Encomendas ao fornecedor por confirmar", abrir: () => A.nav("inventario") },
    { id: "conf", n: ab.filter((d) => d.obra.plano?.estado === "por aprovar" && conflitos(d.obra.plano).length).length, t: "Planos de obra com conflitos", abrir: () => A.nav("operacoes") },
  ];
  const meus: Record<Papel, string[]> = {
    comercial: ["lead", "prop"], direcao: ["lead", "prop", "aprov", "fat", "pag", "enc", "conf"], financeiro: ["fat", "pag"], armazem: ["enc"], operacoes: ["conf"],
  };
  return L.filter((a) => a.n > 0 && meus[r].includes(a.id));
}

const saudacao = (h: number) => (h < 12 ? "Bom dia" : h < 20 ? "Boa tarde" : "Boa noite");

export function Hoje({ S, A, go }: Ctx) {
  const r = S.role, agora = new Date();
  const tarefas = minhas(S, r);
  const atrasadas = tarefas.filter(({ d }) => d.atraso && d.fase === 0);
  const porFazer = tarefas.filter((x) => !atrasadas.includes(x));
  const ag = agenda(S, r);
  const agHoje = ag.filter((x) => !x.atrasado), agAtras = ag.filter((x) => x.atrasado);
  const al = alertasDia(S, A, r);
  const nAl = al.reduce((a, x) => a + x.n, 0);
  const tudoEmDia = ag.length + tarefas.length + nAl === 0;
  const ab = aberto(S);
  const emNeg = ab.filter((d) => d.fase === 3 && d.orc);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground first-letter:uppercase">{format(agora, "PPPP", { locale: pt })}</p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{saudacao(agora.getHours())}, {PAPEIS[r].nome}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{tudoEmDia ? "Está tudo em dia. Bom trabalho!" : "Isto é o que tem para hoje. Cada linha leva ao sítio onde se resolve."}</p>
          {!tudoEmDia && (
            <ul className="mt-3 flex flex-wrap gap-2">
              <Chip n={ag.length} l="na agenda" tom="bg-info/10 text-info" />
              <Chip n={tarefas.length} l="por fazer" tom="bg-primary/10 text-primary" />
              {atrasadas.length + agAtras.length > 0 && <Chip n={atrasadas.length + agAtras.length} l="em atraso" tom="bg-destructive/10 text-destructive" />}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="flex-1 sm:flex-none" onClick={go(() => A.nav("negocios"))}><ListTodo className="mr-2 h-4 w-4" />Ver os negócios</Button>
          <Button className="flex-1 sm:flex-none" onClick={go(() => A.novo())}><Plus className="mr-2 h-4 w-4" />Novo negócio</Button>
        </div>
      </header>

      {r === "direcao" && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Negócios abertos", String(ab.length)],
            ["Em fase Negócio", eur(emNeg.reduce((a, d) => a + tot(d, S).pf, 0)) + " €"],
            ["Margem média prevista", pct(emNeg.length ? emNeg.reduce((a, d) => a + tot(d, S).m, 0) / emNeg.length : 0)],
            ["Obras em curso", String(ab.filter((d) => d.fase === 5 && d.obra.plano?.estado === "em curso").length)],
          ].map(([l, v], i) => (
            <div key={l} className="rounded-2xl border border-border/70 bg-card p-4 shadow-[var(--shadow-sm)] animate-in fade-in-0 slide-in-from-bottom-2" style={{ animationDelay: i * 60 + "ms", animationFillMode: "both" }}>
              <p className="text-xs text-muted-foreground">{l}</p>
              <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{v}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <DayTrack id="pn-agenda" icon={CalendarClock} title="Agenda" hint="Visitas, obras e entregas" count={ag.length} tone="meeting">
          {ag.length === 0 ? (
            <TrackEmpty icon={PartyPopper} tone="meeting" message="Nada marcado para si. Aproveite para adiantar trabalho." />
          ) : (
            <>
              <TrackGroup label="Ficou por fechar" count={agAtras.length} tone="overdue">
                <ul className="space-y-2">{agAtras.map((c) => <LinhaAgenda key={c.id} c={c} abrir={go(() => A.abrir(c.d.id))} />)}</ul>
              </TrackGroup>
              {agHoje.length > 0 && <ul className="space-y-2">{agHoje.map((c) => <LinhaAgenda key={c.id} c={c} abrir={go(() => A.abrir(c.d.id))} />)}</ul>}
            </>
          )}
        </DayTrack>

        <DayTrack id="pn-tarefas" icon={ListTodo} title="Por fazer" hint="O próximo passo de cada negócio seu" count={tarefas.length} tone="task">
          {tarefas.length === 0 ? (
            <TrackEmpty icon={CalendarCheck2} tone="task" message='Nada por tratar. Mude de papel em "A ver como" para ver o trabalho dos outros.' />
          ) : (
            <>
              <TrackGroup label="Em atraso" count={atrasadas.length} tone="overdue">
                <ul className="space-y-1">{atrasadas.map((x) => <LinhaTarefa key={x.d.id} x={x} ctx={{ A, go }} atraso />)}</ul>
              </TrackGroup>
              {porFazer.length > 0 && <ul className="space-y-1">{porFazer.map((x) => <LinhaTarefa key={x.d.id} x={x} ctx={{ A, go }} />)}</ul>}
            </>
          )}
        </DayTrack>

        <div className="lg:col-span-2">
          <DayTrack id="pn-alertas" icon={BellRing} title="Alertas por tratar" hint="O que está parado à espera de alguém" count={nAl} tone="task">
            {al.length === 0 ? (
              <TrackEmpty icon={CheckCircle2} tone="task" message="Sem alertas. Nada está parado." />
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {al.map((a, i) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-card px-3 py-2.5 animate-in fade-in-0 slide-in-from-bottom-1" style={{ animationDelay: i * 50 + "ms", animationFillMode: "both" }}>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="grid h-8 min-w-8 shrink-0 place-items-center rounded-lg bg-warning/15 px-2 font-mono text-sm font-semibold tabular-nums text-warning">{a.n}</span>
                      <span className="truncate text-sm font-medium text-foreground">{a.t}</span>
                    </div>
                    <Button size="sm" variant="outline" className="shrink-0" onClick={go(a.abrir)}>Abrir<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button>
                  </li>
                ))}
              </ul>
            )}
          </DayTrack>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-primary/30 bg-primary/[0.03] px-4 py-3 text-sm text-muted-foreground">
        <b className="text-foreground">Como experimentar:</b> abra a
        <button type="button" className="font-semibold text-primary hover:underline" onClick={go(() => A.abrir(1043))}>Ana Martins</button>
        e siga o próximo passo, da lead à obra. Alguns passos são de outros papéis: mude em "A ver como", no topo.
      </div>
    </div>
  );
}

function Chip({ n, l, tom }: { n: number; l: string; tom: string }) {
  return <li className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm", tom)}><span className="font-mono font-semibold tabular-nums">{n}</span><span>{l}</span></li>;
}

function LinhaAgenda({ c, abrir }: { c: Compromisso; abrir: () => void }) {
  return (
    <li className={cn("flex flex-col gap-2 rounded-xl border px-3 py-2.5 transition hover:shadow-[var(--shadow-sm)] sm:flex-row sm:items-center sm:gap-3 animate-in fade-in-0",
      c.atrasado ? "border-destructive/30 bg-destructive/[0.04]" : "border-border/70 bg-card")}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="w-12 shrink-0 pt-0.5 text-right">
          <div className={cn("font-mono text-sm font-semibold leading-none tabular-nums", c.atrasado ? "text-destructive" : "text-foreground")}>{c.hora}</div>
          {c.dia && <div className={cn("mt-1 text-[11px] leading-none", c.atrasado ? "text-destructive/80" : "text-muted-foreground")}>{c.dia}</div>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{c.titulo}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-1"><UserRound className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{c.quem}</span></span>
            {c.onde && <span className="inline-flex min-w-0 items-center gap-1"><MapPin className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{c.onde}</span></span>}
          </div>
        </div>
      </div>
      <Button size="sm" variant="outline" className="w-full shrink-0 sm:w-auto" onClick={abrir}>{c.acao}<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Button>
    </li>
  );
}

function LinhaTarefa({ x, ctx, atraso }: { x: ReturnType<typeof minhas>[number]; ctx: Pick<Ctx, "A" | "go">; atraso?: boolean }) {
  const { A, go } = ctx, { d, p, dir } = x;
  return (
    <li className="group flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-muted/50 animate-in fade-in-0">
      <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[11px] font-semibold", atraso ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary")}>{FASES[d.fase].slice(0, 3)}</span>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={go(() => A.abrir(d.id))}>
        <p className="truncate text-sm font-semibold text-foreground group-hover:text-primary">{d.nome} · {d.servico}</p>
        <p className="truncate text-xs text-muted-foreground">{p.t}{p.sub ? " · " + p.sub : ""}{atraso ? " · há 2 dias" : ""}</p>
      </button>
      {dir ? (
        <span className="flex shrink-0 gap-1.5">
          <Button size="sm" variant="outline" onClick={go(() => A.recusarAprov(d.id))}>Recusar</Button>
          <Button size="sm" onClick={go(() => A.aprovar(d.id))}>Aprovar</Button>
        </span>
      ) : p.btn ? <Button size="sm" className="shrink-0" onClick={go(() => fazer(A, p.act!, d.id))}>{p.btn}</Button> : null}
    </li>
  );
}

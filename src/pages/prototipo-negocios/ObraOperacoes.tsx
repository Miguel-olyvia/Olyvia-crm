// As Operações no V1 (15/10/2026, refeitas): a lista de obras e a página da obra, com muito mais detalhe e tudo guiado.
// · Lista: por estado (por arrancar, em curso, concluídas), com a fase, o progresso, a equipa, o próximo marco e os alertas.
// · Página da obra: o que fazer agora (um primário), o plano por dia (com os ajustes das Operações antes de arrancar e o estado
//   de cada tarefa ao vivo), hoje na obra (a app do técnico, simulada: horas, fotografia, "Marcar como feita"), por validar
//   (o supervisor valida ou pede correção), a equipa, os equipamentos, os materiais por fase, o diário, a segurança e os custos.
// O ciclo da tarefa é o da app das obras (operacao-app), muito mais simples: um toque de cada vez.
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, Camera, Check, CheckCircle2, Circle, ClipboardCheck, Clock, FileWarning, HardHat, ImagePlus,
  MapPin, Minus, NotebookPen, Phone, Plus, RotateCcw, ShieldCheck, Store, Truck, Wrench, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PAPEIS, TECS, aberto, conflitos, diaDeFerias, eur, nfmt, type Negocio, type Papel, type Tarefa } from "./motor";
import { COR_FASE, dataCurta, iniciosRapidos, isoDia } from "./planoObra";
import { FASES_OBRA } from "./fasesObra";
import { entregaTarde, faltaParaArrancar, inicioDoPlano, rotuloDia, tecnicosPara } from "./preparacaoObra";
import { diferencas, fimDe, inicioMinimo, mexida } from "./ajustesPlano";
import {
  RESPONSAVEL_OBRA, ROTULO_EXEC, custoHoraDe, custosObra, equipaDaObra, equipamentosDaObra, estadoDe, faltaParaFeita, fotoExemplo,
  iniciais, materiaisPorFase, porValidar, progresso, quandoEquip, seguranca, tarefasDoDia, type EstadoExec, type EstadoMat,
} from "./obraOps";
import type { Ctx } from "./pecas";

const ESTADO_PLANO: Record<string, string> = {
  "por aprovar": "plano por aprovar", aprovado: "pronta a arrancar", "em curso": "em curso", "concluída": "concluída",
};
const CARTAO = "rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]";
const H2 = "text-lg font-semibold";
const NOTA = "text-[15px] text-muted-foreground";
const COR_TEC = ["#7c5ce0", "#0e7490", "#b45309", "#be185d", "#15803d", "#4338ca"];
const corTec = (id: string | null) => COR_TEC[Math.max(0, TECS.findIndex((x) => x.id === id)) % COR_TEC.length];

function Mudar({ ctx, papel }: { ctx: Ctx; papel: Papel }) {
  return (
    <p className={NOTA}>
      Este passo é de {PAPEIS[papel].n}.{" "}
      <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={ctx.go(() => ctx.A.role(papel))}>Mudar para {PAPEIS[papel].n.split(" · ")[0]}</button>
    </p>
  );
}
function Avatar({ id, n, tam = "h-8 w-8" }: { id: string | null; n: string; tam?: string }) {
  return <span className={cn("grid shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white ring-2 ring-card", tam)} style={{ background: corTec(id) }} title={n} aria-hidden="true">{iniciais(n)}</span>;
}
/** − valor + com alvos de 44 px. */
function Passo({ rot, valor, menos, mais, desMenos, desMais }: { rot: string; valor: ReactNode; menos: () => void; mais: () => void; desMenos?: boolean; desMais?: boolean }) {
  return (
    <span role="group" aria-label={rot} className="inline-flex items-center rounded-lg border border-input bg-card p-0.5">
      <button type="button" aria-label={`Menos · ${rot}`} disabled={desMenos} onClick={menos} className="grid h-11 w-11 place-items-center rounded-md hover:bg-muted disabled:opacity-30"><Minus className="h-4 w-4" /></button>
      <output className="min-w-[7.5rem] px-1 text-center text-[15px] font-medium tabular-nums">{valor}</output>
      <button type="button" aria-label={`Mais · ${rot}`} disabled={desMais} onClick={mais} className="grid h-11 w-11 place-items-center rounded-md hover:bg-muted disabled:opacity-30"><Plus className="h-4 w-4" /></button>
    </span>
  );
}
const dias = (n: number) => `${nfmt(n)} ${n === 1 ? "dia" : "dias"}`;

/** O estado da tarefa na obra: a cor e o ícone (iguais no Gantt, nas listas e na app do técnico). */
const TOM_EXEC: Record<EstadoExec, string> = {
  "por fazer": "bg-muted text-muted-foreground", "em curso": "bg-primary/10 text-primary", feita: "bg-warning/15 text-foreground",
  validada: "bg-success/15 text-foreground", corrigir: "bg-destructive/10 text-destructive",
};
function ChipExec({ e }: { e: EstadoExec }) {
  const I = e === "validada" ? CheckCircle2 : e === "feita" ? Clock : e === "corrigir" ? AlertTriangle : e === "em curso" ? HardHat : Circle;
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-sm font-medium", TOM_EXEC[e])}><I className="h-3.5 w-3.5" aria-hidden="true" />{ROTULO_EXEC[e]}</span>;
}

/** Reduz uma fotografia a 480 px (dataURL JPEG pequeno, para caber no estado do protótipo). */
function lerFoto(f: File): Promise<string> {
  return new Promise((ok, falha) => {
    const r = new FileReader();
    r.onerror = () => falha(r.error);
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 480 / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d")?.drawImage(img, 0, 0, c.width, c.height);
        try { ok(c.toDataURL("image/jpeg", 0.72)); } catch { ok(String(r.result)); }
      };
      img.onerror = () => ok(String(r.result));
      img.src = String(r.result);
    };
    r.readAsDataURL(f);
  });
}

/* ================================================================== a lista de obras */
export function ListaObras(ctx: Ctx) {
  const { S, A, go } = ctx;
  const obras = aberto(S).filter((x) => x.obra.plano && (x.fase === 5 || (x.fase === 4 && x.obra.ec)));
  const grupos: [string, Negocio[]][] = [
    ["Em curso", obras.filter((o) => o.obra.plano!.estado === "em curso")],
    ["Por arrancar", obras.filter((o) => o.obra.plano!.estado === "por aprovar" || o.obra.plano!.estado === "aprovado")],
    ["Concluídas", obras.filter((o) => o.obra.plano!.estado === "concluída")],
  ];
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <h1 className="text-3xl font-semibold tracking-tight">Operações</h1>
      <p className="mt-2 text-lg text-muted-foreground">As obras chegam aqui sozinhas quando o contrato é assinado, com o plano do orçamento por aprovar.</p>
      {!obras.length && <p className={cn(NOTA, "mt-8")}>Ainda não há obras. Aparecem quando o cliente assina o contrato.</p>}
      {grupos.filter(([, L]) => L.length).map(([titulo, L]) => (
        <section key={titulo} aria-label={titulo} className="mt-8">
          <h2 className="text-[15px] font-semibold">{titulo} <span className="font-normal text-muted-foreground">· {L.length}</span></h2>
          <ul className="mt-2 space-y-3">
            {L.map((o) => {
              const p = o.obra.plano!, fim = fimDe(p.tasks), eq = equipaDaObra(p), pv = porValidar(p).length;
              const corr = p.tasks.filter((t) => estadoDe(t) === "corrigir").length, nc = conflitos(p).length;
              const e = o.obra.enc, faltaMat = !!e && e.estado !== "recebida";
              const tHoje = p.estado === "em curso" ? p.tasks.find((t) => t.dia <= p.dia && p.dia < t.dia + t.dur) : null;
              const fase = tHoje?.fase ?? p.tasks[0]?.fase;
              const pr = progresso(p);
              const marco = p.estado === "por aprovar" ? "Aprovar o plano"
                : p.estado === "aprovado" ? (faltaParaArrancar(o).length ? `Para arrancar falta ${faltaParaArrancar(o).filter((f) => !/plano/.test(f)).join(", ")}` : `Arrancar a ${rotuloDia(p, 0)}`)
                : p.estado === "em curso" ? `Dia ${p.dia + 1} de ${fim} · acaba a ${rotuloDia(p, fim - 1)}` : "Obra concluída";
              const alertas: [ReactNode, string][] = [
                ...(nc ? [[<AlertTriangle key="c" className="h-4 w-4 text-warning" aria-hidden="true" />, `${nc} conflito de férias`] as [ReactNode, string]] : []),
                ...(faltaMat && p.estado !== "concluída" ? [[<Truck key="m" className="h-4 w-4 text-warning" aria-hidden="true" />, e!.entrega ? `material chega a ${e!.entrega}` : "material por chegar"] as [ReactNode, string]] : []),
                ...(pv ? [[<ClipboardCheck key="v" className="h-4 w-4 text-primary" aria-hidden="true" />, `${pv} por validar`] as [ReactNode, string]] : []),
                ...(corr ? [[<FileWarning key="r" className="h-4 w-4 text-destructive" aria-hidden="true" />, `${corr} a corrigir`] as [ReactNode, string]] : []),
              ];
              return (
                <li key={o.id}>
                  <button type="button" onClick={go(() => A.abrirPlano(o.id))}
                    className={cn(CARTAO, "group block w-full p-4 text-left transition-[border-color,box-shadow] hover:border-foreground/30 sm:p-5")}>
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block text-base font-semibold">{o.nome} <span className="font-normal text-muted-foreground">· {o.servico}</span></span>
                        <span className="flex items-center gap-1 text-[15px] text-muted-foreground"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{o.f.morada || o.local}</span>
                      </span>
                      <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </span>
                    <span className="mt-3 flex items-center gap-3">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true"><span className="block h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.round(pr * 100)}%` }} /></span>
                      <span className="text-sm tabular-nums text-muted-foreground">{Math.round(pr * 100)}%</span>
                    </span>
                    <span className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                      <span className="text-[15px]">
                        {fase ? <><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: COR_FASE[fase] }} aria-hidden="true" />{p.estado === "em curso" ? "Fase " : "Começa pela fase "}{fase} · {FASES_OBRA[fase - 1].curto}</> : ESTADO_PLANO[p.estado]}
                        <span className="block text-sm text-muted-foreground">{marco}</span>
                      </span>
                      <span className="flex -space-x-2" aria-label={`Equipa: ${eq.map((m) => m.n).join(", ")}`}>{eq.slice(0, 5).map((m) => <Avatar key={m.id} id={m.id} n={m.n} />)}</span>
                    </span>
                    {alertas.length > 0 && (
                      <span className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-sm">
                        {alertas.map(([I, t]) => <span key={t} className="inline-flex items-center gap-1.5">{I}{t}</span>)}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ================================================================== a página da obra */
type Seccao = "plano" | "hoje" | "validar" | "equipa" | "equip" | "mat" | "diario" | "seg" | "custos";

export function PaginaObra({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const { S, A, go } = ctx;
  const p = d.obra.plano!, C = conflitos(p), pode = S.role === "operacoes", direcao = S.role === "direcao";
  const novo = p.origem === "orcamento";
  const e = d.obra.enc;
  const fim = fimDe(p.tasks), ultimo = fim - 1;
  const horas = p.tasks.reduce((a, t) => a + t.h, 0);
  const PV = porValidar(p);
  const F = d.obra.ec ? faltaParaArrancar(d).filter((f) => !/plano/.test(f)) : (!e || e.estado === "recebida" ? [] : ["receber os materiais"]);
  const tarde = entregaTarde(d);
  const muda = pode && (p.estado === "por aprovar" || p.estado === "aprovado");
  const [aberta, setAberta] = useState<number | null>(null);
  const irPara = (s: Seccao) => document.getElementById(`obra-${s}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  let frase = "", botao: ReactNode = null;
  if (p.estado === "por aprovar") {
    frase = C.length ? "Há um técnico de férias numa tarefa. Troque-o ou adie a tarefa antes de aprovar." : "O plano está pronto para aprovar. Confirme as datas e os técnicos; pode ajustar qualquer tarefa.";
    botao = <Button size="lg" disabled={!!C.length} onClick={go(() => A.aprovarPlano(d.id))}>Aprovar o plano</Button>;
  } else if (p.estado === "aprovado") {
    frase = F.length ? `Plano aprovado. Para arrancar, falta ${F.join(", ")}.` : "Plano aprovado e tudo pronto. Pode arrancar.";
    botao = <Button size="lg" disabled={!!F.length} onClick={go(() => A.arrancar(d.id))}>Arrancar a obra</Button>;
  } else if (p.estado === "em curso") {
    const sem = p.tasks.filter((t) => estadoDe(t) !== "validada").length;
    frase = PV.length
      ? `Obra em curso, no dia ${p.dia + 1} de ${fim}. ${PV.length === 1 ? "Há 1 tarefa feita" : `Há ${PV.length} tarefas feitas`} à espera da sua validação.`
      : `Obra em curso, no dia ${p.dia + 1} de ${fim}. Acaba a ${rotuloDia(p, ultimo)}.${sem ? ` ${sem === 1 ? "1 tarefa ainda não validada" : `${sem} tarefas ainda não validadas`}: sem registo, contam as horas previstas.` : " Tudo validado."}`;
    botao = PV.length
      ? <Button size="lg" onClick={() => irPara("validar")}>Validar {PV.length === 1 ? "1 tarefa" : `${PV.length} tarefas`}<ArrowRight className="ml-2 h-4 w-4" /></Button>
      : <Button size="lg" onClick={go(() => A.fimObra(d.id))}>Registar o fim da obra</Button>;
  } else frase = "Obra concluída.";

  const secoes: [Seccao, string, boolean][] = [
    ["plano", "Plano", true], ["hoje", "Hoje na obra", p.estado === "em curso"], ["validar", "Por validar", p.estado === "em curso"],
    ["equipa", "Equipa", true], ["equip", "Equipamentos", true], ["mat", "Materiais", true], ["diario", "Diário", true],
    ["seg", "Segurança", true], ["custos", "Custos", direcao || pode],
  ];
  const morada = d.f.morada || d.local;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-6 sm:px-8 sm:pt-10">
      <button type="button" onClick={go(() => A.nav("operacoes"))} className="inline-flex min-h-11 items-center gap-2 text-[15px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Operações
      </button>

      {/* ------------------------------------------------ cabeçalho */}
      <header className="mt-2">
        <p className="text-sm font-medium text-muted-foreground">Obra #{d.id} · {ESTADO_PLANO[p.estado]}</p>
        <h1 className="mt-0.5 text-3xl font-semibold tracking-tight">{d.nome}</h1>
        <p className="mt-1 text-base text-muted-foreground">{d.servico} · {p.tasks.length} {p.tasks.length === 1 ? "tarefa" : "tarefas"} · {nfmt(horas)} h de equipa{p.tasks.length ? ` · ${rotuloDia(p, 0)} a ${rotuloDia(p, ultimo)}` : ""}</p>
        <dl className="mt-4 grid gap-x-6 gap-y-3 text-[15px] sm:grid-cols-3">
          <div className="min-w-0"><dt className="text-sm text-muted-foreground">Morada</dt>
            <dd><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(morada)}`} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1.5 font-medium text-primary underline-offset-4 hover:underline"><MapPin className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />{morada}</a></dd></div>
          <div><dt className="text-sm text-muted-foreground">Cliente</dt>
            <dd><a href={`tel:${d.tel.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"><Phone className="h-4 w-4" aria-hidden="true" />{d.tel}</a></dd></div>
          <div><dt className="text-sm text-muted-foreground">{RESPONSAVEL_OBRA.papel}</dt>
            <dd>{RESPONSAVEL_OBRA.n} · <a href={`tel:${RESPONSAVEL_OBRA.tel.replace(/\s/g, "")}`} className="text-primary underline-offset-4 hover:underline">{RESPONSAVEL_OBRA.tel}</a></dd></div>
        </dl>
      </header>

      {/* ------------------------------------------------ o que fazer agora (um primário) */}
      <section aria-label="O que fazer" className={cn(CARTAO, "mt-6 p-5")}>
        <p className="text-lg">{frase}</p>
        {tarde && (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-[15px]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <span>Os materiais chegam a {dataCurta(tarde.entrega)} e a obra começa a {dataCurta(tarde.inicio)}. Sem os materiais, a equipa fica parada.</span></p>
            {pode ? <Button variant="outline" className="min-h-11 shrink-0" onClick={go(() => A.inicioPlano(d.id, isoDia(tarde.depois)))}>Começar a {dataCurta(tarde.depois)}</Button> : <Mudar ctx={ctx} papel="operacoes" />}
          </div>
        )}
        {d.obra.ec && p.estado !== "em curso" && p.estado !== "concluída" && (
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[15px]" aria-label="Condições para arrancar">
            {([["Encomenda aprovada", d.obra.ec.estado === "aprovada"], ["Materiais recebidos", d.obra.ec.estado === "aprovada" && (!e || e.estado === "recebida")], ["Plano aprovado", p.estado !== "por aprovar"], ["Sinal pago", d.fin.pago]] as [string, boolean][]).map(([t, ok]) => (
              <li key={t} className={cn("inline-flex items-center gap-1.5", !ok && "text-muted-foreground")}>
                {ok ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <Circle className="h-4 w-4" aria-hidden="true" />}{t}<span className="sr-only">{ok ? " (feito)" : " (por fazer)"}</span>
              </li>
            ))}
          </ul>
        )}
        {C.map((c) => {
          const ti = p.tasks.indexOf(c.t);
          const alt = TECS.find((x) => x.sk === c.t.sk && x.id !== c.tec.id && diaDeFerias(x, p, c.t.dia, c.t.dur) == null);
          return (
            <div key={ti} className="mt-4 grid gap-3 sm:grid-cols-2">
              {alt && (
                <button type="button" disabled={!pode} onClick={go(() => A.trocar(d.id, ti))} className="min-h-11 rounded-xl border border-border p-4 text-left transition-colors hover:border-foreground disabled:opacity-60">
                  <span className="block text-[15px] font-medium">Trocar por {alt.n}</span>
                  <span className={NOTA}>{alt.sk}, livre nesses dias, mesmo custo por hora. A obra não atrasa.</span>
                </button>
              )}
              <button type="button" disabled={!pode} onClick={go(() => A.adiar(d.id, ti))} className="min-h-11 rounded-xl border border-border p-4 text-left transition-colors hover:border-foreground disabled:opacity-60">
                <span className="block text-[15px] font-medium">Adiar {c.t.nome.toLowerCase()}</span>
                <span className={NOTA}>{c.tec.n.split(" ")[0]} faz quando voltar de férias. A obra acaba mais tarde.</span>
              </button>
            </div>
          );
        })}
        {p.estado !== "concluída" && <div className="mt-5 flex flex-wrap items-center gap-3">{pode ? botao : <Mudar ctx={ctx} papel="operacoes" />}</div>}
      </section>

      {/* ------------------------------------------------ as secções da obra, num toque */}
      <nav aria-label="Secções da obra" className="sticky top-0 z-10 -mx-4 mt-6 flex gap-2 overflow-x-auto bg-background/95 px-4 py-2 backdrop-blur [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)] sm:[mask-image:none]">
        {secoes.filter(([, , v]) => v).map(([k, t]) => (
          <button key={k} type="button" onClick={() => irPara(k)} className="min-h-10 shrink-0 whitespace-nowrap rounded-full border border-input bg-card px-4 text-[15px] hover:border-foreground/40">
            {t}{k === "validar" && PV.length > 0 && <span className="ml-1.5 rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">{PV.length}</span>}
          </button>
        ))}
      </nav>

      <PlanoGantt ctx={ctx} d={d} aberta={aberta} setAberta={setAberta} muda={muda} />
      {p.estado === "em curso" && <HojeNaObra ctx={ctx} d={d} />}
      {p.estado === "em curso" && <PorValidar ctx={ctx} d={d} />}
      <EquipaObra d={d} direcao={direcao} />
      <EquipamentosObra d={d} />
      <MateriaisObra ctx={ctx} d={d} />
      <DiarioObra ctx={ctx} d={d} pode={pode || direcao} />
      <SegurancaObra ctx={ctx} d={d} pode={pode} />
      {(direcao || pode) && <CustosObra d={d} />}
      {novo ? null : <p className={cn(NOTA, "mt-8")}>Plano de exemplo (antes do circuito do orçamento).</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ o plano por dia (Gantt), com os ajustes e o estado ao vivo */
function PlanoGantt({ ctx, d, aberta, setAberta, muda }: { ctx: Ctx; d: Negocio; aberta: number | null; setAberta: (i: number | null) => void; muda: boolean }) {
  const { A, run } = ctx;
  const p = d.obra.plano!, C = conflitos(p), novo = p.origem === "orcamento";
  const fim = Math.max(1, fimDe(p.tasks)), nd = fim;
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(720);
  useEffect(() => {
    const el = caixa.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setLargura(el.clientWidth)); ro.observe(el); setLargura(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const PAD = 16, visivel = Math.max(240, largura - 2 * PAD), colW = Math.max(56, visivel / nd), gradeW = colW * nd, linhaW = Math.min(visivel, gradeW);
  const X = (k: number) => k * colW;
  const hoje = p.estado === "em curso" ? p.dia : null;
  const D = diferencas(p);
  const custoMais = D.horas > 0 ? p.tasks.reduce((a, t, i) => a + Math.max(0, t.h - (p.base?.[i]?.h ?? t.h)) * custoHoraDe(t.tec), 0) : 0;
  const rapidos = iniciosRapidos(new Date());
  const inicio = inicioDoPlano(p);
  const grupos = novo ? [...new Set(p.tasks.map((t) => t.fase ?? 0))].sort() : [0];
  const painel = useRef<HTMLDivElement>(null);
  useEffect(() => { if (aberta != null) painel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [aberta]);

  return (
    <section id="obra-plano" aria-labelledby="obra-plano-t" className="mt-8 scroll-mt-16">
      <h2 id="obra-plano-t" className={H2}>Plano</h2>
      <p className="mt-1 text-[15px]">
        <b className="font-semibold tabular-nums">{dias(fim)} úteis</b> · acaba a {rotuloDia(p, fim - 1)}
        {D.dias !== 0 && <span className={cn("ml-1 font-medium", D.dias > 0 ? "text-warning" : "text-success")}>· {D.dias > 0 ? "+" : "−"}{dias(Math.abs(D.dias))} face ao orçamento</span>}
      </p>
      {D.horas > 0 && <p className="mt-1 flex items-start gap-2 text-sm text-warning"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />+{nfmt(D.horas)} h de equipa: cerca de +{eur(custoMais)} € de custo. O preço ao cliente não muda.</p>}
      {muda && (
        <p className={cn(NOTA, "mt-1")}>
          Toque numa tarefa para a ajustar: dias, início, técnico e nota.{p.estado === "aprovado" && " Mudar o plano aprovado volta a pô-lo por aprovar."}
          {D.mexidas.length > 0 && <> <button type="button" onClick={() => run(() => A.reporPlano(d.id))} className="inline-flex min-h-9 items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />Repor o plano do orçamento</button></>}
        </p>
      )}

      {novo && inicio && muda && (
        <div className="mt-4">
          <p className="text-[15px] font-medium">Começa</p>
          <div role="group" aria-label="Início da obra" className="mt-2 flex flex-wrap gap-2">
            {rapidos.map((r) => {
              const on = isoDia(r.data) === isoDia(inicio);
              return (
                <button key={r.k} type="button" aria-pressed={on} onClick={() => run(() => A.inicioPlano(d.id, isoDia(r.data)))}
                  className={cn("min-h-11 rounded-full border px-4 text-[15px] transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-foreground/40")}>
                  {r.nome}<span className={cn("ml-1.5 text-sm", on ? "text-primary-foreground/85" : "text-muted-foreground")}>{dataCurta(r.data)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div ref={caixa} className={cn(CARTAO, "mt-4 overflow-x-auto")}>
        <div className="relative" style={{ width: gradeW + 2 * PAD, paddingLeft: PAD, paddingRight: PAD }}>
          {/* os dias úteis; hoje marcado */}
          <div className="relative h-12 border-b border-border" style={{ width: gradeW }} aria-hidden="true">
            {Array.from({ length: nd }, (_, k) => {
              const [ds, dn] = rotuloDia(p, k).replace(",", "").split(" ");
              return (
                <div key={k} className={cn("absolute bottom-0 top-0 pt-1.5 text-center", hoje === k && "rounded-t-lg bg-primary/10")} style={{ left: X(k), width: colW }}>
                  <span className={cn("block text-[11px] leading-4", hoje === k ? "font-semibold text-primary" : "text-muted-foreground")}>{hoje === k ? "hoje" : ds}</span>
                  <span className="block text-sm font-medium tabular-nums leading-5">{dn}</span>
                </div>
              );
            })}
          </div>
          <div className="pointer-events-none absolute bottom-0 top-12" style={{ left: PAD, width: gradeW }} aria-hidden="true">
            {Array.from({ length: nd - 1 }, (_, k) => <div key={k} className="absolute bottom-0 top-0 border-l border-border/50" style={{ left: X(k + 1) }} />)}
            {hoje != null && <div className="absolute bottom-0 top-0 bg-primary/[0.06]" style={{ left: X(hoje), width: colW }} />}
          </div>

          <ul aria-label="Tarefas da obra" className="relative py-2">
            {grupos.flatMap((g) => {
              const L = p.tasks.map((t, i) => ({ t, i })).filter(({ t }) => !novo || (t.fase ?? 0) === g);
              const cab = novo && g ? [
                <li key={"f" + g} className="sticky left-4 pb-1 pt-3" style={{ width: linhaW }}>
                  <span className="inline-flex items-center gap-2 text-sm font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COR_FASE[g] }} aria-hidden="true" />Fase {g} · {FASES_OBRA[g - 1].curto}</span>
                </li>,
              ] : [];
              return [...cab, ...L.map(({ t, i }) => {
                const tec = TECS.find((x) => x.id === t.tec), c = C.some((x) => x.t === t), ex = estadoDe(t), aqui = aberta === i;
                const cor = novo && t.fase ? COR_FASE[t.fase] : "hsl(var(--primary))";
                return (
                  <li key={i} className="py-1">
                    <button type="button" onClick={() => setAberta(aqui ? null : i)} aria-expanded={aqui}
                      className={cn("sticky left-4 flex min-h-9 items-center gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-primary", aqui && "text-primary")}
                      style={{ width: linhaW }}>
                      <Avatar id={t.tec} n={tec?.n ?? "?"} tam="h-6 w-6" />
                      <span className="min-w-0 flex-1 text-[15px] leading-snug"><span className="font-medium">{t.nome}</span>
                        <span className={cn("text-muted-foreground", c && "text-warning")}> · {tec ? tec.n.split(" ")[0] : "sem técnico"}{c ? " de férias" : ""}</span>
                        {mexida(p, i) && <span className="text-muted-foreground"> · ajustada</span>}{t.nota && <NotebookPen className="ml-1 inline h-3.5 w-3.5 text-muted-foreground" aria-label="com nota" />}</span>
                      {p.estado === "em curso" || p.estado === "concluída" ? <ChipExec e={p.estado === "concluída" && ex !== "validada" ? "validada" : ex} />
                        : <span className="shrink-0 whitespace-nowrap text-sm tabular-nums text-muted-foreground">{dias(t.dur)} · {nfmt(t.h)} h</span>}
                    </button>
                    <div className="relative h-7" style={{ width: gradeW }}>
                      <span className={cn("absolute top-0.5 h-6 rounded-md transition-[left,width] duration-300", c && "ring-2 ring-warning", ex === "feita" && "ring-2 ring-warning/70", ex === "corrigir" && "ring-2 ring-destructive", aqui && "ring-2 ring-foreground/70 ring-offset-2 ring-offset-card")}
                        style={{ left: X(t.dia) + 2, width: Math.max(10, X(t.dur) - 4), background: cor, opacity: ex === "validada" || p.estado === "concluída" ? 0.55 : 1 }} aria-hidden="true">
                        {(ex === "validada" || p.estado === "concluída") && <Check className="absolute right-1.5 top-1 h-4 w-4 text-white" />}
                      </span>
                    </div>
                  </li>
                );
              })];
            })}
          </ul>
        </div>
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><Check className="h-4 w-4" aria-hidden="true" />validada</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded ring-2 ring-warning/70" aria-hidden="true" />por validar</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-5 rounded ring-2 ring-destructive" aria-hidden="true" />a corrigir</span>
        <span className="inline-flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />férias</span>
      </p>

      {aberta != null && p.tasks[aberta] && (
        <div ref={painel} className="mt-4 scroll-mt-20">
          {muda ? <AjustarTarefa ctx={ctx} d={d} ti={aberta} fechar={() => setAberta(null)} /> : <DetalheTarefaObra ctx={ctx} d={d} ti={aberta} fechar={() => setAberta(null)} />}
        </div>
      )}
    </section>
  );
}

/** As Operações ajustam uma tarefa antes de arrancar: dias, início (dias úteis, pela ordem das fases), técnico e nota. */
function AjustarTarefa({ ctx, d, ti, fechar }: { ctx: Ctx; d: Negocio; ti: number; fechar: () => void }) {
  const { A, run } = ctx;
  const p = d.obra.plano!, t = p.tasks[ti], b = p.base?.[ti];
  const min = inicioMinimo(p, ti);
  const [nota, setNota] = useState(t.nota ?? "");
  useEffect(() => setNota(t.nota ?? ""), [ti, t.nota]);
  const fase = t.fase ? FASES_OBRA[t.fase - 1] : null;
  return (
    <section aria-label={`Ajustar ${t.nome}`} className={cn(CARTAO, "p-4 animate-in fade-in-0 slide-in-from-top-1 duration-200 sm:p-5")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold">{t.nome}</p>
          <p className={NOTA}>{fase ? `Fase ${t.fase} · ${fase.curto} · ` : ""}{rotuloDia(p, t.dia)}{t.dur > 1 ? ` a ${rotuloDia(p, t.dia + t.dur - 1)}` : ""}</p>
        </div>
        <button type="button" onClick={fechar} aria-label="Fechar" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-muted"><X className="h-5 w-5" /></button>
      </div>
      <dl className="mt-3 divide-y divide-border">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
          <dt className="text-[15px]">Dias úteis{b && b.dur !== t.dur && <span className="block text-sm text-muted-foreground">no orçamento: {dias(b.dur)}</span>}</dt>
          <dd><Passo rot="Dias da tarefa" valor={dias(t.dur)} desMenos={t.dur <= 1} menos={() => run(() => A.ajustarTarefa(d.id, ti, { dur: t.dur - 1 }))} mais={() => run(() => A.ajustarTarefa(d.id, ti, { dur: t.dur + 1 }))} /></dd>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
          <dt className="text-[15px]">Começa{t.dia <= min && min > 0 && <span className="block text-sm text-muted-foreground">não antes do último dia da fase anterior</span>}</dt>
          <dd><Passo rot="Dia de início" valor={rotuloDia(p, t.dia)} desMenos={t.dia <= min} menos={() => run(() => A.ajustarTarefa(d.id, ti, { dia: t.dia - 1 }))} mais={() => run(() => A.ajustarTarefa(d.id, ti, { dia: t.dia + 1 }))} /></dd>
        </div>
        <div className="py-3">
          <dt className="text-[15px]">Técnico</dt>
          <dd role="group" aria-label={`Técnico de ${t.nome}`} className="mt-2 flex flex-wrap gap-2">
            {tecnicosPara(t, p).map((x) => (
              <button key={x.id} type="button" aria-pressed={t.tec === x.id} onClick={() => run(() => A.trocarTec(d.id, ti, x.id))}
                className={cn("flex min-h-11 items-center gap-2 rounded-xl border px-3 py-1.5 text-left text-[15px] transition-colors", t.tec === x.id ? "border-primary bg-primary/[0.06]" : "border-input hover:border-foreground/40")}>
                <Avatar id={x.id} n={x.n} tam="h-7 w-7" />
                <span>{x.n}<span className={cn("block text-sm", x.livre ? "text-success" : "text-warning")}>{x.livre ? "livre nesses dias" : `de férias a ${x.ferias}`}</span></span>
              </button>
            ))}
          </dd>
        </div>
        <div className="py-3">
          <dt><label htmlFor={`nota-${ti}`} className="text-[15px]">Nota para a equipa</label></dt>
          <dd className="mt-2 flex gap-2">
            <input id={`nota-${ti}`} value={nota} onChange={(e) => setNota(e.target.value)} onBlur={() => run(() => A.ajustarTarefa(d.id, ti, { nota }))}
              onKeyDown={(e) => { if (e.key === "Enter") run(() => A.ajustarTarefa(d.id, ti, { nota })); }} placeholder="Ex.: levar o andaime; chave na portaria"
              className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </dd>
        </div>
      </dl>
      {conflitos(p).some((c) => c.t === t) && <p className="mt-2 flex items-start gap-2 text-[15px] text-warning"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />O técnico está de férias nesses dias: troque-o ou mude o início.</p>}
    </section>
  );
}

/** Uma tarefa em obra, vista pelo supervisor: o que o técnico registou, e validar ou pedir correção. */
function DetalheTarefaObra({ ctx, d, ti, fechar }: { ctx: Ctx; d: Negocio; ti: number; fechar: () => void }) {
  const p = d.obra.plano!, t = p.tasks[ti], tec = TECS.find((x) => x.id === t.tec);
  return (
    <section aria-label={t.nome} className={cn(CARTAO, "p-4 animate-in fade-in-0 slide-in-from-top-1 duration-200 sm:p-5")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold">{t.nome}</p>
          <p className={NOTA}>{tec?.n ?? "sem técnico"} · {rotuloDia(p, t.dia)}{t.dur > 1 ? ` a ${rotuloDia(p, t.dia + t.dur - 1)}` : ""} · previstas {nfmt(t.h)} h</p>
        </div>
        <button type="button" onClick={fechar} aria-label="Fechar" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-muted"><X className="h-5 w-5" /></button>
      </div>
      {t.nota && <p className="mt-2 flex items-start gap-2 text-[15px]"><NotebookPen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />{t.nota}</p>}
      <Registo ctx={ctx} d={d} ti={ti} />
    </section>
  );
}

/** O que o técnico registou (horas, fotografias, nota) e, se está feita, validar ou pedir correção. */
function Registo({ ctx, d, ti }: { ctx: Ctx; d: Negocio; ti: number }) {
  const { S, A, run } = ctx;
  const p = d.obra.plano!, t = p.tasks[ti], ex = estadoDe(t), pode = S.role === "operacoes";
  const [motivo, setMotivo] = useState<string | null>(null);
  const dif = t.exec ? t.exec.horas - t.h : 0;
  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px]">
        <ChipExec e={ex} />
        {t.exec && t.exec.horas > 0 && <span className="tabular-nums">{nfmt(t.exec.horas)} h registadas <span className={cn(dif > 0.01 ? "text-warning" : "text-muted-foreground")}>({dif > 0.01 ? "+" : dif < -0.01 ? "−" : ""}{dif ? nfmt(Math.abs(dif)) + " h" : "como previsto"})</span></span>}
        {t.exec?.feita && <span className="text-muted-foreground">feita {t.exec.feita}</span>}
      </div>
      {t.exec?.motivo && ex === "corrigir" && <p className="rounded-lg bg-destructive/[0.06] px-3 py-2 text-[15px]"><b className="font-medium">Correção pedida:</b> {t.exec.motivo}</p>}
      {!!t.exec?.fotos.length && (
        <ul className="flex flex-wrap gap-2" aria-label="Fotografias">
          {t.exec.fotos.map((f, k) => <li key={k}><img src={f} alt={`Fotografia ${k + 1} de ${t.nome}`} className="h-24 w-32 rounded-lg border border-border object-cover" /></li>)}
        </ul>
      )}
      {t.exec?.nota && <p className="text-[15px] text-muted-foreground">«{t.exec.nota}»</p>}
      {ex === "feita" && (pode ? (
        motivo == null ? (
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-11" onClick={() => run(() => A.validarTarefa(d.id, ti))}><Check className="mr-1.5 h-4 w-4" aria-hidden="true" />Validar</Button>
            <Button variant="outline" className="min-h-11" onClick={() => setMotivo("")}>Pedir correção</Button>
          </div>
        ) : (
          <div className="space-y-2 rounded-xl border border-border p-3 animate-in fade-in-0">
            <p className="text-[15px] font-medium">O que falta corrigir?</p>
            <div className="flex flex-wrap gap-2">
              {["Falta acabamento", "A fotografia não mostra o trabalho", "Horas a confirmar"].map((m) => (
                <button key={m} type="button" aria-pressed={motivo === m} onClick={() => setMotivo(m)}
                  className={cn("min-h-10 rounded-full border px-3 text-[15px]", motivo === m ? "border-foreground bg-foreground text-background" : "border-input hover:border-foreground/40")}>{m}</button>
              ))}
            </div>
            <input value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo da correção" placeholder="Ou escreva o motivo"
              className="h-11 w-full rounded-lg border border-input bg-background px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setMotivo(null)}>Cancelar</Button>
              <Button variant="outline" disabled={!motivo.trim()} onClick={() => { run(() => A.pedirCorrecao(d.id, ti, motivo)); setMotivo(null); }}>Enviar ao técnico</Button>
            </div>
          </div>
        )
      ) : <Mudar ctx={ctx} papel="operacoes" />)}
    </div>
  );
}

/* ------------------------------------------------------------------ hoje na obra: a app do técnico (simulada) */
function HojeNaObra({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const { A, run } = ctx;
  const p = d.obra.plano!, fim = fimDe(p.tasks);
  const hojeIdx = tarefasDoDia(p, p.dia);
  const tecs = [...new Set(hojeIdx.map((i) => p.tasks[i].tec).filter(Boolean) as string[])];
  const [quem, setQuem] = useState<string | null>(tecs[0] ?? null);
  const ativo = quem && tecs.includes(quem) ? quem : tecs[0] ?? null;
  const minhas = ativo ? tarefasDoDia(p, p.dia, ativo) : [];
  return (
    <section id="obra-hoje" aria-labelledby="obra-hoje-t" className="mt-10 scroll-mt-16">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="obra-hoje-t" className={H2}>Hoje na obra <span className="font-normal text-muted-foreground">· dia {p.dia + 1} de {fim}, {rotuloDia(p, p.dia)}</span></h2>
        <Button variant="ghost" className="min-h-10 px-2 text-[15px] text-muted-foreground" onClick={() => run(() => A.diaSeguinte(d.id))}>Passar ao dia seguinte<ArrowRight className="ml-1 h-4 w-4" /></Button>
      </div>
      <p className={cn(NOTA, "mt-1")}>A app do técnico, simulada: escolha quem está na obra e registe como ele faria no telemóvel.</p>
      {!tecs.length ? <p className={cn(NOTA, "mt-4")}>Hoje não há tarefas por fazer. Passe ao dia seguinte ou registe o fim da obra.</p> : (
        <>
          <div role="group" aria-label="Quem está na obra" className="mt-3 flex flex-wrap gap-2">
            {tecs.map((id) => {
              const n = TECS.find((x) => x.id === id)?.n ?? id, k = tarefasDoDia(p, p.dia, id).length;
              return (
                <button key={id} type="button" aria-pressed={ativo === id} onClick={() => setQuem(id)}
                  className={cn("flex min-h-11 items-center gap-2 rounded-full border py-1 pl-1 pr-4 text-[15px] transition-colors", ativo === id ? "border-primary bg-primary/[0.06] font-medium" : "border-input bg-card hover:border-foreground/40")}>
                  <Avatar id={id} n={n} tam="h-8 w-8" />{n}<span className="text-sm text-muted-foreground">· {k}</span>
                </button>
              );
            })}
          </div>
          <ul className="mt-4 space-y-3">{minhas.map((i) => <li key={i}><TarefaTecnico ctx={ctx} d={d} ti={i} /></li>)}</ul>
        </>
      )}
    </section>
  );
}

/** Uma tarefa na app do técnico: começar → horas → fotografia → nota → marcar como feita. Um passo de cada vez. */
function TarefaTecnico({ ctx, d, ti }: { ctx: Ctx; d: Negocio; ti: number }) {
  const { A, run } = ctx;
  const p = d.obra.plano!, t = p.tasks[ti], ex = estadoDe(t);
  const input = useRef<HTMLInputElement>(null);
  const [nota, setNota] = useState(t.exec?.nota ?? "");
  const F = faltaParaFeita(t);
  // as horas sugeridas, ao meio dia (o registo anda de meia em meia hora)
  const meia = (h: number) => Math.max(0.5, Math.round(h * 2) / 2);
  const sugeridas = meia(t.dur > 1 ? t.h : t.h / Math.max(1, t.dur));
  const juntarFoto = async (f?: File | null) => { if (!f) return; try { const u = await lerFoto(f); run(() => A.registarTarefa(d.id, ti, { foto: u })); } catch { /* sem leitura: fica sem foto */ } };
  const cor = t.fase ? COR_FASE[t.fase] : "#7c5ce0";
  return (
    <article className={cn(CARTAO, "p-4 sm:p-5")} aria-label={t.nome}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-base font-semibold">{t.nome}</p>
          <p className={NOTA}>Previstas {nfmt(t.h)} h{t.dur > 1 ? ` em ${dias(t.dur)}` : ""}{t.nota ? ` · ${t.nota}` : ""}</p>
        </div>
        <ChipExec e={ex} />
      </div>
      {ex === "corrigir" && t.exec?.motivo && <p className="mt-3 rounded-lg bg-destructive/[0.06] px-3 py-2 text-[15px]"><b className="font-medium">O responsável pediu:</b> {t.exec.motivo}</p>}

      {ex === "por fazer" && (
        <div className="mt-4"><Button className="min-h-11 w-full sm:w-auto" onClick={() => run(() => A.comecarTarefa(d.id, ti))}><HardHat className="mr-1.5 h-4 w-4" aria-hidden="true" />Começar</Button></div>
      )}

      {(ex === "em curso" || ex === "corrigir") && t.exec && (
        <ol className="mt-4 space-y-4">
          <li>
            <p className="flex items-center gap-2 text-[15px] font-medium">{t.exec.horas > 0 ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <span className="grid h-4 w-4 place-items-center rounded-full border border-input text-[10px]">1</span>}Horas de trabalho</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <Passo rot={`Horas de ${t.nome}`} valor={`${nfmt(t.exec.horas)} h`} desMenos={t.exec.horas <= 0} menos={() => run(() => A.registarTarefa(d.id, ti, { horas: t.exec!.horas - 0.5 }))} mais={() => run(() => A.registarTarefa(d.id, ti, { horas: t.exec!.horas + 0.5 }))} />
              {t.exec.horas === 0 && <button type="button" onClick={() => run(() => A.registarTarefa(d.id, ti, { horas: sugeridas }))} className="min-h-11 text-[15px] font-medium text-primary underline-offset-4 hover:underline">Usar as previstas ({nfmt(sugeridas)} h)</button>}
            </div>
          </li>
          <li>
            <p className="flex items-center gap-2 text-[15px] font-medium">{t.exec.fotos.length ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <span className="grid h-4 w-4 place-items-center rounded-full border border-input text-[10px]">2</span>}Fotografia do trabalho feito</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {t.exec.fotos.map((f, k) => (
                <span key={k} className="relative">
                  <img src={f} alt={`Fotografia ${k + 1}`} className="h-20 w-28 rounded-lg border border-border object-cover" />
                  <button type="button" aria-label={`Tirar a fotografia ${k + 1}`} onClick={() => run(() => A.registarTarefa(d.id, ti, { tirarFoto: k }))} className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full border border-border bg-card shadow"><X className="h-3.5 w-3.5" /></button>
                </span>
              ))}
              <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Tirar ou escolher uma fotografia" onChange={(e) => { void juntarFoto(e.target.files?.[0]); e.target.value = ""; }} />
              <Button variant="outline" className="min-h-11" onClick={() => input.current?.click()}><Camera className="mr-1.5 h-4 w-4" aria-hidden="true" />Tirar fotografia</Button>
              <button type="button" onClick={() => run(() => A.registarTarefa(d.id, ti, { foto: fotoExemplo(t.nome, cor, t.exec!.fotos.length) }))} className="inline-flex min-h-11 items-center gap-1.5 px-1 text-[15px] font-medium text-primary underline-offset-4 hover:underline"><ImagePlus className="h-4 w-4" aria-hidden="true" />Usar uma de exemplo</button>
            </div>
          </li>
          <li>
            <label className="block">
              <span className="flex items-center gap-2 text-[15px] font-medium"><span className="grid h-4 w-4 place-items-center rounded-full border border-input text-[10px]">3</span>Nota <span className="font-normal text-muted-foreground">(opcional)</span></span>
              <input value={nota} onChange={(e) => setNota(e.target.value)} onBlur={() => run(() => A.registarTarefa(d.id, ti, { nota }))} placeholder="Ex.: faltou uma peça; o cliente pediu…"
                className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </label>
          </li>
          <li className="border-t border-border pt-4">
            <Button className="min-h-11 w-full sm:w-auto" disabled={!!F.length} onClick={() => run(() => { A.registarTarefa(d.id, ti, { nota }); A.marcarFeita(d.id, ti); })}><Check className="mr-1.5 h-4 w-4" aria-hidden="true" />Marcar como feita</Button>
            {F.length > 0 && <p className={cn(NOTA, "mt-2")}>Falta {F.join(" e ")}.</p>}
          </li>
        </ol>
      )}

      {ex === "feita" && <p className="mt-3 flex items-center gap-2 text-[15px] text-muted-foreground"><Clock className="h-4 w-4" aria-hidden="true" />Feita. À espera do responsável de obra.</p>}
    </article>
  );
}

/* ------------------------------------------------------------------ por validar (o supervisor) */
function PorValidar({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const p = d.obra.plano!, PV = porValidar(p);
  return (
    <section id="obra-validar" aria-labelledby="obra-validar-t" className="mt-10 scroll-mt-16">
      <h2 id="obra-validar-t" className={H2}>Por validar <span className="font-normal text-muted-foreground">· {PV.length}</span></h2>
      {!PV.length ? <p className={cn(NOTA, "mt-1")}>Nada à espera. Quando um técnico marca uma tarefa como feita, aparece aqui com as fotografias.</p> : (
        <ul className="mt-3 space-y-3">
          {PV.map((i) => {
            const t = p.tasks[i], tec = TECS.find((x) => x.id === t.tec);
            return (
              <li key={i} className={cn(CARTAO, "p-4 sm:p-5")}>
                <div className="flex items-start gap-3">
                  <Avatar id={t.tec} n={tec?.n ?? "?"} />
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-semibold">{t.nome}</p>
                    <p className={NOTA}>{tec?.n ?? "sem técnico"} · previstas {nfmt(t.h)} h</p>
                  </div>
                </div>
                <Registo ctx={ctx} d={d} ti={i} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ a equipa */
function EquipaObra({ d, direcao }: { d: Negocio; direcao: boolean }) {
  const p = d.obra.plano!, eq = equipaDaObra(p);
  return (
    <section id="obra-equipa" aria-labelledby="obra-equipa-t" className="mt-10 scroll-mt-16">
      <h2 id="obra-equipa-t" className={H2}>Equipa <span className="font-normal text-muted-foreground">· {eq.length} {eq.length === 1 ? "pessoa" : "pessoas"} e o responsável</span></h2>
      <ul className={cn(CARTAO, "mt-3 divide-y divide-border px-4 sm:px-5")}>
        <li className="flex items-center gap-3 py-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-foreground text-sm font-semibold text-background" aria-hidden="true">{iniciais(RESPONSAVEL_OBRA.n)}</span>
          <span className="min-w-0 flex-1"><span className="block text-[15px] font-medium">{RESPONSAVEL_OBRA.n}</span><span className={NOTA}>{RESPONSAVEL_OBRA.papel} · valida as tarefas</span></span>
          <a href={`tel:${RESPONSAVEL_OBRA.tel.replace(/\s/g, "")}`} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-[15px] text-primary"><Phone className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">{RESPONSAVEL_OBRA.tel}</span><span className="sr-only sm:hidden">Ligar</span></a>
        </li>
        {eq.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-3">
            <Avatar id={m.id} n={m.n} tam="h-10 w-10" />
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-medium">{m.n} <span className="font-normal text-muted-foreground">· {m.sk}</span></span>
              <span className="block text-sm text-muted-foreground">{dias(m.dias)} na obra · {nfmt(m.horas)} h · {m.tarefas.join(", ")}{direcao ? ` · ${eur(m.custoH)} €/h` : ""}</span>
            </span>
            <a href={`tel:${m.tel.replace(/\s/g, "")}`} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-[15px] text-primary"><Phone className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">{m.tel}</span><span className="sr-only sm:hidden">Ligar a {m.n}</span></a>
          </li>
        ))}
      </ul>
      {!direcao && <p className={cn(NOTA, "mt-2")}>O custo por hora de cada pessoa só a Direção o vê.</p>}
    </section>
  );
}

/* ------------------------------------------------------------------ os equipamentos */
function EquipamentosObra({ d }: { d: Negocio }) {
  const p = d.obra.plano!, L = equipamentosDaObra(p);
  return (
    <section id="obra-equip" aria-labelledby="obra-equip-t" className="mt-10 scroll-mt-16">
      <h2 id="obra-equip-t" className={H2}>Equipamentos <span className="font-normal text-muted-foreground">· {L.length}</span></h2>
      <p className={cn(NOTA, "mt-1")}>Das receitas dos serviços e do ofício de cada técnico, reservados pelos dias das tarefas.</p>
      <ul className={cn(CARTAO, "mt-3 divide-y divide-border px-4 sm:px-5")}>
        {L.map((e) => {
          const I = e.origem === "Frota" ? Truck : e.origem === "Aluguer" ? Store : Wrench;
          return (
            <li key={e.n} className="flex items-start gap-3 py-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-foreground/70" aria-hidden="true"><I className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">{e.n}</span>
                <span className="block text-sm text-muted-foreground">{e.tarefas.join(", ")}</span>
                <span className="block text-sm tabular-nums text-muted-foreground">{quandoEquip(p, e)}</span>
              </span>
              <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-sm font-medium", e.origem === "Aluguer" ? "bg-warning/15" : e.origem === "Frota" ? "bg-primary/10 text-primary" : "bg-muted")}>{e.origem}</span>
            </li>
          );
        })}
      </ul>
      {L.some((e) => e.de) && <p className={cn(NOTA, "mt-2")}>Aluguer: {[...new Set(L.filter((e) => e.de).map((e) => e.de))].join(", ")}.</p>}
    </section>
  );
}

/* ------------------------------------------------------------------ os materiais por fase */
const TOM_MAT: Record<EstadoMat, string> = {
  reservado: "bg-success/15", recebido: "bg-success/15", "a chegar": "bg-primary/10 text-primary", encomendado: "bg-primary/10 text-primary",
  "por encomendar": "bg-warning/15", "em falta": "bg-destructive/10 text-destructive",
};
function MateriaisObra({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const { A, go } = ctx;
  const G = materiaisPorFase(d), e = d.obra.enc;
  return (
    <section id="obra-mat" aria-labelledby="obra-mat-t" className="mt-10 scroll-mt-16">
      <h2 id="obra-mat-t" className={H2}>Materiais</h2>
      <p className="mt-1 text-[15px]">
        {d.obra.ec && d.obra.ec.estado !== "aprovada" ? `Encomenda de cliente ${d.obra.ec.n} à espera do comercial.`
          : !e ? "Tudo em stock e reservado para a obra."
          : e.estado === "recebida" ? `Encomenda ${e.n} recebida: tudo reservado.`
          : e.estado === "por confirmar" ? `Encomenda ${e.n} a ${e.forn ?? "fornecedor"}, à espera da validação do Financeiro.`
          : `Encomenda ${e.n} enviada a ${e.forn ?? "fornecedor"}${e.entrega ? `; chega a ${e.entrega}` : ""}. O Armazém dá entrada quando chegar.`}
      </p>
      {G.length > 0 && (
        <div className="mt-3 space-y-4">
          {G.map((g) => (
            <div key={g.fase}>
              <p className="inline-flex items-center gap-2 text-sm font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COR_FASE[g.fase] }} aria-hidden="true" />Fase {g.fase} · {FASES_OBRA[g.fase - 1].curto}</p>
              <ul className={cn(CARTAO, "mt-2 divide-y divide-border px-4 sm:px-5")}>
                {g.itens.map((m) => (
                  <li key={m.n} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3">
                    <span className="min-w-[10rem] flex-1">
                      <span className="block text-[15px]">{m.n}</span>
                      <span className="block text-sm tabular-nums text-muted-foreground">{nfmt(m.q)} {m.un}{m.forn ? ` · ${m.forn}` : ""}</span>
                    </span>
                    <span className={cn("rounded-full px-2.5 py-0.5 text-sm font-medium", TOM_MAT[m.estado])}>{m.estado}{m.quando ? ` · ${m.quando}` : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={go(() => A.abrir(d.id))} className="mt-2 inline-flex min-h-11 items-center gap-1 text-[15px] font-medium text-primary underline-offset-4 hover:underline">
        Ver o negócio, do contrato à obra<ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </section>
  );
}

/* ------------------------------------------------------------------ o diário de obra */
function DiarioObra({ ctx, d, pode }: { ctx: Ctx; d: Negocio; pode: boolean }) {
  const { A, run } = ctx;
  const [texto, setTexto] = useState("");
  const L = [...(d.obra.diario ?? [])].reverse();
  const icone = { horas: HardHat, foto: Camera, nota: NotebookPen, ocorrencia: AlertTriangle, validacao: CheckCircle2, correcao: FileWarning, marco: ClipboardCheck } as const;
  return (
    <section id="obra-diario" aria-labelledby="obra-diario-t" className="mt-10 scroll-mt-16">
      <h2 id="obra-diario-t" className={H2}>Diário de obra</h2>
      {pode && d.obra.plano!.estado !== "concluída" && (
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); run(() => A.ocorrencia(d.id, texto)); setTexto(""); }}>
          <input value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Registar uma ocorrência" placeholder="Registar uma ocorrência ou nota do dia"
            className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <Button type="submit" variant="outline" className="min-h-11" disabled={!texto.trim()}>Registar</Button>
        </form>
      )}
      {!L.length ? <p className={cn(NOTA, "mt-3")}>Ainda sem registos. Os técnicos e o responsável escrevem aqui o dia a dia.</p> : (
        <ol className="mt-4">
          {L.map((x, k) => {
            const I = icone[x.k] ?? NotebookPen;
            return (
              <li key={k} className="relative flex gap-3 pb-5 last:pb-0">
                {k < L.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-[15px] top-8 w-px bg-border" />}
                <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full", x.k === "ocorrencia" || x.k === "correcao" ? "bg-warning/15 text-warning" : x.k === "validacao" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")} aria-hidden="true"><I className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-muted-foreground">{x.q} · {x.quem}</p>
                  <p className="text-[15px]">{x.t}</p>
                  {!!x.fotos?.length && <div className="mt-2 flex gap-2">{x.fotos.map((f, j) => <img key={j} src={f} alt="" className="h-16 w-24 rounded-lg border border-border object-cover" />)}</div>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ segurança e licenças */
function SegurancaObra({ ctx, d, pode }: { ctx: Ctx; d: Negocio; pode: boolean }) {
  const { A, run } = ctx;
  const L = seguranca(d);
  return (
    <section id="obra-seg" aria-labelledby="obra-seg-t" className="mt-10 scroll-mt-16">
      <h2 id="obra-seg-t" className={H2}>Segurança e licenças</h2>
      <ul className={cn(CARTAO, "mt-3 divide-y divide-border px-4 sm:px-5")}>
        {L.map((x) => (
          <li key={x.k} className="flex flex-wrap items-center gap-3 py-3">
            {x.ok ? <ShieldCheck className="h-5 w-5 shrink-0 text-success" aria-hidden="true" /> : <Circle className="h-5 w-5 shrink-0 text-warning" aria-hidden="true" />}
            <span className="min-w-[12rem] flex-1"><span className="block text-[15px] font-medium">{x.t}</span><span className={NOTA}>{x.sub}</span></span>
            {!x.ok && pode && <Button variant="outline" size="sm" className="min-h-10" onClick={() => run(() => A.tratarSeguranca(d.id, x.k))}>Marcar como tratado</Button>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ custos previstos e reais (Direção e Operações) */
function CustosObra({ d }: { d: Negocio }) {
  const p = d.obra.plano!, K = custosObra(p);
  const registadas = K.linhas.filter((l) => l.real != null).length;
  return (
    <section id="obra-custos" aria-labelledby="obra-custos-t" className="mt-10 scroll-mt-16">
      <h2 id="obra-custos-t" className={H2}>Custos de mão de obra</h2>
      <p className={cn(NOTA, "mt-1")}>Previsto pelo plano; real pelas horas que os técnicos registaram ({registadas} de {K.linhas.length} tarefas). Só a Direção e as Operações veem.</p>
      <table className="mt-3 w-full text-[15px]">
        <thead><tr className="text-left text-sm text-muted-foreground"><th className="py-2 font-normal">Tarefa</th><th className="py-2 text-right font-normal">Previsto</th><th className="py-2 text-right font-normal">Real</th></tr></thead>
        <tbody className="divide-y divide-border border-y border-border">
          {K.linhas.map((l, i) => {
            const t: Tarefa = p.tasks[i];
            return (
              <tr key={i}><td className="py-2 pr-2">{l.n}<span className="block text-sm text-muted-foreground">{nfmt(t.h)} h previstas</span></td>
                <td className="py-2 text-right tabular-nums">{eur(l.prev)} €</td>
                <td className={cn("py-2 text-right tabular-nums", l.real != null && l.real > l.prev + 0.5 ? "text-warning" : l.real == null && "text-muted-foreground")}>{l.real == null ? "—" : `${eur(l.real)} €`}</td></tr>
            );
          })}
        </tbody>
        <tfoot><tr className="font-semibold"><td className="py-2">Total</td><td className="py-2 text-right tabular-nums">{eur(K.prev)} €</td><td className="py-2 text-right tabular-nums">{registadas ? `${eur(K.real)} €` : "—"}</td></tr></tfoot>
      </table>
    </section>
  );
}

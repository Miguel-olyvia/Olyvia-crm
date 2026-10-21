// As Operações no V1 (15/10/2026, refeitas): a lista de obras e a página da obra, com muito mais detalhe e tudo guiado.
// · Lista: por estado (por arrancar, em curso, concluídas), com a fase, o progresso, a equipa, o próximo marco e os alertas.
// · Página da obra: o que fazer agora (um primário), o plano por dia (com os ajustes das Operações antes de arrancar e o estado
//   de cada tarefa ao vivo), o acompanhamento (21/10: o gestor vê tudo, dia a dia, para trás e para a frente; o técnico faz
//   tudo pelo Hoje dele, HojeTecnico.tsx), por validar (o supervisor valida ou pede correção), os ajustes ao plano com a obra
//   em curso (com aviso ao cliente), a equipa, os equipamentos, os materiais por fase, o diário, a segurança e os custos.
// O ciclo da tarefa é o da app das obras (operacao-app), muito mais simples: um toque de cada vez.
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, ArrowUp, CalendarClock, ChevronDown, MessageCircle, Camera, Check, CheckCircle2, Circle, ClipboardCheck, Clock, FileWarning, HardHat,
  MapPin, Minus, NotebookPen, Phone, Plus, RotateCcw, ShieldCheck, Smartphone, Store, Truck, Wrench, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PAPEIS, TECS, aberto, conflitos, diaDeFerias, eur, nfmt, type Negocio, type Papel, type Tarefa } from "./motor";
import { COR_FASE, dataCurta, iniciosRapidos, isoDia } from "./planoObra";
import { FASES_OBRA } from "./fasesObra";
import { entregaTarde, faltaParaArrancar, inicioDoPlano, rotuloDia, tecnicosPara } from "./preparacaoObra";
import { diasDasHoras, diferencas, fimDe, inicioMinimo, mexida } from "./ajustesPlano";
import { HORAS_DIA } from "./ganttOrcamento";
import {
  RESPONSAVEL_OBRA, ROTULO_EXEC, custoHoraDe, custosObra, equipaDaObra, equipamentosDaObra, estadoDe, faltaParaFeita, fotoExemplo,
  iniciais, materiaisPorFase, porValidar, progresso, quandoEquip, seguranca, tarefasDoDia, type EntradaDiario, type EstadoExec, type EstadoMat,
} from "./obraOps";
import type { Ctx } from "./pecas";
import { AutoNoNegocio } from "./AutoRececao";
import { pontosEncerrar, type PontoEncerrar } from "./encerrarObra";
import { ViaturasObra } from "./frota/ViaturasObra";
import { ProximoRececaoNegocio } from "./RececaoNegocio";
import { useInventario } from "./inventario/loja";
import { resumoEcNegocio, textoResumoEc } from "./inventario/ponteNegocios";
import { DiaDaObra, FitaDias, HistoricoTarefa, Miniaturas, nomeTec } from "./AcompanhamentoObra";
import { Conversa } from "./ConversaObra";
import { pedirFrota } from "./frota/pontes";
import { BarraTarefa, ExtrasTarefa, TarefasDoPlano } from "./PlanoInterativo";
import { MOTIVOS_AJUSTE, TEMPOS_CORRECAO, duracaoMinima, enviosDe, inicioMinimoVivo, podeAjustar, preverAjuste, preverCorrecao, registouNoDia, textoAvisoCliente } from "./trabalhoObra";

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

/**
 * 21/10: a duração de uma tarefa, em dias úteis ou em horas úteis (uma tarefa curta não tem de ocupar um dia inteiro).
 * Em horas, o passo é de meia hora até 2 h e de 1 h a seguir; os dias no calendário saem das horas (8 h por dia).
 */
function Duracao({ dur, h, minDur = 1, mudarDias, mudarHoras, nota }: {
  dur: number; h: number; minDur?: number; mudarDias: (n: number) => void; mudarHoras: (n: number) => void; nota?: ReactNode;
}) {
  const [modo, setModo] = useState<"dias" | "horas">(dur === 1 && h < HORAS_DIA ? "horas" : "dias");
  const minH = (minDur - 1) * HORAS_DIA + 0.5, passo = (x: number, dir: 1 | -1) => (x + (dir > 0 ? 0 : -0.01) < 2 ? 0.5 : 1) * dir;
  const seg = (on: boolean) => cn("min-h-9 rounded-md px-3 text-sm font-medium transition-colors", on ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground");
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
      <dt className="text-[15px]">
        <span className="flex items-center gap-2">Duração
          <span role="group" aria-label="Unidade da duração" className="inline-flex rounded-lg bg-muted p-0.5">
            <button type="button" aria-pressed={modo === "dias"} onClick={() => setModo("dias")} className={seg(modo === "dias")}>Dias</button>
            <button type="button" aria-pressed={modo === "horas"} onClick={() => setModo("horas")} className={seg(modo === "horas")}>Horas</button>
          </span>
        </span>
        <span className="block text-sm text-muted-foreground">{modo === "horas" ? `${dias(dur)} no calendário · 8 h por dia útil` : `${nfmt(h)} h de trabalho`}</span>
        {nota}
      </dt>
      <dd>
        {modo === "dias"
          ? <Passo rot="Dias da tarefa" valor={dias(dur)} desMenos={dur <= minDur} menos={() => mudarDias(dur - 1)} mais={() => mudarDias(dur + 1)} />
          : <Passo rot="Horas úteis da tarefa" valor={`${nfmt(h)} h`} desMenos={h <= minH} menos={() => mudarHoras(Math.max(minH, h + passo(h, -1)))} mais={() => mudarHoras(h + passo(h, 1))} />}
      </dd>
    </div>
  );
}

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
export function lerFoto(f: File): Promise<string> {
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
  // os materiais vivem no Inventário: a lista redesenha quando lá muda alguma coisa
  const db = useInventario();
  // 16/10: a obra aparece com o contrato assinado (o plano, por aprovar depois do pagamento)
  const obras = aberto(S).filter((x) => x.obra.plano && x.fase >= 4);
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
              const r = o.obra.ec?.ref ? resumoEcNegocio(db, o.obra.ec.ref) : null, faltaMat = !!r && !r.pronta;
              // a data mais tarde das encomendas a fornecedor ainda por receber
              const prev = r?.pos.filter((x) => x.fase !== "recebida" && x.fase !== "cancelada").map((x) => x.prevista).filter(Boolean).sort().at(-1);
              const tHoje = p.estado === "em curso" ? p.tasks.find((t) => t.dia <= p.dia && p.dia < t.dia + t.dur) : null;
              const fase = tHoje?.fase ?? p.tasks[0]?.fase;
              const pr = progresso(p);
              const F = faltaParaArrancar(o, db);
              const marco = p.estado === "por aprovar" ? "Aprovar o plano"
                : p.estado === "aprovado" ? (F.length ? `Para arrancar falta ${F.filter((f) => !/plano/.test(f)).join(", ")}` : `Arrancar a ${rotuloDia(p, 0)}`)
                : p.estado === "em curso" ? `Dia ${p.dia + 1} de ${fim} · acaba a ${rotuloDia(p, fim - 1)}` : "Obra concluída";
              const alertas: [ReactNode, string][] = [
                ...(nc ? [[<AlertTriangle key="c" className="h-4 w-4 text-warning" aria-hidden="true" />, `${nc} conflito de férias`] as [ReactNode, string]] : []),
                ...(faltaMat && p.estado !== "concluída" ? [[<Truck key="m" className="h-4 w-4 text-warning" aria-hidden="true" />, prev ? `material previsto a ${prev.slice(8, 10)}/${prev.slice(5, 7)}` : "material por chegar"] as [ReactNode, string]] : []),
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
type Seccao = "plano" | "hoje" | "validar" | "chat" | "equipa" | "equip" | "mat" | "diario" | "seg" | "custos";

export function PaginaObra({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const { S, A, go } = ctx;
  const p = d.obra.plano!, C = conflitos(p), pode = S.role === "operacoes", direcao = S.role === "direcao";
  const novo = p.origem === "orcamento";
  // 19/10: os materiais lidos ao vivo do Inventário (o arranque espera por eles)
  const db = useInventario();
  const r = d.obra.ec?.ref ? resumoEcNegocio(db, d.obra.ec.ref) : null;
  const fim = fimDe(p.tasks), ultimo = fim - 1;
  const horas = p.tasks.reduce((a, t) => a + t.h, 0);
  const PV = porValidar(p);
  const PE = p.estado === "em curso" ? pontosEncerrar(d, S, db) : [], podeEncerrar = PE.every((x) => x.ok);
  const F = faltaParaArrancar(d, db).filter((f) => !/plano/.test(f));
  const tarde = entregaTarde(d, db);
  const muda = pode && (p.estado === "por aprovar" || p.estado === "aprovado");
  const [aberta, setAberta] = useState<number | null>(null);
  // 21/10: o dia que o gestor está a ver (para trás ou para a frente); acompanha o "hoje" do plano
  const [sel, setSel] = useState(p.dia);
  useEffect(() => { setSel(p.dia); }, [p.dia]);
  const irPara = (s: Seccao) => document.getElementById(`obra-${s}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  let frase = "", botao: ReactNode = null;
  if (p.estado === "por aprovar") {
    frase = C.length ? "Há um técnico de férias numa tarefa. Troque-o ou adie a tarefa antes de aprovar." : "O plano está pronto para aprovar. Confirme as datas e os técnicos; pode ajustar qualquer tarefa.";
    botao = <Button size="lg" disabled={!!C.length} onClick={go(() => A.aprovarPlano(d.id))}>Aprovar o plano</Button>;
  } else if (p.estado === "aprovado") {
    frase = F.length ? `Plano aprovado. Para arrancar, falta ${F.join(", ")}.` : "Plano aprovado e tudo pronto. Pode arrancar.";
    botao = <Button size="lg" disabled={!!F.length} onClick={go(() => A.arrancar(d.id))}>Arrancar a obra</Button>;
  } else if (p.estado === "em curso") {
    // 21/10: sem texto corrido: o dia, o progresso e os factos em linhas com ícone (FactosObra)
    frase = `Dia ${p.dia + 1} de ${fim} · ${rotuloDia(p, p.dia)}`;
    // 21/10: encerrar só com tudo completo (encerrarObra.ts): o botão fica ativo com a lista toda verde
    botao = PV.length
      ? <Button size="lg" onClick={() => irPara("validar")}>Validar {PV.length === 1 ? "1 tarefa" : `${PV.length} tarefas`}<ArrowRight className="ml-2 h-4 w-4" /></Button>
      : <Button size="lg" disabled={!podeEncerrar} onClick={go(() => A.fimObra(d.id))}><CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />Encerrar a obra</Button>;
  } else frase = d.obra.auto?.estado === "assinado" ? "Obra concluída e recebida pelo cliente." : d.obra.auto ? "Obra concluída. O auto de receção está no portal do cliente, para assinar." : "Obra concluída.";

  const secoes: [Seccao, string, boolean][] = [
    ["plano", "Plano", true], ["hoje", "Acompanhamento", p.estado === "em curso"], ["validar", "Por validar", p.estado === "em curso"],
    ["chat", "Cliente", true], ["equipa", "Equipa", true], ["equip", "Equipamentos", true], ["mat", "Materiais", true], ["diario", "Diário", true],
    ["seg", "Segurança", true], ["custos", "Custos", direcao || pode],
  ];
  const morada = d.f.morada || d.local;
  const porLer = (d.obra.chat ?? []).filter((m) => m.de === "cliente" && !m.lida).length;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-6 sm:px-8 sm:pt-10">
      <button type="button" onClick={go(() => A.nav("operacoes"))} className="inline-flex min-h-11 items-center gap-2 text-[15px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Operações
      </button>

      {/* 21/10: por prioridade: 1.º o estado, 2.º o que vem a seguir (com o primário), 3.º o resto (contactos, viaturas, secções) */}
      <header className="mt-2">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-muted-foreground">Obra #{d.id} <ChipEstadoObra estado={p.estado} /></p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{d.nome}</h1>
        <p className="mt-1 text-base text-muted-foreground">{d.servico}{p.tasks.length ? ` · ${rotuloDia(p, 0)} a ${rotuloDia(p, ultimo)}` : ""}</p>
      </header>

      {/* ------------------------------------------------ 1. o estado */}
      <section aria-label="Estado da obra" className={cn(CARTAO, "mt-6 p-5")}>
        <EstadoObra d={d} titulo={p.estado === "em curso" ? frase : null} irPara={irPara} />
      </section>

      {/* ------------------------------------------------ 2. a seguir (um primário) */}
      <section aria-label="O que fazer" className={cn(CARTAO, "mt-4 p-5")}>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">A seguir</h2>
        {p.estado === "em curso" ? <ASeguir d={d} irPara={irPara} /> : <p className="mt-2 text-lg">{frase}</p>}
        {tarde && (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-[15px]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <span>Os materiais ({tarde.pos.join(", ")}) chegam a {dataCurta(tarde.entrega)} e a obra começa a {dataCurta(tarde.inicio)}. Sem os materiais, a equipa fica parada.</span></p>
            {pode ? <Button variant="outline" className="min-h-11 shrink-0" onClick={go(() => A.inicioPlano(d.id, isoDia(tarde.depois)))}>Começar a {dataCurta(tarde.depois)}</Button> : <Mudar ctx={ctx} papel="operacoes" />}
          </div>
        )}
        {p.estado !== "em curso" && p.estado !== "concluída" && (
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[15px]" aria-label="Condições para arrancar">
            {([["Sinal pago", d.fin.pago], ["Encomenda emitida", !!d.obra.ec], ["Materiais no armazém", !!r?.pronta || (!!d.obra.ec && !d.obra.ec.ref)], ["Plano aprovado", p.estado !== "por aprovar"]] as [string, boolean][]).map(([t, ok]) => (
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
        {PE.length > 0 && <ParaEncerrar L={PE} irPara={irPara} fecho={go(() => { A.abrir(d.id); A.irObra(); })} />}
        {p.estado !== "concluída" && <div className="mt-5 flex flex-wrap items-center gap-3">{pode ? botao : <Mudar ctx={ctx} papel="operacoes" />}</div>}
      </section>
      {/* 15/10: com a obra concluída, o auto de receção (por assinar / assinado) e o relatório da obra */}
      {p.estado === "concluída" && d.obra.auto && <div className="mt-4"><AutoNoNegocio S={ctx.S} d={d} /></div>}

      {/* ------------------------------------------------ 3. o resto: os contactos, a dimensão e as viaturas */}
      <section aria-label="Detalhes da obra" className="mt-8">
        <dl className="grid gap-x-6 gap-y-3 text-[15px] sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0"><dt className="text-sm text-muted-foreground">Morada</dt>
            <dd><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(morada)}`} target="_blank" rel="noreferrer" className="inline-flex items-start gap-1.5 font-medium text-primary underline-offset-4 hover:underline"><MapPin className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />{morada}</a></dd></div>
          <div><dt className="text-sm text-muted-foreground">Cliente</dt>
            <dd><a href={`tel:${d.tel.replace(/\s/g, "")}`} className="inline-flex items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"><Phone className="h-4 w-4" aria-hidden="true" />{d.tel}</a></dd></div>
          <div><dt className="text-sm text-muted-foreground">{RESPONSAVEL_OBRA.papel}</dt>
            <dd>{RESPONSAVEL_OBRA.n}<a href={`tel:${RESPONSAVEL_OBRA.tel.replace(/\s/g, "")}`} className="block text-primary underline-offset-4 hover:underline">{RESPONSAVEL_OBRA.tel}</a></dd></div>
          <div><dt className="text-sm text-muted-foreground">Dimensão</dt>
            <dd className="tabular-nums">{p.tasks.length} {p.tasks.length === 1 ? "tarefa" : "tarefas"}<span className="block text-muted-foreground">{nfmt(horas)} h de equipa</span></dd></div>
        </dl>
        <ViaturasObra obra={d.id} ec={d.obra.ec?.ref} estado={d.obra.plano?.estado} />
      </section>

      {/* ------------------------------------------------ as secções da obra, num toque */}
      <nav aria-label="Secções da obra" className="sticky top-0 z-10 -mx-4 mt-6 flex gap-2 overflow-x-auto bg-background/95 px-4 py-2 backdrop-blur [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)] sm:[mask-image:none]">
        {secoes.filter(([, , v]) => v).map(([k, t]) => (
          <button key={k} type="button" onClick={() => irPara(k)} className="min-h-10 shrink-0 whitespace-nowrap rounded-full border border-input bg-card px-4 text-[15px] hover:border-foreground/40">
            {t}{k === "validar" && PV.length > 0 && <span className="ml-1.5 rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground">{PV.length}</span>}
            {k === "chat" && porLer > 0 && <span className="ml-1.5 rounded-full bg-warning px-1.5 text-xs font-semibold text-white">{porLer}</span>}
          </button>
        ))}
      </nav>

      <PlanoGantt ctx={ctx} d={d} aberta={aberta} setAberta={setAberta} muda={muda} sel={p.estado === "em curso" ? sel : null} setSel={p.estado === "em curso" ? (k) => { setSel(k); irPara("hoje"); } : undefined} />
      <TarefasDoPlano ctx={ctx} d={d} />
      {p.estado === "em curso" && <Acompanhamento ctx={ctx} d={d} sel={sel} setSel={setSel} ajustar={(ti) => { setAberta(ti); irPara("plano"); }} />}
      {p.estado === "em curso" && <PorValidar ctx={ctx} d={d} />}
      <ConversaNaObra ctx={ctx} d={d} />
      <EquipaObra ctx={ctx} d={d} direcao={direcao} verDia={(k) => { setSel(k); irPara("hoje"); }} />
      <EquipamentosObra d={d} />
      <ParaCima />
      <MateriaisObra ctx={ctx} d={d} />
      <DiarioObra ctx={ctx} d={d} pode={pode || direcao} />
      <SegurancaObra ctx={ctx} d={d} pode={pode} />
      {(direcao || pode) && <CustosObra d={d} />}
      {novo ? null : <p className={cn(NOTA, "mt-8")}>Plano de exemplo (antes do circuito do orçamento).</p>}
    </div>
  );
}

const TOM_PLANO: Record<string, string> = {
  "por aprovar": "bg-warning/15 text-foreground", aprovado: "bg-primary/10 text-primary", "em curso": "bg-primary text-primary-foreground", "concluída": "bg-success/15 text-foreground",
};
function ChipEstadoObra({ estado }: { estado: string }) {
  const t = ESTADO_PLANO[estado] ?? estado;
  return <span className={cn("rounded-full px-2.5 py-0.5 text-sm font-semibold", TOM_PLANO[estado] ?? "bg-muted")}>{t.charAt(0).toUpperCase() + t.slice(1)}</span>;
}

type Facto = { I: typeof Check; t: ReactNode; tom?: "aviso" | "mau" | "ok"; ir?: Seccao; acao?: string };
const TONS = { aviso: "text-warning", mau: "text-destructive", ok: "text-success" };
/** Uma linha por facto, com ícone e, quando dá, o atalho para a secção. */
function Factos({ L, irPara, rot, umaColuna }: { L: Facto[]; irPara: (s: Seccao) => void; rot: string; umaColuna?: boolean }) {
  return (
    <ul aria-label={rot} className={cn("grid gap-x-6 gap-y-2.5", !umaColuna && "sm:grid-cols-2")}>
      {L.map((x, k) => (
        <li key={k} className="flex min-w-0 items-start gap-2.5 text-[15px]">
          <x.I className={cn("mt-0.5 h-4 w-4 shrink-0", x.tom ? TONS[x.tom] : "text-muted-foreground")} aria-hidden="true" />
          <span className="min-w-0">{x.t}{x.ir && <> · <button type="button" onClick={() => irPara(x.ir!)} className="font-medium text-primary underline-offset-4 hover:underline">{x.acao ?? "ver"}</button></>}</span>
        </li>
      ))}
    </ul>
  );
}

/** 21/10: 1.º o estado, sem texto corrido: onde vai a obra (dia, progresso, fim) e quem está lá. O que há para fazer fica em ASeguir. */
function EstadoObra({ d, titulo, irPara }: { d: Negocio; titulo: string | null; irPara: (s: Seccao) => void }) {
  const p = d.obra.plano!, fim = fimDe(p.tasks), D = diferencas(p), prog = progresso(p);
  const val = p.tasks.filter((t) => estadoDe(t) === "validada").length;
  const atraso: ReactNode = D.dias ? <span className="text-warning"> · {D.dias > 0 ? "+" : "−"}{dias(Math.abs(D.dias))} face ao orçamento</span> : " · como no orçamento";
  let cab: ReactNode, L: Facto[];
  if (p.estado === "em curso") {
    const corr = p.tasks.filter((t) => t.corrige != null && estadoDe(t) !== "validada");
    const hoje = p.tasks.filter((t) => t.dia <= p.dia && p.dia < t.dia + t.dur && estadoDe(t) !== "validada");
    const reg = hoje.filter((t) => registouNoDia(t, p.dia) || estadoDe(t) === "feita").length;
    cab = <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <p className="text-xl font-semibold tracking-tight">{titulo}</p>
        <p className="text-2xl font-semibold tabular-nums">{Math.round(prog * 100)}%</p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${Math.round(prog * 100)}%` }} /></div>
    </>;
    L = [
      { I: CalendarClock, t: <>Acaba a <b className="font-semibold">{rotuloDia(p, fim - 1)}</b>{atraso}</>, tom: D.dias > 0 ? "aviso" : undefined },
      { I: CheckCircle2, t: <><b className="font-semibold">{val} de {p.tasks.length}</b> tarefas validadas</>, tom: val === p.tasks.length ? "ok" : undefined },
      { I: HardHat, t: hoje.length ? <>Hoje na obra: {[...new Set(hoje.map((t) => nomeTec(t.tec).split(" ")[0]))].join(", ")} · <b className="font-semibold">{reg} de {hoje.length}</b> com registo</> : "Hoje não há tarefas por fazer", ir: "hoje" },
      ...(corr.length ? [{ I: AlertTriangle, t: <><b className="font-semibold">{corr.length}</b> {corr.length === 1 ? "correção" : "correções"} em curso · {corr.map((t) => nomeTec(t.tec).split(" ")[0]).join(", ")}</>, tom: "mau" as const, ir: "hoje" as Seccao }] : []),
    ];
  } else if (p.estado === "concluída") {
    cab = <p className="text-xl font-semibold tracking-tight">Obra concluída{p.tasks.length ? ` a ${rotuloDia(p, fim - 1)}` : ""}</p>;
    L = [
      { I: CheckCircle2, t: <><b className="font-semibold">{p.tasks.length}</b> {p.tasks.length === 1 ? "tarefa feita" : "tarefas feitas"}</>, tom: "ok" },
      { I: ClipboardCheck, t: d.obra.auto?.estado === "assinado" ? "Auto de receção assinado pelo cliente" : d.obra.auto ? "Auto de receção por assinar" : "Sem auto de receção", tom: d.obra.auto?.estado === "assinado" ? "ok" : "aviso" },
    ];
  } else {
    const eq = equipaDaObra(p), nc = conflitos(p).length;
    cab = <p className="text-xl font-semibold tracking-tight">{p.estado === "por aprovar" ? "Plano por aprovar" : "Pronta a arrancar"}{p.tasks.length ? <span className="font-normal text-muted-foreground"> · começa a {rotuloDia(p, 0)}</span> : null}</p>;
    L = [
      { I: CalendarClock, t: <><b className="font-semibold">{dias(fim)} úteis</b> · acaba a {rotuloDia(p, fim - 1)}{atraso}</>, tom: D.dias > 0 ? "aviso" : undefined },
      { I: HardHat, t: eq.length ? <>Equipa: {eq.map((m) => m.n.split(" ")[0]).join(", ")}</> : "Sem técnicos atribuídos", ir: "equipa" },
      ...(nc ? [{ I: AlertTriangle, t: <><b className="font-semibold">{nc}</b> {nc === 1 ? "técnico de férias" : "técnicos de férias"} numa tarefa</>, tom: "aviso" as const }] : []),
    ];
  }
  return <div>{cab}<div className="mt-4"><Factos L={L} irPara={irPara} rot="Estado" /></div></div>;
}

/** 21/10: 2.º a seguir, com a obra em curso: o que espera por si (validar, correções, mensagens) e as próximas tarefas do plano. */
/** 21/10: a lista para encerrar a obra: cada ponto verde ou por fazer, e os por fazer levam ao sítio onde se resolvem. */
function ParaEncerrar({ L, irPara, fecho }: { L: PontoEncerrar[]; irPara: (s: Seccao) => void; fecho: () => void }) {
  const feitos = L.filter((x) => x.ok).length, tudo = feitos === L.length;
  const [aberta, setAberta] = useState(false);
  const ver = tudo && !aberta ? [] : L;
  return (
    <div className={cn("mt-5 rounded-xl border p-4", tudo ? "border-success/40 bg-success/[0.05]" : "border-border")} aria-label="Para encerrar a obra">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[15px] font-semibold">
          {tudo ? <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" /> : <ClipboardCheck className="h-5 w-5 text-muted-foreground" aria-hidden="true" />}
          {tudo ? "Tudo completo: pode encerrar a obra" : "Para encerrar a obra"}
        </p>
        <span className="flex items-center gap-2 text-sm tabular-nums text-muted-foreground">
          {feitos} de {L.length}
          {tudo && <button type="button" onClick={() => setAberta(!aberta)} aria-expanded={aberta} className="min-h-9 rounded-md px-2 font-medium text-primary hover:underline">{aberta ? "Esconder" : "Ver a lista"}</button>}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className={cn("h-full rounded-full transition-[width] duration-500", tudo ? "bg-success" : "bg-primary")} style={{ width: `${(feitos / L.length) * 100}%` }} />
      </div>
      {ver.length > 0 && (
        <ul className="mt-3 divide-y divide-border">
          {[...ver].sort((a, b) => Number(a.ok) - Number(b.ok)).map((x) => (
            <li key={x.k} className="flex items-center gap-3 py-2.5">
              {x.ok ? <Check className="h-5 w-5 shrink-0 text-success" aria-hidden="true" /> : <Circle className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />}
              <span className="min-w-0 flex-1">
                <span className={cn("block text-[15px]", x.ok ? "text-muted-foreground" : "font-medium")}>{x.t}<span className="sr-only">{x.ok ? " (feito)" : " (por fazer)"}</span></span>
                <span className="block text-sm text-muted-foreground">{x.sub}</span>
              </span>
              {!x.ok && (
                <button type="button" onClick={() => (x.onde === "fecho" ? fecho() : irPara(x.onde))}
                  className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-3 text-sm font-medium text-primary hover:bg-primary/[0.08]">
                  {x.onde === "fecho" ? "Preencher" : "Resolver"}<ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ASeguir({ d, irPara }: { d: Negocio; irPara: (s: Seccao) => void }) {
  const p = d.obra.plano!, PV = porValidar(p);
  const msgs = (d.obra.chat ?? []).filter((m) => m.de === "cliente" && !m.lida).length;
  const L: Facto[] = [
    ...(PV.length ? [{ I: Clock, t: <><b className="font-semibold">{PV.length}</b> {PV.length === 1 ? "tarefa terminada espera" : "tarefas terminadas esperam"} pela sua validação</>, tom: "aviso" as const, ir: "validar" as Seccao, acao: "validar" }] : []),
    ...(msgs ? [{ I: MessageCircle, t: <><b className="font-semibold">{msgs}</b> {msgs === 1 ? "mensagem nova" : "mensagens novas"} do cliente</>, tom: "aviso" as const, ir: "chat" as Seccao, acao: "responder" }] : []),
  ];
  const prox = p.tasks.filter((t) => t.dia > p.dia && estadoDe(t) === "por fazer").sort((a, b) => a.dia - b.dia).slice(0, 3);
  return (
    <div className="mt-3 space-y-4">
      {L.length > 0 ? <Factos L={L} irPara={irPara} rot="Por fazer" umaColuna /> : <p className="flex items-center gap-2 text-[15px]"><Check className="h-4 w-4 text-success" aria-hidden="true" />Nada à espera de si.</p>}
      {prox.length > 0 && (
        <div>
          <p className="text-sm text-muted-foreground">Próximas tarefas</p>
          <ul aria-label="Próximas tarefas" className="mt-1.5 divide-y divide-border rounded-xl border border-border">
            {prox.map((t) => (
              <li key={p.tasks.indexOf(t)} className="flex items-center gap-3 px-3 py-2 text-[15px]">
                <span className="w-24 shrink-0 text-sm font-medium tabular-nums text-muted-foreground">{rotuloDia(p, t.dia)}</span>
                <span className="min-w-0 flex-1 font-medium">{t.nome}</span>
                <span className="inline-flex shrink-0 items-center gap-2 text-sm text-muted-foreground"><Avatar id={t.tec} n={nomeTec(t.tec)} tam="h-6 w-6" /><span className="hidden sm:inline">{nomeTec(t.tec).split(" ")[0]}</span></span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ o plano por dia (Gantt), com os ajustes e o estado ao vivo */
function PlanoGantt({ ctx, d, aberta, setAberta, muda, sel, setSel }: { ctx: Ctx; d: Negocio; aberta: number | null; setAberta: (i: number | null) => void; muda: boolean; sel?: number | null; setSel?: (k: number) => void }) {
  const { S, A, run } = ctx;
  // 21/10: com a obra em curso, as Operações ajustam ao vivo (AjustarAoVivo), com o motivo e o aviso ao cliente
  const vivo = d.obra.plano!.estado === "em curso" && S.role === "operacoes";
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
          Arraste uma barra para mudar o início (ou largue-a noutra fase); puxe a ponta para mudar os dias. Toque numa tarefa para o técnico, os materiais e a nota.{p.estado === "aprovado" && " Mudar o plano aprovado volta a pô-lo por aprovar."}
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

      {vivo && <p className={cn(NOTA, "mt-1")}>Obra em curso: toque numa tarefa para a ajustar (dias, início ou técnico) e avisar o cliente. Toque num dia para o ver no acompanhamento.</p>}
      <AjustesFeitos d={d} />
      <div ref={caixa} className={cn(CARTAO, "mt-4 overflow-x-auto")}>
        <div className="relative" style={{ width: gradeW + 2 * PAD, paddingLeft: PAD, paddingRight: PAD }}>
          {/* os dias úteis; hoje marcado */}
          <div className="relative h-12 border-b border-border" style={{ width: gradeW }} aria-hidden="true">
            {Array.from({ length: nd }, (_, k) => {
              const [ds, dn] = rotuloDia(p, k).replace(",", "").split(" ");
              return (
                <div key={k} onClick={setSel ? () => setSel(k) : undefined} title={setSel ? `Ver ${rotuloDia(p, k)} no acompanhamento` : undefined}
                  className={cn("absolute bottom-0 top-0 pt-1.5 text-center", hoje === k && "rounded-t-lg bg-primary/10", setSel && "cursor-pointer rounded-t-lg hover:bg-muted", sel != null && sel === k && sel !== hoje && "rounded-t-lg ring-2 ring-inset ring-primary/50")} style={{ left: X(k), width: colW }}>
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
                  <li key={i} data-fase={t.fase ?? 0} className="py-1">
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
                      {/* 21/10: a barra arrasta-se (início e fase) e a ponta puxa os dias (PlanoInterativo.tsx) */}
                      <BarraTarefa p={p} t={t} ti={i} colW={colW} x={X(t.dia) + 2} largura={(t.dur === 1 && t.h < HORAS_DIA ? X(1) * Math.max(0.3, t.h / HORAS_DIA) : X(t.dur)) - 4 /* 21/10: menos de um dia, barra parcial */} cor={cor} ativa={muda} abrir={() => setAberta(aqui ? null : i)}
                        mover={(dia, fase) => run(() => (fase ? A.moverTarefaPlano(d.id, i, { fase, dia }) : A.ajustarTarefa(d.id, i, { dia })))} durar={(dur) => run(() => A.ajustarTarefa(d.id, i, { dur }))}
                        rotulo={`${t.nome}, ${rotuloDia(p, t.dia)}, ${t.dur === 1 && t.h < HORAS_DIA ? nfmt(t.h) + " h" : dias(t.dur)}${muda ? ". Arraste para mudar o início ou a fase; a ponta muda os dias. Teclado: setas, Shift + setas, Alt + setas." : ""}`}
                        className={cn(c && "ring-2 ring-warning", ex === "feita" && "ring-2 ring-warning/70", ex === "corrigir" && "ring-2 ring-destructive", aqui && "ring-2 ring-foreground/70 ring-offset-2 ring-offset-card")}
                        style={{ opacity: ex === "validada" || p.estado === "concluída" ? 0.55 : 1 }}>
                        {(ex === "validada" || p.estado === "concluída") && <Check className="absolute right-1.5 top-1 h-4 w-4 text-white" />}
                      </BarraTarefa>
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
          {muda ? <AjustarTarefa ctx={ctx} d={d} ti={aberta} fechar={() => setAberta(null)} />
            : vivo && podeAjustar(p, aberta).dur ? <AjustarAoVivo ctx={ctx} d={d} ti={aberta} fechar={() => setAberta(null)} />
            : <DetalheTarefaObra ctx={ctx} d={d} ti={aberta} fechar={() => setAberta(null)} />}
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
        <Duracao dur={t.dur} h={t.h} mudarDias={(n) => run(() => A.ajustarTarefa(d.id, ti, { dur: n }))} mudarHoras={(n) => run(() => A.ajustarTarefa(d.id, ti, { h: n }))}
          nota={b && (b.dur !== t.dur || b.h !== t.h) && <span className="block text-sm text-muted-foreground">no orçamento: {dias(b.dur)} · {nfmt(b.h)} h</span>} />
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
      <ExtrasTarefa ctx={ctx} d={d} ti={ti} fechar={fechar} />
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

/** 21/10: recusar a validação. O quê, quanto tempo (±) e quem corrige: nasce uma tarefa de correção no Hoje do técnico, o plano anda
 *  se não couber hoje (vê-se o efeito antes de enviar), e a correção volta a passar pela validação. */
function PedirCorrecao({ ctx, d, ti, motivo, setMotivo }: { ctx: Ctx; d: Negocio; ti: number; motivo: string; setMotivo: (m: string | null) => void }) {
  const { A, run } = ctx;
  const p = d.obra.plano!, t = p.tasks[ti];
  const [horas, setHoras] = useState(4);
  const [tec, setTec] = useState(t.tec);
  const prev = preverCorrecao(p, horas), delta = prev.fimDepois - prev.fimAntes;
  const chip = (on: boolean) => cn("min-h-10 rounded-full border px-3 text-[15px] transition-colors", on ? "border-foreground bg-foreground text-background" : "border-input hover:border-foreground/40");
  return (
    <div className="space-y-4 rounded-xl border border-destructive/30 bg-destructive/[0.03] p-4 animate-in fade-in-0 slide-in-from-top-1">
      <div>
        <p className="text-[15px] font-medium">1. O que falta corrigir?</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {["Falta acabamento", "Juntas por limpar", "Peça desalinhada", "A fotografia não mostra o trabalho"].map((m) => (
            <button key={m} type="button" aria-pressed={motivo === m} onClick={() => setMotivo(m)} className={chip(motivo === m)}>{m}</button>
          ))}
        </div>
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo da correção" placeholder="Ou escreva o que falta"
          className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </div>
      <div>
        <p className="text-[15px] font-medium">2. Quanto tempo leva, mais ou menos?</p>
        <div role="group" aria-label="Tempo estimado da correção" className="mt-2 flex flex-wrap gap-2">
          {TEMPOS_CORRECAO.map((x) => <button key={x.h} type="button" aria-pressed={horas === x.h} onClick={() => setHoras(x.h)} className={chip(horas === x.h)}>{x.rot}</button>)}
        </div>
      </div>
      <div>
        <p className="text-[15px] font-medium">3. Quem corrige</p>
        <div role="group" aria-label="Quem corrige" className="mt-2 flex flex-wrap gap-2">
          {tecnicosPara(t, p).map((x) => (
            <button key={x.id} type="button" aria-pressed={tec === x.id} onClick={() => setTec(x.id)}
              className={cn("flex min-h-11 items-center gap-2 rounded-xl border px-3 py-1.5 text-left text-[15px] transition-colors", tec === x.id ? "border-primary bg-primary/[0.06]" : "border-input hover:border-foreground/40")}>
              <Avatar id={x.id} n={x.n} tam="h-7 w-7" />{x.n}{x.id === t.tec && <span className="text-sm text-muted-foreground">· fez a tarefa</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-xl bg-card p-3 text-[15px] shadow-[var(--shadow-sm)]">
        <p className="text-sm font-medium text-muted-foreground">O que acontece</p>
        <ul className="mt-1 space-y-1">
          <li className="flex gap-2"><HardHat className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />{nomeTec(tec).split(" ")[0]} recebe uma tarefa de correção no Hoje, {prev.dia === p.dia ? "para hoje" : `a ${rotuloDia(p, prev.dia)}`}, com o seu pedido.</li>
          <li className="flex gap-2"><Camera className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />Envia novas fotografias e volta à sua validação.</li>
          <li className={cn("flex gap-2", delta > 0 && "font-medium text-warning")}><CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {delta > 0 ? `A obra passa a acabar a ${rotuloDia(p, prev.fimDepois - 1)} (era ${rotuloDia(p, prev.fimAntes - 1)}) · +${dias(delta)}${prev.mexe.length ? `; andam: ${prev.mexe.join(", ")}` : ""}` : "Cabe hoje: a data de fim mantém-se."}</li>
        </ul>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button className="min-h-11" disabled={!motivo.trim() || !tec} onClick={() => { run(() => A.pedirCorrecao(d.id, ti, motivo, { horas, tec })); setMotivo(null); }}>Enviar a correção a {nomeTec(tec).split(" ")[0]}</Button>
        <Button variant="ghost" className="min-h-11" onClick={() => setMotivo(null)}>Cancelar</Button>
      </div>
    </div>
  );
}

/** O que o técnico registou (horas, fotografias, nota) e, se está feita, validar ou pedir correção. */
function Registo({ ctx, d, ti, compacto }: { ctx: Ctx; d: Negocio; ti: number; compacto?: boolean }) {
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
      {!compacto && !!t.exec?.fotos.length && <Miniaturas fotos={t.exec.fotos} tam="h-24 w-32" />}
      {!compacto && t.exec?.nota && <p className="text-[15px] text-muted-foreground">«{t.exec.nota}»</p>}
      {ex === "feita" && (pode ? (
        motivo == null ? (
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-11" onClick={() => run(() => A.validarTarefa(d.id, ti))}><Check className="mr-1.5 h-4 w-4" aria-hidden="true" />Validar</Button>
            <Button variant="outline" className="min-h-11" onClick={() => setMotivo("")}>Pedir correção</Button>
          </div>
        ) : (
          <PedirCorrecao ctx={ctx} d={d} ti={ti} motivo={motivo} setMotivo={setMotivo} />
        )
      ) : <Mudar ctx={ctx} papel="operacoes" />)}
    </div>
  );
}

/* ------------------------------------------------------------------ 21/10: o acompanhamento (o gestor vê tudo aqui; o técnico faz pelo Hoje dele) */
function Indicador({ rot, valor, sub, tom, barra }: { rot: string; valor: ReactNode; sub?: ReactNode; tom?: "ok" | "aviso"; barra?: number }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-sm)]">
      <p className="text-sm text-muted-foreground">{rot}</p>
      <p className={cn("mt-0.5 text-2xl font-semibold tabular-nums tracking-tight", tom === "aviso" && "text-warning", tom === "ok" && "text-success")}>{valor}</p>
      {barra != null && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className="h-full rounded-full bg-primary transition-[width] duration-700" style={{ width: `${Math.round(barra * 100)}%` }} /></div>}
      {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Acompanhamento({ ctx, d, sel, setSel, ajustar }: { ctx: Ctx; d: Negocio; sel: number; setSel: (k: number) => void; ajustar: (ti: number) => void }) {
  const { S, A, run, go } = ctx;
  const p = d.obra.plano!, fim = fimDe(p.tasks), pode = S.role === "operacoes";
  const [hist, setHist] = useState<number | null>(null);
  const [fecho, setFecho] = useState<number | null>(null);
  const prog = progresso(p);
  // as horas previstas até ao fim de hoje (os dias já passados de cada tarefa, com hoje)
  const ate = p.tasks.reduce((a, t) => a + (t.h / t.dur) * Math.max(0, Math.min(t.dur, p.dia + 1 - t.dia)), 0);
  const reg = p.tasks.reduce((a, t) => a + (t.exec?.horas ?? 0), 0);
  const val = p.tasks.filter((t) => estadoDe(t) === "validada").length;
  const D = diferencas(p);
  const hojeTs = p.tasks.filter((t) => t.dia <= p.dia && p.dia < t.dia + t.dur && estadoDe(t) !== "validada");
  const tecsHoje = [...new Set(hojeTs.map((t) => t.tec).filter(Boolean) as string[])];
  const jaReg = tecsHoje.filter((id) => hojeTs.some((t) => t.tec === id && (registouNoDia(t, p.dia) || estadoDe(t) === "feita")));
  // o que precisa do gestor, por ordem
  const alertas: { t: string; tom: "aviso" | "mau"; ir?: () => void }[] = [];
  p.tasks.forEach((t, i) => {
    if (estadoDe(t) === "feita") alertas.push({ t: `${t.nome}: ${nomeTec(t.tec).split(" ")[0]} terminou, falta validar`, tom: "aviso", ir: () => { setSel(enviosDe(t).at(-1)?.dia ?? p.dia); setHist(i); } });
    if (estadoDe(t) === "corrigir") alertas.push({ t: `${t.nome}: correção pedida, à espera do técnico`, tom: "mau" });
    for (let k = t.dia; k < Math.min(p.dia, t.dia + t.dur); k++)
      if (!registouNoDia(t, k) && estadoDe(t) !== "validada" && estadoDe(t) !== "feita") alertas.push({ t: `${t.nome}: sem registo a ${rotuloDia(p, k)}`, tom: "aviso", ir: () => setSel(k) });
  });
  for (const x of (d.obra.diario ?? []).filter((x) => x.k === "ocorrencia" && x.q.startsWith("hoje")).slice(-3)) alertas.push({ t: `${x.quem.split(" ")[0]} reportou: ${x.t}`, tom: "mau" });
  const verComo = (tec: string | null) => go(() => { if (tec) A.souTec(tec); A.role("tecnico"); A.nav("hoje"); });
  // o que chega do terreno enquanto o gestor está a ver (o técnico noutra janela): aparece em cima, com a fotografia
  const nDiario = d.obra.diario?.length ?? 0, antes = useRef(nDiario);
  const [chegou, setChegou] = useState<EntradaDiario | null>(null);
  useEffect(() => {
    const novo = nDiario > antes.current ? d.obra.diario![nDiario - 1] : null;
    antes.current = nDiario;
    if (!novo || (novo.k !== "horas" && novo.k !== "ocorrencia")) return;
    setChegou(novo); setSel(p.dia);
    const id = window.setTimeout(() => setChegou(null), 9000);
    return () => window.clearTimeout(id);
  }, [nDiario]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section id="obra-hoje" aria-labelledby="obra-hoje-t" className="mt-10 scroll-mt-16">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="obra-hoje-t" className={H2}>Acompanhamento <span className="font-normal text-muted-foreground">· ao vivo</span></h2>
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground"><span className="relative flex h-2.5 w-2.5" aria-hidden="true"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" /></span>Os registos dos técnicos chegam aqui</span>
      </div>

      {chegou && (
        <div role="status" className={cn("mt-4 flex items-center gap-3 rounded-2xl border p-3 shadow-lg animate-in fade-in-0 slide-in-from-top-2 duration-500", chegou.k === "ocorrencia" ? "border-destructive/40 bg-destructive/[0.06]" : "border-primary/40 bg-primary/[0.06]")}>
          {chegou.fotos?.[0] ? <img src={chegou.fotos[0]} alt="" className="h-14 w-20 shrink-0 rounded-lg object-cover" /> : <AlertTriangle className="h-6 w-6 shrink-0 text-destructive" aria-hidden="true" />}
          <div className="min-w-0 flex-1">
            <p className={cn("text-sm font-semibold", chegou.k === "ocorrencia" ? "text-destructive" : "text-primary")}>{chegou.k === "ocorrencia" ? "Problema reportado agora" : "Novo registo do terreno"} · {chegou.quem}</p>
            <p className="line-clamp-2 text-[15px]">{chegou.t}</p>
          </div>
          <button type="button" onClick={() => setChegou(null)} aria-label="Fechar" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador rot="Obra feita" valor={`${Math.round(prog * 100)}%`} barra={prog} sub={`${val} de ${p.tasks.length} tarefas validadas`} />
        <Indicador rot="Horas registadas" valor={`${nfmt(reg)} h`} tom={reg > ate * 1.1 && ate > 0 ? "aviso" : undefined} sub={`previstas até hoje: ${nfmt(Math.round(ate * 10) / 10)} h`} />
        <Indicador rot="Acaba a" valor={rotuloDia(p, fim - 1)} tom={D.dias > 0 ? "aviso" : D.dias < 0 ? "ok" : undefined} sub={D.dias ? `${D.dias > 0 ? "+" : "−"}${dias(Math.abs(D.dias))} face ao orçamento` : "como no orçamento"} />
        <Indicador rot="Registos de hoje" valor={`${jaReg.length} de ${tecsHoje.length}`} tom={tecsHoje.length && jaReg.length === tecsHoje.length ? "ok" : undefined}
          sub={tecsHoje.length ? (jaReg.length === tecsHoje.length ? "toda a equipa registou" : `falta ${tecsHoje.filter((x) => !jaReg.includes(x)).map((x) => nomeTec(x).split(" ")[0]).join(", ")}`) : "ninguém na obra hoje"} />
      </div>

      {alertas.length > 0 && (
        <ul className="mt-4 space-y-2" aria-label="Precisa de si">
          {alertas.slice(0, 5).map((a, k) => (
            <li key={k} className={cn("flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-[15px]", a.tom === "mau" ? "border-destructive/30 bg-destructive/[0.05]" : "border-warning/40 bg-warning/[0.07]")}>
              <span className="flex min-w-0 items-start gap-2"><AlertTriangle className={cn("mt-0.5 h-4 w-4 shrink-0", a.tom === "mau" ? "text-destructive" : "text-warning")} aria-hidden="true" />{a.t}</span>
              {a.ir && <button type="button" onClick={a.ir} className="min-h-9 text-sm font-medium text-primary underline-offset-4 hover:underline">Ver</button>}
            </li>
          ))}
        </ul>
      )}

      {/* hoje: o relógio do protótipo, para a frente e para trás */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted/60 px-4 py-3">
        <p className="text-[15px]"><b className="font-semibold">Hoje é o dia {p.dia + 1} de {fim}</b> <span className="text-muted-foreground">· {rotuloDia(p, p.dia)} · o protótipo não tem relógio</span></p>
        {pode ? (
          <div className="flex gap-2">
            <Button variant="outline" className="min-h-10" disabled={p.dia <= 0} onClick={() => run(() => A.irParaDia(d.id, p.dia - 1))}><ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" />Recuar um dia</Button>
            <Button variant="outline" className="min-h-10" disabled={p.dia >= fim - 1} onClick={() => run(() => A.irParaDia(d.id, p.dia + 1))}>Avançar um dia<ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" /></Button>
          </div>
        ) : <Mudar ctx={ctx} papel="operacoes" />}
      </div>

      <div className="mt-4"><FitaDias p={p} sel={sel} setSel={setSel} /></div>
      {sel !== p.dia && <button type="button" onClick={() => setSel(p.dia)} className="mt-2 min-h-9 text-sm font-medium text-primary underline-offset-4 hover:underline">Voltar a hoje</button>}

      <div className="mt-4">
        <DiaDaObra p={p} dia={sel} modo="gestor" acoes={(ti) => {
          const t = p.tasks[ti], ex = estadoDe(t), aberto = hist === ti, aj = podeAjustar(p, ti);
          // 21/10: o gestor pode dar por feita ele próprio (com uma fotografia): salta a validação
          const podeFechar = pode && sel === p.dia && t.dia <= p.dia && ex !== "validada" && ex !== "feita" && !p.tasks.some((x) => x.corrige === ti && estadoDe(x) !== "validada");
          return (
            <>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-2">
                <button type="button" onClick={() => setHist(aberto ? null : ti)} aria-expanded={aberto} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
                  {aberto ? "Fechar" : ex === "feita" ? "Rever e validar" : `Histórico (${enviosDe(t).length})`}
                </button>
                {podeFechar && fecho !== ti && <button type="button" onClick={() => { setFecho(ti); setHist(null); }} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Dar por feita</button>}
                {pode && (aj.dur || aj.inicio) && <button type="button" onClick={() => ajustar(ti)} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"><CalendarClock className="h-4 w-4" aria-hidden="true" />Ajustar o plano</button>}
                {t.tec && <button type="button" onClick={verComo(t.tec)} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"><Smartphone className="h-4 w-4" aria-hidden="true" />Ver como {nomeTec(t.tec).split(" ")[0]}</button>}
              </div>
              {aberto && (
                <div className="mt-3 space-y-4 animate-in fade-in-0 slide-in-from-top-1">
                  <HistoricoTarefa t={t} p={p} />
                  {ex === "feita" && <Registo ctx={ctx} d={d} ti={ti} compacto />}
                </div>
              )}
              {podeFechar && fecho === ti && <DarPorFeita ctx={ctx} d={d} ti={ti} fechar={() => setFecho(null)} />}
            </>
          );
        }} />
      </div>
    </section>
  );
}

/** 21/10: o responsável de obra dá a tarefa por feita ele próprio, com uma fotografia, para poupar tempo ao técnico.
 *  Como é ele quem valida, fica logo validada; a fotografia e a nota vão para o histórico e para o portal do cliente. */
function DarPorFeita({ ctx, d, ti, fechar }: { ctx: Ctx; d: Negocio; ti: number; fechar: () => void }) {
  const { A, run } = ctx;
  const p = d.obra.plano!, t = p.tasks[ti];
  const [fotos, setFotos] = useState<string[]>([]);
  const [nota, setNota] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const juntar = async (f: File) => { try { const u = await lerFoto(f); setFotos((x) => [...x, u].slice(-4)); } catch { /* sem leitura */ } };
  const cor = t.fase ? COR_FASE[t.fase] : "#7c5ce0";
  return (
    <div className="mt-3 space-y-3 rounded-xl border border-success/30 bg-success/[0.04] p-4 animate-in fade-in-0 slide-in-from-top-1">
      <p className="text-[15px]"><b className="font-semibold">Dar por feita sem esperar por {nomeTec(t.tec).split(" ")[0]}.</b> <span className="text-muted-foreground">Fica logo validada{t.exec?.horas ? "" : `, com as ${nfmt(t.h)} h previstas`}.</span></p>
      <div className="flex flex-wrap items-center gap-2">
        {fotos.map((f, k) => (
          <span key={k} className="relative animate-in zoom-in-95">
            <img src={f} alt={`Fotografia ${k + 1}`} className="h-20 w-28 rounded-lg border border-border object-cover" />
            <button type="button" aria-label={`Tirar a fotografia ${k + 1}`} onClick={() => setFotos(fotos.filter((_, i) => i !== k))} className="absolute -right-2 -top-2 grid h-7 w-7 place-items-center rounded-full border border-border bg-card shadow"><X className="h-3.5 w-3.5" /></button>
          </span>
        ))}
        <input ref={input} type="file" accept="image/*" capture="environment" multiple className="sr-only" aria-label="Escolher fotografias" onChange={(e) => { for (const f of Array.from(e.target.files ?? [])) void juntar(f); e.target.value = ""; }} />
        <Button variant="outline" className="min-h-11" onClick={() => input.current?.click()}><Camera className="mr-1.5 h-4 w-4" aria-hidden="true" />{fotos.length ? "Mais uma fotografia" : "Tirar fotografia"}</Button>
        <button type="button" onClick={() => setFotos((x) => [...x, fotoExemplo(t.nome, cor, enviosDe(t).length + x.length)].slice(-4))} className="min-h-11 px-1 text-[15px] font-medium text-primary underline-offset-4 hover:underline">Usar uma de exemplo</button>
      </div>
      <input value={nota} onChange={(e) => setNota(e.target.value)} aria-label="Nota (opcional)" placeholder="Nota (opcional): o cliente vê-a no portal"
        className="h-11 w-full rounded-lg border border-input bg-background px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      <div className="flex flex-wrap gap-2">
        <Button className="min-h-11" disabled={!fotos.length} onClick={() => { run(() => A.darPorFeita(d.id, ti, { fotos, nota })); fechar(); }}><Check className="mr-1.5 h-4 w-4" aria-hidden="true" />Dar por feita e validar</Button>
        <Button variant="ghost" className="min-h-11" onClick={fechar}>Cancelar</Button>
      </div>
      {!fotos.length && <p className="text-sm text-muted-foreground">Falta uma fotografia do trabalho feito.</p>}
    </div>
  );
}

/** 21/10: ajustar o plano com a obra em curso. Muda-se um rascunho, vê-se o efeito (o fim da obra, o que mexe, o aviso ao cliente) e aplica-se. */
function AjustarAoVivo({ ctx, d, ti, fechar }: { ctx: Ctx; d: Negocio; ti: number; fechar: () => void }) {
  const { A, run } = ctx;
  const p = d.obra.plano!, t = p.tasks[ti], P = podeAjustar(p, ti);
  const [dur, setDur] = useState(t.dur), [h, setH] = useState(t.h), [dia, setDia] = useState(t.dia), [tec, setTec] = useState(t.tec ?? "");
  const [motivo, setMotivo] = useState(""), [cliente, setCliente] = useState(true);
  useEffect(() => { setDur(t.dur); setH(t.h); setDia(t.dia); setTec(t.tec ?? ""); setMotivo(""); }, [ti, t.dur, t.h, t.dia, t.tec]);
  // a duração muda-se em dias ou em horas (a última que se mexeu manda)
  const m = { dur: dur !== t.dur && h === t.h ? dur : undefined, h: h !== t.h ? h : undefined, dia: dia !== t.dia ? dia : undefined, tec: tec && tec !== t.tec ? tec : undefined };
  const prev = preverAjuste(p, ti, m), muda = !!prev.texto;
  const fimA = rotuloDia(p, prev.fimAntes - 1), delta = prev.fimDepois - prev.fimAntes;
  const fimD = delta ? rotuloDia(p, prev.fimDepois - 1) : fimA;
  const minDur = duracaoMinima(p, ti), minDia = inicioMinimoVivo(p, ti);
  return (
    <section aria-label={`Ajustar ${t.nome}`} className={cn(CARTAO, "border-primary/40 p-4 ring-1 ring-primary/20 animate-in fade-in-0 slide-in-from-top-1 duration-200 sm:p-5")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary">Ajustar com a obra em curso</p>
          <p className="text-base font-semibold">{t.nome}</p>
          <p className={NOTA}>{nomeTec(t.tec)} · {rotuloDia(p, t.dia)}{t.dur > 1 ? ` a ${rotuloDia(p, t.dia + t.dur - 1)}` : ""}</p>
        </div>
        <button type="button" onClick={fechar} aria-label="Fechar" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-muted"><X className="h-5 w-5" /></button>
      </div>
      {P.porque && <p className={cn(NOTA, "mt-2")}>{P.porque}</p>}
      {(P.dur || P.inicio || P.tec) && (
        <dl className="mt-3 divide-y divide-border">
          {P.dur && (
            <Duracao dur={h !== t.h ? diasDasHoras(h) : dur} h={h !== t.h ? h : dur !== t.dur ? dur * HORAS_DIA : t.h} minDur={minDur}
              mudarDias={(n) => { setDur(n); setH(t.h); }} mudarHoras={(n) => { setH(n); setDur(t.dur); }}
              nota={minDur > 1 && <span className="block text-sm text-muted-foreground">não pode acabar antes de hoje</span>} />
          )}
          {P.inicio && (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
              <dt className="text-[15px]">Começa</dt>
              <dd><Passo rot="Dia de início" valor={rotuloDia(p, dia)} desMenos={dia <= minDia} menos={() => setDia(dia - 1)} mais={() => setDia(dia + 1)} /></dd>
            </div>
          )}
          {P.tec && (
            <div className="py-3">
              <dt className="text-[15px]">Técnico</dt>
              <dd role="group" aria-label={`Técnico de ${t.nome}`} className="mt-2 flex flex-wrap gap-2">
                {tecnicosPara(t, p).map((x) => (
                  <button key={x.id} type="button" aria-pressed={tec === x.id} onClick={() => setTec(x.id)}
                    className={cn("flex min-h-11 items-center gap-2 rounded-xl border px-3 py-1.5 text-left text-[15px] transition-colors", tec === x.id ? "border-primary bg-primary/[0.06]" : "border-input hover:border-foreground/40")}>
                    <Avatar id={x.id} n={x.n} tam="h-7 w-7" /><span>{x.n}<span className={cn("block text-sm", x.livre ? "text-success" : "text-warning")}>{x.livre ? "livre" : `de férias a ${x.ferias}`}</span></span>
                  </button>
                ))}
              </dd>
            </div>
          )}
          <div className="py-3">
            <dt className="text-[15px]">Porquê</dt>
            <dd className="mt-2 space-y-2">
              <div className="flex flex-wrap gap-2">
                {MOTIVOS_AJUSTE.map((x) => <button key={x} type="button" aria-pressed={motivo === x} onClick={() => setMotivo(x)} className={cn("min-h-10 rounded-full border px-3 text-[15px]", motivo === x ? "border-foreground bg-foreground text-background" : "border-input hover:border-foreground/40")}>{x}</button>)}
              </div>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo do ajuste" placeholder="Ou escreva o motivo" className="h-11 w-full rounded-lg border border-input bg-background px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </dd>
          </div>
        </dl>
      )}
      {muda && (
        <div className="mt-2 rounded-xl bg-muted/60 p-4 animate-in fade-in-0">
          <p className="text-sm font-medium text-muted-foreground">O efeito</p>
          <p className="mt-1 text-[15px]">{prev.texto}.</p>
          <p className={cn("mt-1 text-[15px] font-medium", delta > 0 ? "text-warning" : delta < 0 ? "text-success" : "")}>
            {delta ? `A obra passa a acabar a ${fimD} (era ${fimA}) · ${delta > 0 ? "+" : "−"}${dias(Math.abs(delta))}` : `A obra continua a acabar a ${fimA}`}
          </p>
          {prev.mexe.length > 0 && <p className={cn(NOTA, "mt-1")}>Também mudam de datas: {prev.mexe.join(", ")}.</p>}
          <label className="mt-3 flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={cliente} onChange={(e) => setCliente(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[hsl(var(--primary))]" />
            <span className="text-[15px]"><b className="font-medium">Avisar o cliente no portal</b>
              {cliente && <span className="mt-1 block rounded-lg border border-border bg-card px-3 py-2 text-muted-foreground">«{textoAvisoCliente(t.nome, motivo || "motivo", fimA, fimD)}»</span>}</span>
          </label>
        </div>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="lg" disabled={!muda || !motivo.trim()} onClick={() => { run(() => A.ajustarAoVivo(d.id, ti, m, motivo, cliente)); fechar(); }}>Aplicar o ajuste</Button>
        <Button size="lg" variant="ghost" onClick={fechar}>Cancelar</Button>
      </div>
      {muda && !motivo.trim() && <p className={cn(NOTA, "mt-2")}>Escolha o porquê: fica no diário e, se avisar, no portal do cliente.</p>}
      <div className="mt-4"><ExtrasTarefa ctx={ctx} d={d} ti={ti} fase={false} fechar={fechar} /></div>
    </section>
  );
}

/** Os ajustes feitos com a obra em curso, do mais recente para o mais antigo. */
function AjustesFeitos({ d }: { d: Negocio }) {
  const L = d.obra.alteracoes ?? [];
  if (!L.length) return null;
  return (
    <div className="mt-4">
      <p className="text-[15px] font-medium">Ajustes com a obra em curso <span className="font-normal text-muted-foreground">· {L.length}</span></p>
      <ul className={cn(CARTAO, "mt-2 divide-y divide-border px-4")}>
        {L.map((a, k) => (
          <li key={k} className="py-3 text-[15px] animate-in fade-in-0">
            <p>{a.t} <span className="text-muted-foreground">· {a.motivo}</span></p>
            <p className="text-sm text-muted-foreground">{a.q} · {a.quem} · {a.fimAntes === a.fimDepois ? `o fim mantém-se a ${a.fimDepois}` : `fim: ${a.fimAntes} → ${a.fimDepois}`}{a.cliente ? " · cliente avisado no portal" : " · sem aviso ao cliente"}</p>
          </li>
        ))}
      </ul>
    </div>
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
/** 21/10: a equipa, com links: cada pessoa abre as tarefas dela nesta obra (com o estado e o dia, que leva ao acompanhamento),
 *  a app dela (o Hoje do técnico) e o telefone. */
function EquipaObra({ ctx, d, direcao, verDia }: { ctx: Ctx; d: Negocio; direcao: boolean; verDia: (k: number) => void }) {
  const { A, go } = ctx;
  const p = d.obra.plano!, eq = equipaDaObra(p);
  const [aberto, setAberto] = useState<string | null>(null);
  return (
    <section id="obra-equipa" aria-labelledby="obra-equipa-t" className="mt-10 scroll-mt-16">
      <h2 id="obra-equipa-t" className={H2}>Equipa <span className="font-normal text-muted-foreground">· {eq.length} {eq.length === 1 ? "pessoa" : "pessoas"} e o responsável</span></h2>
      <ul className={cn(CARTAO, "mt-3 divide-y divide-border px-4 sm:px-5")}>
        <li className="flex items-center gap-3 py-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-foreground text-sm font-semibold text-background" aria-hidden="true">{iniciais(RESPONSAVEL_OBRA.n)}</span>
          <span className="min-w-0 flex-1"><span className="block text-[15px] font-medium">{RESPONSAVEL_OBRA.n}</span><span className={NOTA}>{RESPONSAVEL_OBRA.papel} · valida as tarefas</span></span>
          <a href={`tel:${RESPONSAVEL_OBRA.tel.replace(/\s/g, "")}`} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-[15px] text-primary"><Phone className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">{RESPONSAVEL_OBRA.tel}</span><span className="sr-only sm:hidden">Ligar</span></a>
        </li>
        {eq.map((m) => {
          const on = aberto === m.id;
          const minhas = p.tasks.map((t, i) => ({ t, i })).filter(({ t }) => t.tec === m.id);
          return (
            <li key={m.id} className="py-3">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setAberto(on ? null : m.id)} aria-expanded={on} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <Avatar id={m.id} n={m.n} tam="h-10 w-10" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium text-primary underline-offset-4 hover:underline">{m.n} <span className="font-normal text-muted-foreground no-underline">· {m.sk}</span></span>
                    <span className="block text-sm text-muted-foreground">{dias(m.dias)} na obra · {nfmt(m.horas)} h · {m.tarefas.join(", ")}{direcao ? ` · ${eur(m.custoH)} €/h` : ""}</span>
                  </span>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", on && "rotate-180")} aria-hidden="true" />
                </button>
                <a href={`tel:${m.tel.replace(/\s/g, "")}`} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-[15px] text-primary"><Phone className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">{m.tel}</span><span className="sr-only sm:hidden">Ligar a {m.n}</span></a>
              </div>
              {on && (
                <div className="ml-[3.25rem] mt-2 space-y-2 animate-in fade-in-0 slide-in-from-top-1">
                  <ul className="space-y-1.5">
                    {minhas.map(({ t, i }) => (
                      <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px]">
                        <button type="button" onClick={() => verDia(Math.min(p.dia, t.dia + t.dur - 1) >= t.dia ? Math.min(p.dia, t.dia + t.dur - 1) : t.dia)} className="font-medium text-primary underline-offset-4 hover:underline">{t.nome}</button>
                        <span className="text-sm text-muted-foreground">{rotuloDia(p, t.dia)}{t.dur > 1 ? ` a ${rotuloDia(p, t.dia + t.dur - 1)}` : ""}</span>
                        {(p.estado === "em curso" || p.estado === "concluída") && <ChipExec e={p.estado === "concluída" ? "validada" : estadoDe(t)} />}
                      </li>
                    ))}
                  </ul>
                  <Button variant="outline" className="min-h-10" onClick={go(() => { A.souTec(m.id); A.role("tecnico"); A.nav("hoje"); })}><Smartphone className="mr-1.5 h-4 w-4" aria-hidden="true" />Abrir a app de {m.n.split(" ")[0]}</Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {!direcao && <p className={cn(NOTA, "mt-2")}>O custo por hora de cada pessoa só a Direção o vê.</p>}
    </section>
  );
}

/* ------------------------------------------------------------------ os equipamentos */
/** Onde está cada equipamento e em que estado (dados de exemplo). */
const FICHA_EQUIP: Record<string, { onde: string; estado: string }> = {
  "Martelo demolidor": { onde: "Armazém de Odivelas · zona B", estado: "Revisto a 02/10" },
  "Prensa de multicamada": { onde: "Armazém de Odivelas · zona C", estado: "Calibrada a 15/09" },
  "Nível laser": { onde: "Armazém de Odivelas · armário 2", estado: "Bateria trocada a 30/09" },
  "Cortadora de azulejo 120 cm": { onde: "Alugatudo Equipamentos · entrega na obra", estado: "Aluguer de 2 dias" },
};

/** 21/10: os equipamentos, com links: cada um abre onde está, o estado e para que tarefas vai; a carrinha abre na Frota (e volta à obra). */
function EquipamentosObra({ d }: { d: Negocio }) {
  const p = d.obra.plano!, L = equipamentosDaObra(p);
  const [aberto, setAberto] = useState<string | null>(null);
  return (
    <section id="obra-equip" aria-labelledby="obra-equip-t" className="mt-10 scroll-mt-16">
      <h2 id="obra-equip-t" className={H2}>Equipamentos <span className="font-normal text-muted-foreground">· {L.length}</span></h2>
      <p className={cn(NOTA, "mt-1")}>Das receitas dos serviços e do ofício de cada técnico, reservados pelos dias das tarefas. Toque num para ver onde está.</p>
      <ul className={cn(CARTAO, "mt-3 divide-y divide-border px-4 sm:px-5")}>
        {L.map((e) => {
          const I = e.origem === "Frota" ? Truck : e.origem === "Aluguer" ? Store : Wrench, on = aberto === e.n;
          const f = FICHA_EQUIP[e.n] ?? { onde: e.origem === "Frota" ? "Na obra, com a equipa" : e.origem === "Aluguer" ? `${e.de ?? "Fornecedor de aluguer"} · entrega na obra` : "Armazém de Odivelas", estado: "Em bom estado" };
          return (
            <li key={e.n} className="py-3">
              <button type="button" onClick={() => setAberto(on ? null : e.n)} aria-expanded={on} className="flex w-full items-start gap-3 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-foreground/70" aria-hidden="true"><I className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-primary underline-offset-4 hover:underline">{e.n}</span>
                  <span className="block text-sm text-muted-foreground">{e.tarefas.join(", ")}</span>
                  <span className="block text-sm tabular-nums text-muted-foreground">{quandoEquip(p, e)}</span>
                </span>
                <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-sm font-medium", e.origem === "Aluguer" ? "bg-warning/15" : e.origem === "Frota" ? "bg-primary/10 text-primary" : "bg-muted")}>{e.origem}</span>
              </button>
              {on && (
                <div className="ml-[3.25rem] mt-2 space-y-2 text-[15px] animate-in fade-in-0 slide-in-from-top-1">
                  <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                    <div><dt className="text-sm text-muted-foreground">Onde está</dt><dd>{f.onde}</dd></div>
                    <div><dt className="text-sm text-muted-foreground">Estado</dt><dd>{f.estado}</dd></div>
                    <div><dt className="text-sm text-muted-foreground">Reservado</dt><dd>{quandoEquip(p, e)}</dd></div>
                    <div><dt className="text-sm text-muted-foreground">Leva</dt><dd>{e.tarefas.map((t) => nomeTec(p.tasks.find((x) => x.nome === t)?.tec ?? null).split(" ")[0]).filter((x, i, a) => a.indexOf(x) === i && x !== "sem").join(", ") || "a equipa"}</dd></div>
                  </dl>
                  {e.origem === "Frota" && <Button variant="outline" className="min-h-10" onClick={() => pedirFrota({ aba: "viaturas" })}><Truck className="mr-1.5 h-4 w-4" aria-hidden="true" />Abrir na Frota</Button>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {L.some((e) => e.de) && <p className={cn(NOTA, "mt-2")}>Aluguer: {[...new Set(L.filter((e) => e.de).map((e) => e.de))].join(", ")}.</p>}
    </section>
  );
}

/** 21/10: a conversa com o cliente (o mesmo fio do portal do cliente). Ao abrir, as mensagens do cliente ficam lidas. */
function ConversaNaObra({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const { A, run } = ctx;
  const msgs = d.obra.chat ?? [], porLer = msgs.filter((m) => m.de === "cliente" && !m.lida).length;
  return (
    <section id="obra-chat" aria-labelledby="obra-chat-t" className="mt-10 scroll-mt-16">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="obra-chat-t" className={H2}>Conversa com o cliente <span className="font-normal text-muted-foreground">· {d.nome}</span></h2>
        {porLer > 0 && <button type="button" onClick={() => run(() => A.lerChat(d.id))} className="min-h-10 text-sm font-medium text-primary underline-offset-4 hover:underline">Marcar {porLer === 1 ? "1 mensagem" : `${porLer} mensagens`} como lida{porLer === 1 ? "" : "s"}</button>}
      </div>
      <p className={cn(NOTA, "mt-1")}>O cliente escreve no portal; a resposta chega-lhe lá.</p>
      <div className="mt-3">
        <Conversa msgs={msgs} eu="empresa" enviar={(t) => run(() => A.mensagemObra(d.id, "empresa", t))} vazio="Ainda sem mensagens. Escreva ao cliente: ele vê no portal."
          rapidas={["Bom dia! A equipa já está na obra.", "Já pode ver as fotografias de hoje no portal.", "Vou confirmar e respondo ainda hoje."]} />
      </div>
    </section>
  );
}

/** 21/10: voltar ao topo da página da obra, sem rolar (aparece depois de descer). */
function ParaCima() {
  const [ver, setVer] = useState(false);
  const ancora = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    // a página rola dentro do <main> do protótipo (ou da janela, no telemóvel)
    let el: HTMLElement | null = ancora.current?.parentElement ?? null;
    while (el && !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) el = el.parentElement;
    const alvo: HTMLElement | Window = el ?? window;
    const f = () => setVer((el ? el.scrollTop : window.scrollY) > 700);
    alvo.addEventListener("scroll", f, { passive: true }); f();
    return () => alvo.removeEventListener("scroll", f);
  }, []);
  const subir = () => {
    let el: HTMLElement | null = ancora.current?.parentElement ?? null;
    while (el && !/(auto|scroll)/.test(getComputedStyle(el).overflowY)) el = el.parentElement;
    (el ?? window).scrollTo({ top: 0, behavior: "smooth" });
  };
  return (
    <>
      <span ref={ancora} aria-hidden="true" />
      {ver && (
        <button type="button" onClick={subir} aria-label="Voltar ao topo da obra"
          className="fixed bottom-24 right-5 z-30 grid h-12 w-12 place-items-center rounded-full bg-foreground text-background shadow-xl transition-transform animate-in fade-in-0 zoom-in-90 hover:scale-105 md:bottom-8 md:right-8">
          <ArrowUp className="h-5 w-5" />
        </button>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ os materiais por fase */
const TOM_MAT: Record<EstadoMat, string> = {
  reservado: "bg-success/15", recebido: "bg-success/15", "a chegar": "bg-primary/10 text-primary", encomendado: "bg-primary/10 text-primary",
  "por encomendar": "bg-warning/15", "em falta": "bg-destructive/10 text-destructive", "na obra": "bg-success/15", "na carrinha": "bg-success/15",
};
/** "Eliminada…" → "eliminada…": só a primeira letra (os números das encomendas ficam como são). */
const minuscula = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
function MateriaisObra({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const { A, go } = ctx;
  const db = useInventario();
  const inv = d.obra.ec?.ref ? resumoEcNegocio(db, d.obra.ec.ref) : null;
  const G = materiaisPorFase(d, inv);
  return (
    <section id="obra-mat" aria-labelledby="obra-mat-t" className="mt-10 scroll-mt-16">
      <h2 id="obra-mat-t" className={H2}>Materiais</h2>
      <p className="mt-1 text-[15px]">
        {!d.obra.ec ? (d.fin.pago ? "A encomenda de cliente não chegou ao Inventário: emita-a de novo no negócio." : "A encomenda de cliente emite-se quando o pagamento for validado.")
          : d.obra.ec.ref ? (inv ? `Encomenda de cliente ${inv.id} no Inventário: ${minuscula(textoResumoEc(inv))}` : `Encomenda de cliente ${d.obra.ec.n} emitida.`)
          : "Obra do exemplo: os materiais já estão na obra."}
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
      <ProximoRececaoNegocio d={d} A={A} go={go} />
      <div className="mt-2 flex flex-wrap gap-x-5">
        {d.obra.ec?.ref && (
          <button type="button" onClick={go(() => A.abrirInv(d.id))} className="inline-flex min-h-11 items-center gap-1 text-[15px] font-medium text-primary underline-offset-4 hover:underline">
            Abrir a encomenda no Inventário<ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        <button type="button" onClick={go(() => A.abrir(d.id))} className="inline-flex min-h-11 items-center gap-1 text-[15px] font-medium text-primary underline-offset-4 hover:underline">
          Ver o negócio, do contrato à obra<ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
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

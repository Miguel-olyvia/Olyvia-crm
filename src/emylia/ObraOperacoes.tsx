// As Operações no V1 (15/10/2026, refeitas): a lista de obras e a página da obra, com muito mais detalhe e tudo guiado.
// · Lista: por estado (por arrancar, em curso, concluídas), com a fase, o progresso, a equipa, o próximo marco e os alertas.
// · Página da obra: o que fazer agora (um primário), o plano por dia (com os ajustes das Operações antes de arrancar e o estado
//   de cada tarefa ao vivo), o acompanhamento (21/10: o gestor vê tudo, dia a dia, para trás e para a frente; o técnico faz
//   tudo pelo Hoje dele, HojeTecnico.tsx), por validar (o supervisor valida ou pede correção), os ajustes ao plano com a obra
//   em curso (com aviso ao cliente), a equipa, os equipamentos, os materiais por fase, o diário, a segurança e os custos.
// O ciclo da tarefa é o da app das obras (operacao-app), muito mais simples: um toque de cada vez.
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, CalendarClock, ChevronDown, ChevronRight, MessageCircle, Camera, Check, CheckCircle2, Circle, ClipboardCheck, Clock, FileWarning, HardHat,
  MapPin, Minus, NotebookPen, Phone, Plus, RotateCcw, ShieldCheck, Smartphone, Store, Truck, Wrench, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PAPEIS, TECS, aberto, comRelogioReal, conflitos, diaDeFerias, diaReal, eur, nfmt, type Estado, type Negocio, type Papel, type Tarefa } from "./motor";
import { COR_FASE, dataCurta, iniciosRapidos, isoDia } from "./planoObra";
import { FASES_OBRA } from "./fasesObra";
import { entregaTarde, faltaParaArrancar, inicioDoPlano, rotuloDia, tecnicosPara } from "./preparacaoObra";
import { diasDasHoras, diferencas, fimDe, inicioMinimo, mexida } from "./ajustesPlano";
import { HORAS_DIA } from "./ganttOrcamento";
import {
  RESPONSAVEL_OBRA, ROTULO_EXEC, custoHoraDe, equipaDaObra, equipamentosDaObra, estadoDe, fotoExemplo,
  iniciais, materiaisPorFase, nomeCurtoTarefa, porValidar, progresso, quandoEquip, seguranca, tarefasDoDia, type EntradaDiario, type EstadoExec, type EstadoMat,
} from "./obraOps";
import { custoObra } from "./custoObra";
import type { Ctx } from "./pecas";
import { AutoNoNegocio } from "./AutoRececao";
import { pontosEncerrar, type PontoEncerrar } from "./encerrarObra";
import { ViaturasObra } from "./frota/ViaturasObra";
import { ProximoRececaoNegocio } from "./RececaoNegocio";
import { useInventario } from "./inventario/loja";
import { resumoEcNegocio, textoResumoEc } from "./inventario/ponteNegocios";
import { DiaDaObra, FitaDias, HistoricoTarefa, Miniaturas, nomeTec } from "./AcompanhamentoObra";
import { Conversa } from "./ConversaObra";
import { orgDoModoReal } from "./acessosPortal";
import { useConversaReal } from "./real/conversaReal";
import { pedirFrota } from "./frota/pontes";
import { BarraTarefa, ExtrasTarefa, TarefasDoPlano } from "./PlanoInterativo";
import { MOTIVOS_AJUSTE, TEMPOS_CORRECAO, duracaoMinima, enviosDe, inicioMinimoVivo, juntarAjustes, podeAjustar, preverAjuste, preverCorrecao, registouNoDia, textoAvisoCliente } from "./trabalhoObra";
import { ImprevistosNaObra, RegistarImprevisto } from "./ImprevistosObra";
import { imprevistosDe } from "./imprevistos";
import { verificarPlano, type PontoPlano } from "./verificacaoPlano";
import { useParamUrl } from "./usarParamUrl";
import { hfmt } from "./horasFmt";

export { hfmt };

const ESTADO_PLANO: Record<string, string> = {
  "por aprovar": "plano por aprovar", aprovado: "pronta a arrancar", "em curso": "em curso", "concluída": "concluída",
};
const CARTAO = "rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]";
const H2 = "text-xl font-semibold tracking-tight"; // 27/10: um degrau acima, para o título se destacar da secção
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
const PONTO_EXEC: Record<EstadoExec, string> = {
  "por fazer": "bg-muted-foreground/30", "em curso": "bg-primary", feita: "bg-warning", validada: "bg-success", corrigir: "bg-destructive",
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
      {!obras.length && <p className={cn(NOTA, "mt-8")}>Ainda não há obras. Aparecem quando o cliente assina o contrato.</p>}
      {grupos.filter(([, L]) => L.length).map(([titulo, L]) => {
        // 27/10: as concluídas num grupo fechado, para a lista ficar no que ainda está a andar
        const fechado = titulo === "Concluídas";
        const lista = (
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
              // 21/10 (revisto): a próxima ação em destaque quando é do Filipe; senão, à espera de quê (sem repetir o estado)
              const Fa = F.filter((f) => !/plano/.test(f));
              const [marco, acao]: [string, boolean] = p.estado === "por aprovar" ? (o.fin.pago ? ["Aprovar o plano", true] : ["À espera do pagamento do sinal", false])
                : p.estado === "aprovado" ? (Fa.length ? [`Para arrancar falta ${Fa.join(", ")}`, false] : [`Arrancar a obra · ${rotuloDia(p, 0)}`, true])
                : p.estado === "em curso" ? [pv ? `Validar ${pv === 1 ? "1 tarefa" : `${pv} tarefas`}` : `Dia ${p.dia + 1} de ${fim} · acaba a ${rotuloDia(p, fim - 1)}`, !!pv]
                : [o.obra.auto?.estado === "assinado" ? "Recebida pelo cliente" : o.obra.auto ? "Auto de receção por assinar" : `Acabou a ${rotuloDia(p, fim - 1)}`, false];
              const alertas: [ReactNode, string][] = [
                ...(nc ? [[<AlertTriangle key="c" className="h-4 w-4 text-warning" aria-hidden="true" />, `${nc} conflito de férias`] as [ReactNode, string]] : []),
                ...(faltaMat && p.estado !== "concluída" ? [[<Truck key="m" className="h-4 w-4 text-warning" aria-hidden="true" />, prev ? `material previsto a ${prev.slice(8, 10)}/${prev.slice(5, 7)}` : "material por chegar"] as [ReactNode, string]] : []),
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
                        {p.estado === "concluída" ? <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />Concluída</span>
                          : fase ? <><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: COR_FASE[fase] }} aria-hidden="true" />{p.estado === "em curso" ? "Fase " : "Começa pela fase "}{fase} · {FASES_OBRA[fase - 1].curto}</> : ESTADO_PLANO[p.estado]}
                        <span className={cn("block text-sm", acao ? "font-medium text-primary" : "text-muted-foreground")}>{marco}{acao && <ArrowRight className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" />}</span>
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
        );
        return fechado ? (
          <details key={titulo} className="group/concl mt-8">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open/concl:rotate-90" aria-hidden="true" />{titulo} <span className="font-normal text-muted-foreground">· {L.length}</span>
            </summary>
            {lista}
          </details>
        ) : (
          <section key={titulo} aria-label={titulo} className="mt-8">
            <h2 className="text-lg font-semibold tracking-tight">{titulo} <span className="font-normal text-muted-foreground">· {L.length}</span></h2>
            {lista}
          </section>
        );
      })}
    </div>
  );
}

/* ================================================================== a página da obra */
type Seccao = "plano" | "hoje" | "validar" | "chat" | "equipa" | "equip" | "mat" | "diario" | "seg" | "custos";

/** 21/10 (revisto): as partes da obra, uma de cada vez (antes, dez secções empilhadas numa página só). */
// 27/10 (Rúben): a conversa com o cliente saiu dos separadores: fica sempre à vista, entre o "Agora" e os separadores
type Aba = "dia" | "plano" | "meios" | "registos";
const ABA_DE: Record<Seccao, Aba | null> = {
  plano: "plano", hoje: "dia", validar: null, chat: null, equipa: "meios", equip: "meios", mat: "meios", diario: "registos", seg: "registos", custos: "registos",
};

export function PaginaObra({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const { S, A, go } = ctx;
  const p = d.obra.plano!, C = conflitos(p), pode = S.role === "operacoes", direcao = S.role === "direcao";
  // 19/10: os materiais lidos ao vivo do Inventário (o arranque espera por eles)
  const db = useInventario();
  const r = d.obra.ec?.ref ? resumoEcNegocio(db, d.obra.ec.ref) : null;
  const fim = fimDe(p.tasks), ultimo = fim - 1;
  const PV = porValidar(p);
  const PE = p.estado === "em curso" ? pontosEncerrar(d, S, db) : [], podeEncerrar = PE.every((x) => x.ok);
  // a lista para encerrar só se abre na reta final (tudo feito, ou o último dia): antes disso é ruído
  const retaFinal = p.estado === "em curso" && (p.dia >= ultimo || p.tasks.every((t) => estadoDe(t) === "feita" || estadoDe(t) === "validada"));
  const F = faltaParaArrancar(d, db).filter((f) => !/plano/.test(f));
  const tarde = entregaTarde(d, db);
  const muda = pode && (p.estado === "por aprovar" || p.estado === "aprovado");
  // 26/10: a tarefa aberta no plano vai para o endereço (?tarefa=3): o "voltar" do browser fecha-a
  const [tarefaUrl, setTarefaUrl] = useParamUrl<string>("tarefa", "");
  const aberta = /^\d+$/.test(tarefaUrl) && Number(tarefaUrl) < p.tasks.length ? Number(tarefaUrl) : null;
  const setAberta = useCallback((i: number | null) => setTarefaUrl(i == null ? "" : String(i)), [setTarefaUrl]);
  // 21/10: o dia que o gestor está a ver (para trás ou para a frente); acompanha o "hoje" do plano
  const [sel, setSel] = useState(p.dia);
  useEffect(() => { setSel(p.dia); }, [p.dia]);
  const abas: [Aba, string][] = p.estado === "em curso"
    ? [["dia", "Dia a dia"], ["plano", "Plano"], ["meios", "Equipa e meios"], ["registos", "Registos"]]
    : [["plano", "Plano"], ["meios", "Equipa e meios"], ["registos", "Registos"]];
  // 26/10: o separador vai para o endereço (?sec=…): o "voltar" do browser volta ao anterior, recarregar fica no mesmo
  const [aba, setAba] = useParamUrl<Aba>("sec", abas[0][0], abas.map((x) => x[0]));
  // quando a obra muda de estado (arranca, acaba), volta ao 1.º separador; sem juntar uma entrada ao histórico, e não ao abrir
  const estadoAntes = useRef(p.estado);
  useEffect(() => { if (estadoAntes.current !== p.estado) { estadoAntes.current = p.estado; setAba(abas[0][0], { substituir: true }); } }, [p.estado]); // eslint-disable-line react-hooks/exhaustive-deps
  const irPara = (s: Seccao) => {
    const a = ABA_DE[s];
    if (a) setAba(a);
    window.setTimeout(() => document.getElementById(a || s === "chat" ? `obra-${s}` : "obra-agora")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  };
  const verDia = (k: number) => { setSel(k); irPara("hoje"); };

  let frase = "", botao: ReactNode = null;
  if (p.estado === "por aprovar") {
    // o plano aprova-se depois do pagamento (A.aprovarPlano recusa): diz-se à espera de quê, em vez de um botão que falha
    frase = !d.fin.pago ? "À espera do pagamento do sinal (Financeiro). Entretanto, reveja o plano: datas, técnicos e materiais."
      : C.length ? "Há um técnico de férias numa tarefa. Troque-o ou adie a tarefa antes de aprovar." : "O plano está pronto para aprovar. Confirme as datas e os técnicos; pode ajustar qualquer tarefa.";
    botao = <Button size="lg" disabled={!d.fin.pago || !!C.length} onClick={go(() => A.aprovarPlano(d.id))}>Aprovar o plano</Button>;
  } else if (p.estado === "aprovado") {
    frase = F.length ? `Falta ${F.join(", ")}.` : "Tudo pronto.";
    botao = <Button size="lg" disabled={!!F.length} onClick={go(() => A.arrancar(d.id))}>Arrancar a obra</Button>;
  } else if (p.estado === "em curso") {
    frase = `Dia ${p.dia + 1} de ${fim} · ${rotuloDia(p, p.dia)}`;
    // a validação faz-se no próprio cartão (Agora); o encerrar só aparece na reta final e só fica ativo com tudo completo
    botao = !PV.length && retaFinal ? <Button size="lg" disabled={!podeEncerrar} onClick={go(() => A.fimObra(d.id))}><CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" />Encerrar a obra</Button> : null;
  // 27/10: concluída com auto, o cartão do auto (a seguir) já diz tudo: o "Agora" não repete
  } else frase = d.obra.auto ? "" : "Obra concluída.";

  const morada = d.f.morada || d.local;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-24 pt-6 sm:px-8 sm:pt-10 xl:max-w-7xl">
      <button type="button" onClick={go(() => A.nav("operacoes"))} className="inline-flex min-h-11 items-center gap-2 text-[15px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Operações
      </button>

      {/* 21/10 (revisto): 1.º quem e onde, 2.º como vai, 3.º o que espera por si (resolve-se ali), 4.º o resto, uma parte de cada vez */}
      <header className="mt-2">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-muted-foreground">Obra #{d.id} <ChipEstadoObra estado={p.estado} /></p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">{d.nome}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[15px] text-muted-foreground">
          <span>{d.servico}</span>
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(morada)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1.5 text-primary underline-offset-4 hover:underline"><MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />{morada}</a>
          <a href={`tel:${d.tel.replace(/\s/g, "")}`} className="inline-flex min-h-9 items-center gap-1.5 text-primary underline-offset-4 hover:underline"><Phone className="h-4 w-4" aria-hidden="true" />{d.tel}</a>
        </p>
      </header>

      {/* 23/10: no ecrã largo, duas colunas: à esquerda o que fazer e as partes da obra; à direita, fixo, como vai (estado, tarefas, horas, custo, equipa) */}
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_23rem] xl:gap-8">
      <div className="xl:col-start-2 xl:row-start-1">
       <div className="xl:sticky xl:top-6 xl:space-y-4">
      {/* ------------------------------------------------ 1. como vai */}
      <section aria-label="Estado da obra" className={cn(CARTAO, "mt-6 p-5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200")}>
        <EstadoObra d={d} titulo={p.estado === "em curso" ? frase : null} irPara={irPara} />
      </section>
      <PainelObra ctx={ctx} d={d} irPara={irPara} verDia={verDia} />
       </div>
      </div>
      <div className="min-w-0 xl:col-start-1 xl:row-start-1">

      {/* ------------------------------------------------ 2. agora: o que espera por si, com um primário */}
      {!(p.estado === "concluída" && d.obra.auto) && <section id="obra-agora" aria-label="O que fazer" className={cn(CARTAO, "mt-4 scroll-mt-16 p-5")}>
        <h2 className={H2}>Agora</h2>
        {p.estado === "em curso" ? <Agora ctx={ctx} d={d} irPara={irPara} verDia={verDia} /> : frase && <p className="mt-2 text-lg">{frase}</p>}
        {tarde && (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-[15px]"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <span>Os materiais ({tarde.pos.join(", ")}) chegam a {dataCurta(tarde.entrega)} e a obra começa a {dataCurta(tarde.inicio)}. Sem os materiais, a equipa fica parada.</span></p>
            {pode ? <Button variant="outline" className="min-h-11 shrink-0" onClick={go(() => A.inicioPlano(d.id, isoDia(tarde.depois)))}>Começar a {dataCurta(tarde.depois)}</Button> : <Mudar ctx={ctx} papel="operacoes" />}
          </div>
        )}
        {p.estado === "aprovado" && (
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[15px]" aria-label="Condições para arrancar">
            {([["Sinal pago", d.fin.pago], ["Encomenda emitida", !!d.obra.ec], ["Materiais no armazém", !!r?.pronta || (!!d.obra.ec && !d.obra.ec.ref)], ["Plano aprovado", true]] as [string, boolean][]).map(([t, ok]) => (
              <li key={t} className={cn("inline-flex items-center gap-1.5", !ok && "text-muted-foreground")}>
                {ok ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <Circle className="h-4 w-4" aria-hidden="true" />}{t}<span className="sr-only">{ok ? " (feito)" : " (por fazer)"}</span>
              </li>
            ))}
          </ul>
        )}
        {/* 23/10: a verificação do plano (verificacaoPlano.ts), antes de aprovar */}
        {p.estado === "por aprovar" && <VerificacaoPlano L={verificarPlano(d, S, faltaParaArrancar(d, db))} irPara={irPara} comecar={pode ? (iso) => go(() => A.inicioPlano(d.id, iso))() : undefined} compras={go(() => A.abrirComprasObra(d.id))} />}
        {C.map((c) => {
          const ti = p.tasks.indexOf(c.t);
          const alt = TECS.find((x) => x.sk === c.t.sk && x.id !== c.tec.id && diaDeFerias(x, p, c.t.dia, c.t.dur) == null);
          return (
            <div key={ti} className="mt-4 grid gap-3 sm:grid-cols-2">
              {alt && (
                <button type="button" disabled={!pode} onClick={go(() => A.trocar(d.id, ti))} className="min-h-11 rounded-xl border border-border p-4 text-left transition-colors hover:border-foreground disabled:opacity-60">
                  <span className="block text-[15px] font-medium">Trocar por {alt.n}</span>
                  <span className={NOTA}>{alt.sk}, livre nesses dias. Não atrasa.</span>
                </button>
              )}
              <button type="button" disabled={!pode} onClick={go(() => A.adiar(d.id, ti))} className="min-h-11 rounded-xl border border-border p-4 text-left transition-colors hover:border-foreground disabled:opacity-60">
                <span className="block text-[15px] font-medium" title={c.t.nome}>{`Adiar ${nomeCurtoTarefa(c.t.nome)}`}</span>
                <span className={NOTA}>Quando voltar de férias. Acaba mais tarde.</span>
              </button>
            </div>
          );
        })}
        {PE.length > 0 && <ParaEncerrar L={PE} irPara={irPara} recolhida={!retaFinal} fecho={go(() => { A.abrir(d.id); A.irObra(); })} />}
        {p.estado !== "concluída" && (botao || !pode) && <div className="mt-5 flex flex-wrap items-center gap-3">{pode ? botao : <Mudar ctx={ctx} papel="operacoes" />}</div>}
      </section>}
      {/* 15/10: com a obra concluída, o auto de receção (por assinar / assinado) e o relatório da obra */}
      {p.estado === "concluída" && d.obra.auto && <div className="mt-4"><AutoNoNegocio S={ctx.S} d={d} /></div>}

      {/* ------------------------------------------------ 3. a conversa com o cliente, sempre à vista (27/10) */}
      <ConversaNaObra ctx={ctx} d={d} />

      {/* ------------------------------------------------ 4. o resto, uma parte de cada vez */}
      <div role="tablist" aria-label="Partes da obra" className="sticky top-0 z-10 -mx-4 mt-8 flex gap-1 overflow-x-auto border-b border-border bg-background/95 px-4 backdrop-blur [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        {abas.map(([k, t]) => (
          <button key={k} type="button" role="tab" id={`aba-${k}`} aria-selected={aba === k} aria-controls="obra-painel" onClick={() => setAba(k)}
            className={cn("relative min-h-12 shrink-0 whitespace-nowrap px-4 text-[15px] font-medium transition-colors", aba === k ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
            {t}
            {aba === k && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary" aria-hidden="true" />}
          </button>
        ))}
      </div>
      <div id="obra-painel" role="tabpanel" aria-labelledby={`aba-${aba}`} key={aba} className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
        {aba === "dia" && p.estado === "em curso" && <Acompanhamento ctx={ctx} d={d} sel={sel} setSel={setSel} ajustar={(ti) => { setAberta(ti); irPara("plano"); }} />}
        {aba === "plano" && <>
          <PlanoGantt ctx={ctx} d={d} aberta={aberta} setAberta={setAberta} muda={muda} sel={p.estado === "em curso" ? sel : null} setSel={p.estado === "em curso" ? verDia : undefined} />
          <TarefasDoPlano ctx={ctx} d={d} />
        </>}
        {aba === "meios" && <>
          <EquipaObra ctx={ctx} d={d} direcao={direcao} verDia={verDia} />
          <div className="mt-8"><ViaturasObra obra={d.id} ec={d.obra.ec?.ref} estado={d.obra.plano?.estado} /></div>
          <MateriaisObra ctx={ctx} d={d} />
          <EquipamentosObra d={d} />
        </>}
        {aba === "registos" && <>
          <DiarioObra ctx={ctx} d={d} pode={pode || direcao} />
          <SegurancaObra ctx={ctx} d={d} pode={pode} />
          {(direcao || pode) && <CustosObra d={d} S={S} />}
        </>}
      </div>
      </div>
      </div>
    </div>
  );
}

/** 26/10: o trabalho de uma tarefa partida por ofício ("MO Modelo … - Cozinha · canalização" → "MO Modelo … - Cozinha"); null se não for. */
const trabalhoDe = (nome: string): string | null => (nome.includes(" · ") ? nome.slice(0, nome.lastIndexOf(" · ")) : null);
/** O passo de uma parte ("… · canalização e gás" → "Canalização e gás"). */
const passoDe = (nome: string): string => { const x = nome.slice(nome.lastIndexOf(" · ") + 3); return x.charAt(0).toUpperCase() + x.slice(1); };
/** O primeiro nome do técnico, sem o que está entre parênteses ("Servente (teste)" → "Servente"). */
const primeiroNome = (n: string): string => n.replace(/\s*\([^)]*\)/g, "").trim().split(" ")[0];
// o nome curto de uma tarefa está em obraOps.ts (27/10: o plano do orçamento também o usa)
export { nomeCurtoTarefa };
/** 23/10: o painel lateral da obra (ecrã largo): as tarefas por estado, as horas, a mão de obra e a equipa, com animação. */
function PainelObra({ ctx, d, irPara, verDia }: { ctx: Ctx; d: Negocio; irPara: (s: Seccao) => void; verDia: (k: number) => void }) {
  const { S } = ctx, p = d.obra.plano!;
  if (!p.tasks.length) return null;
  const emCurso = p.estado === "em curso", ve = S.role === "direcao" || S.role === "operacoes";
  const ORDEM: EstadoExec[] = ["validada", "feita", "corrigir", "em curso", "por fazer"];
  const COR: Record<EstadoExec, string> = { validada: "bg-success", feita: "bg-primary", corrigir: "bg-destructive", "em curso": "bg-primary/50", "por fazer": "bg-muted-foreground/25" };
  const n = (e: EstadoExec) => p.tasks.filter((t) => estadoDe(t) === e).length;
  const K = ve ? custoObra(d, S) : null, eq = equipaDaObra(p);
  const proximas = p.tasks.map((t, ti) => ({ t, ti })).filter(({ t }) => estadoDe(t) !== "validada" && t.corrige == null).sort((a, b) => a.t.dia - b.t.dia).slice(0, 5);
  const card = (t: string, I: typeof Check, corpo: ReactNode, acao?: ReactNode) => (
    <section aria-label={t} className={cn(CARTAO, "hidden p-5 xl:block motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200")}>
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight"><I className="h-4 w-4 text-primary" aria-hidden="true" />{t}{acao && <span className="ml-auto text-sm font-medium">{acao}</span>}</h2>
      <div className="mt-3">{corpo}</div>
    </section>
  );
  const ver = (s: Seccao, t = "ver") => <button type="button" onClick={() => irPara(s)} className="text-primary underline-offset-4 hover:underline">{t}</button>;
  return <>
    {card("Tarefas", ClipboardCheck, <>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        {ORDEM.map((e) => n(e) ? <span key={e} className={cn("h-full motion-safe:transition-[width] duration-500", COR[e])} style={{ width: `${(n(e) / p.tasks.length) * 100}%` }} /> : null)}
      </div>
      {/* 26/10: as próximas tarefas (as que faltam, pela data), e não a lista inteira: numa obra grande eram 56 linhas repetidas do plano */}
      <p className="mt-3 text-sm font-medium text-muted-foreground">{proximas.length ? "A seguir" : "Tudo feito"}</p>
      <ul className="mt-1 space-y-0.5">
        {proximas.map(({ t, ti }) => {
          const e = estadoDe(t);
          return (
            <li key={ti}>
              <button type="button" onClick={() => (emCurso ? verDia(t.dia) : irPara("plano"))} className="group flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[15px] transition-colors hover:bg-muted" title={t.nome}>
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", COR[e])} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{nomeCurtoTarefa(t.nome)}</span>
                <span className="shrink-0 text-sm text-muted-foreground">{rotuloDia(p, t.dia)}</span>
                <span className="sr-only">, {t.tec ? nomeTec(t.tec) : "por atribuir"}, {ROTULO_EXEC[e]}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {p.tasks.length > proximas.length && <button type="button" onClick={() => irPara("plano")} className="mt-1 min-h-9 px-2 text-sm font-medium text-primary underline-offset-4 hover:underline">Ver as {p.tasks.length} tarefas no plano</button>}
      <p className="mt-2 flex flex-wrap gap-x-3 text-sm text-muted-foreground">{ORDEM.filter((e) => n(e)).map((e) => <span key={e} className="inline-flex items-center gap-1"><span className={cn("h-2 w-2 rounded-full", COR[e])} aria-hidden="true" />{n(e)} {ROTULO_EXEC[e]}</span>)}</p>
    </>)}
    {K && (emCurso || K.prev > 0) && card("Mão de obra", Wrench, <>
      <dl className="grid grid-cols-2 gap-2 text-[15px]">
        <div className="rounded-xl bg-muted/50 p-3"><dt className="text-sm text-muted-foreground">Previsto</dt><dd className="font-semibold tabular-nums">{eur(K.prev)} €</dd></div>
        <div className="rounded-xl bg-muted/50 p-3"><dt className="text-sm text-muted-foreground">Real</dt><dd className={cn("font-semibold tabular-nums", K.registadas && K.desvio > 0.5 ? "text-warning" : "")}>{K.registadas ? `${eur(K.real)} €` : "—"}</dd></div>
      </dl>
      {K.registadas > 0 && <><BarraObra v={K.prev ? K.real / K.prev : 0} cor={K.desvio > 0.5 ? "bg-warning" : "bg-success"} /><p className="mt-1 text-sm text-muted-foreground">Nas tarefas com horas: {K.desvio > 0.5 ? `${eur(K.desvio)} € acima` : K.desvio < -0.5 ? `${eur(-K.desvio)} € abaixo` : "no previsto"}</p></>}
    </>, ver("custos", "detalhe"))}
    {eq.length > 0 && card("Equipa", HardHat, (
      <ul className="space-y-2">
        {eq.map((m) => (
          <li key={m.id} className="flex items-center gap-2.5 text-[15px]">
            <Avatar id={m.id} n={m.n} />
            <span className="min-w-0 flex-1"><span className="block truncate font-medium">{m.n}</span><span className="block text-sm text-muted-foreground">{m.sk} · {m.tarefas.length} {m.tarefas.length === 1 ? "tarefa" : "tarefas"} · {hfmt(m.horas)} h</span></span>
          </li>
        ))}
      </ul>
    ), ver("equipa"))}
  </>;
}
/** 23/10: os pontos a rever antes de aprovar o plano: os que faltam primeiro, cada um leva onde se resolve. */
function VerificacaoPlano({ L, irPara, comecar, compras }: { L: PontoPlano[]; irPara: (s: Seccao) => void; comecar?: (iso: string) => void; compras?: () => void }) {
  const mal = L.filter((x) => !x.ok), bem = L.filter((x) => x.ok);
  const [verTodos, setVerTodos] = useState(false);
  return (
    <div className="mt-5 rounded-xl border border-border p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[15px] font-semibold">Rever o plano</h3>
        <span className="text-sm tabular-nums text-muted-foreground">{bem.length} de {L.length} certos</span>
      </div>
      <span aria-hidden="true" className="mt-2 block h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-success motion-safe:transition-[width] duration-500" style={{ width: `${(bem.length / L.length) * 100}%` }} /></span>
      <ul aria-label="Rever o plano" className="mt-3 space-y-2">
        {[...mal, ...(verTodos || !mal.length ? bem : [])].map((x) => (
          <li key={x.id} className="flex items-start gap-2.5 text-[15px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
            {x.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />}
            <span className="min-w-0">{x.t}<span className="sr-only">{x.ok ? " (certo)" : " (por rever)"}</span>{!x.ok && x.depois && comecar ? <> · <button type="button" onClick={() => comecar(x.depois!)} className="font-medium text-primary underline-offset-4 hover:underline">Começar a {dataCurta(deIsoLocal(x.depois))}, depois dessas obras</button></>
              : !x.ok && x.ir && <> · <button type="button" onClick={() => (x.ir === "compras" ? (compras ? compras() : irPara("mat")) : irPara(x.ir!))} className="font-medium text-primary underline-offset-4 hover:underline">resolver</button></>}</span>
          </li>
        ))}
      </ul>
      {mal.length > 0 && bem.length > 0 && <button type="button" onClick={() => setVerTodos(!verTodos)} className="mt-2 min-h-9 text-sm font-medium text-primary underline-offset-4 hover:underline">{verTodos ? "Esconder os certos" : `Ver os ${bem.length} certos`}</button>}
    </div>
  );
}
const deIsoLocal = (s: string) => { const [a, m, x] = s.split("-").map(Number); return new Date(a, m - 1, x); };
/** Uma barra que cresce ao aparecer (0 a 1). */
function BarraObra({ v, cor }: { v: number; cor: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setOn(true)); return () => cancelAnimationFrame(id); }, []);
  return <span aria-hidden="true" className="mt-2 block h-2 overflow-hidden rounded-full bg-muted"><span className={cn("block h-full rounded-full motion-safe:transition-[width] duration-500 ease-out", cor)} style={{ width: `${Math.min(1, Math.max(0, on ? v : 0)) * 100}%` }} /></span>;
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
    <ul aria-label={rot} className={cn("grid gap-x-6 gap-y-2.5", !umaColuna && "sm:grid-cols-2 xl:grid-cols-1")}>
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
  const atraso: ReactNode = D.dias ? <span className="text-warning"> · {D.dias > 0 ? "+" : "−"}{dias(Math.abs(D.dias))} face ao orçamento</span> : " · como no orçamento";
  let cab: ReactNode, L: Facto[];
  if (p.estado === "em curso") {
    const corr = p.tasks.filter((t) => t.corrige != null && estadoDe(t) !== "validada");
    const hoje = p.tasks.filter((t) => t.dia <= p.dia && p.dia < t.dia + t.dur && estadoDe(t) !== "validada");
    const reg = hoje.filter((t) => registouNoDia(t, p.dia) || estadoDe(t) === "feita").length;
    // as horas registadas e as previstas até ao fim de hoje (os dias já passados de cada tarefa, com hoje)
    const hReg = p.tasks.reduce((a, t) => a + (t.exec?.horas ?? 0), 0);
    const hAte = Math.round(p.tasks.reduce((a, t) => a + (t.h / t.dur) * Math.max(0, Math.min(t.dur, p.dia + 1 - t.dia)), 0) * 10) / 10;
    cab = <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <p className="text-xl font-semibold tracking-tight">{titulo}</p>
        <p className="text-2xl font-semibold tabular-nums">{Math.round(prog * 100)}%</p>
      </div>
    </>;
    L = [
      { I: CalendarClock, t: <>Acaba a <b className="font-semibold">{rotuloDia(p, fim - 1)}</b>{atraso}</>, tom: D.dias > 0 ? "aviso" : undefined },
      { I: Clock, t: <><b className="font-semibold">{hfmt(hReg)} h</b> registadas · previstas até hoje {hfmt(hAte)} h</>, tom: hAte > 0 && hReg > hAte * 1.1 ? "aviso" : undefined },
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

/** 21/10: a lista para encerrar a obra: cada ponto verde ou por fazer, e os por fazer levam ao sítio onde se resolvem. */
function ParaEncerrar({ L, irPara, fecho, recolhida }: { L: PontoEncerrar[]; irPara: (s: Seccao) => void; fecho: () => void; recolhida?: boolean }) {
  const feitos = L.filter((x) => x.ok).length, tudo = feitos === L.length;
  const [aberta, setAberta] = useState(false);
  // fora da reta final (ou com tudo verde) fica numa linha; abre-se se for preciso
  const fechada = tudo || !!recolhida, ver = fechada && !aberta ? [] : L;
  return (
    <div className={cn("mt-5 rounded-xl border p-4", tudo ? "border-success/40 bg-success/[0.05]" : "border-border")} aria-label="Para encerrar a obra">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[15px] font-semibold">
          {tudo ? <CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" /> : <ClipboardCheck className="h-5 w-5 text-muted-foreground" aria-hidden="true" />}
          {tudo ? "Tudo completo: pode encerrar a obra" : "Para encerrar a obra"}
        </p>
        <span className="flex items-center gap-2 text-sm tabular-nums text-muted-foreground">
          {feitos} de {L.length}
          {fechada && <button type="button" onClick={() => setAberta(!aberta)} aria-expanded={aberta} className="min-h-9 rounded-md px-2 font-medium text-primary hover:underline">{aberta ? "Esconder" : "Ver a lista"}</button>}
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

/**
 * 21/10 (revisto): o que espera pelo responsável, num só sítio e resolvido ali: validar (as fotografias, Validar ou Pedir correção),
 * as mensagens do cliente, os registos em falta, os problemas reportados e as correções em curso. Sem nada à espera, as próximas tarefas.
 * Antes estava espalhado por "A seguir", pelos alertas do acompanhamento e pela secção "Por validar".
 */
function Agora({ ctx, d, irPara, verDia }: { ctx: Ctx; d: Negocio; irPara: (s: Seccao) => void; verDia: (k: number) => void }) {
  const p = d.obra.plano!, PV = porValidar(p);
  const [todas, setTodas] = useState(false);
  // 21/10: os imprevistos (o que espera pelo gestor ou pelo cliente) e registar um novo
  const [registar, setRegistar] = useState(false);
  const imp = imprevistosDe(d).filter((i) => i.estado !== "fechado" && i.estado !== "aprovado");
  const cli = (d.obra.chat ?? []).filter((m) => m.de === "cliente" && !m.lida);
  const corr = p.tasks.filter((t) => estadoDe(t) === "corrigir");
  const semReg: { t: Tarefa; k: number }[] = [];
  for (const t of p.tasks)
    for (let k = t.dia; k < Math.min(p.dia, t.dia + t.dur); k++)
      if (!registouNoDia(t, k) && estadoDe(t) !== "validada" && estadoDe(t) !== "feita") semReg.push({ t, k });
  // 27/10: sem os imprevistos (já têm o cartão deles, em cima)
  const ocorr = (d.obra.diario ?? []).filter((x) => x.k === "ocorrencia" && x.q.startsWith("hoje") && !x.t.startsWith("Imprevisto")).slice(-3);
  // 27/10: os dias sem registo juntam-se por tarefa (eram uma linha por dia)
  const semRegT = [...semReg.reduce((m, x) => m.set(x.t, [...(m.get(x.t) ?? []), x.k]), new Map<Tarefa, number[]>())];
  const prox = p.tasks.filter((t) => t.dia > p.dia && estadoDe(t) === "por fazer").sort((a, b) => a.dia - b.dia).slice(0, 3);
  const nada = !PV.length && !cli.length && !semReg.length && !ocorr.length && !corr.length && !imp.length;
  const primeiro = (n: string | null) => nomeTec(n).split(" ")[0];
  return (
    <div className="mt-3 space-y-3">
      <ImprevistosNaObra ctx={ctx} d={d} />
      {PV.slice(0, todas ? PV.length : 1).map((ti) => {
        const t = p.tasks[ti];
        return (
          <div key={ti} className="rounded-xl border border-warning/40 bg-warning/[0.05] p-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
            <div className="flex items-start gap-3">
              <Avatar id={t.tec} n={nomeTec(t.tec)} />
              <div className="min-w-0">
                {/* 27/10: o nome curto (o «MO Modelo …» inteiro ocupava duas linhas); o inteiro fica no title */}
                <p className="text-base font-semibold" title={t.nome}>Validar: {nomeCurtoTarefa(t.nome)}</p>
                <p className={NOTA}>{nomeTec(t.tec)} deu por feita{t.exec?.feita ? ` ${t.exec.feita}` : ""}</p>
              </div>
            </div>
            <Registo ctx={ctx} d={d} ti={ti} />
          </div>
        );
      })}
      {/* 27/10 (Rúben): os dois numa fila com espaço entre eles (colados, liam-se "Mais 1 por validarValidar várias…") */}
      {PV.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {!todas && (
            <button type="button" onClick={() => setTodas(true)} className="min-h-11 text-[15px] font-medium text-primary underline-offset-4 hover:underline">
              Mais {PV.length - 1} por validar
            </button>
          )}
          {/* 23/10: com várias à espera, validar de uma vez as que se viram (só as feitas; as correções seguem uma a uma) */}
          <ValidarVarias ctx={ctx} d={d} PV={PV} />
        </div>
      )}
      {cli.length > 0 && (
        <LinhaAgora I={MessageCircle} tom="aviso" titulo={`${d.nome.split(" ")[0]} escreveu${cli.length > 1 ? ` (${cli.length} mensagens)` : ""}`} texto={`«${cli[cli.length - 1].t}»`} acao="Responder" fazer={() => irPara("chat")} />
      )}
      {ocorr.map((x, k) => <LinhaAgora key={"o" + k} I={AlertTriangle} tom="mau" titulo={`${x.quem.split(" ")[0]} reportou um problema`} texto={x.t} acao="Ver o dia" fazer={() => verDia(p.dia)} />)}
      {semRegT.slice(0, 3).map(([t, ks]) => (
        <LinhaAgora key={`r${p.tasks.indexOf(t)}`} I={HardHat} tom="aviso" titulo={`${primeiro(t.tec)} não registou ${ks.length === 1 ? rotuloDia(p, ks[0]) : `${ks.length} dias`}`}
          texto={`${nomeCurtoTarefa(t.nome)}${ks.length > 1 ? ` · ${ks.map((k) => rotuloDia(p, k)).join(", ")}` : ""}`} acao="Ver o dia" fazer={() => verDia(ks[0])} />
      ))}
      {corr.map((t) => <LinhaAgora key={"c" + p.tasks.indexOf(t)} I={FileWarning} tom="mau" titulo={`${nomeCurtoTarefa(t.nome)}: correção pedida`} texto={`À espera de ${primeiro(t.tec)}${t.exec?.motivo ? ` · ${t.exec.motivo}` : ""}`} />)}
      {nada && <p className="flex items-center gap-2 text-[15px]"><CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />Nada à espera de si.</p>}
      {ctx.S.role === "operacoes" && (registar
        ? <RegistarImprevisto ctx={ctx} d={d} fechar={() => setRegistar(false)} />
        : <button type="button" onClick={() => setRegistar(true)} className="inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium text-primary underline-offset-4 hover:underline"><AlertTriangle className="h-4 w-4" aria-hidden="true" />Registar imprevisto</button>)}
      {/* 27/10: no ecrã largo o painel ao lado já mostra as próximas tarefas */}
      {!PV.length && prox.length > 0 && (
        <div className="xl:hidden">
          <p className="text-sm text-muted-foreground">A seguir no plano</p>
          <ul aria-label="Próximas tarefas" className="mt-1.5 divide-y divide-border rounded-xl border border-border">
            {prox.map((t) => (
              <li key={p.tasks.indexOf(t)} className="flex items-center gap-3 px-3 py-2 text-[15px]">
                <span className="w-24 shrink-0 text-sm font-medium tabular-nums text-muted-foreground">{rotuloDia(p, t.dia)}</span>
                <span className="min-w-0 flex-1 truncate font-medium" title={t.nome}>{nomeCurtoTarefa(t.nome)}</span>
                <span className="inline-flex shrink-0 items-center gap-2 text-sm text-muted-foreground"><Avatar id={t.tec} n={nomeTec(t.tec)} tam="h-6 w-6" /><span className="hidden sm:inline">{primeiro(t.tec)}</span></span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** 23/10: validar várias de uma vez: a lista das tarefas feitas, todas marcadas, e um botão. Só as Operações. */
function ValidarVarias({ ctx, d, PV }: { ctx: Ctx; d: Negocio; PV: number[] }) {
  const p = d.obra.plano!, pode = ctx.S.role === "operacoes";
  const feitas = PV.filter((ti) => estadoDe(p.tasks[ti]) === "feita");
  const [aberto, setAberto] = useState(false);
  const [marc, setMarc] = useState<number[]>(feitas);
  if (feitas.length < 2) return null;
  if (!pode) return <p className={NOTA}>{feitas.length} tarefas feitas à espera de validação das Operações.</p>;
  if (!aberto) return (
    <Button variant="outline" className="min-h-11 gap-2" onClick={() => { setMarc(feitas); setAberto(true); }}>
      <ClipboardCheck className="h-4 w-4" aria-hidden="true" />Validar várias de uma vez ({feitas.length})
    </Button>
  );
  const horas = (ti: number) => p.tasks[ti].exec?.horas ?? 0;
  return (
    <div role="group" aria-label="Validar várias" className="w-full rounded-xl border border-border p-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
      <p className="text-[15px] font-semibold">Validar várias de uma vez</p>
      <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
        {feitas.map((ti) => {
          const t = p.tasks[ti], on = marc.includes(ti), dv = horas(ti) - t.h;
          return (
            <li key={ti}>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-2 text-[15px]">
                <input type="checkbox" checked={on} onChange={() => setMarc(on ? marc.filter((x) => x !== ti) : [...marc, ti])} className="h-5 w-5 shrink-0 accent-[hsl(var(--primary))]" />
                <Avatar id={t.tec} n={nomeTec(t.tec)} tam="h-7 w-7" />
                <span className="min-w-0 flex-1"><span className="block truncate font-medium" title={t.nome}>{nomeCurtoTarefa(t.nome)}</span><span className="block text-sm text-muted-foreground">{nomeTec(t.tec).split(" ")[0]} · {hfmt(horas(ti))} h de {hfmt(t.h)} h{(t.exec?.fotos.length ?? 0) ? ` · ${t.exec!.fotos.length} ${t.exec!.fotos.length === 1 ? "fotografia" : "fotografias"}` : " · sem fotografias"}</span></span>
                {Math.abs(dv) >= 0.5 && <span className={cn("shrink-0 text-sm tabular-nums", dv > 0 ? "text-warning" : "text-success")}>{dv > 0 ? "+" : "−"}{nfmt(Math.round(Math.abs(dv) * 10) / 10)} h</span>}
              </label>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button className="min-h-11 gap-2" disabled={!marc.length} onClick={ctx.go(() => { ctx.A.validarVarias(d.id, marc); setAberto(false); })}>
          <Check className="h-4 w-4" aria-hidden="true" />{marc.length === 1 ? "Validar 1 tarefa" : `Validar ${marc.length} tarefas`}
        </Button>
        <Button variant="ghost" className="min-h-11" onClick={() => setAberto(false)}>Cancelar</Button>
      </div>
    </div>
  );
}

/** Uma coisa à espera no cartão "Agora": ícone, o quê, o detalhe e, quando dá, a ação. */
function LinhaAgora({ I, tom, titulo, texto, acao, fazer }: { I: typeof Check; tom: "aviso" | "mau"; titulo: string; texto: string; acao?: string; fazer?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-3 py-2.5 sm:flex-nowrap">
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", tom === "mau" ? "bg-destructive/10 text-destructive" : "bg-warning/15 text-warning")} aria-hidden="true"><I className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium">{titulo}</span>
        <span className="block truncate text-sm text-muted-foreground">{texto}</span>
      </span>
      {acao && fazer && <button type="button" className="min-h-10 shrink-0 px-2 text-[15px] font-medium text-primary underline-offset-4 hover:underline" onClick={fazer}>{acao}</button>}
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
  // 26/10 (caso real: 56 tarefas, 99 dias): a coluna do nome fica fixa à esquerda e a barra na mesma linha; em obras longas a
  // escala é a semana e a obra cabe toda na largura (em dias, uma coluna por dia e rola-se para o lado)
  const LW = largura < 480 ? 150 : largura < 760 ? 200 : 272;
  const [escala, setEscala] = useState<"dias" | "semanas">(nd > 30 ? "semanas" : "dias");
  const area = Math.max(160, largura - LW - 2);
  const colW = escala === "dias" ? Math.max(44, area / nd) : Math.max(4, area / nd), gradeW = colW * nd;
  const X = (k: number) => k * colW;
  // em semanas, a data só a cada tantas semanas quantas couberem (cerca de 64 px por rótulo), para não se sobreporem
  const passo = escala === "semanas" ? 5 * Math.max(1, Math.ceil(64 / (5 * colW))) : 1;
  // as partes do mesmo trabalho (um «MO Modelo» partido por ofício: "<trabalho> · <passos>") juntam-se num grupo que abre e fecha
  const [abertos, setAbertos] = useState<Set<string> | "todos">(() => (p.tasks.length > 20 ? new Set() : "todos"));
  const estaAberto = (k: string, membros: number[]) => abertos === "todos" || abertos.has(k) || (aberta != null && membros.includes(aberta));
  const alternar = (k: string) => setAbertos((v) => { const n = new Set(v === "todos" ? [] : v); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const hoje = p.estado === "em curso" ? p.dia : null;
  const D = diferencas(p);
  const custoMais = D.horas > 0 ? p.tasks.reduce((a, t, i) => a + Math.max(0, t.h - (p.base?.[i]?.h ?? t.h)) * custoHoraDe(t.tec), 0) : 0;
  const rapidos = iniciosRapidos(new Date());
  const inicio = inicioDoPlano(p);
  const grupos = novo ? [...new Set(p.tasks.map((t) => t.fase ?? 0))].sort() : [0];
  const painel = useRef<HTMLDivElement>(null);
  useEffect(() => { if (aberta != null) painel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [aberta]);

  const temGrupos = p.tasks.some((t, i) => { const k = trabalhoDe(t.nome); return !!k && p.tasks.some((x, j) => j !== i && trabalhoDe(x.nome) === k); });
  /** Uma tarefa numa linha: à esquerda (fixo) o técnico, o nome e os dias; à direita a barra, que se arrasta. */
  const linhaTarefa = (t: Tarefa, i: number, dentro: boolean) => {
    const tec = TECS.find((x) => x.id === t.tec), c = C.some((x) => x.t === t), ex = estadoDe(t), aqui = aberta === i;
    const cor_ = p.tasks.map((x, k) => ({ x, k })).filter(({ x }) => x.corrige === i);
    const cor = novo && t.fase ? COR_FASE[t.fase] : "hsl(var(--primary))";
    const nome = dentro ? passoDe(t.nome) : nomeCurtoTarefa(t.nome);
    const curta = t.dur === 1 && t.h < HORAS_DIA;
    return (
      <li key={i} data-fase={t.fase ?? 0} className={cn("flex h-11 items-center", aqui && "bg-primary/[0.04]")}>
        <button type="button" onClick={() => setAberta(aqui ? null : i)} aria-expanded={aqui} title={t.nome}
          className={cn("sticky left-0 z-[1] flex h-full shrink-0 items-center gap-2 border-r border-border bg-card pr-3 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary", dentro ? "pl-8" : "pl-3", aqui && "text-primary")}
          style={{ width: LW }}>
          <Avatar id={t.tec} n={tec?.n ?? "?"} tam="h-6 w-6" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium leading-5">{nome}</span>
            <span className={cn("block truncate text-xs text-muted-foreground", c && "text-warning")}>
              {tec ? primeiroNome(tec.n) : "sem técnico"}{c ? " de férias" : ""} · {curta ? `${hfmt(t.h)} h` : dias(t.dur)}
              {mexida(p, i) && " · ajustada"}{cor_.length > 0 && <span className="text-destructive"> · com correção</span>}{t.bloqueio && <span className="font-medium text-destructive"> · parada</span>}
            </span>
          </span>
          {(p.estado === "em curso" || p.estado === "concluída") && (() => {
            const e = p.estado === "concluída" && ex !== "validada" ? "validada" : ex;
            // 27/10: com a coluna estreita (telemóvel), só um ponto com a cor do estado
            return LW < 200
              ? <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", PONTO_EXEC[e])}><span className="sr-only">{ROTULO_EXEC[e]}</span></span>
              : <ChipExec e={e} />;
          })()}
          {t.nota && <NotebookPen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="com nota" />}
        </button>
        <div className="relative h-7" style={{ width: gradeW }}>
          {/* 21/10: a barra arrasta-se (início e fase) e a ponta puxa os dias (PlanoInterativo.tsx) */}
          <BarraTarefa p={p} t={t} ti={i} colW={colW} x={X(t.dia) + 1} largura={Math.max(4, (curta ? X(1) * Math.max(0.3, t.h / HORAS_DIA) : X(t.dur)) - 2)} cor={cor} ativa={muda} abrir={() => setAberta(aqui ? null : i)}
            mover={(dia, fase) => run(() => (fase ? A.moverTarefaPlano(d.id, i, { fase, dia }) : A.ajustarTarefa(d.id, i, { dia })))} durar={(dur) => run(() => A.ajustarTarefa(d.id, i, { dur }))}
            rotulo={`${t.nome}, ${rotuloDia(p, t.dia)}, ${curta ? hfmt(t.h) + " h" : dias(t.dur)}${muda ? ". Arraste para mudar o início ou a fase; a ponta muda os dias. Teclado: setas, Shift + setas, Alt + setas." : ""}`}
            className={cn(c && "ring-2 ring-warning", ex === "feita" && "ring-2 ring-warning/70", ex === "corrigir" && "ring-2 ring-destructive", aqui && "ring-2 ring-foreground/70 ring-offset-2 ring-offset-card")}
            style={{ opacity: ex === "validada" || p.estado === "concluída" ? 0.55 : 1 }}>
            {(ex === "validada" || p.estado === "concluída") && colW * t.dur > 20 && <Check className="absolute right-1.5 top-1 h-4 w-4 text-white" />}
          </BarraTarefa>
          {cor_.map(({ x, k }) => (
            <button key={k} type="button" onClick={() => setAberta(aberta === k ? null : k)} aria-label={`${x.nome}, ${rotuloDia(p, x.dia)}`}
              className={cn("absolute top-0 h-7 rounded-md bg-destructive/85 text-left text-[11px] font-medium leading-7 text-white outline-none ring-offset-card focus-visible:ring-2 focus-visible:ring-foreground", estadoDe(x) === "validada" && "opacity-55", aberta === k && "ring-2 ring-foreground/70 ring-offset-2")}
              style={{ left: X(x.dia) + 1, width: Math.max(8, X(x.dur) * (x.dur === 1 && x.h < HORAS_DIA ? Math.max(0.3, x.h / HORAS_DIA) : 1) - 2) }}>
              {colW * x.dur > 60 && <span className="block truncate px-1.5">correção</span>}
            </button>
          ))}
        </div>
      </li>
    );
  };

  return (
    <section id="obra-plano" aria-labelledby="obra-plano-t" className="mt-6 scroll-mt-16">
      <h2 id="obra-plano-t" className={H2}>Plano</h2>
      <p className="mt-1 text-[15px]">
        <b className="font-semibold tabular-nums">{dias(fim)} úteis</b> · acaba a {rotuloDia(p, fim - 1)}
        {D.dias !== 0 && <span className={cn("ml-1 font-medium", D.dias > 0 ? "text-warning" : "text-success")}>· {D.dias > 0 ? "+" : "−"}{dias(Math.abs(D.dias))} face ao orçamento</span>}
      </p>
      {D.horas > 0 && <p className="mt-1 flex items-start gap-2 text-sm text-warning"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />+{nfmt(Math.round(D.horas * 10) / 10)} h de equipa: cerca de +{eur(custoMais)} € de custo. O preço ao cliente não muda.</p>}
      {muda && (
        <p className={cn(NOTA, "mt-1")}>
          Arraste para mudar datas. Toque numa tarefa para a editar.{p.estado === "aprovado" && " Mudar o plano aprovado volta a pô-lo por aprovar."}
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
                  className={cn("min-h-11 rounded-full border px-4 text-[15px] transition-colors", on ? "border-primary bg-primary/10 font-medium text-primary" : "border-input bg-card hover:border-foreground/40")}>
                  {r.nome}<span className={cn("ml-1.5 text-sm font-normal", on ? "text-primary/80" : "text-muted-foreground")}>{dataCurta(r.data)}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <AjustesFeitos d={d} />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Escala do plano" className="inline-flex rounded-full border border-input bg-card p-0.5">
          {(["semanas", "dias"] as const).map((e) => (
            <button key={e} type="button" aria-pressed={escala === e} onClick={() => setEscala(e)}
              className={cn("min-h-9 rounded-full px-3.5 text-sm font-medium transition-colors", escala === e ? "border border-primary bg-primary/10 text-primary" : "border border-transparent text-muted-foreground hover:text-foreground")}>
              {e === "dias" ? "Dias" : "Semanas"}
            </button>
          ))}
        </div>
        {temGrupos && (
          <button type="button" onClick={() => setAbertos(abertos === "todos" ? new Set() : "todos")} className="min-h-9 rounded-full px-3 text-sm font-medium text-primary hover:bg-primary/[0.06]">
            {abertos === "todos" ? "Fechar os trabalhos" : "Abrir os trabalhos"}
          </button>
        )}
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">{p.tasks.filter((t) => t.corrige == null).length} tarefas</span>
      </div>
      <div ref={caixa} className={cn(CARTAO, "mt-2 overflow-x-auto")}>
        <div className="relative" style={{ width: LW + gradeW }}>
          {/* o cabeçalho: os dias (escala dias) ou o 1.º dia de cada semana de trabalho (escala semanas); hoje marcado */}
          <div className="flex h-11 border-b border-border bg-card">
            <div className="sticky left-0 z-[3] flex shrink-0 items-end border-r border-border bg-card px-3 pb-2 text-sm font-medium text-muted-foreground" style={{ width: LW }}>Tarefa</div>
            <div className="relative" style={{ width: gradeW }} aria-hidden="true">
              {Array.from({ length: nd }, (_, k) => {
                const r = rotuloDia(p, k), semana = escala === "semanas";
                if (semana && k % passo !== 0) return null;
                const [ds, ...resto] = r.replace(",", "").split(" ");
                return (
                  <div key={k} onClick={setSel ? () => setSel(k) : undefined} title={setSel ? `Ver ${r} no acompanhamento` : undefined}
                    className={cn("absolute bottom-0 top-0 pt-1.5", semana ? "border-l border-border/70 pl-1.5" : "text-center", hoje === k && "rounded-t-lg bg-primary/10",
                      setSel && "cursor-pointer rounded-t-lg hover:bg-muted", sel != null && sel === k && sel !== hoje && "rounded-t-lg ring-2 ring-inset ring-primary/50")}
                    style={{ left: X(k), width: semana ? X(passo) : colW }}>
                    <span className={cn("block text-[11px] leading-4", hoje === k ? "font-semibold text-primary" : "text-muted-foreground")}>{hoje === k ? "hoje" : semana ? "" : ds}</span>
                    <span className="block whitespace-nowrap text-sm font-medium tabular-nums leading-5">{semana ? resto.join(" ") : resto[0]}</span>
                  </div>
                );
              })}
            </div>
          </div>
          {/* as linhas de fundo: os dias (ou as semanas) e o dia de hoje */}
          <div className="pointer-events-none absolute bottom-0 top-11" style={{ left: LW, width: gradeW }} aria-hidden="true">
            {Array.from({ length: nd - 1 }, (_, k) => (escala === "dias" || (k + 1) % passo === 0) && <div key={k} className="absolute bottom-0 top-0 border-l border-border/50" style={{ left: X(k + 1) }} />)}
            {hoje != null && <div className="absolute bottom-0 top-0 bg-primary/[0.08]" style={{ left: X(hoje), width: Math.max(colW, 2) }} />}
          </div>

          <ul aria-label="Tarefas da obra" className="relative pb-2">
            {grupos.flatMap((g) => {
              // 21/10: as correções desenham-se na linha da tarefa que corrigem (uma linha por trabalho, menos ruído)
              const L = p.tasks.map((t, i) => ({ t, i })).filter(({ t }) => t.corrige == null && (!novo || (t.fase ?? 0) === g));
              const cab = novo && g ? [
                <li key={"f" + g} data-fase={g} className="flex h-9 items-end border-t border-border/60 first:border-t-0">
                  <span className="sticky left-0 z-[1] flex h-full items-end bg-card px-3 pb-1.5" style={{ width: LW }}>
                    <span className="inline-flex items-center gap-2 whitespace-nowrap text-sm font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COR_FASE[g] }} aria-hidden="true" />Fase {g} · {FASES_OBRA[g - 1].curto}</span>
                  </span>
                </li>,
              ] : [];
              const linhas: ReactNode[] = [];
              const feitos = new Set<number>();
              for (const { t, i } of L) {
                if (feitos.has(i)) continue;
                const k = trabalhoDe(t.nome);
                const membros = k ? L.filter(({ t: x }) => trabalhoDe(x.nome) === k) : [];
                if (k && membros.length > 1) {
                  membros.forEach(({ i: m }) => feitos.add(m));
                  const chave = `${g}|${k}`, idx = membros.map(({ i: m }) => m), ab = estaAberto(chave, idx);
                  const ini = Math.min(...membros.map(({ t: x }) => x.dia)), fimG = Math.max(...membros.map(({ t: x }) => x.dia + x.dur));
                  const horas = membros.reduce((a, { t: x }) => a + x.h, 0);
                  linhas.push(
                    <li key={"g" + chave} data-fase={g} className="flex h-11 items-center">
                      <button type="button" onClick={() => alternar(chave)} aria-expanded={ab}
                        className="sticky left-0 z-[1] flex h-full shrink-0 items-center gap-2 border-r border-border bg-card px-3 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary" style={{ width: LW }}>
                        <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", ab && "rotate-90")} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-medium leading-5" title={k}>{nomeCurtoTarefa(k)}</span>
                          <span className="block truncate text-xs text-muted-foreground">{membros.length} ofícios · {dias(fimG - ini)} · {hfmt(horas)} h</span>
                        </span>
                      </button>
                      <button type="button" tabIndex={-1} aria-hidden="true" onClick={() => alternar(chave)} className="relative h-full" style={{ width: gradeW }}>
                        <span className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted-foreground/15" style={{ left: X(ini) + 1, width: Math.max(4, X(fimG - ini) - 2) }} />
                        {membros.map(({ t: x, i: m }) => (
                          <span key={m} className="absolute top-1/2 h-3 -translate-y-1/2 rounded-sm" style={{ left: X(x.dia) + 1, width: Math.max(3, X(x.dur) - 2), background: x.fase ? COR_FASE[x.fase] : "hsl(var(--primary))", opacity: estadoDe(x) === "validada" ? 0.5 : 0.9 }} />
                        ))}
                      </button>
                    </li>,
                  );
                  if (ab) for (const { t: x, i: m } of membros) linhas.push(linhaTarefa(x, m, true));
                  continue;
                }
                linhas.push(linhaTarefa(t, i, false));
              }
              return [...cab, ...linhas];
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
    <section aria-label={`Ajustar ${t.nome}`} className={cn(CARTAO, "p-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200 sm:p-5")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold" title={t.nome}>{nomeCurtoTarefa(t.nome)}</p>
          <p className={NOTA}>{fase ? `Fase ${t.fase} · ${fase.curto} · ` : ""}{rotuloDia(p, t.dia)}{t.dur > 1 ? ` a ${rotuloDia(p, t.dia + t.dur - 1)}` : ""}</p>
        </div>
        <button type="button" onClick={fechar} aria-label="Fechar" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-muted"><X className="h-5 w-5" /></button>
      </div>
      <dl className="mt-3 divide-y divide-border">
        <Duracao dur={t.dur} h={t.h} mudarDias={(n) => run(() => A.ajustarTarefa(d.id, ti, { dur: n }))} mudarHoras={(n) => run(() => A.ajustarTarefa(d.id, ti, { h: n }))}
          nota={b && (b.dur !== t.dur || b.h !== t.h) && <span className="block text-sm text-muted-foreground">no orçamento: {dias(b.dur)} · {hfmt(b.h)} h</span>} />
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
    <section aria-label={t.nome} className={cn(CARTAO, "p-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200 sm:p-5")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold" title={t.nome}>{nomeCurtoTarefa(t.nome)}</p>
          <p className={NOTA}>{tec?.n ?? "sem técnico"} · {rotuloDia(p, t.dia)}{t.dur > 1 ? ` a ${rotuloDia(p, t.dia + t.dur - 1)}` : ""} · previstas {hfmt(t.h)} h</p>
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
  // 27/10 (Rúben): o painel era neutro e comprido. Agora: um título que diz o que se está a fazer, duas perguntas (quem corrige só
  // aparece quando há por onde escolher), as escolhas em roxo com um visto, e o efeito numa frase junto ao botão.
  const opcoes = tecnicosPara(t, p), quem = nomeTec(tec).split(" ")[0];
  const chip = (on: boolean) => cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-[15px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
    on ? "border-primary bg-primary font-medium text-primary-foreground" : "border-input bg-card hover:border-primary/60");
  const visto = (on: boolean) => on && <Check className="h-4 w-4" aria-hidden="true" />;
  const efeito = delta > 0
    ? `A obra passa a acabar a ${rotuloDia(p, prev.fimDepois - 1)} (mais ${dias(delta)}).`
    : "A data de fim da obra não muda.";
  const id = `corr-${d.id}-${ti}`;
  return (
    <section aria-labelledby={`${id}-t`} className="overflow-hidden rounded-2xl border-2 border-destructive/40 bg-card motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
      <header className="flex items-start gap-3 bg-destructive/[0.07] px-4 py-3">
        <FileWarning className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
        <div className="min-w-0">
          <h3 id={`${id}-t`} className="text-base font-semibold text-foreground">Pedir uma correção {tec ? `a ${quem}` : ""}</h3>
          <p className="text-[15px] text-muted-foreground">A tarefa só fica validada depois de corrigida e com fotografias novas.</p>
        </div>
      </header>

      <div className="space-y-6 p-4">
        <fieldset>
          <legend className="flex items-center gap-2 text-[15px] font-semibold"><span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-sm text-primary-foreground" aria-hidden="true">1</span>O que falta corrigir?</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {["Falta acabamento", "Juntas por limpar", "Peça desalinhada", "A fotografia não mostra o trabalho"].map((m) => (
              <button key={m} type="button" aria-pressed={motivo === m} onClick={() => setMotivo(m)} className={chip(motivo === m)}>{visto(motivo === m)}{m}</button>
            ))}
          </div>
          <label htmlFor={`${id}-m`} className="mt-3 block text-sm text-muted-foreground">Ou escreva por palavras suas</label>
          <input id={`${id}-m`} value={motivo} onChange={(e) => setMotivo(e.target.value)}
            className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
        </fieldset>

        <fieldset>
          <legend className="flex items-center gap-2 text-[15px] font-semibold"><span className="grid h-6 w-6 place-items-center rounded-full bg-primary text-sm text-primary-foreground" aria-hidden="true">2</span>Quanto tempo leva, mais ou menos?</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {TEMPOS_CORRECAO.map((x) => <button key={x.h} type="button" aria-pressed={horas === x.h} onClick={() => setHoras(x.h)} className={chip(horas === x.h)}>{visto(horas === x.h)}{x.rot}</button>)}
          </div>
        </fieldset>

        {opcoes.length > 1 ? (
          <fieldset>
            <legend className="text-[15px] font-semibold">Quem corrige</legend>
            <div className="mt-3 flex flex-wrap gap-2">
              {opcoes.map((x) => (
                <button key={x.id} type="button" aria-pressed={tec === x.id} onClick={() => setTec(x.id)}
                  className={cn("flex min-h-11 items-center gap-2 rounded-xl border px-3 py-1.5 text-left text-[15px] transition-colors", tec === x.id ? "border-primary bg-primary/10 font-medium" : "border-input hover:border-primary/60")}>
                  <Avatar id={x.id} n={x.n} tam="h-7 w-7" />{x.n}{x.id === t.tec && <span className="text-sm font-normal text-muted-foreground">(fez a tarefa)</span>}
                </button>
              ))}
            </div>
          </fieldset>
        ) : tec && (
          <p className="flex items-center gap-2 text-[15px]"><Avatar id={tec} n={nomeTec(tec)} tam="h-7 w-7" />Corrige {nomeTec(tec)}, que fez a tarefa.</p>
        )}
      </div>

      <footer className="flex flex-col gap-3 border-t border-border bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <p aria-live="polite" className={cn("flex items-start gap-2 text-[15px]", delta > 0 ? "font-medium text-warning" : "text-muted-foreground")}>
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{quem} recebe a correção no Hoje, {prev.dia === p.dia ? "para hoje" : `a ${rotuloDia(p, prev.dia)}`}. {efeito}</span>
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="ghost" className="min-h-11" onClick={() => setMotivo(null)}>Cancelar</Button>
          <Button className="min-h-11" disabled={!motivo.trim() || !tec} onClick={() => { run(() => A.pedirCorrecao(d.id, ti, motivo, { horas, tec })); setMotivo(null); }}>
            {!motivo.trim() ? "Escolha o que falta corrigir" : `Enviar a correção a ${quem}`}
          </Button>
        </div>
      </footer>
    </section>
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
      {/* 27/10: as horas numa frase ("66 h, previstas 62,6 h") e o desvio numa pastilha com cor; o estado só quando não é "por validar"
          (o cartão de validar já o diz no título) */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[15px]">
        {ex !== "feita" && <ChipExec e={ex} />}
        {t.exec && t.exec.horas > 0 && <>
          <span className="tabular-nums"><b className="font-semibold">{hfmt(t.exec.horas)} h</b> <span className="text-muted-foreground">feitas, previstas {hfmt(t.h)} h</span></span>
          <span className={cn("rounded-full px-2.5 py-0.5 text-sm font-medium tabular-nums", dif > 0.01 ? "bg-warning/15 text-warning" : dif < -0.01 ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}>
            {dif > 0.01 ? `+${nfmt(Math.round(dif * 10) / 10)} h acima` : dif < -0.01 ? `${nfmt(Math.round(-dif * 10) / 10)} h abaixo` : "como previsto"}
          </span>
        </>}
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
function Acompanhamento({ ctx, d, sel, setSel, ajustar }: { ctx: Ctx; d: Negocio; sel: number; setSel: (k: number) => void; ajustar: (ti: number) => void }) {
  const { S, A, run, go } = ctx;
  const p = d.obra.plano!, fim = fimDe(p.tasks), pode = S.role === "operacoes";
  // 23/10: na 2.0 o dia é o do calendário (motor: diaReal); no protótipo, o relógio à mão
  const real = comRelogioReal() ? diaReal(p) : null;
  const [hist, setHist] = useState<number | null>(null);
  const [fecho, setFecho] = useState<number | null>(null);
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
    <section id="obra-hoje" aria-labelledby="obra-hoje-t" className="mt-8 scroll-mt-16">
      <h2 id="obra-hoje-t" className="sr-only">Dia a dia</h2>

      {/* 27/10: o que chega do terreno é um aviso no canto, por cima da página (não a empurra) */}
      {chegou && (
        <div role="status" className={cn("fixed bottom-4 right-4 z-50 flex max-w-sm items-center gap-3 rounded-2xl border bg-card p-3 shadow-lg motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200", chegou.k === "ocorrencia" ? "border-destructive/40" : "border-primary/40")}>
          {chegou.fotos?.[0] ? <img src={chegou.fotos[0]} alt="" className="h-14 w-20 shrink-0 rounded-lg object-cover" /> : <AlertTriangle className="h-6 w-6 shrink-0 text-destructive" aria-hidden="true" />}
          <div className="min-w-0 flex-1">
            <p className={cn("text-sm font-semibold", chegou.k === "ocorrencia" ? "text-destructive" : "text-primary")}>{chegou.k === "ocorrencia" ? "Problema reportado agora" : "Novo registo do terreno"} · {chegou.quem}</p>
            <p className="line-clamp-2 text-[15px]">{chegou.t}</p>
          </div>
          <button type="button" onClick={() => setChegou(null)} aria-label="Fechar" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* hoje: o relógio do protótipo, para a frente e para trás; 23/10: na 2.0, o calendário real (e o atraso, se houver) */}
      {(!real || !!real.atraso) && <div className={cn("mt-6 flex flex-wrap items-center gap-3", real?.atraso ? "justify-between rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3" : "justify-end")}>
        {/* 27/10: o dia já está no título da obra; aqui só o atraso, quando há */}
        {real?.atraso ? <p className="text-[15px] font-medium">A obra devia ter acabado a {rotuloDia(p, fim - 1)}: vai {real.atraso} {real.atraso === 1 ? "dia útil" : "dias úteis"} atrasada. Ajuste o plano ou registe o que falta.</p> : null}
        {real ? null : pode ? (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="min-h-10 min-w-10" aria-label="Recuar um dia" disabled={p.dia <= 0} onClick={() => run(() => A.irParaDia(d.id, p.dia - 1))}><ArrowLeft className="h-4 w-4" aria-hidden="true" /></Button>
            <Button variant="ghost" size="sm" className="min-h-10 min-w-10" aria-label="Avançar um dia" disabled={p.dia >= fim - 1} onClick={() => run(() => A.irParaDia(d.id, p.dia + 1))}><ArrowRight className="h-4 w-4" aria-hidden="true" /></Button>
          </div>
        ) : <Mudar ctx={ctx} papel="operacoes" />}
      </div>}

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
              </div>
              {/* 27/10: à vista só a 1.ª ação; as outras ficam dentro do bloco aberto */}
              {aberto && (
                <div className="mt-3 space-y-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
                  <HistoricoTarefa t={t} p={p} />
                  {ex === "feita" && <Registo ctx={ctx} d={d} ti={ti} compacto />}
                  {((podeFechar && fecho !== ti) || (pode && (aj.dur || aj.inicio)) || t.tec) && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {podeFechar && fecho !== ti && <button type="button" onClick={() => { setFecho(ti); setHist(null); }} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"><CheckCircle2 className="h-4 w-4" aria-hidden="true" />Dar por feita</button>}
                      {pode && (aj.dur || aj.inicio) && <button type="button" onClick={() => ajustar(ti)} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"><CalendarClock className="h-4 w-4" aria-hidden="true" />Ajustar o plano</button>}
                      {t.tec && <button type="button" onClick={verComo(t.tec)} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"><Smartphone className="h-4 w-4" aria-hidden="true" />Ver como {nomeTec(t.tec).split(" ")[0]}</button>}
                    </div>
                  )}
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
    <div className="mt-3 space-y-3 rounded-xl border border-success/30 bg-success/[0.04] p-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
      <p className="text-[15px]"><b className="font-semibold">Dar por feita sem esperar por {nomeTec(t.tec).split(" ")[0]}.</b> <span className="text-muted-foreground">Fica logo validada{t.exec?.horas ? "" : `, com as ${hfmt(t.h)} h previstas`}.</span></p>
      <div className="flex flex-wrap items-center gap-2">
        {fotos.map((f, k) => (
          <span key={k} className="relative motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
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
    <section aria-label={`Ajustar ${t.nome}`} className={cn(CARTAO, "border-primary/40 p-4 ring-1 ring-primary/20 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200 sm:p-5")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-primary">Ajustar com a obra em curso</p>
          <p className="text-base font-semibold" title={t.nome}>{nomeCurtoTarefa(t.nome)}</p>
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
                {MOTIVOS_AJUSTE.map((x) => <button key={x} type="button" aria-pressed={motivo === x} onClick={() => setMotivo(x)} className={cn("min-h-10 rounded-full border px-3 text-[15px]", motivo === x ? "border-primary bg-primary/10 font-medium text-primary" : "border-input hover:border-foreground/40")}>{x}</button>)}
              </div>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} aria-label="Motivo do ajuste" placeholder="Ou escreva o motivo" className="h-11 w-full rounded-lg border border-input bg-background px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </dd>
          </div>
        </dl>
      )}
      {muda && (
        <div className="mt-2 rounded-xl bg-muted/60 p-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
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
  // 21/10: os ajustes seguidos à mesma tarefa num só, com o efeito líquido (menos ruído)
  const L = juntarAjustes(d.obra.alteracoes ?? []);
  if (!L.length) return null;
  return (
    <div className="mt-4">
      <p className="text-[15px] font-medium">Ajustes com a obra em curso <span className="font-normal text-muted-foreground">· {L.length}</span></p>
      <ul className={cn(CARTAO, "mt-2 divide-y divide-border px-4")}>
        {L.map((a, k) => (
          <li key={k} className="py-3 text-[15px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
            <p>{a.t} <span className="text-muted-foreground">· {a.motivo}{a.n > 1 ? ` · ${a.n} ajustes` : ""}</span></p>
            <p className="text-sm text-muted-foreground">{a.q} · {a.quem} · {a.fimAntes === a.fimDepois ? `o fim mantém-se a ${a.fimDepois}` : `fim: ${a.fimAntes} → ${a.fimDepois}`}{a.cliente ? " · cliente avisado no portal" : " · sem aviso ao cliente"}</p>
          </li>
        ))}
      </ul>
    </div>
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
                    <span className="block text-sm text-muted-foreground">{dias(m.dias)} na obra · {hfmt(m.horas)} h · {m.tarefas.length} {m.tarefas.length === 1 ? "tarefa" : "tarefas"}{direcao ? ` · ${eur(m.custoH)} €/h` : ""}</span>
                  </span>
                  <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", on && "rotate-180")} aria-hidden="true" />
                </button>
                <a href={`tel:${m.tel.replace(/\s/g, "")}`} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-[15px] text-primary"><Phone className="h-4 w-4" aria-hidden="true" /><span className="hidden sm:inline">{m.tel}</span><span className="sr-only sm:hidden">Ligar a {m.n}</span></a>
              </div>
              {on && (
                <div className="ml-[3.25rem] mt-2 space-y-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
                  <ul className="space-y-1.5">
                    {minhas.map(({ t, i }) => (
                      <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px]">
                        <button type="button" onClick={() => verDia(Math.min(p.dia, t.dia + t.dur - 1) >= t.dia ? Math.min(p.dia, t.dia + t.dur - 1) : t.dia)} className="font-medium text-primary underline-offset-4 hover:underline" title={t.nome}>{nomeCurtoTarefa(t.nome)}</button>
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
                  <span className="block text-sm text-muted-foreground">{e.tarefas.length} {e.tarefas.length === 1 ? "tarefa" : "tarefas"}</span>
                  <span className="block text-sm tabular-nums text-muted-foreground">{quandoEquip(p, e)}</span>
                </span>
                <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-sm font-medium", e.origem === "Aluguer" ? "bg-warning/15" : e.origem === "Frota" ? "bg-primary/10 text-primary" : "bg-muted")}>{e.origem}</span>
              </button>
              {on && (
                <div className="ml-[3.25rem] mt-2 space-y-2 text-[15px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
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
    </section>
  );
}

/** 21/10: a conversa com o cliente (o mesmo fio do portal do cliente). Ao abrir, as mensagens do cliente ficam lidas. */
function ConversaNaObra({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const { A, run } = ctx;
  // 30/10 (2.0): com a base ligada a conversa é a da base, a mesma do portal do cliente (o autor é o utilizador com sessão); no protótipo de
  // sempre continua a do estado local do negócio.
  const org = orgDoModoReal();
  const real = useConversaReal(org, d.id);
  const msgs = org ? real.msgs : (d.obra.chat ?? []), porLer = msgs.filter((m) => m.de === "cliente" && !m.lida).length;
  const marcarLidas = () => (org ? void real.marcarComoLidas() : run(() => A.lerChat(d.id)));
  const enviar = (t: string): void | Promise<boolean> => (org ? real.enviar(t) : run(() => A.mensagemObra(d.id, "empresa", t)));
  return (
    <section id="obra-chat" aria-labelledby="obra-chat-t" className={cn(CARTAO, "mt-4 scroll-mt-16 p-5", porLer > 0 && "border-warning/50")}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="obra-chat-t" className={H2}>Conversa com o cliente <span className="font-normal text-muted-foreground">· {d.nome}</span>
          {porLer > 0 && <span className="ml-2 rounded-full bg-warning px-2 py-0.5 align-middle text-xs font-semibold text-white">{porLer} por ler</span>}</h2>
        {porLer > 0 && <button type="button" onClick={marcarLidas} className="min-h-10 text-sm font-medium text-primary underline-offset-4 hover:underline">Marcar {porLer === 1 ? "1 mensagem" : `${porLer} mensagens`} como lida{porLer === 1 ? "" : "s"}</button>}
      </div>
      <div className="mt-3">
        <Conversa msgs={msgs} eu="empresa" enviar={enviar} vazio="Ainda sem mensagens. Escreva ao cliente: ele vê no portal."
          rapidas={["Bom dia! A equipa já está na obra.", "Já pode ver as fotografias de hoje no portal.", "Vou confirmar e respondo ainda hoje."]} />
        {org && real.erro && <p role="alert" className="mt-2 text-[15px] text-destructive">{real.erro}</p>}
      </div>
    </section>
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
  const [todos, setTodos] = useState(false);
  const T = [...(d.obra.diario ?? [])].reverse(), L = todos ? T : T.slice(0, 8);
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
      {T.length > 8 && <button type="button" onClick={() => setTodos(!todos)} aria-expanded={todos} className="mt-3 min-h-10 text-sm font-medium text-primary underline-offset-4 hover:underline">{todos ? "Ver menos" : `Ver os ${T.length} registos`}</button>}
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
// 22/10 (fase 3): os três números da obra indexada à proposta (custoObra.ts): o previsto é a mão de obra da proposta aceite (congelada no
// envio, mais as adendas assinadas), o real são as horas registadas × o €/h do técnico no registo, o desvio é real − previsto.
const sinal = (x: number) => (x > 0.005 ? "+" : x < -0.005 ? "−" : "") + eur(Math.abs(x));
function CustosObra({ d, S }: { d: Negocio; S: Estado }) {
  const p = d.obra.plano!, K = custoObra(d, S);
  const cor = (x: number | null) => (x == null ? "text-muted-foreground" : x > 0.5 ? "text-warning" : x < -0.5 ? "text-success" : "");
  // 27/10: à vista, as 10 tarefas com maior desvio (em valor absoluto); as outras atrás de "ver"
  const [todas, setTodas] = useState(false);
  const linhas = todas ? K.linhas : [...K.linhas].sort((a, b) => Math.abs(b.desvio ?? 0) - Math.abs(a.desvio ?? 0)).slice(0, 10);
  return (
    <section id="obra-custos" aria-labelledby="obra-custos-t" className="mt-10 scroll-mt-16" data-testid="custos-obra">
      <h2 id="obra-custos-t" className={H2}>Custos de mão de obra</h2>
      <dl className="mt-3 grid grid-cols-3 gap-3 rounded-xl border border-border p-3 text-[15px]">
        <div><dt className="text-sm text-muted-foreground">Previsto</dt><dd className="font-semibold tabular-nums" data-testid="custo-prev">{eur(K.prev)} €</dd></div>
        <div><dt className="text-sm text-muted-foreground">Real até agora</dt><dd className="font-semibold tabular-nums" data-testid="custo-real">{K.registadas ? `${eur(K.real)} €` : "—"}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Desvio</dt>
          <dd className={cn("font-semibold tabular-nums", cor(K.registadas ? K.desvio : null))} data-testid="custo-desvio">{K.registadas ? `${sinal(K.desvio)} €` : "—"}</dd></div>
      </dl>
      <table className="mt-3 w-full text-[15px]">
        <thead><tr className="text-left text-sm text-muted-foreground"><th className="py-2 font-normal">Tarefa</th><th className="py-2 text-right font-normal">Previsto</th><th className="py-2 text-right font-normal">Real</th><th className="py-2 text-right font-normal">Desvio</th></tr></thead>
        <tbody className="divide-y divide-border border-y border-border">
          {linhas.map((l) => {
            const t: Tarefa = p.tasks[l.ti];
            return (
              <tr key={l.ti}><td className="py-2 pr-2">{l.n}<span className="block text-sm text-muted-foreground">{l.origem === "fora" ? "fora da proposta" : `${hfmt(l.hPrev)} h na proposta`}{l.hReal != null ? ` · ${hfmt(l.hReal)} h registadas` : ""}{t.tec ? "" : " · por atribuir"}</span></td>
                <td className="py-2 text-right tabular-nums">{eur(l.prev)} €</td>
                <td className={cn("py-2 text-right tabular-nums", l.real == null && "text-muted-foreground")}>{l.real == null ? "—" : `${eur(l.real)} €`}</td>
                <td className={cn("py-2 text-right tabular-nums", cor(l.desvio))}>{l.desvio == null ? "—" : `${sinal(l.desvio)} €`}</td></tr>
            );
          })}
        </tbody>
        <tfoot><tr className="font-semibold"><td className="py-2">Total</td><td className="py-2 text-right tabular-nums">{eur(K.prev)} €</td><td className="py-2 text-right tabular-nums">{K.registadas ? `${eur(K.real)} €` : "—"}</td><td className={cn("py-2 text-right tabular-nums", cor(K.registadas ? K.desvio : null))}>{K.registadas ? `${sinal(K.desvio)} €` : "—"}</td></tr></tfoot>
      </table>
      {K.linhas.length > 10 && <button type="button" onClick={() => setTodas(!todas)} aria-expanded={todas} className="mt-2 min-h-10 text-sm font-medium text-primary underline-offset-4 hover:underline">{todas ? "Ver menos" : `Ver as ${K.linhas.length} tarefas`}</button>}
      {K.fases.length > 1 && (
        <ul className="mt-3 flex flex-wrap gap-2 text-sm" aria-label="Por fase">
          {K.fases.map((f) => <li key={f.fase} className="rounded-full border border-border px-3 py-1 tabular-nums">{f.fase ? `Fase ${f.fase}` : "Sem fase"}: {eur(f.prev)} € previstos · {eur(f.real)} € reais</li>)}
        </ul>
      )}
    </section>
  );
}

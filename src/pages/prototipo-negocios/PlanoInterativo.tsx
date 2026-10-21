// O plano da obra, interativo (21/10/2026), para quem valida o plano (as Operações) e para o gestor com a obra em curso:
// · BarraTarefa: a barra do Gantt arrasta-se (o início, e para outra fase largando-a na linha de outra fase) e a ponta
//   puxa-se (os dias). Pelo teclado: ← → o início, Shift + ← → os dias, Alt + ↑ ↓ a fase. Um toque sem arrastar abre a tarefa.
// · TarefasDoPlano: "Nova tarefa" numa fase, a partir de um serviço: o ofício, as horas e os materiais vêm dele; o técnico livre
//   do ofício vem escolhido. O técnico é avisado (aparece no Hoje dele: AvisosTecnico.tsx).
// · ExtrasTarefa: no painel da tarefa, a fase, os materiais (editáveis), o aviso ao técnico (visto ou por ver) e tirar a tarefa.
// A lógica está em tarefasValidador.ts; o motor só a chama.
import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Bell, BellRing, Check, Minus, Package, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TECS, diaDeFerias, nfmt, type MatTarefa, type Negocio, type Plano, type SvcId, type Tarefa } from "./motor";
import type { Ctx } from "./pecas";
import { COR_FASE } from "./planoObra";
import { FASES_OBRA } from "./fasesObra";
import { rotuloDia, skDaTarefa } from "./preparacaoObra";
import { IconeServico, iconeDoServico } from "./ilustracoes";
import { AvatarTec } from "./AcompanhamentoObra";
import { consumiveisConhecidos, criarTarefa, diaMinimo, materiaisDaTarefa, materiaisDoServico, podeTirar, tempoDoServico, ultimoAviso } from "./tarefasValidador";

const CARTAO = "rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]";
/** As unidades de área e de comprimento: começam em 5 e andam de 5 em 5. */
const POR_5 = /^(m²|ml|m)$/;
const dias = (n: number) => `${nfmt(n)} ${n === 1 ? "dia" : "dias"}`;
const chip = (on: boolean) => cn("inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[15px] transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-foreground/40");

/* ================================================================== a barra do Gantt, arrastável */
type Arrasto = { modo: "mover" | "dur"; x: number; y: number; moveu: boolean; id: number };

export function BarraTarefa({ p, t, colW, x, largura, cor, className, style, ativa, mover, durar, abrir, rotulo, children }: {
  p: Plano; t: Tarefa; ti: number; colW: number; x: number; largura: number; cor: string; className?: string; style?: CSSProperties;
  /** Pode arrastar (o plano ainda não arrancou e é quem o valida). */
  ativa: boolean;
  mover: (dia: number, fase?: number) => void; durar: (dur: number) => void; abrir: () => void; rotulo: string; children?: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const arr = useRef<Arrasto | null>(null);
  const [vista, setVista] = useState<{ dd: number; dy: number; fase: number | null; modo: "mover" | "dur" } | null>(null);

  // a fase da linha por baixo do ponteiro (sem contar a própria barra, que anda com ele)
  const faseEm = (cx: number, cy: number): number | null => {
    for (const el of document.elementsFromPoint(cx, cy)) {
      if (ref.current?.contains(el)) continue;
      const li = (el as HTMLElement).closest?.("[data-fase]");
      if (li) return Number(li.getAttribute("data-fase")) || null;
    }
    return null;
  };
  const baixo = (e: PointerEvent<HTMLElement>, modo: Arrasto["modo"]) => {
    if (!ativa || e.button !== 0) return;
    e.stopPropagation();
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* sem captura (ex.: eventos sintéticos) */ }
    arr.current = { modo, x: e.clientX, y: e.clientY, moveu: false, id: e.pointerId };
  };
  const mexe = (e: PointerEvent<HTMLElement>) => {
    const a = arr.current;
    if (!a || a.id !== e.pointerId) return;
    const dx = e.clientX - a.x, dy = e.clientY - a.y;
    if (!a.moveu && Math.abs(dx) < 5 && Math.abs(dy) < 6) return;
    a.moveu = true;
    const dd = Math.round(dx / colW);
    const fase = a.modo === "mover" && t.fase ? faseEm(e.clientX, e.clientY) : null;
    setVista({ dd: a.modo === "dur" ? Math.max(1 - t.dur, dd) : Math.max(-t.dia, dd), dy: a.modo === "mover" ? dy : 0, fase, modo: a.modo });
  };
  const cima = (e: PointerEvent<HTMLElement>) => {
    const a = arr.current;
    if (!a || a.id !== e.pointerId) return;
    arr.current = null;
    const v = vista;
    setVista(null);
    if (!a.moveu || !v) { abrir(); return; }
    if (v.modo === "dur") { if (v.dd) durar(t.dur + v.dd); return; }
    const fase = v.fase && v.fase !== t.fase ? v.fase : undefined;
    if (v.dd || fase) mover(t.dia + v.dd, fase);
  };
  const tecla = (e: KeyboardEvent<HTMLSpanElement>) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); return; }
    if (!ativa) return;
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (dir && e.shiftKey) { e.preventDefault(); if (t.dur + dir >= 1) durar(t.dur + dir); return; }
    if (dir) { e.preventDefault(); if (t.dia + dir >= 0) mover(t.dia + dir); return; }
    const fd = e.altKey ? (e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0) : 0;
    if (fd && t.fase) { e.preventDefault(); const f = Math.min(4, Math.max(1, t.fase + fd)); if (f !== t.fase) mover(t.dia, f); }
  };

  const dd = vista?.dd ?? 0;
  const left = x + (vista?.modo === "mover" ? dd * colW : 0), width = Math.max(10, largura + (vista?.modo === "dur" ? dd * colW : 0));
  const novaFase = vista?.fase && vista.fase !== t.fase ? vista.fase : null;
  const etiqueta = vista ? (vista.modo === "dur" ? dias(t.dur + dd) : rotuloDia(p, t.dia + dd)) : null;
  return (
    <span ref={ref} role="button" tabIndex={0} aria-label={rotulo} onKeyDown={tecla}
      onPointerDown={(e) => baixo(e, "mover")} onPointerMove={mexe} onPointerUp={cima} onPointerCancel={() => { arr.current = null; setVista(null); }}
      onClick={() => { if (!ativa) abrir(); }}
      className={cn("group absolute top-0.5 h-6 touch-none select-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        ativa ? "cursor-grab" : "cursor-pointer", vista ? "z-20 cursor-grabbing shadow-[0_12px_28px_-10px_rgba(0,0,0,0.45)]" : "transition-[left,width] duration-300", className)}
      style={{ ...style, left, width, background: novaFase ? COR_FASE[novaFase] : cor, transform: vista ? `translateY(${vista.dy}px) scale(1.03)` : undefined }}>
      {etiqueta && (
        <span className="pointer-events-none absolute -top-8 left-0 z-30 whitespace-nowrap rounded-lg bg-foreground px-2 py-1 text-xs font-medium text-background shadow-lg">
          {etiqueta}{novaFase ? ` · para a fase ${novaFase} · ${FASES_OBRA[novaFase - 1].curto}` : ""}
        </span>
      )}
      {children}
      {ativa && (
        // a ponta direita: puxa os dias
        <span aria-hidden="true" onPointerDown={(e) => baixo(e, "dur")} onPointerMove={mexe} onPointerUp={cima}
          className="absolute -right-1 top-0 grid h-6 w-4 cursor-ew-resize place-items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <span className="h-3.5 w-1 rounded-full bg-white/90 shadow" />
        </span>
      )}
    </span>
  );
}

/* ================================================================== os materiais de uma tarefa (editáveis) */
export function EditorMateriais({ mats, mudar }: { mats: MatTarefa[]; mudar: (m: MatTarefa[]) => void }) {
  const [juntar, setJuntar] = useState(false);
  const [q, setQ] = useState("");
  const todos = useMemo(consumiveisConhecidos, []);
  const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const opcoes = todos.filter((c) => !mats.some((m) => m.n === c.n) && (!q.trim() || sem(c.n).includes(sem(q.trim())))).slice(0, 12);
  const passo = (m: MatTarefa) => (m.q >= 10 ? 1 : m.q >= 1 ? 1 : 0.5);
  return (
    <div>
      {mats.length > 0 ? (
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Materiais da tarefa">
          {mats.map((m, k) => (
            <li key={m.n} className="flex items-center gap-2.5 rounded-xl border border-border bg-background p-2 pl-2.5 animate-in fade-in-0 zoom-in-95 duration-200">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"><Package className="h-4 w-4" aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium leading-tight">{m.n}</span>
                {m.forn && <span className="block truncate text-xs text-muted-foreground">{m.forn}</span>}
              </span>
              <span role="group" aria-label={`Quantidade de ${m.n}`} className="inline-flex shrink-0 items-center rounded-lg border border-input">
                <button type="button" aria-label={`Menos · ${m.n}`} onClick={() => mudar(m.q - passo(m) <= 0 ? mats.filter((_, i) => i !== k) : mats.map((x, i) => (i === k ? { ...x, q: Math.round((x.q - passo(m)) * 100) / 100 } : x)))}
                  className="grid h-9 w-9 place-items-center hover:bg-muted"><Minus className="h-3.5 w-3.5" /></button>
                <span className="min-w-[3.25rem] text-center text-sm tabular-nums">{nfmt(m.q)} {m.un}</span>
                <button type="button" aria-label={`Mais · ${m.n}`} onClick={() => mudar(mats.map((x, i) => (i === k ? { ...x, q: Math.round((x.q + passo(m)) * 100) / 100 } : x)))}
                  className="grid h-9 w-9 place-items-center hover:bg-muted"><Plus className="h-3.5 w-3.5" /></button>
              </span>
              <button type="button" aria-label={`Tirar ${m.n}`} onClick={() => mudar(mats.filter((_, i) => i !== k))}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><X className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      ) : <p className="text-[15px] text-muted-foreground">Sem materiais.</p>}
      {juntar ? (
        <div className="mt-3 rounded-xl border border-dashed border-input p-3 animate-in fade-in-0 duration-150">
          <label className="relative block">
            <span className="sr-only">Procurar material</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar: cola, silicone, tubo…"
              className="h-11 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            {opcoes.map((c) => (
              <button key={c.n} type="button" onClick={() => { mudar([...mats, c]); setQ(""); }}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-input bg-card px-3 text-sm hover:border-primary hover:text-primary">
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />{c.n}
              </button>
            ))}
            {!opcoes.length && <span className="text-sm text-muted-foreground">Nada com esse nome.</span>}
          </div>
          <button type="button" onClick={() => setJuntar(false)} className="mt-2 min-h-9 text-sm text-muted-foreground hover:text-foreground">Fechar</button>
        </div>
      ) : (
        <button type="button" onClick={() => setJuntar(true)} className="mt-2 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-[15px] font-medium text-primary hover:bg-primary/[0.06]">
          <Plus className="h-4 w-4" aria-hidden="true" />Juntar material
        </button>
      )}
    </div>
  );
}

/* ================================================================== o que mais se ajusta numa tarefa */
function EstadoAviso({ p, ti }: { p: Plano; ti: number }) {
  const a = ultimoAviso(p, ti);
  if (!a) return null;
  return (
    <p className={cn("flex items-start gap-2 rounded-xl px-3 py-2 text-sm", a.lido ? "bg-success/10" : "bg-warning/10")}>
      {a.lido ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" /> : <BellRing className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />}
      <span><b className="font-medium">{TECS.find((x) => x.id === a.tec)?.n.split(" ")[0]} {a.lido ? `viu o aviso · ${a.lido}` : "foi avisado · ainda não viu"}</b>
        <span className="block text-muted-foreground">«{a.t}» · {a.q}</span></span>
    </p>
  );
}

/** No painel da tarefa: a fase, os materiais, o aviso ao técnico e tirar (só as tarefas novas). */
export function ExtrasTarefa({ ctx, d, ti, fase = true, fechar }: { ctx: Ctx; d: Negocio; ti: number; fase?: boolean; fechar?: () => void }) {
  const { S, A, run } = ctx;
  const p = d.obra.plano!, t = p.tasks[ti];
  if (!t) return null;
  const mats = materiaisDaTarefa(t, S.svc);
  return (
    <div className="divide-y divide-border border-t border-border">
      {fase && t.fase != null && (
        <div className="py-3">
          <p className="text-[15px]">Fase</p>
          <div role="group" aria-label={`Fase de ${t.nome}`} className="mt-2 flex flex-wrap gap-2">
            {FASES_OBRA.map((f) => (
              <button key={f.n} type="button" aria-pressed={t.fase === f.n} onClick={() => run(() => A.moverTarefaPlano(d.id, ti, { fase: f.n }))} className={chip(t.fase === f.n)}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: COR_FASE[f.n] }} aria-hidden="true" />{f.n} · {f.curto}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="py-3">
        <p className="mb-2 text-[15px]">Materiais{!t.mats && mats.length > 0 && <span className="block text-sm text-muted-foreground">da receita do serviço; mude o que for preciso</span>}</p>
        <EditorMateriais mats={mats} mudar={(m) => run(() => A.matsTarefa(d.id, ti, m))} />
      </div>
      {(ultimoAviso(p, ti) || podeTirar(p, ti)) && (
        <div className="space-y-3 py-3">
          <EstadoAviso p={p} ti={ti} />
          {podeTirar(p, ti) && (
            <button type="button" onClick={() => { run(() => A.tirarTarefaPlano(d.id, ti)); fechar?.(); }}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-[15px] font-medium text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4" aria-hidden="true" />Tirar esta tarefa do plano
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ================================================================== a tarefa nova */
/** "Nova tarefa" e o painel de a criar. Monta-se uma vez na página da obra (para as Operações). */
export function TarefasDoPlano({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const p = d.obra.plano;
  const [aberto, setAberto] = useState(false);
  if (!p || ctx.S.role !== "operacoes" || p.estado === "concluída") return null;
  if (!aberto) return (
    <button type="button" onClick={() => setAberto(true)}
      className="group mt-4 flex min-h-14 w-full items-center gap-3 rounded-2xl border border-dashed border-input bg-card px-4 text-left transition-colors hover:border-primary hover:bg-primary/[0.03]">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition-transform group-hover:scale-105"><Plus className="h-5 w-5" aria-hidden="true" /></span>
      <span className="flex-1">
        <span className="block text-[15px] font-medium">Nova tarefa</span>
        <span className="block text-sm text-muted-foreground">Numa fase, a partir de um serviço: técnico e materiais já sugeridos. O técnico é avisado.</span>
      </span>
    </button>
  );
  return <NovaTarefa ctx={ctx} d={d} fechar={() => setAberto(false)} />;
}

function NovaTarefa({ ctx, d, fechar }: { ctx: Ctx; d: Negocio; fechar: () => void }) {
  const { S, A, run } = ctx;
  const p = d.obra.plano!;
  const [sid, setSid] = useState<SvcId | null>(null);
  const [procura, setProcura] = useState("");
  const [q, setQ] = useState(1);
  const [fase, setFase] = useState<number>(() => p.tasks.find((t) => t.fase)?.fase ?? 1);
  const [tec, setTec] = useState<string | null | undefined>(undefined);
  const [mats, setMats] = useState<MatTarefa[] | null>(null);
  const [delta, setDelta] = useState(0);
  const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const servicos = Object.entries(S.svc).filter(([, s]) => s.h > 0 && (!procura.trim() || sem(s.n + " " + s.perfil).includes(sem(procura.trim()))));
  const s = sid ? S.svc[sid] : null;

  // a pré-visualização da tarefa como fica (o início sugerido, o técnico livre), sem mexer no plano
  const min = diaMinimo(p, fase);
  const sugerido = s && sid ? criarTarefa(p, s, { sid, q, fase }).dia : 0;
  const dia = Math.max(min, sugerido + delta);
  const previa = s && sid ? criarTarefa(p, s, { sid, q, fase, tec, mats: mats ?? undefined, dia }) : null;
  const sk = s ? skDaTarefa(s.perfil, s.n) : "";
  const tecs = TECS.filter((x) => x.sk === sk);
  const escolherSvc = (k: SvcId) => {
    const sv = S.svc[k], un1 = POR_5.test(sv.un) ? 5 : 1;
    setSid(k); setQ(un1); setMats(null); setTec(undefined); setDelta(0);
    // a fase sugerida: a de outra tarefa do mesmo ofício, se houver
    const igual = p.tasks.find((t) => t.sk === skDaTarefa(sv.perfil, sv.n) && t.fase);
    if (igual?.fase) setFase(igual.fase);
  };
  const criar = () => {
    if (!sid || !previa) return;
    run(() => A.novaTarefaPlano(d.id, { sid, q, fase, tec: previa.tec, mats: previa.mats, dia }));
    fechar();
  };
  const tempo = s ? tempoDoServico(s, q) : null;
  // as áreas e os metros andam de 5 em 5; o resto, de 1 em 1
  const passoQ = s && POR_5.test(s.un) ? 5 : 1;
  const tecN = previa?.tec ? TECS.find((x) => x.id === previa.tec)?.n.split(" ")[0] : null;

  return (
    <section aria-label="Nova tarefa" className={cn(CARTAO, "mt-4 overflow-hidden animate-in fade-in-0 slide-in-from-top-2 duration-300")}>
      <header className="flex items-start justify-between gap-3 border-b border-border bg-primary/[0.04] p-4 sm:p-5">
        <div>
          <p className="text-lg font-semibold">Nova tarefa</p>
          <p className="text-[15px] text-muted-foreground">{s ? `${s.n} · ${tempo && `${nfmt(tempo.h)} h · ${dias(tempo.dur)}`}` : "Que trabalho é? Escolha o serviço."}</p>
        </div>
        <button type="button" onClick={fechar} aria-label="Fechar" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-muted"><X className="h-5 w-5" /></button>
      </header>

      <div className="space-y-5 p-4 sm:p-5">
        {/* 1. o serviço */}
        {!s ? (
          <div>
            <label className="relative block">
              <span className="sr-only">Procurar serviço</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input autoFocus type="search" value={procura} onChange={(e) => setProcura(e.target.value)} placeholder="Procurar: pintura, canalização, pladur…"
                className="h-12 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
            </label>
            <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3" aria-label="Serviços">
              {servicos.slice(0, 18).map(([k, sv]) => (
                <li key={k}>
                  <button type="button" onClick={() => escolherSvc(k)}
                    className="group flex h-full min-h-[72px] w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-[0_10px_24px_-14px_hsl(var(--primary)/0.6)]">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-muted/70 text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary"><IconeServico k={iconeDoServico(sv.n, sv.perfil)} /></span>
                    <span className="min-w-0"><span className="line-clamp-2 text-[15px] font-medium leading-snug">{sv.n}</span><span className="block truncate text-sm text-muted-foreground">{sv.perfil}</span></span>
                  </button>
                </li>
              ))}
            </ul>
            {!servicos.length && <p className="mt-3 text-[15px] text-muted-foreground">Nenhum serviço com esse nome.</p>}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-card text-primary"><IconeServico k={iconeDoServico(s.n, s.perfil)} /></span>
              <span className="min-w-0 flex-1"><span className="block text-[15px] font-medium">{s.n}</span><span className="block text-sm text-muted-foreground">{s.perfil} · {nfmt(s.h)} h por {s.un}</span></span>
              <button type="button" onClick={() => setSid(null)} className="min-h-10 rounded-lg px-3 text-sm font-medium text-primary hover:bg-primary/[0.08]">Trocar</button>
            </div>

            <Linha rot="Quantidade" sub={tempo ? `${nfmt(tempo.h)} h de trabalho · ${dias(tempo.dur)}` : undefined}>
              <Passo rot="Quantidade" valor={`${nfmt(q)} ${s.un}`} desMenos={q <= 1} menos={() => { setQ(Math.max(1, q - passoQ)); setMats(null); }} mais={() => { setQ(q + passoQ); setMats(null); }} />
            </Linha>

            <div>
              <p className="text-[15px]">Fase</p>
              <div role="group" aria-label="Fase" className="mt-2 flex flex-wrap gap-2">
                {FASES_OBRA.map((f) => (
                  <button key={f.n} type="button" aria-pressed={fase === f.n} onClick={() => { setFase(f.n); setDelta(0); }} className={chip(fase === f.n)}>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: fase === f.n ? "currentColor" : COR_FASE[f.n] }} aria-hidden="true" />{f.n} · {f.curto}
                  </button>
                ))}
              </div>
            </div>

            <Linha rot="Começa" sub={p.estado === "em curso" ? "não antes de hoje nem do fim da fase anterior" : "não antes do fim da fase anterior"}>
              <Passo rot="Dia de início" valor={rotuloDia(p, dia)} desMenos={dia <= min} menos={() => setDelta(dia - 1 - sugerido)} mais={() => setDelta(delta + 1)} />
            </Linha>

            <div>
              <p className="text-[15px]">Técnico <span className="text-sm text-muted-foreground">· {sk}</span></p>
              <div role="group" aria-label="Técnico" className="mt-2 flex flex-wrap gap-2">
                {tecs.map((x) => {
                  const k = previa ? diaDeFerias(x, p, dia, previa.dur) : null, on = previa?.tec === x.id;
                  return (
                    <button key={x.id} type="button" aria-pressed={on} onClick={() => setTec(x.id)}
                      className={cn("flex min-h-12 items-center gap-2 rounded-xl border px-3 py-1.5 text-left text-[15px] transition-colors", on ? "border-primary bg-primary/[0.06] ring-1 ring-primary" : "border-input hover:border-foreground/40")}>
                      <AvatarTec id={x.id} tam="h-8 w-8" />
                      <span>{x.n}<span className={cn("block text-sm", k == null ? "text-success" : "text-warning")}>{k == null ? "livre nesses dias" : `de férias a ${rotuloDia(p, k)}`}</span></span>
                    </button>
                  );
                })}
                <button type="button" aria-pressed={previa?.tec === null} onClick={() => setTec(null)} className={cn("min-h-12 rounded-xl border px-3 text-[15px]", previa?.tec === null ? "border-primary bg-primary/[0.06]" : "border-input text-muted-foreground hover:border-foreground/40")}>Sem técnico, por agora</button>
              </div>
            </div>

            <div>
              <p className="mb-2 text-[15px]">Materiais <span className="text-sm text-muted-foreground">· da receita do serviço</span></p>
              <EditorMateriais mats={mats ?? materiaisDoServico(sid!, q)} mudar={setMats} />
            </div>
          </>
        )}
      </div>

      {s && (
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card p-4 sm:px-5">
          <p className="flex items-center gap-2 text-[15px] text-muted-foreground">
            <Bell className="h-4 w-4" aria-hidden="true" />{tecN ? `${tecN} recebe o aviso no telemóvel` : "Sem técnico: ninguém é avisado"}
          </p>
          <Button size="lg" onClick={criar}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Juntar à fase {fase}{tecN ? ` e avisar ${tecN}` : ""}</Button>
        </footer>
      )}
    </section>
  );
}

function Linha({ rot, sub, children }: { rot: string; sub?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p className="text-[15px]">{rot}{sub && <span className="block text-sm text-muted-foreground">{sub}</span>}</p>
      {children}
    </div>
  );
}
function Passo({ rot, valor, menos, mais, desMenos }: { rot: string; valor: ReactNode; menos: () => void; mais: () => void; desMenos?: boolean }) {
  return (
    <span role="group" aria-label={rot} className="inline-flex items-center rounded-lg border border-input bg-card p-0.5">
      <button type="button" aria-label={`Menos · ${rot}`} disabled={desMenos} onClick={menos} className="grid h-11 w-11 place-items-center rounded-md hover:bg-muted disabled:opacity-30"><Minus className="h-4 w-4" /></button>
      <output className="min-w-[7.5rem] px-1 text-center text-[15px] font-medium tabular-nums">{valor}</output>
      <button type="button" aria-label={`Mais · ${rot}`} onClick={mais} className="grid h-11 w-11 place-items-center rounded-md hover:bg-muted"><Plus className="h-4 w-4" /></button>
    </span>
  );
}

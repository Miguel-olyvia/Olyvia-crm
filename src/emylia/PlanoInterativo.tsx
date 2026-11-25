// O plano da obra, interativo (21/10/2026), para quem valida o plano (as Operações) e para o gestor com a obra em curso:
// · NovaTarefa: "Nova tarefa" numa fase, a partir de um serviço: o ofício, as horas e os materiais vêm dele; o técnico livre
//   do ofício vem escolhido. O técnico é avisado (aparece no Hoje dele: AvisosTecnico.tsx).
// · EditorMateriais: os materiais de uma tarefa, editáveis.
// 20/11 (auditoria 19/11): a barra arrastável do Gantt (BarraTarefa), o painel da tarefa (ExtrasTarefa) e o botão «Nova tarefa»
// (TarefasDoPlano) saíram com a página antiga da obra (PaginaObra), a única que os usava; o Estúdio da obra e o do plano têm os seus.
// A lógica está em tarefasValidador.ts; o motor só a chama.
import { useMemo, useState, type ReactNode } from "react";
import { Bell, Minus, Package, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TECS, diaDeFerias, nfmt, type MatTarefa, type Negocio, type SvcId } from "./motor";
import type { Ctx } from "./pecas";
import { COR_FASE } from "./planoObra";
import { FASES_OBRA } from "./fasesObra";
import { rotuloDia, tecnicosDoOficio } from "./preparacaoObra";
import { IconeServico, iconeDoServico } from "./ilustracoes";
import { AvatarTec } from "./AcompanhamentoObra";
import { catalogoParcial, orgDoCatalogoLido } from "./real/catalogoLeve";
import { usePesquisaProdutos } from "./real/pesquisaProdutos";
import { consumiveisConhecidos, criarTarefa, criarTarefaInterna, diaMinimo, materiaisDoServico, oficioDe, tempoDoServico, type NovaTarefa as DadosTarefaNova } from "./tarefasValidador";

const CARTAO = "rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]";
/** As unidades de área e de comprimento: começam em 5 e andam de 5 em 5. */
const POR_5 = /^(m²|ml|m)$/;
const dias = (n: number) => `${nfmt(n)} ${n === 1 ? "dia" : "dias"}`;
const chip = (on: boolean) => cn("inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[15px] transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-foreground/40");

/* ================================================================== os materiais de uma tarefa (editáveis) */
export function EditorMateriais({ mats, mudar }: { mats: MatTarefa[]; mudar: (m: MatTarefa[]) => void }) {
  const [juntar, setJuntar] = useState(false);
  const [q, setQ] = useState("");
  const todos = useMemo(consumiveisConhecidos, []);
  const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  // 22/01: com o Catálogo leve `todos` só tem os produtos dos consumos; a partir de 2 letras procura-se também o resto do Catálogo no servidor (com o id, para a encomenda, e o custo)
  const org = catalogoParcial() ? orgDoCatalogoLido() : null;
  const srv = usePesquisaProdutos(org, { q }, { ativo: !!org && juntar && q.trim().length >= 2 });
  const doServidor: MatTarefa[] = org && q.trim().length >= 2
    ? srv.linhas.map((l) => ({ n: l.nome, q: 1, un: l.unidade ?? "un", produto: l.id, ...(l.custo ? { preco: l.custo } : {}), ...(l.fornecedor ? { forn: l.fornecedor } : {}) })) : [];
  const jaLidos = new Set(todos.map((c) => c.n));
  // o filtro pelo nome vale também para os do servidor: a pesquisa tem 0,3 s de atraso e o que ainda lá está é de um texto anterior
  const opcoes = [...todos, ...doServidor.filter((c) => !jaLidos.has(c.n))].filter((c) => !mats.some((m) => m.n === c.n) && (!q.trim() || sem(c.n).includes(sem(q.trim())))).slice(0, 12);
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
            {org && q.trim().length >= 2 && srv.aCarregar && <span role="status" className="text-sm text-muted-foreground">A procurar…</span>}
            {org && q.trim().length >= 2 && srv.erro && <span role="alert" className="text-sm text-destructive">Não foi possível procurar: {srv.erro}</span>}
            {!opcoes.length && !srv.aCarregar && !srv.erro && <span className="text-sm text-muted-foreground">Nada com esse nome.</span>}
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

/* ================================================================== a tarefa nova */
/** 11/11: `inicial` vem de tocar num dia vazio da linha de um técnico, no Estúdio do plano (começa nesse dia, com essa pessoa). */
export function NovaTarefa({ ctx, d, fechar, inicial, porque }: {
  ctx: Ctx; d: Negocio; fechar: () => void; inicial?: { dia?: number; tec?: string | null; fase?: number };
  /** 25/11 (Rúben: «no fim pede se foi o cliente ou imprevisto, e não deve: eu devia preencher logo direto»): com a obra em curso, o
   *  «Porquê?» (quem paga) vem no próprio formulário, no lugar do botão de juntar, com o impacto da tarefa como está escolhida. */
  porque?: (n: DadosTarefaNova) => ReactNode;
}) {
  const { S, A, run } = ctx;
  const p = d.obra.plano!;
  const [sid, setSid] = useState<SvcId | null>(null);
  const [procura, setProcura] = useState("");
  const [q, setQ] = useState(1);
  const [fase, setFase] = useState<number>(() => inicial?.fase ?? p.tasks.find((t) => t.fase)?.fase ?? 1);
  const [tec, setTec] = useState<string | null | undefined>(inicial?.tec ?? undefined);
  const [mats, setMats] = useState<MatTarefa[] | null>(null);
  const [delta, setDelta] = useState(0);
  // 24/11: uma tarefa interna (sem serviço do Catálogo, sem custo para o cliente): o seu próprio formulário
  const [interna, setInterna] = useState(false);
  const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const servicos = Object.entries(S.svc).filter(([, s]) => s.h > 0 && (!procura.trim() || sem(s.n + " " + s.perfil).includes(sem(procura.trim()))));
  const s = sid ? S.svc[sid] : null;

  // a pré-visualização da tarefa como fica (o início sugerido, o técnico livre), sem mexer no plano
  const min = diaMinimo(p, fase);
  const sugerido = s && sid ? criarTarefa(p, s, { sid, q, fase }).dia : 0;
  const dia = Math.max(min, (inicial?.dia ?? sugerido) + delta);
  const previa = s && sid ? criarTarefa(p, s, { sid, q, fase, tec, mats: mats ?? undefined, dia }) : null;
  const of = s ? oficioDe(s) : null;
  const tecs = of ? tecnicosDoOficio(of) : [];
  const escolherSvc = (k: SvcId) => {
    const sv = S.svc[k], un1 = POR_5.test(sv.un) ? 5 : 1;
    setSid(k); setQ(un1); setMats(null); setTec(inicial?.tec ?? undefined); setDelta(0);
    // a fase sugerida: a de outra tarefa do mesmo ofício, se houver
    const o2 = oficioDe(sv), igual = p.tasks.find((t) => (o2.perfilId ? t.perfilId === o2.perfilId || t.sk === o2.sk : t.sk === o2.sk) && t.fase);
    if (igual?.fase && !inicial?.fase) setFase(igual.fase);
  };
  const dados: DadosTarefaNova | null = useMemo(() => (sid && previa ? { sid, q, fase, tec: previa.tec, mats: previa.mats, dia } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sid, q, fase, previa?.tec, JSON.stringify(previa?.mats ?? null), dia]);
  const criar = () => {
    if (!dados) return;
    run(() => A.novaTarefaPlano(d.id, dados));
    fechar();
  };
  const tempo = s ? tempoDoServico(s, q) : null;
  // as áreas e os metros andam de 5 em 5; o resto, de 1 em 1
  const passoQ = s && POR_5.test(s.un) ? 5 : 1;
  const tecN = previa?.tec ? TECS.find((x) => x.id === previa.tec)?.n.split(" ")[0] : null;
  if (interna) return <TarefaInterna ctx={ctx} d={d} fechar={fechar} voltar={() => setInterna(false)} inicial={inicial} />;

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
            {/* 24/11: um trabalho que não é um serviço do Catálogo e não se cobra (uma tarefa interna): não muda o valor nem pede adenda */}
            <button type="button" onClick={() => setInterna(true)}
              className="mt-3 flex min-h-12 w-full items-center gap-3 rounded-xl border border-dashed border-input px-3 py-2 text-left transition-colors hover:border-primary">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted/70 text-muted-foreground"><Plus className="h-4 w-4" aria-hidden="true" /></span>
              <span className="min-w-0"><span className="block text-[15px] font-medium">Tarefa interna</span><span className="block text-sm text-muted-foreground">Sem serviço do Catálogo e sem custo para o cliente: não cria adenda</span></span>
            </button>
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
              <p className="text-[15px]">Técnico <span className="text-sm text-muted-foreground">· {of?.sk ?? ""}</span></p>
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

      {s && dados && porque && <div className="border-t border-border bg-card p-4 sm:px-5">{porque(dados)}</div>}
      {s && !porque && (
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

/** 24/11: a tarefa interna: o que é, as horas, a fase, quando começa e quem a faz. Entra já no plano (A.novaTarefaInterna). */
function TarefaInterna({ ctx, d, fechar, voltar, inicial }: { ctx: Ctx; d: Negocio; fechar: () => void; voltar: () => void; inicial?: { dia?: number; tec?: string | null; fase?: number } }) {
  const { A, run } = ctx;
  const p = d.obra.plano!;
  const [nome, setNome] = useState("");
  const [h, setH] = useState(4);
  const [fase, setFase] = useState<number>(() => inicial?.fase ?? p.tasks.find((t) => t.fase)?.fase ?? 1);
  const [tec, setTec] = useState<string | null>(inicial?.tec ?? null);
  const [delta, setDelta] = useState(0);
  const min = diaMinimo(p, fase);
  const sugerido = criarTarefaInterna(p, { nome: "x", h, fase }).dia;
  const dia = Math.max(min, (inicial?.dia ?? sugerido) + delta);
  const dur = Math.max(1, Math.ceil(h / 8 - 1e-9));
  const tecN = tec ? TECS.find((x) => x.id === tec)?.n.split(" ")[0] : null;
  const criar = () => {
    if (!nome.trim()) return;
    let ok = false;
    run(() => { ok = A.novaTarefaInterna(d.id, { nome, h, fase, tec, dia }) != null; });
    if (ok) fechar();
  };
  return (
    <section aria-label="Tarefa interna" className={cn(CARTAO, "mt-4 overflow-hidden animate-in fade-in-0 slide-in-from-top-2 duration-300")}>
      <header className="flex items-start justify-between gap-3 border-b border-border bg-primary/[0.04] p-4 sm:p-5">
        <div>
          <p className="text-lg font-semibold">Tarefa interna</p>
          <p className="text-[15px] text-muted-foreground">Sem custo para o cliente: não muda o valor do contrato nem cria adenda.</p>
        </div>
        <button type="button" onClick={fechar} aria-label="Fechar" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg hover:bg-muted"><X className="h-5 w-5" /></button>
      </header>
      <div className="space-y-5 p-4 sm:p-5">
        <label className="grid gap-1.5 text-[15px]">O que é
          <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Limpeza final da obra" maxLength={120}
            className="h-12 rounded-xl border border-input bg-background px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
        </label>
        <Linha rot="Horas de trabalho" sub={dias(dur)}>
          <Passo rot="Horas" valor={`${nfmt(h)} h`} desMenos={h <= 0.5} menos={() => setH(Math.max(0.5, h - (h > 1 ? 1 : 0.5)))} mais={() => setH(h + (h >= 1 ? 1 : 0.5))} />
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
          <p className="text-[15px]">Quem faz</p>
          <div role="group" aria-label="Técnico" className="mt-2 flex flex-wrap gap-2">
            {TECS.map((x) => {
              const k = diaDeFerias(x, p, dia, dur), on = tec === x.id;
              return (
                <button key={x.id} type="button" aria-pressed={on} onClick={() => setTec(x.id)}
                  className={cn("flex min-h-12 items-center gap-2 rounded-xl border px-3 py-1.5 text-left text-[15px] transition-colors", on ? "border-primary bg-primary/[0.06] ring-1 ring-primary" : "border-input hover:border-foreground/40")}>
                  <AvatarTec id={x.id} tam="h-8 w-8" />
                  <span>{x.n}<span className={cn("block text-sm", k == null ? "text-muted-foreground" : "text-warning")}>{k == null ? x.sk : `de férias a ${rotuloDia(p, k)}`}</span></span>
                </button>
              );
            })}
            <button type="button" aria-pressed={tec === null} onClick={() => setTec(null)} className={cn("min-h-12 rounded-xl border px-3 text-[15px]", tec === null ? "border-primary bg-primary/[0.06]" : "border-input text-muted-foreground hover:border-foreground/40")}>Sem técnico, por agora</button>
          </div>
        </div>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card p-4 sm:px-5">
        <button type="button" onClick={voltar} className="min-h-10 rounded-lg px-3 text-sm font-medium text-primary hover:bg-primary/[0.08]">Escolher um serviço do Catálogo</button>
        <Button size="lg" onClick={criar} disabled={!nome.trim()}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Juntar à fase {fase}{tecN ? ` e avisar ${tecN}` : ""}</Button>
      </footer>
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

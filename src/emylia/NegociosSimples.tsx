// A lista de Negócios na proposta simples: uma coluna por fase, cartões com
// três linhas (quem, o quê, o próximo passo). No telemóvel, uma fase de cada vez.
import { useState } from "react";
import { ArrowRight, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FASES, aberto, eur, proximo, tot, type Negocio } from "./motor";
import { IconeFase, type Ctx } from "./pecas";
import { FILTROS_TRABALHO } from "./filtrosTrabalho";
import { NegociosHistorico, SeletorModo, type ModoNegocios } from "./NegociosHistorico";
import { SEM_FILTROS_H, type FiltrosH } from "./historicoNegocios";

// 27/10: cada coluna mostra 10 cartões; o resto atrás de «Ver mais»
const POR_COLUNA = 10;
const FILTROS: [string, string][] = [["meus", "Os meus"], ["todos", "Todos"], ["atraso", "Com atraso"], ["wc", "Casa de banho"], ["coz", "Cozinha"]];

export function NegociosSimples({ S, A, go, run, q, setQ }: Ctx) {
  const f = S.filtro, ql = q.toLowerCase();
  let ds = aberto(S).filter((d) => !ql || (d.nome + " " + d.tel + " " + d.servico + " " + d.local).toLowerCase().includes(ql));
  if (f === "meus") ds = ds.filter((d) => d.dono === "comercial");
  if (f === "wc" || f === "coz") ds = ds.filter((d) => d.linha === f);
  if (f === "atraso") ds = ds.filter((d) => d.atraso);
  // 26/10: vindo do "Hoje" ("3 faturas por emitir"): só esses negócios (filtrosTrabalho.ts)
  const trabalho = FILTROS_TRABALHO[f];
  if (trabalho) ds = ds.filter(trabalho.vale);
  const emNeg = aberto(S).filter((d) => d.fase === 3 && d.orc).reduce((a, d) => a + tot(d, S).pf, 0);
  const [faseMovel, setFaseMovel] = useState(0);
  // 27/10: o quadro, a lista com todo o histórico ou o painel (NegociosHistorico.tsx); a escolha fica neste aparelho
  const [modo, setModoEstado] = useState<ModoNegocios>(lerModo);
  const setModo = (m: ModoNegocios): void => { setModoEstado(m); gravarModo(m); };
  const [filtrosH, setFiltrosH] = useState<FiltrosH>(SEM_FILTROS_H);
  const [colunaToda, setColunaToda] = useState<Record<number, boolean>>({});

  const cartao = (d: Negocio) => {
    const p = proximo(d, S), late = d.atraso && d.fase === 0;
    const loc = d.f.localidade || d.local.split(",").pop()!.trim();
    return (
      <li key={d.id}>
        <button type="button" onClick={go(() => A.abrir(d.id))}
          className={cn("group block w-full rounded-xl border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)]",
            d.fresh ? "border-primary motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200" : "border-border")}>
          <span className="block text-base font-semibold text-foreground">{d.nome}</span>
          <span className="mt-0.5 block text-sm text-muted-foreground">{d.servico}{loc ? " · " + loc : ""}{d.orc ? ` · ${eur(Math.round(tot(d, S).pf)).replace(/,00$/, "")} € sem IVA` : ""}</span>
          <span className={cn("mt-2 block text-sm font-medium", late ? "text-destructive" : p.wait || p.done ? "text-muted-foreground" : "text-primary")}>
            {p.t}{late ? " · há 2 dias" : ""}
            {!p.wait && !p.done && <ArrowRight className="ml-1 inline h-3.5 w-3.5 align-[-2px] transition-transform group-hover:translate-x-0.5" aria-hidden="true" />}
          </span>
        </button>
      </li>
    );
  };

  const coluna = (i: number) => {
    // Os atrasados primeiro (como no Hoje); o resto fica pela ordem de sempre.
    const cs = ds.filter((d) => d.fase === i).sort((a, b) => Number(!!b.atraso) - Number(!!a.atraso));
    return (
      <section key={i} aria-labelledby={`col-${i}`} className="min-w-0">
        <h2 id={`col-${i}`} className="flex items-center gap-2 px-1 text-[15px] font-semibold">
          <IconeFase fase={i} tam="sm" /><span className="flex-1">{FASES[i]}</span><span className="text-sm font-normal tabular-nums text-muted-foreground">{cs.length}</span>
        </h2>
        <ul className="mt-3 space-y-3">
          {i === 0 && S.novo && <NovoSimples S={S} A={A} run={run} />}
          {(colunaToda[i] ? cs : cs.slice(0, POR_COLUNA)).map(cartao)}
          {!cs.length && !(i === 0 && S.novo) && <li className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">Nenhum</li>}
        </ul>
        {cs.length > POR_COLUNA && (
          <Button variant="ghost" className="mt-2 min-h-11 w-full text-[15px]" aria-expanded={!!colunaToda[i]} onClick={() => setColunaToda((x) => ({ ...x, [i]: !x[i] }))}>
            {colunaToda[i] ? "Ver menos" : `Ver mais (${cs.length - POR_COLUNA})`}
          </Button>
        )}
      </section>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pb-24 pt-6 sm:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Negócios</h1>
          <p className="mt-1 text-base text-muted-foreground">{aberto(S).length} abertos · {eur(emNeg)} € em proposta</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SeletorModo modo={modo} mudar={setModo} />
          <Button size="lg" onClick={go(() => { A.novo(); setFaseMovel(0); setModo("quadro"); })}><Plus className="mr-2 h-4 w-4" />Novo negócio</Button>
        </div>
      </header>

      {modo !== "quadro" ? <NegociosHistorico S={S} A={A} go={go} run={run} q={q} setQ={setQ} modo={modo} setModo={setModo} filtros={filtrosH} setFiltros={setFiltrosH} /> : <>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <label className="relative w-full sm:w-96">
          <span className="sr-only">Procurar</span>
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input type="search" placeholder="Procurar nome, telefone ou serviço" value={q} onChange={(e) => setQ?.(e.target.value)}
            className="h-11 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Mostrar">
          {trabalho && (
            <button type="button" aria-pressed="true" onClick={go(() => A.filtro("todos"))} aria-label={`${trabalho.t}: tirar o filtro`}
              className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-primary bg-primary/10 px-4 text-[15px] font-medium text-primary">
              {trabalho.t}<span aria-hidden="true">×</span>
            </button>
          )}
          {FILTROS.map(([k, l]) => (
            <button key={k} type="button" aria-pressed={f === k} onClick={go(() => A.filtro(k))}
              className={cn("min-h-10 shrink-0 rounded-full border px-4 text-[15px] transition-colors", f === k ? "border-primary bg-primary/10 font-medium text-primary" : "border-input bg-card hover:border-foreground/40")}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Telemóvel: escolhe-se a fase */}
      <div className="mt-6 lg:hidden">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,#000_calc(100%-2rem),transparent)]" role="tablist" aria-label="Fase">
          {FASES.map((fn, i) => (
            <button key={fn} type="button" role="tab" aria-selected={faseMovel === i} onClick={() => setFaseMovel(i)}
              className={cn("min-h-10 shrink-0 rounded-lg px-3 text-[15px]", faseMovel === i ? "bg-foreground text-background" : "bg-muted text-foreground")}>
              {fn} <span className="tabular-nums opacity-70">{ds.filter((d) => d.fase === i).length}</span>
            </button>
          ))}
        </div>
        <div className="mt-4">{coluna(faseMovel)}</div>
      </div>

      {/* 26/10: um filtro do "Hoje" sem negócios: diz qual é e como ver todos, em vez de seis colunas a dizer "Nenhum" */}
      {trabalho && !ds.length && (
        <div role="status" className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 text-[15px]">
          <span>Não há {trabalho.t.charAt(0).toLowerCase() + trabalho.t.slice(1)}.</span>
          <Button variant="outline" className="min-h-10" onClick={go(() => A.filtro("todos"))}>Ver todos os negócios</Button>
        </div>
      )}
      {/* Computador: as seis fases lado a lado */}
      <div className="mt-8 hidden gap-5 lg:grid lg:grid-cols-6">{FASES.map((_, i) => coluna(i))}</div>
      </>}
    </div>
  );
}

const CHAVE_MODO = "emylia-negocios-modo";
function lerModo(): ModoNegocios {
  try { const m = localStorage.getItem(CHAVE_MODO); return m === "lista" || m === "painel" ? m : "quadro"; } catch { return "quadro"; }
}
function gravarModo(m: ModoNegocios): void {
  try { localStorage.setItem(CHAVE_MODO, m); } catch { /* sem storage: vale só nesta sessão */ }
}

function NovoSimples({ S, A, run }: Pick<Ctx, "S" | "A" | "run">) {
  const [nome, setNome] = useState(S.novo!.nome);
  const [tel, setTel] = useState(S.novo!.tel);
  // 27/10: sem a linha: ao telefone ainda não se sabe o que o cliente quer; sai da divisão escolhida na visita
  const criar = () => run(() => A.novoCriar(nome, tel));
  const inp = "h-11 w-full rounded-lg border border-input bg-background px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25";
  return (
    <li className="rounded-xl border-2 border-primary bg-card p-4 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
      <form className="grid min-w-0 gap-3" onSubmit={(e) => { e.preventDefault(); criar(); }} onKeyDown={(e) => { if (e.key === "Escape") run(() => A.novoCancel()); }}>
        <label className="grid gap-1.5 text-sm font-medium">Nome<input autoFocus autoComplete="off" value={nome} onChange={(e) => setNome(e.target.value)} className={inp} /></label>
        <label className="grid gap-1.5 text-sm font-medium">Telefone ou email<input autoComplete="off" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} className={inp} /></label>
        {S.novo!.err && <p className="text-sm font-medium text-destructive" role="alert">{S.novo!.err}</p>}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => run(() => A.novoCancel())}>Cancelar</Button>
          <Button type="submit" className="flex-1">Criar</Button>
        </div>
      </form>
    </li>
  );
}

// Os campos de uma fase, com o aspeto da Olyvia: um passo de cada vez.
// O passo aberto mostra os campos e acende o próximo por preencher; quando
// os campos do passo ficam todos preenchidos, abre sozinho o passo seguinte.
import { useEffect, useRef, type ReactNode } from "react";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PAPEL_ROT, contagem, visivel, type Def, type Grupo, type Papel } from "./campos";
import type { Negocio } from "./motor";
import type { Ctx } from "./pecas";

export const INPUT =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/20";

const COR_PAPEL: Record<Papel, string> = { plano: "bg-primary", sugestoes: "bg-warning", orcamento: "bg-success", fatura: "bg-info" };

export function Marca({ papel }: { papel?: Papel }) {
  if (!papel) return null;
  return <i className={cn("ml-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle", COR_PAPEL[papel])} title={PAPEL_ROT[papel]} aria-label={PAPEL_ROT[papel]} />;
}

export function Legenda() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      {(Object.keys(PAPEL_ROT) as Papel[]).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5"><i className={cn("h-1.5 w-1.5 rounded-full", COR_PAPEL[k])} />{PAPEL_ROT[k]}</span>
      ))}
    </div>
  );
}

export function mostra(c: Def, v: string): string {
  if (!v) return "—";
  if (c.t === "data") { const [y, m, dd] = v.split("-"); return dd ? `${dd}/${m}/${y}` : v; }
  if (c.t === "numero") return v.replace(".", ",") + (c.un ? " " + c.un : "");
  return v;
}

type FxProps = { d: Negocio; A: Ctx["A"]; run: Ctx["run"]; ro?: boolean };

/** O primeiro campo visível e vazio de um grupo: é o que acende. */
export function proximoVazio(g: Grupo, f: Record<string, string>): string | null {
  const c = g.campos.find((x) => visivel(x, f) && !f[x.k]);
  return c ? c.k : null;
}

export function Campos({ grupo, d, A, run, ro, cols = 3 }: FxProps & { grupo: Grupo; cols?: 2 | 3 }) {
  const seguinte = ro ? null : proximoVazio(grupo, d.f);
  return (
    <div className={cn("grid gap-x-4 gap-y-3", cols === 3 ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2")}>
      {grupo.campos.filter((c) => visivel(c, d.f)).map((c) => (
        <CampoT key={c.k} c={c} d={d} A={A} run={run} ro={ro} seguinte={c.k === seguinte} />
      ))}
    </div>
  );
}

function CampoT({ c, d, A, run, ro, seguinte }: FxProps & { c: Def; seguinte: boolean }) {
  const val = d.f[c.k] || "";
  // o cursor vai sozinho para o próximo campo de escrever, se ninguém estiver a escrever noutro
  useEffect(() => {
    if (!seguinte || ro || !["texto", "numero", "texto_longo"].includes(c.t)) return;
    const t = setTimeout(() => {
      const ativo = document.activeElement;
      if (ativo && ativo !== document.body && ["INPUT", "TEXTAREA", "SELECT"].includes(ativo.tagName)) return;
      (document.getElementById(`fx-${c.k}-${d.id}`) as HTMLInputElement | null)?.focus({ preventScroll: true });
    }, 350);
    return () => clearTimeout(t);
  }, [seguinte, ro, c.t, c.k, d.id]);
  const id = `fx-${c.k}-${d.id}`;
  const set = (x: string) => run(() => A.campo(d.id, c.k, x));
  const largo = c.t === "texto_longo";
  const caixa = cn(
    "relative grid content-start gap-1.5 rounded-xl transition-all duration-300 animate-in fade-in-0",
    largo && "sm:col-span-full",
    seguinte && "rounded-lg bg-primary/[0.04] ring-2 ring-primary/40 ring-offset-[6px] ring-offset-card",
  );
  const rotulo = (
    <span className="flex items-center text-xs font-medium text-muted-foreground">
      {c.l}<Marca papel={c.papel} />
      {seguinte && <span className="ml-auto rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-primary-foreground animate-in zoom-in-50">a seguir</span>}
    </span>
  );
  if (ro) return <div className={caixa}>{rotulo}<span className="text-sm font-medium text-foreground">{mostra(c, val)}</span></div>;

  let ctl: ReactNode;
  let botoes = false;
  if (c.t === "sim_nao" || c.t === "escolha") {
    const op = c.t === "sim_nao" ? ["Sim", "Não"] : c.op!;
    botoes = op.length <= 3 && op.join("").length <= 30;
    ctl = botoes ? (
      <div className="inline-flex w-fit flex-wrap gap-0.5 rounded-lg border border-input bg-background p-0.5" role="group" aria-label={c.l}>
        {op.map((x) => (
          <button key={x} type="button" aria-pressed={val === x} onClick={() => set(val === x ? "" : x)}
            className={cn("rounded-md px-2.5 py-1 text-sm transition-all duration-200",
              val === x ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
            {x}
          </button>
        ))}
      </div>
    ) : (
      <select id={id} value={val} onChange={(e) => set(e.target.value)} className={INPUT}>
        <option value="">—</option>{op.map((x) => <option key={x}>{x}</option>)}
      </select>
    );
  } else if (c.t === "numero") {
    ctl = (
      <span className="flex items-center gap-2">
        <input key={id + val} id={id} type="number" min="0" step="any" defaultValue={val} className={INPUT}
          onBlur={(e) => { if (e.target.value !== val) set(e.target.value); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        {c.un && <em className="whitespace-nowrap text-xs not-italic text-muted-foreground">{c.un}</em>}
      </span>
    );
  } else if (c.t === "data") {
    ctl = <input id={id} type="date" value={val} onChange={(e) => set(e.target.value)} className={INPUT} />;
  } else if (c.t === "texto_longo") {
    ctl = <textarea key={id + val} id={id} rows={2} defaultValue={val} placeholder={c.ph} className={cn(INPUT, "h-auto resize-y py-2")}
      onBlur={(e) => { if (e.target.value !== val) set(e.target.value); }} />;
  } else {
    ctl = <input key={id + val} id={id} defaultValue={val} placeholder={c.ph} className={INPUT}
      onBlur={(e) => { if (e.target.value !== val) set(e.target.value); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />;
  }
  const ajuda = c.ajuda && <small className="text-[11px] text-muted-foreground">{c.ajuda}</small>;
  // os botões de escolha não vão dentro de um <label>: um clique no rótulo carregava no primeiro
  if (botoes) return <div className={caixa}>{rotulo}{ctl}{ajuda}</div>;
  return <label htmlFor={id} className={caixa}>{rotulo}{ctl}{ajuda}</label>;
}

/** Resumo de um grupo em pastilhas: os primeiros valores preenchidos. */
export function resumoGrupos(gs: Grupo[], f: Record<string, string>, n = 4): string[] {
  const r: string[] = [];
  for (const g of gs) for (const c of g.campos) {
    if (r.length >= n) return r;
    const v = f[c.k];
    if (!v || !visivel(c, f)) continue;
    r.push(c.t === "sim_nao" ? (v === "Sim" ? c.l : "Sem " + c.l.toLowerCase()) : mostra(c, v));
  }
  return r;
}

export interface Passo {
  id: string;
  titulo: string;
  icone: LucideIcon;
  /** Campos preenchidos e total; sem campos, o passo conta como feito quando `feito`. */
  conta?: { f: number; n: number };
  feito?: boolean;
  resumo: string[];
  corpo: ReactNode;
}

export const passoDeGrupo = (g: Grupo, icone: LucideIcon, corpo: ReactNode, f: Record<string, string>): Passo => ({
  id: g.titulo, titulo: g.titulo, icone, conta: contagem([g], f), resumo: resumoGrupos([g], f), corpo,
});

const completo = (p: Passo) => (p.conta ? p.conta.n > 0 && p.conta.f >= p.conta.n : !!p.feito);

/**
 * Os passos de uma fase, em acordeão. Só um está aberto; os outros mostram
 * o resumo. Quando o aberto fica completo, passa sozinho ao seguinte.
 */
export function Assistente({ passos, ativo, setAtivo, fim }: { passos: Passo[]; ativo: number; setAtivo: (i: number) => void; fim: ReactNode }) {
  const antes = useRef<{ i: number; ok: boolean }>({ i: ativo, ok: passos[ativo] ? completo(passos[ativo]) : false });
  const caixa = useRef<HTMLDivElement>(null);
  const atual = passos[ativo];
  const okAgora = atual ? completo(atual) : false;

  useEffect(() => {
    const a = antes.current;
    antes.current = { i: ativo, ok: okAgora };
    if (a.i === ativo && !a.ok && okAgora && ativo < passos.length) {
      const t = setTimeout(() => setAtivo(ativo + 1), 650);
      return () => clearTimeout(t);
    }
  }, [ativo, okAgora, passos.length, setAtivo]);

  // ao mudar de passo (não ao abrir a página), traz o passo aberto para a vista
  const montado = useRef(false);
  useEffect(() => {
    if (!montado.current) { montado.current = true; return; }
    const el = caixa.current?.querySelector<HTMLElement>(`[data-passo="${ativo}"]`);
    if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "nearest" }), 320);
  }, [ativo]);

  return (
    <div ref={caixa} className="space-y-2">
      {passos.map((p, i) => {
        const aberto = i === ativo, ok = completo(p);
        const Icone = p.icone;
        return (
          <div key={p.id} id={p.id} data-passo={i}
            className={cn("overflow-hidden rounded-xl border transition-all duration-300",
              aberto ? "border-primary/40 bg-card shadow-[var(--shadow-md)]" : "border-border/70 bg-card hover:border-primary/30")}>
            <button type="button" onClick={() => setAtivo(aberto ? -1 : i)} aria-expanded={aberto}
              className="flex w-full items-center gap-3 px-4 py-3 text-left">
              <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-all duration-300",
                ok ? "bg-success/15 text-success" : aberto ? "bg-primary text-primary-foreground shadow-md" : "bg-muted text-muted-foreground")}>
                {ok && !aberto ? <Check className="h-4 w-4 animate-in zoom-in-50" /> : <Icone className="h-4 w-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  {p.titulo}
                  {p.conta && <span className={cn("font-mono text-xs tabular-nums", ok ? "text-success" : "text-muted-foreground")}>{p.conta.f}/{p.conta.n}</span>}
                </span>
                {!aberto && p.resumo.length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {p.resumo.map((r) => <span key={r} className="truncate rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{r}</span>)}
                  </span>
                )}
              </span>
              {p.conta && (
                <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-muted sm:block" aria-hidden="true">
                  <span className={cn("block h-full rounded-full transition-all duration-500", ok ? "bg-success" : "bg-primary")} style={{ width: `${p.conta.n ? (p.conta.f / p.conta.n) * 100 : 0}%` }} />
                </span>
              )}
              <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300", aberto && "rotate-180")} />
            </button>
            <div className={cn("grid transition-[grid-template-rows] duration-300 ease-out", aberto ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
              <div className="min-h-0 overflow-hidden">
                {aberto && (
                  <div className="space-y-4 border-t border-border/60 px-4 pb-4 pt-4 animate-in fade-in-0 slide-in-from-top-2 duration-300">
                    {p.corpo}
                    <div className="flex items-center justify-end gap-2">
                      {i < passos.length - 1
                        ? <button type="button" onClick={() => setAtivo(i + 1)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-primary transition hover:bg-primary/10">
                          {ok ? "Seguinte" : "Saltar por agora"} →
                        </button>
                        : <button type="button" onClick={() => setAtivo(passos.length)} className="rounded-lg px-3 py-1.5 text-sm font-medium text-primary transition hover:bg-primary/10">Concluir →</button>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
      {ativo >= passos.length && <div className="animate-in fade-in-0 slide-in-from-bottom-3 duration-500">{fim}</div>}
    </div>
  );
}

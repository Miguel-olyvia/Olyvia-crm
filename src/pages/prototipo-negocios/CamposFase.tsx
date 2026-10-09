// Os campos de uma fase, com o aspeto da Olyvia: um passo de cada vez.
// O passo aberto mostra os campos e acende o próximo por preencher; quando
// os campos do passo ficam todos preenchidos, abre sozinho o passo seguinte.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle, Building2, Car, Check, ChevronDown, HardHat, Home, Minus, Plug, Plus, Ruler, ShieldAlert, Sparkles, Zap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { PAPEL_ROT, contagem, obrigatorio, visivel, type Def, type Grupo, type Papel } from "./campos";
import type { Negocio } from "./motor";
import { Chip, type Ctx } from "./pecas";

export const INPUT =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/20";

/** Campo da proposta simples: maior, com mais contraste. */
export const INPUT_G =
  "h-11 w-full min-w-0 rounded-lg border border-input bg-card px-3.5 text-[15px] text-foreground outline-none transition placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25";

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
  if (c.t === "contador" && v === "0" && c.zero) return c.zero;
  if (c.t === "numero" || c.t === "contador") return v.replace(".", ",") + (c.un ? " " + c.un : "");
  return v;
}

type FxProps = { d: Negocio; A: Ctx["A"]; run: Ctx["run"]; ro?: boolean; simples?: boolean };

/** O primeiro campo visível e vazio de um grupo: é o que acende. */
export function proximoVazio(g: Grupo, f: Record<string, string>): string | null {
  const c = g.campos.find((x) => visivel(x, f) && !f[x.k]);
  return c ? c.k : null;
}

// O ícone e a cor de cada bloco dos formulários (ajuda a encontrar o sítio de relance).
const BLOCO: Record<string, [LucideIcon, string]> = {
  "Acesso e estacionamento": [Car, "bg-sky-100 text-sky-700"], "O prédio": [Building2, "bg-indigo-100 text-indigo-700"],
  "A casa": [Home, "bg-amber-100 text-amber-800"], "Instalações": [Zap, "bg-yellow-100 text-yellow-800"],
  "Durante a obra": [ShieldAlert, "bg-rose-100 text-rose-700"], "A divisão": [Ruler, "bg-violet-100 text-violet-700"],
  "Instalações da divisão": [Plug, "bg-teal-100 text-teal-700"], "Trabalho e proteções": [HardHat, "bg-orange-100 text-orange-700"],
};

/** Está a validar este grupo (tentou passar de fase com campos em falta)? */
export const aValidar = (d: Negocio, id: string) => !!d.valida && d.valida.fase === d.fase && d.valida.grupos.includes(id);

export function Campos({ grupo, d, A, run, ro, simples, cols = 3 }: FxProps & { grupo: Grupo; cols?: 2 | 3 }) {
  const seguinte = ro ? null : proximoVazio(grupo, d.f);
  const validar = !ro && aValidar(d, grupo.titulo);
  const visiveis = grupo.campos.filter((c) => visivel(c, d.f));
  const campo = (c: Def) => (
    <CampoT key={c.k} c={c} d={d} A={A} run={run} ro={ro} simples={simples} seguinte={c.k === seguinte} erro={validar && obrigatorio(c) && !d.f[c.k]} />
  );

  // Proposta simples: perguntas em linhas (pergunta à esquerda, resposta à direita),
  // partidas em blocos com título, para o formulário não ser uma coluna corrida.
  if (simples && !ro) {
    const blocos: [string, Def[]][] = [];
    for (const c of visiveis) {
      const b = c.bloco || "", ult = blocos[blocos.length - 1];
      if (ult && ult[0] === b) ult[1].push(c); else blocos.push([b, [c]]);
    }
    return (
      <div className="space-y-8">
        {blocos.map(([b, cs]) => {
          const ob = cs.filter(obrigatorio), feitos = ob.filter((c) => d.f[c.k]).length;
          const sug = cs.filter((c) => d.sug?.[c.k] && d.f[c.k]).map((c) => c.k);
          return (
            <section key={b || "_"} aria-label={b || undefined}>
              {b && (
                <div className="mb-3 flex items-center gap-3">
                  {BLOCO[b] && <Chip icone={BLOCO[b][0]} cor={BLOCO[b][1]} />}
                  <h3 className="flex-1 text-base font-semibold text-foreground">{b}</h3>
                  {ob.length > 0 && <span className={cn("text-sm tabular-nums", feitos === ob.length ? "text-success" : "text-muted-foreground")}>{feitos === ob.length ? "Completo" : `${feitos} de ${ob.length}`}</span>}
                </div>
              )}
              {sug.length > 0 && (
                <div className="mb-1 mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm animate-in fade-in-0">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Sparkles className="h-4 w-4" aria-hidden="true" />A Olyvia preencheu {sug.length} {sug.length === 1 ? "resposta" : "respostas"} a partir de outras. Veja se estão certas.</span>
                  <button type="button" onClick={() => run(() => A.confirmar(d.id, sug))} className="min-h-9 rounded-lg px-2 font-medium text-primary underline-offset-4 hover:underline">Estão certas</button>
                </div>
              )}
              <div className="divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-sm)] sm:px-5">{cs.map(campo)}</div>
            </section>
          );
        })}
      </div>
    );
  }
  return (
    <div className={cn(simples ? "grid gap-x-8 gap-y-4 sm:grid-cols-2" : cn("grid gap-x-4 gap-y-3", cols === 3 ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2"))}>
      {visiveis.map(campo)}
    </div>
  );
}

function CampoT({ c, d, A, run, ro, simples, seguinte, erro }: FxProps & { c: Def; seguinte: boolean; erro?: boolean }) {
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
  if (simples) return <CampoSimples c={c} val={val} id={id} set={set} ro={ro} erro={erro} seguinte={seguinte} sugerido={!!d.sug?.[c.k]} />;
  const largo = c.t === "texto_longo";
  const caixa = cn(
    "relative grid content-start gap-1.5 rounded-xl transition-all duration-300 animate-in fade-in-0",
    largo && "sm:col-span-full",
    seguinte && !erro && "rounded-lg bg-primary/[0.04] ring-2 ring-primary/40 ring-offset-[6px] ring-offset-card",
    erro && "rounded-lg bg-destructive/[0.05] ring-2 ring-destructive/60 ring-offset-[6px] ring-offset-card",
  );
  const rotulo = (
    <span id={id + "-rot"} className="flex items-center text-xs font-medium text-muted-foreground">
      {c.l}<Marca papel={c.papel} />
      {erro && <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-destructive"><AlertCircle className="h-3.5 w-3.5" />Falta preencher</span>}
      {seguinte && !erro && <span className="ml-auto rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-primary-foreground animate-in zoom-in-50">a seguir</span>}
    </span>
  );
  if (ro) return <div className={caixa}>{rotulo}<span className="text-sm font-medium text-foreground">{mostra(c, val)}</span></div>;

  if (c.t === "contador") return <div className={caixa}>{rotulo}<Contador c={c} val={val} set={set} rot={id + "-rot"} erro={erro} /></div>;
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
  /** Campos em falta, depois de tentar passar de fase. */
  falta?: number;
  resumo: string[];
  corpo: ReactNode;
}

export const passoDeGrupo = (g: Grupo, icone: LucideIcon, corpo: ReactNode, f: Record<string, string>): Passo => ({
  id: g.titulo, titulo: g.titulo, icone, conta: contagem([g], f), resumo: resumoGrupos([g], f), corpo,
});

const completo = (p: Passo) => (p.conta ? p.conta.f >= p.conta.n : !!p.feito);

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
                  {!!p.falta && <span className="inline-flex items-center gap-1 text-xs font-semibold text-destructive"><AlertCircle className="h-3.5 w-3.5" />falta{p.falta > 1 ? "m" : ""} {p.falta}</span>}
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

/* ------------------------------------------------------------------ proposta simples */
// Cada pergunta é uma linha: a pergunta à esquerda e a resposta à direita.
// No telemóvel, a resposta passa para baixo da pergunta.
function CampoSimples({ c, val, id, set, ro, erro, seguinte, sugerido }: { c: Def; val: string; id: string; set: (x: string) => void; ro?: boolean; erro?: boolean; seguinte?: boolean; sugerido?: boolean }) {
  if (ro) return (
    <div className="grid gap-0.5">
      <span className="text-sm text-muted-foreground">{c.l}</span>
      <span className="text-[15px] font-medium text-foreground">{mostra(c, val)}</span>
    </div>
  );
  const rot = id + "-rot", desc = [c.ajuda ? id + "-ajuda" : "", erro ? id + "-erro" : ""].filter(Boolean).join(" ") || undefined;
  const borda = erro ? "border-destructive ring-1 ring-destructive/40" : "";
  let ctl: ReactNode;
  // largo: a resposta vai para baixo da pergunta (muitas opções ou texto longo)
  let largo = false, comLabel = false;
  if (c.t === "sim_nao" || c.t === "escolha") {
    // escolher é mais rápido do que escrever: botões sempre, nunca uma lista que abre
    const op = c.t === "sim_nao" ? ["Sim", "Não"] : c.op!;
    largo = op.length > 3 || op.join("").length > 34;
    ctl = <Botoes op={op} val={val} set={set} rot={rot} desc={desc} erro={erro} largo={largo} />;
  } else if (c.t === "contador") {
    ctl = <Contador c={c} val={val} set={set} rot={rot} desc={desc} erro={erro} />;
  } else if (c.t === "data") {
    ctl = <DataRapida c={c} id={id} val={val} set={set} rot={rot} desc={desc} erro={erro} />;
  } else {
    comLabel = true;
    const comum = {
      id, placeholder: c.ph, "aria-describedby": desc, "aria-invalid": erro || undefined,
      onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => { if (e.target.value !== val) set(e.target.value); },
    };
    if (c.t === "texto_longo") { largo = true; ctl = <textarea key={id + val} rows={3} defaultValue={val} className={cn(INPUT_G, "h-auto resize-y py-2.5", borda)} {...comum} />; }
    else ctl = (
      <span className="flex items-center gap-3 sm:justify-end">
        <input key={id + val} type={c.t === "numero" ? "number" : "text"} inputMode={c.t === "numero" ? "decimal" : undefined} min={c.t === "numero" ? 0 : undefined} step="any"
          defaultValue={val} className={cn(INPUT_G, c.t === "numero" ? "w-32 text-right" : "sm:w-72", borda)} {...comum}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        {c.un && <span className="w-10 text-[15px] text-muted-foreground">{c.un}</span>}
      </span>
    );
  }
  const Rot = comLabel ? "label" : "span";
  return (
    <div className={cn("grid gap-3 py-4 transition-colors duration-300", !largo && "sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6",
      erro ? "-mx-3 rounded-lg bg-destructive/[0.05] px-3" : seguinte ? "-mx-3 rounded-lg bg-primary/[0.04] px-3" : "")}>
      <div className="min-w-0">
        <Rot id={rot} {...(Rot === "label" ? { htmlFor: id } : {})} className="text-[15px] font-medium text-foreground">
          {c.l}{!obrigatorio(c) && <span className="font-normal text-muted-foreground"> (opcional)</span>}
        </Rot>
        {sugerido && <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 align-middle text-xs text-muted-foreground" title="Preenchido pela Olyvia a partir de outras respostas. Confirme ou mude."><Sparkles className="h-3 w-3" aria-hidden="true" />Sugerido</span>}
        {c.ajuda && <p id={id + "-ajuda"} className="mt-0.5 text-sm text-muted-foreground">{c.ajuda}</p>}
        {erro && <p id={id + "-erro"} className="mt-1 flex items-center gap-1.5 text-sm font-medium text-destructive animate-in fade-in-0"><AlertCircle className="h-4 w-4" aria-hidden="true" />Falta preencher</p>}
      </div>
      {ctl}
    </div>
  );
}

type Ctl = { val: string; set: (x: string) => void; rot: string; desc?: string; erro?: boolean };

function Botoes({ op, val, set, rot, desc, erro, largo }: Ctl & { op: string[]; largo?: boolean }) {
  return (
    <div role="group" aria-labelledby={rot} aria-describedby={desc} className={cn("flex flex-wrap gap-2", !largo && "sm:justify-end")}>
      {op.map((x) => (
        <button key={x} type="button" aria-pressed={val === x} aria-invalid={erro || undefined} onClick={() => set(val === x ? "" : x)}
          className={cn("min-h-11 min-w-14 rounded-lg border px-4 text-[15px] transition-colors duration-150",
            val === x ? "border-primary bg-primary text-primary-foreground" : cn("bg-card text-foreground hover:border-foreground/40", erro ? "border-destructive" : "border-input"))}>
          {x}
        </button>
      ))}
    </div>
  );
}

// Contar sem escrever: − e +. O primeiro + dá 1; o primeiro − dá o mínimo (ex.: andar 0 = R/C).
function Contador({ c, val, set, rot, desc, erro }: Ctl & { c: Def }) {
  const min = c.min ?? 0, max = c.max ?? 99;
  const n = val === "" ? null : Number(val);
  const txt = n === null ? "—" : n === 0 && c.zero ? c.zero : String(n);
  const btn = "grid h-11 w-11 place-items-center rounded-lg text-xl text-foreground transition-colors hover:bg-muted disabled:opacity-30";
  return (
    <div className="flex items-center gap-3 sm:justify-end">
      <div role="group" aria-labelledby={rot} aria-describedby={desc}
        className={cn("inline-flex items-center rounded-lg border bg-card p-0.5", erro ? "border-destructive" : "border-input")}>
        <button type="button" className={btn} aria-label="Menos" disabled={n !== null && n <= min} onClick={() => set(String(n === null ? min : Math.max(min, n - 1)))}><Minus className="h-4 w-4" /></button>
        <output aria-live="polite" className="w-14 text-center text-[17px] font-medium tabular-nums">{txt}</output>
        <button type="button" className={btn} aria-label="Mais" disabled={n !== null && n >= max} onClick={() => set(String(n === null ? Math.max(min, 1) : Math.min(max, n + 1)))}><Plus className="h-4 w-4" /></button>
      </div>
      {c.un && <span className="text-[15px] text-muted-foreground">{c.un}</span>}
    </div>
  );
}

// Datas: os dias mais usados num toque; outra data só quando é preciso.
const iso = (dt: Date) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
function DataRapida({ c, id, val, set, rot, desc, erro }: Ctl & { c: Def; id: string }) {
  const hoje = new Date();
  const dia = (n: number) => { const x = new Date(hoje); x.setDate(x.getDate() + n); return iso(x); };
  const passado = ["data_pag", "vistoria"].includes(c.k);
  const op: [string, string][] = passado
    ? [["Hoje", dia(0)], ["Ontem", dia(-1)], ["Há 2 dias", dia(-2)]]
    : [["Hoje", dia(0)], ["Amanhã", dia(1)], ["Daqui a 1 semana", dia(7)]];
  const [outra, setOutra] = useState(!!val && !op.some(([, v]) => v === val));
  return (
    <div className="grid gap-2 sm:justify-items-end">
      <div role="group" aria-labelledby={rot} aria-describedby={desc} className="flex flex-wrap gap-2 sm:justify-end">
        {op.map(([l, v]) => (
          <button key={l} type="button" aria-pressed={val === v && !outra} onClick={() => { setOutra(false); set(val === v ? "" : v); }}
            className={cn("min-h-11 rounded-lg border px-4 text-[15px] transition-colors",
              val === v && !outra ? "border-primary bg-primary text-primary-foreground" : cn("bg-card hover:border-foreground/40", erro ? "border-destructive" : "border-input"))}>
            {l}
          </button>
        ))}
        <button type="button" aria-pressed={outra} onClick={() => setOutra(!outra)}
          className={cn("min-h-11 rounded-lg border px-4 text-[15px] transition-colors", outra ? "border-primary text-primary" : "border-input bg-card hover:border-foreground/40")}>
          Outra data
        </button>
      </div>
      {outra && <input id={id} type="date" value={val} onChange={(e) => set(e.target.value)} aria-labelledby={rot} className={cn(INPUT_G, "w-52 animate-in fade-in-0")} />}
      {val && <span className="text-sm text-muted-foreground">{mostra(c, val)}</span>}
    </div>
  );
}

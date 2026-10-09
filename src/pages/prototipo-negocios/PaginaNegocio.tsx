// Página do negócio (09/10/2026): só a fase atual está aberta, um passo de
// cada vez. As fases feitas ficam num resumo; as seguintes aparecem quando
// chega a vez delas. Ao mudar de fase, a nova entra animada.
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft, ArrowRight, Building2, CalendarClock, Camera, Check, ChevronDown, ClipboardList, Euro, FileSignature, FileText, Hammer,
  Home, Lock, MapPin, Phone, Ruler, Sparkles, Target, User, Wrench, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  FASES, LINHAS, PAPEIS, SLOTS,
  alertas, bloqueado, conflitos, custoUn, eur, fatorReal, linhaCalc, nfmt, partes, pct, proximo, r2, tot,
  type Estado, type MedKey, type Negocio, type Papel, type SvcId,
} from "./motor";
import { AREA, CONTACTO, ESCOLHAS, EXTERIOR, FINANCEIRO, INTERIOR, LEAD, OBRA, PROPOSTA, contagem, emFalta, type Grupo } from "./campos";
import { UsarLocalizacao } from "./Localizacao";
import { ServicosCatalogo, orcLinhas } from "./ServicosCatalogo";
import { Assistente, Campos, INPUT, INPUT_G, Legenda, aValidar, passoDeGrupo, resumoGrupos, type Passo } from "./CamposFase";
import { Btn, Campo, fazer, numero, type Ctx } from "./pecas";

const ICONE_FASE: LucideIcon[] = [Target, Phone, Ruler, FileSignature, Euro, Hammer];
const GRUPOS_FASE: Grupo[][] = [LEAD, CONTACTO, [EXTERIOR, INTERIOR, AREA, ESCOLHAS], PROPOSTA, FINANCEIRO, OBRA];
const QUANDO_ABRE = ["", "abre quando a chamada for registada", "abre quando a visita for marcada", "abre quando o levantamento fechar", "abre quando o contrato for assinado", "abre quando o pagamento for validado"];

export function PaginaNegocio(ctx: Ctx) {
  const { S, A, go } = ctx;
  const d = S.deals.find((x) => x.id === S.deal)!;
  const p = proximo(d, S), L = LINHAS[d.linha], o = d.orc;
  const T = o ? tot(d, S) : null;
  const cli = S.clientes.find((c) => c.deal === d.id);
  const [abertaFeita, setAbertaFeita] = useState<number | null>(null);
  const atualRef = useRef<HTMLDivElement>(null);
  const faseAntes = useRef(d.fase);

  // ao mudar de fase, desce até à fase nova
  useEffect(() => {
    if (faseAntes.current !== d.fase) {
      faseAntes.current = d.fase;
      setTimeout(() => atualRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    }
  }, [d.fase]);

  const titulo = d.servico + (d.local ? " · " + d.local.split(",").pop()!.trim() : "");
  const progresso = d.perdido ? 0 : Math.min(1, d.fase / (FASES.length - 1));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 pb-16 pt-4 sm:px-6 sm:pt-6">
      <button type="button" onClick={go(() => A.nav("negocios"))} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-primary">
        <ArrowLeft className="h-4 w-4" /> Negócios
      </button>

      {/* Cabeçalho */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Negócio #{d.id} · {L.n}</p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{titulo}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" />{d.nome}</span>
            <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{d.tel}</span>
            <span>comercial: Rúben</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {T && <span key={eur(T.pf)} className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary animate-in fade-in-0 zoom-in-95"><span className="font-mono font-semibold tabular-nums">{eur(T.pf)} €</span>· margem {pct(T.m)}</span>}
          {d.fase < 4 && !d.perdido && <Button variant="outline" size="sm" onClick={go(() => A.perder(d.id))}>Marcar perdido</Button>}
        </div>
      </header>
      {S.confirmPerda === d.id && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/[0.06] p-3 text-sm animate-in fade-in-0 slide-in-from-top-2">
          <b>Marcar como perdido?</b><span className="text-muted-foreground">Sai do quadro, mas fica no histórico.</span>
          <span className="flex-1" />
          <Button variant="outline" size="sm" onClick={go(() => A.perderNao())}>Cancelar</Button>
          <Button variant="destructive" size="sm" onClick={go(() => A.perderSim(d.id))}>Marcar perdido</Button>
        </div>
      )}

      {/* Barra das fases */}
      <ol className="relative grid grid-cols-6 gap-1 rounded-2xl border border-border/70 bg-card px-2 pb-3 pt-4 shadow-[var(--shadow-sm)]">
        <span aria-hidden="true" className="absolute left-[8.33%] right-[8.33%] top-8 h-0.5 rounded-full bg-border" />
        <span aria-hidden="true" className="absolute left-[8.33%] top-8 h-0.5 rounded-full bg-gradient-to-r from-primary to-accent transition-[width] duration-700 ease-out" style={{ width: `calc(${progresso} * 83.33%)` }} />
        {FASES.map((f, i) => {
          const Ic = ICONE_FASE[i];
          const st = d.fase > i ? "feita" : d.fase === i ? "atual" : "depois";
          return (
            <li key={f} className="relative z-10 flex flex-col items-center gap-1.5 text-center">
              <button type="button" disabled={st === "depois"}
                onClick={() => { if (st === "feita") setAbertaFeita(i); document.getElementById("sec-" + i)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
                className={cn("grid h-8 w-8 place-items-center rounded-full transition-all duration-500",
                  st === "feita" && "bg-primary text-primary-foreground shadow-md",
                  st === "atual" && "bg-background text-primary ring-2 ring-primary ring-offset-2 ring-offset-card scale-110",
                  st === "depois" && "bg-muted text-muted-foreground")}>
                {st === "feita" ? <Check className="h-4 w-4 animate-in zoom-in-50" /> : <Ic className="h-4 w-4" />}
              </button>
              <span className={cn("text-[11px] leading-tight sm:text-xs", st === "atual" ? "font-semibold text-primary" : st === "feita" ? "text-foreground" : "text-muted-foreground")}>{f}</span>
              {st === "atual" && <span className="absolute top-0 h-8 w-8 animate-ping rounded-full bg-primary/20 [animation-duration:2.2s]" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-3">
          {/* Fases feitas: resumo, abre ao clicar */}
          {FASES.slice(0, d.fase).map((f, i) => (
            <FaseFeita key={f} ctx={ctx} d={d} i={i} aberta={abertaFeita === i} alternar={() => setAbertaFeita(abertaFeita === i ? null : i)} />
          ))}

          {/* Fase atual */}
          <div ref={atualRef} id={"sec-" + d.fase} className="scroll-mt-4">
            <FaseAtual key={d.id + ":" + d.fase + ":" + (d.perdido ? "x" : "")} ctx={ctx} d={d} />
          </div>

          {/* Fases seguintes */}
          {FASES.slice(d.fase + 1).map((f, k) => {
            const i = d.fase + 1 + k, Ic = ICONE_FASE[i];
            return (
              <div key={f} className="flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-muted"><Ic className="h-4 w-4" /></span>
                <span className="font-medium">{f}</span>
                <span className="ml-auto inline-flex items-center gap-1.5 text-xs"><Lock className="h-3.5 w-3.5" />{QUANDO_ABRE[i]}</span>
              </div>
            );
          })}
        </div>

        {/* Lado direito: cliente e histórico */}
        <aside className="space-y-4 lg:sticky lg:top-4">
          <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[var(--shadow-sm)]">
            <div aria-hidden="true" className="h-[3px] w-full bg-gradient-to-r from-primary via-primary/40 to-transparent" />
            <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-4 py-3">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em]">Cliente</h2>
              {cli && <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success animate-in zoom-in-50">em Clientes</span>}
            </div>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 p-4 text-sm">
              <dt className="text-muted-foreground">Nome</dt><dd className="text-right font-medium">{d.nome}</dd>
              <dt className="text-muted-foreground">Telefone</dt><dd className="text-right font-medium">{d.tel}</dd>
              {d.f.email && <><dt className="text-muted-foreground">Email</dt><dd className="truncate text-right">{d.f.email}</dd></>}
              <dt className="text-muted-foreground">Obra</dt><dd className="text-right">{d.f.morada ? `${d.f.morada}, ${d.f.localidade || ""}` : d.local || "—"}</dd>
              {d.f.imovel && <><dt className="text-muted-foreground">Imóvel</dt><dd className="text-right">{d.f.imovel}{d.f.tipologia ? " " + d.f.tipologia : ""}</dd></>}
              <dt className="text-muted-foreground">Origem</dt><dd className="text-right">{d.f.origem || d.origem}</dd>
              {d.f.pref && <><dt className="text-muted-foreground">Contactar</dt><dd className="text-right">{d.f.pref}{d.f.hora ? " · " + d.f.hora.toLowerCase() : ""}</dd></>}
            </dl>
          </section>
          <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[var(--shadow-sm)]">
            <div aria-hidden="true" className="h-[3px] w-full bg-gradient-to-r from-info via-info/40 to-transparent" />
            <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-4 py-3">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em]">Histórico <span className="ml-1 font-mono text-sm text-info">{d.hist.length}</span></h2>
            </div>
            <ol className="max-h-[420px] space-y-0.5 overflow-y-auto p-3">
              {d.hist.map((h, i) => (
                <li key={d.hist.length - i} className="flex gap-3 rounded-lg px-1.5 py-1.5 text-sm animate-in fade-in-0 slide-in-from-top-1">
                  <i className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", h.k === "x" ? "bg-destructive" : h.k === "w" ? "bg-warning" : h.t.startsWith("Passou") ? "bg-primary" : "bg-success")} />
                  <span className="min-w-0">{h.t}<small className="block text-xs text-muted-foreground">{h.q}</small></span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ uma fase feita */
function FaseFeita({ ctx, d, i, aberta, alternar }: { ctx: Ctx; d: Negocio; i: number; aberta: boolean; alternar: () => void }) {
  const { S } = ctx;
  const Ic = ICONE_FASE[i];
  const gs = i === 3 && d.orc?.vendaDireta ? PROPOSTA.slice(0, 1) : GRUPOS_FASE[i];
  const c = contagem(gs, d.f);
  let resumo = resumoGrupos(gs, d.f, 4);
  if (i === 0) resumo = [d.f.origem || d.origem, d.f.email || "", d.f.tipo_cliente || ""].filter(Boolean);
  if (i === 1) resumo = [d.f.resultado || "", d.f.orc_cliente || "", d.visita.slot ? "visita " + d.visita.slot : ""].filter(Boolean);
  if (i === 2) resumo = [d.f.tipologia || "", d.f.andar ? d.f.andar + ".º andar" : "", d.f.tem_elevador === "Sim" ? "com elevador" : "", orcLinhas(d, S).length + " serviços", d.visita.fotos + " fotos"].filter(Boolean);
  if (i === 3 && d.orc) { const T = tot(d, S); resumo = [eur(T.pf) + " €", "margem " + pct(T.m), d.orc.vendaDireta ? "venda direta" : "contrato " + (d.orc.contrato || "por enviar")]; }
  if (i === 4) resumo = [d.fin.fatura?.n || "", d.fin.recibo?.n || "", d.f.metodo || ""].filter(Boolean);
  return (
    <section id={"sec-" + i} className="scroll-mt-4 overflow-hidden rounded-xl border border-border/70 bg-card animate-in fade-in-0 slide-in-from-top-2 duration-500">
      <button type="button" onClick={alternar} aria-expanded={aberta} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-muted/40">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-success/15 text-success"><Check className="h-4 w-4" /></span>
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold"><Ic className="h-3.5 w-3.5 text-muted-foreground" />{FASES[i]}</span>
          {!aberta && resumo.map((r) => <span key={r} className="truncate rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{r}</span>)}
        </span>
        <span className="hidden font-mono text-xs tabular-nums text-muted-foreground sm:inline">{c.f}/{c.n}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300", aberta && "rotate-180")} />
      </button>
      <div className={cn("grid transition-[grid-template-rows] duration-300 ease-out", aberta ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="min-h-0 overflow-hidden">
          {aberta && (
            <div className="space-y-4 border-t border-border/60 p-4 animate-in fade-in-0">
              {i === 3 && d.orc && <div className="pg estreito"><Orcamento {...ctx} d={d} /></div>}
              {i === 4 && <div className="pg estreito"><Documentos ctx={ctx} d={d} /></div>}
              {gs.map((g) => (
                <div key={g.titulo} className="space-y-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{g.titulo}</h3>
                  <Campos grupo={g} d={d} A={ctx.A} run={ctx.run} ro />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ a fase atual */
/** Os passos da fase atual. `simples` desenha os campos maiores, numa coluna (proposta de 09/10). */
export function passosDaFase(ctx: Ctx, d: Negocio, simples = false): Passo[] {
  const { S, A, run, go } = ctx;
  const o = d.orc, L = LINHAS[d.linha], v = d.visita;
  const fx = { d, A, run, simples };
  const INP = simples ? INPUT_G : INPUT;
  const ROT = simples ? "grid gap-2 text-sm font-medium text-foreground" : "grid gap-1.5 text-xs font-medium text-muted-foreground";
  const g = (gr: Grupo, ic: LucideIcon, ro = false) => passoDeGrupo(gr, ic, <Campos grupo={gr} {...fx} ro={ro} />, d.f);

  let passos: Passo[] = [];
  if (d.fase === 0) {
    passos = [
      { id: "quem", titulo: "Quem pede", icone: User, conta: { f: 2, n: 2 }, resumo: [d.nome, d.tel, L.n], corpo: (
        <div className={simples ? "grid max-w-xl gap-5" : "grid gap-3 sm:grid-cols-3"}>
          <label className={ROT}>Nome<input key={"n" + d.nome} defaultValue={d.nome} className={INP} onBlur={(e) => { const x = e.target.value.trim(); if (x && x !== d.nome) run(() => { d.nome = x; }); }} /></label>
          <label className={ROT}>Telefone<input key={"t" + d.tel} defaultValue={d.tel} className={INP} onBlur={(e) => { const x = e.target.value.trim(); if (x && x !== d.tel) run(() => { d.tel = x; }); }} /></label>
          <div className={ROT}>Linha de serviço<span className="pt-1.5 text-sm font-medium text-foreground">{L.n}</span></div>
        </div>
      ) },
      g(LEAD[0], Phone), g(LEAD[1], Target), g(LEAD[2], ClipboardList),
    ];
  } else if (d.fase === 1) {
    passos = [
      g(CONTACTO[0], Phone), g(CONTACTO[1], Sparkles),
      { ...g(CONTACTO[2], MapPin), corpo: (
        <div className="space-y-4">
          <UsarLocalizacao ctx={ctx} d={d} texto="Estou no local: usar a localização" />
          <Campos grupo={CONTACTO[2]} {...fx} />
        </div>
      ) },
      g(CONTACTO[3], CalendarClock),
      { id: "vaga", titulo: "Marcar a visita", icone: CalendarClock, feito: !!v.slot, resumo: v.slot ? [v.slot] : [], corpo: (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Vagas do Rúben em {d.f.localidade || (d.local || "").split(",").pop() || "—"}. Escolher uma marca a visita e passa à fase Visita.</p>
          <div className="flex flex-wrap gap-2">
            {SLOTS.map((s) => (
              <button key={s} type="button" onClick={go(() => A.marcarVisita(d.id, s))}
                className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium transition hover:-translate-y-0.5 hover:border-primary hover:bg-primary/5 hover:text-primary hover:shadow-[var(--shadow-sm)]">
                <CalendarClock className="mr-1.5 inline h-4 w-4" />{s}
              </button>
            ))}
          </div>
        </div>
      ) },
    ];
  } else if (d.fase === 2) {
    const medOk = (Object.keys(L.med) as MedKey[]).filter((k) => v.med[k] > 0).length;
    const nMed = Object.keys(L.med).length;
    passos = [
      { ...g(EXTERIOR, Building2), corpo: (
        <div className="space-y-6">
          <div className={cn("rounded-xl border border-border p-4", simples ? "bg-muted/40" : "bg-muted/30")}>
            <p className={simples ? "text-sm text-muted-foreground" : "text-xs text-muted-foreground"}>Morada da obra</p>
            <p className={simples ? "mt-0.5 text-base font-medium" : "text-sm font-medium"}>{d.f.morada ? `${d.f.morada}${d.f.cp ? ", " + d.f.cp : ""} ${d.f.localidade || ""}` : "Ainda sem morada"}</p>
            <div className="mt-3"><UsarLocalizacao ctx={ctx} d={d} texto="Estou no local: confirmar pela localização" /></div>
          </div>
          <Campos grupo={EXTERIOR} {...fx} />
        </div>
      ) },
      g(INTERIOR, Home), g(AREA, Wrench),
      { id: "medidas", titulo: "Medidas da área", icone: Ruler, conta: { f: medOk, n: nMed }, resumo: (Object.entries(L.med) as [MedKey, string][]).filter(([k]) => v.med[k] > 0).map(([k, l]) => `${l.replace(/ \(.*\)/, "")} ${nfmt(v.med[k])}`), corpo: (
        <div className="space-y-2">
          <p className={simples ? "text-[15px] text-muted-foreground" : "text-xs text-muted-foreground"}>As medidas dão as quantidades dos serviços. Todas são precisas para fechar o levantamento.</p>
          <div className={simples ? "grid max-w-xl gap-5 sm:grid-cols-2" : "grid gap-3 sm:grid-cols-4"}>
            {(Object.entries(L.med) as [MedKey, string][]).map(([k, l]) => (
              <label key={k} className={cn(simples ? ROT : "grid gap-1.5 rounded-xl text-xs font-medium text-muted-foreground transition-all", !simples && !(v.med[k] > 0) && (Object.keys(L.med) as MedKey[]).find((x) => !(v.med[x] > 0)) === k && "rounded-lg bg-primary/[0.04] ring-2 ring-primary/40 ring-offset-[6px] ring-offset-card")}>
                {l}
                <input key={k + v.med[k]} type="number" min="0" step="0.5" defaultValue={v.med[k] || ""} id={`med-${k}-${d.id}`}
                  className={cn(INP, aValidar(d, "medidas") && !(v.med[k] > 0) && "border-destructive ring-1 ring-destructive/40")}
                  aria-invalid={(aValidar(d, "medidas") && !(v.med[k] > 0)) || undefined}
                  onBlur={(e) => { const n = numero(e.target.value); if ((isNaN(n) ? 0 : n) !== v.med[k]) run(() => { v.med[k] = isNaN(n) ? 0 : n; }); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
              </label>
            ))}
          </div>
        </div>
      ) },
      { id: "nec", titulo: "Serviços necessários", icone: ClipboardList, feito: orcLinhas(d, S).length > 0 && medOk === nMed,
        resumo: orcLinhas(d, S).map((sid) => S.svc[sid].n), corpo: <ServicosCatalogo {...ctx} d={d} simples={simples} /> },
      { ...g(ESCOLHAS, Sparkles), corpo: (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Equipamentos pedidos</span>
            <div className="flex flex-wrap gap-2">
              {L.nec.map((x) => (
                <button key={x} type="button" aria-pressed={v.nec.includes(x)} onClick={go(() => A.nec(d.id, x))}
                  className={cn("rounded-full border px-3 py-1 text-sm transition-all duration-200", v.nec.includes(x) ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground")}>
                  {v.nec.includes(x) && <Check className="mr-1 inline h-3.5 w-3.5" />}{x}
                </button>
              ))}
            </div>
          </div>
          <Campos grupo={ESCOLHAS} {...fx} />
        </div>
      ) },
      { id: "fotos", titulo: "Fotografias", icone: Camera, feito: v.fotos > 0 || d.f.diag_cliente_recusou_fotos === "Sim", resumo: [v.fotos + " fotos"], corpo: (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex -space-x-2">
              {Array.from({ length: Math.min(v.fotos, 6) }).map((_, i) => (
                <span key={i} className="grid h-12 w-12 place-items-center rounded-lg border-2 border-card bg-gradient-to-br from-primary/20 to-accent/20 text-primary animate-in zoom-in-50"><Camera className="h-4 w-4" /></span>
              ))}
            </div>
            <span className="text-sm text-muted-foreground">{v.fotos} fotos da área · no telemóvel tira-se com a câmara, antes de sentar com o cliente</span>
            <Button variant="outline" size="sm" onClick={go(() => A.foto(d.id))}><Camera className="mr-1.5 h-4 w-4" />Tirar foto</Button>
          </div>
          {aValidar(d, "fotos") && !(v.fotos > 0) && d.f.diag_cliente_recusou_fotos !== "Sim" && (
            <p className="text-[15px] font-medium text-destructive">Tire pelo menos uma fotografia, ou marque que o cliente não quis.</p>
          )}
          <Campos grupo={{ titulo: "", campos: [{ k: "diag_cliente_recusou_fotos", l: "O cliente não quis fotografias", t: "sim_nao", opcional: true }] }} {...fx} />
        </div>
      ) },
    ];
  } else if (d.fase === 3 && o) {
    passos = [
      { id: "orc", titulo: "Orçamento", icone: FileText, feito: !!o.enviada || (o.verif && !bloqueado(d, S)), resumo: [eur(tot(d, S).pf) + " €", "margem " + pct(tot(d, S).m)],
        corpo: <div className="pg estreito"><Orcamento {...ctx} d={d} /></div> },
      g(PROPOSTA[0], FileSignature, !!o.enviada),
      ...(o.vendaDireta ? [] : [g(PROPOSTA[1], FileSignature, !!o.contrato)]),
    ];
  } else if (d.fase === 4) {
    passos = [
      { id: "docs", titulo: "Fatura e recibo", icone: Euro, feito: !!d.fin.recibo, resumo: [d.fin.fatura?.n || "fatura por emitir"], corpo: <div className="pg estreito"><Documentos ctx={ctx} d={d} /></div> },
      ...FINANCEIRO.map((gr) => g(gr, Euro)),
    ];
  } else if (d.fase === 5) {
    passos = [
      { id: "obra", titulo: "Plano, materiais e resultado", icone: Hammer, feito: d.obra.plano?.estado === "concluída", resumo: [d.obra.plano?.estado || ""],
        corpo: <div className="pg estreito"><ObraResumo {...ctx} d={d} /></div> },
      g(OBRA[0], Hammer), g(OBRA[1], Check),
    ];
  }
  // depois de tentar passar de fase: quantos campos faltam em cada passo
  const TODOS: Grupo[] = [...LEAD, ...CONTACTO, EXTERIOR, INTERIOR, AREA, ESCOLHAS, ...PROPOSTA, ...FINANCEIRO, ...OBRA];
  for (const ps of passos) {
    const gr = TODOS.find((x) => x.titulo === ps.id);
    if (gr && aValidar(d, gr.titulo)) ps.falta = emFalta([gr], d.f).length;
    if (ps.id === "medidas" && aValidar(d, "medidas")) ps.falta = (Object.keys(L.med) as MedKey[]).filter((k) => !(v.med[k] > 0)).length;
    if (ps.id === "nec" && aValidar(d, "nec") && !orcLinhas(d, S).length) ps.falta = 1;
    if (ps.id === "fotos" && aValidar(d, "fotos") && !(v.fotos > 0) && d.f.diag_cliente_recusou_fotos !== "Sim") ps.falta = 1;
  }
  return passos;
}

/** O botão do próximo passo do negócio (ou o simulador do cliente). */
export function BotaoFase({ ctx, d, tamanho = "lg" }: { ctx: Ctx; d: Negocio; tamanho?: "lg" | "default" }) {
  const { S, A, go } = ctx;
  const p = proximo(d, S), meu = !!p.who && p.who === S.role;
  if (p.btn) return meu
    ? <Button size={tamanho} onClick={go(() => fazer(A, p.act!, d.id))}>{p.btn}<ArrowRight className="ml-2 h-4 w-4" /></Button>
    : (
      <div className="grid justify-items-start gap-1 sm:justify-items-end">
        <Button size={tamanho} disabled>{p.btn}</Button>
        <button type="button" className="text-sm font-medium text-primary underline-offset-4 hover:underline" onClick={go(() => A.role(p.who as Papel))}>Mudar para {PAPEIS[p.who as Papel].n}</button>
      </div>
    );
  if (p.sim) return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Simular o cliente:</span>
      {p.sim === "aceitar"
        ? <><Button variant="outline" size={tamanho} onClick={go(() => A.recusar(d.id))}>Recusou</Button><Button size={tamanho} onClick={go(() => A.aceitar(d.id))}>Aceitou</Button></>
        : <Button size={tamanho} onClick={go(() => A.assinar(d.id))}>Assinou</Button>}
    </div>
  );
  if (p.wait && p.who === "direcao") return <Button variant="outline" size={tamanho} onClick={go(() => A.role("direcao"))}>Mudar para Direção</Button>;
  return null;
}
export const temBotaoFase = (ctx: Ctx, d: Negocio) => { const p = proximo(d, ctx.S); return !!(p.btn || p.sim || (p.wait && p.who === "direcao")); };

function FaseAtual({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const { S } = ctx;
  const p = proximo(d, S), meu = !!p.who && p.who === S.role;
  const passos = passosDaFase(ctx, d);
  const primeiro = Math.max(0, passos.findIndex((x) => (x.conta ? x.conta.f < x.conta.n : !x.feito)));
  const [ativo, setAtivo] = useState(primeiro);
  // tentou passar de fase com campos em falta: abre o primeiro passo com falta e põe o cursor no campo
  useEffect(() => {
    if (S.pulse !== "falta") return;
    const i = passos.findIndex((x) => (x.falta || 0) > 0);
    if (i >= 0 && i !== ativo) setAtivo(i);
    setTimeout(() => (document.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus(), 450);
  });
  const total = passos.reduce((a, x) => a + (x.conta ? x.conta.n : 1), 0);
  const feitos = passos.reduce((a, x) => a + (x.conta ? x.conta.f : x.feito ? 1 : 0), 0);
  const Ic = ICONE_FASE[d.fase];

  const botao = temBotaoFase(ctx, d) ? <BotaoFase ctx={ctx} d={d} /> : null;

  return (
    <section className="overflow-hidden rounded-2xl border border-primary/30 bg-card shadow-[var(--shadow-md)] animate-in fade-in-0 slide-in-from-bottom-6 duration-700">
      <div aria-hidden="true" className="h-1 w-full bg-gradient-to-r from-primary via-accent to-primary/30" />
      <div className="flex flex-wrap items-center gap-3 border-b border-border/60 bg-gradient-to-r from-primary/[0.07] to-transparent px-4 py-3 sm:px-5">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-md"><Ic className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Fase {d.fase + 1} de 6</p>
          <h2 className="text-lg font-bold leading-tight">{FASES[d.fase]}</h2>
        </div>
        <div className="w-full sm:w-48">
          <div className="flex justify-between text-[11px] text-muted-foreground"><span>{feitos} de {total} preenchidos</span><span className="font-mono">{total ? Math.round((feitos / total) * 100) : 0}%</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-[width] duration-700 ease-out" style={{ width: `${total ? (feitos / total) * 100 : 0}%` }} /></div>
        </div>
      </div>

      {/* Próximo passo */}
      <div className={cn("flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-5", p.done ? "bg-success/10" : "bg-muted/30")}>
        <div className="min-w-0">
          <p className={cn("text-[11px] font-semibold uppercase tracking-[0.14em]", p.done ? "text-success" : "text-primary")}>
            {p.done ? "Concluído" : "Próximo passo"}{p.who && p.who !== "cliente" && !p.done ? " · " + PAPEIS[p.who].n.split("·").pop()!.trim() : ""}
          </p>
          <p className="font-semibold">{p.t}</p>
          {p.sub && <p className="text-sm text-muted-foreground">{p.sub}</p>}
        </div>
        {botao}
      </div>

      <div className="space-y-3 p-4 sm:p-5">
        {d.fase === 2 && <Legenda />}
        {passos.length > 0 && (
          <Assistente passos={passos} ativo={ativo} setAtivo={setAtivo} fim={
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 to-accent/5 p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground animate-in zoom-in-50"><Sparkles className="h-4 w-4" /></span>
                <div><p className="font-semibold">Fase {FASES[d.fase]} pronta</p><p className="text-sm text-muted-foreground">{p.t}</p></div>
              </div>
              {botao && <div className="relative">{meu && <span className="absolute inset-0 animate-ping rounded-md bg-primary/30 [animation-duration:1.8s]" aria-hidden="true" />}<div className="relative">{botao}</div></div>}
            </div>
          } />
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ peças da fase */
export function Documentos({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const T = d.orc ? tot(d, ctx.S) : null;
  return (
    <div className="withside">
      <div className="tw"><table><thead><tr><th>Documento</th><th>Estado</th><th className="n">Valor s/ IVA</th></tr></thead><tbody>
        <tr>
          <td>{d.fin.fatura ? d.fin.fatura.n : "Fatura"}<small>{d.fin.fatura ? "emitida " + d.fin.fatura.q + " · enviada ao portal do cliente" : "por emitir · só o Financeiro emite"}</small></td>
          <td>{d.fin.pago ? <span className="pill ok">Paga</span> : d.fin.fatura ? <span className="pill warn">Por pagar</span> : <span className="pill mut">Por emitir</span>}</td>
          <td className="n">{T ? eur(T.pf) : ""}</td>
        </tr>
        <tr>
          <td>{d.fin.recibo ? d.fin.recibo.n : "Recibo"}<small>{d.fin.recibo ? "emitido " + d.fin.recibo.q : "emitido ao validar o pagamento"}</small></td>
          <td>{d.fin.recibo ? <span className="pill ok">Emitido</span> : <span className="pill mut">Ainda não</span>}</td>
          <td className="n" />
        </tr>
      </tbody></table></div>
      <div className="card">
        <h3>Ao emitir o recibo</h3>
        <div className="trig">
          <div><i className={d.fin.recibo ? "on" : ""}>1</i><span><b>Inventário</b><small>confirma os materiais e cria a encomenda ao fornecedor, se faltar algo</small></span></div>
          <div><i className={d.fin.recibo ? "on" : ""}>2</i><span><b>Operações</b><small>gera o plano da obra com os técnicos do RH</small></span></div>
          <div><i className={d.fin.recibo ? "on" : ""}>3</i><span><b>Cliente</b><small>recebe o recibo no portal</small></span></div>
        </div>
        <span className="sub">Por agora a validação é interna. Quando o portal aceitar pagamentos, passa a ser automática.</span>
      </div>
    </div>
  );
}

export function Orcamento({ S, A, go, run, d }: Ctx & { d: Negocio }) {
  const o = d.orc!, T = tot(d, S), locked = !!o.enviada;
  const pt = partes(d, S), mw = Math.max(0, Math.min(1, T.m / 0.5));
  const mcls = T.m < S.cfg.min / 100 ? "bad" : T.m < S.cfg.alvo / 100 - 0.005 ? "warn" : "ok";
  const mudou = () => { d.orc!.aprov = null; d.fresh = false; };
  const AL = o.verif && !locked ? alertas(d, S) : [];
  const nX = AL.filter((a) => a.k === "x").length, nW = AL.filter((a) => a.k === "w").length;
  const okLinhas = ["Nenhuma linha abaixo do custo", "Todas as linhas têm custo no Catálogo"].filter((_, i) => !AL.some((a) => (i === 0 ? a.t.startsWith("Preço abaixo") : false)));

  return (
    <>
      <div className="row">
        <span className="sub">Orçamento v1 · modelo "{o.modelo}" · medidas da visita</span>
        <label className="row" style={{ gap: 6, fontSize: 12.5 }}>
          <input type="checkbox" checked={o.vendaDireta} disabled={locked}
            onChange={(e) => { const val = e.target.checked; run(() => A.vendaDireta(d.id, val)); }} />
          {" "}Venda direta (sem contrato)
        </label>
      </div>
      <div className="withside">
        <div className="stack">
          <div className="tw"><table style={{ minWidth: 560 }}>
            <thead><tr><th>Serviço</th><th>Medida</th><th className="n">Custo</th><th className="n">Preço/un.</th><th className="n">Margem</th></tr></thead>
            <tbody>
              {o.linhas.map((l, i) => {
                const x = linhaCalc(l, S);
                const m = x.preco > 0 ? (x.preco - x.custo) / x.preco : 0;
                const cls = m < S.cfg.min / 100 ? "bad" : m < S.cfg.alvo / 100 - 0.005 ? "warn" : "ok";
                if (l.t === "mat") return (
                  <tr key={i}><td>Materiais<small>{l.d} · do modelo</small></td><td className="sub">—</td><td className="n">{eur(x.custo)}</td><td className="n">{eur(x.preco)}</td><td className="n"><span className={"pill " + cls}>{pct(m)}</span></td></tr>
                );
                const s = x.s!, novo = r2(custoUn(s, S));
                const mud = !locked && Math.abs(novo - l.cu) > 0.004;
                return (
                  <tr key={i} className={cls === "bad" ? "hl" : ""}>
                    <td>{s.n}<small>custo {eur(l.cu)} €/{s.un} do Catálogo{mud && <> · <button className="link" onClick={go(() => A.recalc(d.id, i))}>Catálogo mudou: usar {eur(novo)}</button></>}</small></td>
                    <td><Campo id={`lq-${d.id}-${i}`} ariaLabel="Medida" value={nfmt(l.q)} readOnly={locked} onCommit={(v) => run(() => { const n = numero(v); if (!isNaN(n) && n >= 0) { l.q = n; mudou(); } })} /> {s.un}</td>
                    <td className="n">{eur(x.custo)}</td>
                    <td className="n"><Campo id={`lp-${d.id}-${i}`} ariaLabel="Preço unitário" value={eur(l.pu)} readOnly={locked}
                      onCommit={(v) => run(() => { const n = numero(v.replace(/\./g, "")); if (!isNaN(n) && n >= 0) { l.pu = n; mudou(); } })} /><small>{eur(x.preco)} €</small></td>
                    <td className="n"><span className={"pill " + cls}>{pct(m)}</span></td>
                  </tr>
                );
              })}
              <tr>
                <td colSpan={3}>Desconto</td>
                <td className="n"><Campo id={`desc-${d.id}`} ariaLabel="Desconto em percentagem" value={nfmt(o.desconto)} readOnly={locked}
                  onCommit={(v) => run(() => { const n = numero(v); o.desconto = isNaN(n) ? 0 : Math.max(0, Math.min(50, n)); mudou(); })} /> %</td>
                <td />
              </tr>
              <tr className="sum"><td>Total sem IVA</td><td>{nfmt(T.h)} h</td><td className="n">{eur(T.custo)}</td><td className="n">{eur(T.pf)}</td><td className="n">{pct(T.m)}</td></tr>
            </tbody>
          </table></div>
          {o.verif && !locked && (
            <div className={"card " + (S.pulse === "verif" ? "sec pulse" : "")} id="verif" style={{ borderColor: "var(--pri-line)" }}>
              <h3>Verificar antes de enviar <span>{nX} bloqueio(s) · {nW} aviso(s)</span></h3>
              <div className="al">
                {AL.map((a, k) => (
                  <div key={k} className={a.k}>
                    <i>!</i><span><b>{a.t}</b><small>{a.d}</small></span>
                    <span className="acts">
                      {a.sug != null && <Btn cls="sm" onClick={go(() => A.sugerido(d.id, a.i!, a.sug!))}>Usar {eur(a.sug)} €</Btn>}
                      {a.go && <Btn cls="sec sm" onClick={go(() => A.nav(a.go!))}>Abrir Catálogo</Btn>}
                      {a.key && <Btn cls="sec sm" onClick={go(() => A.vistoAviso(d.id, a.key!))}>Visto</Btn>}
                    </span>
                  </div>
                ))}
                {okLinhas.map((t) => <div key={t} className="o"><i>✓</i><span><b>{t}</b></span><span /></div>)}
              </div>
              {bloqueado(d, S) && AL.filter((a) => a.k === "x").every((a) => a.aprov) && (
                o.aprov === "pedida"
                  ? <div className="note">Pedido de aprovação enviado à Direção. Fica registado quem aprovou.</div>
                  : <div className="row"><span className="sub">Quer mesmo enviar assim? É preciso aprovação.</span><Btn cls="sec sm" onClick={go(() => A.pedirAprov(d.id))}>Pedir aprovação à Direção</Btn></div>
              )}
              {o.aprov === "ok" && <div className="note" style={{ background: "var(--ok-bg)", color: "var(--ok)" }}>Exceção aprovada pela Direção.</div>}
            </div>
          )}
          {locked && (
            <div className="kv">
              <span>Proposta</span><b>enviada {o.enviada}{o.aceite ? " · aceite " + o.aceite : ""}</b>
              {o.vendaDireta
                ? <><span>Contrato</span><b>venda direta, não há</b></>
                : <><span>Contrato</span><b>{o.contrato === "assinado" ? "assinado" : o.contrato === "enviado" ? "enviado, à espera da assinatura" : "por enviar"}</b></>}
            </div>
          )}
        </div>
        <div className="card">
          <h3>Margem <span className={"pill " + mcls}>{pct(T.m)}</span></h3>
          <div className="meter">
            <i style={{ width: mw * 100 + "%", background: mcls === "ok" ? "var(--ok)" : mcls === "warn" ? "var(--amber)" : "var(--bad)" }} />
            <b style={{ left: S.cfg.min * 2 + "%" }} title="mínimo" /><b style={{ left: S.cfg.alvo * 2 + "%" }} title="alvo" />
          </div>
          <div className="sub">mínimo {S.cfg.min}% · alvo {S.cfg.alvo}% · em Definições</div>
          <div className="kv">
            <span>Mão de obra</span><b>{eur(pt.mo)} €</b><span>Equipamentos</span><b>{eur(pt.eq)} €</b><span>Consumíveis</span><b>{eur(pt.cons)} €</b>
            {S.cfg.estrutura && <><span>Estrutura</span><b>{eur(pt.estr)} €</b></>}
            <span>Materiais</span><b>{eur(pt.mat)} €</b>
            <span className="tot">Custo total</span><b className="tot">{eur(T.custo)} €</b>
            <span className="tot">Lucro previsto</span><b className="tot">{eur(T.pf - T.custo)} €</b>
          </div>
        </div>
      </div>
    </>
  );
}

function ObraResumo({ S, A, go, d }: Ctx & { d: Negocio }) {
  const pl = d.obra.plano!, e = d.obra.enc, T = tot(d, S);
  const est = { "por aprovar": "warn", aprovado: "pri", "em curso": "pri", "concluída": "ok" }[pl.estado];
  const R = d.obra.real;
  const mx = R ? Math.max(...R.tasks.map((t) => Math.max(t.prev, t.real))) : 1;
  return (
    <>
      <div className="g2">
        <div className="card">
          <h3>Plano da obra <span className={"pill " + est}>{pl.estado}</span></h3>
          <div className="kv"><span>Fases</span><b>{pl.tasks.length}</b><span>Horas previstas</span><b>{nfmt(pl.tasks.reduce((a, t) => a + t.h, 0))} h</b><span>Conflitos</span><b>{conflitos(pl).length}</b></div>
          <Btn cls="sec sm" onClick={go(() => A.abrirPlano(d.id))}>Abrir nas Operações</Btn>
        </div>
        <div className="card">
          <h3>Materiais <span className={"pill " + (!e || e.estado === "recebida" ? "ok" : "warn")}>{!e ? "em stock" : e.estado === "recebida" ? "reservados" : e.n + " · " + e.estado}</span></h3>
          <div className="kv">
            {(d.obra.mats || []).slice(0, 4).map((x) => <Fragment key={x.n}><span>{x.n}</span><b>{x.falta > 0 ? "faltam " + nfmt(x.falta) + " " + x.un : "✓ " + nfmt(x.q) + " " + x.un}</b></Fragment>)}
          </div>
          <Btn cls="sec sm" onClick={go(() => A.abrirInv())}>Abrir no Inventário</Btn>
        </div>
      </div>
      {R && (
        <div className="withside">
          <div className="card">
            <h3>Previsto contra real <span>horas de equipa</span></h3>
            <div className="bars">
              {R.tasks.map((t) => (
                <div className="b" key={t.nome}>
                  <span>{t.nome}</span>
                  <div className="tr"><i style={{ width: (t.prev / mx) * 100 + "%" }} /><i className={"r " + (t.real > t.prev * 1.05 ? "over" : "")} style={{ width: (t.real / mx) * 100 + "%" }} /></div>
                  <em>{nfmt(t.real)} h<small>prev. {nfmt(t.prev)}</small></em>
                </div>
              ))}
            </div>
            <div className="legend"><span><i style={{ background: "var(--pri-line)" }} />previsto</span><span><i style={{ background: "var(--pri)" }} />real</span><span><i style={{ background: "var(--amber)" }} />acima do previsto</span></div>
          </div>
          <div className="card">
            <h3>O que se aprende</h3>
            <div className="kv">
              <span>Custo previsto</span><b>{eur(T.custo)} €</b><span>Custo real</span><b>{eur(R.custoReal)} €</b>
              <span className="tot">Margem orçada</span><b className="tot">{pct(T.m)}</b><span className="tot">Margem real</span><b className="tot">{pct(R.m)}</b>
            </div>
            {d.obra.aprendido
              ? <span className="pill ok">Receita do revestimento atualizada</span>
              : <>
                <span className="sub">O revestimento levou mais 23% do que a receita prevê. Proposta: subir de {nfmt(S.svc.revest.h)} para {nfmt(r2(S.svc.revest.h * fatorReal("revest")))} h/m² no Catálogo.</span>
                <Btn cls="sm" onClick={go(() => A.aprender(d.id))}>Atualizar a receita</Btn>
              </>}
          </div>
        </div>
      )}
    </>
  );
}

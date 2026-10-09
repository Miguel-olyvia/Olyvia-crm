// Proposta de 09/10/2026: a página do negócio com menos ruído.
// Uma coisa de cada vez: o passo atual ocupa o ecrã, os outros ficam numa
// lista à esquerda. Um só botão primário. Texto a 15–16 px, contraste AA.
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FASES, LINHAS, PAPEIS, eur, pct, proximo, tot, type Negocio } from "./motor";
import { CONTACTO, FINANCEIRO, LEAD, OBRA, PROPOSTA, EXTERIOR, INTERIOR, AREA, ESCOLHAS, type Grupo } from "./campos";
import { Campos, type Passo } from "./CamposFase";
import { BotaoFase, passosDaFase, temBotaoFase } from "./PaginaNegocio";
import type { Ctx } from "./pecas";

const GRUPOS_FASE: Grupo[][] = [LEAD, CONTACTO, [EXTERIOR, INTERIOR, AREA, ESCOLHAS], PROPOSTA, FINANCEIRO, OBRA];
// nomes curtos para a lista dos passos
const CURTO: Record<string, string> = {
  "Local · exterior (edifício e acessos)": "Exterior do edifício", "Local · interior": "Interior da casa",
  "nec": "Serviços necessários", "Escolhas do cliente": "Escolhas do cliente", "Plano, materiais e resultado": "Plano e materiais",
};
const curto = (p: Passo) => CURTO[p.id] || CURTO[p.titulo] || p.titulo;
const completo = (p: Passo) => (p.conta ? p.conta.n > 0 && p.conta.f >= p.conta.n : !!p.feito);

export function NegocioSimples(ctx: Ctx) {
  const { S, A, go } = ctx;
  const d = S.deals.find((x) => x.id === S.deal)!;
  const T = d.orc ? tot(d, S) : null;
  const [ver, setVer] = useState<number | null>(null); // uma fase já feita, só para ler
  const local = d.f.localidade || d.local.split(",").pop()!.trim();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-8 sm:pt-10">
      <button type="button" onClick={go(() => A.nav("negocios"))}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg text-[15px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Negócios
      </button>

      <header className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">{d.nome}</h1>
          <p className="mt-1 text-base text-muted-foreground">
            {d.servico}{local ? ` · ${local}` : ""} · {d.tel}{T ? ` · ${eur(T.pf)} € · margem ${pct(T.m)}` : ""}
          </p>
        </div>
        {d.fase < 4 && !d.perdido && (
          <button type="button" onClick={go(() => A.perder(d.id))} className="min-h-11 self-start rounded-lg px-1 text-[15px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:self-auto">
            Marcar como perdido
          </button>
        )}
      </header>
      {S.confirmPerda === d.id && (
        <div role="alertdialog" aria-label="Confirmar" className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 animate-in fade-in-0">
          <p className="flex-1 text-[15px]">Marcar como perdido? Sai do quadro, mas fica no histórico.</p>
          <Button variant="outline" onClick={go(() => A.perderNao())}>Cancelar</Button>
          <Button variant="destructive" onClick={go(() => A.perderSim(d.id))}>Marcar como perdido</Button>
        </div>
      )}

      {/* As fases: uma linha fina e o nome da fase em texto */}
      <div className="mt-8">
        <div className="flex gap-1.5" aria-hidden="true">
          {FASES.map((f, i) => (
            <span key={f} className={cn("h-1.5 flex-1 rounded-full transition-colors duration-500", i < d.fase ? "bg-primary" : i === d.fase ? "bg-primary/45" : "bg-border")} />
          ))}
        </div>
        <p className="mt-3 text-[15px] text-muted-foreground" aria-live="polite">
          Fase {d.fase + 1} de 6: <span className="font-semibold text-foreground">{FASES[d.fase]}</span>
          {d.fase < 5 && <> · depois: {FASES[d.fase + 1]}</>}
        </p>
      </div>

      <div className="mt-8 grid items-start gap-10 lg:grid-cols-[220px_minmax(0,1fr)] 2xl:grid-cols-[220px_minmax(0,1fr)_240px]">
        {ver === null
          ? <FaseSimples key={d.id + ":" + d.fase} ctx={ctx} d={d} lateral={(passos, ativo, setAtivo) => (
            <Lateral d={d} passos={passos} ativo={ativo} setAtivo={setAtivo} verFase={setVer} />
          )} />
          : <>
            <Lateral d={d} passos={[]} ativo={-1} setAtivo={() => {}} verFase={setVer} vendo={ver} />
            <section className="min-w-0 animate-in fade-in-0 duration-200" aria-labelledby="fase-lida">
              <p className="text-sm text-muted-foreground">Fase feita · só leitura</p>
              <h2 id="fase-lida" className="mt-1 text-2xl font-semibold">{FASES[ver]}</h2>
              <div className="mt-6 space-y-8">
                {(ver === 3 && d.orc?.vendaDireta ? PROPOSTA.slice(0, 1) : GRUPOS_FASE[ver]).map((g) => (
                  <div key={g.titulo}>
                    <h3 className="mb-3 text-base font-semibold">{g.titulo}</h3>
                    <Campos grupo={g} d={d} A={A} run={ctx.run} ro simples />
                  </div>
                ))}
              </div>
              <div className="mt-10 border-t border-border pt-6">
                <Button onClick={() => setVer(null)}>Voltar à fase {FASES[d.fase]}</Button>
              </div>
            </section>
          </>}

        <aside className="hidden 2xl:block" aria-label="Cliente">
          <h2 className="text-base font-semibold">Cliente</h2>
          <dl className="mt-3 space-y-3 text-[15px]">
            <div><dt className="text-sm text-muted-foreground">Telefone</dt><dd>{d.tel}</dd></div>
            {d.f.email && <div><dt className="text-sm text-muted-foreground">Email</dt><dd className="break-all">{d.f.email}</dd></div>}
            <div><dt className="text-sm text-muted-foreground">Morada da obra</dt><dd>{d.f.morada ? `${d.f.morada}, ${d.f.localidade || ""}` : d.local || "—"}</dd></div>
            <div><dt className="text-sm text-muted-foreground">Linha</dt><dd>{LINHAS[d.linha].n}</dd></div>
          </dl>
          <h2 className="mt-8 text-base font-semibold">Últimos acontecimentos</h2>
          <ol className="mt-3 space-y-3">
            {d.hist.slice(0, 5).map((h, i) => (
              <li key={d.hist.length - i} className="text-[15px] leading-snug animate-in fade-in-0">
                {h.t}<span className="block text-sm text-muted-foreground">{h.q}</span>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}

type Lat = (passos: Passo[], ativo: number, setAtivo: (i: number) => void) => React.ReactNode;

function Lateral({ d, passos, ativo, setAtivo, verFase, vendo }: { d: Negocio; passos: Passo[]; ativo: number; setAtivo: (i: number) => void; verFase: (i: number | null) => void; vendo?: number }) {
  return (
    <nav aria-label="Passos desta fase" className="lg:sticky lg:top-6">
      {passos.length > 0 && (
        <>
          <h2 className="px-3 text-sm font-medium text-muted-foreground">{FASES[d.fase]}</h2>
          <ol className="mt-2 space-y-0.5">
            {passos.map((p, i) => {
              const ok = completo(p);
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => setAtivo(i)} aria-current={i === ativo ? "step" : undefined}
                    className={cn("flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] transition-colors",
                      i === ativo ? "bg-muted font-semibold text-foreground" : "text-foreground/80 hover:bg-muted/60")}>
                    <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px]",
                      ok ? "border-primary bg-primary text-primary-foreground" : i === ativo ? "border-foreground" : "border-input")}>
                      {ok && <Check className="h-3 w-3" aria-hidden="true" />}
                    </span>
                    <span className="min-w-0 flex-1">{curto(p)}</span>
                    {ok && <span className="sr-only">(feito)</span>}
                  </button>
                </li>
              );
            })}
          </ol>
        </>
      )}
      {d.fase > 0 && (
        <>
          <h2 className={cn("px-3 text-sm font-medium text-muted-foreground", passos.length > 0 && "mt-8")}>Fases feitas</h2>
          <ul className="mt-2 space-y-0.5">
            {FASES.slice(0, d.fase).map((f, i) => (
              <li key={f}>
                <button type="button" onClick={() => verFase(vendo === i ? null : i)} aria-current={vendo === i ? "page" : undefined}
                  className={cn("flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] text-foreground/80 transition-colors hover:bg-muted/60", vendo === i && "bg-muted font-semibold text-foreground")}>
                  <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />{f}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </nav>
  );
}

function FaseSimples({ ctx, d, lateral }: { ctx: Ctx; d: Negocio; lateral: Lat }) {
  const { S } = ctx;
  const p = proximo(d, S), meu = !!p.who && p.who === S.role;
  const passos = passosDaFase(ctx, d, true);
  const primeiro = Math.max(0, passos.findIndex((x) => !completo(x)));
  const [ativo, setAtivo] = useState(primeiro);
  const titulo = useRef<HTMLHeadingElement>(null);
  const montado = useRef(false);

  // "Faltam medidas": vai para o passo das medidas
  useEffect(() => {
    if (S.pulse === "medidas") { const i = passos.findIndex((x) => x.id === "medidas"); if (i >= 0 && i !== ativo) setAtivo(i); }
  });

  // um passo completo passa sozinho ao seguinte
  const atual = passos[ativo];
  const ok = atual ? completo(atual) : false;
  const antes = useRef({ i: ativo, ok });
  useEffect(() => {
    const a = antes.current;
    antes.current = { i: ativo, ok };
    if (a.i === ativo && !a.ok && ok && ativo < passos.length) {
      const t = setTimeout(() => setAtivo(ativo + 1), 700);
      return () => clearTimeout(t);
    }
  }, [ativo, ok, passos.length]);

  // ao mudar de passo, o título recebe o foco (leitores de ecrã) sem saltar a página
  useEffect(() => {
    if (!montado.current) { montado.current = true; return; }
    titulo.current?.focus({ preventScroll: true });
    titulo.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [ativo]);

  const fim = ativo >= passos.length;
  const quem = p.who && p.who !== "cliente" && !meu ? PAPEIS[p.who].n : null;

  return (
    <>
      {lateral(passos, ativo, setAtivo)}
      <section className="min-w-0" aria-labelledby="passo-titulo">
        <div key={ativo} className="animate-in fade-in-0 slide-in-from-right-3 duration-300">
          {!fim && atual ? (
            <>
              <p className="text-sm text-muted-foreground">Passo {ativo + 1} de {passos.length}</p>
              <h2 id="passo-titulo" ref={titulo} tabIndex={-1} className="mt-1 text-2xl font-semibold tracking-tight outline-none">{curto(atual)}</h2>
              <div className="mt-6">{atual.corpo}</div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{FASES[d.fase]}</p>
              <h2 id="passo-titulo" ref={titulo} tabIndex={-1} className="mt-1 text-2xl font-semibold tracking-tight outline-none">
                {p.done ? "Negócio fechado" : p.wait ? p.t : "Está tudo. " + p.t + "."}
              </h2>
              {p.sub && <p className="mt-2 text-base text-muted-foreground">{p.sub}</p>}
              {quem && <p className="mt-2 text-base text-muted-foreground">Este passo é de {quem}.</p>}
            </>
          )}
        </div>

        {/* Um só botão primário: Continuar, ou o passo do negócio no fim */}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6">
          <Button variant="ghost" size="lg" disabled={ativo === 0} onClick={() => setAtivo(Math.max(0, ativo - 1))}>Anterior</Button>
          {fim
            ? (temBotaoFase(ctx, d) ? <BotaoFase ctx={ctx} d={d} /> : null)
            : <div className="flex flex-wrap items-center gap-3">
              {temBotaoFase(ctx, d) && meu && p.btn && (
                <button type="button" className="min-h-11 px-2 text-[15px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  onClick={() => setAtivo(passos.length)}>Ir para "{p.btn}"</button>
              )}
              <Button size="lg" onClick={() => setAtivo(ativo + 1)}>Continuar</Button>
            </div>}
        </div>
      </section>
    </>
  );
}

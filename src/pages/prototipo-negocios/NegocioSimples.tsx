// Proposta de 09/10/2026: a página do negócio com menos ruído.
// Uma coisa de cada vez: o passo atual ocupa o ecrã, os outros ficam numa
// lista à esquerda. Um só botão primário. Texto a 15–16 px, contraste AA.
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Euro, MapPin, Phone, Square, TrendingUp, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FASES, LINHAS, PAPEIS, eur, pct, proximo, tot, type Negocio } from "./motor";
import { CONTACTO, FINANCEIRO, LEAD, OBRA, PROPOSTA, EXTERIOR, INTERIOR, AREA, ESCOLHAS, type Grupo } from "./campos";
import { Campos, type Passo } from "./CamposFase";
import { BotaoFase, passosDaFase, temBotaoFase } from "./PaginaNegocio";
import { OrcamentoSimples } from "./OrcamentoSimples";
import { DocumentosSimples } from "./FasesSimples";
import { ContratoDoc, Partilhar, PropostaDoc } from "./DocsCliente";
import { ServicosCatalogo } from "./ServicosCatalogo";
import { nfmt, type MedKey } from "./motor";
import { FASE_COR, IconeFase, type Ctx } from "./pecas";

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
  // ao passar de fase: uma frase curta a dizer o que acabou e o que vem, que desaparece sozinha
  const faseAntes = useRef(d.fase);
  const [acabou, setAcabou] = useState<number | null>(null);
  useEffect(() => {
    if (d.fase > faseAntes.current) {
      setAcabou(faseAntes.current); setVer(null);
      const t = setTimeout(() => setAcabou(null), 5000);
      faseAntes.current = d.fase;
      return () => clearTimeout(t);
    }
    faseAntes.current = d.fase;
  }, [d.fase]);
  const local = d.f.localidade || d.local.split(",").pop()!.trim();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-8 sm:pt-10">
      <button type="button" onClick={go(() => A.nav("negocios"))}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg text-[15px] text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Negócios
      </button>

      <header className="mt-2 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)] sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <IconeFase fase={d.fase} tam="lg" />
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{d.nome}</h1>
              <p className="text-base text-muted-foreground">{d.servico}</p>
            </div>
          </div>
          {d.fase < 4 && !d.perdido && (
            <button type="button" onClick={go(() => A.perder(d.id))} className="min-h-11 self-start rounded-lg px-1 text-[15px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              Marcar como perdido
            </button>
          )}
        </div>
        <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-[15px]">
          <div className="inline-flex items-center gap-2"><dt><Phone className="h-4 w-4 text-muted-foreground" aria-label="Telefone" /></dt><dd>{d.tel}</dd></div>
          {local && <div className="inline-flex items-center gap-2"><dt><MapPin className="h-4 w-4 text-muted-foreground" aria-label="Local" /></dt><dd>{local}</dd></div>}
          {T && <div className="inline-flex items-center gap-2"><dt><Euro className="h-4 w-4 text-muted-foreground" aria-label="Total" /></dt><dd className="font-semibold tabular-nums">{eur(T.pf)} €</dd></div>}
          {T && <div className="inline-flex items-center gap-2"><dt><TrendingUp className="h-4 w-4 text-muted-foreground" aria-label="Margem" /></dt><dd className={cn("tabular-nums", T.m < S.cfg.min / 100 ? "text-destructive" : T.m < S.cfg.alvo / 100 - 0.005 ? "text-warning" : "text-success")}>margem {pct(T.m)}</dd></div>}
        </dl>
        <div className="mt-6">
          <ol className="grid grid-cols-6 gap-1.5" aria-label="Fases do negócio">
            {FASES.map((f, i) => (
              <li key={f} aria-current={i === d.fase ? "step" : undefined}>
                <span className={cn("block h-2 rounded-full transition-colors duration-500", i < d.fase ? "bg-primary" : i === d.fase ? "bg-primary/50" : "bg-muted")} />
                <span className={cn("mt-1.5 hidden truncate text-xs sm:block", i === d.fase ? "font-semibold text-foreground" : i < d.fase ? "text-foreground/70" : "text-muted-foreground")}>{f}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[15px] text-muted-foreground sm:hidden" aria-live="polite">
            Fase {d.fase + 1} de 6: <span className="font-semibold text-foreground">{FASES[d.fase]}</span>{d.fase < 5 && <> · depois: {FASES[d.fase + 1]}</>}
          </p>
        {d.fase > 0 && (
          <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden" aria-label="Fases feitas">
            {FASES.slice(0, d.fase).map((f, i) => (
              <button key={f} type="button" onClick={() => setVer(ver === i ? null : i)} aria-pressed={ver === i}
                className={cn("inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm", ver === i ? "border-foreground bg-foreground text-background" : "border-input text-foreground")}>
                <Check className="h-3.5 w-3.5" aria-hidden="true" />{f}
              </button>
            ))}
          </div>
        )}
        </div>
      </header>
      {S.confirmPerda === d.id && (
        <div role="alertdialog" aria-label="Confirmar" className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 animate-in fade-in-0">
          <p className="flex-1 text-[15px]">Marcar como perdido? Sai do quadro, mas fica no histórico.</p>
          <Button variant="outline" onClick={go(() => A.perderNao())}>Cancelar</Button>
          <Button variant="destructive" onClick={go(() => A.perderSim(d.id))}>Marcar como perdido</Button>
        </div>
      )}

      {acabou !== null && (
        <div role="status" className="mt-6 flex items-center gap-3 rounded-xl border border-success/30 bg-success/[0.08] px-4 py-3 text-[15px] animate-in fade-in-0 slide-in-from-top-2 duration-500">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-success text-white animate-in zoom-in-50 duration-500"><Check className="h-4 w-4" aria-hidden="true" /></span>
          <span><b className="font-semibold">{FASES[acabou]} concluída.</b> Agora: {FASES[d.fase]}.</span>
        </div>
      )}


      <div className="mt-8 grid items-start gap-10 lg:grid-cols-[260px_minmax(0,1fr)] 2xl:grid-cols-[260px_minmax(0,1fr)_240px]">
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
                {ver === 2 && (
                  <div>
                    <h3 className="mb-3 text-base font-semibold">Medidas e fotografias</h3>
                    <p className="text-[15px]">
                      {(Object.entries(LINHAS[d.linha].med) as [MedKey, string][]).map(([k, l]) => `${l} ${nfmt(d.visita.med[k] || 0)}`).join(" · ")} · {d.visita.fotos} fotos
                    </p>
                    {d.visita.nec.length > 0 && <p className="mt-1 text-[15px] text-muted-foreground">Equipamentos pedidos: {d.visita.nec.join(", ")}</p>}
                  </div>
                )}
                {ver === 2 && <div><h3 className="mb-3 text-base font-semibold">Serviços necessários</h3><ServicosCatalogo {...ctx} d={d} simples /></div>}
                {ver === 3 && d.orc && <div><h3 className="mb-3 text-base font-semibold">Orçamento</h3><OrcamentoSimples {...ctx} d={d} /></div>}
                {ver === 3 && d.orc && <div><h3 className="mb-3 text-base font-semibold">Proposta</h3><Partilhar ctx={ctx} d={d} tipo="proposta" estado={d.orc.aceite ? `aceite ${d.orc.aceite}` : "enviada"}><PropostaDoc S={S} d={d} /></Partilhar></div>}
                {ver === 3 && d.orc && !d.orc.vendaDireta && <div><h3 className="mb-3 text-base font-semibold">Contrato</h3><Partilhar ctx={ctx} d={d} tipo="contrato" estado={d.orc.contrato === "assinado" ? "assinado" : "enviado"}><ContratoDoc S={S} d={d} /></Partilhar></div>}
                {ver === 4 && <div><h3 className="mb-3 text-base font-semibold">Fatura e recibo</h3><DocumentosSimples {...ctx} d={d} /></div>}
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

        <aside className="hidden rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)] 2xl:block" aria-label="Cliente">
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

// Quanto falta neste passo, em perguntas e em tempo (≈ 6 s por resposta com botões).
function tempo(p: Passo): string {
  if (!p.conta) return completo(p) ? "feito" : "por fazer";
  const f = p.conta.n - p.conta.f;
  if (f <= 0) return "completo";
  const min = Math.ceil((f * 6) / 60);
  return `falta${f > 1 ? "m" : ""} ${f} ${f === 1 ? "resposta" : "respostas"} · ${min <= 1 ? "menos de 1 minuto" : `cerca de ${min} minutos`}`;
}

// Ler o passo em voz alta (ajuda quem tem dislexia): o título e as perguntas, com o que já está respondido.
function Ouvir() {
  const [a, setA] = useState(false);
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const falar = () => {
    const sy = window.speechSynthesis;
    if (a) { sy.cancel(); setA(false); return; }
    const titulo = document.getElementById("passo-titulo")?.textContent || "";
    const linhas = [...document.querySelectorAll<HTMLElement>('#passo-corpo [id$="-rot"]')].map((el) => {
      const linha = el.closest(".grid");
      const escolhido = linha?.querySelector('[aria-pressed="true"]')?.textContent || (linha?.querySelector("input,textarea") as HTMLInputElement | null)?.value || linha?.querySelector("output")?.textContent || "";
      return el.textContent + (escolhido && escolhido !== "—" ? ": " + escolhido : ": por responder");
    });
    const u = new SpeechSynthesisUtterance([titulo, ...linhas].join(". "));
    u.lang = "pt-PT"; u.rate = 0.95;
    u.onend = () => setA(false);
    sy.cancel(); sy.speak(u); setA(true);
  };
  return (
    <button type="button" onClick={falar} aria-pressed={a}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
      {a ? <Square className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}{a ? "Parar" : "Ouvir"}
    </button>
  );
}

type Lat = (passos: Passo[], ativo: number, setAtivo: (i: number) => void) => React.ReactNode;

function Lateral({ d, passos, ativo, setAtivo, verFase, vendo }: { d: Negocio; passos: Passo[]; ativo: number; setAtivo: (i: number) => void; verFase: (i: number | null) => void; vendo?: number }) {
  return (
    <nav aria-label="Passos desta fase" className="hidden rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-sm)] lg:sticky lg:top-6 lg:block">
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
                      p.falta ? "border-destructive bg-destructive text-destructive-foreground" : ok ? "border-primary bg-primary text-primary-foreground" : i === ativo ? "border-foreground" : "border-input")}>
                      {p.falta ? "!" : ok && <Check className="h-3 w-3" aria-hidden="true" />}
                    </span>
                    <span className="min-w-0 flex-1">{curto(p)}</span>
                    {!!p.falta && <span className="text-sm font-medium text-destructive">falta{p.falta > 1 ? "m" : ""} {p.falta}</span>}
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
          <h2 className={cn("px-3 text-sm font-medium text-muted-foreground", passos.length > 0 && "mt-6 border-t border-border pt-4")}>Fases feitas</h2>
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
  // abre no primeiro passo por fazer; se está tudo feito, abre logo no passo do negócio
  const idx = passos.findIndex((x) => !completo(x));
  const primeiro = idx === -1 ? passos.length : idx;
  const [ativo, setAtivo] = useState(primeiro);
  const titulo = useRef<HTMLHeadingElement>(null);
  const montado = useRef(false);

  // tentou passar de fase com campos em falta: vai para o primeiro passo com falta e põe o cursor no campo
  // "Verificar" e "Ver bloqueios": abre o orçamento na parte "Antes de enviar"
  useEffect(() => {
    if (S.pulse !== "verif") return;
    const i = passos.findIndex((x) => x.id === "orc");
    if (i >= 0 && i !== ativo) setAtivo(i);
    setTimeout(() => document.getElementById("verif")?.scrollIntoView({ behavior: "smooth", block: "start" }), 350);
  });
  useEffect(() => {
    if (S.pulse !== "falta") return;
    const i = passos.findIndex((x) => (x.falta || 0) > 0);
    if (i >= 0 && i !== ativo) setAtivo(i);
    setTimeout(() => (document.querySelector('[aria-invalid="true"]') as HTMLElement | null)?.focus(), 450);
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
        {/* Telemóvel: os passos numa linha (a lista completa fica no computador) */}
        <ol className="-mx-4 mb-6 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden" aria-label="Passos desta fase">
          {passos.map((x, i) => (
            <li key={x.id}>
              <button type="button" onClick={() => setAtivo(i)} aria-current={i === ativo ? "step" : undefined} aria-label={curto(x)}
                className={cn("flex h-9 min-w-9 items-center justify-center whitespace-nowrap rounded-full border px-3 text-sm transition-colors",
                  x.falta ? "border-destructive text-destructive" : i === ativo ? "border-foreground bg-foreground text-background" : completo(x) ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground")}>
                {i === ativo ? curto(x) : completo(x) && !x.falta ? <Check className="h-4 w-4" aria-hidden="true" /> : i + 1}
              </button>
            </li>
          ))}
          {temBotaoFase(ctx, d) && (
            <li><button type="button" onClick={() => setAtivo(passos.length)} aria-current={fim ? "step" : undefined}
              className={cn("flex h-9 items-center rounded-full border px-3 text-sm", fim ? "border-foreground bg-foreground text-background" : "border-input text-muted-foreground")}>Fim</button></li>
          )}
        </ol>
        <div key={ativo} className="animate-in fade-in-0 slide-in-from-right-3 duration-300">
          {!fim && atual ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">Passo {ativo + 1} de {passos.length} · {tempo(atual)}</p>
                <Ouvir />
              </div>
              <div className="mt-2 flex items-center gap-3">
                <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl [&_svg]:h-5 [&_svg]:w-5", FASE_COR[d.fase])} aria-hidden="true"><atual.icone /></span>
                <h2 id="passo-titulo" ref={titulo} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">{curto(atual)}</h2>
              </div>
              <div id="passo-corpo" className="mt-6">{atual.corpo}</div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{FASES[d.fase]}</p>
              <h2 id="passo-titulo" ref={titulo} tabIndex={-1} className="mt-1 text-2xl font-semibold tracking-tight outline-none">
                {p.done ? "Negócio fechado" : p.wait || !passos.every(completo) ? p.t : "Está tudo. " + p.t + "."}
              </h2>
              {p.sub && <p className="mt-2 text-base text-muted-foreground">{p.sub}</p>}
              {quem && <p className="mt-2 text-base text-muted-foreground">Este passo é de {quem}.</p>}
            </>
          )}
        </div>

        {/* Um só botão primário: Continuar, ou o passo do negócio no fim */}
        <div className="mt-10 flex flex-col-reverse gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center justify-between gap-3 sm:justify-start">
            <Button variant="ghost" size="lg" disabled={ativo === 0} onClick={() => setAtivo(Math.max(0, ativo - 1))}>Anterior</Button>
            {!fim && temBotaoFase(ctx, d) && meu && p.btn && (
              <button type="button" className="min-h-11 px-2 text-[15px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:hidden"
                onClick={() => setAtivo(passos.length)}>Ir para o fim</button>
            )}
          </div>
          {fim
            ? (temBotaoFase(ctx, d) ? <div className="[&_button]:w-full sm:[&_button]:w-auto"><BotaoFase ctx={ctx} d={d} /></div> : null)
            : <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {temBotaoFase(ctx, d) && meu && p.btn && (
                <button type="button" className="hidden min-h-11 px-2 text-[15px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:block"
                  onClick={() => setAtivo(passos.length)}>Ir para "{p.btn}"</button>
              )}
              <Button size="lg" className="w-full sm:w-auto" onClick={() => setAtivo(ativo + 1)}>Continuar</Button>
            </div>}
        </div>
      </section>
    </>
  );
}

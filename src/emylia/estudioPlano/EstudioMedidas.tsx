// 9/11 (Rúben: «… e um pequeno à parte para o supervisor validar as medidas e fazer correções»). O Estúdio das medidas: o supervisor, no
// local, com o telemóvel. A planta da visita (corrige-se uma parede com o dedo, e o chão e as paredes em m² saem dela), cada medida com
// o valor da visita ao lado e botões grandes de − e +, as notas, e «Aceitar as medidas» fixo em baixo (A.retificarMedidas; a planta
// corrigida fica em f.retif_planta). As Operações aprovam o plano depois.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Minus, Plus, RotateCcw, Ruler, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LINHAS, camposMedida, eur, impactoDasMedidas, medida, nfmt, type Negocio } from "../motor";
import type { Ctx } from "../pecas";
import { NaFrente } from "../NaFrente";
import { EditorPlanta } from "../EditorPlanta";
import { areaChaoM2, areaParedesM2, gravarPlanta, lerPlanta, peDireitoDoCampo, type Planta } from "../planta";
import { Brilho, Contagem, MOLA, VistoDesenho, useReduzir } from "../movimento";
import { podeRetificar } from "../preparacaoObra";
import { ImpactoNoOrcamento, linhasDoImpacto } from "./ImpactoNoOrcamento";
import { permEmFaltaDoPasso } from "../permissoes";

const numero = (s: string) => Number(String(s).replace(",", "."));
const r2 = (n: number) => Math.round(n * 100) / 100;

export function EstudioMedidas({ ctx, d, fechar }: { ctx: Ctx; d: Negocio; fechar: () => void }) {
  const reduzir = useReduzir();
  const CM = camposMedida(LINHAS[d.linha]);
  const [planta, setPlanta] = useState<Planta | null>(() => lerPlanta(d.f.retif_planta) ?? lerPlanta(d.f.planta));
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(CM.map(([k]) => [k, d.f[`retif_${k}`] ?? String(medida(d.visita.med, k) || 0)])));
  const [notas, setNotas] = useState(d.f.retif_notas ?? "");
  const [feito, setFeito] = useState(false);
  const pe = peDireitoDoCampo(d.f.diag_pe_direito_m) ?? 2.5; // em metros («2,5 m»)
  // o que a planta corrigida dá: o chão e as paredes, em m²
  const daPlanta = useMemo(() => (planta ? { pav: areaChaoM2(planta.paredes), par: areaParedesM2(planta, pe) } : null), [planta, pe]);
  const temPlanta = !!planta && planta.paredes.length >= 3;
  const mudadas = CM.filter(([k]) => Math.abs(numero(valores[k] ?? "0") - medida(d.visita.med, k)) > 0.001).length;
  // 11/11 (Rúben): o impacto no orçamento ao vivo
  const impacto = useMemo(() => impactoDasMedidas(d, ctx.S, Object.fromEntries(CM.map(([k]) => [k, numero(valores[k] ?? "0")]).filter(([, v]) => Number.isFinite(v as number)))),
    [valores, d.orc]); // eslint-disable-line react-hooks/exhaustive-deps
  const dif = mudadas ? impacto?.dif ?? 0 : 0; // sem medidas mudadas, a proposta não se refaz
  const passo = (k: string) => (/pts|ptf|ptq|pcs/.test(k) ? 1 : 0.5);
  const mudar = (k: string, n: number) => setValores((x) => ({ ...x, [k]: String(Math.max(0, r2(n))) }));
  // 11/11: − e + somam a partir do valor atual (manter o dedo carregado repete)
  const somar = (k: string, delta: number) => setValores((x) => { const v = numero(x[k] ?? "0"); return { ...x, [k]: String(Math.max(0, r2((Number.isFinite(v) ? v : 0) + delta))) }; });
  // 11/11 (Rúben: «ao ajustar paredes na planta, os campos de baixo não acompanham e o impacto fica "Sem impacto"»): cada mudança na planta
  // passa logo o chão e as paredes (m²) para as medidas; as outras medidas (os pontos de água, os módulos…) ficam como se escreveram
  const mudarPlanta = (np: Planta) => {
    setPlanta(np);
    const pav = np.paredes.length >= 3 ? areaChaoM2(np.paredes) : null, par = np.paredes.length >= 3 ? areaParedesM2(np, pe) : null;
    setValores((x) => ({ ...x, ...(pav != null && "pav" in x ? { pav: String(r2(pav)) } : {}), ...(par != null && "par" in x ? { par: String(r2(par)) } : {}) }));
  };
  const aceitar = () => {
    ctx.run(() => {
      if (planta && temPlanta) ctx.A.campo(d.id, "retif_planta", gravarPlanta(planta));
      ctx.A.retificarMedidas(d.id, Object.fromEntries(CM.map(([k]) => [k, numero(valores[k] ?? "0")]).filter(([, v]) => Number.isFinite(v as number))), notas);
    });
    setFeito(true);
    window.setTimeout(fechar, reduzir ? 0 : 1100);
  };

  return (
    <NaFrente>
      <motion.div role="dialog" aria-modal="true" aria-labelledby="estudio-medidas-titulo" className="fixed inset-0 flex flex-col bg-background"
        initial={reduzir ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}>
        <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
          <Button type="button" variant="ghost" className="min-h-11" aria-label="Voltar" onClick={fechar}><ArrowLeft className="h-5 w-5" /></Button>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Medidas no local</p>
            <h1 id="estudio-medidas-titulo" className="truncate text-lg font-semibold">{d.nome}</h1>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          {/* 11/11 (Rúben: «ao alterar as medidas deve logo mostrar de lado o impacto no orçamento e porquê»): as medidas à esquerda, o impacto
              ao lado (no telemóvel, por baixo), linha a linha */}
          <div className="mx-auto grid max-w-6xl items-start gap-6 px-4 py-5 pb-32 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0 space-y-6">
            {temPlanta && planta && (
              <section aria-label="A planta" className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h2 className="text-[17px] font-semibold">A planta</h2>
                    <p className="text-sm text-muted-foreground">Toque numa parede para corrigir a medida.</p>
                  </div>
                  {daPlanta && (daPlanta.pav != null || daPlanta.par != null) && (
                    <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Wand2 className="h-4 w-4 text-primary" aria-hidden="true" />Dá {daPlanta.pav != null ? `${nfmt(daPlanta.pav)} m² de chão` : ""}{daPlanta.pav != null && daPlanta.par != null ? " e " : ""}{daPlanta.par != null ? `${nfmt(daPlanta.par)} m² de paredes` : ""}: as medidas em baixo seguem a planta</p>
                  )}
                </div>
                <EditorPlanta planta={planta} onMudar={mudarPlanta} divisao={d.f.diag_tipo_area?.split(",")[0]} />
              </section>
            )}

            <section aria-label="As medidas" className="space-y-3">
              <h2 className="flex items-center gap-2 text-[17px] font-semibold"><Ruler className="h-5 w-5 text-primary" aria-hidden="true" />As medidas</h2>
              {CM.map(([k, l]) => {
                const antes = medida(d.visita.med, k), v = numero(valores[k] ?? "0"), dif = Number.isFinite(v) ? r2(v - antes) : 0;
                const mudou = Math.abs(dif) > 0.001;
                // 11/11: a visita e o agora, em duas barras que crescem; «Repor» volta ao da visita
                const agora = Number.isFinite(v) ? v : 0, topo = Math.max(antes, agora, 0.01) * 1.1;
                return (
                  <motion.div key={k} layout={!reduzir} className={cn("rounded-2xl border bg-card p-4 transition-colors", mudou ? "border-amber-300 shadow-sm dark:border-amber-800" : "border-border")}>
                    <div className="flex min-h-8 items-center justify-between gap-2">
                      <p className="text-[15px] font-medium">{l}</p>
                      {mudou ? (
                        <button type="button" onClick={() => mudar(k, antes)}
                          className="inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />Repor {nfmt(antes)}</button>
                      ) : <p className="text-sm text-muted-foreground">Na visita: {nfmt(antes)}</p>}
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <BotaoRepete rotulo={`${l}: menos`} fazer={() => somar(k, -passo(k))}><Minus className="h-6 w-6" /></BotaoRepete>
                      <input aria-label={l} inputMode="decimal" value={valores[k] ?? ""} onChange={(e) => setValores((x) => ({ ...x, [k]: e.target.value }))}
                        className={cn("h-14 min-w-0 flex-1 rounded-2xl border bg-background text-center text-2xl font-semibold tabular-nums transition-colors", mudou ? "border-amber-300 dark:border-amber-800" : "border-input")} />
                      <BotaoRepete rotulo={`${l}: mais`} fazer={() => somar(k, passo(k))}><Plus className="h-6 w-6" /></BotaoRepete>
                    </div>
                    <div aria-hidden="true" className="mt-3 space-y-1">
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><motion.div className="h-full rounded-full bg-foreground/25" initial={false} animate={{ width: `${(antes / topo) * 100}%` }} /></div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><motion.div className={cn("h-full rounded-full", mudou ? "bg-amber-500" : "bg-primary")} initial={false} animate={{ width: `${(agora / topo) * 100}%` }} transition={reduzir ? { duration: 0 } : MOLA} /></div>
                    </div>
                    <AnimatePresence>
                      {mudou && (
                        <motion.p initial={reduzir ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                          className="mt-2 flex flex-wrap items-center gap-1.5 text-sm font-medium text-amber-800 dark:text-amber-300">{nfmt(antes)}<ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />{nfmt(agora)} · {dif > 0 ? "+" : ""}{nfmt(dif)} em relação à visita</motion.p>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
              {!CM.length && <p className="text-[15px] text-muted-foreground">Esta obra não tem medidas para conferir: escreva nas notas o que viu no local.</p>}
            </section>

            <label className="grid gap-1.5 text-[15px] font-medium">Notas para as Operações
              <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={4} placeholder="Ex.: a parede do fundo tem mais 10 cm; a base cabe com 5 cm de folga; há um tubo a passar na parede da janela"
                className="rounded-2xl border border-input bg-background px-4 py-3 text-[15px]" />
            </label>
          </div>
          {impacto && CM.length > 0 && (
            <aside className="lg:sticky lg:top-4">
              <ImpactoNoOrcamento atual={impacto.atual} linhas={linhasDoImpacto(mudadas, impacto)} detalhe={mudadas ? impacto.linhas : []} />
            </aside>
          )}
          </div>
        </div>

        {/* «Aceitar», fixo em baixo */}
        <div className="border-t border-border bg-card/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground" aria-live="polite">{mudadas
              ? <>{mudadas} {mudadas === 1 ? "medida corrigida" : "medidas corrigidas"}{Math.abs(dif) > 0.004 && <> · <span className="font-semibold text-foreground">{dif > 0 ? "+" : "−"}<Contagem valor={Math.abs(dif)} fmt={eur} /> €</span><span className="sr-only">{eur(Math.abs(dif))} €</span> no orçamento</>}. Antes do contrato, a proposta refaz-se com o orçamento novo.</>
              : "Tudo como na visita."}</p>
            <Button type="button" size="lg" className="min-h-12 shrink-0" disabled={feito || !podeRetificar(d)} onClick={aceitar}><Check className="mr-1.5 h-5 w-5" aria-hidden="true" />Aceitar as medidas</Button>
          </div>
        </div>

        <AnimatePresence>
          {feito && (
            <motion.div className="pointer-events-none fixed inset-0 grid place-items-center bg-background/70" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div initial={reduzir ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }}
                className="flex flex-col items-center gap-3 rounded-3xl bg-card px-10 py-8 shadow-2xl">
                <span className="relative grid h-16 w-16 place-items-center rounded-full bg-success/15 text-success"><Brilho ativo /><VistoDesenho on grande className="h-9 w-9" /></span>
                <p className="text-lg font-semibold">Medidas aceites</p>
                <p className="text-sm text-muted-foreground">As Operações já podem aprovar o plano.</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </NaFrente>
  );
}

/** − ou +: um toque soma um passo; manter carregado repete (cada vez mais depressa). */
function BotaoRepete({ rotulo, fazer, children }: { rotulo: string; fazer: () => void; children: ReactNode }) {
  const t = useRef<number | null>(null);
  const f = useRef(fazer);
  f.current = fazer;
  const parar = () => { if (t.current != null) window.clearTimeout(t.current); t.current = null; };
  useEffect(() => parar, []);
  const repetir = (ms: number) => { t.current = window.setTimeout(() => { f.current(); repetir(Math.max(50, ms * 0.8)); }, ms); };
  return (
    <motion.button type="button" aria-label={rotulo} whileTap={{ scale: 0.9 }}
      onPointerDown={(e) => { if (e.button !== 0) return; repetir(450); }} onPointerUp={parar} onPointerLeave={parar} onPointerCancel={parar}
      onClick={() => f.current()}
      className="grid h-14 w-14 shrink-0 select-none place-items-center rounded-2xl border border-input bg-card text-foreground shadow-sm hover:bg-muted" style={{ touchAction: "manipulation" }}>
      {children}
    </motion.button>
  );
}

/** O que abre o Estúdio das medidas (no passo «Medidas»): as medidas da visita, a conferir; tocar abre o Estúdio. 11/11: um cartão vivo. */
export function AbrirEstudioMedidas({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const [aberto, setAberto] = useState(false);
  const reduzir = useReduzir();
  // 11/11 (F3): sem negocios.obra.planear o estúdio não abre (aceitar as medidas pede-a; o aviso fica no passo)
  if (d.f.retif_aceite || !podeRetificar(d) || permEmFaltaDoPasso(ctx.S, "retificarMedidas")) return null;
  const CM = camposMedida(LINHAS[d.linha]);
  return (
    <>
      <motion.button type="button" onClick={() => setAberto(true)} whileHover={reduzir ? undefined : { y: -2 }} whileTap={reduzir ? undefined : { scale: 0.99 }}
        className="group relative block w-full overflow-hidden rounded-3xl border border-border bg-card p-5 text-left shadow-sm transition-shadow hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
        <span className="relative block text-xs font-semibold uppercase tracking-[0.16em] text-primary">Estúdio das medidas</span>
        <span className="relative mt-1 block text-lg font-semibold tracking-tight">Conferir as medidas no local</span>
        {CM.length > 0 && (
          <span className="relative mt-3 flex flex-wrap gap-2">
            {CM.slice(0, 6).map(([k, l], i) => (
              <motion.span key={k} initial={reduzir ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduzir ? 0 : 0.05 * i }}
                className="rounded-full bg-muted px-3 py-1 text-sm"><span className="text-muted-foreground">{l.split(" (")[0]}</span> <b className="font-semibold tabular-nums">{nfmt(medida(d.visita.med, k))}</b></motion.span>
            ))}
          </span>
        )}
        <span className="relative mt-4 inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 text-[15px] font-medium text-primary-foreground shadow-sm transition-transform group-hover:translate-x-0.5">
          <Ruler className="h-5 w-5" aria-hidden="true" />Abrir o estúdio das medidas<ArrowRight className="h-4 w-4" aria-hidden="true" />
        </span>
      </motion.button>
      {aberto && <EstudioMedidas ctx={ctx} d={d} fechar={() => setAberto(false)} />}
    </>
  );
}

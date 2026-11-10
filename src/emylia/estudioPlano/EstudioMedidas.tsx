// 9/11 (Rúben: «… e um pequeno à parte para o supervisor validar as medidas e fazer correções»). O Estúdio das medidas: o supervisor, no
// local, com o telemóvel. A planta da visita (corrige-se uma parede com o dedo, e o chão e as paredes em m² saem dela), cada medida com
// o valor da visita ao lado e botões grandes de − e +, as notas, e «Aceitar as medidas» fixo em baixo (A.retificarMedidas; a planta
// corrigida fica em f.retif_planta). As Operações aprovam o plano depois.
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, Minus, Plus, Ruler, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LINHAS, camposMedida, medida, nfmt, type Negocio } from "../motor";
import type { Ctx } from "../pecas";
import { NaFrente } from "../NaFrente";
import { EditorPlanta } from "../EditorPlanta";
import { areaChaoM2, areaParedesM2, gravarPlanta, lerPlanta, peDireitoDoCampo, type Planta } from "../planta";
import { useReduzir } from "../movimento";
import { podeRetificar } from "../preparacaoObra";

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
  const passo = (k: string) => (/pts|ptf|ptq|pcs/.test(k) ? 1 : 0.5);
  const mudar = (k: string, n: number) => setValores((x) => ({ ...x, [k]: String(Math.max(0, r2(n))) }));
  const usarPlanta = () => {
    if (!daPlanta) return;
    setValores((x) => ({ ...x, ...(daPlanta.pav != null && "pav" in x ? { pav: String(daPlanta.pav) } : {}), ...(daPlanta.par != null && "par" in x ? { par: String(daPlanta.par) } : {}) }));
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
          <div className="mx-auto max-w-2xl space-y-6 px-4 py-5 pb-32">
            {temPlanta && planta && (
              <section aria-label="A planta" className="space-y-3">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h2 className="text-[17px] font-semibold">A planta</h2>
                    <p className="text-sm text-muted-foreground">Toque numa parede para corrigir a medida.</p>
                  </div>
                  {daPlanta && (daPlanta.pav != null || daPlanta.par != null) && (
                    <p className="text-sm text-muted-foreground">Dá {daPlanta.pav != null ? `${nfmt(daPlanta.pav)} m² de chão` : ""}{daPlanta.pav != null && daPlanta.par != null ? " e " : ""}{daPlanta.par != null ? `${nfmt(daPlanta.par)} m² de paredes` : ""}</p>
                  )}
                </div>
                <EditorPlanta planta={planta} onMudar={setPlanta} divisao={d.f.diag_tipo_area?.split(",")[0]} />
                {daPlanta && <Button type="button" variant="outline" className="min-h-11" onClick={usarPlanta}><Wand2 className="mr-1.5 h-4 w-4" aria-hidden="true" />Usar as medidas da planta</Button>}
              </section>
            )}

            <section aria-label="As medidas" className="space-y-3">
              <h2 className="flex items-center gap-2 text-[17px] font-semibold"><Ruler className="h-5 w-5 text-primary" aria-hidden="true" />As medidas</h2>
              {CM.map(([k, l]) => {
                const antes = medida(d.visita.med, k), v = numero(valores[k] ?? "0"), dif = Number.isFinite(v) ? r2(v - antes) : 0;
                return (
                  <motion.div key={k} layout={!reduzir} className={cn("rounded-2xl border bg-card p-4", Math.abs(dif) > 0.001 ? "border-amber-300 dark:border-amber-800" : "border-border")}>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[15px] font-medium">{l}</p>
                      <p className="text-sm text-muted-foreground">Na visita: {nfmt(antes)}</p>
                    </div>
                    <div className="mt-3 flex items-center gap-3">
                      <button type="button" aria-label={`${l}: menos`} onClick={() => mudar(k, v - passo(k))} className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-input text-foreground active:scale-95"><Minus className="h-6 w-6" /></button>
                      <input aria-label={l} inputMode="decimal" value={valores[k] ?? ""} onChange={(e) => setValores((x) => ({ ...x, [k]: e.target.value }))}
                        className="h-14 min-w-0 flex-1 rounded-2xl border border-input bg-background text-center text-2xl font-semibold tabular-nums" />
                      <button type="button" aria-label={`${l}: mais`} onClick={() => mudar(k, v + passo(k))} className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-input text-foreground active:scale-95"><Plus className="h-6 w-6" /></button>
                    </div>
                    <AnimatePresence>
                      {Math.abs(dif) > 0.001 && (
                        <motion.p initial={reduzir ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                          className="mt-2 text-sm font-medium text-amber-800 dark:text-amber-300">{dif > 0 ? "+" : ""}{nfmt(dif)} em relação à visita</motion.p>
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
        </div>

        {/* «Aceitar», fixo em baixo */}
        <div className="border-t border-border bg-card/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{mudadas ? `${mudadas} ${mudadas === 1 ? "medida corrigida" : "medidas corrigidas"}. Antes do contrato, a proposta refaz-se com o orçamento novo.` : "Tudo como na visita."}</p>
            <Button type="button" size="lg" className="min-h-12 shrink-0" disabled={feito || !podeRetificar(d)} onClick={aceitar}><Check className="mr-1.5 h-5 w-5" aria-hidden="true" />Aceitar as medidas</Button>
          </div>
        </div>

        <AnimatePresence>
          {feito && (
            <motion.div className="pointer-events-none fixed inset-0 grid place-items-center bg-background/70" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div initial={reduzir ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 260, damping: 18 }}
                className="flex flex-col items-center gap-3 rounded-3xl bg-card px-10 py-8 shadow-2xl">
                <span className="grid h-16 w-16 place-items-center rounded-full bg-success text-white"><Check className="h-9 w-9" aria-hidden="true" /></span>
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

/** O botão que abre o Estúdio das medidas (no passo «Retificação de medidas»). */
export function AbrirEstudioMedidas({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const [aberto, setAberto] = useState(false);
  if (d.f.retif_aceite || !podeRetificar(d)) return null;
  return (
    <>
      <Button type="button" size="lg" className="min-h-12 w-full sm:w-auto" onClick={() => setAberto(true)}><Ruler className="mr-1.5 h-5 w-5" aria-hidden="true" />Abrir o estúdio das medidas</Button>
      {aberto && <EstudioMedidas ctx={ctx} d={d} fechar={() => setAberto(false)} />}
    </>
  );
}

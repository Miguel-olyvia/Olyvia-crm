// O previsto contra o real, por fase da obra (14/10/2026). Na obra concluída, cada fase mostra os dias e o custo
// previstos no orçamento (planoObra.ts) ao lado dos reais: a barra tracejada é o previsto, a cheia é o real, na mesma
// régua de dias úteis. Em cima, o resumo (dias, custo e margem) e a fase que mais se afastou, com o porquê.
// Cores: a rampa das fases (COR_FASE); o desvio diz-se em texto e com sinal, nunca só com a cor.
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { eur, nfmt, pct, type Estado, type Negocio } from "./motor";
import { COR_FASE, maiorDesvio, realPorFase } from "./planoObra";

const dias = (n: number) => `${nfmt(n)} ${n === 1 ? "dia" : "dias"}`;
const sinal = (n: number, fmt: (x: number) => string) => (Math.abs(n) < 0.005 ? "igual" : `${n > 0 ? "+" : "−"}${fmt(Math.abs(n))}`);

export function ObraPorFases({ S, d }: { S: Estado; d: Negocio }) {
  const R = realPorFase(d, S);
  if (!R) return null;
  const escala = Math.max(R.diasPrev, R.diasReal, 1);
  const pos = (x: number) => `${(x / escala) * 100}%`;
  const D = maiorDesvio(R);
  const dDias = R.diasReal - R.diasPrev, dCusto = R.custoReal - R.custoPrev;
  const mPrev = R.preco > 0 ? (R.preco - R.custoPrev) / R.preco : 0, mReal = R.preco > 0 ? (R.preco - R.custoReal) / R.preco : 0;
  return (
    <section aria-labelledby={`real-fases-${d.id}`} className="space-y-4">
      <h3 id={`real-fases-${d.id}`} className="text-base font-semibold">Previsto e real, por fase</h3>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 [&>div]:min-w-0">
        <div><dt className="text-sm text-muted-foreground">Dias úteis</dt><dd className="text-xl font-semibold tabular-nums">{nfmt(R.diasReal)} <span className="text-[15px] font-normal text-muted-foreground">de {nfmt(R.diasPrev)} · {sinal(dDias, (x) => dias(x))}</span></dd></div>
        <div><dt className="text-sm text-muted-foreground">Custo</dt><dd className="text-xl font-semibold tabular-nums">{eur(R.custoReal)} € <span className="block text-[15px] font-normal text-muted-foreground">previsto {eur(R.custoPrev)} € · {sinal(dCusto, (x) => `${eur(x)} €`)}</span></dd></div>
        <div><dt className="text-sm text-muted-foreground">Margem</dt><dd className="text-xl font-semibold tabular-nums">{pct(mReal)} <span className="block text-[15px] font-normal text-muted-foreground">orçada {pct(mPrev)}</span></dd></div>
      </dl>

      {D && (
        <p className={cn("flex items-start gap-2 rounded-xl border p-3 text-[15px]", D.euros > 0 ? "border-warning/40 bg-warning/[0.06]" : "border-success/30 bg-success/[0.06]")}>
          {D.euros > 0 ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />}
          <span>
            A fase {D.fase.n} ({D.fase.curto.toLowerCase()}) foi a que mais se afastou: {sinal(D.euros, (x) => `${eur(x)} €`)}
            {D.fase.real.dias !== D.fase.prev.dias && ` e ${sinal(D.fase.real.dias - D.fase.prev.dias, (x) => dias(x))}`}.
            {" "}{D.tarefa.nome} levou {nfmt(D.tarefa.hReal)} h em vez de {nfmt(D.tarefa.hPrev)} h ({sinal(Math.round((D.tarefa.fator - 1) * 100), (x) => `${x}%`)}).
          </span>
        </p>
      )}

      <ol className="divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-sm)] sm:px-5" aria-label="Fases: previsto e real">
        {R.fases.filter((f) => f.prev.dias > 0 || f.real.dias > 0).map((f) => {
          const dc = f.real.custo - f.prev.custo;
          return (
            <li key={f.n} className="grid gap-2 py-3.5 sm:grid-cols-[170px_minmax(0,1fr)_210px] sm:items-center sm:gap-4">
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-muted-foreground">Fase {f.n}</span>
                <span className="block text-[15px] font-medium">{f.curto}</span>
              </span>
              {/* as duas barras na mesma régua: a tracejada é o previsto, a cheia é o real */}
              <span className="relative block h-9" aria-hidden="true">
                <span className="absolute top-0.5 h-3.5 rounded-full border-2 border-dashed" style={{ left: pos(f.prev.inicio), width: pos(f.prev.dias), borderColor: COR_FASE[f.n] }} />
                <span className="absolute bottom-0.5 h-3.5 rounded-full" style={{ left: pos(f.real.inicio), width: pos(f.real.dias), background: COR_FASE[f.n] }} />
              </span>
              <span className="text-sm tabular-nums sm:text-right">
                <span className="block"><span className="text-muted-foreground">dias </span>{nfmt(f.real.dias)} <span className="text-muted-foreground">de {nfmt(f.prev.dias)}</span></span>
                <span className="block"><span className="text-muted-foreground">custo </span>{eur(f.real.custo)} €
                  {Math.abs(dc) >= 0.5 && <span className={dc > 0 ? "text-destructive" : "text-success"}> {sinal(dc, (x) => eur(x))}</span>}</span>
                {f.preco > 0 && <span className="block whitespace-nowrap text-muted-foreground">margem {pct(f.margemReal)} · orçada {pct(f.margemPrev)}</span>}
              </span>
              <span className="sr-only">Previsto: {dias(f.prev.dias)} e {eur(f.prev.custo)} €. Real: {dias(f.real.dias)} e {eur(f.real.custo)} €.</span>
            </li>
          );
        })}
      </ol>
      <p className="flex flex-wrap gap-4 text-sm text-muted-foreground" aria-hidden="true">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-6 rounded-full border-2 border-dashed border-foreground/50" />previsto no orçamento</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-6 rounded-full bg-foreground/60" />real</span>
      </p>
    </section>
  );
}

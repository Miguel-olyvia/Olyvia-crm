// "Números" no V1 (16/10/2026): o que a Direção vem ver. Uma pergunta por bloco, números grandes em vez de gráficos de enfeite,
// e barras de uma só cor (o acento) com o valor escrito ao lado: nada depende só da cor (F3, A14).
// Primeiro o que pede uma decisão (o único primário); depois como está o negócio; depois de onde vem e porque se perde.
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PAPEIS, eur, pct, tot } from "./motor";
import { fraseFunil, numeros } from "./numerosV1Docs";
import type { Ctx } from "./pecas";

const LISTA = "divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-sm)] sm:px-5";

/** Uma barra horizontal: a parte (0–1) desenhada com transform (M1), o rótulo e o valor sempre em texto. */
function Barra({ nome, valor, parte }: { nome: string; valor: string; parte: number }) {
  return (
    <li className="py-3 sm:px-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="min-w-0 text-[15px]">{nome}</span>
        <span className="shrink-0 text-[15px] font-medium tabular-nums">{valor}</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full origin-left rounded-full bg-primary transition-transform duration-500 motion-reduce:transition-none" style={{ transform: `scaleX(${Math.max(parte, 0.01)})` }} />
      </div>
    </li>
  );
}

export function NumerosV1({ S, A, go }: Ctx) {
  const N = numeros(S), min = S.cfg.min / 100;
  const ehDirecao = S.role === "direcao";
  const primeira = N.decidir[0];
  const maxOrigem = Math.max(1, ...N.origens.map((o) => o.n));
  const maxPerda = Math.max(1, ...N.perdas.map((o) => o.n));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-8 sm:pt-10">
      <h1 className="text-3xl font-semibold tracking-tight">Números</h1>
      <p className="mt-1 text-base text-muted-foreground">{S.deals.length} negócios · contas feitas agora, com o que está no protótipo</p>

      {/* R3 o que pede uma decisão: o único primário do ecrã */}
      <section aria-labelledby="decidir" className={cn("mt-8 rounded-2xl border bg-card p-5 sm:p-6", primeira ? "border-primary/25 shadow-[var(--shadow-md)]" : "border-border shadow-[var(--shadow-sm)]")}>
        <h2 id="decidir" className="text-sm font-medium text-primary">Pede a sua decisão</h2>
        {primeira ? (
          <>
            <p className="mt-2 text-xl font-semibold">
              {N.decidir.length === 1 ? "Uma exceção à margem por aprovar" : `${N.decidir.length} exceções à margem por aprovar`}
            </p>
            <p className="mt-1 text-base text-muted-foreground">
              {primeira.nome} · {primeira.servico} · margem {pct(tot(primeira, S).m)}, abaixo do mínimo de {S.cfg.min}%.
            </p>
            {!ehDirecao && (
              <p className="mt-1 text-base text-muted-foreground">
                Este passo é da Direção.{" "}
                <button type="button" onClick={go(() => A.role("direcao"))} className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline">Mudar para {PAPEIS.direcao.n}</button>
              </p>
            )}
            <div className="mt-5"><Button size="lg" className="w-full sm:w-auto" onClick={go(() => A.abrir(primeira.id))}>Ver a exceção de {primeira.nome}</Button></div>
          </>
        ) : (
          <p className="mt-2 flex items-center gap-2 text-lg"><CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />Nada por decidir. As exceções à margem aparecem aqui.</p>
        )}
      </section>

      {/* como está o negócio: quatro números (sem gráfico: é um número que se quer saber) */}
      <section aria-labelledby="como" className="mt-10">
        <h2 id="como" className="text-xl font-semibold tracking-tight">Como está</h2>
        <dl className="mt-3 grid grid-cols-2 overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]">
          {[
            { r: "Em proposta", v: `${eur(N.emProposta)} €`, s: `${N.nProposta} ${N.nProposta === 1 ? "proposta à espera" : "propostas à espera"}` },
            { r: "Ganho", v: `${eur(N.ganho)} €`, s: `${N.nGanhos} ${N.nGanhos === 1 ? "negócio" : "negócios"}` },
            { r: "Conversão", v: N.conversao === null ? "—" : pct(N.conversao), s: "dos que chegaram, quantos ganhámos" },
            { r: "Margem média", v: N.margem === null ? "—" : pct(N.margem), s: N.margem !== null && N.margem < min ? `abaixo do mínimo de ${S.cfg.min}%` : `mínimo ${S.cfg.min}%, alvo ${S.cfg.alvo}%`, mau: N.margem !== null && N.margem < min },
          ].map((k, i) => (
            <div key={k.r} className={cn("min-w-0 p-4 sm:p-5", i % 2 === 1 && "border-l border-border", i > 1 && "border-t border-border")}>
              <dt className="text-[15px] text-muted-foreground">{k.r}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">{k.v}</dd>
              <dd className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
                {k.mau && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />}{k.s}
              </dd>
            </div>
          ))}
        </dl>
        {N.aEspera > 0 && (
          <button type="button" onClick={go(() => { A.filtro("todos"); A.nav("negocios"); })} className="mt-3 inline-flex min-h-11 items-center gap-2 text-[15px] font-medium text-primary underline-offset-4 hover:underline">
            {N.aEspera} {N.aEspera === 1 ? "negócio à espera do cliente" : "negócios à espera do cliente"}: ver em Negócios <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </section>

      {/* o percurso: uma série, uma cor; cada etapa diz quantos e que parte dos que chegaram */}
      <section aria-labelledby="funil" className="mt-10">
        <h2 id="funil" className="text-xl font-semibold tracking-tight">Até onde chegam</h2>
        <p className="mt-1 text-[15px] text-muted-foreground">{fraseFunil(N.funil)}. Cada negócio conta em todas as etapas a que chegou, também os perdidos.</p>
        <ol className={cn("mt-3", LISTA)}>
          {N.funil.map((e) => <Barra key={e.nome} nome={e.nome} valor={`${e.n} · ${pct(e.parte).replace(",0%", "%")}`} parte={e.parte} />)}
        </ol>
      </section>

      <section aria-labelledby="origem" className="mt-10">
        <h2 id="origem" className="text-xl font-semibold tracking-tight">De onde vêm</h2>
        <ul className={cn("mt-3", LISTA)}>
          {N.origens.map((o) => <Barra key={o.nome} nome={o.nome} valor={`${o.n} · ${o.ganhos} ${o.ganhos === 1 ? "ganho" : "ganhos"}`} parte={o.n / maxOrigem} />)}
        </ul>
      </section>

      <section aria-labelledby="perdas" className="mt-10">
        <h2 id="perdas" className="text-xl font-semibold tracking-tight">Porque se perdem</h2>
        {N.nPerdidos === 0
          ? <p className="mt-3 text-[15px] text-muted-foreground">Ainda não há negócios perdidos. Aparecem aqui quando alguém marca uma lead como perdida, com o motivo.</p>
          : <ul className={cn("mt-3", LISTA)}>{N.perdas.map((m) => <Barra key={m.nome} nome={m.nome} valor={String(m.n)} parte={m.n / maxPerda} />)}</ul>}
      </section>
    </div>
  );
}

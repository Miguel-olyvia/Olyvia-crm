// Proposta de 09/10/2026: o Hoje com menos ruído. Uma frase diz quanto há;
// a coisa mais urgente vem primeiro, com o único botão primário; o resto é
// uma lista simples. Sem pastilhas, sem gradientes, sem maiúsculas.
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PAPEIS, aberto, eur, minhas, pct, tot } from "./motor";
import { agenda } from "./Hoje";
import { Progresso, fazer, type Ctx } from "./pecas";

const saudacao = (h: number) => (h < 12 ? "Bom dia" : h < 20 ? "Boa tarde" : "Boa noite");

export function HojeSimples({ S, A, go }: Ctx) {
  const r = S.role, agora = new Date();
  // o mais urgente primeiro: atrasados, depois aprovações, depois o resto
  const L = minhas(S, r).sort((a, b) => Number(!!b.d.atraso) - Number(!!a.d.atraso) || Number(!!b.dir) - Number(!!a.dir));
  const [primeiro, ...resto] = L;
  const ag = agenda(S, r);
  const atrasados = L.filter((x) => x.d.atraso && x.d.fase === 0).length + ag.filter((x) => x.atrasado).length;
  const ab = aberto(S), emNeg = ab.filter((d) => d.fase === 3 && d.orc);

  const frase = L.length === 0
    ? "Não tem nada pendente. Mude de papel no menu para ver o trabalho dos outros."
    : `Tem ${L.length} ${L.length === 1 ? "coisa" : "coisas"} para fazer${atrasados ? `, ${atrasados} com atraso` : ""}.`;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <p className="text-[15px] text-muted-foreground first-letter:uppercase">{format(agora, "EEEE, d 'de' MMMM", { locale: pt })}</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">{saudacao(agora.getHours())}, {PAPEIS[r].nome}</h1>
      <p className="mt-2 text-lg text-muted-foreground">{frase}</p>
      <button type="button" onClick={go(() => A.abrir(1050))} className="mt-3 min-h-10 text-[15px] font-medium text-primary underline-offset-4 hover:underline">
        Ver um exemplo com tudo preenchido (Joana Ribeiro, obra concluída)
      </button>
      {r === "direcao" && (
        <p className="mt-2 text-[15px] text-muted-foreground">
          {ab.length} negócios abertos · {eur(emNeg.reduce((a, d) => a + tot(d, S).pf, 0))} € em proposta · margem média {pct(emNeg.length ? emNeg.reduce((a, d) => a + tot(d, S).m, 0) / emNeg.length : 0)}
        </p>
      )}

      {primeiro && (
        <section aria-labelledby="comecar" className="mt-10 rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-sm)] animate-in fade-in-0 slide-in-from-bottom-2 duration-300">
          <div className="flex items-center justify-between gap-4">
            <h2 id="comecar" className="text-sm font-medium text-muted-foreground">Comece por aqui</h2>
            <Progresso fase={primeiro.d.fase} className="w-28" />
          </div>
          <p className="mt-2 text-xl font-semibold text-foreground">{primeiro.dir ? "Aprovar a exceção à margem" : primeiro.p.t}</p>
          <p className="mt-1 text-base text-muted-foreground">
            {primeiro.d.nome} · {primeiro.d.servico}
            {primeiro.d.atraso && primeiro.d.fase === 0 && <span className="text-destructive"> · atrasado 2 dias</span>}
          </p>
          {primeiro.p.sub && <p className="mt-1 text-base text-muted-foreground">{primeiro.p.sub}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {primeiro.dir
              ? <><Button size="lg" onClick={go(() => A.aprovar(primeiro.d.id))}>Aprovar</Button><Button size="lg" variant="outline" onClick={go(() => A.recusarAprov(primeiro.d.id))}>Recusar</Button></>
              : primeiro.p.btn && <Button size="lg" onClick={go(() => fazer(A, primeiro.p.act!, primeiro.d.id))}>{primeiro.p.btn}</Button>}
            <Button size="lg" variant="ghost" onClick={go(() => A.abrir(primeiro.d.id))}>Abrir o negócio</Button>
          </div>
        </section>
      )}

      {resto.length > 0 && (
        <section aria-labelledby="depois" className="mt-12">
          <h2 id="depois" className="text-lg font-semibold">Depois</h2>
          <ul className="mt-3 divide-y divide-border border-y border-border">
            {resto.map(({ d, p, dir }) => (
              <li key={d.id}>
                <button type="button" onClick={go(() => A.abrir(d.id))}
                  className="group flex min-h-16 w-full items-center gap-4 py-3 text-left transition-colors hover:bg-muted/50 sm:px-2">
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-medium text-foreground">{dir ? "Aprovar a exceção à margem" : p.t}</span>
                    <span className="block text-[15px] text-muted-foreground">{d.nome} · {d.servico}</span>
                  </span>
                  <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="agenda" className="mt-12">
        <h2 id="agenda" className="text-lg font-semibold">Agenda</h2>
        {ag.length === 0
          ? <p className="mt-3 text-[15px] text-muted-foreground">Nada marcado.</p>
          : (
            <ul className="mt-3 divide-y divide-border border-y border-border">
              {ag.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={go(() => A.abrir(c.d.id))}
                    className="group flex min-h-16 w-full items-center gap-4 py-3 text-left transition-colors hover:bg-muted/50 sm:px-2">
                    <span className="w-20 shrink-0 tabular-nums">
                      <span className="block text-base font-medium">{c.hora}</span>
                      {c.dia && <span className={c.atrasado ? "block text-sm text-destructive" : "block text-sm text-muted-foreground"}>{c.dia}</span>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base text-foreground">{c.titulo}</span>
                      <span className="block text-[15px] text-muted-foreground">{c.quem}{c.onde ? " · " + c.onde : ""}</span>
                    </span>
                    <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  );
}

// 5/11 (Rúben: «a equipa tem que ter as duas informações»): a ficha para a obra no passo «Fechar» do Estúdio (quando não há Catálogo).
// 12/11 (Rúben: «isto também deve ser mais bonito»): as tarefas numa linha do tempo, por fases (retirar, mudar de sítio, instalar), cada
// uma com o desenho da peça na cor do produto; em cima, quantas há de cada; ao lado, as alturas em números, os materiais com a amostra e
// as paredes para conferir.
import { ArrowRightLeft, Printer, Ruler, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { produto } from "./catalogoFake";
import { Ilustracao } from "./Ilustracao";
import { alturaFinalCm, sairam, type Linha, type Projeto } from "./necessidadesEstudio";
import { PlantaVista } from "./PlantaVista";
import { materiais, tarefas, type Tarefa } from "./fichaObra";
import { nf } from "./pecasEstudio";

const FASES: { t: Tarefa["tipo"]; n: string; icone: typeof Trash2; ponto: string; chip: string }[] = [
  { t: "retirar", n: "Retirar", icone: Trash2, ponto: "bg-destructive", chip: "bg-destructive/10 text-destructive" },
  { t: "mudar", n: "Mudar de sítio", icone: ArrowRightLeft, ponto: "bg-amber-500", chip: "bg-amber-100 text-amber-800" },
  { t: "instalar", n: "Instalar", icone: Wrench, ponto: "bg-primary", chip: "bg-primary/10 text-primary" },
];

const m = (cm: number) => `${(cm / 100).toLocaleString("pt-PT")} m`;

function Bloco({ titulo, children, className }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]", className)}>
      <h3 className="mb-4 text-[17px] font-semibold tracking-tight">{titulo}</h3>
      {children}
    </section>
  );
}

export function FichaDaObra({ p, linhas }: { p: Projeto; linhas: Linha[] }) {
  const ts = tarefas(p);
  const mats = materiais(linhas);
  const ficam = ts.filter((x) => x.tipo === "fica");
  const fases = FASES.map((f) => ({ ...f, ts: ts.filter((x) => x.tipo === f.t) })).filter((f) => f.ts.length);
  let passo = 0;
  return (
    <section aria-labelledby="t-obra" className="min-w-0 space-y-6 lg:col-span-2 print:space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="t-obra" className="text-2xl font-semibold tracking-tight">A ficha para a obra</h2>
          <p className="text-[15px] text-muted-foreground">O que a equipa precisa: as duas plantas, o que se retira e o que se instala onde, os materiais e as alturas.</p>
        </div>
        <Button type="button" variant="outline" className="min-h-11 print:hidden" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" aria-hidden="true" />Imprimir ou guardar em PDF</Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <PlantaVista planta={p.antes} titulo="Antes: como está hoje" />
        <PlantaVista planta={p.depois} titulo="Depois: como vai ficar (a tracejado, o que sai)" fantasmas={sairam(p)}
          cor={(pc) => produto(p.escolhas[pc.id])?.hex} rotulo={(pc) => produto(p.escolhas[pc.id])?.colecao} />
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[...FASES.map((f) => ({ n: f.n, v: ts.filter((x) => x.tipo === f.t).length, ponto: f.ponto })), { n: "Ficam como estão", v: ficam.length, ponto: "bg-muted-foreground/40" }].map((x) => (
          <div key={x.n} className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-sm)]">
            <dt className="flex items-center gap-2 text-sm text-muted-foreground"><span aria-hidden="true" className={cn("h-2 w-2 rounded-full", x.ponto)} />{x.n}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{x.v}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Bloco titulo="Tarefas, pela ordem da obra">
          {!fases.length && <p className="text-[15px] text-muted-foreground">Nada a fazer: a planta do depois é igual à do antes.</p>}
          <ol className="relative space-y-6">
            {fases.map((f) => (
              <li key={f.t} className="relative pl-10">
                <span aria-hidden="true" className={cn("absolute left-0 top-0 grid h-7 w-7 place-items-center rounded-full text-white", f.ponto)}><f.icone className="h-3.5 w-3.5" /></span>
                <span aria-hidden="true" className="absolute bottom-[-1.5rem] left-[13px] top-8 w-px bg-border last:hidden" />
                <h4 className="mb-3 flex items-baseline gap-2 text-[15px] font-semibold">{f.n}<span className="font-normal text-muted-foreground">· {f.ts.length}</span></h4>
                <ol className="space-y-2">
                  {f.ts.map((x) => {
                    passo++;
                    return (
                      <li key={`${x.tipo}-${passo}`} className="flex gap-3 rounded-xl border border-border bg-background p-3">
                        <span aria-hidden="true" className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-muted/70", f.t === "retirar" && "opacity-60 grayscale")}>
                          {x.desenho ? <Ilustracao cat={x.desenho} hex={x.hex} tamanho={40} /> : <f.icone className="h-5 w-5 text-muted-foreground" />}
                        </span>
                        <span className="min-w-0 flex-1 text-[15px]">
                          <span className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-xs font-semibold tabular-nums text-muted-foreground">{passo}.</span>
                            <b className="font-semibold">{x.peca}</b>
                            {x.produto && <span className="text-muted-foreground">{x.produto}</span>}
                          </span>
                          {x.onde && <span className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground"><Ruler className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{x.onde}</span>}
                          {x.acompanha?.length ? (
                            <span className="mt-2 flex flex-wrap gap-1.5">{x.acompanha.map((a) => <span key={a} className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", f.chip)}>+ {a}</span>)}</span>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </li>
            ))}
          </ol>
          {ficam.length > 0 && <p className="mt-5 rounded-xl bg-muted/50 px-3 py-2 text-sm text-muted-foreground">Ficam como estão: {ficam.map((x) => x.peca.toLowerCase()).join(", ")}.</p>}
        </Bloco>

        <div className="space-y-6">
          <Bloco titulo="Alturas">
            <dl className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-muted/50 p-3"><dt className="text-xs text-muted-foreground">Pé-direito hoje</dt><dd className="text-xl font-semibold tabular-nums">{m(p.alturas.peDireito)}</dd></div>
              <div className="rounded-xl bg-muted/50 p-3"><dt className="text-xs text-muted-foreground">Teto falso</dt><dd className="text-xl font-semibold tabular-nums">{p.alturas.tetoFalso ? m(p.alturas.tetoFalso) : "Não"}</dd></div>
              {p.revestimento && <div className="col-span-2 rounded-xl bg-muted/50 p-3"><dt className="text-xs text-muted-foreground">Revestimento até {p.alturas.tetoFalso ? "ao teto falso" : "ao teto"}</dt><dd className="text-xl font-semibold tabular-nums">{m(alturaFinalCm(p.alturas))}</dd></div>}
            </dl>
          </Bloco>
          <Bloco titulo="Materiais">
            {mats.length ? (
              <ul className="space-y-3">
                {mats.map((l) => {
                  const hex = produto(p.revestimento)?.n === l.n ? produto(p.revestimento)?.hex : produto(p.pavimento)?.n === l.n ? produto(p.pavimento)?.hex : undefined;
                  return (
                    <li key={l.id} className="flex gap-3">
                      <span aria-hidden="true" className="block h-11 w-11 shrink-0 rounded-xl border border-black/15 shadow-inner" style={{ background: hex ?? "hsl(var(--muted))" }} />
                      <span className="min-w-0 text-[15px]">
                        <b className="block text-lg font-semibold tabular-nums leading-tight">{nf(l.q)} {l.un}</b>
                        <span className="block leading-snug">{l.n}</span>
                        <span className="block text-xs text-muted-foreground">{l.porque}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-sm text-muted-foreground">Sem revestimento nem pavimento escolhidos.</p>}
          </Bloco>
          <Bloco titulo="Paredes, para conferir">
            <ol className="flex flex-wrap gap-2">
              {p.depois.paredes.map((w, i) => (
                <li key={i} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background py-1 pl-1 pr-3 text-sm">
                  <span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded-full bg-muted text-xs font-semibold">{String.fromCharCode(65 + i)}</span>
                  <span className="tabular-nums">{Math.round(w.c)} cm</span>
                </li>
              ))}
            </ol>
          </Bloco>
        </div>
      </div>
    </section>
  );
}

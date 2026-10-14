// "Do contrato à obra" (14/10/2026): o circuito depois do contrato assinado, num só cartão.
// Em cima, o contrato; em baixo, o arranque da obra; no meio, três trilhos em paralelo, cada um com os seus passos:
//   Encomenda (de cliente → a fornecedor → receção), Plano da obra (gerado do orçamento → aprovado), Pagamento (fatura → recibo).
// Cada passo diz de quem é a vez; quem tem a vez vê o botão; os outros veem "Ver como …" (o protótipo muda de papel).
// Cada trilho abre o detalhe: as linhas da encomenda (stock e falta), o fornecedor, e o plano por fases com os técnicos.
// A lógica está em preparacaoObra.ts; aqui só se desenha.
import { useState } from "react";
import { CalendarRange, Check, ChevronDown, Euro, FileSignature, HardHat, Lock, Package, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PAPEIS, TECS, conflitos, eur, nfmt, pct, type Negocio, type Papel } from "./motor";
import { fazer, type Ctx } from "./pecas";
import { NotaEncomendaDoc, Partilhar } from "./DocsCliente";
import { COR_FASE } from "./planoObra";
import { FASES_OBRA } from "./fasesObra";
import { FORNECEDORES, TRILHOS, faltaParaArrancar, passosPreparacao, totalEf, type PassoPrep, type Trilho } from "./preparacaoObra";

const ICONE: Record<Trilho, typeof Package> = { ec: Package, plano: CalendarRange, pag: Euro, obra: HardHat };

function Bola({ estado }: { estado: PassoPrep["estado"] }) {
  return (
    <span className={cn("relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 bg-card transition-colors duration-500",
      estado === "feito" ? "border-primary bg-primary text-primary-foreground" : estado === "agora" ? "border-primary" : "border-input")} aria-hidden="true">
      {estado === "feito" && <Check className="h-3.5 w-3.5 animate-in zoom-in-50 duration-300" />}
      {estado === "agora" && <><span className="absolute inset-0 animate-ping rounded-full border-2 border-primary/40 [animation-duration:2s]" /><span className="h-2.5 w-2.5 rounded-full bg-primary" /></>}
    </span>
  );
}

function Quem({ who }: { who: Papel | null }) {
  if (!who) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
      <span className="grid h-5 w-5 place-items-center rounded-full bg-muted text-[10px] font-semibold text-foreground" aria-hidden="true">{PAPEIS[who].av}</span>
      {PAPEIS[who].n}
    </span>
  );
}

export function CaminhoObra(ctx: Ctx & { d: Negocio }) {
  const { S, A, d, run, go } = ctx;
  const [aberto, setAberto] = useState<Trilho | null>(null);
  const P = passosPreparacao(d, S);
  if (!P.length) return null;
  const feitos = P.filter((x) => x.estado === "feito").length;
  const falta = faltaParaArrancar(d);
  const go1 = P.find((x) => x.trilho === "obra")!;
  // um só botão primário: o primeiro passo que é do papel atual
  const meu = P.find((x) => x.estado === "agora" && x.who === S.role && x.act);
  const ecOk = d.obra.ec?.estado === "aprovada";
  const verComo = (who: Papel) => run(() => { S.role = who; });

  const passo = (x: PassoPrep, ultimo: boolean) => (
    <li key={x.id} className="relative flex gap-3 pb-5 last:pb-0">
      {!ultimo && <span className={cn("absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-0.5 transition-colors duration-500", x.estado === "feito" ? "bg-primary/60" : "bg-border")} aria-hidden="true" />}
      <Bola estado={x.estado} />
      <div className="min-w-0 flex-1 pt-0.5">
        <p className={cn("text-[15px] font-medium leading-snug", x.estado === "espera" && "text-muted-foreground")}>{x.t}<span className="sr-only"> ({x.estado === "feito" ? "feito" : x.estado === "agora" ? "à espera de " + (x.who ? PAPEIS[x.who].n : "") : "ainda não"})</span></p>
        {x.sub && <p className="text-sm text-muted-foreground">{x.sub.split(" · atenção: ")[0]}{x.sub.includes(" · atenção: ") && <span className="mt-0.5 flex items-start gap-1.5 text-foreground"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />{x.sub.split(" · atenção: ")[1].replace(/^./, (c) => c.toUpperCase())}.</span>}</p>}
        {x.estado !== "feito" && <div className="mt-1"><Quem who={x.who} /></div>}
        {x.estado === "agora" && x.act && x.who && (
          x.who === S.role
            ? <Button size="sm" variant={meu?.id === x.id ? "default" : "outline"} className="mt-2 min-h-10" onClick={go(() => fazer(A, x.act!, d.id))}>{x.btn}</Button>
            : <button type="button" onClick={() => verComo(x.who!)} className="mt-1 inline-flex min-h-10 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">Ver como {PAPEIS[x.who].nome}</button>
        )}
      </div>
    </li>
  );

  return (
    <section aria-labelledby={`caminho-${d.id}`} className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)] sm:p-6 animate-in fade-in-0 duration-300">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id={`caminho-${d.id}`} className="text-lg font-semibold">Do contrato à obra</h2>
          <p className="text-[15px] text-muted-foreground">{falta.length ? `Para arrancar, falta ${falta.join(", ")}.` : go1.estado === "feito" ? go1.t + "." : "Está tudo pronto para arrancar."}</p>
        </div>
        <p className="text-sm tabular-nums text-muted-foreground">{feitos} de {P.length} passos</p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out" style={{ width: `${(feitos / P.length) * 100}%` }} />
      </div>

      {/* o contrato, de onde tudo parte */}
      <div className="mt-6 flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground" aria-hidden="true"><FileSignature className="h-4 w-4" /></span>
        <p className="text-[15px]"><b className="font-semibold">Contrato assinado</b> <span className="text-muted-foreground">· gerou a encomenda de cliente e o plano da obra</span></p>
      </div>
      {/* a ramificação: um traço que se abre para os três trilhos (só no computador) */}
      <div className="ml-[17px] hidden h-5 w-0.5 bg-primary/60 lg:block" aria-hidden="true" />
      <div className="relative hidden h-4 lg:block" aria-hidden="true">
        <span className="absolute left-[16.66%] right-[16.66%] top-0 h-0.5 bg-primary/60" />
        {[16.66, 50, 83.33].map((x) => <span key={x} className="absolute top-0 h-4 w-0.5 bg-primary/60" style={{ left: `${x}%` }} />)}
      </div>

      <div className="mt-4 grid gap-4 lg:mt-0 lg:grid-cols-3">
        {TRILHOS.map(({ k, t }) => {
          const L = P.filter((x) => x.trilho === k), Ico = ICONE[k], feito = L.every((x) => x.estado === "feito");
          return (
            <div key={k} className={cn("rounded-xl border p-4 transition-colors duration-500", feito ? "border-primary/30 bg-primary/[0.03]" : L.some((x) => x.estado === "agora") ? "border-border bg-card" : "border-border bg-muted/30")}>
              <div className="mb-4 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-[15px] font-semibold"><Ico className="h-4 w-4 text-primary" aria-hidden="true" />{t}</h3>
                {feito && <span className="inline-flex items-center gap-1 text-sm font-medium text-primary"><Check className="h-4 w-4" aria-hidden="true" />pronto</span>}
              </div>
              <ol>{L.map((x, i) => passo(x, i === L.length - 1))}</ol>
              {k !== "pag" && (
                <button type="button" onClick={() => setAberto(aberto === k ? null : k)} aria-expanded={aberto === k}
                  className="mt-3 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary">
                  {k === "ec" ? "Ver a encomenda" : "Ver o plano"}<ChevronDown className={cn("h-4 w-4 transition-transform", aberto === k && "rotate-180")} aria-hidden="true" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {aberto === "ec" && <DetalheEncomenda ctx={ctx} />}
      {aberto === "plano" && <DetalhePlano d={d} />}

      {/* tudo converge no arranque */}
      <div className={cn("mt-5 flex flex-col gap-3 rounded-xl border-2 p-4 sm:flex-row sm:items-center sm:justify-between transition-colors duration-500",
        go1.estado === "agora" ? "border-primary bg-primary/[0.04]" : go1.estado === "feito" ? "border-primary/40" : "border-dashed border-input")}>
        <div className="flex items-start gap-3">
          <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", go1.estado === "espera" ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground")} aria-hidden="true">
            {go1.estado === "espera" ? <Lock className="h-4 w-4" /> : <HardHat className="h-4 w-4" />}
          </span>
          <div>
            <p className="text-[15px] font-semibold">{go1.t}</p>
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Condições para arrancar">
              {[["Encomenda aprovada", ecOk], ["Materiais recebidos", ecOk && (!d.obra.enc || d.obra.enc.estado === "recebida")], ["Plano aprovado", d.obra.plano?.estado !== "por aprovar"], ["Sinal pago", d.fin.pago]].map(([t, ok]) => (
                <li key={t as string} className={cn("inline-flex items-center gap-1.5", ok ? "text-foreground" : "text-muted-foreground")}>
                  {ok ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <span className="h-3.5 w-3.5 rounded-full border-2 border-input" aria-hidden="true" />}{t as string}
                  <span className="sr-only">{ok ? " (feito)" : " (por fazer)"}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        {go1.estado === "agora" && (go1.who === S.role
          ? <Button className="min-h-11" variant={meu?.id === go1.id ? "default" : "outline"} onClick={go(() => fazer(A, "arrancar", d.id))}>Arrancar a obra</Button>
          : <button type="button" onClick={() => verComo("operacoes")} className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">Ver como {PAPEIS.operacoes.nome}</button>)}
      </div>
    </section>
  );
}

/** As linhas da encomenda de cliente (o que há em stock e o que falta) e a encomenda ao fornecedor, com a escolha do fornecedor. */
function DetalheEncomenda({ ctx }: { ctx: Ctx & { d: Negocio } }) {
  const { S, A, d, run } = ctx;
  const ec = d.obra.ec!, e = d.obra.enc;
  const [nota, setNota] = useState(false);
  return (
    <div className="mt-4 grid gap-4 rounded-xl border border-border p-4 animate-in fade-in-0 slide-in-from-top-1 duration-200 lg:grid-cols-2">
      <div>
        <h4 className="text-[15px] font-semibold">Encomenda de cliente {ec.n} <span className="font-normal text-muted-foreground">· {ec.estado}</span></h4>
        <ul className="mt-2 divide-y divide-border">
          {ec.linhas.map((x) => (
            <li key={x.n} className="py-2 text-[15px]">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="min-w-0 flex-1">{x.n} <span className="text-sm text-muted-foreground">· {x.de === "produto" ? "produto da visita" : "material"}</span></span>
                <span className="font-medium tabular-nums">{eur((x.custo ?? 0) * x.q)} €</span>
              </div>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm tabular-nums">
                <span className="text-muted-foreground">{nfmt(x.q)} {x.un} × {eur(x.custo ?? 0)} €</span>
                <span className={x.falta > 0 ? "text-warning" : "text-success"}>
                  {x.falta > 0 ? (x.res > 0 ? `${nfmt(x.res)} em stock · faltam ${nfmt(x.falta)}` : `a encomendar ${nfmt(x.falta)}`) : "em stock"}
                </span>
              </div>
            </li>
          ))}
        </ul>
        {/* o custo contra o que o cliente paga por estes materiais */}
        <dl className="mt-2 grid grid-cols-3 gap-2 border-t border-border pt-3 text-sm">
          <div><dt className="text-muted-foreground">Custo</dt><dd className="text-[15px] font-semibold tabular-nums">{eur(ec.custo ?? 0)} €</dd></div>
          <div><dt className="text-muted-foreground">Na proposta</dt><dd className="text-[15px] font-semibold tabular-nums">{eur(ec.valor)} €</dd></div>
          <div><dt className="text-muted-foreground">Margem</dt><dd className="text-[15px] font-semibold tabular-nums">{ec.valor > 0 ? pct((ec.valor - (ec.custo ?? 0)) / ec.valor) : "—"}</dd></div>
        </dl>
        <p className="mt-2 text-sm text-muted-foreground">Os custos repartem a estimativa de materiais do orçamento pelas linhas; os produtos têm o custo do Catálogo.{ec.estado !== "aprovada" ? " O stock confirma-se ao aprovar (pode ter mudado desde o contrato)." : ""}</p>
      </div>
      <div>
        <h4 className="text-[15px] font-semibold">Encomenda a fornecedor {e ? <span className="font-normal text-muted-foreground">{e.n} · {e.estado === "por confirmar" ? "por validar" : e.estado}</span> : null}</h4>
        {!e ? (
          <p className="mt-2 text-[15px] text-muted-foreground">{ec.estado === "aprovada" ? "Nada a encomendar: está tudo em stock." : "Emite-se sozinha ao aprovar a encomenda de cliente, com o que faltar."}</p>
        ) : (
          <>
            <p className="mt-2 text-sm text-muted-foreground">Fornecedor</p>
            <div role="group" aria-label="Fornecedor" className="mt-1 flex flex-wrap gap-2">
              {FORNECEDORES.map((f) => (
                <button key={f} type="button" aria-pressed={e.forn === f} disabled={e.estado !== "por confirmar"} onClick={() => run(() => A.escolherForn(d.id, f))}
                  className={cn("min-h-10 rounded-full border px-3 text-sm transition-colors disabled:cursor-default", e.forn === f ? "border-primary bg-primary text-primary-foreground" : "border-input hover:border-foreground/40 disabled:opacity-50")}>
                  {f.replace(" (exemplo)", "")}
                </button>
              ))}
            </div>
            <ul className="mt-3 divide-y divide-border">
              {e.linhas.map((x) => (
                <li key={x.n} className="py-2 text-[15px]">
                  <div className="flex justify-between gap-3"><span>{x.n}</span><span className="font-medium tabular-nums">{eur((x.custo ?? 0) * x.q)} €</span></div>
                  <div className="text-sm tabular-nums text-muted-foreground">{nfmt(x.q)} {x.un} × {eur(x.custo ?? 0)} €</div>
                </li>
              ))}
            </ul>
            <p className="flex justify-between gap-3 border-t border-border pt-3 text-[15px]"><span className="font-medium">Total a pagar ao fornecedor</span><span className="font-semibold tabular-nums">{eur(totalEf(e))} €</span></p>
            {e.estado === "por confirmar" && !d.fin.pago && (
              <p className="mt-2 flex items-start gap-2 text-sm"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />O sinal ainda não entrou. Validar já compromete a compra antes de o cliente pagar.</p>
            )}
            {e.validada && <p className="mt-2 text-sm text-muted-foreground">Validada por {e.validada.por} · {e.validada.q}</p>}
          </>
        )}
      </div>
      {S.role !== "comercial" && ec.estado !== "aprovada" && <p className="text-sm text-muted-foreground lg:col-span-2">Quem aprova a encomenda de cliente é o comercial: confirma que é isto que vendeu.</p>}
      {/* o documento do cliente: os preços (nunca os custos) e o estado de cada linha */}
      <div className="lg:col-span-2">
        <button type="button" onClick={() => setNota(!nota)} aria-expanded={nota} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary">
          {nota ? "Fechar a nota de encomenda" : ec.estado === "aprovada" ? "Nota de encomenda no portal do cliente" : "Pré-visualizar a nota de encomenda do cliente"}
          <ChevronDown className={cn("h-4 w-4 transition-transform", nota && "rotate-180")} aria-hidden="true" />
        </button>
        {nota && (
          <div className="mt-3 animate-in fade-in-0 duration-200">
            <Partilhar ctx={ctx} d={d} tipo="encomenda" estado={ec.estado === "aprovada" ? "no portal do cliente" : "rascunho: sai ao aprovar"}><NotaEncomendaDoc d={d} /></Partilhar>
          </div>
        )}
      </div>
    </div>
  );
}

/** O plano por fases: uma barra por tarefa na régua dos dias úteis, com o técnico; as férias em conflito a laranja. */
function DetalhePlano({ d }: { d: Negocio }) {
  const p = d.obra.plano!, dias = Math.max(1, ...p.tasks.map((t) => t.dia + t.dur));
  const C = new Set(conflitos(p).map((c) => c.t));
  const fases = [...new Set(p.tasks.map((t) => t.fase ?? 0))].sort();
  return (
    <div className="mt-4 rounded-xl border border-border p-4 animate-in fade-in-0 slide-in-from-top-1 duration-200">
      <h4 className="text-[15px] font-semibold">Plano da obra <span className="font-normal text-muted-foreground">· {p.estado} · {nfmt(dias)} dias úteis{p.inicio ? ` desde ${p.inicio.split("-").reverse().join("/")}` : ""}</span></h4>
      <div className="mt-3 space-y-4">
        {fases.map((f) => (
          <div key={f}>
            {f > 0 && <p className="mb-1 inline-flex items-center gap-2 text-sm font-medium"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COR_FASE[f] }} aria-hidden="true" />Fase {f} · {FASES_OBRA[f - 1].curto}</p>}
            <ul className="space-y-1.5">
              {p.tasks.filter((t) => (t.fase ?? 0) === f).map((t, i) => {
                const tec = TECS.find((x) => x.id === t.tec), mau = C.has(t);
                return (
                  <li key={i} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] items-center gap-3 text-sm sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_9rem]">
                    <span className="truncate" title={t.nome}>{t.nome}</span>
                    <span className="relative h-5 rounded bg-muted/60">
                      <span className={cn("absolute inset-y-0 rounded", mau && "ring-2 ring-warning")} style={{ left: `${(t.dia / dias) * 100}%`, width: `${(t.dur / dias) * 100}%`, background: COR_FASE[f] ?? "hsl(var(--primary))" }} />
                    </span>
                    <span className={cn("col-span-2 truncate text-muted-foreground sm:col-span-1", mau && "text-warning")}>{tec ? tec.n : "sem técnico"}{mau ? " · de férias" : ""}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

// Operações da V2 (13/10/2026): no topo, o Hoje do supervisor (tarefas por validar e atrasos, cada coisa uma vez); depois a lista
// das obras com o estado em texto e ícone. Ao abrir uma obra, a página dela (ObraV2): Plano, Validar, Atrasos, Previsto contra real
// e Materiais, sem separadores. As obras e os planos vêm do motor; o resto vive em estadoV2.ts.
import { AlertTriangle, ArrowRight, Clock } from "lucide-react";
import { aberto, conflitos, nfmt } from "../motor";
import type { Ctx } from "../pecas";
import { hojeSupervisor, porValidar, type ItemHoje } from "./operacoes";
import { regObra } from "./estadoV2";
import { ObraV2 } from "./ObraV2";
import { EstadoObra } from "./EstadoObra";

function ListaHoje({ ctx, titulo, id, itens, icone: I, cor }: { ctx: Ctx; titulo: string; id: string; itens: ItemHoje[]; icone: typeof Clock; cor: string }) {
  if (!itens.length) return null;
  return (
    <div>
      <h3 id={id} className="text-base font-semibold">{titulo} ({itens.length})</h3>
      <ul aria-labelledby={id} className="mt-2 divide-y divide-border rounded-2xl border border-border bg-card px-4 sm:px-5">
        {itens.map((it) => (
          <li key={it.chave}>
            <button type="button" onClick={ctx.go(() => ctx.A.abrirPlano(it.deal))} className="group flex min-h-14 w-full items-center gap-3 py-2.5 text-left">
              <I className={`h-5 w-5 shrink-0 ${cor}`} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">{it.titulo}</span>
                <span className="block text-[15px] text-muted-foreground">{it.texto}</span>
              </span>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OperacoesV2(ctx: Ctx) {
  const { S, A, go } = ctx;
  const d = S.op ? S.deals.find((x) => x.id === S.op) : null;
  if (d && d.obra.plano) return <ObraV2 ctx={ctx} d={d} />;
  const obras = aberto(S).filter((x) => x.fase === 5 && x.obra.plano);
  const H = hojeSupervisor(obras, (o) => regObra(S, o));
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <h1 className="text-3xl font-semibold tracking-tight">Operações</h1>
      <p className="mt-2 text-lg text-muted-foreground">As obras chegam aqui sozinhas quando o Financeiro valida o pagamento, com o plano por aprovar.</p>

      <section aria-labelledby="hoje-sup" className="mt-8">
        <h2 id="hoje-sup" className="text-xl font-semibold">Hoje</h2>
        {!H.validar.length && !H.atrasos.length
          ? <p className="mt-2 text-[15px] text-muted-foreground">Nada por validar e sem atrasos.</p>
          : (
            <div className="mt-3 space-y-6">
              <ListaHoje ctx={ctx} id="hoje-validar" titulo="Por validar" itens={H.validar} icone={Clock} cor="text-warning" />
              <ListaHoje ctx={ctx} id="hoje-atrasos" titulo="Atrasos" itens={H.atrasos} icone={AlertTriangle} cor="text-warning" />
            </div>
          )}
      </section>

      <section aria-labelledby="obras-t" className="mt-10">
        <h2 id="obras-t" className="text-xl font-semibold">Obras</h2>
        <ul className="mt-3 divide-y divide-border rounded-2xl border border-border bg-card px-4 sm:px-5">
          {obras.map((o) => {
            const p = o.obra.plano!, nc = conflitos(p).length, reg = regObra(S, o), pv = porValidar(p, reg).length;
            const extra = [nfmt(p.tasks.reduce((a, t) => a + t.h, 0)) + " h", pv ? `${pv} por validar` : "", reg.atrasos.length ? `${reg.atrasos.length} ${reg.atrasos.length === 1 ? "atraso" : "atrasos"}` : ""].filter(Boolean);
            return (
              <li key={o.id}>
                <button type="button" onClick={go(() => A.abrirPlano(o.id))} className="group flex min-h-16 w-full items-center gap-4 py-3 text-left">
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-medium">{o.nome} · {o.servico}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-[15px] text-muted-foreground">
                      <EstadoObra p={p} />
                      <span>· {extra.join(" · ")}</span>
                      {nc > 0 && <span className="inline-flex items-center gap-1"><AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />{nc} conflito</span>}
                    </span>
                  </span>
                  <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
                </button>
              </li>
            );
          })}
          {!obras.length && <li className="py-4 text-[15px] text-muted-foreground">Ainda não há obras. Aparecem quando o Financeiro valida um pagamento.</li>}
        </ul>
      </section>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Card, ErrorState, Skeleton, cx } from "./ui";
import { ErroDeDados } from "../lib/dados";
import { custosDaObra, type CustosObra } from "../lib/obras";
import { euros, eurosComSinal } from "../lib/formatar";
import { formatarMinutos, nivelDeAlerta, percentagemGasta } from "../domain/obras";

/**
 * Previsto contra real, numa obra: tempo por fase e por pessoa, e — só para
 * quem tem `operations.costs.view` — o custo de mão de obra. O técnico vê os
 * tempos e nenhum euro; a base é que decide, não este ecrã.
 */
export default function ObraPrevistoReal({ obraId, recarga }: { obraId: string; recarga: number }) {
  const [c, setC] = useState<CustosObra | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setErro(null);
    custosDaObra(obraId)
      .then((r) => vivo && setC(r))
      .catch((e) => vivo && setErro(e instanceof ErroDeDados ? e.message : "Erro a carregar."));
    return () => {
      vivo = false;
    };
  }, [obraId, recarga]);

  if (erro) return <ErrorState message={erro} />;
  if (!c) return <Skeleton className="h-48 w-full rounded-xl" />;

  const max = Math.max(1, ...c.por_fase.map((f) => Math.max(f.minutos_previstos, Number(f.minutos_reais))));

  return (
    <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
      <Card className="p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Tempo por fase</h3>
          <p className="font-mono text-sm tabular text-slate-600">
            {formatarMinutos(Number(c.minutos_reais))} de {formatarMinutos(c.minutos_previstos)} ·{" "}
            {percentagemGasta(Number(c.minutos_reais), c.minutos_previstos)} %
          </p>
        </div>
        <div className="mt-3 space-y-3">
          {c.por_fase.map((f) => {
            const real = Number(f.minutos_reais);
            const nivel = nivelDeAlerta(real, f.minutos_previstos);
            return (
              <div key={f.fase_id}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="truncate text-slate-700">
                    {f.ordem}. {f.nome}
                  </span>
                  <span className="shrink-0 font-mono tabular text-slate-500">
                    {formatarMinutos(real)} / {formatarMinutos(f.minutos_previstos)}
                  </span>
                </div>
                <div className="relative mt-1 h-3 rounded-full bg-slate-100">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-slate-300"
                    style={{ width: `${(f.minutos_previstos / max) * 100}%` }}
                    title="Previsto"
                  />
                  <div
                    className={cx(
                      "absolute inset-y-0.5 left-0 rounded-full",
                      nivel === "excedido" ? "bg-red-500" : nivel === "aviso" ? "bg-amber-500" : "bg-brand"
                    )}
                    style={{ width: `${(real / max) * 100}%` }}
                    title="Real"
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-slate-400">
          Cinzento = previsto (soma das tarefas). Cor = real, pessoa × tempo: duas pessoas uma hora são duas horas.
        </p>
      </Card>

      <div className="space-y-4">
        {c.ve_custos && (
          <Card className="p-4">
            <h3 className="text-sm font-semibold text-slate-800">Mão de obra</h3>
            <dl className="mt-2 grid grid-cols-2 gap-y-1.5 text-sm">
              {c.orcado_mao_obra != null && (
                <>
                  <dt className="text-slate-500">Orçado</dt>
                  <dd className="text-right font-mono tabular">{euros(c.orcado_mao_obra)}</dd>
                </>
              )}
              <dt className="text-slate-500">Previsto (plano)</dt>
              <dd className="text-right font-mono tabular">{euros(c.custo_previsto)}</dd>
              <dt className="text-slate-500">Real até agora</dt>
              <dd className="text-right font-mono font-semibold tabular">{euros(c.custo_real)}</dd>
              <dt className="text-slate-500">Desvio</dt>
              <dd
                className={cx(
                  "text-right font-mono tabular",
                  Number(c.custo_real) > Number(c.custo_previsto) ? "text-red-700" : "text-emerald-700"
                )}
              >
                {eurosComSinal(Number(c.custo_real ?? 0) - Number(c.custo_previsto ?? 0))}
              </dd>
            </dl>
            {!!c.sem_tarifa && (
              <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                {c.sem_tarifa} pessoa(s) sem custo/hora definido — o real está subavaliado. Define-o em Definições.
              </p>
            )}
          </Card>
        )}

        <Card className="p-4">
          <h3 className="text-sm font-semibold text-slate-800">Por pessoa</h3>
          {c.por_pessoa.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">Ainda ninguém registou tempo nesta obra.</p>
          ) : (
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {c.por_pessoa.map((p) => (
                <li key={p.utilizador_id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="truncate text-slate-700">{p.nome}</span>
                  <span className="shrink-0 font-mono tabular text-slate-600">
                    {formatarMinutos(Number(p.minutos))}
                    {c.ve_custos && <span className="ml-2 text-slate-400">{p.custo != null ? euros(p.custo) : "s/ tarifa"}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

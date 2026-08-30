import { Card, Badge, Barra, cx } from "./ui";
import { Euro } from "./icons";
import type { CustoDaOrdem, LinhaPrevista } from "../lib/dados";
import { euros, eurosComSinal, percentagemComSinal } from "../lib/formatar";

/**
 * Orçamentei X, gastei quanto?
 *
 * A pergunta que a empresa não conseguia responder, porque as duas metades
 * viviam em sítios diferentes: o previsto no CRM, o real em Operações.
 *
 * Três decisões de leitura:
 *
 *  · Sem orçamento, este painel não aparece. "Não havia orçamento" não é o
 *    mesmo que "orçamento de zero euros", e mostrar −100 % numa corretiva de
 *    rotina seria ruído.
 *
 *  · A barra enche até 100 % do previsto e fica vermelha quando passa. Um
 *    número sozinho obriga a fazer contas de cabeça; a barra diz num relance
 *    se ainda há folga.
 *
 *  · Quem não tem `operations.costs.view` não vê nada disto — a RLS devolve
 *    vazio, e vazio aqui quer dizer "não é para ti", não "não há dados".
 */

export default function PainelCusto({
  custo,
  previsto,
}: {
  custo: CustoDaOrdem | null;
  previsto: readonly LinhaPrevista[];
}) {
  if (!custo || custo.previsto == null) return null;

  const p = Number(custo.previsto);
  const r = Number(custo.real_total);
  const passou = r > p;
  const percentagem = p === 0 ? 0 : Math.min(100, Math.round((r / p) * 100));

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-800">
          <Euro width={14} height={14} className="text-slate-400" />
          Orçamentado contra gasto
        </h2>
        <Badge
          className={
            passou
              ? "bg-red-50 text-red-700 ring-red-200"
              : "bg-emerald-50 text-emerald-700 ring-emerald-200"
          }
        >
          {eurosComSinal(custo.desvio)}
          {custo.desvio_percent != null && ` · ${percentagemComSinal(custo.desvio_percent)}`}
        </Badge>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Numero rotulo="Previsto" valor={euros(p)} />
        <Numero rotulo="Gasto" valor={euros(r)} destaque={passou ? "mau" : "bom"} />
        <Numero rotulo="Material" valor={euros(custo.real_material)} />
        <Numero rotulo="Mão de obra" valor={euros(custo.real_mao_obra)} />
      </div>

      <Barra
        percentagem={percentagem}
        className={cx("mt-3", passou && "[&>div]:bg-red-500")}
      />
      <p className="mt-1.5 text-xs text-slate-500">
        {passou
          ? `Já passou ${euros(r - p)} do previsto.`
          : p === r
            ? "Está exatamente no previsto."
            : `Ainda há ${euros(p - r)} de folga.`}
      </p>

      {previsto.length > 0 && (
        <details className="mt-3 border-t border-slate-100 pt-3">
          <summary className="cursor-pointer text-xs font-medium text-slate-500 transition-colors hover:text-brand">
            O que estava orçamentado ({previsto.length}{" "}
            {previsto.length === 1 ? "linha" : "linhas"})
          </summary>

          {/* A tabela rola sozinha em vez de empurrar a página para o lado. */}
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[30rem] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="pb-1.5 font-medium">Descrição</th>
                  <th className="pb-1.5 text-right font-medium">Qt.</th>
                  <th className="pb-1.5 text-right font-medium">Material</th>
                  <th className="pb-1.5 text-right font-medium">Mão de obra</th>
                  <th className="pb-1.5 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {previsto.map((l) => (
                  <tr key={l.id}>
                    <td className="py-1.5 pr-3 text-slate-700">
                      {l.descricao}
                      {l.categoria && (
                        <span className="ml-1.5 text-xs text-slate-400">{l.categoria}</span>
                      )}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular text-slate-500">
                      {Number(l.quantidade).toLocaleString("pt-PT", {
                        maximumFractionDigits: 2,
                      })}
                      {l.unidade ? ` ${l.unidade}` : ""}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular text-slate-500">
                      {euros(l.custo_material)}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular text-slate-500">
                      {euros(l.custo_mao_obra)}
                    </td>
                    <td className="py-1.5 text-right font-mono tabular font-medium text-slate-700">
                      {euros(l.total_sem_iva)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-xs text-slate-400">
            Congelado quando a obra abriu. Rever o orçamento no CRM não muda estes números.
          </p>
        </details>
      )}
    </Card>
  );
}

function Numero({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: string;
  destaque?: "bom" | "mau";
}) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p
        className={cx(
          "mt-0.5 font-mono text-sm font-semibold tabular",
          destaque === "mau" ? "text-red-700" : destaque === "bom" ? "text-emerald-700" : "text-slate-800"
        )}
      >
        {valor}
      </p>
    </div>
  );
}

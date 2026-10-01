import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ErroDeDados, listarEquipa } from "../lib/dados";
import { registosDasTarefas, tarefasTerminadas } from "../lib/obras";
import { Badge, Card, EmptyState, ErrorState, Skeleton, cx } from "../components/ui";
import { ChevronLeft } from "../components/icons";
import { ObraMetricas as IconeMetricas } from "../components/ObraIcones";
import { formatarMinutos, minutosDoRegisto, podePlanear } from "../domain/obras";
import {
  AMOSTRA_MINIMA,
  ROTULO_VEREDICTO,
  ROTULO_VEREDICTO_PESSOA,
  metricasPorModelo,
  metricasPorPessoa,
  type MetricaModelo,
  type MetricaPessoa,
} from "../domain/obras-metricas";

/**
 * Métricas de obra — as duas perguntas da reunião:
 *   · o tempo default de cada tarefa está certo?
 *   · quem é sistematicamente mais lento (formação) ou mais rápido (boa
 *     prática a replicar)?
 * Só contam tarefas terminadas. As contas estão em domain/obras-metricas.ts.
 */
export default function ObraMetricas() {
  const { activeOrgId, funcao } = useAuth();
  const [porModelo, setPorModelo] = useState<MetricaModelo[]>([]);
  const [porPessoa, setPorPessoa] = useState<MetricaPessoa[]>([]);
  const [nomes, setNomes] = useState<Map<string, string>>(new Map());
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  const carregar = useCallback(async () => {
    if (!activeOrgId) return;
    setErro(null);
    try {
      const [ts, eq] = await Promise.all([tarefasTerminadas(activeOrgId), listarEquipa(activeOrgId)]);
      const rs = await registosDasTarefas(ts.map((t) => t.id));
      const tarefas = ts.map((t) => ({
        id: t.id,
        modeloTarefaId: t.modelo_tarefa_id,
        nome: t.nome,
        estado: t.estado,
        minutosPrevistos: t.minutos_previstos,
      }));
      const registos = rs.map((r) => ({
        tarefaId: r.tarefa_id,
        utilizadorId: r.utilizador_id,
        minutos: minutosDoRegisto({ utilizadorId: r.utilizador_id, tarefaId: r.tarefa_id, inicio: r.inicio, fim: r.fim }),
      }));
      setPorModelo(metricasPorModelo(tarefas, registos));
      setPorPessoa(metricasPorPessoa(tarefas, registos));
      setNomes(new Map(eq.map((m) => [m.utilizador_id, m.nome])));
    } catch (e) {
      setErro(e instanceof ErroDeDados ? e.message : "Algo correu mal a calcular as métricas.");
    } finally {
      setACarregar(false);
    }
  }, [activeOrgId, recarga]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const maxRazao = useMemo(
    () => Math.max(1.5, ...porModelo.map((m) => m.razao), ...porPessoa.map((p) => p.razao)),
    [porModelo, porPessoa]
  );

  if (!podePlanear(funcao) && (funcao as string | null) !== "supervisor") {
    return <ErrorState message="As métricas são para o gestor e o supervisor." />;
  }
  if (aCarregar) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (erro) return <ErrorState message={erro} onRetry={() => setRecarga((r) => r + 1)} />;

  return (
    <div className="space-y-5">
      <Link to="/obras" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ChevronLeft width={14} height={14} /> Obras
      </Link>
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Métricas de obra</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Real contra previsto, das tarefas terminadas. Conclusões só a partir de {AMOSTRA_MINIMA} tarefas; desvio
          significativo = ±20 %.
        </p>
      </div>

      <Card className="p-4">
        <h2 className="text-sm font-semibold text-slate-800">Por tarefa — o default está certo?</h2>
        {porModelo.length === 0 ? (
          <EmptyState
            icon={<IconeMetricas width={22} height={22} />}
            title="Ainda sem tarefas terminadas"
            description="Assim que a equipa der tarefas por feitas, o real aparece aqui contra o previsto."
          />
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-1.5 pr-2 font-medium">Tarefa</th>
                  <th className="px-2 font-medium">n</th>
                  <th className="px-2 text-right font-medium">Previsto</th>
                  <th className="px-2 text-right font-medium">Real médio</th>
                  <th className="w-40 px-2 font-medium">Real / previsto</th>
                  <th className="px-2 text-right font-medium">Sugestão</th>
                  <th className="pl-2 font-medium">Veredicto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {porModelo.map((m) => (
                  <tr key={m.chave}>
                    <td className="py-2 pr-2 text-slate-700">
                      {m.nome}
                      {!m.modeloTarefaId && <span className="ml-1 text-[10px] text-slate-400">(manual)</span>}
                    </td>
                    <td className="px-2 font-mono tabular text-slate-500">{m.n}</td>
                    <td className="px-2 text-right font-mono tabular">{formatarMinutos(m.mediaPrevistos)}</td>
                    <td className="px-2 text-right font-mono tabular">{formatarMinutos(m.mediaReais)}</td>
                    <td className="px-2">
                      <BarraRazao razao={m.razao} max={maxRazao} />
                    </td>
                    <td className="px-2 text-right font-mono tabular text-slate-600">
                      {m.veredicto === "default_curto" || m.veredicto === "default_longo" ? formatarMinutos(m.sugestao) : "—"}
                    </td>
                    <td className="pl-2">
                      <Badge
                        className={cx(
                          m.veredicto === "default_curto" && "bg-red-50 text-red-700 ring-red-200",
                          m.veredicto === "default_longo" && "bg-sky-50 text-sky-700 ring-sky-200",
                          m.veredicto === "certo" && "bg-emerald-50 text-emerald-700 ring-emerald-200",
                          m.veredicto === "poucos_dados" && "bg-slate-50 text-slate-500 ring-slate-200"
                        )}
                      >
                        {ROTULO_VEREDICTO[m.veredicto]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-slate-400">
              Para mudar um default, abre o modelo em{" "}
              <Link to="/obras/modelos" className="text-brand underline">
                Modelos
              </Link>
              . As obras já criadas não mudam.
            </p>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold text-slate-800">Por pessoa — formação ou boa prática?</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Razão real/previsto das tarefas em que trabalhou, pesada pelo tempo de cada um. Vale para comparar pessoas
          entre si; um valor alto em todos aponta para o default, não para a pessoa.
        </p>
        {porPessoa.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">Sem dados ainda.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {porPessoa.map((p) => (
              <li key={p.utilizadorId} className="grid grid-cols-[1fr_auto] items-center gap-2 py-2 sm:grid-cols-[1fr_160px_auto]">
                <span className="min-w-0 truncate text-sm text-slate-700">
                  {nomes.get(p.utilizadorId) ?? "—"}
                  <span className="ml-2 text-xs text-slate-400">
                    {p.nTarefas} tarefa(s) · {formatarMinutos(p.minutos)}
                  </span>
                </span>
                <span className="hidden sm:block">
                  <BarraRazao razao={p.razao} max={maxRazao} />
                </span>
                <Badge
                  className={cx(
                    p.veredicto === "mais_lento" && "bg-amber-50 text-amber-800 ring-amber-200",
                    p.veredicto === "mais_rapido" && "bg-emerald-50 text-emerald-700 ring-emerald-200",
                    (p.veredicto === "na_media" || p.veredicto === "poucos_dados") && "bg-slate-50 text-slate-500 ring-slate-200"
                  )}
                >
                  {ROTULO_VEREDICTO_PESSOA[p.veredicto]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** Uma barra com o 1,0 marcado: à direita da marca demorou mais do que o previsto. */
function BarraRazao({ razao, max }: { razao: number; max: number }) {
  const pos = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 flex-1 rounded-full bg-slate-100">
        <div
          className={cx(
            "absolute inset-y-0 left-0 rounded-full",
            razao > 1.2 ? "bg-red-400" : razao < 0.8 ? "bg-sky-400" : "bg-emerald-400"
          )}
          style={{ width: pos(razao) }}
        />
        <div className="absolute -inset-y-1 w-px bg-slate-500" style={{ left: pos(1) }} title="Previsto" />
      </div>
      <span className="w-10 text-right font-mono text-xs tabular text-slate-600">{razao.toLocaleString("pt-PT")}×</span>
    </div>
  );
}

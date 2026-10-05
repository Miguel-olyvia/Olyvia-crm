import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { porqueInicio, type PorqueInicio } from "../lib/obras";
import { data as formatarData } from "../lib/formatar";

/**
 * "Porque começa a 23/10?" — a explicação da data de início: entre a criação
 * da obra e o início, onde está a equipa (as outras obras, com datas e quem).
 * Só aparece com a obra planeada e quando há alguma coisa a explicar.
 */
export default function ObraPorqueInicio({ obraId, estado, recarga = 0 }: { obraId: string; estado: string; recarga?: number }) {
  const [p, setP] = useState<PorqueInicio | null>(null);

  useEffect(() => {
    let vivo = true;
    // Num .then: se a função faltar (testes, app antiga), fica sem explicação, sem rebentar.
    Promise.resolve()
      .then(() => porqueInicio(obraId))
      .then((r) => vivo && setP(r))
      .catch(() => vivo && setP(null));
    return () => {
      vivo = false;
    };
  }, [obraId, recarga]);

  if (estado !== "planeada" || !p?.inicio || !p.ocupacao?.length) return null;

  const frase =
    p.auto === true
      ? `O sistema escolheu o primeiro dia útil em que a obra fica com equipa para todas as tarefas, sem choques com outras obras.`
      : p.auto === false
        ? `A data foi escolhida à mão. Até lá, a equipa já tem este trabalho marcado:`
        : `Até lá, a equipa já tem este trabalho marcado:`;

  return (
    <details className="rounded-lg border border-slate-200 bg-white p-3 text-sm" data-testid="porque-inicio">
      <summary className="cursor-pointer select-none font-medium text-slate-700">
        Porque começa a {formatarData(p.inicio)}?{" "}
        <span className="font-normal text-slate-500">
          A equipa{p.equipa ? ` (${p.equipa} ${p.equipa === 1 ? "pessoa" : "pessoas"})` : ""} está ocupada em{" "}
          {p.ocupacao.length} {p.ocupacao.length === 1 ? "obra" : "obras"} até lá.
        </span>
      </summary>
      <p className="mt-2 text-xs text-slate-600">{frase}</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[480px] text-xs">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="py-1 pr-3 font-semibold">Período</th>
              <th className="py-1 pr-3 font-semibold">Obra</th>
              <th className="py-1 font-semibold">Quem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {p.ocupacao.map((o) => (
              <tr key={o.obra_id}>
                <td className="whitespace-nowrap py-1.5 pr-3 font-mono tabular text-slate-600">
                  {formatarData(o.inicio)}
                  {o.fim !== o.inicio && <> → {formatarData(o.fim)}</>}
                </td>
                <td className="py-1.5 pr-3">
                  <Link to={`/obras/${encodeURIComponent(o.codigo)}`} className="font-medium text-brand hover:underline">
                    {o.codigo}
                  </Link>{" "}
                  <span className="text-slate-500">{o.titulo}</span>
                </td>
                <td className="py-1.5 text-slate-600">
                  {p.equipa && o.n >= p.equipa ? "toda a equipa" : o.pessoas.join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {p.nesta_obra.length > 0 && (
        <p className="mt-2 text-xs text-slate-600">
          A {formatarData(p.inicio)} ficam livres para esta obra: <b>{p.nesta_obra.join(", ")}</b>.
        </p>
      )}
      <p className="mt-1 text-[11px] text-slate-400">
        Para começar antes: "Replanear datas" com o dia que quiser — os choques ficam como aviso, e "Distribuir equipa"
        troca as pessoas.
      </p>
    </details>
  );
}

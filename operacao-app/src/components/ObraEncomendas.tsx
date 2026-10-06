import { useEffect, useState } from "react";
import { encomendas } from "../lib/encomendas";
import { encomendaUrgente, type LinhaEncomenda } from "../domain/encomendas";
import EncomendasLista from "./EncomendasLista";

/**
 * "A encomendar" na ficha da obra: cada material em falta das tarefas por
 * fazer, com a data-limite para encomendar (início − prazo do fornecedor −
 * 2 dias). Os urgentes à vista; o resto recolhido. Nada se não houver
 * materiais ligados às tarefas.
 */
export default function ObraEncomendas({
  orgId,
  obraId,
  recarga = 0,
}: {
  orgId: string;
  obraId: string;
  recarga?: number;
}) {
  const [linhas, setLinhas] = useState<LinhaEncomenda[]>([]);
  const [tudo, setTudo] = useState(false);

  useEffect(() => {
    let vivo = true;
    encomendas(orgId, obraId)
      .then((l) => vivo && setLinhas(l))
      .catch(() => vivo && setLinhas([]));
    return () => {
      vivo = false;
    };
  }, [orgId, obraId, recarga]);

  if (linhas.length === 0) return null;
  const urgentes = linhas.filter(encomendaUrgente);
  const visiveis = tudo ? linhas : urgentes;

  return (
    <div className="rounded-lg border border-slate-200 p-3" data-testid="obra-encomendas">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          A encomendar
          {urgentes.length > 0 && (
            <span className="ml-1.5 normal-case tracking-normal text-red-700">· {urgentes.length} urgente{urgentes.length === 1 ? "" : "s"}</span>
          )}
        </p>
        {linhas.length > urgentes.length && (
          <button type="button" onClick={() => setTudo((t) => !t)} className="text-xs text-violet-700 hover:underline">
            {tudo ? "Só os urgentes" : `Ver todos (${linhas.length})`}
          </button>
        )}
      </div>
      {visiveis.length > 0 ? (
        <EncomendasLista linhas={visiveis} />
      ) : (
        <p className="mt-1 text-xs text-slate-500">Nada urgente: os materiais estão encomendados ou há tempo.</p>
      )}
    </div>
  );
}

import { useEffect, useState } from "react";
import { avisoBancada, type AvisoBancada } from "../lib/obras";
import { data, dataHora } from "../lib/formatar";

/**
 * "Bancada: avisado o marmorista a …". O aviso sai sozinho quando a obra é
 * planeada ou replaneada com tarefas de bancada (base: ops_obra_avisar_bancada),
 * com medidas, local e datas — para preparar cortes e encomendar a pedra.
 * Não mostra nada se a obra não tem bancada.
 */
export default function ObraAvisoBancada({ obraId, recarga = 0 }: { obraId: string; recarga?: number }) {
  const [aviso, setAviso] = useState<AvisoBancada | null>(null);

  useEffect(() => {
    let vivo = true;
    avisoBancada(obraId)
      .then((a) => vivo && setAviso(a))
      .catch(() => vivo && setAviso(null));
    return () => {
      vivo = false;
    };
  }, [obraId, recarga]);

  if (!aviso) return null;
  const quando = dataHora(aviso.enviado_em);

  if (aviso.sem_especialidade) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="aviso-bancada">
        <p className="font-medium">
          Bancada{aviso.primeira ? ` a ${data(aviso.primeira)}` : ""}: ninguém com a especialidade Marmorista
        </p>
        <p className="text-xs">
          Avisados a {quando}: {aviso.para.join(", ") || "ninguém"}. Em Equipa, dá a especialidade a quem faz as bancadas.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" data-testid="aviso-bancada">
      <p className="font-medium">
        Bancada: avisado o marmorista a {quando}
        {aviso.para.length > 0 && <span className="font-normal"> · {aviso.para.join(", ")}</span>}
      </p>
      <p className="text-xs">
        {[aviso.datas, aviso.medidas && `Medidas: ${aviso.medidas}`, aviso.local && `Local: ${aviso.local}`]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </div>
  );
}

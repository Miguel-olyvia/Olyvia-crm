import { useEffect, useState } from "react";
import { cx } from "./ui";
import { fichaLocalDaObra, type FichaLocal as Ficha } from "../lib/obras";
import { fichaTemDados, linhasExterior, linhasInterior, type LinhaFicha } from "../domain/fichaLocal";

// Uma leitura por obra, partilhada pelas tarefas da mesma obra na lista.
const cache = new Map<string, Promise<Ficha>>();
function lerFicha(obraId: string): Promise<Ficha> {
  let p = cache.get(obraId);
  if (!p) {
    // Num .then: um erro síncrono também vira rejeição (e a ficha fica por mostrar).
    p = Promise.resolve()
      .then(() => fichaLocalDaObra(obraId))
      .catch((e) => {
        cache.delete(obraId);
        throw e;
      });
    cache.set(obraId, p);
  }
  return p;
}

/**
 * A ficha do local da obra (do CRM): acesso, andar e elevador,
 * estacionamento, e a casa (habitada, animais, amianto…). Na ficha da obra e
 * no cartão da tarefa do técnico. Não mostra nada se a ficha estiver vazia.
 */
export default function FichaLocal({ obraId, compacta = false }: { obraId: string; compacta?: boolean }) {
  const [ficha, setFicha] = useState<Ficha | null>(null);

  useEffect(() => {
    let vivo = true;
    lerFicha(obraId)
      .then((f) => vivo && setFicha(f))
      .catch(() => vivo && setFicha(null));
    return () => {
      vivo = false;
    };
  }, [obraId]);

  if (!ficha || !fichaTemDados(ficha)) return null;
  const ext = linhasExterior(ficha);
  const int = linhasInterior(ficha);

  const chips = (linhas: LinhaFicha[]) => (
    <div className="mt-1 flex flex-wrap gap-1">
      {linhas.map((l) => (
        <span
          key={l.texto}
          className={cx(
            "rounded-full px-2 py-0.5 text-[11px] ring-1 ring-inset",
            l.atencao ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-white text-slate-600 ring-slate-200"
          )}
        >
          {l.texto}
        </span>
      ))}
    </div>
  );

  return (
    <div className={cx(compacta ? "" : "rounded-lg border border-slate-200 p-3")} data-testid="ficha-local">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Ficha do local</p>
      {ext.length > 0 && chips(ext)}
      {int.length > 0 && chips(int)}
      {ficha.notas_interior?.trim() && (
        <p className="mt-1 whitespace-pre-line text-xs text-slate-600">{ficha.notas_interior.trim()}</p>
      )}
    </div>
  );
}

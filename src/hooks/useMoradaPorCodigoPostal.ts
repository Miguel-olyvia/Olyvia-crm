import { useEffect, useRef, useState } from "react";
import { cpCompleto, procurarCodigoPostal, type MoradaDoCodigoPostal } from "@/lib/addresses/procurarCodigoPostal";

/**
 * Quando o código postal fica completo (NNNN-NNN), procura a morada e chama `aoEncontrar` uma vez por código.
 * Quem usa decide o que preencher; a regra é só preencher os campos vazios, para não apagar o que a pessoa escreveu.
 * `ativo` a false desliga (por exemplo fora de Portugal ou em modo de leitura).
 */
export function useMoradaPorCodigoPostal(cp: string | null | undefined, aoEncontrar: (m: MoradaDoCodigoPostal) => void, ativo = true) {
  const [aProcurar, setAProcurar] = useState(false);
  const ultimo = useRef<string | null>(cpCompleto(cp));
  const cb = useRef(aoEncontrar);
  cb.current = aoEncontrar;
  const chave = ativo ? cpCompleto(cp) : null;

  useEffect(() => {
    if (!chave || chave === ultimo.current) return;
    ultimo.current = chave;
    const ctrl = new AbortController();
    setAProcurar(true);
    procurarCodigoPostal(chave, ctrl.signal)
      .then((m) => { if (m && !ctrl.signal.aborted) cb.current(m); })
      .finally(() => { if (!ctrl.signal.aborted) setAProcurar(false); });
    return () => ctrl.abort();
  }, [chave]);

  return { aProcurar };
}

/** Só o valor novo quando o atual está vazio. */
export function seVazio(atual: string | null | undefined, novo: string): string {
  return (atual ?? "").trim() ? (atual as string) : novo;
}

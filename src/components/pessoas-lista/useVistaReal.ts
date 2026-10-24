import { useCallback, useState } from "react";
import { guardarPrefsPessoas, lerPrefsPessoas } from "@/components/pessoas/preferenciasPessoas";
import type { VistaPessoas } from "@/components/pessoas/pessoasTipos";

/**
 * A vista da página real (Lista ou Quadro), guardada com as preferências da página (a mesma escolha do protótipo).
 * Sem `permitido` (sem base ou sem `pessoas.view`) a vista é sempre a Lista, mesmo que haja um «quadro» guardado. Com `aEsperar` (as permissões
 * ainda carregam) o «quadro» guardado mantém-se: cair na Lista para saltar para o Quadro a seguir faria um pedido a mais e um salto no ecrã.
 */
export function useVistaReal(permitido: boolean, aEsperar = false): { vista: VistaPessoas; mudar: (vista: VistaPessoas) => void } {
  const [escolhida, setEscolhida] = useState<VistaPessoas>(() => lerPrefsPessoas().vista);
  const mudar = useCallback((vista: VistaPessoas) => {
    setEscolhida(vista);
    guardarPrefsPessoas({ ...lerPrefsPessoas(), vista });
  }, []);
  return { vista: permitido || aEsperar ? escolhida : "lista", mudar };
}

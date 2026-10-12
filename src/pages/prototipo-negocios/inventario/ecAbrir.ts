// openEC() do mockup como hook.
import { useCtxInv } from "./ctxInv";
import { can } from "./perfil";

/** openEC() do mockup: sem `contracts.view` não abre e diz porquê. */
export function useAbrirEc(): (id: string) => void {
  const { abrir, avisar } = useCtxInv();
  return (id) => {
    if (!can("contracts.view")) { avisar("Saídas para clientes exige inventário + contratos.", true); return; }
    abrir({ t: "ec", id });
  };
}

/** As filiais do organograma de exemplo. */
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";

export interface FilialOpcao {
  id: string;
  name: string;
}

export function useFiliaisDaArvore(): { filiais: FilialOpcao[]; loading: boolean } {
  const filiais = useEstadoRh((e) => e.filiais);
  return { filiais, loading: false };
}

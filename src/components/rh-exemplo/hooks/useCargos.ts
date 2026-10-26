/**
 * O catalogo de cargos, delegando ao hook real que le/escreve em Supabase.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import { useCargos as useCargosReal } from "@/hooks/useCargos";

export type {
  HrCargo,
  NovoCargoRH,
  EdicaoCargoRH,
  ResultadoDefinirSalario,
} from "@/hooks/useCargos";

export function useCargos() {
  return useCargosReal();
}

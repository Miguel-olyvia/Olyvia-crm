// O ecrã está embebido no novo Inventário (src/pages/inventario-novo)? O InventarioNovo fornece true; fora dele é false.
// Serve só para esconder o que a moldura já mostra (os separadores antigos, o convite para o novo Inventário).
import { createContext, useContext } from "react";

export const InventarioEmbebido = createContext(false);

/** O que se eliminou num ecrã clássico (fatia 4 do novo Inventário: o toast oferece "Restaurar"). */
export type TipoEliminado = "po" | "fornecedor" | "armazem" | "stock";
export interface EliminadoInventario {
  tipo: TipoEliminado;
  id: string;
  /** O que se mostra no toast (nº da PO, nome do fornecedor/armazém/produto); null se o ecrã não o tiver à mão. */
  rotulo: string | null;
}
export type AvisarInventario = (evento: "eliminado", dados: EliminadoInventario) => void;

/**
 * Os avisos dos ecrãs clássicos para a moldura do novo Inventário. Fora da moldura vale null — e o ecrã chama
 * `avisos?.(…)`, que não faz nada: o comportamento do ecrã clássico fica exatamente o mesmo.
 */
export const AvisosInventario = createContext<AvisarInventario | null>(null);
export const useAvisosInventario = (): AvisarInventario | null => useContext(AvisosInventario);

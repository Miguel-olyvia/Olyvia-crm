// O ecrã está embebido no novo Inventário (src/pages/inventario-novo)? O InventarioNovo fornece true; fora dele é false.
// Serve só para esconder o que a moldura já mostra (os separadores antigos, o convite para o novo Inventário).
import { createContext } from "react";

export const InventarioEmbebido = createContext(false);

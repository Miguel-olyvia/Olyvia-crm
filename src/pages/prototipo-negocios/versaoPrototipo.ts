// A versão do protótipo que se está a ver: Atual, V2 ou V2 funcional. É uma preferência de quem vê (não um dado da demonstração): vive fora do
// Estado e da VERSAO, no localStorage, na mesma chave do antigo interruptor "Ver a V2", e "Repor a demonstração" não a apaga.
// Compatível com o valor antigo: "1" (V2 ligada) é a V2 e "0" (desligada) é a Atual; a V2 funcional grava "funcional".
import type { Vista } from "./motor";

export type VersaoProto = "atual" | "v2" | "funcional";
export const CHAVE_VERSAO = "olyvia-prototipo-v2";

export const VERSOES: readonly { id: VersaoProto; nome: string }[] = [
  { id: "atual", nome: "Atual" }, { id: "v2", nome: "V2" }, { id: "funcional", nome: "V2 funcional" },
];

const GUARDADO: Record<VersaoProto, string> = { atual: "0", v2: "1", funcional: "funcional" };

/** O valor guardado em versão; qualquer outra coisa (ou nada) é a Atual. */
export function versaoDe(valor: string | null): VersaoProto {
  return valor === "1" ? "v2" : valor === "funcional" ? "funcional" : "atual";
}

export function lerVersao(): VersaoProto {
  try {
    return versaoDe(localStorage.getItem(CHAVE_VERSAO));
  } catch {
    return "atual"; // sem storage: a versão Atual
  }
}

export function gravarVersao(v: VersaoProto): void {
  try { localStorage.setItem(CHAVE_VERSAO, GUARDADO[v]); } catch { /* sem storage: vale só nesta sessão */ }
}

/** A vista equivalente quando se muda de versão: a Atual tem Leads e Clientes; a V2 e a V2 funcional têm Pessoas. As outras vistas ficam. */
export function vistaEquivalente(vista: Vista, para: VersaoProto): Vista {
  if (para === "atual") return vista === "pessoas" ? "leads" : vista;
  return vista === "leads" || vista === "clientes" ? "pessoas" : vista;
}

export const nomeVersao = (v: VersaoProto): string => VERSOES.find((x) => x.id === v)!.nome;

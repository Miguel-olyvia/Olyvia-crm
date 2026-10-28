// Os campos da visita da Emylia a que uma pergunta do levantamento se pode ligar (só leitura de src/emylia/campos.ts: nada aqui os altera).
// Liga-se pela chave do campo; o valor de cada opção é um dos valores que o campo aceita. Só campos de escolha, sim/não, número e texto curto.
import { AREA, ESCOLHAS, EXTERIOR, INTERIOR, type Def } from "@/emylia/campos";

export interface CampoEmylia {
  k: string;
  rotulo: string;
  /** Os valores que o campo aceita, quando são uma lista fechada (escolha, sim/não, vários). Vazio nos campos livres. */
  valores: readonly string[];
  tipo: "escolha" | "varios" | "numero" | "texto";
}

const TIPOS_LIGAVEIS: Record<string, CampoEmylia["tipo"] | undefined> = {
  escolha: "escolha", sim_nao: "escolha", varios: "varios", numero: "numero", contador: "numero", texto: "texto",
};

function deCampo(c: Def): CampoEmylia | null {
  const tipo = TIPOS_LIGAVEIS[c.t];
  if (!tipo) return null;
  const valores = c.t === "sim_nao" ? ["Sim", "Não"] : (c.op ?? []);
  return { k: c.k, rotulo: c.l, valores, tipo };
}

/** Os campos de Exterior, Interior, Área de intervenção e Escolhas do cliente, pela ordem da Emylia. */
export function camposLigaveis(): CampoEmylia[] {
  return [EXTERIOR, INTERIOR, AREA, ESCOLHAS].flatMap((g) => g.campos.map(deCampo).filter((c): c is CampoEmylia => c !== null));
}

export const campoLigavel = (k: string): CampoEmylia | undefined => camposLigaveis().find((c) => c.k === k);

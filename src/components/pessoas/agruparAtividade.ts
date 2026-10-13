// A atividade agrupada por dia, para a linha do tempo da ficha. Função pura: o dia de hoje chega por parâmetro.
import { diasParaPrazo } from "@/components/negocio-metas/saudeNegocio";
import type { ItemAtividade } from "./pessoasTipos";

export interface GrupoDia {
  /** AAAA-MM-DD. */
  dia: string;
  relativo: "hoje" | "ontem" | null;
  itens: ItemAtividade[];
}

/** Agrupa por dia, do mais recente para o mais antigo; dentro do dia mantém a ordem recebida. Não altera `itens`. */
export function agruparPorDia(itens: readonly ItemAtividade[], hoje: string): GrupoDia[] {
  const dias = [...new Set(itens.map((i) => i.quando))].sort((a, b) => b.localeCompare(a));
  return dias.map((dia) => {
    const d = diasParaPrazo(dia, hoje);
    return { dia, relativo: d === 0 ? "hoje" : d === -1 ? "ontem" : null, itens: itens.filter((i) => i.quando === dia) };
  });
}

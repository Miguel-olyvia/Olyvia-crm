import { createContext, useContext } from "react";

/** Os valores que o CHECK de negocio_workflow_config.momento_ganho aceita. */
export type MomentoGanho = "manual" | "proposta_aceite" | "contrato_assinado";

/**
 * De onde a página Pessoas lê: dados de exemplo ou a base (com a organização e a regra de ganho).
 * Quem monta o provider deve memoizar o `value` (useMemo), senão todos os consumidores
 * voltam a desenhar-se a cada render do pai.
 */
export type FontePessoas =
  | { modo: "exemplo" }
  | {
    modo: "real";
    organizationId: string;
    momentoGanho: MomentoGanho | null;
    /** O `anew_users.id` de quem está na sessão (para «Só as minhas»); `null`/ausente enquanto não se conhece. */
    utilizadorId?: string | null;
    /** `pessoas.delete` (com qualquer âmbito): mostra o lixo de negócios e deixa mandar para lá e restaurar. Ausente conta como falso. */
    podeApagarNegocios?: boolean;
  };

export const FontePessoasContext = createContext<FontePessoas>({ modo: "exemplo" });

export function useFontePessoas(): FontePessoas {
  return useContext(FontePessoasContext);
}

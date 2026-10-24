import { useMemo } from "react";
import { usePermissionScope } from "@/hooks/usePermissionScope";

/** As permissões que o ecrã de fecho esconde ou mostra: criar e editar de cada documento, reabrir um ganho e converter leads. */
export const CODIGOS_PERMISSOES_FECHO: readonly string[] = [
  "quotes.create", "quotes.edit", "proposals.create", "proposals.edit", "client_contracts.create", "client_contracts.edit", "pessoas.reopen", "leads.convert",
];

/**
 * Quais das permissões do fecho a sessão tem (qualquer âmbito diferente de NONE: o âmbito exato, por negócio, é a base que o decide e um «não»
 * dela aparece traduzido). Só serve para esconder o que a base recusaria.
 *
 * Devolve `undefined` enquanto a leitura não está feita (a carregar, a leitura falhou, ou sem a função): quem consome só restringe com uma lista,
 * e uma lista vazia esconderia todos os botões. Sem lista nada se esconde e a base decide.
 * Vive aqui porque os ecrãs de Pessoas só importam hooks de `@/hooks/pessoas/`.
 */
export function usePermissoesDoFecho(): readonly string[] | undefined {
  const { loading, anewUserId, getPermissionScope } = usePermissionScope() as {
    loading?: boolean;
    anewUserId?: string | null;
    getPermissionScope?: (codigo: string) => string;
  };
  // A leitura falhada (a RPC falha fechada) acaba de carregar sem utilizador: é o mesmo que ainda não ter lido.
  const ler = typeof getPermissionScope === "function" && loading !== true && anewUserId != null ? getPermissionScope : null;
  // A identidade só muda quando muda o conjunto: quem memoriza por ela não refaz tudo a cada render.
  const chave = ler ? CODIGOS_PERMISSOES_FECHO.filter((c) => ler(c) !== "NONE").join(",") : null;
  return useMemo(() => (chave === null ? undefined : chave === "" ? [] : chave.split(",")), [chave]);
}

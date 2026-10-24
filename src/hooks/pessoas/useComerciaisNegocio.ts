import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { lerComerciais } from "./novaLead/comerciaisNovaLead";
import { useFontePessoas } from "./useFontePessoas";

const CINCO_MINUTOS = 5 * 60 * 1000;

/**
 * A mesma chave do painel «Nova lead» (`chavesNovaLead.comerciais`), para partilhar a cache. Repete-se aqui, em vez de a importar, porque esse
 * módulo puxa o contexto de permissões (que liga à sessão ao ser importado) para um diálogo que só precisa da leitura. Um teste confere que são iguais.
 */
export const chaveComerciaisNegocio = (organizationId: string | null) => ["pessoas-nova-lead", "comerciais", organizationId] as const;

export interface ComercialDoNegocio {
  id: string;
  nome: string;
}

export interface ComerciaisDoNegocio {
  comerciais: ComercialDoNegocio[];
  isLoading: boolean;
  /** A leitura falhou: a lista vazia não quer dizer que não haja comerciais. */
  isError: boolean;
  repetir: () => void;
}

const SEM_COMERCIAIS: ComercialDoNegocio[] = [];

/**
 * Os comerciais a quem se pode entregar um negócio, lidos como na página de Leads (`lerComerciais`: o departamento Comercial da organização, ou
 * todos os membros ativos se não há departamento; nunca clientes nem utilizadores do portal). Partilha a cache do painel «Nova lead». Só lê com
 * `ativo` (o diálogo aberto) e em modo real. A base valida o escolhido (membro ativo da organização do negócio): um «não» dela aparece traduzido.
 */
export function useComerciaisNegocio(ativo: boolean): ComerciaisDoNegocio {
  const fonte = useFontePessoas();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const consulta = useQuery({
    queryKey: chaveComerciaisNegocio(organizationId),
    queryFn: () => lerComerciais(organizationId as string),
    enabled: ativo && organizationId !== null,
    staleTime: CINCO_MINUTOS,
    retry: 1,
  });
  const comerciais = useMemo(
    () => (consulta.data?.users ?? SEM_COMERCIAIS).map((u) => ({ id: u.id, nome: u.name })).sort((a, b) => a.nome.localeCompare(b.nome, "pt")),
    [consulta.data],
  );
  return { comerciais, isLoading: consulta.isLoading, isError: consulta.isError, repetir: () => { void consulta.refetch(); } };
}

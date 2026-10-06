/**
 * Le e grava a configuracao de admissao da organizacao activa: para cada campo
 * da pessoa, UMA de tres posicoes (`convite`, `ficha`, `opcional`); os campos do
 * RH vem fixos (`configuravel = false`, posicao `rh`).
 *
 * LEITURA: `rpc_hr_admissao_configuracao_ler` -- gate baixo (gerir OU criar OU
 * ver pessoas na organizacao), para o formulario interno de criar pessoa ler a
 * configuracao sem a permissao de a alterar.
 *
 * ESCRITA: `rpc_hr_admissao_definir_posicao` -- so quem tem
 * `hr.admissao.obrigatorios.gerir`. O ecra deixou de fazer upsert directo em
 * `organization_admissao_settings`: a validacao (posicao valida, codigo
 * configuravel) vive na base.
 *
 * ROBUSTEZ: ate o lote da base estar aplicado, uma linha pode ainda trazer o
 * antigo `obrigatorio` booleano em vez de `posicao` (true = convite, false =
 * opcional); tolera-se so para o ecra nao ficar vazio nesse intervalo.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import { getGenericFriendlyFallback, mapFriendlyErrorText } from "@/utils/friendlyError";
import type { ConfiguracaoCampo, PosicaoCampoPessoa } from "@/lib/hr/admissaoObrigatorios";

export type { ConfiguracaoCampo, PosicaoCampoPessoa };

/**
 * O que o ecra mostra quando a LEITURA falha: nunca o `message` cru da base
 * ("permission denied for function ..."). Recusa por permissao -> o texto
 * traduzido de "sem permissao"; qualquer outra falha -> o texto generico
 * traduzido. O erro original continua em `erroOriginal` para quem o quiser
 * registar.
 */
function mensagemDeLeitura(erro: unknown): string {
  return isPermissionError(erro)
    ? mapFriendlyErrorText("insufficient_privilege")
    : getGenericFriendlyFallback();
}

/** Codigo (nao texto): so acontece se a mutacao correr sem organizacao activa, o que o ecra nao permite. */
const SEM_ORGANIZACAO = "sem_organizacao_activa";

interface LinhaConfiguracao {
  codigo: string;
  origem: "pessoa" | "rh";
  condicional?: boolean;
  posicao?: string | null;
  obrigatorio?: boolean;
  configuravel?: boolean;
}

const POSICOES_VALIDAS: readonly string[] = ["convite", "ficha", "opcional", "rh"];

/** Normaliza uma linha da base, incluindo o formato antigo com `obrigatorio`. */
export function normalizarLinhaConfiguracao(linha: LinhaConfiguracao): ConfiguracaoCampo {
  const origem = linha.origem === "rh" ? "rh" : "pessoa";
  let posicao: ConfiguracaoCampo["posicao"];
  if (origem === "rh") {
    posicao = "rh";
  } else if (linha.posicao && POSICOES_VALIDAS.includes(linha.posicao)) {
    posicao = linha.posicao as ConfiguracaoCampo["posicao"];
  } else {
    posicao = linha.obrigatorio === false ? "opcional" : "convite";
  }
  return {
    codigo: linha.codigo,
    origem,
    condicional: linha.condicional === true,
    posicao,
    configuravel: linha.configuravel ?? origem === "pessoa",
  };
}

export function useConfiguracaoObrigatoriosAdmissao() {
  const { activeCompany } = useCompany();
  const queryClient = useQueryClient();
  const orgId = activeCompany?.id;
  const camposQueryKey = ["hr-admissao-configuracao", orgId];

  const {
    data: campos,
    isLoading,
    error: camposErro,
  } = useQuery({
    queryKey: camposQueryKey,
    queryFn: async (): Promise<ConfiguracaoCampo[]> => {
      if (!orgId) throw new Error(SEM_ORGANIZACAO);
      const { data: linhas, error } = await hrRpc("rpc_hr_admissao_configuracao_ler", {
        p_organization_id: orgId,
      });
      if (error) throw error;
      return ((linhas ?? []) as LinhaConfiguracao[]).map(normalizarLinhaConfiguracao);
    },
    enabled: !!orgId,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ codigo, posicao }: { codigo: string; posicao: PosicaoCampoPessoa }) => {
      if (!orgId) throw new Error(SEM_ORGANIZACAO);
      const { error } = await hrRpc("rpc_hr_admissao_definir_posicao", {
        p_organization_id: orgId,
        p_codigo: codigo,
        p_posicao: posicao,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // A configuracao e o mapa antigo que o convite e as pendencias possam
      // ainda ter em cache.
      queryClient.invalidateQueries({ queryKey: camposQueryKey });
      queryClient.invalidateQueries({ queryKey: ["organization-admissao-settings", orgId] });
      // O formulario interno de criar/editar pessoa le a MESMA configuracao com
      // staleTime de 60 s: sem isto, durante um minuto pediria os campos pela
      // configuracao antiga.
      queryClient.invalidateQueries({ queryKey: ["hr-admissao-posicoes-campos", orgId] });
    },
  });

  const definirPosicao = async (codigo: string, posicao: PosicaoCampoPessoa): Promise<void> => {
    await saveMutation.mutateAsync({ codigo, posicao });
  };

  const erro: string | null = camposErro ? mensagemDeLeitura(camposErro) : null;

  return {
    campos: campos ?? [],
    isLoading,
    isSaving: saveMutation.isPending,
    definirPosicao,
    erro,
    /** O erro tal como veio (para registo); NUNCA mostrar o `message`. */
    erroOriginal: camposErro ?? null,
  };
}

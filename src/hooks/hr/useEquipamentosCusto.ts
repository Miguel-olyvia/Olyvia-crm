/**
 * Os equipamentos atribuidos as pessoas (`pessoas_equipamentos`) e o que se faz com eles. Tudo pelas RPCs com o JWT do RH
 * (a permissao, a organizacao empregadora e o limite de escritas por hora sao decididos na base):
 *  - listar: `rpc_hr_equipamentos_listar(p_organization_id, p_pessoa_id)`, `hr.pessoas.retribuicao.view`. Sem pessoa, os da
 *    organizacao; com pessoa, os dessa pessoa. Nao traz os de pessoas apagadas.
 *  - atribuir / devolver / alterar a conta: `hr.pessoas.retribuicao.edit`. O equipamento devolvido conta ATE AO MES DA
 *    DEVOLUCAO, inclusive (`comoConta.ts`). Devolver duas vezes da HRA38 (`estado_invalido`).
 * Antes de ir a base, a validacao local (`lib/equipamentos.ts`, `lib/comoConta.ts`) devolve o mesmo nome de erro que a base daria
 * (`semDescricao`, `antesDaEntrega`...), para o formulario o mostrar junto do campo. Depois de cada escrita a lista refaz-se (refetch).
 * `useEquipamentosCustoAcoes` e so as escritas, para os paineis e dialogos que nao precisam da lista (nao fazem um segundo pedido).
 */
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { hrRpc } from "@/lib/hr/hrDb";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getLocalizedFallback } from "@/utils/friendlyError";
import {
  argumentosDeAtribuir, argumentosDeCorrecao, argumentosDaConta, daBaseComTextoDeData, dataDentroDoPermitido, equipamentoDaLinha, erroDeTetoNovo, falhaDeEscrita, recusaDeCampo, recusaDeDataFora, SUCESSO_CUSTO, textoDoErro,
  type CorrecaoEquipamento, type LinhaEquipamento, type ResultadoCusto,
} from "@/lib/hr/custoBase";
import { CHAVE_SEM_PERMISSAO_ATIVOS } from "@/lib/hr/errosCusto";
import { CHAVE_CUSTO_EQUIPAMENTOS, CHAVE_EQUIPAMENTOS_LIVRES, CHAVE_OCUPACOES_ATIVO, CHAVE_POR_DEVOLVER } from "./chavesEquipamentos";
import { normalizarConta, validarConta, type ContaItem } from "@/components/rh-exemplo/lib/comoConta";
import {
  validarDevolucao, validarNovoEquipamento, type EquipamentoPessoa, type EstadoDevolucao, type NovoEquipamentoBase,
} from "@/components/rh-exemplo/lib/equipamentos";

export type { NovoEquipamentoBase } from "@/components/rh-exemplo/lib/equipamentos";
export type { CorrecaoEquipamento } from "@/lib/hr/custoBase";

export { CHAVE_CUSTO_EQUIPAMENTOS };
const LIMITE_PAGINA = 1000;
const PAGINAS_MAXIMAS = 20;

export interface ResultadoAtribuir extends ResultadoCusto {
  /** O id do equipamento criado; `null` quando falhou. */
  id: string | null;
}

export interface ResultadoCorrecao extends ResultadoCusto {
  /** Quantas pessoas tem ocupacoes deste ativo (o custo delas muda em meses passados); `null` se a base nao o disse. */
  pessoasAfetadas: number | null;
}

export interface EquipamentosCustoAcoes {
  atribuir: (novo: NovoEquipamentoBase) => Promise<ResultadoAtribuir>;
  /** `equipamento` e o que se devolve (a validacao local compara a data com a entrega). */
  devolver: (equipamento: EquipamentoPessoa, data: string, estado: EstadoDevolucao | string) => Promise<ResultadoCusto>;
  /** So a farda: numa linha que e um ativo a base recusa (HRA91). */
  alterarConta: (id: string, nova: ContaItem) => Promise<ResultadoCusto>;
  /** Corrige valor, vida, renda ou datas de um equipamento que e um ativo: pede `ativos.edit`, nunca a permissao das retribuicoes. */
  corrigir: (ativoId: string, correcao: CorrecaoEquipamento) => Promise<ResultadoCorrecao>;
}

export interface EquipamentosCustoHook extends EquipamentosCustoAcoes {
  /** `null` enquanto carrega, ou quando a leitura falhou: nunca valores de exemplo. */
  equipamentos: EquipamentoPessoa[] | null;
  aCarregar: boolean;
  /** O texto traduzido da falha de leitura; `null` quando correu bem. */
  erro: string | null;
}

interface Opcoes {
  /** So os equipamentos desta pessoa; sem isto, os da organizacao. */
  pessoaId?: string | null;
  /** Falso: nao pede nada (por exemplo sem a permissao de ver). */
  enabled?: boolean;
}

/** As escritas, sem lista. */
export function useEquipamentosCustoAcoes(): EquipamentosCustoAcoes {
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id ?? null;
  const queryClient = useQueryClient();

  // O equipamento e um ativo: o que muda no RH muda tambem na lista dos Ativos (ocupacoes, quem o tem), no que esta livre para entregar
  // e no numero de pessoas que uma correcao afeta (consultas de cache de 5 minutos, que ninguem mais refaz).
  const refazer = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [CHAVE_CUSTO_EQUIPAMENTOS, organizationId] });
    await queryClient.invalidateQueries({ queryKey: [CHAVE_EQUIPAMENTOS_LIVRES, organizationId] });
    await queryClient.invalidateQueries({ queryKey: [CHAVE_OCUPACOES_ATIVO, organizationId] });
    await queryClient.invalidateQueries({ queryKey: [CHAVE_POR_DEVOLVER, organizationId] });
    await queryClient.invalidateQueries({ queryKey: ["ativos"] });
  }, [organizationId, queryClient]);

  const atribuir = useCallback(
    async (novo: NovoEquipamentoBase): Promise<ResultadoAtribuir> => {
      const erro = validarNovoEquipamento(novo);
      if (erro) return { ...recusaDeCampo(erro), id: null };
      const teto = erroDeTetoNovo(novo);
      // A data foi preenchida mas fica fora do intervalo: texto proprio, nao «indica a data de entrega».
      if (teto) return { ...(teto === "semData" ? recusaDeDataFora() : recusaDeCampo(teto)), id: null };
      if (!organizationId) return { ...recusaDeCampo("semPessoa"), id: null };
      try {
        const { data, error } = await hrRpc("rpc_hr_equipamento_atribuir", argumentosDeAtribuir(novo, organizationId));
        if (error) return { ...daBaseComTextoDeData(falhaDeEscrita(error, "hr-equipamento-atribuir")), id: null };
        await refazer();
        return { ...SUCESSO_CUSTO, id: (data as { id?: string } | null)?.id ?? null };
      } catch (e) {
        return { ...daBaseComTextoDeData(falhaDeEscrita(e, "hr-equipamento-atribuir")), id: null };
      }
    },
    [organizationId, refazer],
  );

  const devolver = useCallback(
    async (equipamento: EquipamentoPessoa, data: string, estado: EstadoDevolucao | string): Promise<ResultadoCusto> => {
      const erro = validarDevolucao(equipamento, data, estado);
      if (erro) return recusaDeCampo(erro);
      if (!dataDentroDoPermitido(data)) return recusaDeDataFora();
      if (!organizationId) return recusaDeCampo("semData");
      try {
        const { error } = await hrRpc("rpc_hr_equipamento_devolver", {
          p_id: equipamento.id,
          p_organization_id: organizationId,
          p_data: data,
          p_estado: estado,
        });
        if (error) return daBaseComTextoDeData(falhaDeEscrita(error, "hr-equipamento-devolver"));
        await refazer();
        return SUCESSO_CUSTO;
      } catch (e) {
        return daBaseComTextoDeData(falhaDeEscrita(e, "hr-equipamento-devolver"));
      }
    },
    [organizationId, refazer],
  );

  const alterarConta = useCallback(
    async (id: string, nova: ContaItem): Promise<ResultadoCusto> => {
      const erro = validarConta(nova);
      if (erro) return recusaDeCampo(erro);
      if (!organizationId) return recusaDeCampo("semInicio");
      try {
        const { error } = await hrRpc("rpc_hr_equipamento_alterar_conta", {
          p_id: id,
          p_organization_id: organizationId,
          p_modo: normalizarConta(nova).modo,
          p_meses: argumentosDaConta(nova).p_conta_meses,
          p_inicio: argumentosDaConta(nova).p_conta_inicio,
          p_fim: argumentosDaConta(nova).p_conta_fim,
        });
        if (error) return daBaseComTextoDeData(falhaDeEscrita(error, "hr-equipamento-alterar-conta"), true);
        await refazer();
        return SUCESSO_CUSTO;
      } catch (e) {
        return daBaseComTextoDeData(falhaDeEscrita(e, "hr-equipamento-alterar-conta"), true);
      }
    },
    [organizationId, refazer],
  );

  const corrigir = useCallback(
    async (ativoId: string, correcao: CorrecaoEquipamento): Promise<ResultadoCorrecao> => {
      if (!organizationId || correcao.campos.length === 0) return { ...recusaDeCampo("semData"), pessoasAfetadas: null };
      try {
        const { data, error } = await hrRpc("rpc_hr_equipamento_corrigir", argumentosDeCorrecao(organizationId, ativoId, correcao));
        if (error) return { ...daBaseComTextoDeData(falhaDeEscrita(error, "hr-equipamento-corrigir", CHAVE_SEM_PERMISSAO_ATIVOS)), pessoasAfetadas: null };
        // O custo de pessoas de meses passados mudou: refaz-se a lista do RH e a dos Ativos.
        await refazer();
        const n = (data as { pessoas_afetadas?: unknown } | null)?.pessoas_afetadas;
        return { ...SUCESSO_CUSTO, pessoasAfetadas: typeof n === "number" ? n : null };
      } catch (e) {
        return { ...daBaseComTextoDeData(falhaDeEscrita(e, "hr-equipamento-corrigir", CHAVE_SEM_PERMISSAO_ATIVOS)), pessoasAfetadas: null };
      }
    },
    [organizationId, refazer],
  );

  return { atribuir, devolver, alterarConta, corrigir };
}

/** A lista (da organizacao ou de uma pessoa) e as escritas. */
export function useEquipamentosCusto({ pessoaId = null, enabled = true }: Opcoes = {}): EquipamentosCustoHook {
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id ?? null;
  const acoes = useEquipamentosCustoAcoes();

  const consulta = useQuery({
    queryKey: [CHAVE_CUSTO_EQUIPAMENTOS, organizationId, pessoaId],
    enabled: enabled && organizationId !== null,
    retry: false,
    queryFn: async (): Promise<EquipamentoPessoa[]> => {
      // A base entrega uma pagina de ate 1000 (500 por omissao); le-se pagina a pagina ate vir uma incompleta.
      const linhas: LinhaEquipamento[] = [];
      for (let pagina = 0; pagina < PAGINAS_MAXIMAS; pagina += 1) {
        const { data, error } = await hrRpc("rpc_hr_equipamentos_listar", {
          p_organization_id: organizationId, p_pessoa_id: pessoaId, p_limite: LIMITE_PAGINA, p_offset: pagina * LIMITE_PAGINA,
        });
        if (error) throw new Error(textoDoErro(error, "hr-equipamentos-listar"));
        const recebidas = (data ?? []) as LinhaEquipamento[];
        linhas.push(...recebidas);
        if (recebidas.length < LIMITE_PAGINA) return linhas.map(equipamentoDaLinha);
      }
      // Todas as paginas vieram cheias: ha mais do que se le. Em vez de mostrar uma lista truncada (e custos errados), falha.
      captureFlowError(new Error("hr-equipamentos-listar: paginas_maximas"), "ativos-listar");
      throw new Error(getLocalizedFallback("hr.custo.erro.listaDemasiadoLonga"));
    },
  });

  return {
    equipamentos: consulta.data ?? null,
    aCarregar: consulta.isLoading,
    erro: consulta.error ? (consulta.error as Error).message : null,
    ...acoes,
  };
}

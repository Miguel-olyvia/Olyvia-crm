/**
 * As regras de assiduidade DA EMPRESA activa (`hr_regras_assiduidade`): por agora, o prazo para justificar faltas e
 * justificacoes de dia, em dias uteis. Configuravel por organizacao, 5 por omissao (decisao de 27/10;
 * supabase/rascunhos/DESENHO-prazo-configuravel.md).
 *
 * TUDO POR RPC, NADA POR TABELA
 * -----------------------------
 * Le por `rpc_hr_regras_assiduidade_ler` (que ja devolve o 5 por omissao e se quem consulta pode alterar) e escreve por
 * `rpc_hr_regras_assiduidade_guardar`; a tabela recusa INSERT/UPDATE/DELETE a `authenticated`.
 *
 * ENQUANTO A MIGRATION NAO ESTIVER APLICADA
 * -----------------------------------------
 * As RPCs nao existem. O ecra nao parte: a leitura fica `indisponivel`, o prazo para CALCULAR e 5 (a omissao), `podeAlterar`
 * e falso, e `leitura.falhou` deixa o ecra DIZER que o 5 e uma omissao e nao o valor da organizacao. Uma recusa de
 * permissao da o mesmo 5; uma falha de rede (`leitura.erro`) nao se esconde e e reportada.
 *
 * Uma leitura que falhou por erro NAO fica em cache (volta a tentar na proxima montagem); as outras ficam, porque o
 * prazo e lido uma vez por organizacao e nao por dia do calendario.
 */
import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import { rpcIndisponivel } from "@/lib/hr/justificacaoDia";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import {
  REGRAS_ASSIDUIDADE_OMISSAO,
  chaveDoErroDeRegrasAssiduidade,
  lerRespostaDasRegras,
  prazoJustificacaoValido,
  type RegrasAssiduidade,
} from "@/lib/hr/regrasAssiduidade";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";

/** Como correu a leitura. Tudo o que nao e `ok` deixa o prazo na omissao (5). */
export type EstadoDaLeituraDasRegras = "ok" | "recusado" | "erro" | "indisponivel";

interface RegrasLidas {
  regras: RegrasAssiduidade;
  estado: EstadoDaLeituraDasRegras;
}

/** 5 minutos: o prazo muda raramente e e lido uma vez por organizacao. */
const STALE_TIME_MS = 5 * 60 * 1000;

const FALHA_DE_LEITURA = (estado: Exclude<EstadoDaLeituraDasRegras, "ok">): RegrasLidas => ({
  regras: REGRAS_ASSIDUIDADE_OMISSAO,
  estado,
});

export interface LeituraDasRegras {
  /** A leitura nao deu o valor da organizacao: o 5 e so uma omissao para calcular. */
  falhou: boolean;
  recusado: boolean;
  erro: boolean;
  indisponivel: boolean;
}

/** O que sai de gravar: `null` em sucesso, ou uma chave de traducao / mensagem amigavel ja escrita. */
export interface ResultadoDeGuardar {
  erro: string | null;
}

async function mensagemDoErro(e: unknown): Promise<string> {
  if (rpcIndisponivel(e)) return "rhRegrasAssid.erro.indisponivel";
  const chave = chaveDoErroDeRegrasAssiduidade(e);
  if (chave) return chave;
  // Uma recusa de permissao (RLS ou grant) e a resposta certa, nao um defeito.
  if (isPermissionError(e)) return "rhRegrasAssid.erro.semPermissao";
  captureFlowError(e, "hr-assiduidade-write");
  return getFriendlyErrorMessage(e);
}

export function useRegrasAssiduidade() {
  const { activeCompany } = useCompany();
  const queryClient = useQueryClient();
  const orgId = activeCompany?.id ?? null;
  const queryKey = useMemo(() => ["hr-regras-assiduidade", orgId] as const, [orgId]);

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async (): Promise<RegrasLidas> => {
      try {
        const { data: linha, error } = await hrRpc("rpc_hr_regras_assiduidade_ler", { _organization_id: orgId });
        if (error) {
          if (rpcIndisponivel(error)) return FALHA_DE_LEITURA("indisponivel");
          if (isPermissionError(error)) return FALHA_DE_LEITURA("recusado");
          captureFlowError(error, "hr-assiduidade-load");
          return FALHA_DE_LEITURA("erro");
        }
        return { regras: lerRespostaDasRegras(linha), estado: "ok" };
      } catch (e) {
        captureFlowError(e, "hr-assiduidade-load");
        return FALHA_DE_LEITURA("erro");
      }
    },
    enabled: !!orgId,
    staleTime: (query) => (query.state.data?.estado === "erro" ? 0 : STALE_TIME_MS),
  });

  const estado: EstadoDaLeituraDasRegras = data?.estado ?? "ok";
  const regras = data?.regras ?? REGRAS_ASSIDUIDADE_OMISSAO;
  const leitura: LeituraDasRegras = {
    falhou: estado !== "ok",
    recusado: estado === "recusado",
    erro: estado === "erro",
    indisponivel: estado === "indisponivel",
  };

  const guardarMutation = useMutation({
    mutationFn: async (dias: number): Promise<void> => {
      const { error } = await hrRpc("rpc_hr_regras_assiduidade_guardar", {
        _organization_id: orgId,
        _prazo_justificacao_dias: dias,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  /** Grava o prazo da organizacao. Valida 1 a 30 antes de chamar a base; nunca lanca. */
  const guardar = useCallback(
    async (dias: number): Promise<ResultadoDeGuardar> => {
      if (!orgId) return { erro: "rhRegrasAssid.erro.semOrganizacao" };
      if (!prazoJustificacaoValido(dias)) return { erro: "rhRegrasAssid.erro.prazoInvalido" };
      try {
        await guardarMutation.mutateAsync(dias);
        return { erro: null };
      } catch (e) {
        return { erro: await mensagemDoErro(e) };
      }
    },
    [orgId, guardarMutation],
  );

  return {
    organizationId: orgId,
    prazoJustificacaoDias: regras.prazoJustificacaoDias,
    gravado: regras.gravado,
    /** So `true` com a leitura bem feita: com a leitura falhada nao se oferece gravar. */
    podeAlterar: estado === "ok" && regras.podeAlterar,
    isLoading,
    leitura,
    isSaving: guardarMutation.isPending,
    guardar,
    recarregar: refetch,
  };
}

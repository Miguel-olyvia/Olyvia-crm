/**
 * As escritas do registo de ativos, só pelas RPCs do desenho (`rpc_ativo_criar|alterar|desativar|reativar`): a permissão
 * (`ativos.edit`), as regras ATV02 a ATV33 e o limite de organização decidem-se na base. Ligar e desligar uma pessoa saíram: o
 * equipamento atribuído no RH cria o ativo sozinho e devolve-se no RH (a base já só responde ATV25). Cada escrita devolve um RESULTADO (nunca lança): `{ok:true}` ou `{ok:false, codigo, mensagem}`, com a mensagem
 * já traduzida (o código ATV serve para pôr o erro junto do campo). Depois de escrever, a lista refaz-se (invalida «ativos»).
 * Apagar não existe: um ativo só se desativa.
 */
import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import {
  ativosIndisponivel, ativosRecusado, campoDoErro, chaveDoErro, codigoAtv, detalheDaBase, refazListaAposErro, type CampoAtivo,
} from "@/components/ativos/lib/errosAtivo";
import type { GrupoAtivo, MotivoDesativacao } from "@/components/ativos/lib/tipos";
import { CHAVE_CUSTO_EQUIPAMENTOS, CHAVE_EQUIPAMENTOS_LIVRES, CHAVE_OCUPACOES_ATIVO, CHAVE_POR_DEVOLVER } from "@/hooks/hr/chavesEquipamentos";
import { hrRpc } from "@/lib/hr/hrDb";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getLocalizedFallback } from "@/utils/friendlyError";
import { CHAVE_ATIVOS } from "./useAtivos";

/** `ok` verdadeiro: gravou (e `id` quando a RPC o devolve). Falso: `mensagem` já traduzida e, se a regra é de um campo, o `codigo` ATVnn. */
export interface ResultadoAtivo {
  ok: boolean;
  id?: string;
  codigo?: string | null;
  /** O campo do formulário a que o erro se refere (o ATV03 diz qual pelo DETAIL da base); `null` se não é de um campo. */
  campo?: CampoAtivo | null;
  mensagem?: string;
  /** A base avisou de algo (só ao reativar: a renda ou a quota voltam a contar nos meses passados). O texto traduz-se no ecrã. */
  aviso?: boolean;
}

export interface DesativacaoAtivo {
  data: string;
  motivo: MotivoDesativacao | string;
  nota: string | null;
}

export interface AtivoMutacoes {
  /** `campos`: os argumentos `p_*` do formulário (sem organização nem grupo). */
  criar: (grupo: GrupoAtivo, campos: Record<string, unknown>) => Promise<ResultadoAtivo>;
  /** O grupo não se envia: é imutável. */
  alterar: (id: string, campos: Record<string, unknown>) => Promise<ResultadoAtivo>;
  desativar: (id: string, d: DesativacaoAtivo) => Promise<ResultadoAtivo>;
  reativar: (id: string) => Promise<ResultadoAtivo>;
}

export function useAtivoMutacoes(): AtivoMutacoes {
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id ?? null;
  const queryClient = useQueryClient();

  const chamar = useCallback(
    async (rpc: string, args: Record<string, unknown>): Promise<ResultadoAtivo> => {
      if (!organizationId) return { ok: false, codigo: null, mensagem: getLocalizedFallback("ativos.erro.semOrganizacao") };
      try {
        const { data, error } = await hrRpc(rpc, { ...args, p_organization_id: organizationId });
        if (error) {
          // Regras (ATVnn), recusas e RPC por aplicar não são defeitos: só o resto vai para o registo.
          if (!codigoAtv(error) && !ativosRecusado(error) && !ativosIndisponivel(error)) captureFlowError(error, "ativos-escrever");
          // O ativo mudou entretanto (ATV14, ATV15, ATV17, ATV18): a lista refaz-se sozinha, e a mensagem pode dizê-lo.
          if (refazListaAposErro(error)) await queryClient.invalidateQueries({ queryKey: [CHAVE_ATIVOS] });
          return { ok: false, codigo: codigoAtv(error), campo: campoDoErro(error), mensagem: detalheDaBase(error) ?? getLocalizedFallback(chaveDoErro(error)) };
        }
        await queryClient.invalidateQueries({ queryKey: [CHAVE_ATIVOS] });
        // Valor, vida, renda, desativar e reativar mudam a quota dos meses passados (o custo da pessoa no RH), e um ativo novo, ou um que
        // deixou de estar ativo, muda o que esta livre para entregar: sem isto o RH mostra o valor de antes ate 5 minutos.
        await Promise.all([CHAVE_CUSTO_EQUIPAMENTOS, CHAVE_EQUIPAMENTOS_LIVRES, CHAVE_OCUPACOES_ATIVO, CHAVE_POR_DEVOLVER].map((k) => queryClient.invalidateQueries({ queryKey: [k, organizationId] })));
        const resposta = data as { id?: unknown; aviso?: unknown } | null;
        const id = resposta?.id;
        const aviso = typeof resposta?.aviso === "string" && resposta.aviso !== "";
        return { ok: true, ...(typeof id === "string" ? { id } : {}), ...(aviso ? { aviso: true } : {}) };
      } catch (e) {
        captureFlowError(e, "ativos-escrever");
        return { ok: false, codigo: null, mensagem: getLocalizedFallback("ativos.erro.generico") };
      }
    },
    [organizationId, queryClient],
  );

  return useMemo<AtivoMutacoes>(
    () => ({
      criar: (grupo, campos) => chamar("rpc_ativo_criar", { p_grupo: grupo, ...campos }),
      // `p_campos_novos`: sem ele a base deixa a forma, a renda, as datas do aluguer, a origem da vida e o armazém como estão.
      alterar: (id, campos) => chamar("rpc_ativo_alterar", { p_id: id, p_campos_novos: true, ...campos }),
      desativar: (id, d) => chamar("rpc_ativo_desativar", { p_id: id, p_data: d.data, p_motivo: d.motivo, p_nota: d.nota }),
      reativar: (id) => chamar("rpc_ativo_reativar", { p_id: id }),
    }),
    [chamar],
  );
}

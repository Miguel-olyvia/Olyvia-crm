/**
 * As escritas do registo de ativos, só pelas RPCs do desenho (`rpc_ativo_criar|alterar|desativar|reativar|ligar_pessoa|desligar_pessoa`):
 * a permissão (`ativos.edit`, e também `hr.pessoas.retribuicao.edit` ao ligar), as regras ATV02 a ATV18 e o limite de organização
 * decidem-se na base. Cada escrita devolve um RESULTADO (nunca lança): `{ok:true}` ou `{ok:false, codigo, mensagem}`, com a mensagem
 * já traduzida (o código ATV serve para pôr o erro junto do campo). Depois de escrever, a lista refaz-se (invalida «ativos»).
 * Apagar não existe: um ativo só se desativa.
 */
import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { ativosIndisponivel, ativosRecusado, chaveDoErro, codigoAtv } from "@/components/ativos/lib/errosAtivo";
import type { GrupoAtivo, MotivoDesativacao } from "@/components/ativos/lib/tipos";
import { hrRpc } from "@/lib/hr/hrDb";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getLocalizedFallback } from "@/utils/friendlyError";
import { CHAVE_ATIVOS } from "./useAtivos";

/** `ok` verdadeiro: gravou (e `id` quando a RPC o devolve). Falso: `mensagem` já traduzida e, se a regra é de um campo, o `codigo` ATVnn. */
export interface ResultadoAtivo {
  ok: boolean;
  id?: string;
  codigo?: string | null;
  mensagem?: string;
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
  ligarPessoa: (ativoId: string, pessoaEquipamentoId: string) => Promise<ResultadoAtivo>;
  desligarPessoa: (pessoaEquipamentoId: string) => Promise<ResultadoAtivo>;
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
          return { ok: false, codigo: codigoAtv(error), mensagem: getLocalizedFallback(chaveDoErro(error)) };
        }
        await queryClient.invalidateQueries({ queryKey: [CHAVE_ATIVOS] });
        const id = (data as { id?: unknown } | null)?.id;
        return typeof id === "string" ? { ok: true, id } : { ok: true };
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
      alterar: (id, campos) => chamar("rpc_ativo_alterar", { p_id: id, ...campos }),
      desativar: (id, d) => chamar("rpc_ativo_desativar", { p_id: id, p_data: d.data, p_motivo: d.motivo, p_nota: d.nota }),
      reativar: (id) => chamar("rpc_ativo_reativar", { p_id: id }),
      ligarPessoa: (ativoId, pessoaEquipamentoId) => chamar("rpc_ativo_ligar_pessoa", { p_ativo_id: ativoId, p_pessoa_equipamento_id: pessoaEquipamentoId }),
      desligarPessoa: (pessoaEquipamentoId) => chamar("rpc_ativo_desligar_pessoa", { p_pessoa_equipamento_id: pessoaEquipamentoId }),
    }),
    [chamar],
  );
}

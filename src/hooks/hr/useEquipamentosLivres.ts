/**
 * Os equipamentos (ativos do grupo Pessoas) que ja existem e estao livres para entregar, e as ocupacoes de um ativo.
 *  - livres: `rpc_hr_equipamentos_livres(p_organization_id, p_tipo)`: pede as permissoes do RH (ver e editar retribuicoes), as mesmas
 *    de «Atribuir equipamento». So se pede com o painel aberto.
 *  - ocupacoes: `rpc_ativo_ler(p_id, p_organization_id)` (`ativos.view`), so para avisar quantas pessoas muda uma correcao. Quem nao
 *    tem a permissao recebe a recusa e o ecra mostra o aviso geral, sem numero (nao e um defeito).
 */
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { ativosIndisponivel, ativosRecusado } from "@/components/ativos/lib/errosAtivo";
import { ativoDaLinhaRh, type LinhaAtivoRh } from "@/lib/hr/custoBase";
import { hrRpc } from "@/lib/hr/hrDb";
import { CHAVE_EQUIPAMENTOS_LIVRES, CHAVE_OCUPACOES_ATIVO } from "./chavesEquipamentos";
import { codigoDeErroCusto } from "@/lib/hr/errosCusto";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getLocalizedFallback } from "@/utils/friendlyError";
import type { AtivoDoEquipamento } from "@/components/rh-exemplo/lib/equipamentos";

export { CHAVE_EQUIPAMENTOS_LIVRES, CHAVE_OCUPACOES_ATIVO };

export interface EquipamentoLivre {
  id: string;
  codigo: string | null;
  nome: string;
  tipo: string | null;
  /** Para mostrar o que ja se amortizou e o que falta, ou a renda. */
  ativo: AtivoDoEquipamento;
  /** Quando a ultima pessoa o devolveu (AAAA-MM-DD), ou `null` se nunca foi entregue. */
  ultimaDevolucao: string | null;
}

type Linha = Record<string, unknown>;
const texto = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** As linhas de `rpc_hr_equipamentos_listar`-livres como o ecra as usa; uma sem id ou sem o essencial da conta fica de fora. */
export function livresDaResposta(dados: unknown): EquipamentoLivre[] {
  if (!Array.isArray(dados)) return [];
  return dados.flatMap((l: Linha) => {
    const id = texto(l?.id);
    const ativo = ativoDaLinhaRh({ ...(l as LinhaAtivoRh), estado: "ativo" });
    if (!id || !ativo) return [];
    return [{ id, codigo: ativo.codigo, nome: ativo.nome, tipo: ativo.tipo, ativo, ultimaDevolucao: texto(l.ultima_devolucao)?.slice(0, 10) ?? null }];
  });
}

export interface EquipamentosLivresHook {
  livres: EquipamentoLivre[] | null;
  aCarregar: boolean;
  /** O texto traduzido da falha; `null` quando correu bem. */
  erro: string | null;
}

export function useEquipamentosLivres(ligado: boolean, tipo: string | null = null): EquipamentosLivresHook {
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id ?? null;
  const consulta = useQuery({
    queryKey: [CHAVE_EQUIPAMENTOS_LIVRES, organizationId, tipo],
    enabled: ligado && organizationId !== null,
    retry: false,
    queryFn: async (): Promise<EquipamentoLivre[]> => {
      const { data, error } = await hrRpc("rpc_hr_equipamentos_livres", { p_organization_id: organizationId, p_tipo: tipo });
      if (error) {
        if (codigoDeErroCusto(error) === null) captureFlowError(error, "ativos-listar");
        throw new Error(getLocalizedFallback("hr.custo.erro.generico"));
      }
      return livresDaResposta(data);
    },
  });
  return { livres: consulta.data ?? null, aCarregar: consulta.isLoading, erro: consulta.error ? (consulta.error as Error).message : null };
}

/** As ocupacoes de um ativo: quantas pessoas distintas o tiveram (`null` se nao se sabe, por exemplo sem `ativos.view`). */
export function useOcupacoesDoAtivo(ativoId: string | null, ligado: boolean): { pessoas: number | null; aCarregar: boolean } {
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id ?? null;
  const consulta = useQuery({
    queryKey: [CHAVE_OCUPACOES_ATIVO, organizationId, ativoId],
    enabled: ligado && organizationId !== null && ativoId !== null,
    retry: false,
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await hrRpc("rpc_ativo_ler", { p_id: ativoId, p_organization_id: organizationId });
      // Sem permissao (ou RPC por aplicar) nao e um defeito: o aviso fica sem numero. Qualquer outro erro vai para o registo.
      if (error) {
        if (!ativosIndisponivel(error) && !ativosRecusado(error)) captureFlowError(error, "ativos-listar");
        return null;
      }
      const ocupacoes = (data as { ocupacoes?: unknown } | null)?.ocupacoes;
      if (!Array.isArray(ocupacoes)) return null;
      const chaves = ocupacoes.map((o: Linha) => texto(o?.pessoa_id) ?? texto(o?.pessoa_equipamento_id) ?? "");
      return new Set(chaves.filter((c) => c !== "")).size;
    },
  });
  return { pessoas: consulta.data ?? null, aCarregar: consulta.isLoading };
}

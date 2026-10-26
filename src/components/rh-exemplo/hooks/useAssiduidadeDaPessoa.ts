/**
 * A assiduidade de uma pessoa, delegando ao hook real que le/escreve em Supabase.
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem.
 */
import {
  useAssiduidadeDaPessoa as useAssiduidadeDaPessoaReal,
  type JanelaDeDatas,
  type RealizadoComCorreccao,
  type AusenciaDoDia,
  type AssiduidadeDaPessoa,
} from "@/hooks/useAssiduidadeDaPessoa";
import type { HorarioRealizado } from "@/components/rh-exemplo/tipos";

export type { JanelaDeDatas, RealizadoComCorreccao, AusenciaDoDia, AssiduidadeDaPessoa };

/** Projecta um HorarioRealizado para o formato com colunas de correccao. */
export function comoRealizadoComCorreccao(linha: HorarioRealizado): RealizadoComCorreccao {
  const extra = linha as Partial<RealizadoComCorreccao>;
  return {
    ...linha,
    corrige_realizado_id: extra.corrige_realizado_id ?? null,
    correccao_motivo: extra.correccao_motivo ?? null,
    corrigido_por_pessoa_id: extra.corrigido_por_pessoa_id ?? null,
    deleted_at: extra.deleted_at ?? null,
  };
}

export function useAssiduidadeDaPessoa(pessoaId: string | undefined, janela: JanelaDeDatas) {
  return useAssiduidadeDaPessoaReal(pessoaId, janela);
}

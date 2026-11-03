/**
 * Os dados da base que entram na conta do custo: equipamentos, definicoes (taxa, seguro, km, dia) e excecoes de taxa.
 * So se pedem a quem tem `hr.pessoas.retribuicao.view`; sem isso nada se pede e `semPermissao` e verdadeiro. Enquanto
 * algum dos tres nao chegou, `dados` e `null`: nunca se calcula com valores de exemplo.
 */
import { useMemo } from "react";
import { useCustoDefinicoes } from "@/components/rh-exemplo/hooks/useCustoDefinicoes";
import { useCustoExcecoes } from "@/components/rh-exemplo/hooks/useCustoExcecoes";
import { useEquipamentosCusto } from "@/components/rh-exemplo/hooks/useEquipamentosCusto";
import { usePermissions } from "@/components/rh-exemplo/hooks/usePermissions";
import type { DadosCusto } from "./custoLido";

export const PERMISSAO_VER_CUSTO = "hr.pessoas.retribuicao.view";
export const PERMISSAO_EDITAR_CUSTO = "hr.pessoas.retribuicao.edit";

export interface DadosCustoLidos {
  dados: DadosCusto | null;
  aCarregar: boolean;
  /** O texto traduzido da primeira falha de leitura; `null` quando correu bem. */
  erro: string | null;
  /** Sem a permissao de ver o custo: nada se pede e nada se calcula. */
  semPermissao: boolean;
  /** Pode atribuir, devolver, alterar a conta e guardar taxas e excecoes (view e edit; a base exige as duas). */
  podeEditar: boolean;
}

/** `pessoaId`: so os equipamentos desta pessoa; sem isso, os da organizacao. */
export function useDadosCusto(pessoaId: string | null = null): DadosCustoLidos {
  const { hasPermission, loading } = usePermissions();
  const podeVer = hasPermission(PERMISSAO_VER_CUSTO);
  const podeEditar = podeVer && hasPermission(PERMISSAO_EDITAR_CUSTO);
  const equipamentos = useEquipamentosCusto({ pessoaId, enabled: podeVer });
  const definicoes = useCustoDefinicoes({ enabled: podeVer });
  const excecoes = useCustoExcecoes({ enabled: podeVer });

  const lista = equipamentos.equipamentos;
  const defs = definicoes.definicoes;
  const exc = excecoes.excecoes;
  const dados = useMemo<DadosCusto | null>(
    // Sem a permissao de ver (ou enquanto ela carrega) nao ha dados, venha o que vier dos hooks (cache de outra sessao ou organizacao).
    () => (podeVer && lista && defs && exc ? { equipamentos: lista, definicoes: defs, excecoes: exc } : null),
    [podeVer, lista, defs, exc],
  );
  const erro = equipamentos.erro ?? definicoes.erro ?? excecoes.erro;

  return {
    dados,
    aCarregar: loading || (podeVer && erro === null && dados === null),
    erro,
    semPermissao: !loading && !podeVer,
    podeEditar,
  };
}

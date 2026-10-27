/**
 * A assiduidade REAL de uma pessoa (picagens, horas realizadas, faltas, ausencias e horario planeado), simulada ao nivel do
 * wrapper `@/components/rh-exemplo/hooks/useAssiduidadeDaPessoa`, para os testes dos ecras de /rh-exemplo que mostram o mes
 * da pessoa sem Supabase e sem CompanyProvider:
 *
 *   vi.mock("@/components/rh-exemplo/hooks/useAssiduidadeDaPessoa", async (importOriginal) =>
 *     (await import("@/test/assiduidadeDaPessoaFalso")).wrapperAssiduidadeDaPessoaFalso(await importOriginal()));
 *
 * As linhas saem das mesmas fichas e dos mesmos registos de gestao que os testes ja repunham (`repor()`, `reporGestao()`),
 * mas entregues como a base as entrega: em bruto, com as colunas de correccao. O horario planeado e SEMPRE o de linhas da
 * base (`pessoas_horario_planeado`): um teste que precise de outro horario escreve as linhas em `baseAssiduidadeFalsa`.
 * Nada aqui toca em base nenhuma.
 */
import { useMemo } from "react";
import { lerEstado } from "@/components/rh-exemplo/dados/loja";
import { lerGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import type { HorarioPlaneado } from "@/components/rh-exemplo/tipos";

/** O que um teste pode mudar antes de montar o ecra. Volta ao vazio com `reporAssiduidadeFalsa()`. */
export const baseAssiduidadeFalsa = {
  /** As linhas planeadas de uma pessoa, em vez das da ficha de exemplo (lista vazia = pessoa sem horario planeado). */
  planeado: {} as Record<string, HorarioPlaneado[]>,
  /** Linhas acrescentadas ao horario da ficha (por exemplo uma excepcao de um dia). */
  planeadoExtra: {} as Record<string, HorarioPlaneado[]>,
  /** Quantas vezes o ecra pediu para reler o mes (depois de gravar algo). */
  recargas: 0,
};

export function reporAssiduidadeFalsa(): void {
  baseAssiduidadeFalsa.planeado = {};
  baseAssiduidadeFalsa.planeadoExtra = {};
  baseAssiduidadeFalsa.recargas = 0;
}

/** Uma linha de `pessoas_horario_planeado`: recorrente com `dia_semana`, ou excepcao de um dia com `data`. */
export function linhaPlaneada(
  pessoaId: string,
  id: string,
  parcial: Partial<HorarioPlaneado> & Pick<HorarioPlaneado, "hora_inicio" | "hora_fim">,
): HorarioPlaneado {
  return {
    id, pessoa_id: pessoaId, organization_id: "org-teste", vinculo_id: null, local_id: null, dia_semana: null, data: null,
    nao_trabalha: false, ordem: 1, valido_de: null, valido_ate: null, notas: null, corrige_horario_id: null,
    correccao_motivo: null, corrigido_por_anew_user_id: null, corrigido_por_pessoa_id: null, ...parcial,
  };
}

function montar(pessoaId: string) {
  const ficha = lerEstado().fichas[pessoaId];
  const gestao = lerGestao();
  const ausenciaAprovadaPorDia = new Map<string, unknown>();
  for (const dia of ficha?.ausencias.dias ?? []) {
    const anterior = ausenciaAprovadaPorDia.get(dia.data) as { fraccao_dia: number } | undefined;
    if (dia.estado === "aprovado" && (!anterior || anterior.fraccao_dia < dia.fraccao_dia)) ausenciaAprovadaPorDia.set(dia.data, dia);
  }
  const planeado = baseAssiduidadeFalsa.planeado[pessoaId] ?? ficha?.horarioPlaneado ?? [];
  const semAccao = async () => ({ ok: true });
  return {
    picagens: gestao.picagens.filter((p) => p.pessoa_id === pessoaId),
    picagensRecusadas: false,
    realizado: (ficha?.horarioRealizado ?? []).map((l) => ({
      corrige_realizado_id: null, correccao_motivo: null, corrigido_por_pessoa_id: null, deleted_at: null, ...l,
    })),
    realizadoRecusado: false,
    faltas: gestao.faltas.filter((f) => f.pessoa_id === pessoaId),
    faltasRecusadas: false,
    planeado: [...planeado, ...(baseAssiduidadeFalsa.planeadoExtra[pessoaId] ?? [])],
    planeadoRecusado: false,
    ausenciaAprovadaPorDia,
    loading: false,
    saving: false,
    recarregar: async () => {
      baseAssiduidadeFalsa.recargas += 1;
    },
    picar: semAccao, corrigirPicagem: semAccao, anularPicagem: semAccao, consolidarDia: semAccao,
    corrigirRealizado: semAccao, validarRealizado: semAccao, rejeitarRealizado: semAccao, marcarFalta: semAccao,
    corrigirFalta: semAccao, anularFalta: semAccao, anularFaltaPorAusencia: semAccao, registarJustificacao: semAccao,
    decidirJustificacao: semAccao, revelarJustificacao: semAccao,
  };
}

/** O hook: as linhas ficam as mesmas enquanto o ecra esta montado (como o estado do hook real entre leituras). */
export function useAssiduidadeDaPessoaFalso(pessoaId: string | undefined) {
  return useMemo(() => montar(pessoaId ?? ""), [pessoaId]);
}

/** O modulo que substitui o wrapper: o resto das exportacoes (`comoRealizadoComCorreccao`) fica como esta. */
export function wrapperAssiduidadeDaPessoaFalso<T extends object>(original: T) {
  return { ...original, useAssiduidadeDaPessoa: useAssiduidadeDaPessoaFalso };
}

/** Sem desvios por justificar nem erros: a leitura da organizacao que `useJustificacoesDaPessoa` pede. */
export function wrapperAssiduidadeDaOrganizacaoFalso<T extends object>(original: T) {
  return {
    ...original,
    useAssiduidadeDaOrganizacao: () => ({ desvios: [], desviosErro: false, desviosRecusado: false, loading: false }),
  };
}

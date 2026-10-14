/** O custo de uma pessoa no mês escolhido, para o ecrã: recalcula quando qualquer store de que o cálculo depende muda. */
import { useMemo } from "react";
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import { useFluxosB } from "@/components/rh-exemplo/dados/lojaFluxosB";
import { useGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import { useCusto } from "@/components/rh-exemplo/dados/lojaCusto";
import { useFluxosC } from "@/components/rh-exemplo/fluxosC/lojaFluxosC";
import { custoLidoDaPessoa, linhasDaOrganizacao, type CustoDaPessoa } from "./custoLido";
import type { LinhaCusto } from "@/components/rh-exemplo/lib/custoOrganizacao";

export type { CustoDaPessoa } from "./custoLido";

/** As assinaturas dos stores que mudam o custo. O cálculo lê-os diretamente; aqui só se sabe QUANDO recalcular. */
function useAssinaturaDoCusto(): unknown[] {
  return [
    useEstadoRh((e) => e.fichas), useEstadoRh((e) => e.locais), useEstadoRh((e) => e.filiais),
    useFluxosC((e) => e), useGestao((g) => g.faltas), useFluxosB((e) => e.horarios),
    useCusto((e) => e.avulsos), useCusto((e) => e.equipamentos), useCusto((e) => e.definicoes), useCusto((e) => e.excecoes),
  ];
}

export function useCustoDaPessoa(pessoaId: string, mes: string): CustoDaPessoa | null {
  const assinatura = useAssinaturaDoCusto();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => custoLidoDaPessoa(pessoaId, mes), [pessoaId, mes, ...assinatura]);
}

/** O custo de todas as pessoas no mês, para o módulo «Custos». */
export function useCustoDaOrganizacao(mes: string): LinhaCusto[] {
  const assinatura = useAssinaturaDoCusto();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => linhasDaOrganizacao(mes), [mes, ...assinatura]);
}

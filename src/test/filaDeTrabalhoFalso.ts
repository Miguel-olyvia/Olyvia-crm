/**
 * A fila de trabalho do mapa de assiduidade, simulada, para os testes dos ecras de /rh-exemplo.
 *
 * O hook real (`@/hooks/useFilaDeTrabalho`) le tres fontes da base por react-query e precisa de CompanyProvider e de
 * QueryClientProvider. Os testes que so querem ver o ecra trocam-no por este, que junta as MESMAS bases simuladas que os
 * outros testes ja usam (horas extra em `horasExtraFalso`, justificacoes em `justificacoesDoDiaFalso`) mais os desvios daqui:
 *
 *   vi.mock("@/hooks/useFilaDeTrabalho", async () => (await import("@/test/filaDeTrabalhoFalso")).hookFalso());
 *
 * Como a fila real, o resultado e UM so (itens + estado de cada fonte); decidir um item muda a base simulada e a fila refaz-se.
 */
import { useMemo, useSyncExternalStore } from "react";
import { construirItens, type EstadoDeFonte, type FonteFila } from "@/lib/hr/filaDeTrabalho";
import { accoesDoDesvio, chaveDoDesvio } from "@/components/rh-exemplo/lib/alertasFimDia";
import { hojeEmLisboa } from "@/lib/hr/periodoFolha";
import type { Desvio } from "@/types/hrAssiduidade";
import { wrapperFalso as horasExtraFalsas } from "@/test/horasExtraFalso";
import { useJustificacoesDoDia as useJustificacoesFalsas } from "@/test/justificacoesDoDiaFalso";

export const desviosFalsos = {
  linhas: [] as Desvio[],
  /** O estado de leitura dos desvios. */
  estado: "ok" as EstadoDeFonte,
};

let versao = 0;
const ouvintes = new Set<() => void>();
const subscrever = (o: () => void): (() => void) => {
  ouvintes.add(o);
  return () => {
    ouvintes.delete(o);
  };
};
const lerVersao = (): number => versao;

export function reporDesviosFalsos(): void {
  desviosFalsos.linhas = [];
  desviosFalsos.estado = "ok";
  versao += 1;
  ouvintes.forEach((o) => o());
}

export function semearDesvios(linhas: Desvio[]): void {
  desviosFalsos.linhas = linhas;
  versao += 1;
  ouvintes.forEach((o) => o());
}

const { useHorasExtraListar } = horasExtraFalsas();

export function hookFalso() {
  return {
    useFilaDeTrabalho: () => {
      useSyncExternalStore(subscrever, lerVersao);
      const horas = useHorasExtraListar({ estado: "pendente" });
      const justificacoes = useJustificacoesFalsas({ soPendentes: true });
      const itens = useMemo(
        () =>
          construirItens(
            { horasExtra: horas.horas, justificacoes: justificacoes.justificacoes, desvios: desviosFalsos.estado === "ok" ? desviosFalsos.linhas : [] },
            { accoesDoDesvio, chaveDoDesvio },
          ),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [horas.horas, justificacoes.justificacoes, versao],
      );
      const fontes: Record<FonteFila, EstadoDeFonte> = {
        horas_extra: horas.erro ? "erro" : "ok",
        justificacoes: justificacoes.indisponivel ? "indisponivel" : "ok",
        desvios: desviosFalsos.estado,
        desvios_a_validar: "ok",
      };
      const hoje = hojeEmLisboa();
      const periodo = useMemo(() => ({ de: `${hoje.slice(0, 7)}-01`, ate: `${hoje.slice(0, 7)}-28` }), [hoje]);
      return {
        itens,
        fontes,
        horasExtra: { lidas: horas.horas.length, total: horas.total },
        aCarregar: false,
        periodo,
        hoje,
        recarregar: async () => undefined,
      };
    },
  };
}

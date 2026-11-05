/**
 * O prazo para justificar (o fim do periodo da folha), simulado, para os testes dos ecras de /rh-exemplo.
 *
 * Os ecras leem o prazo pelo wrapper `@/components/rh-exemplo/hooks/usePrazoJustificacao`, que le as regras do periodo da
 * folha por RPC e precisa de um `CompanyProvider` e de um `QueryClientProvider`. Os testes que so querem ver o ecra trocam o
 * wrapper por este modulo:
 *
 *   vi.mock("@/components/rh-exemplo/hooks/usePrazoJustificacao", async () => (await import("@/test/prazoJustificacaoFalso")).wrapperFalso());
 *
 * O teste escolhe as regras do periodo (`prazoFalso.regras`; vazio = mes de calendario, dia de inicio 1). Reponha-as em
 * `beforeEach` com `reporPrazoFalso()`. A conta e a verdadeira (`@/lib/hr/periodoFolha`); nada toca em base nenhuma.
 */
import { fimDoPeriodoDoDia, periodoDoDia, type RegraPeriodoFolha } from "@/lib/hr/periodoFolha";
import type { PrazoJustificacao } from "@/components/rh-exemplo/hooks/usePrazoJustificacao";

export const prazoFalso = {
  /** As regras do periodo da folha; vazio = o mes de calendario. */
  regras: [] as RegraPeriodoFolha[],
  /** `true`: o prazo mostrado e so a estimativa (a base nao respondeu). */
  estimativa: false,
};

export function reporPrazoFalso(): void {
  prazoFalso.regras = [];
  prazoFalso.estimativa = false;
}

export function wrapperFalso() {
  return {
    usePrazoJustificacao: (_datas?: readonly string[]): PrazoJustificacao => {
      const regras = prazoFalso.regras;
      return {
        prazoDe: (data) => fimDoPeriodoDoDia(data, regras),
        estimativaDe: () => prazoFalso.estimativa,
        periodoDe: (data) => periodoDoDia(data, regras),
        aCarregar: false,
      };
    },
  };
}

/**
 * O prazo para justificar da organizacao, simulado, para os testes dos ecras de /rh-exemplo.
 *
 * Os ecras leem o prazo pelo wrapper `@/components/rh-exemplo/hooks/usePrazoJustificacao`, que fala com a base por RPC e
 * precisa de um `CompanyProvider` e de um `QueryClientProvider`. Os testes que so querem ver o ecra trocam o wrapper por
 * este modulo:
 *
 *   vi.mock("@/components/rh-exemplo/hooks/usePrazoJustificacao", async () => (await import("@/test/prazoJustificacaoFalso")).wrapperFalso());
 *
 * O teste escolhe os dias, se a leitura falhou e se pode alterar (`prazoFalso`), e le o que o ecra gravou (`prazoFalso.gravados`).
 * Reponha-o em `beforeEach` com `reporPrazoFalso()`. Nada toca em base nenhuma.
 */
import { useCallback, useEffect, useState } from "react";
import type { LeituraDasRegras, PrazoJustificacao, ResultadoDeGuardar } from "@/components/rh-exemplo/hooks/usePrazoJustificacao";

const LEITURA_BOA: LeituraDasRegras = { falhou: false, recusado: false, erro: false, indisponivel: false };

export const prazoFalso = {
  dias: 5,
  gravado: false,
  podeAlterar: true,
  leitura: LEITURA_BOA,
  /** Os dias que o ecra mandou gravar, pela ordem. */
  gravados: [] as number[],
  /** A chave que `gravar` devolve em vez de gravar (ou `null`: grava). */
  erroAoGravar: null as string | null,
  aGravar: false,
  recarregados: 0,
};

const ouvintes = new Set<() => void>();
const avisar = (): void => ouvintes.forEach((o) => o());

export function reporPrazoFalso(): void {
  prazoFalso.dias = 5;
  prazoFalso.gravado = false;
  prazoFalso.podeAlterar = true;
  prazoFalso.leitura = LEITURA_BOA;
  prazoFalso.gravados = [];
  prazoFalso.erroAoGravar = null;
  prazoFalso.aGravar = false;
  prazoFalso.recarregados = 0;
}

/** Uma leitura falhada: o prazo e a omissao (5), nao se pode alterar, e o ecra tem de o dizer. */
export function falharLeituraDoPrazo(motivo: "indisponivel" | "recusado" | "erro"): void {
  prazoFalso.dias = 5;
  prazoFalso.gravado = false;
  prazoFalso.podeAlterar = false;
  prazoFalso.leitura = { falhou: true, recusado: motivo === "recusado", erro: motivo === "erro", indisponivel: motivo === "indisponivel" };
}

export function wrapperFalso() {
  return {
    usePrazoJustificacao: (): PrazoJustificacao => {
      const [, redesenhar] = useState(0);
      useEffect(() => {
        const o = () => redesenhar((n) => n + 1);
        ouvintes.add(o);
        return () => {
          ouvintes.delete(o);
        };
      }, []);
      const gravar = useCallback(async (dias: number): Promise<ResultadoDeGuardar> => {
        if (prazoFalso.erroAoGravar) return { erro: prazoFalso.erroAoGravar };
        prazoFalso.gravados.push(dias);
        prazoFalso.dias = dias;
        prazoFalso.gravado = true;
        avisar();
        return { erro: null };
      }, []);
      return {
        dias: prazoFalso.dias,
        leitura: prazoFalso.leitura,
        gravado: prazoFalso.gravado,
        podeAlterar: prazoFalso.podeAlterar,
        aCarregar: false,
        aGravar: prazoFalso.aGravar,
        gravar,
        recarregar: () => {
          prazoFalso.recarregados += 1;
        },
      };
    },
  };
}

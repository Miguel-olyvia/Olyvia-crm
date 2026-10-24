/** A colocacao de uma pessoa no organograma (em memoria). */
import { useCallback } from "react";
import { atualizarFicha, novoId, useFichaRh } from "@/components/rh-exemplo/dados/loja";
import type { PessoaColocacaoOrganograma } from "@/components/rh-exemplo/tipos";

export type ResultadoColocacao = { tipo: "ok" } | { tipo: "erro"; mensagem: string };

const SEM_LINHAS: PessoaColocacaoOrganograma[] = [];

export function usePessoaColocacaoOrganograma(pessoaId: string | undefined, organizationId: string | undefined) {
  const ficha = useFichaRh(pessoaId);
  const colocacoes = ficha
    ? [...ficha.colocacoes].sort((a, b) => b.valido_de.localeCompare(a.valido_de))
    : SEM_LINHAS;

  const alterar = useCallback(
    (fn: (lista: PessoaColocacaoOrganograma[]) => PessoaColocacaoOrganograma[]): void => {
      if (pessoaId) atualizarFicha(pessoaId, (f) => ({ ...f, colocacoes: fn(f.colocacoes) }));
    },
    [pessoaId],
  );

  const criar = useCallback(
    async (args: {
      organogramaNodeId: string | null;
      validoDe: string;
      validoAte: string | null;
      motivo: string | null;
    }): Promise<string | null> => {
      if (!pessoaId || !organizationId) return "Sem pessoa";
      alterar((lista) => [
        ...lista,
        {
          id: novoId("co"),
          pessoa_id: pessoaId,
          organization_id: organizationId,
          organograma_node_id: args.organogramaNodeId,
          valido_de: args.validoDe,
          valido_ate: args.validoAte,
          motivo: args.motivo,
        },
      ]);
      return null;
    },
    [pessoaId, organizationId, alterar],
  );

  const corrigir = useCallback(
    async (
      colocacaoId: string,
      patch: { organogramaNodeId: string | null; validoDe: string; validoAte: string; motivo: string | null },
    ): Promise<string | null> => {
      alterar((lista) =>
        lista.map((c) =>
          c.id === colocacaoId
            ? {
                ...c,
                organograma_node_id: patch.organogramaNodeId,
                valido_de: patch.validoDe,
                valido_ate: patch.validoAte,
                motivo: patch.motivo,
              }
            : c,
        ),
      );
      return null;
    },
    [alterar],
  );

  const fechar = useCallback(
    async (colocacaoId: string, validoAte: string, motivo: string | null): Promise<ResultadoColocacao> => {
      alterar((lista) => lista.map((c) => (c.id === colocacaoId ? { ...c, valido_ate: validoAte, motivo } : c)));
      return { tipo: "ok" };
    },
    [alterar],
  );

  const recarregar = useCallback(async (): Promise<void> => undefined, []);

  return { colocacoes, loading: false, saving: false, recusado: false, recarregar, criar, corrigir, fechar };
}

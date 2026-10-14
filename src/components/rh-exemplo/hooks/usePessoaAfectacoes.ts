/** As afectacoes de uma pessoa a centros de trabalho (em memoria). */
import { useCallback } from "react";
import { atualizarFicha, novoId, useFichaRh } from "@/components/rh-exemplo/dados/loja";
import { ordenarAfectacoes } from "@/components/rh-exemplo/lib/afectacoes";
import type { PessoaAfectacao } from "@/components/rh-exemplo/tipos";

export type ResultadoFecho =
  | { tipo: "ok" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "precisaAparar"; localId: string; corte: string };

const SEM_LINHAS: PessoaAfectacao[] = [];

export function usePessoaAfectacoes(pessoaId: string | undefined, organizationId: string | undefined) {
  const ficha = useFichaRh(pessoaId);
  const afectacoes = ficha ? ordenarAfectacoes(ficha.afectacoes) : SEM_LINHAS;

  const alterar = useCallback(
    (fn: (lista: PessoaAfectacao[]) => PessoaAfectacao[]): void => {
      if (pessoaId) atualizarFicha(pessoaId, (f) => ({ ...f, afectacoes: fn(f.afectacoes) }));
    },
    [pessoaId],
  );

  const criar = useCallback(
    async (args: {
      localId: string;
      vinculoId: string | null;
      validoDe: string;
      validoAte: string | null;
      motivo: string | null;
    }): Promise<string | null> => {
      if (!pessoaId || !organizationId) return "Sem pessoa";
      alterar((lista) => [
        ...lista,
        {
          id: novoId("af"),
          pessoa_id: pessoaId,
          organization_id: organizationId,
          vinculo_id: args.vinculoId,
          local_id: args.localId,
          valido_de: args.validoDe,
          valido_ate: args.validoAte,
          motivo: args.motivo,
          origem: "declarada",
          confirmada_por: null,
          confirmada_em: null,
        },
      ]);
      return null;
    },
    [pessoaId, organizationId, alterar],
  );

  const corrigir = useCallback(
    async (
      afectacaoId: string,
      patch: { localId: string; validoDe: string; validoAte: string; motivo: string | null },
    ): Promise<string | null> => {
      alterar((lista) =>
        lista.map((a) =>
          a.id === afectacaoId
            ? { ...a, local_id: patch.localId, valido_de: patch.validoDe, valido_ate: patch.validoAte, motivo: patch.motivo }
            : a,
        ),
      );
      return null;
    },
    [alterar],
  );

  const fechar = useCallback(
    async (afectacaoId: string, validoAte: string, motivo: string | null): Promise<ResultadoFecho> => {
      alterar((lista) => lista.map((a) => (a.id === afectacaoId ? { ...a, valido_ate: validoAte, motivo } : a)));
      return { tipo: "ok" };
    },
    [alterar],
  );

  const apararEFechar = useCallback(
    async (
      afectacaoId: string,
      _localId: string,
      corte: string,
      motivo: string | null,
    ): Promise<ResultadoFecho> => fechar(afectacaoId, corte, motivo),
    [fechar],
  );

  const confirmar = useCallback(
    async (afectacaoId: string): Promise<string | null> => {
      alterar((lista) =>
        lista.map((a) =>
          a.id === afectacaoId ? { ...a, confirmada_por: "p-sofia", confirmada_em: new Date().toISOString() } : a,
        ),
      );
      return null;
    },
    [alterar],
  );

  const recarregar = useCallback(async (): Promise<void> => undefined, []);

  return {
    afectacoes,
    loading: false,
    saving: false,
    recusado: false,
    recarregar,
    criar,
    corrigir,
    fechar,
    apararEFechar,
    confirmar,
  };
}

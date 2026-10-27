/**
 * A lista de pessoas do modulo de RH, delegando ao hook real que le de Supabase.
 *
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem
 * (NovaPessoaExemplo, ResultadoCriacao, PessoasStats), mas os dados vem da
 * base real via src/hooks/usePessoas.ts. A criacao de pessoa usa o formulario
 * de exemplo (NovaPessoaExemplo), que ja traz o payload completo do hook real.
 */
import { useCallback, useMemo } from "react";
import { usePessoas as usePessoasReal } from "@/hooks/usePessoas";
import type { NovaPessoaPayload } from "@/lib/hr/novaPessoa";
import type { PessoaListItem } from "@/components/rh-exemplo/tipos";
import type { ExtrasNovaPessoa } from "@/components/rh-exemplo/dados/fichaNovaPessoa";
import type { TipoContrato } from "@/components/rh-exemplo/tipos";

/** O que o assistente de "Nova pessoa" de exemplo recolhe. */
export interface NovaPessoaExemplo {
  primeiro_nome: string;
  apelido: string;
  cargoId: string;
  localId: string;
  tipoContrato: TipoContrato;
  dataInicio: string;
  dataFim: string | null;
  reportaAId: string | null;
  /** Tudo o que o painel lateral "Nova pessoa" recolhe, já normalizado (dados pessoais, contactos, morada, contrato, anexos...). */
  extras?: ExtrasNovaPessoa;
  /** O payload completo de `usePessoas.criarPessoa`, traduzido do formulario sem perder nenhum campo. */
  payload: NovaPessoaPayload;
  /** O que o formulario recolheu e nao tem onde gravar (nunca se descarta em silencio). */
  naoGravado: NaoGravado[];
}

/** Campos do formulario sem coluna na base: o nome de tratamento. (Os ficheiros anexos seguem de verdade.) */
export type NaoGravado = "nome_tratamento";

export interface ResultadoCriacao {
  id: string;
  falhas: Array<{ seccao: string; mensagem: string }>;
  naoGravado: NaoGravado[];
}

export interface PessoasStats {
  activos: number;
  entradas90d: number;
  saidas90d: number;
}

export function usePessoas() {
  const real = usePessoasReal();

  // The real hook returns PessoaListItem from @/types/hr which has the same
  // shape as the example's PessoaListItem from @/components/rh-exemplo/tipos.
  const pessoas = real.pessoas as unknown as PessoaListItem[];

  const stats = useMemo<PessoasStats>(
    () => real.stats,
    [real.stats],
  );

  /**
   * Entrega ao hook real o payload COMPLETO que o formulario ja traduziu (`paraNovaPessoa`): nao se reduz nem se
   * reconstroi aqui, para nenhum campo se perder. Uma recusa total chega a quem chama; as falhas por seccao e o que
   * nao tem onde gravar voltam no resultado, para o ecra os dizer.
   */
  const criarPessoa = useCallback(
    async (dados: NovaPessoaExemplo): Promise<ResultadoCriacao> => {
      const resultado = await real.criarPessoa(dados.payload);
      return {
        id: resultado.id,
        falhas: resultado.falhas.map((f) => ({ seccao: f.seccao, mensagem: f.mensagem })),
        naoGravado: dados.naoGravado,
      };
    },
    [real.criarPessoa],
  );

  return { pessoas, stats, loading: real.loading, error: real.error, refresh: real.refresh, criarPessoa };
}

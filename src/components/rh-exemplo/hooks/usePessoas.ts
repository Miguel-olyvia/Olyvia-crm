/**
 * A lista de pessoas do modulo de RH, delegando ao hook real que le de Supabase.
 *
 * Mantém a mesma interface que os componentes de /rh-exemplo consomem
 * (NovaPessoaExemplo, ResultadoCriacao, PessoasStats), mas os dados vem da
 * base real via src/hooks/usePessoas.ts. A criacao de pessoa continua a usar
 * o formulario de exemplo (NovaPessoaExemplo) e delega ao hook real
 * convertendo o payload.
 */
import { useCallback, useMemo } from "react";
import { usePessoas as usePessoasReal } from "@/hooks/usePessoas";
import { dataDeHoje, type NovaPessoaPayload } from "@/lib/hr/novaPessoa";
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
}

export interface ResultadoCriacao {
  id: string;
  falhas: Array<{ seccao: string; mensagem: string }>;
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
   * Converte o payload do formulario de exemplo (NovaPessoaExemplo) para o
   * payload do hook real (NovaPessoaPayload) e delega a criacao.
   */
  const criarPessoa = useCallback(
    async (dados: NovaPessoaExemplo): Promise<ResultadoCriacao> => {
      const x = dados.extras;

      const nucleo: NovaPessoaPayload["nucleo"] = {
        primeiro_nome: dados.primeiro_nome,
        apelido: dados.apelido,
        cargo_id: dados.cargoId || null,
        local_id: dados.localId || null,
        data_admissao: dados.dataInicio || dataDeHoje(),
        data_saida: null,
        estado_registo: dados.dataInicio > dataDeHoje() ? "futuro" as any : "activo",
        reporta_a_pessoa_id: dados.reportaAId ?? null,
      };

      const vinculo: NovaPessoaPayload["vinculo"] = {
        tipo_contrato: dados.tipoContrato,
        data_inicio: dados.dataInicio,
        data_fim: dados.dataFim ?? null,
        estado: dados.dataInicio > dataDeHoje() ? "futuro" : "activo",
        regime: x?.vinculo?.regime ?? "tempo_inteiro",
        tipo_trabalho: x?.vinculo?.tipo_trabalho ?? "presencial",
      };

      const payload: NovaPessoaPayload = {
        nucleo,
        vinculo,
        acesso: {
          enviar_convite: false,
          role_id: null,
        },
        contaALigar: null,
      };

      // Map extras if provided
      if (x) {
        if (x.dadosPessoais) {
          payload.dadosPessoais = {
            genero: x.dadosPessoais.genero ?? null,
            data_nascimento: x.dadosPessoais.data_nascimento ?? null,
          } as any;
        }
        if (x.morada) {
          payload.morada = {
            tipo: "residencia",
            ...x.morada,
          } as any;
        }
      }

      const resultado = await real.criarPessoa(payload);
      return {
        id: resultado.id,
        falhas: resultado.falhas.map((f) => ({ seccao: f.seccao, mensagem: f.mensagem })),
      };
    },
    [real.criarPessoa],
  );

  return { pessoas, stats, loading: real.loading, error: real.error, refresh: real.refresh, criarPessoa };
}

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { textoOuNull } from "./adaptarComum";
import { chamarNeg, ErroNeg } from "./chamarNeg";
import { CHAVE_ERRO_GENERICO } from "./errosNeg";
import { invalidarPessoas } from "./invalidarPessoas";
import { useFontePessoas } from "./useFontePessoas";

/**
 * O que se guarda da identidade. Uma empresa tem só o nome da empresa; uma pessoa singular tem nome próprio e apelido (os dois, ou nenhum
 * para manter o nome). O NIF não entra: a função da base não lhe toca.
 */
export type DadosIdentidade =
  | { tipo: "organization"; nomeEmpresa: string }
  | { tipo: "person"; nomeProprio?: string; apelido?: string };

/** O que a função devolve (`empresa_nome` só numa empresa). Uma resposta que não se reconhece dá tudo a null e `mudou: false`. */
export interface ResultadoIdentidade {
  tipo: string | null;
  nome: string | null;
  empresaNome: string | null;
  mudou: boolean;
}

export interface GuardarIdentidade {
  guardar: (dados: DadosIdentidade) => Promise<ResultadoIdentidade>;
}

function lerResultado(dados: unknown): ResultadoIdentidade {
  const d = typeof dados === "object" && dados !== null ? (dados as Record<string, unknown>) : {};
  return {
    tipo: typeof d.tipo === "string" ? d.tipo : null,
    nome: typeof d.nome === "string" ? d.nome : null,
    empresaNome: typeof d.empresa_nome === "string" ? d.empresa_nome : null,
    mudou: d.mudou === true,
  };
}

/**
 * Guarda o tipo e o nome (da empresa, ou nome próprio e apelido) da pessoa com `neg_guardar_identidade_pessoa`. Lança `ErroNeg` se falhar
 * (a ficha traduz-lhe a chave: NG003 cobre a pessoa partilhada, NG009 um valor inválido). Depois de um sucesso refaz a ficha e as listas (e só termina quando elas foram refeitas);
 * depois de uma falha não toca em nada.
 */
export function useGuardarIdentidadePessoa(pessoaId: string): GuardarIdentidade {
  const fonte = useFontePessoas();
  const client = useQueryClient();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const guardar = useCallback(async (dados: DadosIdentidade): Promise<ResultadoIdentidade> => {
    if (!organizationId || !pessoaId) throw new ErroNeg(null, null, CHAVE_ERRO_GENERICO);
    const resposta = await chamarNeg<unknown>("neg_guardar_identidade_pessoa", {
      p_organization_id: organizationId,
      p_entity_id: pessoaId,
      p_tipo: dados.tipo,
      p_nome_empresa: dados.tipo === "organization" ? textoOuNull(dados.nomeEmpresa) : null,
      p_nome_proprio: dados.tipo === "person" ? textoOuNull(dados.nomeProprio) : null,
      p_apelido: dados.tipo === "person" ? textoOuNull(dados.apelido) : null,
    });
    // Espera pela releitura: o formulário só fecha quando a ficha já mostra o valor novo (senão ficava o nome antigo à vista).
    // Se a releitura falhar a base já gravou: não se lança (o utilizador veria «erro» num guardar que correu bem).
    try {
      await invalidarPessoas(client, organizationId, pessoaId);
    } catch {
      // A ficha refaz-se na próxima leitura; o resultado do guardar mantém-se.
    }
    return lerResultado(resposta);
  }, [organizationId, pessoaId, client]);
  return { guardar };
}

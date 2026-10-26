import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { TipoCliente } from "@/components/pessoas/pessoasTipos";
import { escolher, textoOuNull } from "./adaptarComum";
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
  | { tipo: "condominio"; nomeEmpresa: string }
  | { tipo: "person"; nomeProprio?: string; apelido?: string };

/** O que a função devolve (`empresa_nome` só numa empresa). Uma resposta que não se reconhece dá tudo a null e `mudou: false`. */
export interface ResultadoIdentidade {
  tipo: string | null;
  nome: string | null;
  empresaNome: string | null;
  /** `empresa` ou `condominio` numa organização; `null` numa pessoa singular ou numa resposta anterior à migration 20261231100000. */
  organizationKind: "empresa" | "condominio" | null;
  tipoCliente: TipoCliente | null;
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
    organizationKind: escolher(typeof d.organization_kind === "string" ? d.organization_kind : null, ["empresa", "condominio"] as const),
    tipoCliente: escolher(typeof d.tipo_cliente === "string" ? d.tipo_cliente : null, ["particular", "empresa", "condominio"] as const),
    mudou: d.mudou === true,
  };
}

/**
 * Guarda o tipo e o nome (da empresa, ou nome próprio e apelido) da pessoa com `neg_guardar_identidade_pessoa`. Lança `ErroNeg` se falhar
 * (a ficha traduz-lhe a chave: NG003 cobre a pessoa partilhada, NG009 um valor inválido). Depois de um sucesso refaz a ficha e as listas (e só termina quando elas foram refeitas);
 * depois de uma falha não toca em nada.
 *
 * `tipoClienteAtual` (o da ficha) protege o condomínio: gravar o nome de um condomínio como `organization` faria a base passá-lo a empresa, por
 * isso, sendo condomínio, o tipo vai sempre como `condominio`. Para o passar a empresa de propósito não há caminho aqui (decisão de produto por tomar).
 */
export function useGuardarIdentidadePessoa(pessoaId: string, tipoClienteAtual?: TipoCliente): GuardarIdentidade {
  const fonte = useFontePessoas();
  const client = useQueryClient();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const guardar = useCallback(async (dados: DadosIdentidade): Promise<ResultadoIdentidade> => {
    if (!organizationId || !pessoaId) throw new ErroNeg(null, null, CHAVE_ERRO_GENERICO);
    const tipo = dados.tipo === "organization" && tipoClienteAtual === "condominio" ? "condominio" : dados.tipo;
    const resposta = await chamarNeg<unknown>("neg_guardar_identidade_pessoa", {
      p_organization_id: organizationId,
      p_entity_id: pessoaId,
      p_tipo: tipo,
      p_nome_empresa: dados.tipo === "organization" || dados.tipo === "condominio" ? textoOuNull(dados.nomeEmpresa) : null,
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
  }, [organizationId, pessoaId, client, tipoClienteAtual]);
  return { guardar };
}

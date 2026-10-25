import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { textoOuNull } from "./adaptarComum";
import { ErroNeg } from "./chamarNeg";
import { CHAVE_ERRO_GENERICO, CHAVES_ERRO_NEG, chaveDoErro, codigoDoErro } from "./errosNeg";
import { invalidarPessoas } from "./invalidarPessoas";
import { useFontePessoas } from "./useFontePessoas";

/**
 * O que se guarda da identidade. Uma empresa tem só o nome da empresa; uma pessoa singular tem nome próprio e apelido (os dois, ou nenhum
 * para manter o nome). O NIF não entra: não se escreve aqui.
 */
export type DadosIdentidade =
  | { tipo: "organization"; nomeEmpresa: string }
  | { tipo: "person"; nomeProprio?: string; apelido?: string };

/** O que ficou gravado (`empresaNome` só numa empresa). Um UPDATE que correu bem conta sempre como `mudou`. */
export interface ResultadoIdentidade {
  tipo: string | null;
  nome: string | null;
  empresaNome: string | null;
  mudou: boolean;
}

export interface GuardarIdentidade {
  guardar: (dados: DadosIdentidade) => Promise<ResultadoIdentidade>;
}

type Db = { from: (t: string) => any };

/** Junta o espaço todo e apara (como a função da base o fazia); um texto vazio é null. */
const nomeLimpo = (texto: string | undefined): string | null => textoOuNull(texto?.replace(/\s+/g, " "));

/** As colunas de anew_entities que a identidade escreve: o tipo e o nome (nunca o NIF). */
function colunasDaIdentidade(dados: DadosIdentidade): Record<string, unknown> {
  if (dados.tipo === "organization") {
    return { type: "organization", display_name: nomeLimpo(dados.nomeEmpresa), first_name: null, last_name: null };
  }
  const nomeProprio = nomeLimpo(dados.nomeProprio);
  const apelido = nomeLimpo(dados.apelido);
  // Sem os dois nomes não se mexe no nome que lá está: só o tipo.
  if (!nomeProprio || !apelido) return { type: "person" };
  return { type: "person", display_name: `${nomeProprio} ${apelido}`, first_name: nomeProprio, last_name: apelido };
}

function lerLinha(dados: unknown): ResultadoIdentidade {
  const linha = Array.isArray(dados) ? (dados[0] as Record<string, unknown> | undefined) : undefined;
  const tipo = typeof linha?.type === "string" ? linha.type : null;
  const nome = typeof linha?.display_name === "string" ? linha.display_name : null;
  return { tipo, nome, empresaNome: tipo === "organization" ? nome : null, mudou: true };
}

function comoErro(causa: unknown): ErroNeg {
  const codigo = codigoDoErro(causa);
  if (!codigo) captureFlowError(causa, "pessoas-neg");
  return new ErroNeg(causa, codigo, chaveDoErro(causa));
}

/** Um UPDATE direto à entidade desta organização; sem linha atualizada (não existe, apagada ou escondida pela RLS) é uma falha, não um sucesso. */
async function escreverIdentidade(organizationId: string, pessoaId: string, dados: DadosIdentidade): Promise<ResultadoIdentidade> {
  let resposta: { data: unknown; error: unknown };
  try {
    resposta = await (supabase as unknown as Db).from("anew_entities").update(colunasDaIdentidade(dados))
      .eq("id", pessoaId).eq("organization_id", organizationId).select("id, type, display_name");
  } catch (excecao) {
    throw comoErro(excecao);
  }
  if (resposta.error) throw comoErro(resposta.error);
  if (!Array.isArray(resposta.data) || resposta.data.length === 0) throw new ErroNeg(null, "NG003", CHAVES_ERRO_NEG.NG003);
  return lerLinha(resposta.data);
}

/**
 * Guarda o tipo e o nome (da empresa, ou nome próprio e apelido) da pessoa na própria entidade. Lança `ErroNeg` se falhar
 * (a ficha traduz-lhe a chave: NG003 cobre a pessoa que não existe ou não se vê, 42501 a falta de permissão). Depois de um sucesso refaz a ficha e as listas
 * (e só termina quando elas foram refeitas); depois de uma falha não toca em nada.
 */
export function useGuardarIdentidadePessoa(pessoaId: string): GuardarIdentidade {
  const fonte = useFontePessoas();
  const client = useQueryClient();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const guardar = useCallback(async (dados: DadosIdentidade): Promise<ResultadoIdentidade> => {
    if (!organizationId || !pessoaId) throw new ErroNeg(null, null, CHAVE_ERRO_GENERICO);
    const resultado = await escreverIdentidade(organizationId, pessoaId, dados);
    // Espera pela releitura: o formulário só fecha quando a ficha já mostra o valor novo (senão ficava o nome antigo à vista).
    // Se a releitura falhar a base já gravou: não se lança (o utilizador veria «erro» num guardar que correu bem).
    try {
      await invalidarPessoas(client, organizationId, pessoaId);
    } catch {
      // A ficha refaz-se na próxima leitura; o resultado do guardar mantém-se.
    }
    return resultado;
  }, [organizationId, pessoaId, client]);
  return { guardar };
}

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { textoOuNull } from "./adaptarComum";
import { chamarNeg, ErroNeg } from "./chamarNeg";
import { CHAVE_ERRO_GENERICO } from "./errosNeg";
import { invalidarPessoas } from "./invalidarPessoas";
import { useFontePessoas } from "./useFontePessoas";

/** O telefone e o email principais a mudar. `undefined` ou vazio = não mexe (a função não limpa contactos). */
export interface DadosSubstituirContacto {
  email?: string;
  telefone?: string;
}

/** O que a função devolve; uma resposta que não se reconhece dá tudo a null e `mudou: false`. */
export interface ResultadoSubstituirContacto {
  email: string | null;
  telefone: string | null;
  mudou: boolean;
}

export interface SubstituirContacto {
  guardar: (dados: DadosSubstituirContacto) => Promise<ResultadoSubstituirContacto>;
}

const SEM_RESULTADO: ResultadoSubstituirContacto = { email: null, telefone: null, mudou: false };
const texto = (v: unknown): string | null => (typeof v === "string" ? v : null);

function lerResultado(dados: unknown): ResultadoSubstituirContacto {
  if (typeof dados !== "object" || dados === null) return SEM_RESULTADO;
  const d = dados as Record<string, unknown>;
  return { email: texto(d.email_depois), telefone: texto(d.telefone_depois), mudou: d.mudou === true };
}

/**
 * Muda o email e o telefone principais da pessoa com `neg_substituir_contacto`. Lança `ErroNeg` se falhar (NG009 valor inválido, NG019
 * contacto de outra pessoa da organização, NG003 pessoa indisponível, permissão). Sem nada para mudar não chama a base. Depois de um
 * sucesso refaz a ficha e as listas (se a releitura falhar, a base já gravou e não se lança).
 */
export function useSubstituirContactoPessoa(pessoaId: string): SubstituirContacto {
  const fonte = useFontePessoas();
  const client = useQueryClient();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const guardar = useCallback(async (dados: DadosSubstituirContacto): Promise<ResultadoSubstituirContacto> => {
    if (!organizationId || !pessoaId) throw new ErroNeg(null, null, CHAVE_ERRO_GENERICO);
    const email = textoOuNull(dados.email);
    const telefone = textoOuNull(dados.telefone);
    if (email === null && telefone === null) return SEM_RESULTADO;
    const resposta = await chamarNeg<unknown>("neg_substituir_contacto", {
      p_organization_id: organizationId, p_entity_id: pessoaId, p_email: email, p_telefone: telefone,
    });
    try {
      await invalidarPessoas(client, organizationId, pessoaId);
    } catch {
      // A base já gravou: a ficha refaz-se na próxima leitura.
    }
    return lerResultado(resposta);
  }, [organizationId, pessoaId, client]);
  return { guardar };
}

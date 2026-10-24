import { useMemo, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { MutacoesNegocio, PedidoEditarNegocio } from "@/components/negocio-metas/mutacoesNegocio";
import { paraTermos, type CondicoesTermos } from "@/components/negocio-metas/termosProposta";
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { ErroNeg } from "./chamarNeg";
import { CHAVES_ESCRITA, colunasDaEdicao, erroDeEscrita, NINGUEM_TOCADO, validarEdicao } from "./escritasNegocio";
import { invalidarPessoas } from "./invalidarPessoas";
import { negociosLixoQueryKey } from "./useNegociosNoLixo";
import { useFontePessoas } from "./useFontePessoas";

/** As escritas diretas do negócio que o contrato das mutações (`MutacoesNegocio`) declara como opcionais. */
export type EscritasNegocio = Required<Pick<MutacoesNegocio, "editar" | "enviarParaLixo" | "restaurar" | "guardarCondicoes">>;

type Tabela = { from: (tabela: string) => any };
const db = (): Tabela => supabase as unknown as Tabela;

interface Contexto {
  organizationId: string | null;
  pessoaId: string;
  client: QueryClient;
  emVoo: Map<string, Promise<unknown>>;
}

/**
 * Escritas DIRETAS no negócio, pelo padrão que o repositório já usa para escritas que não são funções neg_* (`gravarNovaLead`,
 * `atualizarPessoaExistente`: `supabase.from(...).update(...)` com a RLS a decidir). Cada UPDATE vai preso ao id E à organização e pede as linhas
 * de volta (`select`): a RLS que esconde uma linha não dá erro, dá zero linhas, e isso diz-se («indisponível») em vez de fingir que gravou. Um
 * pedido igual a outro em curso (duplo clique) partilha a resposta. Depois de gravar refaz a ficha, as listas e o lixo da pessoa.
 */
export function useEscritasNegocio(pessoaId: string): EscritasNegocio {
  const fonte = useFontePessoas();
  const client = useQueryClient();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const [emVoo] = useState(() => new Map<string, Promise<unknown>>());
  return useMemo(() => criarEscritas({ organizationId, pessoaId, client, emVoo }), [organizationId, pessoaId, client, emVoo]);
}

function criarEscritas(c: Contexto): EscritasNegocio {
  const org = (): string => {
    if (!c.organizationId) throw erroDeEscrita(null);
    return c.organizationId;
  };
  const refazer = (): void => {
    if (!c.organizationId) return;
    void invalidarPessoas(c.client, c.organizationId, c.pessoaId);
    void c.client.invalidateQueries({ queryKey: negociosLixoQueryKey(c.organizationId, c.pessoaId) });
  };

  /** Corre um UPDATE (já montado por `montar`) e confere que tocou numa linha. */
  function escrever<T>(
    chave: string, montar: () => PromiseLike<{ data: unknown; error: unknown }>, valor: T, semLinhas: string = CHAVES_ESCRITA.indisponivel,
  ): Promise<T> {
    const atual = c.emVoo.get(chave);
    if (atual) return atual as Promise<T>;
    const corrida = (async (): Promise<T> => {
      const { data, error } = await montar();
      if (error) {
        const erro = erroDeEscrita(error);
        // Os erros que a base explica (permissão, limites) são esperados; o resto é avaria.
        if (erro.chave === "pessoasPagina.erroNeg.generico") captureFlowError(error, "pessoas-neg");
        throw erro;
      }
      if (!Array.isArray(data) || data.length === 0) {
        refazer();
        throw semLinhas === CHAVES_ESCRITA.indisponivel ? erroDeEscrita(NINGUEM_TOCADO) : new ErroNeg(null, null, semLinhas);
      }
      refazer();
      return valor;
    })().finally(() => { c.emVoo.delete(chave); });
    c.emVoo.set(chave, corrida);
    return corrida;
  }

  const editar = async ({ negocioId, antes, depois }: PedidoEditarNegocio): Promise<{ mudou: boolean }> => {
    const organizationId = org();
    const erros = validarEdicao(depois);
    if (erros.titulo) throw new ErroNeg(null, null, CHAVES_ESCRITA.titulo);
    if (erros.notas) throw new ErroNeg(null, null, CHAVES_ESCRITA.notas);
    const colunas = colunasDaEdicao(antes, depois);
    if (Object.keys(colunas).length === 0) return { mudou: false };
    return escrever(
      `editar:${negocioId}:${JSON.stringify(colunas)}`,
      () => db().from("negocios").update(colunas).eq("id", negocioId).eq("organization_id", organizationId).select("id"),
      { mudou: true },
    );
  };

  const enviarParaLixo = async (negocioId: string): Promise<void> => {
    const organizationId = org();
    // A base carimba `deleted_at` e `deleted_by` (ignora o valor enviado): vai só como sinal. `is null` impede de o apagar duas vezes.
    return escrever(
      `lixo:${negocioId}`,
      () => db().from("negocios").update({ deleted_at: new Date().toISOString() }).eq("id", negocioId).eq("organization_id", organizationId).is("deleted_at", null).select("id"),
      undefined,
    );
  };

  const restaurar = async (negocioId: string): Promise<void> => {
    const organizationId = org();
    return escrever(
      `restaurar:${negocioId}`,
      () => db().from("negocios").update({ deleted_at: null }).eq("id", negocioId).eq("organization_id", organizationId).not("deleted_at", "is", null).select("id"),
      undefined,
    );
  };

  const guardarCondicoes = async (negocioId: string, propostaId: string, condicoes: CondicoesTermos): Promise<void> => {
    const organizationId = org();
    const terms = paraTermos(condicoes);
    // Só `terms`: a validade (`valid_until`) e as notas (`notes`) têm colunas próprias e esta escrita não lhes toca.
    // O estado também vai no filtro: uma proposta aceite ou recusada (entretanto, com o ecrã aberto com dados antigos, ou por uma chamada direta)
    // não se reescreve, e a base não o impede (o gatilho deixa passar). Zero linhas = a proposta mudou ou já não é visível: diz-se.
    return escrever(
      `condicoes:${propostaId}:${JSON.stringify(terms)}`,
      () => db().from("proposals").update({ terms }).eq("id", propostaId).eq("negocio_id", negocioId).eq("organization_id", organizationId)
        .or("status.is.null,status.not.in.(accepted,rejected)").select("id"),
      undefined,
      CHAVES_ESCRITA.propostaFechada,
    );
  };

  return { editar, enviarParaLixo, restaurar, guardarCondicoes };
}

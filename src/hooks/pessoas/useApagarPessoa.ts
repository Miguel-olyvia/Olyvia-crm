// Apagar uma lead ou um cliente por engano e restaurá-la no Lixo (neg_apagar_pessoa, soft delete), o aviso do que está ligado à pessoa
// (neg_pessoa_ligacoes) e a lista das pessoas apagadas (neg_pessoas_apagadas). A base não recusa por haver documentos: só por negócios abertos
// (NG011). Os erros vêm com chaves próprias de apagar e restaurar (a NG011 genérica fala em «encerrar»).
import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { chamarNeg, ErroNeg } from "./chamarNeg";
import { fichaPessoaQueryKey } from "./useFichaPessoa";
import { listaPessoasQueryKey } from "./useListaPessoas";

const A = "pessoasPagina.apagarPessoa.";

/** O que neg_pessoa_ligacoes devolve: contagens. */
export interface LigacoesPessoa {
  contratos: number;
  encomendas: number;
  faturas: number;
  pagamentos: number;
  propostas_aceites: number;
  negocios_abertos: number;
  negocios_ganhos: number;
  negocios_perdidos: number;
  visitas_futuras: number;
  portal: number;
}

/** A ordem do aviso (os documentos primeiro). Os negócios abertos não entram: esses impedem apagar (NG011). */
export const ORDEM_LIGACOES = [
  "contratos", "encomendas", "faturas", "pagamentos", "propostas_aceites", "negocios_ganhos", "negocios_perdidos", "visitas_futuras", "portal",
] as const satisfies readonly (keyof LigacoesPessoa)[];

export type TipoLigacao = (typeof ORDEM_LIGACOES)[number];

const numero = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

/** Lê a resposta da base com cuidado: um campo em falta ou estranho conta como zero. */
export function lerLigacoes(dados: unknown): LigacoesPessoa {
  const o = (typeof dados === "object" && dados !== null ? dados : {}) as Record<string, unknown>;
  return {
    contratos: numero(o.contratos), encomendas: numero(o.encomendas), faturas: numero(o.faturas), pagamentos: numero(o.pagamentos),
    propostas_aceites: numero(o.propostas_aceites), negocios_abertos: numero(o.negocios_abertos), negocios_ganhos: numero(o.negocios_ganhos),
    negocios_perdidos: numero(o.negocios_perdidos), visitas_futuras: numero(o.visitas_futuras), portal: numero(o.portal),
  };
}

/** As ligações a mostrar no aviso, pela ordem, só as que existem. */
export function itensDoAviso(l: LigacoesPessoa): { tipo: TipoLigacao; quantos: number }[] {
  return ORDEM_LIGACOES.filter((tipo) => l[tipo] > 0).map((tipo) => ({ tipo, quantos: l[tipo] }));
}

/** A chave de tradução de uma contagem (o `t` não faz plurais). */
export const chaveDaLigacao = (tipo: TipoLigacao, quantos: number): string => `${A}count.${tipo}.${quantos === 1 ? "one" : "other"}`;

/** Uma pessoa no lixo, como neg_pessoas_apagadas a devolve. */
export interface PessoaApagada {
  id: string;
  nome: string | null;
  cliente: boolean;
  apagadaEm: string | null;
  apagadaPor: string | null;
}

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

export function lerPessoasApagadas(dados: unknown): PessoaApagada[] {
  if (!Array.isArray(dados)) return [];
  return dados.flatMap((d): PessoaApagada[] => {
    const o = (typeof d === "object" && d !== null ? d : {}) as Record<string, unknown>;
    const id = texto(o.id);
    if (!id) return [];
    return [{ id, nome: texto(o.nome), cliente: o.cliente === true, apagadaEm: texto(o.apagada_em), apagadaPor: texto(o.apagada_por) }];
  });
}

/** As chaves de erro de apagar: NG011, NG003, 42501 e NG008 têm texto próprio; o resto fica com a chave de sempre. */
const CHAVES_APAGAR: Readonly<Record<string, string>> = {
  NG011: `${A}erro.ng011`, NG003: `${A}erro.ng003`, "42501": `${A}erro.permissao`, NG008: `${A}erro.ng008`,
};
const CHAVES_RESTAURAR: Readonly<Record<string, string>> = {
  NG003: `${A}erro.restaurar.ng003`, "42501": `${A}erro.restaurar.permissao`, NG008: `${A}erro.ng008`,
};

function comChaveDe(mapa: Readonly<Record<string, string>>, erro: unknown): unknown {
  if (!(erro instanceof ErroNeg) || !erro.codigo || !mapa[erro.codigo]) return erro;
  return new ErroNeg(erro.causa, erro.codigo, mapa[erro.codigo]);
}

export const pessoaLigacoesQueryKey = (org: string | null, pessoaId: string | null) => ["neg-pessoa-ligacoes", org, pessoaId] as const;
export const pessoasApagadasQueryKey = (org: string | null) => ["neg-pessoas-apagadas", org] as const;

/** O que está ligado à pessoa, lido só enquanto o diálogo está aberto (`pessoaId` não nulo). Sempre fresco: os documentos mudam noutros ecrãs. */
export function usePessoaLigacoes(organizationId: string | null, pessoaId: string | null) {
  return useQuery({
    queryKey: pessoaLigacoesQueryKey(organizationId, pessoaId),
    queryFn: async () => lerLigacoes(await chamarNeg<unknown>("neg_pessoa_ligacoes", { p_organization_id: organizationId, p_entity_id: pessoaId })),
    enabled: !!organizationId && !!pessoaId,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
}

/** As pessoas apagadas da organização que se podem restaurar (a base aplica o âmbito; sem pessoas.delete vem vazia). */
export function usePessoasApagadas(organizationId: string | null, ativo = true) {
  return useQuery({
    queryKey: pessoasApagadasQueryKey(organizationId),
    queryFn: async () => lerPessoasApagadas(await chamarNeg<unknown>("neg_pessoas_apagadas", { p_organization_id: organizationId })),
    enabled: ativo && !!organizationId,
    retry: false,
  });
}

/**
 * Depois de apagar: a ficha da pessoa SAI da cache (não se refaz: a base já responderia NG003) e as listas e o lixo refazem-se. Quem fecha a
 * ficha fá-lo ANTES de chamar isto. Uma falha aqui não é uma falha do apagar.
 */
async function refazerDepoisDeMudar(client: QueryClient, organizationId: string, pessoaId: string): Promise<void> {
  try {
    client.removeQueries({ queryKey: fichaPessoaQueryKey(organizationId, pessoaId) });
    await Promise.all([
      client.invalidateQueries({ queryKey: listaPessoasQueryKey(organizationId) }),
      client.invalidateQueries({ queryKey: pessoasApagadasQueryKey(organizationId) }),
    ]);
  } catch {
    // A escrita já aconteceu; a próxima leitura traz o estado certo.
  }
}

export interface AcoesApagarPessoa {
  /** Apaga (soft delete). Lança ErroNeg com a chave de apagar. Não refaz nada: quem chama fecha a ficha e depois chama `refazer`. */
  apagar: (pessoaId: string) => Promise<void>;
  /** Restaura e refaz as listas. Lança ErroNeg com a chave de restaurar. */
  restaurar: (pessoaId: string) => Promise<void>;
  /** Tira a ficha da cache e refaz as listas e o lixo. */
  refazer: (pessoaId: string) => void;
}

export function useApagarPessoa(organizationId: string | null): AcoesApagarPessoa {
  const client = useQueryClient();
  const mudar = useCallback(async (pessoaId: string, apagar: boolean): Promise<void> => {
    if (!organizationId || !pessoaId) throw new ErroNeg(null, null, "pessoasPagina.erroNeg.generico");
    try {
      await chamarNeg("neg_apagar_pessoa", { p_organization_id: organizationId, p_entity_id: pessoaId, p_apagar: apagar });
    } catch (erro) {
      throw comChaveDe(apagar ? CHAVES_APAGAR : CHAVES_RESTAURAR, erro);
    }
  }, [organizationId]);
  const refazer = useCallback((pessoaId: string) => {
    if (organizationId) void refazerDepoisDeMudar(client, organizationId, pessoaId);
  }, [client, organizationId]);
  return useMemo(() => ({
    apagar: (pessoaId: string) => mudar(pessoaId, true),
    restaurar: async (pessoaId: string) => {
      await mudar(pessoaId, false);
      refazer(pessoaId);
    },
    refazer,
  }), [mudar, refazer]);
}

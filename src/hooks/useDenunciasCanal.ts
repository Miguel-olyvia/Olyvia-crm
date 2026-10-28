/**
 * O canal de denúncias lido e escrito na base: SÓ pelas RPCs `rpc_denuncia*` do desenho
 * (`supabase/rascunhos/DESENHO-denuncias.md`) e pela Edge pública `denuncia-publica`. Nenhuma tabela do canal é lida
 * diretamente (estão fechadas a `authenticated`; tudo passa por RPC `SECURITY DEFINER`).
 *
 * ENQUANTO AS RPCs E A EDGE NÃO ESTIVEREM PUBLICADAS
 * --------------------------------------------------
 * Nenhuma existe na base hoje. Cada leitura falha com um erro (o ecrã di-lo: «não foi possível carregar») e cada ação
 * devolve `indisponivel`. NUNCA se mostram dados de exemplo no lugar dos reais, e uma leitura falhada NÃO é «não há
 * denúncias». Os contratos exatos (argumentos e formas das respostas) estão em `src/lib/denuncias/canal.ts`.
 *
 * CONFIDENCIALIDADE
 *  - A identidade só chega por `rpc_denuncia_identidade_ver` (com motivo, registado na base) e nunca fica em cache: a
 *    resposta passa ao ecrã e vive só no estado dele.
 *  - Nada do caso (texto, identidade, código, PIN) vai para o registo de erros: só a operação e o código do erro.
 *  - As leituras com dados de casos têm `gcTime` curto (1 min depois de saírem do ecrã), para não ficarem em memória
 *    numa sessão que muda de utilizador.
 */
import { useCallback } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DadosDecisao, ErroAcao } from "@/components/canal-denuncias/lib/acoes";
import { normalizarCodigo, normalizarPin } from "@/components/canal-denuncias/lib/codigos";
import type { DadosFormulario } from "@/components/canal-denuncias/lib/formulario";
import type { Anexo, Denuncia, Gravidade, Identidade, Responsavel } from "@/components/canal-denuncias/lib/tipos";
import {
  FormaInvalida, comoLista, contagemDe, denunciaDeAberta, denunciaDeLista, denunciaDeVista, deveReportar, erroDeRpc, erroParaRegisto,
  identidadeDeDb, responsavelDeDb,
  type CanalLerDb, type CanalPublicoDb, type DenunciaAbertaDb, type DenunciaListaDb, type IdentidadeDb, type ResponsaveisDb, type VistaDenuncianteDb,
} from "@/lib/denuncias/canal";
import {
  chamarEdge, corpoDeCriacao, erroDeEdge, esquecerSessao, guardarSessao, lerSessao, vistaDaEdge, type RespostaVistaEdge,
} from "@/lib/denuncias/edgePublica";
import { hrRpc } from "@/lib/hr/hrDb";
import { captureFlowError } from "@/lib/observability/captureFlowError";

const FLOW = "hr-denuncias" as const;
const MS_MINUTO = 60_000;

// ------------------------------------------------------------------------------------------------------- chaves

export const chavesDenuncias = {
  tudo: ["denuncias"] as const,
  lista: (org: string) => ["denuncias", org, "lista"] as const,
  caso: (org: string, id: string) => ["denuncias", org, "caso", id] as const,
  minhas: (org: string) => ["denuncias", org, "minhas"] as const,
  vista: (id: string) => ["denuncias", "vista", id] as const,
  porConfirmar: (org: string) => ["denuncias", org, "por-confirmar"] as const,
  responsaveis: (org: string) => ["denuncias", org, "responsaveis"] as const,
  config: (org: string) => ["denuncias", org, "config"] as const,
  canalDaOrg: (org: string) => ["denuncias", org, "canal-publico"] as const,
  canalPublico: (slug: string) => ["denuncias", "canal", slug] as const,
};

// ------------------------------------------------------------------------------------------------ chamadas à base

export type ResultadoRpc<T> = { ok: true; dados: T } | { ok: false; erro: ErroAcao };

/** Uma RPC que nunca lança: devolve o erro do ecrã e reporta (só operação e código) o que for um defeito. */
async function chamarRpc<T>(operacao: string, fn: string, args: Record<string, unknown>): Promise<ResultadoRpc<T>> {
  try {
    const { data, error } = await hrRpc(fn, args);
    if (error) {
      if (deveReportar(error)) captureFlowError(erroParaRegisto(operacao, error), FLOW);
      return { ok: false, erro: erroDeRpc(error) };
    }
    return { ok: true, dados: data as T };
  } catch (e) {
    captureFlowError(erroParaRegisto(operacao, e), FLOW);
    return { ok: false, erro: "indisponivel" };
  }
}

/** O erro de uma leitura que falhou; `erro` é o código que o ecrã pode traduzir. */
export class ErroDeLeitura extends Error {
  constructor(readonly erro: ErroAcao) {
    super(`denuncias:leitura:${erro}`);
    this.name = "ErroDeLeitura";
  }
}

/** Mapeia com defesa: uma resposta com a forma errada é um defeito (reportado) e a leitura falha. */
function mapear<D, R>(operacao: string, dados: D, f: (d: D) => R): R {
  try {
    return f(dados);
  } catch (e) {
    captureFlowError(e instanceof FormaInvalida ? e : erroParaRegisto(operacao, e), FLOW);
    throw new ErroDeLeitura("indisponivel");
  }
}

async function ler<D, R>(operacao: string, fn: string, args: Record<string, unknown>, f: (d: D) => R): Promise<R> {
  const r = await chamarRpc<D>(operacao, fn, args);
  if (!r.ok) throw new ErroDeLeitura(r.erro);
  return mapear(operacao, r.dados, f);
}

// ------------------------------------------------------------------------------------------------------ leituras

export interface ResponsaveisLidos { lista: Responsavel[]; euId: string | null }
export interface ConfiguracaoLida { ativo: boolean; slug: string; responsaveis: Responsavel[]; candidatos: Responsavel[]; semQuemTrate: number }
export interface CanalLido { ativo: boolean; nome: string }

const listarDoGestor = (org: string): Promise<Denuncia[]> =>
  ler<unknown, Denuncia[]>("listar", "rpc_denuncias_listar", { p_organization_id: org }, (d) => comoLista<DenunciaListaDb>(d, "lista").map((r) => denunciaDeLista(r, org)));

const abrirCaso = (org: string, id: string): Promise<Denuncia> =>
  ler<DenunciaAbertaDb, Denuncia>("abrir", "rpc_denuncia_abrir", { p_organization_id: org, p_denuncia_id: id }, (d) => denunciaDeAberta(d, org));

function vistaDeMinha(v: VistaDenuncianteDb, org: string): Denuncia {
  if (!v.id) throw new FormaInvalida("minhas.id");
  return denunciaDeVista(v, org, v.id);
}

/** As identificadas da própria pessoa; deixa cada uma na cache da vista, para o painel abrir já com ela. */
async function listarMinhas(org: string, qc: QueryClient): Promise<Denuncia[]> {
  const lista = await ler<unknown, Denuncia[]>("minhas", "rpc_denuncias_minhas", { p_organization_id: org }, (d) => comoLista<VistaDenuncianteDb>(d, "minhas").map((v) => vistaDeMinha(v, org)));
  lista.forEach((d) => qc.setQueryData(chavesDenuncias.vista(d.id), d));
  return lista;
}

const lerResponsaveis = (org: string): Promise<ResponsaveisLidos> =>
  ler<ResponsaveisDb, ResponsaveisLidos>("responsaveis", "rpc_denuncias_responsaveis", { p_organization_id: org }, (d) => ({
    lista: comoLista<ResponsaveisDb["responsaveis"][number]>(d?.responsaveis, "responsaveis").map(responsavelDeDb),
    euId: d?.eu ?? null,
  }));

/** `null` para quem não tem `denuncias.configurar` (a base responde com falta de permissão: não é um erro do ecrã). */
async function lerConfiguracao(org: string): Promise<ConfiguracaoLida | null> {
  try {
    return await ler<CanalLerDb, ConfiguracaoLida>("canal_ler", "rpc_denuncias_canal_ler", { p_organization_id: org }, (d) => ({
      ativo: d.ativo === true,
      slug: d.slug_publico ?? "",
      responsaveis: comoLista<CanalLerDb["responsaveis"][number]>(d.responsaveis, "config.responsaveis").map(responsavelDeDb),
      candidatos: comoLista<CanalLerDb["candidatos"][number]>(d.candidatos, "config.candidatos").map(responsavelDeDb),
      semQuemTrate: contagemDe(d.sem_quem_trate ?? 0),
    }));
  } catch (e) {
    if (e instanceof ErroDeLeitura && e.erro === "sem_permissao") return null;
    throw e;
  }
}

/** O canal de uma página pública, pela Edge. `ativo: false` serve para «desligado» e para «desconhecido» (não se distingue). */
async function lerCanalPublico(slug: string): Promise<CanalLido> {
  const r = await chamarEdge<{ ativo?: boolean; nome_org?: string }>("canal", { slug });
  if (!r.ok) {
    if (r.erro === "canal_inativo" || r.estado === 404) return { ativo: false, nome: "" };
    throw new ErroDeLeitura(erroDeEdge(r.erro));
  }
  return { ativo: r.dados.ativo === true, nome: typeof r.dados.nome_org === "string" ? r.dados.nome_org : "" };
}

/** O slug do canal da organização ativa (para denunciar e acompanhar de dentro da app). */
async function slugDaOrganizacao(org: string, qc: QueryClient): Promise<string | null> {
  const c = await qc.fetchQuery({
    queryKey: chavesDenuncias.canalDaOrg(org),
    staleTime: 5 * MS_MINUTO,
    queryFn: () => ler<CanalPublicoDb, CanalPublicoDb>("canal_publico", "rpc_denuncias_canal_publico", { p_organization_id: org }, (d) => d),
  });
  return c.ativo === true && c.slug_publico ? c.slug_publico : null;
}

/** A vista do denunciante: pela sessão da Edge (anónimas) ou pela lista «As minhas» (identificadas). */
async function lerVista(id: string, org: string | null, qc: QueryClient): Promise<Denuncia> {
  const sessao = lerSessao(id);
  if (sessao) {
    const r = await chamarEdge<RespostaVistaEdge>("ler", {}, { sessao: sessao.token });
    if (!r.ok) {
      if (r.erro === "sessao_invalida") esquecerSessao(id);
      throw new ErroDeLeitura(erroDeEdge(r.erro));
    }
    return mapear("ler", r.dados, (d) => vistaDaEdge(d, sessao.organizacao, id));
  }
  if (!org) throw new ErroDeLeitura("nao_encontrada");
  const achada = (await listarMinhas(org, qc)).find((d) => d.id === id);
  if (!achada) throw new ErroDeLeitura("nao_encontrada");
  return achada;
}

// ---------------------------------------------------------------------------------------------------------- hooks

const LEITURA = { retry: false, refetchOnWindowFocus: false } as const;
const DADOS_DE_CASOS = { ...LEITURA, staleTime: 30_000, gcTime: MS_MINUTO } as const;

export const useDenunciasListar = (org: string) =>
  useQuery({ ...DADOS_DE_CASOS, queryKey: chavesDenuncias.lista(org), enabled: org !== "", queryFn: () => listarDoGestor(org) });

export const useDenunciaAberta = (org: string, id: string | null) =>
  useQuery({ ...DADOS_DE_CASOS, queryKey: chavesDenuncias.caso(org, id ?? ""), enabled: org !== "" && id !== null, queryFn: () => abrirCaso(org, id as string) });

export function useDenunciasMinhas(org: string) {
  const qc = useQueryClient();
  return useQuery({ ...DADOS_DE_CASOS, queryKey: chavesDenuncias.minhas(org), enabled: org !== "", queryFn: () => listarMinhas(org, qc) });
}

/** O contador do menu: `staleTime` de 60 s e sem *polling*. Uma falha reporta-se e o contador esconde-se (não é «0»). */
export const useDenunciasPorConfirmar = (org: string) =>
  useQuery({
    ...LEITURA, staleTime: MS_MINUTO, gcTime: MS_MINUTO, queryKey: chavesDenuncias.porConfirmar(org), enabled: org !== "",
    queryFn: () => ler<unknown, number>("por_confirmar", "rpc_denuncias_por_confirmar", { p_organization_id: org }, contagemDe),
  });

export const useDenunciasResponsaveis = (org: string) =>
  useQuery({ ...LEITURA, staleTime: MS_MINUTO, gcTime: MS_MINUTO, queryKey: chavesDenuncias.responsaveis(org), enabled: org !== "", queryFn: () => lerResponsaveis(org) });

export const useDenunciasConfiguracao = (org: string) =>
  useQuery({ ...LEITURA, staleTime: MS_MINUTO, gcTime: MS_MINUTO, queryKey: chavesDenuncias.config(org), enabled: org !== "", queryFn: () => lerConfiguracao(org) });

export const useCanalPublicoPorSlug = (slug: string | null) =>
  useQuery({ ...LEITURA, staleTime: 5 * MS_MINUTO, queryKey: chavesDenuncias.canalPublico(slug ?? ""), enabled: slug !== null && slug !== "", queryFn: () => lerCanalPublico(slug as string) });

export function useVistaDoDenunciante(id: string | null, org: string | null) {
  const qc = useQueryClient();
  return useQuery({ ...DADOS_DE_CASOS, queryKey: chavesDenuncias.vista(id ?? ""), enabled: id !== null, queryFn: () => lerVista(id as string, org, qc) });
}

// -------------------------------------------------------------------------------------------------------- ações

export type ResultadoDaAccao = { ok: true } | { ok: false; erro: ErroAcao };
export type ResultadoDeIdentidade = { ok: true; identidade: Identidade } | { ok: false; erro: ErroAcao };
export type ResultadoDeCriacao = { ok: true; codigo: string; pin: string } | { ok: false; erro: ErroAcao };
export type ResultadoDeEntrada = { ok: true; id: string } | { ok: false; erro: "invalido" | "indisponivel" | "limite" };

export interface OrigemDeCriacao {
  organizationId: string;
  pessoaId?: string | null;
  slug?: string;
}

const falha = (erro: ErroAcao): ResultadoDaAccao => ({ ok: false, erro });
const PREFIXO_ACOMPANHAMENTO = "acomp:";

/** Todas as escritas do canal. Depois de cada uma, as leituras afetadas são relidas (a lista, o contador, o caso). */
export function useDenunciasAccoes() {
  const qc = useQueryClient();

  const refrescar = useCallback((org: string, id?: string): void => {
    void qc.invalidateQueries({ queryKey: chavesDenuncias.lista(org) });
    void qc.invalidateQueries({ queryKey: chavesDenuncias.porConfirmar(org) });
    void qc.invalidateQueries({ queryKey: chavesDenuncias.config(org) });
    if (id) void qc.invalidateQueries({ queryKey: chavesDenuncias.caso(org, id) });
  }, [qc]);

  /** Uma ação sobre um caso. A resposta traz o caso atualizado, mas nada depende dela: relê-se sempre (um impedido já não o vê). */
  const sobreCaso = useCallback(async (operacao: string, fn: string, org: string, id: string, args: Record<string, unknown> = {}): Promise<ResultadoDaAccao> => {
    const r = await chamarRpc<unknown>(operacao, fn, { p_organization_id: org, p_denuncia_id: id, ...args });
    if (!r.ok) return falha(r.erro);
    refrescar(org, id);
    return { ok: true };
  }, [refrescar]);

  const confirmarRececao = (org: string, id: string) => sobreCaso("confirmar_rececao", "rpc_denuncia_confirmar_rececao", org, id);
  const mudarGravidade = (org: string, id: string, g: Gravidade) => sobreCaso("gravidade", "rpc_denuncia_gravidade", org, id, { p_gravidade: g });
  const atribuir = (org: string, id: string, user: string) => sobreCaso("atribuir", "rpc_denuncia_atribuir", org, id, { p_user: user });
  const impedir = (org: string, id: string, user: string, motivo: "conflito" | "visado") => sobreCaso("impedir", "rpc_denuncia_impedir", org, id, { p_user: user, p_motivo: motivo });
  const enviarMensagem = (org: string, id: string, texto: string) => sobreCaso("mensagem", "rpc_denuncia_mensagem", org, id, { p_texto: texto });
  const pedirInformacao = (org: string, id: string, texto: string) => sobreCaso("pedir_informacao", "rpc_denuncia_pedir_informacao", org, id, { p_texto: texto });
  const adicionarNota = (org: string, id: string, texto: string) => sobreCaso("nota", "rpc_denuncia_nota", org, id, { p_texto: texto });
  const concluir = (org: string, id: string, d: DadosDecisao) =>
    sobreCaso("concluir", "rpc_denuncia_concluir", org, id, { p_resultado: d.resultado, p_medidas: d.medidas, p_fundamentacao: d.fundamentacao });
  const arquivar = (org: string, id: string, motivo: string) => sobreCaso("arquivar", "rpc_denuncia_arquivar", org, id, { p_motivo: motivo });
  const reabrir = (org: string, id: string) => sobreCaso("reabrir", "rpc_denuncia_reabrir", org, id);

  /** Ver a identidade: o motivo vai para a base, que regista quem viu, quando e porquê ANTES de devolver. Nada fica em cache. */
  const verIdentidade = async (org: string, id: string, motivo: string): Promise<ResultadoDeIdentidade> => {
    const r = await chamarRpc<IdentidadeDb>("identidade_ver", "rpc_denuncia_identidade_ver", { p_organization_id: org, p_denuncia_id: id, p_motivo: motivo });
    if (!r.ok) return r;
    try {
      const identidade = identidadeDeDb(r.dados);
      void qc.invalidateQueries({ queryKey: chavesDenuncias.caso(org, id) }); // o histórico ganhou o evento «identidade_vista»
      return { ok: true, identidade };
    } catch (e) {
      captureFlowError(erroParaRegisto("identidade_ver", e), FLOW);
      return falha("indisponivel");
    }
  };

  const guardarCanal = async (org: string, ativo: boolean, slug: string): Promise<ResultadoDaAccao> => {
    const r = await chamarRpc<unknown>("canal_guardar", "rpc_denuncias_canal_guardar", { p_organization_id: org, p_ativo: ativo, p_slug: slug });
    if (!r.ok) return falha(r.erro);
    void qc.invalidateQueries({ queryKey: chavesDenuncias.config(org) });
    void qc.invalidateQueries({ queryKey: chavesDenuncias.canalDaOrg(org) });
    return { ok: true };
  };

  const mudarResponsavel = async (operacao: string, fn: string, org: string, user: string): Promise<ResultadoDaAccao> => {
    const r = await chamarRpc<unknown>(operacao, fn, { p_organization_id: org, p_user: user });
    if (!r.ok) return falha(r.erro);
    void qc.invalidateQueries({ queryKey: chavesDenuncias.config(org) });
    void qc.invalidateQueries({ queryKey: chavesDenuncias.responsaveis(org) });
    void qc.invalidateQueries({ queryKey: chavesDenuncias.lista(org) }); // remover um responsável liberta-lhe os casos
    return { ok: true };
  };
  const designarResponsavel = (org: string, user: string) => mudarResponsavel("responsavel_designar", "rpc_denuncias_responsavel_designar", org, user);
  const removerResponsavel = (org: string, user: string) => mudarResponsavel("responsavel_remover", "rpc_denuncias_responsavel_remover", org, user);

  /**
   * Denunciar, pela Edge (é ela que tem o segredo do PIN). Anónima: SEM JWT. Identificada dentro da app (há `pessoaId`):
   * com o JWT, para a Edge saber de quem é. Na página pública não há sessão do CRM e nunca se envia.
   */
  const submeter = async (f: DadosFormulario, origem: OrigemDeCriacao): Promise<ResultadoDeCriacao> => {
    let slug = origem.slug ?? null;
    if (!slug) {
      try {
        slug = await slugDaOrganizacao(origem.organizationId, qc);
      } catch (e) {
        return { ok: false, erro: e instanceof ErroDeLeitura ? e.erro : "indisponivel" };
      }
    }
    if (!slug) return { ok: false, erro: "canal_inativo" };
    const identificadaNaApp = f.anonima === false && !!origem.pessoaId;
    const jwt = identificadaNaApp ? (await supabase.auth.getSession()).data.session?.access_token ?? null : null;
    if (identificadaNaApp && !jwt) return { ok: false, erro: "sem_permissao" };
    const r = await chamarEdge<{ codigo?: unknown; pin?: unknown }>("criar", corpoDeCriacao(f, slug), { jwt });
    if (!r.ok) return { ok: false, erro: erroDeEdge(r.erro) };
    const { codigo, pin } = r.dados;
    if (typeof codigo !== "string" || typeof pin !== "string" || !codigo || !pin) {
      captureFlowError(new Error("denuncias:criar:forma_invalida"), FLOW);
      return { ok: false, erro: "indisponivel" };
    }
    if (origem.organizationId) refrescar(origem.organizationId);
    return { ok: true, codigo, pin };
  };

  /** Entrar com código e PIN: a Edge devolve uma sessão (só em memória) e a vista fica na cache. O erro é o mesmo para tudo o que não bate. */
  const entrar = async (a: { codigo: string; pin: string; slug?: string; organizacaoId?: string }): Promise<ResultadoDeEntrada> => {
    const codigo = normalizarCodigo(a.codigo);
    const pin = normalizarPin(a.pin);
    if (!codigo || !pin) return { ok: false, erro: "invalido" };
    let slug = a.slug ?? null;
    if (!slug && a.organizacaoId) {
      try {
        slug = await slugDaOrganizacao(a.organizacaoId, qc);
      } catch {
        return { ok: false, erro: "indisponivel" };
      }
    }
    if (!slug) return { ok: false, erro: "indisponivel" };
    const r = await chamarEdge<{ sessao?: unknown }>("entrar", { slug, codigo, pin });
    if (!r.ok) {
      return { ok: false, erro: r.erro === "codigo_ou_pin_invalido" ? "invalido" : r.erro === "demasiadas_tentativas" ? "limite" : "indisponivel" };
    }
    if (typeof r.dados.sessao !== "string" || !r.dados.sessao) {
      captureFlowError(new Error("denuncias:entrar:forma_invalida"), FLOW);
      return { ok: false, erro: "indisponivel" };
    }
    const id = `${PREFIXO_ACOMPANHAMENTO}${codigo}`;
    guardarSessao(id, { token: r.dados.sessao, slug, organizacao: a.organizacaoId ?? slug });
    try {
      qc.setQueryData(chavesDenuncias.vista(id), await lerVista(id, null, qc));
    } catch (e) {
      esquecerSessao(id);
      return { ok: false, erro: e instanceof ErroDeLeitura && e.erro === "sessao_expirada" ? "invalido" : "indisponivel" };
    }
    return { ok: true, id };
  };

  /** Responder ao canal: pela sessão da Edge (anónima) ou pela RPC (identificada, em «As minhas»). */
  const responderComoDenunciante = async (org: string | null, id: string, texto: string, _anexos: Anexo[]): Promise<ResultadoDaAccao> => {
    const sessao = lerSessao(id);
    if (sessao) {
      const r = await chamarEdge<RespostaVistaEdge>("responder", { texto }, { sessao: sessao.token });
      if (!r.ok) {
        if (r.erro === "sessao_invalida") esquecerSessao(id);
        return falha(erroDeEdge(r.erro));
      }
      try {
        qc.setQueryData(chavesDenuncias.vista(id), vistaDaEdge(r.dados, sessao.organizacao, id));
      } catch (e) {
        captureFlowError(e instanceof FormaInvalida ? e : erroParaRegisto("responder", e), FLOW);
        void qc.invalidateQueries({ queryKey: chavesDenuncias.vista(id) });
      }
      return { ok: true };
    }
    if (!org) return falha("nao_encontrada");
    const r = await chamarRpc<VistaDenuncianteDb>("minha_responder", "rpc_denuncia_minha_responder", { p_organization_id: org, p_denuncia_id: id, p_texto: texto });
    if (!r.ok) return falha(r.erro);
    void qc.invalidateQueries({ queryKey: chavesDenuncias.vista(id) });
    void qc.invalidateQueries({ queryKey: chavesDenuncias.minhas(org) });
    return { ok: true };
  };

  return {
    confirmarRececao, mudarGravidade, atribuir, impedir, enviarMensagem, pedirInformacao, adicionarNota, concluir, arquivar, reabrir,
    verIdentidade, guardarCanal, designarResponsavel, removerResponsavel, submeter, entrar, responderComoDenunciante,
    sair: (id: string): void => {
      esquecerSessao(id);
      qc.removeQueries({ queryKey: chavesDenuncias.vista(id) });
    },
  };
}

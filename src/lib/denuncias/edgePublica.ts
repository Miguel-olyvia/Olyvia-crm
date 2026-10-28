/**
 * O cliente da Edge pública `denuncia-publica` (sem sessão do CRM): ver o canal, denunciar, entrar com código e PIN,
 * ler o acompanhamento e responder. O servidor é quem tem o segredo do PIN; o cliente nunca faz o hash.
 *
 * O QUE NUNCA SAI DAQUI
 *  - Uma denúncia ANÓNIMA vai SEM `Authorization` (só a `apikey`): não pode levar o JWT de quem tem sessão aberta, senão a
 *    Edge ficava a saber quem foi. Só a denúncia identificada feita dentro da app leva o JWT (`jwt` explícito).
 *  - A sessão do acompanhamento vive só em memória (`sessoes`): nem `localStorage`, nem `sessionStorage`, nem URL.
 *  - Nada do pedido ou da resposta (código, PIN, sessão, texto) vai para o registo de erros: quem chama só recebe o código
 *    do erro do catálogo da Edge.
 *
 * O contrato (um só para cliente, Edge e SQL; a Edge ainda não está publicada): `POST {VITE_SUPABASE_URL}/functions/v1/
 * denuncia-publica`, corpo JSON com `action`; sucesso 200 com `{ ok: true, ... }` (em `ler` e `responder`, a vista vem em
 * `denuncia`), falha com `{ "error": "<codigo>" }`, onde o código é um de `CODIGOS_PUBLICOS`
 * (`supabase/functions/denuncia-publica/erros.ts`). `ERRO_POR_CODIGO_EDGE` tem um destino explícito para cada um; o teste
 * `supabase/functions/denuncia-publica/contrato.vitest.test.ts` passa os corpos reais deste ficheiro pelo handler da Edge.
 */
import type { DadosFormulario } from "@/components/canal-denuncias/lib/formulario";
import type { ErroAcao } from "@/components/canal-denuncias/lib/acoes";
import type { Denuncia } from "@/components/canal-denuncias/lib/tipos";
import { FormaInvalida, denunciaDeVista, type VistaDenuncianteDb } from "./canal";

export const FUNCAO_EDGE = "denuncia-publica";
export const CABECALHO_SESSAO_DENUNCIA = "x-denuncia-sessao";

export type AccaoEdge = "canal" | "criar" | "entrar" | "ler" | "responder";

export type RespostaEdge<T> = { ok: true; dados: T } | { ok: false; erro: string; estado: number };

export interface OpcoesEdge {
  /** A sessão do acompanhamento (cabeçalho `x-denuncia-sessao`). */
  sessao?: string;
  /** O JWT do utilizador: só para denunciar identificado dentro da app. Nunca numa anónima. */
  jwt?: string | null;
}

const ERRO_DE_REDE = "indisponivel";

export async function chamarEdge<T>(accao: AccaoEdge, corpo: Record<string, unknown>, opcoes: OpcoesEdge = {}): Promise<RespostaEdge<T>> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${FUNCAO_EDGE}`;
  const cabecalhos: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ""),
  };
  if (opcoes.jwt) cabecalhos.Authorization = `Bearer ${opcoes.jwt}`;
  if (opcoes.sessao) cabecalhos[CABECALHO_SESSAO_DENUNCIA] = opcoes.sessao;
  try {
    const r = await fetch(url, { method: "POST", headers: cabecalhos, body: JSON.stringify({ ...corpo, action: accao }), credentials: "omit" });
    const json: unknown = await r.json().catch(() => null);
    if (r.ok && json && typeof json === "object") return { ok: true, dados: json as T };
    const erro = json && typeof json === "object" && typeof (json as { error?: unknown }).error === "string" ? (json as { error: string }).error : ERRO_DE_REDE;
    return { ok: false, erro, estado: r.status };
  } catch {
    return { ok: false, erro: ERRO_DE_REDE, estado: 0 };
  }
}

/**
 * Cada código público da Edge (`CODIGOS_PUBLICOS` em `supabase/functions/denuncia-publica/erros.ts`) e o erro do ecrã.
 * Um teste de contrato exige uma entrada para cada um: um código novo na Edge sem destino aqui parte o teste.
 */
export const ERRO_POR_CODIGO_EDGE: Readonly<Record<string, ErroAcao>> = {
  pedido_invalido: "pedido_invalido",
  corpo_demasiado_grande: "pedido_invalido",
  accao_desconhecida: "indisponivel",
  method_not_allowed: "indisponivel",
  demasiadas_tentativas: "limite",
  indisponivel: "indisponivel",
  // só existe em `entrar`, que o trata à parte («código ou PIN inválidos»)
  codigo_ou_pin_invalido: "nao_encontrada",
  sessao_invalida: "sessao_expirada",
  canal_inativo: "canal_inativo",
  texto_vazio: "texto_vazio",
  fechada: "fechada",
  anexos_indisponiveis: "indisponivel",
  erro_inesperado: "indisponivel",
};

/** O erro do ecrã para um código de erro da Edge. O que não se conhece (ou uma falha de rede) é «indisponivel». */
export function erroDeEdge(codigo: string): ErroAcao {
  return Object.prototype.hasOwnProperty.call(ERRO_POR_CODIGO_EDGE, codigo) ? ERRO_POR_CODIGO_EDGE[codigo] : "indisponivel";
}

/** A resposta da Edge em `ler` e `responder`: `{ ok: true, denuncia: <vista do denunciante> }`. */
export interface RespostaVistaEdge { denuncia?: unknown }

/** Desembrulha a vista do envelope da Edge; sem ela é uma forma inválida (um defeito, que quem chama reporta). */
export function vistaDaEdge(r: RespostaVistaEdge | null | undefined, organizacao: string, id: string): Denuncia {
  const v = r?.denuncia;
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new FormaInvalida("denuncia");
  return denunciaDeVista(v as VistaDenuncianteDb, organizacao, id);
}

/** O corpo de `criar`. Uma denúncia anónima NUNCA leva a identidade, mesmo que o formulário a tenha preenchida. */
export function corpoDeCriacao(f: DadosFormulario, slug: string): Record<string, unknown> {
  const identificada = f.anonima === false;
  return {
    slug,
    modo: identificada ? "identificada" : "anonima",
    tipo: f.tipo === "" ? "outro" : f.tipo,
    descricao: f.descricao.trim(),
    quando: f.quando.trim(),
    ainda_acontece: f.aindaAcontece,
    onde: f.onde.trim(),
    envolvidos: f.envolvidos.trim(),
    testemunhas: f.testemunhas,
    ja_reportado: f.jaReportado.trim(),
    boa_fe: f.boaFe,
    ...(identificada
      ? { identidade: { nome: f.nome.trim(), email: f.email.trim(), telefone: f.telefone.trim(), pode_contactar: f.podemContactar, so_responsavel: f.soResponsavel } }
      : {}),
  };
}

// --------------------------------------------------------------------------- sessões do acompanhamento (só em memória)

export interface SessaoAcompanhamento {
  token: string;
  slug: string;
  /** A organização de onde se entrou (para a vista), ou o próprio slug na página pública. */
  organizacao: string;
}

const sessoes = new Map<string, SessaoAcompanhamento>();

export const guardarSessao = (id: string, s: SessaoAcompanhamento): void => void sessoes.set(id, s);
export const lerSessao = (id: string): SessaoAcompanhamento | undefined => sessoes.get(id);
export const esquecerSessao = (id: string): void => void sessoes.delete(id);
export const esquecerTodasAsSessoes = (): void => sessoes.clear();

/**
 * O store das ADMISSÕES de exemplo, à parte do das fichas (`loja.ts`): uma admissão por pessoa em admissão, em memória.
 * Recarregar a página repõe tudo e `repor()` das fichas repõe também este (registado em `registarAoRepor`); `reporAdmissao()`
 * repõe só este. Nada aqui fala com lado nenhum. As regras vivem em `lib/admissaoFluxo.ts` (puras); aqui só se guarda o resultado.
 */
import { agoraExemplo } from "@/components/rh-exemplo/dados/hojeExemplo";
import { useSyncExternalStore } from "react";
import { criarAdmissoesIniciais, type EstadoAdmissoes } from "@/components/rh-exemplo/dados/admissaoExemplo";
import { lerEstado, registarAoRepor } from "@/components/rh-exemplo/dados/loja";
import {
  aplicar, estadoVisivel, type AcaoAdmissao, type Admissao, type EntradaAdmissao, type EstadoVisivel, type ResultadoAdmissao,
} from "@/components/rh-exemplo/lib/admissaoFluxo";

let estado: EstadoAdmissoes = criarAdmissoesIniciais(lerEstado());
const ouvintes = new Set<() => void>();

function avisar(): void {
  ouvintes.forEach((ouvinte) => ouvinte());
}

export function lerAdmissoes(): EstadoAdmissoes {
  return estado;
}

export function subscreverAdmissoes(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

/** Substitui o estado por uma cópia alterada (nunca se muta o estado actual). */
export function definirAdmissoes(alterar: (actual: EstadoAdmissoes) => EstadoAdmissoes): void {
  estado = alterar(estado);
  avisar();
}

/** Volta às admissões de exemplo originais, a partir das fichas actuais. */
export function reporAdmissao(): void {
  estado = criarAdmissoesIniciais(lerEstado());
  avisar();
}

registarAoRepor(reporAdmissao);

export function useAdmissoes<T>(selector: (e: EstadoAdmissoes) => T): T {
  return useSyncExternalStore(subscreverAdmissoes, () => selector(estado), () => selector(estado));
}

/** A admissão de uma pessoa (ou `null` se não está em admissão). */
export function useAdmissao(pessoaId: string | null | undefined): Admissao | null {
  return useAdmissoes((e) => (pessoaId ? (e.porPessoa[pessoaId] ?? null) : null));
}

/** Um token novo e distinto de todos os anteriores (de exemplo: não é um segredo). */
export function novoTokenAdmissao(): string {
  estado = { ...estado, contador: estado.contador + 1 };
  return `tk-${estado.contador}-${Date.now().toString(36)}`;
}

/** A admissão a que um token pertence, e se o token ainda é o link em vigor (e não um que foi substituído). */
export function procurarPorToken(e: EstadoAdmissoes, token: string | undefined): { admissao: Admissao | null; atual: boolean } {
  if (!token) return { admissao: null, atual: false };
  for (const adm of Object.values(e.porPessoa)) {
    if (adm.login.token === token) return { admissao: adm, atual: true };
    if (adm.login.anteriores.includes(token)) return { admissao: adm, atual: false };
  }
  return { admissao: null, atual: false };
}

export function admissaoPorToken(token: string | undefined): { admissao: Admissao | null; atual: boolean } {
  return procurarPorToken(estado, token);
}

/** Substitui uma admissão no store (e acrescenta-a à lista se for nova). */
export function gravarAdmissao(adm: Admissao): void {
  definirAdmissoes((e) => ({
    ...e,
    porPessoa: { ...e.porPessoa, [adm.pessoaId]: adm },
    ordem: e.ordem.includes(adm.pessoaId) ? e.ordem : [...e.ordem, adm.pessoaId],
  }));
}

/** Corre uma ação da máquina de estados sobre a admissão de uma pessoa e guarda o resultado se for válido. */
export function executarAdmissao(
  pessoaId: string, acao: Exclude<AcaoAdmissao, "convidar">, entrada: EntradaAdmissao, quem: string,
): ResultadoAdmissao {
  const atual = estado.porPessoa[pessoaId];
  if (!atual) return { ok: false, erro: "transicao_invalida" };
  const resultado = aplicar(atual, acao, entrada, { agora: agoraExemplo(), quem, novoToken: novoTokenAdmissao });
  if (resultado.ok) gravarAdmissao(resultado.admissao);
  return resultado;
}

/** O estado que se mostra de uma pessoa (com «expirado» derivado do prazo), ou `null` se não está em admissão. */
export function useEstadoAdmissao(pessoaId: string | null | undefined): EstadoVisivel | null {
  const adm = useAdmissao(pessoaId);
  return adm ? estadoVisivel(adm, agoraExemplo()) : null;
}

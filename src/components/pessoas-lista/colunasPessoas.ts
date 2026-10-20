// As colunas da Lista real que a pessoa pode escolher e ordenar, e a preferência guardada POR ORGANIZAÇÃO (localStorage).
// «Pessoa» (o nome) é sempre a primeira e está sempre visível. Uma coluna `temDado: false` existiria no catálogo mas não apareceria no
// diálogo nem na tabela; hoje todas têm dado. A localidade saiu da Lista (decisão do utilizador, 20/10): fica só na ficha.
import type { IdColuna } from "@/components/pessoas/vistaLinhaPessoa";

export interface DefColuna {
  id: IdColuna;
  /** Peso da largura (as larguras reais são estes pesos normalizados para 100). */
  largura: number;
  temDado: boolean;
  visivelPorOmissao: boolean;
}

/** Por ordem de omissão. */
export const CATALOGO: readonly DefColuna[] = [
  { id: "person", largura: 22, temDado: true, visivelPorOmissao: true },
  { id: "stage", largura: 12, temDado: true, visivelPorOmissao: true },
  { id: "form", largura: 11, temDado: true, visivelPorOmissao: true },
  { id: "lastContact", largura: 12, temDado: true, visivelPorOmissao: true },
  { id: "next", largura: 12, temDado: true, visivelPorOmissao: true },
  { id: "nextVisit", largura: 11, temDado: true, visivelPorOmissao: true },
  { id: "value", largura: 8, temDado: true, visivelPorOmissao: true },
  { id: "deals", largura: 12, temDado: true, visivelPorOmissao: true },
  { id: "assigned", largura: 11, temDado: true, visivelPorOmissao: true },
  { id: "phone", largura: 10, temDado: true, visivelPorOmissao: true },
  { id: "email", largura: 14, temDado: true, visivelPorOmissao: true },
  { id: "whatsapp", largura: 9, temDado: true, visivelPorOmissao: true },
  { id: "created", largura: 9, temDado: true, visivelPorOmissao: true },
  { id: "origin", largura: 9, temDado: true, visivelPorOmissao: false },
  { id: "campaign", largura: 11, temDado: true, visivelPorOmissao: false },
];

const DISPONIVEIS = CATALOGO.filter((c) => c.temDado);
const POR_ID = new Map(CATALOGO.map((c) => [c.id, c]));
const VERSAO = 1;
const PRIMEIRA: IdColuna = "person";

export interface EscolhaColuna {
  id: IdColuna;
  visivel: boolean;
}

export const chaveColunas = (organizationId: string): string => `pessoas.colunas.${organizationId}`;

export const escolhaPorOmissao = (): EscolhaColuna[] => DISPONIVEIS.map((c) => ({ id: c.id, visivel: c.visivelPorOmissao }));

const eRegisto = (valor: unknown): valor is Record<string, unknown> => typeof valor === "object" && valor !== null && !Array.isArray(valor);

/** Lê a escolha guardada. Lixo, versão antiga ou armazenamento indisponível voltam à omissão; o que falta entra escondido e no fim. */
export function lerColunas(organizationId: string | null): EscolhaColuna[] {
  if (organizationId === null) return escolhaPorOmissao();
  try {
    const bruto: unknown = JSON.parse(window.localStorage.getItem(chaveColunas(organizationId)) ?? "null");
    if (!eRegisto(bruto) || bruto.v !== VERSAO || !Array.isArray(bruto.colunas)) return escolhaPorOmissao();
    const vistas = new Set<IdColuna>();
    const lidas: EscolhaColuna[] = [];
    for (const item of bruto.colunas as unknown[]) {
      if (!eRegisto(item)) continue;
      const def = DISPONIVEIS.find((c) => c.id === item.id);
      if (!def || vistas.has(def.id)) continue;
      vistas.add(def.id);
      lidas.push({ id: def.id, visivel: typeof item.visivel === "boolean" ? item.visivel : def.visivelPorOmissao });
    }
    for (const def of DISPONIVEIS) if (!vistas.has(def.id)) lidas.push({ id: def.id, visivel: false });
    // O nome é sempre a primeira coluna e sempre visível.
    return [{ id: PRIMEIRA, visivel: true }, ...lidas.filter((c) => c.id !== PRIMEIRA)];
  } catch {
    return escolhaPorOmissao();
  }
}

export function guardarColunas(organizationId: string | null, escolha: readonly EscolhaColuna[]): void {
  if (organizationId === null) return;
  try {
    window.localStorage.setItem(chaveColunas(organizationId), JSON.stringify({ v: VERSAO, colunas: escolha }));
  } catch {
    // sem armazenamento: a escolha vale só para esta visita
  }
}

/** «Repor padrão»: apaga a preferência desta organização e devolve a omissão. */
export function reporColunas(organizationId: string | null): EscolhaColuna[] {
  if (organizationId !== null) {
    try {
      window.localStorage.removeItem(chaveColunas(organizationId));
    } catch {
      // sem armazenamento: nada a apagar
    }
  }
  return escolhaPorOmissao();
}

export function alternarColuna(escolha: readonly EscolhaColuna[], id: IdColuna): EscolhaColuna[] {
  if (id === PRIMEIRA) return [...escolha];
  return escolha.map((c) => (c.id === id ? { ...c, visivel: !c.visivel } : c));
}

/** Põe a coluna no índice pedido (fica entre o 1 e o último: o 0 é do nome). Usado pelo arrastar e pelos botões Subir e Descer. */
export function moverParaIndice(escolha: readonly EscolhaColuna[], id: IdColuna, indice: number): EscolhaColuna[] {
  const atual = escolha.find((c) => c.id === id);
  if (!atual || id === PRIMEIRA) return [...escolha];
  const resto = escolha.filter((c) => c.id !== id);
  const destino = Math.min(Math.max(indice, 1), resto.length);
  return [...resto.slice(0, destino), atual, ...resto.slice(destino)];
}

export function moverColuna(escolha: readonly EscolhaColuna[], id: IdColuna, delta: number): EscolhaColuna[] {
  const i = escolha.findIndex((c) => c.id === id);
  return i < 0 ? [...escolha] : moverParaIndice(escolha, id, i + delta);
}

export const colunasVisiveis = (escolha: readonly EscolhaColuna[]): IdColuna[] => escolha.filter((c) => c.visivel).map((c) => c.id);

/** A largura em percentagem de cada coluna escolhida, somando 100. */
export function larguras(colunas: readonly IdColuna[]): Record<IdColuna, number> {
  const total = colunas.reduce((soma, id) => soma + (POR_ID.get(id)?.largura ?? 0), 0) || 1;
  return Object.fromEntries(colunas.map((id) => [id, ((POR_ID.get(id)?.largura ?? 0) / total) * 100])) as Record<IdColuna, number>;
}

/** As colunas visíveis por omissão, por ordem (estável: serve de valor por omissão a linhas e tabela em memória). */
export const COLUNAS_POR_OMISSAO: readonly IdColuna[] = colunasVisiveis(escolhaPorOmissao());

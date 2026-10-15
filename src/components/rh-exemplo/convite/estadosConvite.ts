/**
 * Os oito estados da página pública do convite de admissão, pela ordem do fluxo, cada um com o token de demonstração que
 * o ilustra e a pessoa de exemplo a quem pertence. Os tokens são os de `admissaoExemplo.ts`. O texto de cada estado
 * (nome e o que a pessoa vê) vive em `rhAdmIdx.e.<chave>.*`.
 */
export const ESTADOS_CONVITE = [
  { chave: "enviado", token: "lara", pessoa: "Lara Mendes" },
  { chave: "preencher", token: "exemplo", pessoa: "Beatriz Lopes" },
  { chave: "devolvida", token: "devolvida", pessoa: "Nádia Coelho" },
  { chave: "submetida", token: "submetida", pessoa: "Marco Ventura" },
  { chave: "contrato", token: "contrato", pessoa: "Vasco Duarte" },
  { chave: "assinado", token: "assinado", pessoa: "Eva Tavares" },
  { chave: "expirada", token: "expirada", pessoa: "Rúben Faria" },
  { chave: "revogada", token: "revogada", pessoa: "Lara Mendes" },
] as const;

export type EstadoConvite = (typeof ESTADOS_CONVITE)[number];

export const CAMINHO_INDICE_CONVITES = "/rh-exemplo/admissao";

export const caminhoDoConvite = (token: string): string => `${CAMINHO_INDICE_CONVITES}/${token}`;

/** O estado de um token de demonstração, com o anterior e o seguinte (`null` nas pontas); `null` se o token não é de demonstração. */
export function vizinhosDoEstado(token: string | undefined): { atual: EstadoConvite; anterior: EstadoConvite | null; seguinte: EstadoConvite | null; posicao: number } | null {
  const i = ESTADOS_CONVITE.findIndex((e) => e.token === token);
  if (i < 0) return null;
  return { atual: ESTADOS_CONVITE[i], anterior: ESTADOS_CONVITE[i - 1] ?? null, seguinte: ESTADOS_CONVITE[i + 1] ?? null, posicao: i + 1 };
}

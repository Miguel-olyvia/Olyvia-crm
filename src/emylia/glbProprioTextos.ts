// 27/11: os textos do GLB próprio nos ecrãs de gestão do Catálogo (Categorias, Subcategorias e Modelos): o chip da linha, o texto alternativo da pré-visualização e as frases das
// confirmações. Funções puras, em português, sem React. O formato dos números é fixo (não depende do ICU do ambiente): «1,2 MB» e «12 345».

/** O nível onde o GLB próprio se carrega. `categoria` e `subcategoria` são a mesma tabela na base; o texto distingue-as. */
export type NivelGlb = "categoria" | "subcategoria" | "modelo";

/** «12 345». */
export const milhares = (n: number): string => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** O tamanho de um ficheiro: «1,2 MB» (sem «,0»), e abaixo de 100 KB em KB (nunca «0 MB»; no mínimo 1 KB). */
export function tamanhoGlb(bytes: number): string {
  if (bytes < 100 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "").replace(".", ",")} MB`;
}

/** O chip de uma linha: «GLB · 1,2 MB», «GLB» (há ficheiro e a leitura não trouxe o tamanho) ou «Sem GLB» (também se a leitura não tem a chave: migração por aplicar). */
export function chipGlb(caminho: string | null | undefined, bytes: number | null | undefined): string {
  if (!caminho) return "Sem GLB";
  return typeof bytes === "number" ? `GLB · ${tamanhoGlb(bytes)}` : "GLB";
}

/** O que a pré-visualização mostra, em texto, para quem não vê o 3D: triângulos, tamanho e materiais (só o que se sabe: do ficheiro já guardado só se sabe o tamanho). */
export function textoAlternativoGlb({ nome, triangulos, bytes, materiais }: { nome: string; triangulos?: number; bytes?: number | null; materiais?: readonly string[] }): string {
  const partes: string[] = [];
  if (typeof triangulos === "number") partes.push(`${milhares(triangulos)} ${triangulos === 1 ? "triângulo" : "triângulos"}`);
  if (typeof bytes === "number") partes.push(tamanhoGlb(bytes));
  if (materiais) partes.push(materiais.length > 0 ? `materiais: ${materiais.join(", ")}` : "sem materiais com nome");
  return `Pré-visualização do modelo 3D próprio de «${nome}»${partes.length > 0 ? `: ${partes.join(", ")}` : ""}.`;
}

/** Quem vence o GLB deste nível: o que está mais perto do produto (a regra de modelos3dEscolha.ts: produto, Modelo, subcategoria, categoria). */
const MAIS_PERTO: Record<NivelGlb, string> = {
  categoria: "a subcategoria, o modelo ou o próprio produto",
  subcategoria: "o modelo ou o próprio produto",
  modelo: "o próprio produto",
};
const ESTE: Record<NivelGlb, string> = { categoria: "Esta categoria", subcategoria: "Esta subcategoria", modelo: "Este modelo" };

/**
 * Quantos produtos usam este nível e o que isso quer dizer para o GLB: o número só se diz quando a página o sabe (`usados` null ou em falta: «pode estar a ser usada»), e lembra
 * que onde o nível mais perto do produto já tem escolha própria, essa vence.
 */
export function fraseDoUso(nivel: NivelGlb, usados: number | null | undefined): string {
  const este = ESTE[nivel], perto = MAIS_PERTO[nivel], usada = nivel === "modelo" ? "usado" : "usada";
  if (typeof usados !== "number") return `${este} pode estar a ser ${usada} por produtos: o 3D deles muda, exceto onde ${perto} já tenha escolha.`;
  if (usados === 0) return `Nenhum produto usa ${este.toLowerCase()} neste momento.`;
  return `${este} é ${usada} por ${usados} produto${usados === 1 ? "" : "s"}: o 3D ${usados === 1 ? "dele" : "deles"} muda, exceto onde ${perto} já tenha escolha.`;
}

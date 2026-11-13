// Protótipo (visualizador 3D): a FONTE dos atributos de um produto (Medida, Cor, Nº de cubas, Material…) para o Configurador de famílias.
//
// NA BASE REAL: `atributosDoProduto` passa a LER os atributos do produto (o EAV da base principal: um valor por atributo do produto) em vez de os adivinhar do nome.
// NADA MAIS MUDA: todo o configurador (passo «Atributos dos produtos», eixos de cor e de medida, rótulos, variantes, nome da família) só consome esta função.
// Uma família só AGRUPA produtos que já existem: nenhum atributo se escreve no configurador; se um produto não tem um atributo, corrige-se no produto do catálogo.
//
// NO PROTÓTIPO o catálogo de exemplo não tem campos de atributos, por isso derivam-se do que o produto já tem (nome e subtipo), reutilizando o palpite de medida e de
// acabamento de configurador.ts. Só se devolvem atributos que se reconhecem: nada se inventa (sem medida no nome, não há «Medida»).
import { palpiteDoProduto } from "./configurador";

/** O mínimo que se lê de um produto do catálogo (um `Produto` de v2/catalogoModelo.ts serve). */
export interface ProdutoParaAtributos { n: string; sku?: string; sub?: string; marca?: string }

const plano = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Os materiais que o nome ou o subtipo costumam trazer (palavra inteira, sem acentos) e como se mostram. */
const MATERIAIS: readonly { re: RegExp; nome: string }[] = [
  { re: /\binox(idavel)?\b/, nome: "Inox" }, { re: /\bgranito\b/, nome: "Granito" }, { re: /\bcomposito\b/, nome: "Compósito" }, { re: /\bsilgranit\b/, nome: "Silgranit" },
  { re: /\bresinas?\b/, nome: "Resina" }, { re: /\bvidro\b/, nome: "Vidro" }, { re: /\blat(ao|on)\b/, nome: "Latão" }, { re: /\baco\b/, nome: "Aço" },
];
const CUBAS = /(\d+(?:[.,]\d+)?)\s*cubas?\b/;

/** Os atributos de um produto: nome do atributo → valor (texto). Função pura; ver o topo do ficheiro sobre a base real. */
export function atributosDoProduto(produto: ProdutoParaAtributos): Record<string, string> {
  const nome = produto.n.replace(/\s+/g, " ").trim(), sub = produto.sub?.trim() ?? "", texto = plano(`${nome} ${sub}`);
  const palpite = palpiteDoProduto(nome, { sub });
  const cubas = CUBAS.exec(plano(nome))?.[1]?.replace(".", ","), material = MATERIAIS.find((m) => m.re.test(texto))?.nome;
  const r: Record<string, string> = {};
  if (palpite.medida !== "Única") r.Medida = palpite.medida;
  if (palpite.acabamento !== "Padrão" && palpite.acabamento.trim()) r.Cor = palpite.acabamento.trim();
  if (cubas) r["Nº de cubas"] = `${cubas} ${Number(cubas.replace(",", ".")) === 1 ? "cuba" : "cubas"}`;
  if (material) r.Material = material;
  return r;
}

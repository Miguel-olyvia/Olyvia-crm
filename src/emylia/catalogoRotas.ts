// 17/11: o Catálogo tem páginas próprias (menu lateral, /catalogo/…). Os caminhos vivem aqui, num sítio só, e o endereço antigo
// (/catalogo-custos?sec=…&servico=…) traduz-se para eles (RedirectCatalogo).
import type { SeparadorGestao } from "./GestaoCatalogo";

export type SeccaoCatalogo = "servicos" | "produtos" | "equipamentos" | "consumiveis" | "tecnicos" | "ligacoes";
export type TipoCatalogo = "servico" | "produto" | "equipamento" | "consumivel" | "tecnico";

/** O que a rota diz ao Catálogo: a secção aberta, a ficha aberta (se houver) e como navegar (o router é de quem monta a página). */
export interface RotaCatalogo {
  seccao: SeccaoCatalogo;
  produto?: string;
  servico?: string;
  ir: (caminho: string, op?: { substituir?: boolean }) => void;
}

export const CAMINHO_SECCAO: Record<SeccaoCatalogo, string> = {
  servicos: "/catalogo/servicos",
  produtos: "/catalogo/produtos",
  equipamentos: "/catalogo/servicos/equipamentos",
  consumiveis: "/catalogo/servicos/consumiveis",
  tecnicos: "/catalogo/servicos/tecnicos",
  ligacoes: "/catalogo/ligacoes",
};

export const CAMINHO_GESTAO: Record<SeparadorGestao, string> = {
  categorias: "/catalogo/produtos/categorias",
  subcategorias: "/catalogo/produtos/subcategorias",
  modelos: "/catalogo/produtos/modelos",
  marcas: "/catalogo/produtos/marcas",
  atributos: "/catalogo/produtos/atributos",
  sku: "/catalogo/produtos/referencia",
};

/** Para onde leva um link ao Catálogo sem mais indicações (o separador que a página antiga abria por omissão). */
export const CATALOGO_ENTRADA = CAMINHO_SECCAO.servicos;

export const caminhoProduto = (id: string): string => `${CAMINHO_SECCAO.produtos}/${encodeURIComponent(id)}`;
export const caminhoServico = (id: string): string => `${CAMINHO_SECCAO.servicos}/${encodeURIComponent(id)}`;

const SECCAO_DO_TIPO: Record<TipoCatalogo, SeccaoCatalogo> = { servico: "servicos", produto: "produtos", equipamento: "equipamentos", consumivel: "consumiveis", tecnico: "tecnicos" };
const E_SECCAO = (v: string | null): v is SeccaoCatalogo => v !== null && Object.prototype.hasOwnProperty.call(CAMINHO_SECCAO, v);
const E_TIPO = (v: string | null): v is TipoCatalogo => v !== null && Object.prototype.hasOwnProperty.call(SECCAO_DO_TIPO, v);
/** O valor de ?atributos= (o «1» é o endereço mais antigo da gestão e abre os Atributos; «sku» é a página «referencia»). */
const SEPARADOR_DO_PARAMETRO: Record<string, SeparadorGestao> = { "1": "atributos", atributos: "atributos", categorias: "categorias", subcategorias: "subcategorias", modelos: "modelos", marcas: "marcas", sku: "sku" };
const PARAMETROS_DO_CATALOGO = ["sec", "servico", "produto", "consumivel", "criar", "atributos"];

/**
 * O endereço antigo, /catalogo-custos?…, traduzido para a rota nova (caminho e pesquisa). A ordem é a da página antiga: a gestão, o Criar,
 * a ficha do serviço, a do produto, a do consumível e, por fim, a secção. Valores que a página não conhecia ignoram-se. Os parâmetros
 * que não são do Catálogo seguem para o destino.
 */
export function destinoCatalogoAntigo(search: string): string {
  const p = new URLSearchParams(search);
  const resto = new URLSearchParams(p);
  PARAMETROS_DO_CATALOGO.forEach((k) => resto.delete(k));
  const com = (caminho: string, extra?: Record<string, string>): string => {
    const q = new URLSearchParams(resto);
    Object.entries(extra ?? {}).forEach(([k, v]) => q.set(k, v));
    const s = q.toString();
    return s ? `${caminho}?${s}` : caminho;
  };

  const separador = SEPARADOR_DO_PARAMETRO[p.get("atributos") ?? ""];
  if (separador) return com(CAMINHO_GESTAO[separador]);

  const sec = p.get("sec");
  const criar = p.get("criar");
  if (E_TIPO(criar)) return com(E_SECCAO(sec) ? CAMINHO_SECCAO[sec] : CAMINHO_SECCAO[SECCAO_DO_TIPO[criar]], { criar });

  const servico = p.get("servico");
  if (servico) return com(caminhoServico(servico));
  const produto = p.get("produto");
  if (produto) return com(caminhoProduto(produto));
  const consumivel = p.get("consumivel");
  if (consumivel) return com(CAMINHO_SECCAO.consumiveis, { consumivel });

  return com(E_SECCAO(sec) ? CAMINHO_SECCAO[sec] : CATALOGO_ENTRADA);
}

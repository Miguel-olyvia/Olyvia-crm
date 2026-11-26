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

/** 17/11: as secções de Serviços leem o Catálogo LEVE (cat_ler_catalogo_servicos). Os Produtos têm a página própria (paginada); sem rota, inteira.
 *  23/11: as Ligações também (a leitura inteira, ~29 600 produtos, dava statement timeout): os produtos entram no mapa pelo servidor (real/ligacoesServidor.ts). */
export const usaLeituraLeve = (seccao: SeccaoCatalogo | undefined): boolean => !!seccao && seccao !== "produtos";

export const CAMINHO_SECCAO: Record<SeccaoCatalogo, string> = {
  servicos: "/catalogo/servicos",
  produtos: "/catalogo/produtos",
  equipamentos: "/catalogo/servicos/equipamentos",
  consumiveis: "/catalogo/servicos/consumiveis",
  tecnicos: "/catalogo/servicos/tecnicos",
  ligacoes: "/catalogo/servicos/ligacoes",
};

/** As duas páginas do menu lateral. Dentro de cada uma a navegação faz-se por separadores (SeparadoresCatalogo), e cada separador é uma rota. */
export type GrupoCatalogo = "produtos" | "servicos";
export interface SeparadorCatalogo { chave: string; rotulo: string; to: string }
export const grupoDaSeccao = (s: SeccaoCatalogo): GrupoCatalogo => (s === "produtos" ? "produtos" : "servicos");
/** A lista (e as fichas, que abrem dentro dela) é o separador «lista»; as outras secções têm o separador com o seu nome. */
export const separadorDaSeccao = (s: SeccaoCatalogo): string => (s === "produtos" || s === "servicos" ? "lista" : s);

export const CAMINHO_GESTAO: Record<SeparadorGestao, string> = {
  categorias: "/catalogo/produtos/categorias",
  subcategorias: "/catalogo/produtos/subcategorias",
  modelos: "/catalogo/produtos/modelos",
  marcas: "/catalogo/produtos/marcas",
  atributos: "/catalogo/produtos/atributos",
  sku: "/catalogo/produtos/referencia",
};

/** O configurador de famílias: não é uma página de gestão (não entra em SeparadorGestao nem em CAMINHO_GESTAO), por isso o caminho vai à parte. */
export const CAMINHO_FAMILIAS = "/catalogo/produtos/familias";
/** 26/11: a vista de uma família com 3D (a rota tem mais um segmento que /catalogo/produtos/:id, por isso não colide com a ficha do produto). */
export const caminhoFamilia = (id: string): string => `${CAMINHO_FAMILIAS}/${encodeURIComponent(id)}`;

/** O id do separador (para o `aria-labelledby` do painel). */
export const idSeparadorCatalogo = (chave: string): string => `tab-cat-${chave}`;

export const SEPARADORES_CATALOGO: Record<GrupoCatalogo, readonly SeparadorCatalogo[]> = {
  produtos: [
    { chave: "lista", rotulo: "Lista", to: CAMINHO_SECCAO.produtos },
    { chave: "categorias", rotulo: "Categorias", to: CAMINHO_GESTAO.categorias },
    { chave: "subcategorias", rotulo: "Subcategorias", to: CAMINHO_GESTAO.subcategorias },
    { chave: "modelos", rotulo: "Modelos", to: CAMINHO_GESTAO.modelos },
    { chave: "marcas", rotulo: "Marcas", to: CAMINHO_GESTAO.marcas },
    { chave: "atributos", rotulo: "Atributos", to: CAMINHO_GESTAO.atributos },
    { chave: "sku", rotulo: "Referência (SKU)", to: CAMINHO_GESTAO.sku },
    { chave: "familias", rotulo: "Famílias", to: CAMINHO_FAMILIAS },
  ],
  servicos: [
    { chave: "lista", rotulo: "Lista", to: CAMINHO_SECCAO.servicos },
    { chave: "equipamentos", rotulo: "Equipamentos", to: CAMINHO_SECCAO.equipamentos },
    { chave: "consumiveis", rotulo: "Consumíveis", to: CAMINHO_SECCAO.consumiveis },
    { chave: "tecnicos", rotulo: "Técnicos", to: CAMINHO_SECCAO.tecnicos },
    { chave: "ligacoes", rotulo: "Ligações", to: CAMINHO_SECCAO.ligacoes },
  ],
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
  // 18/11: criar um PRODUTO faz-se sempre na página de Produtos (a leitura de Serviços não traz os modelos nem os atributos), seja qual for ?sec=
  if (E_TIPO(criar)) return com(criar === "produto" ? CAMINHO_SECCAO.produtos : E_SECCAO(sec) ? CAMINHO_SECCAO[sec] : CAMINHO_SECCAO[SECCAO_DO_TIPO[criar]], { criar });

  const servico = p.get("servico");
  if (servico) return com(caminhoServico(servico));
  const produto = p.get("produto");
  if (produto) return com(caminhoProduto(produto));
  const consumivel = p.get("consumivel");
  if (consumivel) return com(CAMINHO_SECCAO.consumiveis, { consumivel });

  return com(E_SECCAO(sec) ? CAMINHO_SECCAO[sec] : CATALOGO_ENTRADA);
}

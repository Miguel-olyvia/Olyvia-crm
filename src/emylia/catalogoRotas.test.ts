// 17/11: o Catálogo passa a ter páginas (menu lateral). O endereço antigo (/catalogo-custos?sec=…&servico=…) traduz-se para as rotas novas.
import { describe, expect, it } from "vitest";
import { CAMINHO_GESTAO, CAMINHO_SECCAO, caminhoProduto, caminhoServico, destinoCatalogoAntigo, grupoDaSeccao, separadorDaSeccao } from "./catalogoRotas";

describe("destinoCatalogoAntigo: cada parâmetro do endereço antigo vai para a rota certa", () => {
  it("sem parâmetros abre os Serviços (o separador de sempre)", () => {
    expect(destinoCatalogoAntigo("")).toBe("/catalogo/servicos");
  });
  it.each([
    ["servicos", "/catalogo/servicos"], ["produtos", "/catalogo/produtos"], ["equipamentos", "/catalogo/servicos/equipamentos"],
    ["consumiveis", "/catalogo/servicos/consumiveis"], ["tecnicos", "/catalogo/servicos/tecnicos"], ["ligacoes", "/catalogo/servicos/ligacoes"],
  ])("?sec=%s -> %s", (sec, rota) => {
    expect(destinoCatalogoAntigo(`?sec=${sec}`)).toBe(rota);
  });
  it("?servico= abre a ficha do serviço", () => {
    expect(destinoCatalogoAntigo("?servico=ponto-agua")).toBe("/catalogo/servicos/ponto-agua");
  });
  it("?produto= abre a ficha do produto, e o id vai codificado", () => {
    expect(destinoCatalogoAntigo("?produto=abc-123")).toBe("/catalogo/produtos/abc-123");
    expect(destinoCatalogoAntigo("?produto=a%2Fb")).toBe("/catalogo/produtos/a%2Fb");
  });
  it("?consumivel= abre os Consumíveis com a ficha aberta (continua no endereço)", () => {
    expect(destinoCatalogoAntigo("?consumivel=Cola")).toBe("/catalogo/servicos/consumiveis?consumivel=Cola");
  });
  it.each([
    ["servico", "/catalogo/servicos"], ["produto", "/catalogo/produtos"], ["equipamento", "/catalogo/servicos/equipamentos"],
    ["consumivel", "/catalogo/servicos/consumiveis"], ["tecnico", "/catalogo/servicos/tecnicos"],
  ])("?criar=%s abre o Criar na secção desse tipo", (tipo, rota) => {
    expect(destinoCatalogoAntigo(`?criar=${tipo}`)).toBe(`${rota}?criar=${tipo}`);
  });
  it("?criar= com ?sec= fica na secção pedida", () => {
    expect(destinoCatalogoAntigo("?sec=produtos&criar=servico")).toBe("/catalogo/produtos?criar=servico");
  });
  it.each([
    ["1", "atributos"], ["atributos", "atributos"], ["categorias", "categorias"], ["subcategorias", "subcategorias"],
    ["modelos", "modelos"], ["marcas", "marcas"], ["sku", "referencia"],
  ])("?atributos=%s -> gestão %s", (valor, pagina) => {
    expect(destinoCatalogoAntigo(`?atributos=${valor}`)).toBe(`/catalogo/produtos/${pagina}`);
  });
  it("a ordem de prioridade é a da página antiga: gestão, criar, serviço, produto, consumível, secção", () => {
    expect(destinoCatalogoAntigo("?atributos=marcas&criar=produto&servico=x&produto=y&sec=ligacoes")).toBe("/catalogo/produtos/marcas");
    expect(destinoCatalogoAntigo("?criar=produto&servico=x&produto=y")).toBe("/catalogo/produtos?criar=produto");
    expect(destinoCatalogoAntigo("?servico=x&produto=y&consumivel=z&sec=ligacoes")).toBe("/catalogo/servicos/x");
    expect(destinoCatalogoAntigo("?produto=y&consumivel=z")).toBe("/catalogo/produtos/y");
    expect(destinoCatalogoAntigo("?consumivel=z&sec=ligacoes")).toBe("/catalogo/servicos/consumiveis?consumivel=z");
  });
  it("valores que a página não conhece são ignorados, como antes", () => {
    expect(destinoCatalogoAntigo("?sec=xpto")).toBe("/catalogo/servicos");
    expect(destinoCatalogoAntigo("?atributos=xpto&sec=tecnicos")).toBe("/catalogo/servicos/tecnicos");
    expect(destinoCatalogoAntigo("?criar=xpto&sec=produtos")).toBe("/catalogo/produtos");
    expect(destinoCatalogoAntigo("?servico=&produto=")).toBe("/catalogo/servicos");
  });
  it("os parâmetros que não são do Catálogo seguem para o destino", () => {
    expect(destinoCatalogoAntigo("?sec=produtos&utm=x")).toBe("/catalogo/produtos?utm=x");
  });
});

describe("os caminhos das rotas", () => {
  it("cada secção e cada página de gestão têm o seu caminho", () => {
    expect(CAMINHO_SECCAO.ligacoes).toBe("/catalogo/servicos/ligacoes");
    expect(grupoDaSeccao("ligacoes")).toBe("servicos");
    expect(grupoDaSeccao("produtos")).toBe("produtos");
    expect(separadorDaSeccao("produtos")).toBe("lista");
    expect(separadorDaSeccao("servicos")).toBe("lista");
    expect(separadorDaSeccao("tecnicos")).toBe("tecnicos");
    expect(CAMINHO_GESTAO.sku).toBe("/catalogo/produtos/referencia");
    expect(CAMINHO_GESTAO.atributos).toBe("/catalogo/produtos/atributos");
    expect(caminhoProduto("a b")).toBe("/catalogo/produtos/a%20b");
    expect(caminhoServico("s1")).toBe("/catalogo/servicos/s1");
  });
});

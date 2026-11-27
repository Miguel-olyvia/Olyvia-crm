// 27/11: o GLB próprio entra no modelo do produto (mockup3d.url e a marca `proprio`) sem mudar mais nada: medidas, cor e tipo continuam a vir do produto, e sem GLB o resultado é o de antes.
import { describe, expect, it } from "vitest";
import { modeloDoProduto, type NoCat, type ProdutoCat } from "./catalogo3d";
import { modeloParaPrevia, PREVIA_SO_GENERICOS } from "./previaProduto3d";
import { zonasDoModelo } from "./zonasGlb";

const URL_GLB = "https://cdn.teste/catalogo-modelos3d/b6ffce4f-f630-4933-833a-008649757a33/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.glb";
const arvore: NoCat[] = [{ id: "cb", n: "Casa de banho", pai: null }, { id: "bides", n: "Bidés", pai: "cb" }];
const produto: ProdutoCat = { id: "p1", n: "Bidé suspenso 54x36", no: "bides", sub: "Bidés" };

describe("modeloDoProduto com glbProprio", () => {
  it("sem GLB próprio o resultado é exactamente o de antes (sem url nem marca)", () => {
    const m = modeloDoProduto(produto, arvore);
    expect(m.mockup3d.url).toBeUndefined();
    expect(m.mockup3d.proprio).toBeUndefined();
    expect(modeloDoProduto(produto, arvore, {}, { glbProprio: null })).toEqual(m);
    expect(modeloDoProduto(produto, arvore, {}, { glbProprio: "" })).toEqual(m);
  });

  it("com GLB próprio o 3D leva o url e a marca `proprio`; as medidas, o tipo e o genérico (a reserva) ficam como eram", () => {
    const sem = modeloDoProduto(produto, arvore), com = modeloDoProduto(produto, arvore, {}, { glbProprio: URL_GLB });
    expect(com.mockup3d.url).toBe(URL_GLB);
    expect(com.mockup3d.proprio).toBe(true);
    expect(com.dimensoes).toEqual(sem.dimensoes);
    expect(com.tipo).toBe(sem.tipo);
    expect(com.mockup3d.generico).toEqual(sem.mockup3d.generico);
    expect(com.escolha).toEqual(sem.escolha);
  });

  it("o GLB próprio vence o url por produto que já existia", () => {
    const m = modeloDoProduto(produto, arvore, { p1: "https://velho.teste/x.glb" }, { glbProprio: URL_GLB });
    expect(m.mockup3d.url).toBe(URL_GLB);
    expect(modeloDoProduto(produto, arvore, { p1: "https://velho.teste/x.glb" }).mockup3d.proprio).toBeUndefined();
  });

  it("vale também na ficha (soGenericos): o GLB próprio é uma escolha do dono e entra por cima", () => {
    expect(PREVIA_SO_GENERICOS).toBe(true);
    expect(modeloDoProduto(produto, arvore, {}, { soGenericos: true, glbProprio: URL_GLB }).mockup3d.url).toBe(URL_GLB);
  });
});

describe("modeloParaPrevia com glbProprio", () => {
  const entrada = { nome: "Armário 60x40x90", sub: "Armários", no: null, arvore: [] as NoCat[] };

  it("passa o url e usa as medidas do produto (deNome) em vez de o tamanho do ficheiro", () => {
    const m = modeloParaPrevia({ ...entrada, medida: { largura: 80, comprimento: 30 }, glbProprio: URL_GLB });
    expect(m.mockup3d.url).toBe(URL_GLB);
    expect(m.dimensoes.deNome).toBe(true);
  });

  it("sem medidas legíveis o produto não tem medidas: deNome falso (o ficheiro fica no tamanho nativo)", () => {
    const m = modeloParaPrevia({ nome: "Móvel qualquer", no: null, arvore: [], glbProprio: URL_GLB });
    expect(m.mockup3d.url).toBe(URL_GLB);
    expect(m.dimensoes.deNome).toBe(false);
  });

  it("a cor do produto vai marcada (`corDoProduto`) para o 3D a aplicar ao GLB; sem cor não há marca", () => {
    expect(modeloParaPrevia({ ...entrada, cor: "#336699", glbProprio: URL_GLB }).mockup3d.corDoProduto).toBe(true);
    expect(modeloParaPrevia({ ...entrada, glbProprio: URL_GLB }).mockup3d.corDoProduto).toBeUndefined();
    expect(modeloParaPrevia({ ...entrada, cor: "#336699" }).mockup3d.corDoProduto).toBeUndefined(); // sem GLB próprio nada muda
  });

  it("sem glbProprio é o de sempre (igual ao de antes)", () => {
    expect(modeloParaPrevia({ ...entrada, medida: { largura: 80, comprimento: 30 }, cor: "#336699" })).toEqual(modeloParaPrevia({ ...entrada, medida: { largura: 80, comprimento: 30 }, cor: "#336699", glbProprio: null }));
  });

  it("um GLB próprio não tem as zonas do genérico (o painel «Aspeto 3D» não oferece zonas que o ficheiro não tem)", () => {
    const g = modeloParaPrevia({ nome: "Móvel de lavatório 80", sub: "Móveis de lavatório", no: null, arvore: [] });
    expect(zonasDoModelo(modeloParaPrevia({ nome: "Móvel de lavatório 80", sub: "Móveis de lavatório", no: null, arvore: [], glbProprio: URL_GLB }))).toEqual([]);
    // o genérico do mesmo produto continua a ter zonas (a reserva, se o GLB falhar)
    expect(zonasDoModelo(g).length).toBeGreaterThan(0);
  });
});

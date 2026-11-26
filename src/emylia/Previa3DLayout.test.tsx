// 26/11: o LAYOUT do 3D do produto com o painel «Aspeto 3D». O jsdom não faz layout: estes testes só provam a ESTRUTURA e as classes de que o layout depende (confirmado ao vivo à parte):
// o 3D é um filho directo da grelha, preso no topo (só por baixo de xl) e SÓ ele, sem o painel dentro; o painel é irmão e ocupa as duas linhas ao lado; o rodapé fixo fica acima dos botões
// redondos da app; as zonas não extravasam a caixa (coluna com min(14rem,100%), largura própria na faixa do telemóvel).
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "https://cdn.teste/x" } }) }) } } }));
vi.mock("./planta3d/Visualizador3D", () => ({ default: () => <div data-testid="canvas3d" role="img" aria-label="3D" /> }));

import { Previa3DProduto } from "./Previa3DProduto";
import type { Config3dPrevia } from "./Previa3DLigacoes";

afterEach(cleanup);

const config = (): Config3dPrevia => ({
  podeEditar: true,
  eixos: { guardados: null, origem: "automatico", proprio: false, gravar: vi.fn(async () => null) },
  ligacoes: {
    valor: [], guardadas: [], alterado: true, origem: "automatico", proprio: false, atributos: [], orfas: 0, ignoradas: 0,
    aoMudar: vi.fn(), descartar: vi.fn(), gravar: vi.fn(async () => null), herdar: vi.fn(async () => null),
  },
});
const MEDIDA = { largura: 40, comprimento: 160, espessura: 25 };
const abrir = async (c?: Config3dPrevia) => {
  render(<Previa3DProduto nome="Coluna AXIS" sub={null} no={null} arvore={[]} medida={MEDIDA} modelo3d="movel_lavatorio" painelMedidas config3d={c} />);
  await screen.findByTestId("canvas3d");
};
const grupo3d = () => screen.getByRole("group", { name: "Pré-visualização 3D do produto" });
/** O filho directo da grelha (o contentor mais alto da pré-visualização) que contém o elemento. */
const filhoDaGrelha = (el: HTMLElement) => { let x = el; while (x.parentElement && !x.parentElement.className.includes("grid gap-3")) x = x.parentElement; return x; };

describe("3D e painel «Aspeto 3D»: layout", () => {
  it("o 3D é um filho directo da grelha, preso no topo só abaixo de xl, e o painel e as zonas NÃO estão dentro dele", async () => {
    await abrir(config());
    const preso = filhoDaGrelha(grupo3d());
    const grelha = preso.parentElement!;
    expect(preso.className).toMatch(/\bsticky\b/);
    expect(preso.className).toContain("top-0"); // o ecrã que rola é o <main> do Layout, que começa por baixo do cabeçalho
    expect(preso.className).toContain("xl:static");
    expect(preso.className).toContain("bg-card"); // opaco: o que rola por baixo não se vê através dele
    expect(preso.contains(screen.getByRole("region", { name: "Aspeto 3D" }))).toBe(false);
    expect(preso.contains(screen.getByRole("region", { name: "Zonas" }))).toBe(false);
    // as três partes são irmãs: 3D, (notas + zonas + medidas), painel
    const painel = filhoDaGrelha(screen.getByRole("region", { name: "Aspeto 3D" }));
    const zonas = filhoDaGrelha(screen.getByRole("region", { name: "Zonas" }));
    expect(painel.parentElement).toBe(grelha);
    expect(zonas.parentElement).toBe(grelha);
    expect(Array.from(grelha.children)).toEqual([preso, zonas, painel]);
  });

  it("ao lado (xl): o 3D e o resto na coluna 1 (linhas 1 e 2), o painel na coluna 2 a ocupar as duas linhas, e a linha 2 absorve a altura que sobra", async () => {
    await abrir(config());
    const preso = filhoDaGrelha(grupo3d());
    const grelha = preso.parentElement!;
    expect(grelha.className).toContain("xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]");
    expect(grelha.className).toContain("xl:grid-rows-[auto_1fr]");
    expect(grelha.className).toContain("xl:items-start");
    expect(preso.className).toContain("xl:col-start-1 xl:row-start-1");
    expect(filhoDaGrelha(screen.getByRole("region", { name: "Zonas" })).className).toContain("xl:col-start-1 xl:row-start-2");
    const painel = filhoDaGrelha(screen.getByRole("region", { name: "Aspeto 3D" }));
    expect(painel.className).toContain("xl:col-start-2");
    expect(painel.className).toContain("xl:row-span-2");
  });

  it("a altura do 3D preso é limitada pela do ecrã (vh) abaixo de xl; em xl volta aos 20rem", async () => {
    await abrir(config());
    const caixa = grupo3d().parentElement!;
    expect(caixa.className).toContain("h-[min(16rem,36vh)]");
    expect(caixa.className).toContain("sm:h-[min(18rem,40vh)]");
    expect(caixa.className).toContain("xl:h-80");
  });

  it("sem o painel «Aspeto 3D» (sem configuração) nada fica preso e a altura é a de sempre", async () => {
    await abrir();
    expect(screen.queryByRole("region", { name: "Aspeto 3D" })).toBeNull();
    const caixa = grupo3d().parentElement!;
    expect(caixa.className).toContain("h-64");
    expect(caixa.className).toContain("sm:h-80");
    expect(grupo3d().closest(".sticky")).toBeNull();
  });

  it("o rodapé fixo do painel fica acima dos botões redondos da app (Olyvia e chat, fixed no canto)", async () => {
    await abrir(config());
    const rodape = screen.getByRole("button", { name: "Guardar aspeto 3D" }).closest<HTMLElement>(".sticky")!;
    expect(rodape.className).toContain("bottom-[4.75rem]"); // 16 px + 48 px dos botões + folga
    expect(rodape.className).toContain("sm:bottom-[5.75rem]"); // 24 px + 56 px + folga
    expect(rodape.className).not.toMatch(/(^|\s)bottom-0(\s|$)/);
  });

  it("as zonas não extravasam a caixa: coluna com min(14rem,100%) e, no telemóvel, cartões com largura própria em que o texto quebra", async () => {
    await abrir(config());
    const lista = screen.getByRole("region", { name: "Zonas" }).querySelector("ul")!;
    expect(lista.className).toContain("minmax(min(14rem,100%),1fr)");
    expect(lista.className).toContain("min-w-0");
    const cartoes = lista.querySelectorAll<HTMLElement>("li");
    expect(cartoes.length).toBeGreaterThanOrEqual(2);
    for (const li of cartoes) {
      expect(li.className).toContain("w-[min(16rem,85%)]");
      expect(li.className).toContain("min-w-0");
      expect(li.className).not.toContain("min-w-[13rem]"); // era isto que fazia o cartão ter a largura do texto todo (cortado: «Superf…»)
      const botao = li.querySelector("button")!;
      expect(botao.className).toContain("min-w-0");
      expect(botao.className).toContain("break-words");
    }
  });
});

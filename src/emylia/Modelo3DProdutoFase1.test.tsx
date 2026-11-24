// 24/11 (fase 1, só ecrã): na secção «Modelo 3D» do produto, o painel «Medidas» (que campo da Medida é a largura, a altura e a profundidade, com pré-visualização imediata e SEM gravar),
// o interruptor «Mostrar medidas» (as cotas no 3D + a linha de texto equivalente fora do canvas) e o painel «Zonas» (a frente, o corpo…, com o atributo que pinta cada uma e o realce
// ao passar o rato ou com o foco do teclado). O Visualizador3D está simulado (jsdom não tem WebGL): o que ele recebe está nos `data-*`; o que se vê, nas capturas.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AtributoDef, AtributoProduto } from "./v2/catalogoModelo";

const dimsVistas = vi.hoisted(() => [] as string[]);
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: (bucket: string) => ({ getPublicUrl: (caminho: string) => ({ data: { publicUrl: `https://cdn.teste/${bucket}/${caminho}` } }) }) } },
}));
vi.mock("./planta3d/Visualizador3D", () => ({
  default: (p: { descricao: string; cotas?: boolean; zonaRealcada?: string | null; modelos: Record<string, { dimensoes: { larguraCm: number; alturaCm: number; profundidadeCm: number }; mockup3d: { zonas?: unknown } }>; espaco: { pecas: { produtoId: string }[] } }) => {
    const m = p.modelos[p.espaco.pecas[0].produtoId];
    dimsVistas.push(`${m.dimensoes.larguraCm}x${m.dimensoes.alturaCm}x${m.dimensoes.profundidadeCm}`);
    return <div data-testid="canvas3d" role="img" aria-label={p.descricao} data-cotas={String(!!p.cotas)} data-realce={p.zonaRealcada ?? ""}
      data-dim={`${m.dimensoes.larguraCm}x${m.dimensoes.alturaCm}x${m.dimensoes.profundidadeCm}`} data-zonas={m.mockup3d.zonas ? JSON.stringify(m.mockup3d.zonas) : ""} />;
  },
}));

import { Modelo3DProduto } from "./Modelo3DProduto";
import { Previa3DProduto } from "./Previa3DProduto";

afterEach(() => { cleanup(); vi.restoreAllMocks(); dimsVistas.length = 0; });

const MEDIDA_DEF: AtributoDef = { id: "a-med", codigo: "medida", nome: "Medida", tipo: "medida", temHex: false, ordem: 1, opcoes: [] };
const cor = (id: string, nome: string, codigo: string): AtributoDef => ({ id, codigo, nome, tipo: "lista", temHex: true, temFoto: true, ordem: 2, opcoes: [
  { id: `${id}-1`, valor: "Artisan", nome: "Artisan", hex: null, foto: "org/artisan.webp", ordem: 1 },
  { id: `${id}-2`, valor: "Oak", nome: "Oak", hex: null, foto: "org/oak.webp", ordem: 2 },
] });
const COR_CORPO = cor("a-corpo", "Cor do corpo", "cor_corpo"), COR_FRENTE = cor("a-frente", "Cor da frente", "cor_frente");
const medida3D: AtributoProduto = { atributoId: "a-med", medida: { tipo: "3D", largura: 40, comprimento: 160, espessura: 25, unidade: "cm" } };
const medida1D: AtributoProduto = { atributoId: "a-med", medida: { tipo: "1D", dimensao: "largura", valor: 40, unidade: "cm" } };

const abrir = async (attrs: AtributoProduto[], defs: AtributoDef[] = [MEDIDA_DEF], extra: { modelo3d?: string; nome?: string } = {}) => {
  render(<Modelo3DProduto nome={extra.nome ?? "Coluna AXIS"} sub={null} no={null} arvore={[]} attrs={attrs} defs={defs} modelo3d={extra.modelo3d ?? "movel_lavatorio"} />);
  fireEvent.click(screen.getByRole("button", { name: "Ver em 3D" }));
  return screen.findByTestId("canvas3d");
};
const seletor = (rotulo: string) => screen.getByLabelText(new RegExp(`^${rotulo} =`)) as HTMLSelectElement;

describe("painel «Medidas»: só aparece com uma Medida 2D ou 3D com campos", () => {
  it("com Medida 3D: aparece, com os três seletores rotulados", async () => {
    await abrir([medida3D]);
    expect(screen.getByRole("heading", { name: "Medidas" })).toBeTruthy();
    for (const r of ["Largura", "Altura", "Profundidade"]) expect(seletor(r)).toBeTruthy();
  });
  it("com Medida 2D: aparece", async () => {
    await abrir([{ atributoId: "a-med", medida: { tipo: "2D", largura: 60, comprimento: 45, espessura: null, unidade: "cm" } }]);
    expect(screen.getByRole("heading", { name: "Medidas" })).toBeTruthy();
  });
  it("sem Medida, ou com Medida 1D: não aparece", async () => {
    await abrir([]);
    expect(screen.queryByRole("heading", { name: "Medidas" })).toBeNull();
    cleanup();
    await abrir([medida1D]);
    expect(screen.queryByRole("heading", { name: "Medidas" })).toBeNull();
  });
});

describe("painel «Medidas»: escolher os eixos (só ecrã, sem gravar)", () => {
  it("de partida é a regra automática do tipo: no móvel de lavatório, largura = largura, altura = comprimento, profundidade = espessura", async () => {
    const c = await abrir([medida3D]);
    expect(seletor("Largura").value).toBe("largura");
    expect(seletor("Altura").value).toBe("comprimento");
    expect(seletor("Profundidade").value).toBe("espessura");
    expect(screen.getByText("Regra: automática por tipo")).toBeTruthy();
    expect(c.getAttribute("data-dim")).toBe("40x160x25");
    // aria-disabled (e não disabled): um botão desactivado perde o foco do teclado ao ser carregado, e o foco tem de ficar onde está
    const repor = screen.getByRole("button", { name: "Repor automático" }) as HTMLButtonElement;
    expect(repor.getAttribute("aria-disabled")).toBe("true");
    expect(repor.disabled).toBe(false);
  });
  it("«Repor automático» na regra automática não faz nada (ignora o clique e não perde o foco); depois de escolher à mão, funciona e deixa de estar desactivado", async () => {
    const c = await abrir([medida3D]);
    const repor = screen.getByRole("button", { name: "Repor automático" });
    repor.focus();
    fireEvent.click(repor);
    expect(repor).toHaveFocus();
    expect(c.getAttribute("data-dim")).toBe("40x160x25");
    expect(screen.getByText("Regra: automática por tipo")).toBeTruthy();
    fireEvent.change(seletor("Altura"), { target: { value: "espessura" } });
    expect(c.getAttribute("data-dim")).toBe("40x25x160");
    expect(repor.getAttribute("aria-disabled")).toBe("false");
    fireEvent.click(repor);
    expect(c.getAttribute("data-dim")).toBe("40x160x25");
  });
  it("a frase «A peça fica com…» é uma região viva (muda com os seletores e anuncia-se), e uma troca de dois campos leva uma nota nessa mesma região", async () => {
    await abrir([medida3D]);
    const frase = screen.getByText(/^A peça fica com 40 cm de largura/);
    expect(frase.getAttribute("aria-live")).toBe("polite");
    expect(frase.textContent).not.toContain("já estava em uso");
    fireEvent.change(seletor("Altura"), { target: { value: "espessura" } });
    expect(frase.textContent).toContain("A peça fica com 40 cm de largura, 25 cm de altura e 160 cm de profundidade.");
    expect(frase.textContent).toContain("A profundidade passou a usar «comprimento», porque a espessura já estava em uso.");
    fireEvent.click(screen.getByRole("button", { name: "Repor automático" }));
    expect(frase.textContent).not.toContain("já estava em uso");
  });
  it("escolher um campo já usado TROCA os dois: Altura = espessura passa a profundidade a comprimento, e a peça deita-se (40 × 25 × 160) logo", async () => {
    const c = await abrir([medida3D]);
    fireEvent.change(seletor("Altura"), { target: { value: "espessura" } });
    expect(seletor("Altura").value).toBe("espessura");
    expect(seletor("Profundidade").value).toBe("comprimento");
    expect(seletor("Largura").value).toBe("largura");
    expect(c.getAttribute("data-dim")).toBe("40x25x160");
    expect(screen.getByText("Regra: escolhida à mão (só para ver)")).toBeTruthy();
  });
  it("«Repor automático» volta à regra do tipo", async () => {
    const c = await abrir([medida3D]);
    fireEvent.change(seletor("Largura"), { target: { value: "comprimento" } });
    expect(c.getAttribute("data-dim")).toBe("160x40x25");
    fireEvent.click(screen.getByRole("button", { name: "Repor automático" }));
    expect(c.getAttribute("data-dim")).toBe("40x160x25");
    expect(screen.getByText("Regra: automática por tipo")).toBeTruthy();
  });
  it("não há botão de gravar nesta fase: um texto diz que a gravação vem na próxima", async () => {
    await abrir([medida3D]);
    expect(screen.getByText(/a gravação vem na próxima fase/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /gravar|guardar/i })).toBeNull();
  });
  it("cada seletor tem pelo menos 44 px de altura (min-h-11) e as opções dizem o valor do campo", async () => {
    await abrir([medida3D]);
    expect(seletor("Altura").className).toContain("min-h-11");
    expect(within(seletor("Altura")).getByRole("option", { name: "comprimento (160 cm)" })).toBeTruthy();
  });
});

describe("«Mostrar medidas»: as cotas no 3D e a linha de texto fora do canvas", () => {
  it("o interruptor começa desligado; ligar pede as cotas ao 3D e mostra «L 40 · A 160 · P 25 cm» numa região viva", async () => {
    const c = await abrir([medida3D]);
    const sw = screen.getByRole("switch", { name: "Mostrar medidas" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(c.getAttribute("data-cotas")).toBe("false");
    expect(screen.queryByText("L 40 · A 160 · P 25 cm")).toBeNull();
    fireEvent.click(sw);
    expect(sw.getAttribute("aria-checked")).toBe("true");
    expect(c.getAttribute("data-cotas")).toBe("true");
    const linha = screen.getByText("L 40 · A 160 · P 25 cm");
    expect(linha.getAttribute("aria-live")).toBe("polite");
    expect(c.contains(linha)).toBe(false);
  });
  it("a linha acompanha os eixos escolhidos", async () => {
    await abrir([medida3D]);
    fireEvent.click(screen.getByRole("switch", { name: "Mostrar medidas" }));
    fireEvent.change(seletor("Altura"), { target: { value: "espessura" } });
    expect(screen.getByText("L 40 · A 25 · P 160 cm")).toBeTruthy();
  });
});

describe("painel «Zonas»: a frente, o corpo…, com o atributo que pinta cada uma", () => {
  it("lista as zonas do modelo com o número de partes («Frente — 2 partes»)", async () => {
    await abrir([medida3D]);
    expect(screen.getByRole("button", { name: /Frente — 2 partes/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Corpo — 1 parte\b/ })).toBeTruthy();
  });
  it("passar o rato (ou o foco do teclado) realça a zona no 3D; sair tira o realce", async () => {
    const c = await abrir([medida3D]);
    const frente = screen.getByRole("button", { name: /Frente — 2 partes/ });
    fireEvent.mouseEnter(frente);
    expect(c.getAttribute("data-realce")).toBe("frente");
    fireEvent.mouseLeave(frente);
    expect(c.getAttribute("data-realce")).toBe("");
    fireEvent.focus(frente);
    expect(c.getAttribute("data-realce")).toBe("frente");
    fireEvent.blur(frente);
    expect(c.getAttribute("data-realce")).toBe("");
  });
  it("o atributo que pinta cada zona vem do nome: «Cor da frente» → frente e «Cor do corpo» → corpo, com fotos diferentes no 3D", async () => {
    const c = await abrir([medida3D, { atributoId: "a-corpo", opcaoId: "a-corpo-1" }, { atributoId: "a-frente", opcaoId: "a-frente-2" }], [MEDIDA_DEF, COR_CORPO, COR_FRENTE]);
    expect(screen.getByRole("button", { name: /Frente — 2 partes/ }).textContent).toContain("Pintada por: Cor da frente");
    expect(screen.getByRole("button", { name: /Corpo — 1 parte/ }).textContent).toContain("Pintada por: Cor do corpo");
    const z = JSON.parse(c.getAttribute("data-zonas")!) as { porZona: boolean; zonas: Record<string, { textura: { url: string } }> };
    expect(z.porZona).toBe(true);
    expect(z.zonas.frente.textura.url).toBe("https://cdn.teste/catalogo-opcoes/org/oak.webp");
    expect(z.zonas.corpo.textura.url).toBe("https://cdn.teste/catalogo-opcoes/org/artisan.webp");
  });
  it("sem atributo de cor: «Sem atributo de cor» e o modelo não leva zonas (fica como hoje)", async () => {
    const c = await abrir([medida3D]);
    expect(screen.getByRole("button", { name: /Frente — 2 partes/ }).textContent).toContain("Sem atributo de cor");
    expect(c.getAttribute("data-zonas")).toBe("");
  });
  it("com um só atributo de cor (o caminho de hoje) o modelo não leva zonas por zona, mas o painel diz qual a pinta", async () => {
    const c = await abrir([medida3D, { atributoId: "a-corpo", opcaoId: "a-corpo-1" }], [MEDIDA_DEF, COR_CORPO]);
    expect(JSON.parse(c.getAttribute("data-zonas")!).porZona).toBe(false);
    expect(screen.getByRole("button", { name: /Frente — 2 partes/ }).textContent).toContain("Pintada por: Cor do corpo");
  });
});

describe("trocar de tipo de produto: os eixos escolhidos à mão não passam para o tipo novo, nem por um desenho", () => {
  const medida = { largura: 40, comprimento: 160, espessura: 25 };
  const previa = (nome: string) => <Previa3DProduto nome={nome} sub={null} no={null} arvore={[]} medida={medida} painelMedidas />;
  it("a coluna com Largura = comprimento (160×40×25) passa a tampo: volta logo à regra do tampo (40×25×160), sem um desenho com os eixos da coluna", async () => {
    const { rerender } = render(previa("Coluna AXIS"));
    const c = await screen.findByTestId("canvas3d");
    expect(c.getAttribute("data-dim")).toBe("40x160x25");
    fireEvent.change(seletor("Largura"), { target: { value: "comprimento" } });
    expect(c.getAttribute("data-dim")).toBe("160x40x25");
    dimsVistas.length = 0;
    rerender(previa("Tampo carvalho"));
    expect(dimsVistas.length).toBeGreaterThan(0);
    expect(dimsVistas).not.toContain("160x40x25");
    expect(screen.getByTestId("canvas3d").getAttribute("data-dim")).toBe("40x25x160");
    expect(screen.getByText("Regra: automática por tipo")).toBeTruthy();
  });
});

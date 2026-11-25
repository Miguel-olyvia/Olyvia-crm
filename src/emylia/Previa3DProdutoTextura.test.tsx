// 24/11: a foto da opção de cor escolhida chega ao 3D do produto como textura: o formulário (Modelo3DProduto) escolhe a foto pelos atributos (corpo > frente > cor),
// constrói o URL público e o modelo da pré-visualização leva `textura` (url e lado de 40 cm); sem foto, o modelo não leva textura e fica a cor. O Visualizador3D está
// simulado (jsdom não tem WebGL): como a textura se aplica ao material está em texturaProduto.test.ts e o que se vê, nas capturas.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AtributoDef, AtributoProduto } from "./v2/catalogoModelo";

const storage = vi.hoisted(() => ({ lancar: false, pedidos: [] as string[] }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: (bucket: string) => ({ getPublicUrl: (caminho: string) => {
    storage.pedidos.push(`${bucket}/${caminho}`);
    if (storage.lancar) throw new Error("sem storage");
    return { data: { publicUrl: `https://cdn.teste/${bucket}/${caminho}` } };
  } }) } },
}));
vi.mock("./planta3d/Visualizador3D", () => ({
  default: (p: { descricao: string; modelos: Record<string, { mockup3d: { cor: string; textura?: { url: string; ladoCm: number } } }>; espaco: { pecas: { produtoId: string }[] } }) => {
    const m = p.modelos[p.espaco.pecas[0].produtoId].mockup3d;
    return <div data-testid="canvas3d" role="img" aria-label={p.descricao} data-cor={m.cor} data-textura={m.textura ? JSON.stringify(m.textura) : ""} />;
  },
}));

import { urlDaFotoOpcao } from "./fotoOpcaoUrl";
import { Modelo3DProduto } from "./Modelo3DProduto";

afterEach(() => { cleanup(); storage.lancar = false; storage.pedidos.length = 0; vi.restoreAllMocks(); });

const NOGAL = "3242e925/7d39ff41.webp";
const COR: AtributoDef = { id: "a-cor", codigo: "cor", nome: "Cor", tipo: "lista", temHex: true, temFoto: true, ordem: 2, opcoes: [
  { id: "o-nogal", valor: "Nogal", nome: "Nogal", hex: null, foto: NOGAL, ordem: 1 },
  { id: "o-preto", valor: "Preto", nome: "Preto", hex: "#000000", foto: null, ordem: 2 },
] };
const MEDIDA_DEF: AtributoDef = { id: "a-med", codigo: "medida", nome: "Medida", tipo: "medida", temHex: false, ordem: 1, opcoes: [] };
const medida: AtributoProduto = { atributoId: "a-med", medida: { tipo: "3D", largura: 195, comprimento: 1200, espessura: 9, unidade: "mm" } };
const NOME = "Revestimento PORCELÂNICO SAJONIA NOGAL 19,5x120";

const abrir = async (attrs: AtributoProduto[]) => {
  render(<Modelo3DProduto nome={NOME} sub={null} no={null} arvore={[]} attrs={attrs} defs={[MEDIDA_DEF, COR]} />);
  fireEvent.click(screen.getByRole("button", { name: "Ver em 3D" }));
  return screen.findByTestId("canvas3d");
};

describe("urlDaFotoOpcao: o URL público da foto da opção (bucket catalogo-opcoes)", () => {
  it("constrói o URL a partir do bucket e do caminho {org}/{uuid}.webp", () => {
    expect(urlDaFotoOpcao(NOGAL)).toBe(`https://cdn.teste/catalogo-opcoes/${NOGAL}`);
    expect(storage.pedidos).toEqual([`catalogo-opcoes/${NOGAL}`]);
  });
  it("sem storage (a chamada lança), devolve null em vez de partir: o 3D fica com a cor", () => {
    storage.lancar = true;
    expect(urlDaFotoOpcao(NOGAL)).toBeNull();
  });
});

describe("Modelo3DProduto: a foto da opção escolhida passa a textura do modelo do 3D", () => {
  it("o Revestimento Sajónia Nogal (só o atributo Cor, com o Nogal que tem foto): o modelo leva a textura com 40 cm por repetição", async () => {
    const c = await abrir([medida, { atributoId: "a-cor", opcaoId: "o-nogal", valor: "Nogal" }]);
    expect(JSON.parse(c.getAttribute("data-textura")!)).toEqual({ url: `https://cdn.teste/catalogo-opcoes/${NOGAL}`, ladoCm: 40 });
  });
  it("uma opção sem foto (só hex): o modelo não leva textura e fica a cor do hex", async () => {
    const c = await abrir([medida, { atributoId: "a-cor", opcaoId: "o-preto", valor: "Preto" }]);
    expect(c.getAttribute("data-textura")).toBe("");
    expect(c.getAttribute("data-cor")).toBe("#000000");
  });
  it("sem cor escolhida: sem textura", async () => {
    const c = await abrir([medida]);
    expect(c.getAttribute("data-textura")).toBe("");
  });
  it("o storage a falhar (sem URL): sem textura, o 3D abre na mesma com a cor", async () => {
    storage.lancar = true;
    const c = await abrir([medida, { atributoId: "a-cor", opcaoId: "o-nogal", valor: "Nogal" }]);
    expect(c.getAttribute("data-textura")).toBe("");
  });
});

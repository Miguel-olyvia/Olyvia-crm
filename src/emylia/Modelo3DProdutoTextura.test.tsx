// 27/11: a Textura da Mudelar (Pizarra, Liso, Piedra). A COR continua a ser a da opção de Cor (o Antracite) e a TEXTURA é que muda: a foto da opção de Textura vai para o corpo
// TINGIDA pela cor (`tingir`: a cor multiplica a foto, em vez de a substituir). O Visualizador3D está simulado (jsdom não tem WebGL): mostra o que o modelo recebeu.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AtributoDef, AtributoProduto } from "./v2/catalogoModelo";

const base = vi.hoisted(() => ({
  responder: (() => ({ data: null, error: null })) as (f: string, a: Record<string, unknown>) => { data: unknown; error: unknown },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async (f: string, a: Record<string, unknown>) => base.responder(f, a)),
    storage: { from: (bucket: string) => ({ getPublicUrl: (caminho: string) => ({ data: { publicUrl: `https://cdn.teste/${bucket}/${caminho}` } }) }) },
  },
}));
vi.mock("./planta3d/Visualizador3D", () => ({
  default: (p: { descricao: string; modelos: Record<string, { mockup3d: { cor: string; textura?: { url: string; ladoCm: number; tingir?: boolean } } }>; espaco: { pecas: { produtoId: string }[] } }) => {
    const m = p.modelos[p.espaco.pecas[0].produtoId].mockup3d;
    return <div data-testid="canvas3d" role="img" aria-label={p.descricao} data-cor={m.cor} data-textura={m.textura ? JSON.stringify(m.textura) : ""} />;
  },
}));

import { Modelo3DProduto } from "./Modelo3DProduto";

const ORG = "3242e925-da26-459a-8258-be04d904e355", PID = "11111111-2222-4333-8444-555555555555";
const A_COR = "aaaaaaaa-0000-4000-a000-000000000041", A_TEX = "aaaaaaaa-0000-4000-a000-000000000042";
const PIZARRA = `${ORG}/pizarra.webp`, NOGAL = `${ORG}/nogal.webp`;
const url = (c: string) => `https://cdn.teste/catalogo-opcoes/${c}`;
const opcao = (id: string, extra: { hex?: string | null; foto?: string | null } = {}) => ({ id, valor: id, nome: id, hex: extra.hex ?? null, foto: extra.foto ?? null, ordem: 1 });
const COR: AtributoDef = { id: A_COR, codigo: "cor", nome: "Cor", tipo: "lista", temHex: true, temFoto: true, ordem: 1, opcoes: [
  opcao("antracite", { hex: "#645E5E" }), opcao("nogal", { hex: "#8b5a2b", foto: NOGAL }), opcao("sem-hex"),
] };
const TEXTURA = (fotos: boolean): AtributoDef => ({ id: A_TEX, codigo: "textura", nome: "Textura", tipo: "lista", temHex: fotos, temFoto: fotos, ordem: 2, opcoes: [
  opcao("pizarra", { foto: fotos ? PIZARRA : null }), opcao("liso"),
] });
const escolha = (atributoId: string, opcaoId: string): AtributoProduto => ({ atributoId, opcaoId, valor: opcaoId });
const SEM = { proprio: null, subcategoria: null, categoria: null, efectiva: { eixos: null, eixos_origem: "automatico", ligacoes: null, ligacoes_origem: "automatico" } };

beforeEach(() => { base.responder = (f) => (f === "cat_ler_config_3d" ? { data: SEM, error: null } : { data: null, error: null }); });
afterEach(cleanup);

const abrir = async (attrs: AtributoProduto[], defs: AtributoDef[], comConfig = false) => {
  render(<Modelo3DProduto nome="Móvel de lavatório 80" sub={null} no={null} arvore={[]} attrs={attrs} defs={defs} {...(comConfig ? { alvoConfig3d: { org: ORG, produtoId: PID, podeEditar: true } } : {})} />);
  fireEvent.click(screen.getByRole("button", { name: "Ver em 3D" }));
  return screen.findByTestId("canvas3d");
};
const textura = (c: HTMLElement): unknown => { const t = c.getAttribute("data-textura"); return t ? JSON.parse(t) : null; };

describe("Modelo3DProduto: a foto da Textura, tingida pela cor da opção de Cor", () => {
  it("Antracite + Pizarra com foto: a cor é o hex do Antracite e a textura é a da Pizarra, tingida", async () => {
    const c = await abrir([escolha(A_COR, "antracite"), escolha(A_TEX, "pizarra")], [COR, TEXTURA(true)]);
    expect(c.getAttribute("data-cor")).toBe("#645E5E");
    expect(textura(c)).toEqual({ url: url(PIZARRA), ladoCm: 40, tingir: true });
  });
  it("Textura sem foto (a base de hoje): comportamento de hoje, só a cor e nenhuma textura", async () => {
    const c = await abrir([escolha(A_COR, "antracite"), escolha(A_TEX, "pizarra")], [COR, TEXTURA(false)]);
    expect(c.getAttribute("data-cor")).toBe("#645E5E");
    expect(textura(c)).toBeNull();
  });
  it("a opção «Liso» sem foto: sem textura, mesmo com o atributo a ter foto; a cor continua a do Antracite", async () => {
    const c = await abrir([escolha(A_COR, "antracite"), escolha(A_TEX, "liso")], [COR, TEXTURA(true)]);
    expect(c.getAttribute("data-cor")).toBe("#645E5E");
    expect(textura(c)).toBeNull();
  });
  it("foto na Cor E na Textura: ganha a da Textura (tingida pela cor da opção de Cor)", async () => {
    const c = await abrir([escolha(A_COR, "nogal"), escolha(A_TEX, "pizarra")], [COR, TEXTURA(true)]);
    expect(textura(c)).toEqual({ url: url(PIZARRA), ladoCm: 40, tingir: true });
    expect(c.getAttribute("data-cor")).toBe("#8b5a2b");
  });
  it("foto só na Cor (Textura sem escolha): a foto da Cor, pura, como sempre (sem tingir)", async () => {
    const c = await abrir([escolha(A_COR, "nogal")], [COR, TEXTURA(true)]);
    expect(textura(c)).toEqual({ url: url(NOGAL), ladoCm: 40 });
  });
  it("sem hex na cor (ou sem Cor): a foto aparece pura, sem tingir (nunca cinzento)", async () => {
    const semHex = await abrir([escolha(A_COR, "sem-hex"), escolha(A_TEX, "pizarra")], [COR, TEXTURA(true)]);
    expect(textura(semHex)).toEqual({ url: url(PIZARRA), ladoCm: 40 });
    cleanup();
    const semCor = await abrir([escolha(A_TEX, "pizarra")], [COR, TEXTURA(true)]);
    expect(textura(semCor)).toEqual({ url: url(PIZARRA), ladoCm: 40 });
  });
  it("«Aplicar: não» à Textura em todas as zonas desliga-a (a cor fica)", async () => {
    base.responder = (f) => (f === "cat_ler_config_3d"
      ? { data: { ...SEM, proprio: { eixos: null, ligacoes: [{ atributo: A_TEX, zona: "tudo", aplicar: false }], orfas: 0 }, efectiva: { eixos: null, eixos_origem: "automatico", ligacoes: [{ atributo: A_TEX, zona: "tudo", aplicar: false }], ligacoes_origem: "produto" } }, error: null }
      : { data: null, error: null });
    const c = await abrir([escolha(A_COR, "antracite"), escolha(A_TEX, "pizarra")], [COR, TEXTURA(true)], true);
    await waitFor(() => expect(textura(c)).toBeNull());
    expect(c.getAttribute("data-cor")).toBe("#645E5E");
  });
});

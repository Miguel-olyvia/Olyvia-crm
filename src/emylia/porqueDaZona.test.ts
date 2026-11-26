// 26/11: o «Porquê» de cada zona do painel «Aspeto 3D»: de onde vem a cor e a superfície que se vêem. É uma função pura que usa as MESMAS funções que pintam o 3D (ligacoesDaConfig,
// aparenciaDaZona, superficieDaZona): o painel nunca diz uma coisa e o 3D mostra outra. Por isso, além de cada origem, confere-se que o vencedor coincide com o do 3D em várias ordens de definições.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));

import { ligacoesDaConfig, type Ligacao } from "./config3dDados";
import { porqueDaZona, zonasSemEfeito } from "./porqueDaZona";
import { aparenciaDaZona, zonasDosAtributos, ZONAS, type ZonaGlb } from "./planta3d/zonasGlb";
import type { AtributoDef, AtributoProduto, Superficie } from "./v2/catalogoModelo";

const CORPO = "aaaaaaaa-0000-4000-a000-000000000002", FRENTE = "aaaaaaaa-0000-4000-a000-000000000001", TONAL = "aaaaaaaa-0000-4000-a000-000000000007", BRILHO = "aaaaaaaa-0000-4000-a000-000000000008";
const L = (atributo: string, zona: Ligacao["zona"], aplicar = true): Ligacao => ({ atributo, zona, aplicar });
const cor = (id: string, nome: string, codigo: string, hex: string, extra: Partial<AtributoDef> = {}): AtributoDef => ({
  id, codigo, nome, tipo: "lista", temHex: true, ordem: 1, opcoes: [{ id: `${id}-o`, valor: nome, nome: `${nome} X`, hex, ordem: 1 }], ...extra,
});
const superficie = (id: string, nome: string, s: Superficie): AtributoDef => ({
  id, codigo: nome.toLowerCase(), nome, tipo: "lista", temHex: false, temAspeto: true, ordem: 2, opcoes: [{ id: `${id}-o`, valor: nome, nome: `${nome} X`, hex: null, ordem: 1, superficie: s }],
});
const D_CORPO = cor(CORPO, "Cor do corpo", "cor_corpo", "#111111"), D_FRENTE = cor(FRENTE, "Cor da frente", "cor_frente", "#eeeeee");
const D_TONAL = superficie(TONAL, "Tonalidade", "mate"), D_BRILHO = superficie(BRILHO, "Brilho", "polida");
const attrs = (...ids: string[]): AtributoProduto[] => ids.map((id) => ({ atributoId: id, opcaoId: `${id}-o`, valor: id }));
const TODOS = attrs(CORPO, FRENTE, TONAL, BRILHO);
const ZONAS_TESTE: ZonaGlb[] = ["frente", "corpo", "tampo"];
const ORDENS: Record<string, AtributoDef[]> = {
  "corpo, frente, tonalidade, brilho": [D_CORPO, D_FRENTE, D_TONAL, D_BRILHO],
  "frente, corpo, brilho, tonalidade": [D_FRENTE, D_CORPO, D_BRILHO, D_TONAL],
};
const porque = (zona: ZonaGlb, regras: Ligacao[], defs: AtributoDef[], a: AtributoProduto[] = TODOS) => porqueDaZona({ zona, regras, attrs: a, defs });

describe("porqueDaZona: cada origem", () => {
  it("sem regras: a cor vem do nome do atributo («automático») e a superfície, dos atributos de superfície que actuam em todas as zonas", () => {
    const p = porque("corpo", [], [D_CORPO, D_TONAL], attrs(CORPO, TONAL));
    expect(p.cor.origem).toMatchObject({ tipo: "automatico", atributo: "Cor do corpo", atributoId: CORPO });
    expect(p.superficie.origem).toMatchObject({ tipo: "automatico", atributo: "Tonalidade", atributoId: TONAL });
    expect(p.cor.excecoes).toEqual([]);
  });
  it("«Tonalidade → Todas as zonas»: a superfície de qualquer zona vem dessa regra", () => {
    const p = porque("corpo", [L(TONAL, "tudo")], [D_CORPO, D_TONAL], attrs(CORPO, TONAL));
    expect(p.superficie.origem).toMatchObject({ tipo: "regra-tudo", atributo: "Tonalidade", atributoId: TONAL });
  });
  it("uma regra desta zona (ligação directa): «explícita»", () => {
    const p = porque("frente", [L(BRILHO, "frente")], [D_FRENTE, D_BRILHO], attrs(FRENTE, BRILHO));
    expect(p.superficie.origem).toMatchObject({ tipo: "explicita", atributo: "Brilho" });
    const c = porque("frente", [L(CORPO, "frente")], [D_CORPO, D_FRENTE], attrs(CORPO, FRENTE));
    expect(c.cor.origem).toMatchObject({ tipo: "explicita", atributo: "Cor do corpo" });
  });
  it("uma excepção («não pinta» nesta zona, com «Todas as zonas» a cobrir as outras) lista-se e não é a origem", () => {
    const p = porque("frente", [L(TONAL, "tudo"), L(TONAL, "frente", false)], [D_FRENTE, D_TONAL], attrs(FRENTE, TONAL));
    expect(p.superficie.origem.tipo).toBe("nenhuma");
    expect(p.superficie.excecoes).toEqual([{ id: TONAL, nome: "Tonalidade", daRegraTudo: true }]);
    const outra = porque("corpo", [L(TONAL, "tudo"), L(TONAL, "frente", false)], [D_CORPO, D_TONAL], attrs(CORPO, TONAL));
    expect(outra.superficie.origem.tipo).toBe("regra-tudo");
    expect(outra.superficie.excecoes).toEqual([]);
  });
  it("um «não pinta» sem regra «Todas as zonas» também é uma excepção, mas não vem dela", () => {
    const p = porque("frente", [L(CORPO, "frente", false)], [D_CORPO, D_FRENTE], attrs(CORPO, FRENTE));
    expect(p.cor.excecoes).toEqual([{ id: CORPO, nome: "Cor do corpo", daRegraTudo: false }]);
  });
  it("sem atributo nenhum que pinte a zona: «nenhuma»", () => {
    // com mais de um atributo de cor, a «Cor da frente» não pinta o tampo (só o único atributo de cor pintaria tudo)
    expect(porque("tampo", [], [D_FRENTE, D_CORPO], attrs(FRENTE)).cor.origem.tipo).toBe("nenhuma");
    expect(porque("frente", [], [D_FRENTE], []).cor.origem.tipo).toBe("nenhuma");
  });
  it("a superfície que a opção de cor traz por omissão: «da-cor»", () => {
    const corComAspeto = cor(CORPO, "Cor do corpo", "cor_corpo", "#111111", { temAspeto: true, opcoes: [{ id: `${CORPO}-o`, valor: "x", nome: "x", hex: "#111111", ordem: 1, superficie: "acetinada" }] });
    const p = porque("corpo", [], [corComAspeto], attrs(CORPO));
    expect(p.superficie.origem).toMatchObject({ tipo: "da-cor", atributo: "Cor do corpo" });
  });
  it("sem atributo de superfície nem aspeto na cor: a superfície é «nenhuma»", () => {
    expect(porque("corpo", [], [D_CORPO], attrs(CORPO)).superficie.origem.tipo).toBe("nenhuma");
  });
});

describe.each(Object.entries(ORDENS))("conflitos entre atributos (%s)", (_n, defs) => {
  it("cor A em «Todas as zonas» e cor B só na frente, sem excepção: conflito, e o vencedor é o que o 3D pinta", () => {
    const regras = [L(CORPO, "tudo"), L(FRENTE, "frente")];
    const { ligacoes, excluidos } = ligacoesDaConfig(regras);
    const do3d = aparenciaDaZona("frente", TODOS, defs, ligacoes, excluidos)!.atributo;
    const p = porque("frente", regras, defs);
    expect(p.cor.origem.tipo).toBe("conflito");
    if (p.cor.origem.tipo !== "conflito") return;
    expect(p.cor.origem.vencedor.nome).toBe(do3d);
    expect(p.cor.origem.perdedor.nome).not.toBe(do3d);
    expect([p.cor.origem.vencedor.via, p.cor.origem.perdedor.via].sort()).toEqual(["tudo", "zona"]);
  });
  it("com a excepção («Dar prioridade»: o outro não pinta nesta zona) o conflito desaparece e ganha o escolhido", () => {
    const regras = [L(CORPO, "tudo"), L(FRENTE, "frente"), L(CORPO, "frente", false)];
    const p = porque("frente", regras, defs);
    expect(p.cor.origem).toMatchObject({ tipo: "explicita", atributo: "Cor da frente" });
  });
  it("Brilho (sem regras) e Tonalidade em «Todas as zonas»: conflito de superfície, ganha o primeiro da lista, como no 3D", () => {
    const regras = [L(TONAL, "tudo")];
    const { ligacoes, excluidos } = ligacoesDaConfig(regras);
    const z = zonasDosAtributos(TODOS, defs, ligacoes, excluidos)!;
    const p = porque("corpo", regras, defs);
    expect(p.superficie.origem.tipo).toBe("conflito");
    if (p.superficie.origem.tipo !== "conflito") return;
    expect(p.superficie.origem.vencedor.nome).toBe(z.zonas.corpo!.acabamento);
    expect(p.superficie.origem.perdedor.id).toBe(p.superficie.origem.vencedor.id === TONAL ? BRILHO : TONAL);
  });
});

describe("o vencedor do painel coincide sempre com o do 3D (várias regras, várias ordens, várias zonas)", () => {
  const CONJUNTOS: Ligacao[][] = [
    [], [L(TONAL, "tudo")], [L(BRILHO, "frente")], [L(CORPO, "tudo"), L(FRENTE, "frente")], [L(CORPO, "tudo"), L(CORPO, "frente", false)],
    [L(TONAL, "tudo"), L(BRILHO, "tudo"), L(BRILHO, "corpo", false)], [L(FRENTE, "tudo", false), L(CORPO, "frente")], [L(TONAL, "frente", false), L(BRILHO, "frente", false)],
    [L(CORPO, "corpo"), L(FRENTE, "corpo"), L(TONAL, "corpo")],
  ];
  for (const [nome, defs] of Object.entries(ORDENS)) {
    it(`(${nome})`, () => {
      for (const regras of CONJUNTOS) for (const zona of ZONAS_TESTE) {
        const { ligacoes, excluidos } = ligacoesDaConfig(regras);
        const z = zonasDosAtributos(TODOS, defs, ligacoes, excluidos)?.zonas[zona];
        const cor3d = aparenciaDaZona(zona, TODOS, defs, ligacoes, excluidos);
        const p = porque(zona, regras, defs);
        const nomeCor = p.cor.origem.tipo === "nenhuma" ? "" : p.cor.origem.tipo === "conflito" ? p.cor.origem.vencedor.nome : p.cor.origem.atributo;
        expect(nomeCor, JSON.stringify({ regras, zona })).toBe(cor3d?.atributo ?? "");
        const nomeSup = p.superficie.origem.tipo === "conflito" ? p.superficie.origem.vencedor.nome : p.superficie.origem.tipo === "automatico" || p.superficie.origem.tipo === "regra-tudo" || p.superficie.origem.tipo === "explicita" ? p.superficie.origem.atributo : "";
        expect(nomeSup, JSON.stringify({ regras, zona })).toBe(z?.acabamento ?? "");
      }
    });
  }
});

describe("zonasSemEfeito: onde uma regra não chega a pintar", () => {
  const defs = ORDENS["corpo, frente, tonalidade, brilho"];
  const dos = (regras: Ligacao[], regra: Ligacao) => zonasSemEfeito({ regra, regras, attrs: TODOS, defs, zonas: ZONAS_TESTE });
  it("«Tonalidade → Todas as zonas» com a excepção na frente: sem efeito na frente", () => {
    const regras = [L(TONAL, "tudo"), L(TONAL, "frente", false)];
    expect(dos(regras, L(TONAL, "tudo"))).toContain("frente");
    expect(dos(regras, L(TONAL, "tudo"))).not.toContain("corpo");
  });
  it("a própria excepção («não pinta») não é «sem efeito»", () => {
    const regras = [L(TONAL, "tudo"), L(TONAL, "frente", false)];
    expect(dos(regras, L(TONAL, "frente", false))).toEqual([]);
  });
  it("cor B só na frente perde para a cor A em «Todas as zonas» (A vem primeiro): a regra de B fica sem efeito na frente", () => {
    const regras = [L(CORPO, "tudo"), L(FRENTE, "frente")];
    expect(dos(regras, L(FRENTE, "frente"))).toEqual(["frente"]);
    expect(dos(regras, L(CORPO, "tudo"))).toEqual([]);
  });
  it("sem conflitos nem excepções: nenhuma zona sem efeito; todas as zonas do modelo são zonas válidas", () => {
    expect(dos([L(CORPO, "tudo")], L(CORPO, "tudo"))).toEqual([]);
    for (const z of ZONAS_TESTE) expect(ZONAS).toContain(z);
  });
});

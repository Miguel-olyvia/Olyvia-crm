// 24/11 (fase 1): as ZONAS do objecto por parte do modelo. Cada parte de um genérico (categoriasGlb.ts) pertence a uma zona (frente, corpo, tampo, puxadores, pés, estofo) pelo
// nome estável dela; o material `corpo` passa a ser um por zona, e o atributo que pinta cada zona sai do NOME do atributo («Cor da frente» → frente, «Cor do corpo» → corpo,
// «Cor» → todas as outras). Sem nenhum destes atributos tudo fica como hoje. Os GLB não mudam: nenhum nome de parte nem de material mudou.
import { describe, expect, it } from "vitest";
import type { AtributoDef, AtributoProduto } from "../v2/catalogoModelo";
import { CATEGORIAS_GLB, type ParteGlb } from "./categoriasGlb";
import { fotoDosAtributos, modeloParaPrevia } from "./previaProduto3d";
import { ZONAS, aparenciaDaZona, rotuloDaZona, zonaDaParte, zonasDoModelo, zonasDosAtributos, zonasVisuais } from "./zonasGlb";

const parte = (nome: string, mat: ParteGlb["mat"] = "corpo", extra: Partial<ParteGlb> = {}): ParteGlb => ({ nome, forma: "caixa", mat, colocar: () => ({ pos: [0, 0, 0], esc: [1, 1, 1] }), ...extra });

describe("zonaDaParte: a zona vem da `zona` explícita ou, senão, do nome estável da parte", () => {
  it("portas, gavetas, frentes e vidros são a frente", () => {
    for (const n of ["porta", "porta_esq", "porta_dir", "porta_1", "porta_alta", "porta_baixa", "gaveta_1", "gaveta_tampo", "frente_cima", "frente_baixo", "vidro_esq", "vidro_dir"]) {
      expect(zonaDaParte(parte(n)), n).toBe("frente");
    }
  });
  it("puxadores são os puxadores", () => {
    for (const n of ["puxador", "puxador_1", "puxador_gaveta_2", "puxador_porta"]) expect(zonaDaParte(parte(n, "metal")), n).toBe("puxadores");
  });
  it("tampo e tábua são o tampo (o tampo redondo também)", () => {
    for (const n of ["tampo", "tampo_redondo", "tabua"]) expect(zonaDaParte(parte(n)), n).toBe("tampo");
  });
  it("pés, pernas e rodapé são os pés; o pedestal da sanita e do bidé (`pe`, `pe_alto`) é porcelana: fica no corpo", () => {
    for (const n of ["pe_1", "pe_4", "pe_esq", "pe_dir", "perna_1", "perna_4", "rodape"]) expect(zonaDaParte(parte(n)), n).toBe("pes");
    expect(zonaDaParte(parte("pe"), "sanita")).toBe("corpo");
    expect(zonaDaParte(parte("pe_alto"), "bide")).toBe("corpo");
  });
  it("as almofadas do sofá são o estofo; noutros sítios (a cama) uma almofada de material fixo não tem zona", () => {
    expect(zonaDaParte(parte("almofada_assento_1"), "sofa")).toBe("estofo");
    expect(zonaDaParte(parte("almofada_costas_3"), "sofa")).toBe("estofo");
    expect(zonaDaParte(parte("almofada_1", "interior"), "cama")).toBeUndefined();
  });
  it("as restantes partes de material `corpo` são o corpo", () => {
    for (const n of ["corpo", "corpo_a", "caixa", "base", "estrado", "cabeceira", "cuvete", "aro", "painel", "moldura"]) expect(zonaDaParte(parte(n)), n).toBe("corpo");
  });
  it("as partes de material fixo ficam sem zona (interior, água, metal, escuro…)", () => {
    for (const mat of ["interior", "agua", "metal", "escuro", "branco", "vidroEscuro", "plastico", "luz", "espelho"] as const) expect(zonaDaParte(parte("cuba", mat)), mat).toBeUndefined();
  });
  it("a `zona` explícita manda sobre o nome e sobre o material", () => {
    expect(zonaDaParte(parte("porta_esq", "corpo", { zona: "corpo" }))).toBe("corpo");
    expect(zonaDaParte(parte("base", "corpo", { zona: "estofo" }))).toBe("estofo");
    expect(zonaDaParte(parte("qualquer", "metal", { zona: "puxadores" }))).toBe("puxadores");
  });
});

/** O resumo de TODAS as partes das 31 receitas (35 até 27/11, quando a cama, a secretária, o sofá e a mesa saíram): «categoria:parte:material». Foi tirado do código ANTES desta fase e prova que nenhum nome de parte nem de material mudou. */
const resumo = CATEGORIAS_GLB.flatMap((c) => c.partes.map((p) => `${c.id}:${p.nome}:${p.mat}`)).join("|");
const fnv1a = (s: string): string => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); };

describe("as 31 receitas: as zonas cobrem tudo e nada do que existe mudou", () => {
  it("são 31 categorias", () => { expect(CATEGORIAS_GLB).toHaveLength(31); });
  it("nenhuma parte de material `corpo` fica sem zona", () => {
    const sem = CATEGORIAS_GLB.flatMap((c) => c.partes.filter((p) => p.mat === "corpo" && !zonaDaParte(p, c.id)).map((p) => `${c.id}:${p.nome}`));
    expect(sem).toEqual([]);
  });
  it("as partes de material fixo (interior, vidro, água, metal das torneiras…) que não têm nome de zona ficam sem zona", () => {
    for (const c of CATEGORIAS_GLB) for (const p of c.partes) if (p.mat !== "corpo" && !p.zona && !/^(porta|gaveta|frente|vidro|puxador|tampo|tabua|pe_|perna_|rodape|pes$)/.test(p.nome)) expect(zonaDaParte(p, c.id), `${c.id}:${p.nome}`).toBeUndefined();
  });
  it("só as zonas conhecidas aparecem", () => {
    for (const c of CATEGORIAS_GLB) for (const p of c.partes) { const z = zonaDaParte(p, c.id); if (z) expect(ZONAS).toContain(z); }
  });
  it("NENHUM nome de parte nem de material mudou (o GLB atribui o material pelo nome do nó)", () => {
    expect(resumo.split("|")).toHaveLength(NUMERO_DE_PARTES);
    expect(fnv1a(resumo)).toBe(HASH_DAS_PARTES);
  });
  it("as zonas dos móveis de cozinha: a porta é frente, o corpo é corpo, o puxador é puxador", () => {
    const base = CATEGORIAS_GLB.find((c) => c.id === "modulo_base")!;
    const z = (n: string) => zonaDaParte(base.partes.find((p) => p.nome === n)!, base.id);
    expect(z("corpo")).toBe("corpo"); expect(z("porta_esq")).toBe("frente"); expect(z("gaveta_2")).toBe("frente"); expect(z("puxador_porta")).toBe("puxadores"); expect(z("tampo")).toBe("tampo"); expect(z("rodape")).toBe("pes");
  });
});
// preenchido a seguir à primeira corrida, contra o código sem zonas; 27/11: 399 partes (448 menos as 49 dos quatro genéricos tirados)
const NUMERO_DE_PARTES = 399;
const HASH_DAS_PARTES = "86db871d"; // 27/11: = o hash das 35 (9ac198b7) sem a cama, a secretária, o sofá e a mesa (provado contra o ficheiro antigo)

/* ------------------------------------------------------------------ os atributos de cor */
const op = (id: string, foto: string | null, hex: string | null = null) => ({ id, valor: id, nome: id, hex, foto, ordem: 1 });
const def = (id: string, nome: string, codigo: string, opcoes: AtributoDef["opcoes"]): AtributoDef => ({ id, codigo, nome, tipo: "lista", temHex: true, temFoto: true, ordem: 1, opcoes });
const COR_CORPO = def("d-corpo", "Cor do corpo", "cor_corpo", [op("artisan", "org/artisan.webp"), op("preto", null, "#000000")]);
const COR_FRENTE = def("d-frente", "Cor da frente", "cor_frente", [op("oak", "org/oak.webp"), op("branco", null, "#ffffff")]);
const COR = def("d-cor", "Cor", "cor", [op("nogal", "org/nogal.webp"), op("cinza", null, "#888888")]);
const escolha = (d: AtributoDef, opcaoId: string): AtributoProduto => ({ atributoId: d.id, opcaoId, valor: opcaoId });

describe("aparenciaDaZona: as omissões POR NOME DO ATRIBUTO", () => {
  const defs = [COR_CORPO, COR_FRENTE];
  const attrs = [escolha(COR_CORPO, "artisan"), escolha(COR_FRENTE, "oak")];
  it("«Cor da frente» pinta a frente e «Cor do corpo» pinta o corpo: saem diferentes", () => {
    expect(aparenciaDaZona("frente", attrs, defs)).toEqual({ atributo: "Cor da frente", foto: "org/oak.webp", hex: null });
    expect(aparenciaDaZona("corpo", attrs, defs)).toEqual({ atributo: "Cor do corpo", foto: "org/artisan.webp", hex: null });
  });
  it("as outras zonas (tampo, pés, puxadores, estofo) seguem o corpo quando há «Cor do corpo»", () => {
    for (const z of ["tampo", "pes", "puxadores", "estofo"] as const) expect(aparenciaDaZona(z, attrs, defs), z).toEqual({ atributo: "Cor do corpo", foto: "org/artisan.webp", hex: null });
  });
  it("«Cor» pinta todas as zonas que não têm atributo próprio", () => {
    const d = [COR_FRENTE, COR]; const a = [escolha(COR_FRENTE, "oak"), escolha(COR, "nogal")];
    expect(aparenciaDaZona("frente", a, d)?.foto).toBe("org/oak.webp");
    for (const z of ["corpo", "tampo", "pes", "puxadores", "estofo"] as const) expect(aparenciaDaZona(z, a, d), z).toEqual({ atributo: "Cor", foto: "org/nogal.webp", hex: null });
  });
  it("o único atributo de cor (seja qual for o nome) pinta todas as zonas", () => {
    for (const d of [COR_CORPO, COR_FRENTE, COR]) {
      const a = [escolha(d, d.opcoes[0].id)];
      for (const z of ZONAS) expect(aparenciaDaZona(z, a, [d]), `${d.nome} ${z}`).toEqual({ atributo: d.nome, foto: d.opcoes[0].foto, hex: null });
    }
  });
  it("com dois atributos de cor e só «Cor da frente» escolhido, só a frente é pintada: o corpo fica como está", () => {
    const a = [escolha(COR_FRENTE, "oak")];
    expect(aparenciaDaZona("frente", a, defs)?.foto).toBe("org/oak.webp");
    expect(aparenciaDaZona("corpo", a, defs)).toBeNull();
    expect(aparenciaDaZona("tampo", a, defs)).toBeNull();
  });
  it("uma opção só com hex dá o hex; a opção escolhida sem foto NÃO vai buscar a foto de outro atributo", () => {
    const a = [escolha(COR_CORPO, "preto"), escolha(COR_FRENTE, "branco")];
    expect(aparenciaDaZona("corpo", a, defs)).toEqual({ atributo: "Cor do corpo", foto: null, hex: "#000000" });
    expect(aparenciaDaZona("frente", a, defs)).toEqual({ atributo: "Cor da frente", foto: null, hex: "#ffffff" });
  });
  it("sem atributos, sem definições ou sem escolha: nada (a cor lisa do modelo)", () => {
    expect(aparenciaDaZona("frente", undefined, defs)).toBeNull();
    expect(aparenciaDaZona("frente", attrs, undefined)).toBeNull();
    expect(aparenciaDaZona("frente", [], defs)).toBeNull();
    expect(aparenciaDaZona("frente", attrs, [])).toBeNull();
  });
  it("um hex inválido não se usa", () => {
    const d = def("d-x", "Cor", "cor", [op("mau", null, "vermelho")]);
    expect(aparenciaDaZona("corpo", [escolha(d, "mau")], [d])).toEqual({ atributo: "Cor", foto: null, hex: null });
  });
  it("o gancho `ligacoes` (a ligação explícita atributo → zona, fase 2) manda sobre os nomes: o atributo só pinta as zonas a que está ligado", () => {
    const a = [escolha(COR_CORPO, "artisan"), escolha(COR_FRENTE, "oak")];
    const ligacoes = { "d-frente": ["tampo", "pes"] as const };
    expect(aparenciaDaZona("tampo", a, defs, ligacoes)?.atributo).toBe("Cor da frente");
    expect(aparenciaDaZona("pes", a, defs, ligacoes)?.atributo).toBe("Cor da frente");
    expect(aparenciaDaZona("frente", a, defs, ligacoes)?.atributo).toBe("Cor do corpo"); // já não é a «Cor da frente»: caiu para o corpo
    expect(aparenciaDaZona("corpo", a, defs, ligacoes)?.atributo).toBe("Cor do corpo");
  });
});

// 27/11: a Textura (Pizarra, Liso, Piedra) passou a ter hex e foto na base para a foto da opção se poder carregar, mas não é um atributo de cor: nunca pinta uma zona
// (a foto dela vai ao corpo, tingida, por texturaDosAtributos) e não conta para «o único atributo de cor».
describe("aparenciaDaZona: a Textura não é um atributo de cor", () => {
  const TEXTURA = def("d-textura", "Textura", "textura", [op("pizarra", "org/pizarra.webp"), op("liso", null)]);
  it("com a Textura escolhida, nenhuma zona é pintada por ela", () => {
    for (const z of ZONAS) expect(aparenciaDaZona(z, [escolha(TEXTURA, "pizarra")], [TEXTURA]), z).toBeNull();
  });
  it("não faz da Cor um atributo «que já não é o único»: a Cor continua a pintar todas as zonas", () => {
    const a = [escolha(COR, "cinza"), escolha(TEXTURA, "pizarra")];
    for (const z of ZONAS) expect(aparenciaDaZona(z, a, [COR, TEXTURA]), z).toEqual({ atributo: "Cor", foto: null, hex: "#888888" });
  });
  it("um atributo qualquer (sem nome conhecido) que é o único de cor continua a pintar com a Textura ao lado", () => {
    const outro = def("d-x", "Padrão", "padrao", [op("a", null, "#123456")]);
    for (const z of ZONAS) expect(aparenciaDaZona(z, [escolha(outro, "a"), escolha(TEXTURA, "pizarra")], [outro, TEXTURA]), z).toEqual({ atributo: "Padrão", foto: null, hex: "#123456" });
  });
});

describe("zonasDosAtributos: o que cada zona leva, e se as zonas diferem", () => {
  it("sem nenhum atributo de cor (ou sem escolha): undefined, o modelo fica exactamente como hoje", () => {
    expect(zonasDosAtributos(undefined, undefined)).toBeUndefined();
    expect(zonasDosAtributos([], [COR_CORPO, COR_FRENTE])).toBeUndefined();
    expect(zonasDosAtributos([{ atributoId: "outro", opcaoId: "x" }], [COR_CORPO])).toBeUndefined();
  });
  it("«Cor» sozinha, ou um único atributo de cor: todas as zonas iguais (porZona = false), o caminho de hoje", () => {
    for (const d of [COR, COR_CORPO, COR_FRENTE]) {
      const r = zonasDosAtributos([escolha(d, d.opcoes[0].id)], [d])!;
      expect(r.porZona, d.nome).toBe(false);
      for (const z of ZONAS) expect(r.zonas[z]?.foto, `${d.nome} ${z}`).toBe(d.opcoes[0].foto);
    }
  });
  it("REGRESSÃO: nos casos de zonas iguais, a foto é a que o `fotoDosAtributos` de hoje dá", () => {
    const casos: { attrs: AtributoProduto[]; defs: AtributoDef[] }[] = [
      { attrs: [escolha(COR, "nogal")], defs: [COR] },
      { attrs: [escolha(COR_CORPO, "artisan")], defs: [COR_CORPO] },
      { attrs: [escolha(COR_CORPO, "artisan"), escolha(COR_FRENTE, "artisan2")], defs: [COR_CORPO, def("d-frente", "Cor da frente", "cor_frente", [op("artisan2", "org/artisan.webp")])] },
    ];
    for (const { attrs, defs } of casos) {
      const r = zonasDosAtributos(attrs, defs);
      expect(r?.porZona).toBe(false);
      expect(r?.zonas.corpo?.foto ?? null).toBe(fotoDosAtributos(attrs, defs));
    }
  });
  it("«Cor do corpo» + «Cor da frente» com fotos diferentes: porZona = true, a frente e o corpo diferem", () => {
    const r = zonasDosAtributos([escolha(COR_CORPO, "artisan"), escolha(COR_FRENTE, "oak")], [COR_CORPO, COR_FRENTE])!;
    expect(r.porZona).toBe(true);
    expect(r.zonas.frente?.foto).toBe("org/oak.webp");
    expect(r.zonas.corpo?.foto).toBe("org/artisan.webp");
  });
  it("só «Cor da frente» escolhida, havendo também «Cor do corpo» (por escolher): porZona = true e só a frente tem aparência", () => {
    const r = zonasDosAtributos([escolha(COR_FRENTE, "oak")], [COR_CORPO, COR_FRENTE])!;
    expect(r.porZona).toBe(true);
    expect(Object.keys(r.zonas)).toEqual(["frente"]);
  });
});

describe("zonasVisuais: a aparência com o URL público da foto, para o 3D", () => {
  it("troca o caminho da foto pelo URL (40 cm por repetição), mantém o hex e o nome do atributo", () => {
    const r = zonasDosAtributos([escolha(COR_CORPO, "artisan"), escolha(COR_FRENTE, "branco")], [COR_CORPO, COR_FRENTE])!;
    const v = zonasVisuais(r, (c) => `https://cdn/${c}`);
    expect(v.porZona).toBe(true);
    expect(v.zonas.corpo).toEqual({ atributo: "Cor do corpo", textura: { url: "https://cdn/org/artisan.webp", ladoCm: 40 } });
    expect(v.zonas.frente).toEqual({ atributo: "Cor da frente", cor: "#ffffff" });
  });
  it("sem URL (o storage falhou), fica a cor lisa do modelo para essa zona", () => {
    const r = zonasDosAtributos([escolha(COR_CORPO, "artisan"), escolha(COR_FRENTE, "oak")], [COR_CORPO, COR_FRENTE])!;
    expect(zonasVisuais(r, () => null).zonas.corpo).toEqual({ atributo: "Cor do corpo" });
  });
});

describe("zonasDoModelo: as zonas que o modelo tem (só as que se pintam), com o número de partes visíveis", () => {
  const modelo = (modelo3d: string, medida = { largura: 80, comprimento: 50, espessura: 45 }) => modeloParaPrevia({ nome: "Peça de teste", no: null, arvore: [], modelo3d, medida });
  it("o móvel de lavatório com duas gavetas: frente (2) e corpo (1)", () => {
    const z = zonasDoModelo(modelo("movel_lavatorio"));
    expect(z).toEqual([{ zona: "frente", partes: 2 }, { zona: "corpo", partes: 1 }]);
  });
  it("a ordem é a das zonas (frente, corpo, tampo, puxadores, pés, estofo)", () => {
    expect(ZONAS).toEqual(["frente", "corpo", "tampo", "puxadores", "pes", "estofo"]);
    const z = zonasDoModelo(modelo("modulo_base")).map((x) => x.zona);
    expect(z).toEqual(ZONAS.filter((x) => z.includes(x)));
  });
  it("o módulo base de cozinha tem frente (as portas) e corpo; o tampo, o rodapé e os puxadores têm material fixo e não se pintam", () => {
    const z = zonasDoModelo(modelo("modulo_base", { largura: 60, comprimento: 58, espessura: 80 }));
    expect(z.map((x) => x.zona)).toEqual(["frente", "corpo"]);
  });
  it("a mesa tirada (27/11, sem produtos) já não tem genérico, e um modelo sem genérico não tem zonas", () => {
    expect(zonasDoModelo(modelo("mesa", { largura: 120, comprimento: 80, espessura: 75 }))).toEqual([]);
  });
  it("um modelo sem genérico (o desenho aproximado) não tem zonas", () => {
    const m = modelo("movel_lavatorio");
    expect(zonasDoModelo({ ...m, mockup3d: { ...m.mockup3d, generico: undefined, params: { k: "tampo", espessura: 0.03 } } })).toEqual([]);
  });
  it("rotuloDaZona: nomes em português", () => {
    expect(ZONAS.map(rotuloDaZona)).toEqual(["Frente", "Corpo", "Tampo", "Puxadores", "Pés", "Estofo"]);
  });
});

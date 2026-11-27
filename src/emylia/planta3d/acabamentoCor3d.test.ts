// 25/11: o 3D escolhe foto e cor POR NOME de atributo. Depois da separação Cor/Acabamento (migration 20270126430000_separar_cor_acabamento_mudelar.sql) o Artisan, o Oak, o Denver, o Nogal
// e os metais (Cobre, Ouro, Inox…) passam para «Acabamento da frente», «Acabamento do corpo» e «Acabamento da cor» (as opções movidas mantêm id, foto e hex). O 3D tem de os ler
// (zona a zona: acabamento primeiro, a cor lisa depois), e sem nenhum destes atributos o resultado tem de ser EXACTAMENTE o de antes (a REGRESSÃO compara com uma cópia do código antigo).
import { describe, expect, it } from "vitest";
import real from "./__fixtures__/axisReal.json";
import { catalogo0, type AtributoDef, type AtributoProduto } from "../v2/catalogoModelo";
import { juntarAtributos, juntarTabelas, linhasDe } from "../real/lerCatalogo";
import { atributosDeValores, montarCatalogo } from "../real/catalogoReal";
import { produtoDeLeitura } from "../real/produtosLeves";
import { sem } from "./catalogo3d";
import { chaveDeExclusao } from "./aspetoZonas";
import { ehAtributoDeTextura, leiturasDoProduto, leiturasPorOmissao } from "./acabamentoCor3d";
import { corDosAtributos, fotoDosAtributos } from "./previaProduto3d";
import { ZONAS, aparenciaDaZona, aparenciaUnicaDasZonas, zonasDosAtributos, zonasVisuais, type ZonaGlb } from "./zonasGlb";

const op = (id: string, foto: string | null, hex: string | null = null, extra: Partial<AtributoDef["opcoes"][number]> = {}) => ({ id, valor: id, nome: id, hex, foto, ordem: 1, ...extra });
const def = (id: string, nome: string, codigo: string, opcoes: AtributoDef["opcoes"], extra: Partial<AtributoDef> = {}): AtributoDef => ({ id, codigo, nome, tipo: "lista", temHex: true, temFoto: true, ordem: 1, opcoes, ...extra });
const escolha = (d: AtributoDef, opcaoId: string): AtributoProduto => ({ atributoId: d.id, opcaoId, valor: opcaoId });

// os atributos ANTIGOS
const COR_CORPO = def("d-corpo", "Cor do corpo", "cor_corpo", [op("white", null, "#fcfcfc"), op("preto", null, "#151414"), op("artisan-c", "org/artisan.webp")]);
const COR_FRENTE = def("d-frente", "Cor da frente", "cor_frente", [op("branco-f", null, "#ffffff"), op("oak-c", "org/oak.webp")]);
const COR = def("d-cor", "Cor", "cor", [op("branco", null, "#fcfcfc"), op("preto-g", null, "#000000"), op("nogal-c", "org/nogal.webp")]);
// os atributos NOVOS (as opções movidas mantêm id, foto e hex)
const AC_CORPO = def("d-ac-corpo", "Acabamento do corpo", "acabamento_corpo", [op("artisan", "org/artisan.webp"), op("denver", "org/denver.webp"), op("halifax", null), op("cobre-corpo", null, "#FFBA6B")]);
const AC_FRENTE = def("d-ac-frente", "Acabamento da frente", "acabamento_frente", [op("oak", "org/oak.webp"), op("artisan-f", "org/artisan.webp"), op("halifax-f", null)]);
const AC_COR = def("d-ac-cor", "Acabamento da cor", "acabamento_cor", [
  op("oak-g", "org/oak.webp"), op("nogal", "org/nogal.webp"), op("cobre", null, "#FFBA6B", { metal: true }), op("ouro", null, "#EAE78A", { metal: true }), op("inox", null, "#BFC3C7", { metal: true }),
  op("acero-rayado", null, null, { metal: true }), op("so-nome", null),
], { temAspeto: true });
const DECOR = def("d-decor", "Decor", "decor", [op("nogal-d", "org/nogal.webp"), op("sem-nada", null)]);
// o «Acabamento» ORIGINAL (Natural, Frost Plus…): não é cor, a menos que a opção tenha foto ou hex
const ACABAMENTO = def("d-acab", "Acabamento", "acabamento", [op("natural", null), op("cromado", null, "#CFD3D6"), op("madeira", "org/madeira.webp")]);

const foto = (a: readonly AtributoProduto[], d: readonly AtributoDef[]) => fotoDosAtributos(a, d);
const zona = (z: ZonaGlb, a: readonly AtributoProduto[], d: readonly AtributoDef[], lig?: Record<string, readonly ZonaGlb[]>, exc?: ReadonlySet<string>) => aparenciaDaZona(z, a, d, lig, exc);

describe("fotoDosAtributos com os atributos novos: o acabamento antes da cor, o corpo antes da frente antes do geral", () => {
  it("«Acabamento do corpo» (Artisan) manda sobre «Cor do corpo»", () => {
    expect(foto([escolha(AC_CORPO, "artisan"), escolha(COR_CORPO, "white")], [COR_CORPO, AC_CORPO])).toBe("org/artisan.webp");
  });
  it("«Acabamento da frente» (Oak) manda sobre «Cor da frente»", () => {
    expect(foto([escolha(AC_FRENTE, "oak"), escolha(COR_FRENTE, "branco-f")], [COR_FRENTE, AC_FRENTE])).toBe("org/oak.webp");
  });
  it("um produto com Cor = Branco e Acabamento da cor = Oak mostra o Oak", () => {
    expect(foto([escolha(COR, "branco"), escolha(AC_COR, "oak-g")], [COR, AC_COR])).toBe("org/oak.webp");
  });
  it("a prioridade inteira: acabamento do corpo, cor do corpo, acabamento da frente, cor da frente, acabamento da cor, cor", () => {
    const todos = [COR, AC_COR, COR_FRENTE, AC_FRENTE, COR_CORPO, AC_CORPO];
    const tudo = [escolha(COR, "nogal-c"), escolha(AC_COR, "nogal"), escolha(COR_FRENTE, "oak-c"), escolha(AC_FRENTE, "oak"), escolha(COR_CORPO, "artisan-c"), escolha(AC_CORPO, "denver")];
    const sem1 = (id: string) => tudo.filter((a) => a.atributoId !== id);
    expect(foto(tudo, todos)).toBe("org/denver.webp"); // acabamento do corpo
    expect(foto(sem1(AC_CORPO.id), todos)).toBe("org/artisan.webp"); // cor do corpo
    expect(foto(sem1(AC_CORPO.id).filter((a) => a.atributoId !== COR_CORPO.id), todos)).toBe("org/oak.webp"); // acabamento da frente
    expect(foto(tudo.filter((a) => [COR.id, AC_COR.id, COR_FRENTE.id].includes(a.atributoId)), todos)).toBe("org/oak.webp"); // cor da frente (oak-c)
    expect(foto(tudo.filter((a) => [COR.id, AC_COR.id].includes(a.atributoId)), todos)).toBe("org/nogal.webp"); // acabamento da cor
    expect(foto(tudo.filter((a) => a.atributoId === COR.id), todos)).toBe("org/nogal.webp"); // cor
  });
  it("o azulejo Nogal em «Decor» (e a Decor sozinha) dá a foto do Nogal, mesmo com uma Cor lisa ao lado", () => {
    expect(foto([escolha(DECOR, "nogal-d")], [DECOR])).toBe("org/nogal.webp");
    expect(foto([escolha(COR, "branco"), escolha(DECOR, "nogal-d")], [COR, DECOR])).toBe("org/nogal.webp");
  });
  it("um acabamento cuja opção não tem foto nem hex não conta: fica a cor (Halifax não apaga a textura da Cor)", () => {
    expect(foto([escolha(AC_CORPO, "halifax"), escolha(COR_CORPO, "artisan-c")], [COR_CORPO, AC_CORPO])).toBe("org/artisan.webp");
    expect(foto([escolha(AC_COR, "so-nome"), escolha(COR, "nogal-c")], [COR, AC_COR])).toBe("org/nogal.webp");
    expect(foto([escolha(AC_FRENTE, "halifax-f")], [COR_FRENTE, AC_FRENTE])).toBeNull();
  });
  it("um acabamento só com hex (o metal) é quem manda, e não há foto: a cor lisa dele, sem a textura da Cor", () => {
    expect(foto([escolha(COR, "nogal-c"), escolha(AC_COR, "cobre")], [COR, AC_COR])).toBeNull();
  });
  it("o «Acabamento» original e a «Decor» entram como fonte quando a opção tem foto ou hex, nunca sem uma delas", () => {
    expect(foto([escolha(COR, "branco"), escolha(AC_COR, "so-nome"), escolha(ACABAMENTO, "madeira")], [COR, AC_COR, ACABAMENTO])).toBe("org/madeira.webp");
    expect(foto([escolha(COR, "nogal-c"), escolha(ACABAMENTO, "natural")], [COR, AC_COR, ACABAMENTO])).toBe("org/nogal.webp"); // «Natural» não é cor
    expect(foto([escolha(COR, "nogal-c"), escolha(DECOR, "sem-nada")], [COR, DECOR])).toBe("org/nogal.webp");
  });
  it("o «Acabamento» original, sem nenhum atributo novo (a separação por fazer), não entra: a cor é a de hoje", () => {
    expect(foto([escolha(COR, "nogal-c"), escolha(ACABAMENTO, "madeira")], [COR, ACABAMENTO])).toBe("org/nogal.webp");
  });
});

describe("corDosAtributos com os atributos novos: o metal dá a cor pelo hex da opção", () => {
  it("a torneira com Acabamento da cor = Cobre ou Ouro: o hex do metal, mesmo com uma Cor ao lado", () => {
    expect(corDosAtributos([escolha(AC_COR, "cobre")], [AC_COR])).toBe("#FFBA6B");
    expect(corDosAtributos([escolha(AC_COR, "ouro")], [AC_COR])).toBe("#EAE78A");
    expect(corDosAtributos([escolha(AC_COR, "inox")], [AC_COR])).toBe("#BFC3C7");
    expect(corDosAtributos([escolha(COR, "preto-g"), escolha(AC_COR, "cobre")], [COR, AC_COR])).toBe("#FFBA6B");
  });
  it("sem hex no acabamento (o Oak tem foto, o «Acero rayado» não tem nada) segue a Cor", () => {
    expect(corDosAtributos([escolha(COR, "branco"), escolha(AC_COR, "oak-g")], [COR, AC_COR])).toBe("#fcfcfc");
    expect(corDosAtributos([escolha(COR, "branco"), escolha(AC_COR, "acero-rayado")], [COR, AC_COR])).toBe("#fcfcfc");
    expect(corDosAtributos([escolha(AC_COR, "oak-g")], [AC_COR])).toBeUndefined();
  });
  it("o «Acabamento» original com hex (Cromado) só conta com a separação feita; a «Decor» entra sempre que tem hex", () => {
    expect(corDosAtributos([escolha(COR, "branco"), escolha(ACABAMENTO, "cromado")], [COR, ACABAMENTO])).toBe("#fcfcfc");
    expect(corDosAtributos([escolha(COR, "branco"), escolha(ACABAMENTO, "cromado")], [COR, AC_COR, ACABAMENTO])).toBe("#CFD3D6");
    const decorHex = def("d-decor2", "Decor", "decor", [op("pedra", null, "#A3A3A3")]);
    expect(corDosAtributos([escolha(COR, "branco"), escolha(decorHex, "pedra")], [COR, decorHex])).toBe("#A3A3A3");
  });
  it("«Acabamento do corpo» e «da frente» não mudam a cor única (o corpo e a frente têm as zonas)", () => {
    expect(corDosAtributos([escolha(AC_CORPO, "cobre-corpo"), escolha(COR, "branco")], [COR, AC_CORPO])).toBe("#fcfcfc");
  });
});

describe("aparenciaDaZona com os atributos novos", () => {
  it("o móvel de lavatório com corpo White e frente Oak: o corpo lê «Cor do corpo», a frente lê «Acabamento da frente»", () => {
    const d = [COR_CORPO, AC_FRENTE, AC_CORPO], a = [escolha(COR_CORPO, "white"), escolha(AC_FRENTE, "oak")];
    expect(zona("frente", a, d)).toEqual({ atributo: "Acabamento da frente", foto: "org/oak.webp", hex: null });
    expect(zona("corpo", a, d)).toEqual({ atributo: "Cor do corpo", foto: null, hex: "#fcfcfc" });
    expect(zona("tampo", a, d)).toEqual({ atributo: "Cor do corpo", foto: null, hex: "#fcfcfc" }); // as zonas sem atributo próprio seguem o corpo, como hoje
  });
  it("a coluna AXIS Artisan (corpo e frente): as duas zonas levam a foto do Artisan", () => {
    const d = [AC_CORPO, AC_FRENTE], a = [escolha(AC_CORPO, "artisan"), escolha(AC_FRENTE, "artisan-f")];
    expect(zona("corpo", a, d)).toEqual({ atributo: "Acabamento do corpo", foto: "org/artisan.webp", hex: null });
    expect(zona("frente", a, d)).toEqual({ atributo: "Acabamento da frente", foto: "org/artisan.webp", hex: null });
  });
  it("em cada zona a foto de um acabamento tem prioridade sobre a cor lisa: Cor = Branco e Acabamento da cor = Oak pintam tudo com o Oak", () => {
    const d = [COR, AC_COR], a = [escolha(COR, "branco"), escolha(AC_COR, "oak-g")];
    for (const z of ZONAS) expect(zona(z, a, d), z).toEqual({ atributo: "Acabamento da cor", foto: "org/oak.webp", hex: null });
  });
  it("o azulejo Nogal (Decor): todas as zonas levam o Nogal, e a Cor lisa não o tapa", () => {
    const d = [COR, DECOR], a = [escolha(COR, "branco"), escolha(DECOR, "nogal-d")];
    for (const z of ZONAS) expect(zona(z, a, d), z).toEqual({ atributo: "Decor", foto: "org/nogal.webp", hex: null });
  });
  it("a torneira com Acabamento da cor = Cobre / Ouro: a cor do hex do metal em todas as zonas, e metal com «Tem aspeto»", () => {
    for (const [id, hex] of [["cobre", "#FFBA6B"], ["ouro", "#EAE78A"]] as const) {
      const a = [escolha(COR, "preto-g"), escolha(AC_COR, id)];
      for (const z of ZONAS) expect(zona(z, a, [COR, AC_COR]), `${id} ${z}`).toEqual({ atributo: "Acabamento da cor", foto: null, hex, metal: true });
    }
  });
  it("um metal sem hex nem foto mas com «Tem aspeto» e metal conta (o «Acero rayado»); uma opção sem nada não conta e cai na Cor", () => {
    expect(zona("corpo", [escolha(AC_COR, "acero-rayado")], [AC_COR])?.metal).toBe(true);
    expect(zona("corpo", [escolha(COR, "branco"), escolha(AC_COR, "so-nome")], [COR, AC_COR])).toEqual({ atributo: "Cor", foto: null, hex: "#fcfcfc" });
  });
  it("«Halifax» (sem foto nem hex) no «Acabamento da frente» não tapa a «Cor da frente»", () => {
    const d = [COR_FRENTE, AC_FRENTE];
    expect(zona("frente", [escolha(AC_FRENTE, "halifax-f"), escolha(COR_FRENTE, "branco-f")], d)).toEqual({ atributo: "Cor da frente", foto: null, hex: "#ffffff" });
  });
  it("«Acabamento da frente» só pinta a frente; o corpo fica como está com um «Acabamento do corpo» sem escolha", () => {
    const d = [AC_CORPO, AC_FRENTE], a = [escolha(AC_FRENTE, "oak")];
    expect(zona("frente", a, d)?.foto).toBe("org/oak.webp");
    expect(zona("corpo", a, d)).toBeNull();
  });
  it("a ligação explícita manda sobre o nome: «Acabamento da frente» ligado ao corpo pinta o corpo e já não a frente", () => {
    const d = [COR_FRENTE, AC_FRENTE, AC_CORPO], a = [escolha(AC_FRENTE, "oak")];
    expect(zona("corpo", a, d, { [AC_FRENTE.id]: ["corpo"] })?.atributo).toBe("Acabamento da frente");
    expect(zona("frente", a, d, { [AC_FRENTE.id]: ["corpo"] })).toBeNull();
  });
  it("uma ligação explícita de outro atributo à frente ganha ao «Acabamento da frente» pelo nome", () => {
    const d = [COR, AC_FRENTE], a = [escolha(COR, "preto-g"), escolha(AC_FRENTE, "oak")];
    expect(zona("frente", a, d, { [COR.id]: ["frente"] })?.atributo).toBe("Cor");
  });
  it("«aplicar: não» tira o acabamento dessa zona, mesmo pelo nome", () => {
    const d = [COR_FRENTE, AC_FRENTE], a = [escolha(AC_FRENTE, "oak"), escolha(COR_FRENTE, "branco-f")];
    expect(zona("frente", a, d, undefined, new Set([chaveDeExclusao(AC_FRENTE.id, "frente")]))?.atributo).toBe("Cor da frente");
  });
  it("o «Acabamento» original (Natural, Frost Plus) nunca pinta: só com foto ou hex, e só com a separação feita", () => {
    const d = [COR, AC_COR, ACABAMENTO];
    expect(zona("corpo", [escolha(COR, "branco"), escolha(ACABAMENTO, "natural")], d)?.atributo).toBe("Cor");
    expect(zona("corpo", [escolha(COR, "branco"), escolha(ACABAMENTO, "madeira")], d)).toEqual({ atributo: "Acabamento", foto: "org/madeira.webp", hex: null });
    expect(zona("corpo", [escolha(COR, "branco"), escolha(ACABAMENTO, "madeira")], [COR, ACABAMENTO])?.atributo).toBe("Cor");
  });
  it("zonasDosAtributos e zonasVisuais: frente Oak e corpo White diferem (porZona) e a foto passa a URL", () => {
    const d = [COR_CORPO, AC_FRENTE], a = [escolha(COR_CORPO, "white"), escolha(AC_FRENTE, "oak")];
    const z = zonasDosAtributos(a, d)!;
    expect(z.porZona).toBe(true);
    const v = zonasVisuais(z, (c) => `https://x/${c}`);
    expect(v.zonas.frente?.textura?.url).toBe("https://x/org/oak.webp");
    expect(v.zonas.corpo).toMatchObject({ atributo: "Cor do corpo", cor: "#fcfcfc" });
  });
  it("a torneira de metal: com todas as zonas iguais não há `porZona` (segue a cor única de corDosAtributos)", () => {
    const z = zonasDosAtributos([escolha(AC_COR, "ouro")], [AC_COR])!;
    expect(z.porZona).toBe(false);
    expect(z.zonas.corpo).toMatchObject({ hex: "#EAE78A", metal: true });
  });
});

/* ------------------------------------------------------------------ REGRESSÃO: sem os atributos novos, igual ao código de antes */
// cópia (só da lógica de nomes) do código de ANTES desta mudança
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const antesPapel = (d: AtributoDef): "corpo" | "frente" | "geral" | null => { const n = sem(d.nome).trim(); return n === "cor do corpo" ? "corpo" : n === "cor da frente" ? "frente" : n === "cor" || d.codigo.toLowerCase() === "cor" ? "geral" : null; };
function antesFoto(attrs: readonly AtributoProduto[], defs: readonly AtributoDef[]): string | null {
  const cores = defs.filter((d) => d.temHex || d.temFoto);
  const prioridade = (d: AtributoDef): number => { const n = sem(d.nome).trim(); return n === "cor do corpo" ? 0 : n === "cor da frente" ? 1 : n === "cor" || d.codigo.toLowerCase() === "cor" ? 2 : -1; };
  const nomeadas = cores.map((d) => ({ d, p: prioridade(d) })).filter((x) => x.p >= 0).sort((a, b) => a.p - b.p).map((x) => x.d);
  for (const d of nomeadas.length ? nomeadas : cores.length === 1 ? cores : []) {
    const e = attrs.find((a) => a.atributoId === d.id && a.opcaoId);
    if (e) return d.opcoes.find((o) => o.id === e.opcaoId)?.foto || null;
  }
  return null;
}
function antesCor(attrs: readonly AtributoProduto[], defs: readonly AtributoDef[]): string | undefined {
  const d = defs.find((x) => x.codigo.toLowerCase() === "cor");
  const e = d && attrs.find((a) => a.atributoId === d.id && a.opcaoId);
  const hex = e ? d.opcoes.find((o) => o.id === e.opcaoId)?.hex : null;
  return hex && HEX.test(hex) ? hex : undefined;
}
function antesZona(zona: ZonaGlb, attrs: readonly AtributoProduto[], defs: readonly AtributoDef[], ligacoes?: Record<string, readonly ZonaGlb[]>, excluidos?: ReadonlySet<string>) {
  const cores = defs.filter((d) => (d.temHex || d.temFoto) && !excluidos?.has(chaveDeExclusao(d.id, zona)));
  const ligada = (d: AtributoDef) => !!ligacoes?.[d.id]?.length;
  const escolhida = (d: AtributoDef) => { const a = attrs.find((x) => x.atributoId === d.id && x.opcaoId); if (!a) return null; const o = d.opcoes.find((x) => x.id === a.opcaoId); return { atributo: d.nome, foto: o?.foto || null, hex: o?.hex && HEX.test(o.hex) ? o.hex : null }; };
  const primeira = (ds: readonly AtributoDef[]) => { for (const d of ds) { const r = escolhida(d); if (r) return r; } return null; };
  const livres = cores.filter((d) => !ligada(d));
  return primeira(cores.filter((d) => (ligada(d) ? ligacoes![d.id].includes(zona) : antesPapel(d) === zona)))
    ?? primeira(livres.filter((d) => antesPapel(d) === "geral")) ?? primeira(livres.filter((d) => antesPapel(d) === "corpo")) ?? (cores.length === 1 ? primeira(livres) : null);
}

/** As partes de um conjunto: cada atributo pode estar ausente do produto ou ter uma das suas opções. */
function combinacoes(defs: readonly AtributoDef[]): AtributoProduto[][] {
  let todas: AtributoProduto[][] = [[]];
  for (const d of defs) todas = todas.flatMap((base) => [base, ...d.opcoes.map((o) => [...base, escolha(d, o.id)])]);
  return todas;
}
const ORIGINAIS = [COR_CORPO, COR_FRENTE, COR, def("d-acab-o", "Acabamento", "acabamento", [op("natural", null), op("cromado", null, "#CFD3D6"), op("madeira", "org/madeira.webp")])];
const CONJUNTOS: AtributoDef[][] = [[COR], [COR_CORPO], [COR_FRENTE], [COR_CORPO, COR_FRENTE], [COR_FRENTE, COR], [COR_CORPO, COR_FRENTE, COR], [ORIGINAIS[3]], [COR, ORIGINAIS[3]], [COR_CORPO, COR_FRENTE, ORIGINAIS[3]]];
const LIGACOES: (Record<string, readonly ZonaGlb[]> | undefined)[] = [undefined, { "d-frente": ["tampo", "pes"] }, { "d-cor": ["frente"] }, { "d-corpo": ["frente", "corpo"], "d-cor": ["pes"] }];
const EXCLUIDOS: (ReadonlySet<string> | undefined)[] = [undefined, new Set([chaveDeExclusao("d-corpo", "corpo")]), new Set([chaveDeExclusao("d-cor", "frente"), chaveDeExclusao("d-frente", "frente")])];

describe("REGRESSÃO: sem «Acabamento da cor/corpo/frente» nem «Decor» o resultado é exactamente o de antes", () => {
  it("fotoDosAtributos e corDosAtributos dão o mesmo que o código antigo em todas as combinações de escolhas", () => {
    let n = 0;
    for (const defs of CONJUNTOS) for (const attrs of combinacoes(defs)) { n++; expect(fotoDosAtributos(attrs, defs)).toBe(antesFoto(attrs, defs)); expect(corDosAtributos(attrs, defs)).toBe(antesCor(attrs, defs)); }
    expect(n).toBeGreaterThan(100);
  });
  it("os atributos novos presentes na categoria mas sem valor no produto não mudam nada (com dois ou mais atributos de cor antigos: «o único atributo de cor» conta os atributos da lista)", () => {
    let n = 0;
    for (const defs of CONJUNTOS.filter((c) => c.length > 1 && !c.some((d) => d.codigo === "acabamento"))) for (const attrs of combinacoes(defs)) {
      n++;
      const comNovos = [...defs, AC_COR, AC_CORPO, AC_FRENTE, DECOR];
      expect(fotoDosAtributos(attrs, comNovos)).toBe(antesFoto(attrs, defs));
      expect(corDosAtributos(attrs, comNovos)).toBe(antesCor(attrs, defs));
      for (const z of ZONAS) expect(aparenciaDaZona(z, attrs, comNovos)).toEqual(antesZona(z, attrs, defs));
    }
    expect(n).toBeGreaterThan(50);
  });
  it("aparenciaDaZona dá o mesmo que o código antigo, por zona, com e sem ligações e exclusões", () => {
    let n = 0;
    for (const defs of CONJUNTOS) for (const attrs of combinacoes(defs)) for (const lig of LIGACOES) for (const exc of EXCLUIDOS) for (const z of ZONAS) {
      // fora do âmbito: uma EXCLUSÃO («aplicar: não») que deixa um só atributo de cor já não o faz «o único atributo» (decisão de 25/11: o Puxador não passa a pintar tudo ao desligar a Cor)
      if (defs.length > 1 && defs.filter((d) => !exc?.has(chaveDeExclusao(d.id, z))).length === 1) continue;
      n++;
      expect(aparenciaDaZona(z, attrs, defs, lig, exc), `${defs.map((d) => d.nome).join("+")} ${attrs.map((a) => a.opcaoId).join(",")} ${z}`).toEqual(antesZona(z, attrs, defs, lig, exc));
    }
    expect(n).toBeGreaterThan(5000);
  });
});

/* ------------------------------------------------------------------ a coluna AXIS REAL (Mudelar), como fica depois da separação */
type Fixt = typeof real;
/** O que a C1 faz às definições: «Cor do corpo» → «Acabamento do corpo» e «Cor da frente» → «Acabamento da frente» (as opções e os ids dos valores ficam). */
function depoisDaSeparacao(f: Fixt): Fixt {
  const c = JSON.parse(JSON.stringify(f)) as Fixt;
  for (const a of c.definicoes.atributos as { nome: string; codigo: string }[]) {
    if (a.nome === "Cor do corpo") { a.nome = "Acabamento do corpo"; a.codigo = "acabamento_corpo"; }
    if (a.nome === "Cor da frente") { a.nome = "Acabamento da frente"; a.codigo = "acabamento_frente"; }
  }
  return c;
}
function catalogoDe(f: Fixt) {
  let L = juntarTabelas(linhasDe(null), { categoriasProduto: f.categoriasProduto, produtos: [] } as never);
  L = juntarAtributos(L, f.definicoes as never);
  return montarCatalogo(L, catalogo0(), {}).K;
}
const FOTO_REAL = {
  artisan: "3242e925-da26-459a-8258-be04d904e355/0e8b282e-69bf-454b-bd0b-fb55e7b51b3c.webp",
  denver: "3242e925-da26-459a-8258-be04d904e355/8ae2a8cb-ca75-42ef-b037-1f56d8936ff0.webp",
  oak: "3242e925-da26-459a-8258-be04d904e355/f8799ace-866c-4e1a-ab80-4768969dfba5.webp",
} as const;

describe("Coluna Suspensa AXIS (dados reais da Mudelar) depois da separação Cor/Acabamento", () => {
  const antes = catalogoDe(real), depois = catalogoDe(depoisDaSeparacao(real));
  for (const q of ["artisan", "denver", "oak"] as const) {
    it(`${q}: a foto e as duas zonas (corpo e frente) são as mesmas de antes da separação`, () => {
      const p = produtoDeLeitura(real.produtos[q])!;
      void p;
      const attrs = atributosDeValores(real.atributos[q].valores as never);
      expect(depois.atributos.map((d) => d.nome)).toEqual(expect.arrayContaining(["Acabamento do corpo", "Acabamento da frente"]));
      expect(fotoDosAtributos(attrs, antes.atributos)).toBe(FOTO_REAL[q]);
      expect(fotoDosAtributos(attrs, depois.atributos)).toBe(FOTO_REAL[q]);
      for (const z of ZONAS) expect(aparenciaDaZona(z, attrs, depois.atributos)?.foto, z).toBe(aparenciaDaZona(z, attrs, antes.atributos)?.foto);
      expect(aparenciaDaZona("corpo", attrs, depois.atributos)).toMatchObject({ atributo: "Acabamento do corpo", foto: FOTO_REAL[q] });
      expect(aparenciaDaZona("frente", attrs, depois.atributos)).toMatchObject({ atributo: "Acabamento da frente", foto: FOTO_REAL[q] });
    });
  }
});

/* ------------------------------------------------------------------ a configuração por produto manda, para qualquer atributo */
const PUXADOR = def("d-puxador", "Puxador", "puxador", [op("preto-p", null, "#111111"), op("inox-p", null, "#BFC3C7", { metal: true })], { temAspeto: true });
const LADO = def("d-lado", "Lado", "lado", [op("esq", null), op("dir", null)], { temHex: false, temFoto: false });
const NATURAL = def("d-nat", "Acabamento", "acabamento", [op("natural", null), op("frost", null)], { temHex: false, temFoto: false });

describe("atributos com outro nome (Puxador…): só pintam ligados; a configuração manda sobre os nomes", () => {
  const d = [COR, COR_FRENTE, PUXADOR], a = [escolha(COR, "branco"), escolha(PUXADOR, "preto-p")];
  it("SEM configuração o Puxador (hex, nome desconhecido) não pinta nenhuma zona: valem os nomes conhecidos", () => {
    for (const z of ZONAS) expect(zona(z, a, d), z).toEqual({ atributo: "Cor", foto: null, hex: "#fcfcfc" });
  });
  it("ligado a uma zona, o Puxador pinta essa zona (e só ela); as outras seguem os nomes", () => {
    const lig = { [PUXADOR.id]: ["puxadores"] as ZonaGlb[] };
    expect(zona("puxadores", a, d, lig)).toEqual({ atributo: "Puxador", foto: null, hex: "#111111" });
    expect(zona("corpo", a, d, lig)?.atributo).toBe("Cor");
    expect(zonasDosAtributos(a, d, lig)?.porZona).toBe(true);
  });
  it("ligado a «tudo» pinta todas as zonas (o que o 3D usa também como cor única)", () => {
    const lig = { [PUXADOR.id]: [...ZONAS] };
    for (const z of ZONAS) expect(zona(z, a, d, lig), z).toMatchObject({ atributo: "Puxador", hex: "#111111" });
    const z = zonasDosAtributos(a, d, lig)!;
    expect(z.porZona).toBe(false);
    expect(aparenciaUnicaDasZonas(z)).toEqual({ foto: null, hex: "#111111" });
  });
  it("desligado por configuração, o nome conhecido deixa de pintar (nenhuma zona, e nenhuma cor única)", () => {
    const exc = new Set(ZONAS.map((zn) => chaveDeExclusao(COR.id, zn)));
    expect(zonasDosAtributos([escolha(COR, "branco")], [COR, COR_FRENTE], undefined, exc)).toBeUndefined();
    // o mesmo para os acabamentos novos
    const excA = new Set(ZONAS.map((zn) => chaveDeExclusao(AC_COR.id, zn)));
    expect(zonasDosAtributos([escolha(AC_COR, "oak-g")], [COR, AC_COR], undefined, excA)).toBeUndefined();
    expect(zonasDosAtributos([escolha(COR, "branco"), escolha(AC_COR, "oak-g")], [COR, AC_COR], undefined, excA)?.zonas.corpo?.atributo).toBe("Cor");
  });
  it("aparenciaUnicaDasZonas: sem zonas ou com zonas diferentes não há única", () => {
    expect(aparenciaUnicaDasZonas(undefined)).toBeNull();
    expect(aparenciaUnicaDasZonas(zonasDosAtributos([escolha(COR_FRENTE, "oak-c")], [COR_CORPO, COR_FRENTE]))).toBeNull();
  });
  it("atributos sem foto, hex nem aspeto (Lado, o Acabamento Natural/Frost Plus) nunca pintam, nem ligados", () => {
    const lig = { [LADO.id]: [...ZONAS], [NATURAL.id]: [...ZONAS] };
    expect(zonasDosAtributos([escolha(LADO, "esq"), escolha(NATURAL, "natural")], [LADO, NATURAL], lig)).toBeUndefined();
    expect(zona("corpo", [escolha(LADO, "esq"), escolha(COR, "branco")], [LADO, COR], lig)?.atributo).toBe("Cor");
  });
});

describe("leiturasPorOmissao: todos os atributos com hex, foto ou aspeto e o estado por omissão", () => {
  const por = (defs: AtributoDef[]) => Object.fromEntries(leiturasPorOmissao(defs).map((l) => [l.nome, l]));
  it("lista os de cor, os novos e os de aspeto; nunca a Medida, o Lado nem o Acabamento sem foto/hex", () => {
    const medida: AtributoDef = { id: "d-med", codigo: "medida", nome: "Medida", tipo: "medida", temHex: false, ordem: 1, opcoes: [] };
    const nomes = leiturasPorOmissao([medida, COR, COR_FRENTE, AC_COR, PUXADOR, LADO, NATURAL]).map((l) => l.nome);
    expect(nomes).toEqual(["Cor", "Cor da frente", "Acabamento da cor", "Puxador"]);
  });
  it("os nomes conhecidos aplicam-se por omissão (com a zona); o Puxador fica desligado por omissão", () => {
    const l = por([COR, COR_FRENTE, COR_CORPO, AC_COR, AC_FRENTE, AC_CORPO, DECOR, PUXADOR]);
    expect(l["Cor da frente"]).toMatchObject({ aplicado: true, onde: "pinta a frente" });
    expect(l["Cor do corpo"]).toMatchObject({ aplicado: true, onde: "pinta o corpo" });
    expect(l["Acabamento da frente"]).toMatchObject({ aplicado: true, onde: "pinta a frente" });
    expect(l["Acabamento do corpo"]).toMatchObject({ aplicado: true, onde: "pinta o corpo" });
    for (const n of ["Cor", "Acabamento da cor", "Decor"]) expect(l[n], n).toMatchObject({ aplicado: true, onde: "pinta as zonas sem atributo próprio" });
    expect(l.Puxador.aplicado).toBe(false);
  });
  it("o Brilho com «Tem aspeto» aplica-se (superfície); o único atributo de cor, seja qual for o nome, aplica-se a tudo (a regra de sempre)", () => {
    const brilho = def("d-bri", "Brilho", "brilho", [op("fosco", null)], { temHex: false, temFoto: false, temAspeto: true });
    expect(por([COR, brilho]).Brilho.aplicado).toBe(true);
    expect(por([PUXADOR]).Puxador).toMatchObject({ aplicado: true, onde: "é o único atributo de cor: pinta tudo" });
    expect(por([COR, PUXADOR]).Puxador.aplicado).toBe(false);
  });
  it("sem definições: lista vazia", () => { expect(leiturasPorOmissao(undefined)).toEqual([]); });
});

describe("leiturasDoProduto: só os atributos que o PRODUTO tem (com valor escolhido), não todos os do sistema", () => {
  const SEIS = [COR, AC_COR, COR_CORPO, AC_CORPO, COR_FRENTE, AC_FRENTE];
  const nomes = (defs: AtributoDef[], a: AtributoProduto[]) => leiturasDoProduto(defs, a).map((l) => l.nome);
  it("o sistema tem seis atributos de cor e o produto só dois: a lista tem só esses dois", () => {
    expect(leiturasPorOmissao(SEIS)).toHaveLength(6);
    expect(nomes(SEIS, [escolha(COR, "branco"), escolha(COR_FRENTE, "oak-c")])).toEqual(["Cor", "Cor da frente"]);
  });
  it("o estado por omissão vem dos atributos do SISTEMA: o Puxador, com a «Cor» no sistema, fica desligado, mesmo que o produto só tenha o Puxador", () => {
    expect(leiturasPorOmissao([COR, PUXADOR]).find((l) => l.nome === "Puxador")?.aplicado).toBe(false);
    expect(leiturasDoProduto([COR, PUXADOR], [escolha(PUXADOR, "preto-p")])).toEqual([expect.objectContaining({ nome: "Puxador", aplicado: false })]);
  });
  it("cada leitura traz a opção escolhida (nome, cor e foto), para a amostra", () => {
    const l = leiturasDoProduto(SEIS, [escolha(COR_FRENTE, "oak-c"), escolha(COR_CORPO, "white")]);
    expect(l.find((x) => x.nome === "Cor da frente")?.opcao).toEqual({ nome: "oak-c", hex: null, foto: "org/oak.webp" });
    expect(l.find((x) => x.nome === "Cor do corpo")?.opcao).toEqual({ nome: "white", hex: "#fcfcfc", foto: null });
  });
  it("só se diz se o atributo pinta cor (hex ou foto): o Brilho, só com aspeto, é leitura mas não é cor", () => {
    const brilho = def("d-bri", "Brilho", "brilho", [op("fosco", null)], { temHex: false, temFoto: false, temAspeto: true });
    const l = leiturasDoProduto([COR, brilho], [escolha(COR, "branco"), escolha(brilho, "fosco")]);
    expect(l.map((x) => [x.nome, x.daCor])).toEqual([["Cor", true], ["Brilho", false]]);
  });
  it("um atributo sem opção escolhida, ou com uma opção que já não existe, não conta; a Medida, o Lado e o resto também não", () => {
    const medida: AtributoDef = { id: "d-med", codigo: "medida", nome: "Medida", tipo: "medida", temHex: false, ordem: 1, opcoes: [] };
    const semOpcao: AtributoProduto = { atributoId: COR.id };
    const antiga: AtributoProduto = { atributoId: COR_FRENTE.id, opcaoId: "ja-nao-existe" };
    expect(nomes([medida, COR, COR_FRENTE, LADO], [semOpcao, antiga, { atributoId: medida.id }, escolha(LADO, "esq")])).toEqual([]);
  });
  it("sem atributos do produto, ou sem definições: lista vazia", () => {
    expect(leiturasDoProduto(SEIS, [])).toEqual([]);
    expect(leiturasDoProduto(SEIS, undefined)).toEqual([]);
    expect(leiturasDoProduto(undefined, [escolha(COR, "branco")])).toEqual([]);
  });
});

// 27/11: a Textura da Mudelar (Pizarra, Liso, Piedra) passa a ter foto na base (has_hex_color + has_photo), mas não é um atributo de COR: dá a textura ao corpo, tingida pela cor.
// Não pinta zonas, não conta para «o único atributo de cor» e não aparece como cor no painel «Ligações».
describe("a Textura: reconhecida à parte, fora de todas as contas da cor", () => {
  const TEXTURA = def("d-tex", "Textura", "textura", [op("pizarra", "org/pizarra.webp"), op("liso", null)]);
  const textos = (...ds: AtributoDef[]) => Object.fromEntries(leiturasPorOmissao(ds).map((l) => [l.nome, l]));
  it("ehAtributoDeTextura: pelo código ou pelo nome, sem acentos nem maiúsculas; nada mais", () => {
    expect(ehAtributoDeTextura({ codigo: "textura", nome: "x" })).toBe(true);
    expect(ehAtributoDeTextura({ codigo: "TEXTURA", nome: "x" })).toBe(true);
    expect(ehAtributoDeTextura({ codigo: "x", nome: "  TEXTURA " })).toBe(true);
    for (const [c, n] of [["tonalidade", "Tonalidade"], ["cor", "Cor"], ["textura_extra", "Textura extra"]] as const) expect(ehAtributoDeTextura({ codigo: c, nome: n }), n).toBe(false);
  });
  it("não pinta nenhuma zona, nem como único atributo de cor, nem escolhida", () => {
    const a = [escolha(TEXTURA, "pizarra")];
    expect(zonasDosAtributos(a, [TEXTURA])).toBeUndefined();
    for (const z of ZONAS) expect(zona(z, a, [TEXTURA]), z).toBeNull();
    // ligada à mão a todas as zonas, a Textura continua sem pintar cor nem foto (a foto da Textura vai pelo caminho próprio, tingida)
    expect(zonasDosAtributos(a, [TEXTURA], { [TEXTURA.id]: [...ZONAS] })).toBeUndefined();
  });
  it("não impede os outros: com a Cor escolhida, as zonas levam a Cor, não a Textura; e a Textura não faz do Puxador «o único atributo de cor»", () => {
    const a = [escolha(TEXTURA, "pizarra"), escolha(COR, "branco")];
    expect(zona("corpo", a, [COR, TEXTURA])?.atributo).toBe("Cor");
    expect(zona("corpo", [escolha(TEXTURA, "pizarra"), escolha(PUXADOR, "preto-p")], [TEXTURA, PUXADOR])?.atributo).toBe("Puxador"); // único atributo de cor = o Puxador (a Textura não conta)
    expect(zona("corpo", [escolha(TEXTURA, "pizarra"), escolha(PUXADOR, "preto-p")], [TEXTURA, PUXADOR, COR])).toBeNull(); // com a Cor no sistema, o Puxador volta a só pintar ligado
  });
  it("leiturasPorOmissao: a Textura aplica-se por omissão e diz o que faz; não torna nenhum outro «o único atributo de cor»", () => {
    expect(textos(TEXTURA).Textura).toMatchObject({ aplicado: true, onde: "dá a textura ao corpo, tingida pela cor" });
    expect(textos(COR, TEXTURA).Textura).toMatchObject({ aplicado: true, onde: "dá a textura ao corpo, tingida pela cor" });
    expect(textos(PUXADOR, TEXTURA).Puxador).toMatchObject({ aplicado: true, onde: "é o único atributo de cor: pinta tudo" });
  });
  it("leiturasDoProduto: a Textura aparece com a opção escolhida, mas não conta como atributo de COR (daCor falso) nem de superfície", () => {
    const l = leiturasDoProduto([COR, TEXTURA], [escolha(COR, "branco"), escolha(TEXTURA, "pizarra")]);
    const t = l.find((x) => x.nome === "Textura");
    expect(t).toMatchObject({ aplicado: true, daCor: false, daSuperficie: false, opcao: { nome: "pizarra", foto: "org/pizarra.webp" } });
    expect(l.find((x) => x.nome === "Cor")?.daCor).toBe(true);
  });
});

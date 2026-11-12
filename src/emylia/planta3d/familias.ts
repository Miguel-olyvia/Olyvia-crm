// Protótipo (visualizador 3D): PRODUTO = FAMÍLIA + VARIANTES. Uma torneira com 7 acabamentos, ou um lava-loiça com 12 medidas, é UM produto no ecrã;
// cada variante (medida × acabamento) tem o seu SKU, o seu preço (preço da medida + diferença do acabamento) e o seu material 3D. As variantes
// NÃO se listam à mão: geram-se dos dados da família. Os exemplos vêm do «Torneiras e Lava-loiças · Catálogo 3D» (modelos, acabamentos, medidas e
// recortes), como dados de demonstração marcados «(demo)»; os preços são de demonstração. Funções puras: sem React, sem three.
import { ESPEC, type MaterialMockup, type Mockup3D, type ParamsMockup, type ProdutoModelo3D, type TipoMockup } from "./catalogo3d";
import type { TipoEspaco } from "./modelo";
import { temFicheiro } from "./modelosHtml/ficheiros";

export interface AcabFam { id: string; nome: string; cor: string; metalness: number; roughness: number; codigo: string; /** diferença de preço (€) */ delta: number }
/** Dados próprios de uma medida/modelo (tudo em mm, como no catálogo de origem, salvo indicação). */
export interface SpecMedida {
  torneira?: { estilo: "extraivel" | "monocomando" | "abativel" | "cira"; altura: number; saida: number; alcance: number; base: number };
  /** cubas: largura, profundidade, fundo, e a distância à esquerda e ao fundo do lava-loiça */
  cubas?: { w: number; d: number; prof: number; left: number; top: number }[]; escorredor?: boolean; degrau?: boolean; movel?: number;
  placa?: { tipo: "induction" | "radiant" | "gas"; espessura: number; acima: number; recorte: [number, number]; queimadores?: [number, number, number][]; manipulos?: number[]; vidro?: boolean };
  /** só estes acabamentos servem esta medida (por omissão, todos os da família) */
  acabamentos?: string[]; nota?: string;
  /** só das famílias do Configurador (configurador.ts): preço e SKU por acabamento NESTA medida; sem entrada valem o preço da medida + diferença e ref-código */
  precos?: Record<string, number>; skus?: Record<string, string>;
}
export interface MedidaFam { id: string; rotulo: string; ref: string; preco: number; /** largura, profundidade, altura (cm) */ dim: [number, number, number]; spec?: SpecMedida }
export type CategoriaFam = "torneiras" | "lavaloicas" | "placas" | "tampos" | "cozinha" | "banho";
export interface Familia {
  id: string; nome: string; marca: string; categoria: CategoriaFam; tipo: TipoMockup; espacos: TipoEspaco[]; acabamentos: AcabFam[]; medidas: MedidaFam[]; nota: string;
  /** montagem e altura (m) de omissão, quando diferem do tipo; `geo: false`: sem geometria (só linha vendável) */
  mont?: "chao" | "parede"; alt?: number; geo?: boolean;
  /** o modelo detalhado portado do HTML (modelosHtml/) e as opções que ele tem (mostradas no painel da peça) */
  htmlModelo?: string; opcoes?: OpcaoFamilia[];
  /** `configurada`: criada no Configurador de famílias (só em memória, configurador.ts); as demo não têm esta marca */
  origem?: "configurada";
  /** só das configuradas: o GLB do fabricante de cada célula («medidaId|acabId» → chave de modelosHtml/ficheiros.ts: «familia|modelo|acab») */
  glbCelulas?: Record<string, string>;
}
export type OpcaoFamilia = "bica" | "extraida" | "tampas" | "reverso" | "articulacao";
export interface CategoriaFamilia { id: CategoriaFam; rotulo: string; espacos: TipoEspaco[] }
/** Os separadores de família no ecrã (como no catálogo de origem: Torneiras, Lava-loiças, Placas, Bancadas). */
export const CATEGORIAS_FAMILIA: CategoriaFamilia[] = [
  { id: "torneiras", rotulo: "Torneiras", espacos: ["cozinha", "outro"] },
  { id: "lavaloicas", rotulo: "Lava-loiças", espacos: ["cozinha", "outro"] },
  { id: "placas", rotulo: "Placas", espacos: ["cozinha", "outro"] },
  { id: "tampos", rotulo: "Bancadas", espacos: ["cozinha", "outro"] },
  { id: "cozinha", rotulo: "Móveis e acessórios de cozinha", espacos: ["cozinha", "outro"] },
  { id: "banho", rotulo: "Banho (famílias)", espacos: ["casa_banho", "outro"] },
];

/* ------------------------------------------------------------------ acabamentos (nomes e tons do catálogo de origem) */
const BASE: Record<string, { nome: string; cor: string; m: number; r: number; cod: string }> = {
  brushed: { nome: "Acero (escovado)", cor: "#b7b9ba", m: 1, r: 0.27, cod: "AC" }, chrome: { nome: "Cromado", cor: "#d9dde0", m: 1, r: 0.12, cod: "CR" },
  nickel: { nome: "Níquel", cor: "#b9bcbd", m: 1, r: 0.2, cod: "NI" }, oro: { nome: "Oro", cor: "#c6ab64", m: 1, r: 0.28, cod: "OR" },
  cobre: { nome: "Cobre", cor: "#b88755", m: 1, r: 0.3, cod: "CO" }, gunmetal: { nome: "Gun Metal", cor: "#62605e", m: 1, r: 0.29, cod: "GM" },
  titanio: { nome: "Titanio", cor: "#55524d", m: 1, r: 0.3, cod: "TI" }, negro: { nome: "Negro", cor: "#151617", m: 0.05, r: 0.5, cod: "NE" },
  blanco: { nome: "Blanco", cor: "#f2f2ef", m: 0.02, r: 0.4, cod: "BL" }, inox: { nome: "Inox escovado", cor: "#c3c7ca", m: 1, r: 0.3, cod: "IX" },
  madeira: { nome: "Carvalho", cor: "#b68b5a", m: 0, r: 0.6, cod: "CA" }, antracite: { nome: "Antracite", cor: "#4a4e53", m: 0, r: 0.5, cod: "AN" },
  vidro: { nome: "Vidro transparente", cor: "#bcd9ea", m: 0, r: 0.1, cod: "VT" }, fume: { nome: "Vidro fumado", cor: "#6c7780", m: 0, r: 0.1, cod: "VF" },
  aluminio: { nome: "Alumínio", cor: "#c9ccce", m: 0.8, r: 0.3, cod: "AL" },
};
const A = (id: string, delta = 0, o: Partial<Omit<AcabFam, "id" | "delta">> = {}): AcabFam => {
  const b = BASE[id];
  return { id, nome: o.nome ?? b.nome, cor: o.cor ?? b.cor, metalness: o.metalness ?? b.m, roughness: o.roughness ?? b.r, codigo: o.codigo ?? b.cod, delta };
};

/* ------------------------------------------------------------------ torneiras (as 7 do catálogo de origem) */
const T = (id: string, marca: string, titulo: string, estilo: NonNullable<SpecMedida["torneira"]>["estilo"], acabamentos: AcabFam[], altura: number, saida: number, alcance: number, base: number, preco: number, ref: string, nota: string): Familia => ({
  id, nome: `Torneira ${titulo} (demo)`, marca, categoria: "torneiras", tipo: "torneira_cozinha", espacos: ["cozinha", "outro"], acabamentos, nota,
  medidas: [{ id: "unica", rotulo: "", ref, preco, dim: [base / 10, alcance / 10 + base / 20, altura / 10], spec: { torneira: { estilo, altura, saida, alcance, base } } }],
});
const TORNEIRAS: Familia[] = [
  T("round", "GME · IO", "Round Extraível", "extraivel", [A("brushed"), A("chrome", 10), A("oro", 40), A("titanio", 25), A("negro", 20), A("cobre", 40)], 445, 245, 224, 55, 189, "GME-RND", "Seis acabamentos. Bica extraível com flexível metálico em espiral; rotação 360°."),
  T("noah", "GME · IO", "Noah Monocomando", "monocomando", [A("brushed"), A("negro", 15), A("oro", 35), A("cobre", 35), A("titanio", 20)], 366, 291, 210, 51.5, 159, "GME-NOA", "Cinco acabamentos. Bica fixa giratória a 360°, tubo Ø24 mm e saída a 7°."),
  T("smooth", "RUBICER", "Smooth Extraível", "extraivel", [A("chrome", 0, { nome: "Cromo" }), A("nickel", 15), A("blanco", 10), A("gunmetal", 25), A("negro", 20), A("oro", 40), A("cobre", 40)], 435, 242, 213, 49, 219, "RUB-SMO", "Sete acabamentos conforme a referência Rubicer. Corpo afunilado e bica extraível."),
  T("cira", "MARTI 1921", "Cira Silicone Edition", "cira", [A("chrome", 0, { nome: "Cromo" }), A("gunmetal", 20), A("negro", 15), A("oro", 45)], 490, 210, 220, 48, 249, "MAR-CIR", "Quatro acabamentos, sempre com revestimento preto em silicone sobre tubo flexível."),
  T("alexia", "GME · IO", "Alexia Abatível", "abativel", [A("chrome", 0, { nome: "Cromo" }), A("oro", 35)], 353, 259, 201, 52, 179, "GME-ALX", "Cromo e Oro. Rotação da bica a 360° e abatimento de −90° a +90°."),
  T("granada", "MARTI 1921", "Granada Abatível", "abativel", [A("negro"), A("blanco", 5)], 345, 285, 195, 52, 169, "MAR-GRA", "Negro e Blanco. Bica abatível; largura total 150 mm."),
  T("stick", "MOOVLUX", "Stick Extraível", "extraivel", [A("negro", 0, { nome: "Preto Mate", roughness: 0.53 })], 456, 231, 230, 50, 139, "MOV-TC1005", "Preto Mate. Corpo esguio Ø30 mm (ficha TC1005)."),
];

/* ------------------------------------------------------------------ lava-loiças (as 6 famílias, 32 modelos, do catálogo de origem) */
type Cuba = { w: number; d: number; prof: number; left: number; top: number };
const cuba = (w: number, d: number, prof: number, left: number, top: number): Cuba => ({ w, d, prof, left, top });
const ML = (id: string, rotulo: string, ref: string, preco: number, ext: number, prof: number, cubas: Cuba[], extra: Partial<SpecMedida> = {}): MedidaFam => ({
  id, rotulo, ref, preco, dim: [ext / 10, prof / 10, Math.max(...cubas.map((c) => c.prof)) / 10], spec: { cubas, ...extra },
});
const L = (id: string, titulo: string, marca: string, acabamentos: AcabFam[], medidas: MedidaFam[], nota: string): Familia => ({
  id, nome: `Lava-loiça ${titulo} (demo)`, marca, categoria: "lavaloicas", tipo: "lava_loica", espacos: ["cozinha", "outro"], acabamentos, medidas, nota,
});
const INOX = [A("inox")];
const LAVALOICAS: Familia[] = [
  L("velar", "Velar", "FRASA", INOX, [[34, 380, 450, "FS200260", 89], [40, 440, 500, "FS200261", 99], [45, 490, 500, "FS200269", 109], [50, 540, 600, "FS200262", 119], [71, 750, 800, "FS200263", 159]].map(([s, ext, cab, ref, pr]) =>
    ML(`velar${s}`, `${s} cm`, String(ref), Number(pr), Number(ext), 440, [cuba(Number(ext) - 40, 400, 200, 20, 20)], { movel: Number(cab) })), "Inox escovado AISI 304, cuba R25, sob-balcão, à face ou superior. Móvel conforme o folheto."),
  L("keran", "Keran", "RODI HOME", INOX, [
    ML("keran80", "80 cm", "KER-80", 149, 800, 500, [cuba(340, 400, 160, 45, 50)], { movel: 450 }), ML("keran86", "86 cm", "KER-86", 159, 860, 500, [cuba(340, 400, 160, 45, 50)], { movel: 450 }),
    ML("keran100", "100 cm (1 cuba e meia)", "KER-100", 189, 1000, 500, [cuba(340, 400, 160, 45, 50), cuba(160, 300, 90, 425, 100)], { movel: 600 }),
    ML("keran116", "116 cm (2 cubas)", "KER-116", 219, 1160, 500, [cuba(340, 400, 160, 45, 50), cuba(340, 400, 160, 425, 50)], { movel: 800 })], "Cubas com fundo de 160 mm e a meia cuba de 90 mm."),
  L("una", "Una", "Demonstração", INOX, [
    ML("una55", "55 cm (1 cuba e meia)", "UNA-55", 169, 580, 440, [cuba(340, 400, 200, 20, 20), cuba(180, 400, 150, 380, 20)], { movel: 600 }), ML("una75", "75 cm (2 cubas)", "UNA-75", 199, 740, 440, [cuba(340, 400, 200, 20, 20), cuba(340, 400, 200, 380, 20)], { movel: 800 })], "Válvula estampada."),
  L("cubas", "Brasília, Bahia, Laguna, Belém e Duo", "Demonstração", INOX, [
    ML("brasilia", "Brasília", "CUB-BRA", 99, 380, 440, [cuba(340, 400, 200, 20, 20)], { movel: 450 }), ML("bahia", "Bahia", "CUB-BAH", 109, 440, 440, [cuba(400, 400, 200, 20, 20)], { movel: 500 }),
    ML("laguna", "Laguna", "CUB-LAG", 119, 490, 440, [cuba(450, 400, 200, 20, 20)], { movel: 600 }), ML("belem", "Belém", "CUB-BEL", 129, 540, 440, [cuba(500, 400, 200, 20, 20)], { movel: 600 }),
    ML("duo60", "Duo 60", "CUB-D60", 149, 571, 450, [cuba(340, 400, 200, 25, 25), cuba(146, 296, 150, 400, 129)], { movel: 600 }),
    ML("duo80", "Duo 80", "CUB-D80", 179, 765, 450, [cuba(340, 400, 200, 25, 25), cuba(340, 400, 200, 400, 25)], { movel: 800 })], "Cubas de embutir em inox; Duo com cuba pequena ou segunda cuba."),
  L("lody", "Lody", "FRASA", [A("oro", 0, { nome: "PVD Gold", cor: "#c9ad68", roughness: 0.3 }), A("cobre", 0, { cor: "#bc825b", roughness: 0.3 }), A("gunmetal", -5, { cor: "#62605e", roughness: 0.29 })], [
    ML("lody40", "40 cm", "LOD-40", 139, 440, 440, [cuba(400, 400, 200, 20, 20)], { movel: 500 }), ML("lody50", "50 cm", "LOD-50", 159, 540, 440, [cuba(500, 400, 200, 20, 20)], { movel: 600 }),
    ML("lody70", "70 cm", "LOD-70", 199, 740, 440, [cuba(700, 400, 200, 20, 20)], { movel: 800 })], "Inox ou PVD (Gold, Cobre e Gunmetal), cantos R15."),
  L("ambar", "Ambar", "RODI · MAGMA", [A("negro", 0, { nome: "Midnight", cor: "#292c2d", metalness: 0, roughness: 0.58 }), A("gunmetal", 0, { nome: "Concrete", cor: "#858988", metalness: 0, roughness: 0.58 }), A("blanco", 0, { nome: "Ice", cor: "#e5e5e1", metalness: 0, roughness: 0.58 })], [
    ML("ambar40", "40", "AMB-40", 149, 450, 452, [cuba(400, 380, 200, 25, 36)], { degrau: true, movel: 500 }), ML("ambar40n", "40 N", "AMB-40N", 149, 450, 430, [cuba(390, 370, 200, 30, 30)], { movel: 500 }),
    ML("ambar50", "50", "AMB-50", 169, 550, 452, [cuba(500, 380, 200, 25, 36)], { degrau: true, movel: 600 }), ML("ambar50n", "50 N", "AMB-50N", 169, 550, 430, [cuba(490, 370, 200, 30, 30)], { movel: 600 }),
    ML("ambar57", "57", "AMB-57", 179, 550, 520, [cuba(500, 380, 200, 25, 105)], { degrau: true, movel: 600 }), ML("ambar55", "55 (1 cuba e meia)", "AMB-55", 189, 555, 450, [cuba(370, 380, 200, 20, 35), cuba(130, 380, 125, 405, 35)], { degrau: true, movel: 600 }),
    ML("ambar70", "70", "AMB-70", 219, 750, 452, [cuba(700, 380, 220, 25, 36)], { degrau: true, movel: 800 }), ML("ambar80", "80", "AMB-80", 239, 850, 452, [cuba(800, 380, 220, 25, 36)], { degrau: true, movel: 900 }),
    ML("ambar86", "86 com escorredor", "AMB-86", 249, 860, 500, [cuba(452, 380, 200, 37, 60.6)], { degrau: true, escorredor: true, movel: 600 }), ML("ambar105", "105 com escorredor", "AMB-105", 269, 1000, 500, [cuba(452, 380, 200, 37, 60.6)], { degrau: true, escorredor: true, movel: 600 }),
    ML("ambar100", "100 (1 cuba e meia, escorredor)", "AMB-100", 279, 1000, 500, [cuba(302, 380, 200, 37, 60), cuba(145, 320, 125, 364, 90)], { degrau: true, escorredor: true, movel: 600 }),
    ML("ambar116", "116 (2 cubas, escorredor)", "AMB-116", 319, 1160, 500, [cuba(340, 380, 200, 37, 60), cuba(310, 320, 200, 402, 90)], { degrau: true, escorredor: true, movel: 900 })], "Doze medidas; inox ou acabamentos mate (Negro, Gunmetal, Blanco). Escorredor reversível."),
];

/* ------------------------------------------------------------------ placas (as 8 do catálogo de origem, agrupadas por tipo) */
const P = (id: string, rotulo: string, ref: string, preco: number, w: number, d: number, placa: NonNullable<SpecMedida["placa"]>, acabamentos?: string[]): MedidaFam => ({
  id, rotulo, ref, preco, dim: [w / 10, d / 10, (placa.espessura + placa.acima) / 10], spec: { placa, acabamentos },
});
const zonas = (r: number): [number, number, number][] => [[-145, -95, r], [145, -95, r], [-145, 95, r], [145, 95, r]];
const PLACAS: Familia[] = [
  { id: "placa_inducao", nome: "Placa de indução 60 (demo)", marca: "Indesit · Whirlpool", categoria: "placas", tipo: "placa", espacos: ["cozinha", "outro"], acabamentos: [A("negro", 0, { nome: "Vitrocerâmica preta", metalness: 0, roughness: 0.15 })],
    nota: "Indução · 4 zonas. Recorte de encastre conforme a ficha.", medidas: [
      P("ib65b60", "Indesit IB 65B60 NE", "IND-IB65B60", 329, 590, 510, { tipo: "induction", espessura: 4, acima: 0, recorte: [560, 480], queimadores: zonas(90) }),
      P("wlb1160", "Whirlpool WL B1160 BF", "WHI-WLB1160", 389, 590, 510, { tipo: "induction", espessura: 4, acima: 0, recorte: [560, 480], queimadores: zonas(95) })] },
  { id: "placa_radiante", nome: "Placa vitrocerâmica radiante 60 (demo)", marca: "Indesit · Whirlpool", categoria: "placas", tipo: "placa", espacos: ["cozinha", "outro"], acabamentos: [A("negro", 0, { nome: "Vitrocerâmica preta", metalness: 0, roughness: 0.15 })],
    nota: "Radiante · 4 zonas · Touch Control.", medidas: [
      P("ri161", "Indesit RI 161 C (ES)", "IND-RI161", 199, 580, 510, { tipo: "radiant", espessura: 4, acima: 0, recorte: [560, 490], queimadores: zonas(80) }),
      P("akt8090", "Whirlpool AKT 8090/NE", "WHI-AKT8090", 219, 580, 510, { tipo: "radiant", espessura: 4, acima: 0, recorte: [560, 490], queimadores: zonas(85) })] },
  { id: "placa_gas", nome: "Placa a gás (demo)", marca: "Indesit · Whirlpool", categoria: "placas", tipo: "placa", espacos: ["cozinha", "outro"], acabamentos: [A("inox", 0, { nome: "Inox" }), A("negro", 0, { nome: "Vidro preto", metalness: 0, roughness: 0.15 }), A("blanco", 0, { nome: "Vidro branco", metalness: 0, roughness: 0.15 })],
    nota: "Gás · 4 ou 5 queimadores. A ING 61T é de vidro, preto ou branco; as outras são de inox.", medidas: [
      P("thp642", "Indesit THP 642 IX/I 1", "IND-THP642", 249, 580, 510, { tipo: "gas", espessura: 13, acima: 56, recorte: [560, 480], queimadores: [[-160, -130, 37.5], [160, -130, 50], [-160, 75, 37.5], [160, 75, 27.5]], manipulos: [-84, -28, 28, 84] }, ["inox"]),
      P("ing61t", "Indesit ING 61T (vidro)", "IND-ING61T", 279, 590, 510, { tipo: "gas", espessura: 7, acima: 57, recorte: [560, 480], queimadores: [[-145, -130, 37.5], [145, -130, 50], [-145, 75, 37.5], [145, 75, 27.5]], manipulos: [-90, -30, 30, 90], vidro: true }, ["negro", "blanco"]),
      P("gmal6422", "Whirlpool GMAL 6422/IXL", "WHI-GMAL6422", 339, 590, 510, { tipo: "gas", espessura: 7, acima: 52, recorte: [560, 480], queimadores: [[-145, -130, 37.5], [145, -130, 37.5], [-145, 70, 62], [145, 70, 27.5]], manipulos: [25, 88, 151, 214] }, ["inox"]),
      P("gmwl958", "Whirlpool GMWL 958/IXL (90 cm)", "WHI-GMWL958", 459, 860, 510, { tipo: "gas", espessura: 7, acima: 52, recorte: [840, 480], queimadores: [[-270, -20, 64], [0, -135, 37.5], [0, 85, 37.5], [270, -135, 50], [270, 85, 27.5]], manipulos: [-235, -70, 40, 205, 315] }, ["inox"])] },
];

/* ------------------------------------------------------------------ tampo de bancada e componentes de conjuntos */
const tampoAc = (id: string, nome: string, cor: string, delta: number): AcabFam => ({ id, nome, cor, metalness: 0, roughness: 0.62, codigo: id.split("-").map((s) => s.slice(0, 3)).join("").toUpperCase(), delta });
const OUTRAS: Familia[] = [
  { id: "tampo", nome: "Tampo Coverlam Top 12 mm (demo)", marca: "Coverlam Top", categoria: "tampos", tipo: "tampo", espacos: ["cozinha", "outro"], nota: "Tampo de 12 mm; o comprimento é o da peça na planta (160 a 320 cm). Séries e tons do catálogo de origem.",
    acabamentos: [tampoAc("canela-beige", "Canela Roma · Beige", "#d8d1bb", 0), tampoAc("nero-ardi", "Nero Ardi · Negro", "#303032", 20), tampoAc("blue-roma", "Blue Roma · Cielo", "#aaa99d", 0), tampoAc("camargue-blanco", "Camargue · Blanco", "#deddd6", 0),
      tampoAc("camargue-arena", "Camargue · Arena", "#d6cdbd", 0), tampoAc("capraia-blanco", "Capraia · Blanco", "#d8d6ce", 10), tampoAc("calacata-blanco", "Calacata Vaglie · Blanco", "#d6d6d0", 25), tampoAc("jungla-abeto", "Jungla · Abeto", "#cabb9a", 30),
      tampoAc("jungla-cipres", "Jungla · Cipres", "#b5a17f", 30), tampoAc("jungla-iroko", "Jungla · Iroko", "#947653", 30), tampoAc("jungla-roble", "Jungla · Roble", "#998e7a", 30)],
    medidas: [{ id: "unica", rotulo: "", ref: "CVL-TOP12", preco: 260, dim: [240, 65, 1.2] }] },
  { id: "movel_base", nome: "Móvel base de cozinha (demo)", marca: "Demonstração", categoria: "cozinha", tipo: "movel", espacos: ["cozinha", "outro"], nota: "Móvel de 60 cm de profundidade; o comprimento é o da peça.",
    acabamentos: [A("blanco", 0, { nome: "Branco mate" }), A("madeira", 25), A("antracite", 20)], medidas: [{ id: "unica", rotulo: "", ref: "MOV-BASE", preco: 320, dim: [240, 60, 88.8] }] },
  { id: "sifao", nome: "Sifão e válvula de lava-loiça (demo)", marca: "Demonstração", categoria: "cozinha", tipo: "sifao", espacos: ["cozinha", "outro"], nota: "Vende-se à parte; não tem geometria.", geo: false,
    acabamentos: [A("chrome", 0, { nome: "Cromado" })], medidas: [{ id: "unica", rotulo: "", ref: "SIF-3.5", preco: 24, dim: [10, 10, 10] }] },
  { id: "base_duche_f", nome: "Base de duche extraplana (demo)", marca: "Demonstração", categoria: "banho", tipo: "base_duche", espacos: ["casa_banho", "outro"], nota: "Resina; quatro medidas e três tons.",
    acabamentos: [A("blanco", 0, { nome: "Branco" }), A("antracite", 25), A("madeira", 20, { nome: "Pedra bege", cor: "#c9bfa9" })],
    medidas: [["70×100", 100, 70, 189], ["80×120", 120, 80, 239], ["90×90", 90, 90, 219], ["80×160", 160, 80, 329]].map(([r, w, d, pr]) => ({ id: String(r), rotulo: String(r), ref: `BDX-${r}`, preco: Number(pr), dim: [Number(w), Number(d), 3] as [number, number, number] })) },
  { id: "resguardo_f", nome: "Resguardo de duche (demo)", marca: "Demonstração", categoria: "banho", tipo: "resguardo", espacos: ["casa_banho", "outro"], nota: "Vidro de 8 mm com perfil.",
    acabamentos: [A("vidro"), A("fume", 40), A("negro", 60, { nome: "Perfil negro", metalness: 0.3, cor: "#8fa3b0" })], medidas: [80, 90, 100, 120].map((w) => ({ id: `w${w}`, rotulo: `${w} cm`, ref: `RES-${w}`, preco: 190 + w, dim: [w, 4, 195] as [number, number, number] })) },
  { id: "misturadora_duche", nome: "Misturadora de duche (demo)", marca: "Demonstração", categoria: "banho", tipo: "torneira", espacos: ["casa_banho", "outro"], nota: "Monocomando de parede.", mont: "parede", alt: 1.0,
    acabamentos: [A("chrome"), A("negro", 20), A("oro", 45)], medidas: [{ id: "unica", rotulo: "", ref: "MIS-DUC", preco: 129, dim: [18, 12, 20] }] },
  { id: "coluna_duche_f", nome: "Coluna de duche termostática (demo)", marca: "Demonstração", categoria: "banho", tipo: "coluna_duche", espacos: ["casa_banho", "outro"], nota: "Coluna com chuveiro fixo.",
    acabamentos: [A("chrome"), A("negro", 30), A("oro", 60)], medidas: [{ id: "unica", rotulo: "", ref: "COL-DUC", preco: 249, dim: [20, 12, 120] }] },
  { id: "movel_lav_f", nome: "Móvel de lavatório suspenso (demo)", marca: "Demonstração", categoria: "banho", tipo: "movel", espacos: ["casa_banho", "outro"], nota: "Móvel com duas gavetas; o lavatório de pousar vende-se à parte.", mont: "chao", alt: 0,
    acabamentos: [A("blanco", 0, { nome: "Branco mate" }), A("madeira", 30), A("antracite", 25)], medidas: [60, 80, 100].map((w) => ({ id: `w${w}`, rotulo: `${w} cm`, ref: `MLV-${w}`, preco: 150 + w * 2, dim: [w, 46, 55] as [number, number, number] })) },
  { id: "lavatorio_f", nome: "Lavatório de pousar (demo)", marca: "Demonstração", categoria: "banho", tipo: "lavatorio_pousar", espacos: ["casa_banho", "outro"], nota: "Cerâmica.",
    acabamentos: [A("blanco", 0, { nome: "Branco brilhante", metalness: 0, roughness: 0.2 })], medidas: [{ id: "w50", rotulo: "50 cm", ref: "LVP-50", preco: 79, dim: [50, 40, 12] }, { id: "w60", rotulo: "60 cm", ref: "LVP-60", preco: 99, dim: [60, 42, 12] }] },
  { id: "torneira_lav", nome: "Misturadora de lavatório (demo)", marca: "Demonstração", categoria: "banho", tipo: "torneira", espacos: ["casa_banho", "outro"], nota: "Monocomando de bancada.", mont: "chao", alt: 0.72,
    acabamentos: [A("chrome"), A("negro", 15), A("oro", 40)], medidas: [{ id: "unica", rotulo: "", ref: "MIS-LAV", preco: 89, dim: [8, 15, 20] }] },
  { id: "espelho_f", nome: "Espelho com moldura (demo)", marca: "Demonstração", categoria: "banho", tipo: "espelho", espacos: ["casa_banho", "outro"], nota: "Moldura em três acabamentos.", mont: "parede", alt: 1.1,
    acabamentos: [A("negro", 0, { nome: "Moldura negra" }), A("oro", 30, { nome: "Moldura oro" }), A("aluminio", 15, { nome: "Moldura alumínio" })],
    medidas: [["60×80", 60, 80, 79], ["80×80", 80, 80, 109], ["100×70", 100, 70, 119]].map(([r, w, h, pr]) => ({ id: String(r), rotulo: String(r), ref: `ESP-${r}`, preco: Number(pr), dim: [Number(w), 3, Number(h)] as [number, number, number] })) },
];

/** As famílias com modelo detalhado do HTML e as opções de cada uma. */
const DETALHADAS: Record<string, OpcaoFamilia[]> = { round: ["bica", "extraida"], noah: ["bica"], smooth: ["bica", "extraida"], stick: ["bica", "extraida"], cira: ["bica"], alexia: ["bica"], granada: ["bica"] };
for (const f of TORNEIRAS) if (DETALHADAS[f.id]) { f.htmlModelo = f.id; f.opcoes = DETALHADAS[f.id]; }
/** Lava-loiças com modelo detalhado do HTML: as 6 famílias (a medida é o id do modelo). A Ambar tem tampas dos ralos que se retiram e a Keran escorredor reversível. */
for (const f of PLACAS) f.htmlModelo = f.id;
for (const f of LAVALOICAS) { f.htmlModelo = f.id; if (f.id === "ambar") f.opcoes = ["tampas"]; if (f.id === "keran") f.opcoes = ["reverso"]; }

export const FAMILIAS: Familia[] = [...TORNEIRAS, ...LAVALOICAS, ...PLACAS, ...OUTRAS];
/** O registo das famílias do Configurador (protótipo: só em memória; quem o preenche é familiasConfiguradas.ts e não se limpa ao desmontar páginas). Só entram ids `cfg:`, nunca sobrepõem uma demo. */
let configuradas: readonly Familia[] = [];
export const PREFIXO_CFG = "cfg:";
export function registarFamilias(lista: readonly Familia[]): void {
  configuradas = lista.filter((f) => f.id.startsWith(PREFIXO_CFG) && !FAMILIAS.some((d) => d.id === f.id));
}
/** As demo e, a seguir, as do Configurador. Um id desconhecido (por exemplo `cfg:` depois de recarregar a página) dá `undefined`, nunca lança. */
export const todasAsFamilias = (): Familia[] => (configuradas.length ? [...FAMILIAS, ...configuradas] : FAMILIAS);
export const familiaPorId = (id: string): Familia | undefined => todasAsFamilias().find((f) => f.id === id);
export const familiasDaCategoria = (c: CategoriaFam): Familia[] => todasAsFamilias().filter((f) => f.categoria === c);

/* ------------------------------------------------------------------ variantes: medida × acabamento, geradas dos dados */
export interface VarianteResolvida {
  familia: Familia; medida: MedidaFam; acabamento: AcabFam; sku: string; preco: number; nome: string; material: MaterialMockup & { cor: string };
}
/** Os acabamentos que servem uma medida (por omissão, todos os da família). */
export function acabamentosDaMedida(f: Familia, medidaId?: string): AcabFam[] {
  const m = f.medidas.find((x) => x.id === medidaId) ?? f.medidas[0];
  const so = m.spec?.acabamentos;
  return so ? f.acabamentos.filter((a) => so.includes(a.id)) : f.acabamentos;
}
/** A variante escolhida (medida e acabamento); um id desconhecido cai na primeira medida e no primeiro acabamento que a servem. */
export function resolverVariante(f: Familia, medidaId?: string, acabId?: string): VarianteResolvida {
  const medida = f.medidas.find((x) => x.id === medidaId) ?? f.medidas[0];
  const lista = acabamentosDaMedida(f, medida.id);
  const acabamento = lista.find((a) => a.id === acabId) ?? lista[0];
  const nome = medida.rotulo ? `${f.nome.replace(/ \(demo\)$/, "")} ${medida.rotulo}${f.origem === "configurada" ? "" : " (demo)"}` : f.nome;
  const sku = medida.spec?.skus?.[acabamento.id] ?? `${medida.ref}-${acabamento.codigo}`, preco = medida.spec?.precos?.[acabamento.id] ?? medida.preco + acabamento.delta;
  return { familia: f, medida, acabamento, sku, preco, nome, material: { cor: acabamento.cor, metalness: acabamento.metalness, roughness: acabamento.roughness } };
}
/** Todas as variantes de uma família (geradas: nada de uma linha por cor). */
export function variantesDe(f: Familia): VarianteResolvida[] {
  return f.medidas.flatMap((m) => acabamentosDaMedida(f, m.id).map((a) => resolverVariante(f, m.id, a.id)));
}
export const chaveModelo = (familiaId: string, medidaId: string, acabId: string): string => `${familiaId}|${medidaId}|${acabId}`;
/** A variante tem o GLB completo do fabricante (modelosHtml/ficheiros.ts)? Torneira: o modelo é o id da família; lava-loiça: o id da medida. */
export const temGlbDoFabricante = (v: VarianteResolvida): boolean => {
  const g = glbDaCelula(v);
  if (v.familia.origem === "configurada") return !!g && temFicheiro(g.familia, g.modelo, g.acab);
  return v.familia.categoria === "torneiras" ? temFicheiro("torneira", v.familia.id, v.acabamento.id) : v.familia.categoria === "lavaloicas" && temFicheiro("lava_loica", v.medida.id, v.acabamento.id);
};
/** O GLB escolhido para a célula (medida × acabamento) de uma família do Configurador. */
function glbDaCelula(v: VarianteResolvida): { familia: string; modelo: string; acab: string } | undefined {
  const chave = v.familia.glbCelulas?.[`${v.medida.id}|${v.acabamento.id}`];
  const [familia, modelo, acab] = chave ? chave.split("|") : [];
  return familia && modelo && acab ? { familia, modelo, acab } : undefined;
}
/** O `html` dos parâmetros: o GLB da célula (configuradas) ou o modelo detalhado da família (demo). */
function htmlDaVariante(v: VarianteResolvida, modeloOmissao: string): { html?: { modelo: string; acab: string } } {
  const g = glbDaCelula(v);
  if (g && temFicheiro(g.familia, g.modelo, g.acab)) return { html: { modelo: g.modelo, acab: g.acab } };
  return v.familia.htmlModelo ? { html: { modelo: modeloOmissao, acab: v.acabamento.id } } : {};
}

const M = 1 / 1000;
/** Os parâmetros do mockup 3D (metros) da variante, a partir dos dados da medida. */
export function paramsDaVariante(v: VarianteResolvida): ParamsMockup | undefined {
  const s = v.medida.spec;
  if (s?.torneira) return { k: "torneira", estilo: s.torneira.estilo, altura: s.torneira.altura * M, saida: s.torneira.saida * M, alcance: s.torneira.alcance * M, base: s.torneira.base * M, ...htmlDaVariante(v, v.familia.htmlModelo ?? v.familia.id) };
  if (s?.cubas) return { k: "lava_loica", cubas: s.cubas.map((c) => ({ x: c.left * M, z: c.top * M, w: c.w * M, d: c.d * M, prof: c.prof * M })), escorredor: !!s.escorredor, degrau: !!s.degrau, ...htmlDaVariante(v, v.medida.id) };
  if (s?.placa) {
    const p = s.placa;
    return { k: "placa", tipo: p.tipo, recorte: [p.recorte[0] * M, p.recorte[1] * M], espessura: p.espessura * M, acima: p.acima * M, queimadores: (p.queimadores ?? []).map(([x, z, r]) => [x * M, z * M, r * M] as [number, number, number]), manipulos: (p.manipulos ?? []).map((x) => x * M), vidro: !!p.vidro, ...htmlDaVariante(v, v.medida.id) };
  }
  if (v.familia.tipo === "tampo") return { k: "tampo", espessura: 0.012 };
  return undefined;
}

/** A altura (cm) a que fica a base de um lava-loiça, para o rebordo ficar rente ao tampo: por baixo, junto à face de baixo; por cima, à face de cima. */
export const TAMPO_TOPO_CM = 90;
export const TAMPO_ESPESSURA_CM = 1.2;
export const alturaLavaLoicaCm = (fundoCm: number, montagem: "baixo" | "cima"): number => (montagem === "baixo" ? TAMPO_TOPO_CM - TAMPO_ESPESSURA_CM : TAMPO_TOPO_CM) - fundoCm;

/** O produto 3D de uma variante: dimensões da medida, material do acabamento, parâmetros próprios e a ligação à família (SKU e preço). */
export function modeloDaFamilia(f: Familia, medidaId?: string, acabId?: string): ProdutoModelo3D {
  const v = resolverVariante(f, medidaId, acabId), e = ESPEC[f.tipo], [w, d, h] = v.medida.dim;
  const mock: Mockup3D = { tipo: f.tipo, largura: w / 100, profundidade: d / 100, altura: h / 100, cor: v.material.cor, material: { metalness: v.material.metalness, roughness: v.material.roughness }, params: paramsDaVariante(v) };
  const alt = f.alt ?? (f.tipo === "lava_loica" ? alturaLavaLoicaCm(h, "baixo") / 100 : e.alt);
  return {
    produtoId: chaveModelo(f.id, v.medida.id, v.acabamento.id), nome: v.nome, tipo: f.tipo, dimensoes: { larguraCm: w, profundidadeCm: d, alturaCm: h, deNome: true }, mockup3d: mock, marca: f.marca, custo: v.preco,
    categoria: e.rotulo, montagem: f.mont ?? e.mont, alturaOmissao: alt, demo: true, fam: { familiaId: f.id, medidaId: v.medida.id, acabId: v.acabamento.id, sku: v.sku, preco: v.preco },
  };
}

// 27/11: limpeza dos modelos 3D genéricos que nenhum produto usa. Esta guarda impede o regresso das sobras nos dois sentidos:
//  - nenhum genérico da lista fica SEM FICHEIRO (o .glb de public/modelos3d/genericos) nem sem entrada nos relatórios (genericos.json e genericos-novos.json);
//  - nenhum genérico fica SEM USO: cada um tem pelo menos um produto REAL da Mudelar (nome e subcategoria lidos na base RH a 27/11) que o classificador lhe entrega.
//    Única excepção, em dúvida e à espera do dono: o roupeiro (a Mudelar não tem produtos de roupeiro hoje; a nike, só de teste, tem 10).
// Os quatro tirados (cama, secretária, sofá, mesa) não serviam nenhum dos 32 149 produtos vivos da Mudelar: os produtos desses tipos (que a planta ainda desenha pelas
// peças de demonstração) caem no desenho aproximado, tal como qualquer tipo sem genérico (candeeiro, quadro, radiador).
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PRODUTOS_DEMO, modeloDoProduto, tipoMockupDe, type ProdutoCat } from "./catalogo3d";
import { CATEGORIAS_GLB, categoriaDoTipo, categoriaPorId, urlDoGenerico } from "./categoriasGlb";
import { MODELOS_ESCOLHA, escolhaPorId } from "./modelos3dEscolha";

const PASTA = join(process.cwd(), "public", "modelos3d", "genericos");
const IDS = CATEGORIAS_GLB.map((c) => c.id);
const TIRADOS = ["cama", "secretaria", "sofa", "mesa"] as const;
/** Mantidos em dúvida (27/11): sem produto vivo na Mudelar, mas o dono ainda não decidiu se ela vai vender estes artigos. Quando decidir, ou sai daqui e do código, ou ganha um produto real em USO_REAL. */
const EM_DUVIDA = ["roupeiro"] as const;

/** Um produto real (nome e, quando há, a subcategoria) que o classificador entrega a cada genérico: a prova de que o genérico tem uso. */
const USO_REAL: Readonly<Record<string, { n: string; sub?: string }>> = {
  modulo_canto: { n: "Armário Inferior de cozinha Canto em L", sub: "Armários Inferiores" },
  modulo_base: { n: "Componente: Caixote do Lixo para Mobiliário de cozinha" },
  armario_parede: { n: "Armário superior LACADO", sub: "Armários superiores" },
  coluna_cozinha: { n: "ARMÁRIO DE COLUNA COM CANTO DE ARRUMAÇÃO 1200X2400X600" },
  frigorifico: { n: "Frigorifico Integ. Beko", sub: "Frigoríficos" },
  forno: { n: "Forno DE ENCASTRE INDESIT INOX", sub: "Fornos" },
  extrator: { n: "Exaustor AEG - Exaustor DGE5661HM", sub: "Exaustores" },
  maquina_loica: { n: "MÁQUINA DE LAVAR LOUÇA BALAY - 3VT4031NA - 45CM", sub: "Máquinas lavar loiça" },
  fogao: { n: "Placa VITROCERÂMICA INDESIT", sub: "Placas" },
  prateleira: { n: "Componente: PRATELEIRA SUSPENSA TERMOLAMINADO BRANCO BRILHO C/ 1400" },
  sanita: { n: "SANITA GLAMIC BTW BRANCO BRILHO", sub: "Sanitas" },
  sanita_suspensa: { n: "SANITA FLY SUSPENSO CAPPUCINNO", sub: "Sanitas" },
  bide: { n: "Bide MAX BTW branco brilho", sub: "Bidés" },
  lavatorio: { n: "Lavatório BREAK RULES CAPPUCINO", sub: "Lavatórios" },
  movel_lavatorio: { n: "Móvel VIANA c/ Lavatório 60x81x45", sub: "Móveis de lavatório" },
  banheira: { n: "BANHEIRA EASY 170x70", sub: "Banheiras" },
  base_duche: { n: "Base de Duche STONE PLUS 70x160", sub: "Bases Duche" },
  resguardo: { n: "Resguardo Kenna Lateral fijo 75 Oro", sub: "Resguardos de Duche" },
  espelho: { n: "Espelho LED ROMA 60", sub: "Espelhos" },
  armario: { n: "Coluna COLGAR SIA 3H 75X35X20", sub: "Colunas" },
  toalheiro: { n: "Toalheiro ELÉTRICO HOT BRANCO", sub: "Toalheiros" },
  torneira: { n: "Torneira de Lavatório SIRIO", sub: "Torneira Lavatório" },
  coluna_duche: { n: "Coluna de Duche INVERTER R", sub: "Colunas Duche" },
  tampo_wc: { n: "Componente: TAMPO EM TERMOLAMINADO BRANCO BRILHO C/ 750X600XPÉ INOX" },
  lava_loica: { n: "LAVA LOUÇA BLANCO INOX LEMIS 45 S-IF 523 030 86CM", sub: "Cubas inox" },
  maquina_roupa: { n: "Máquina lavar roupa WHIRPOOL BRANCO", sub: "Máquinas lavar roupa" },
  termoacumulador: { n: "Esquentador VULCANO 15L PROPANO OU BUTANO", sub: "Esquentador" },
  aplique: { n: "Aplique LED BEATRIZ 60CM", sub: "Apliques LED" },
  garrafeira: { n: "Componente: Garrafeira Superior / Inferior de 15cm / 30cm (valor unitário)" },
  acessorio: { n: "Cabide MARINA CROMADO", sub: "Cabides" },
};

const produto = (n: string, sub?: string): ProdutoCat => ({ id: "p", n, no: null, ...(sub ? { sub } : {}) });

describe("genéricos 3D: sem sobras", () => {
  it("cada genérico tem o seu .glb, e cada .glb da pasta tem o seu genérico", () => {
    const ficheiros = readdirSync(PASTA).filter((f) => f.endsWith(".glb")).map((f) => f.slice(0, -4)).sort();
    expect(ficheiros).toEqual([...IDS].sort());
    for (const id of IDS) expect(existsSync(join(PASTA, `${id}.glb`)), id).toBe(true);
    for (const id of IDS) expect(existsSync(join(process.cwd(), "public", urlDoGenerico(id))), id).toBe(true);
  });

  it("os relatórios (genericos.json e genericos-novos.json) listam exactamente os genéricos que existem, sem repetir nenhum", () => {
    const ler = (f: string): string[] => (JSON.parse(readFileSync(join(PASTA, f), "utf8")) as { categoria: string }[]).map((r) => r.categoria);
    const listados = [...ler("genericos.json"), ...ler("genericos-novos.json")];
    expect(new Set(listados).size).toBe(listados.length);
    expect([...listados].sort()).toEqual([...IDS].sort());
  });

  it("nenhum genérico fica sem uso: há para cada um um produto real que o classificador lhe entrega (e a tabela não traz ids que já não existem)", () => {
    const comUso = IDS.filter((id) => !(EM_DUVIDA as readonly string[]).includes(id));
    expect(Object.keys(USO_REAL).sort()).toEqual([...comUso].sort());
    for (const id of EM_DUVIDA) expect(IDS, id).toContain(id);
    for (const id of comUso) {
      const { n, sub } = USO_REAL[id]!;
      const p = produto(n, sub);
      expect(categoriaDoTipo(tipoMockupDe(p), n, true)?.id, `${id}: ${n}`).toBe(id);
    }
  });

  it("a lista de modelos escolháveis tem um genérico por categoria (e nada dos tirados)", () => {
    const genericos = MODELOS_ESCOLHA.filter((m) => m.familia === "generico").map((m) => m.id);
    expect(genericos).toEqual(IDS);
  });
});

describe("genéricos 3D tirados (cama, secretária, sofá, mesa): nenhum produto os usava", () => {
  it("já não existem como genérico, nem como escolha, nem como ficheiro", () => {
    for (const id of TIRADOS) {
      expect(IDS, id).not.toContain(id);
      expect(categoriaPorId(id), id).toBeUndefined();
      expect(escolhaPorId(id), id).toBeUndefined();
      expect(existsSync(join(PASTA, `${id}.glb`)), id).toBe(false);
    }
  });

  it("o tipo continua a existir e cai no desenho aproximado: nenhuma categoria genérica lhe serve (como o candeeiro ou o quadro)", () => {
    for (const t of TIRADOS) {
      expect(categoriaDoTipo(t), t).toBeUndefined();
      expect(categoriaDoTipo(t, `${t} de teste`, true), t).toBeUndefined();
    }
    for (const t of ["candeeiro", "quadro"] as const) expect(categoriaDoTipo(t, "peça", true), t).toBeUndefined();
    for (const [n, t] of [["Cama de casal 160x200", "cama"], ["Secretária 120x60", "secretaria"], ["Sofá de 3 lugares", "sofa"], ["Mesa de jantar 140x80", "mesa"]] as const) {
      const m = modeloDoProduto(produto(n));
      expect(m.mockup3d.tipo, n).toBe(t);
      expect(m.mockup3d.generico, n).toBeUndefined();
    }
  });

  it("as peças de demonstração (cama, secretária, sofá, mesa) continuam no catálogo e desenham-se pelo desenho aproximado", () => {
    for (const t of TIRADOS) {
      const d = PRODUTOS_DEMO.find((x) => x.tipo === t);
      expect(d, t).toBeDefined();
      const m = modeloDoProduto(d!);
      expect(m.mockup3d.tipo).toBe(t);
      expect(m.mockup3d.generico).toBeUndefined();
    }
  });
});

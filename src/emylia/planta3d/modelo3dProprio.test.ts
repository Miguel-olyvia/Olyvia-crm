import { describe, expect, it } from "vitest";
import {
  ErroModeloProprio, MAX_NATIVO_M, MIN_NATIVO_M, materialRecebeAparencia, medidasDoProduto, notaDeAviso, notaDeFalha, planearEscala,
} from "./modelo3dProprio";

describe("materialRecebeAparencia: cor e textura do produto em todos os materiais menos metal, vidro, espelho, luz e água", () => {
  it("recebe a cor o que não começa por um dos cinco nomes (a regra é do prefixo: «x_metal» e «luminoso» recebem)", () => {
    for (const n of ["corpo", "Corpo", "madeira", "tampo", "porta_frente", "mat_01", "x_metal", "luminoso"]) expect(materialRecebeAparencia(n), n).toBe(true);
  });
  it("não recebe os que começam por metal, vidro, espelho, luz ou agua, sem distinguir maiúsculas nem acentos", () => {
    for (const n of ["metal", "Metal_escovado", "METAL", "vidro", "Vidro_fosco", "espelho", "Espelho_1", "luz", "Luz_LED", "agua", "Água", "AGUA_fundo", "  vidro"]) {
      expect(materialRecebeAparencia(n), n).toBe(false);
    }
  });
  it("um material sem nome recebe a aparência (não há nada que o exclua)", () => {
    expect(materialRecebeAparencia(undefined)).toBe(true);
    expect(materialRecebeAparencia("")).toBe(true);
  });
});

describe("planearEscala: o GLB dá só a forma, a escala é das medidas do produto", () => {
  const nativo = { x: 1, y: 2, z: 0.5 };

  it("escala cada eixo pela sua medida (não uniforme): largura em x, altura em y, profundidade em z", () => {
    const p = planearEscala(nativo, { larguraM: 0.6, alturaM: 0.9, profundidadeM: 0.4 });
    expect(p.escala[0]).toBeCloseTo(0.6);
    expect(p.escala[1]).toBeCloseTo(0.45);
    expect(p.escala[2]).toBeCloseTo(0.8);
    expect(p.usaMedidas).toBe(true);
    expect(p.aviso).toBeNull();
  });

  it("sem medidas fica no tamanho nativo", () => {
    const p = planearEscala({ x: 0.6, y: 0.9, z: 0.4 }, null);
    expect(p.escala).toEqual([1, 1, 1]);
    expect(p.usaMedidas).toBe(false);
    expect(p.aviso).toBeNull();
  });

  it("sem medidas e fora de 1 cm a 5 m avisa (a unidade pode estar errada)", () => {
    const pequeno = planearEscala({ x: MIN_NATIVO_M / 2, y: 0.001, z: 0.001 }, null);
    expect(pequeno.escala).toEqual([1, 1, 1]);
    expect(pequeno.aviso).toMatch(/pequeno/);
    const grande = planearEscala({ x: 1, y: MAX_NATIVO_M + 1, z: 1 }, null);
    expect(grande.aviso).toMatch(/grande/);
    expect(planearEscala({ x: MIN_NATIVO_M, y: MAX_NATIVO_M, z: 1 }, null).aviso).toBeNull(); // os limites estão dentro
  });

  it("com medidas não avisa do tamanho nativo (as medidas mandam)", () => {
    expect(planearEscala({ x: 300, y: 300, z: 300 }, { larguraM: 0.6, alturaM: 0.9, profundidadeM: 0.4 }).aviso).toBeNull();
  });

  it("um eixo sem extensão (chapa) ou uma medida inválida não dá escala infinita nem zero", () => {
    const chapa = planearEscala({ x: 1, y: 0, z: 1 }, { larguraM: 0.6, alturaM: 0.9, profundidadeM: 0.4 });
    expect(chapa.escala[1]).toBe(1);
    const mau = planearEscala(nativo, { larguraM: Number.NaN, alturaM: 0, profundidadeM: -1 });
    expect(mau.escala).toEqual([1, 1, 1]);
    for (const k of mau.escala) expect(Number.isFinite(k) && k > 0).toBe(true);
  });
});

describe("medidasDoProduto: só há medidas se o produto as tem", () => {
  it("devolve metros quando as medidas vêm do nome ou da medida do produto (deNome)", () => {
    expect(medidasDoProduto({ larguraCm: 60, profundidadeCm: 40, alturaCm: 90, deNome: true })).toEqual({ larguraM: 0.6, profundidadeM: 0.4, alturaM: 0.9 });
  });
  it("devolve null quando as medidas são as de omissão do tipo (o produto não as tem)", () => {
    expect(medidasDoProduto({ larguraCm: 60, profundidadeCm: 40, alturaCm: 90, deNome: false })).toBeNull();
  });
});

describe("as notas dizem o que aconteceu, em português", () => {
  it("uma falha de rede ou de ficheiro em falta", () => {
    expect(notaDeFalha(new TypeError("Failed to fetch"))).toMatch(/carregar/);
    expect(notaDeFalha(new Error("Couldn't load URL"))).toMatch(/carregar|abriu/);
    expect(notaDeFalha(new Error("404 Not Found"))).toMatch(/carregar/);
  });
  it("um cabeçalho que não é de GLB", () => {
    expect(notaDeFalha(new Error("THREE.GLTFLoader: Unsupported asset. glTF versions >=2.0 are supported."))).toMatch(/GLB válido/);
    expect(notaDeFalha(new SyntaxError("Unexpected token < in JSON at position 0"))).toMatch(/GLB válido/);
  });
  it("Draco tem mensagem própria", () => {
    expect(notaDeFalha(new Error("THREE.GLTFLoader: setDRACOLoader() must be called to load Draco compressed meshes"))).toMatch(/Draco/);
  });
  it("o limite de triângulos (erro próprio) mostra o texto dele", () => {
    const n = notaDeFalha(new ErroModeloProprio("O modelo tem 250 000 triângulos: o limite é 200 000."));
    expect(n).toMatch(/250 000/);
    expect(n).toMatch(/genérico/);
  });
  it("qualquer outra coisa, uma frase geral; e todas dizem que se mostra o modelo genérico", () => {
    for (const e of [new Error("estranho"), "texto", undefined, new TypeError("Failed to fetch"), new Error("Draco")]) expect(notaDeFalha(e)).toMatch(/genérico/);
  });
  it("o aviso do tamanho nativo e o dos triângulos", () => {
    expect(notaDeAviso({ tamanhoNativo: "pequeno", triangulos: 10 })).toMatch(/medidas/);
    expect(notaDeAviso({ tamanhoNativo: "grande", triangulos: 10 })).toMatch(/medidas/);
    expect(notaDeAviso({ tamanhoNativo: null, triangulos: 60000 })).toMatch(/60 000/);
    expect(notaDeAviso({ tamanhoNativo: null, triangulos: 10 })).toBeNull();
  });
});

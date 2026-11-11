// 11/11: a segunda passagem da transcrição. Os blocos cortam-se no ponto calado entre 35 e 55 s; as frases revistas substituem as
// provisórias do intervalo; as contas e a transcrição guardada (falasDoTexto) para a análise.
import { describe, expect, it } from "vitest";
import { cortarEmBlocos, jaRevisto, juntarBloco, normalizar, pontoCalado, rmsMaximo } from "./blocosAudio";
import { falasDoTexto, lerInsights, metricasDaConversa, type Fala } from "./chamadaMotor";

const T = 16000;
/** «Fala» (0,2) com silêncios nos segundos pedidos. */
function audio(segundos: number, silencios: number[] = []): Float32Array {
  const x = new Float32Array(segundos * T);
  for (let i = 0; i < x.length; i++) x[i] = 0.2 * Math.sin(i / 7);
  for (const s of silencios) x.fill(0, s * T, (s + 0.6) * T);
  return x;
}

describe("o corte em blocos (11/11)", () => {
  it("corta no silêncio que houver entre os 35 e os 55 s", () => {
    const x = audio(120, [42, 95]);
    const blocos = cortarEmBlocos(x);
    expect(blocos.length).toBe(3);
    expect(blocos[0].ini).toBe(0);
    expect(blocos[0].fim / T).toBeGreaterThanOrEqual(42);
    expect(blocos[0].fim / T).toBeLessThanOrEqual(42.6);
    expect(blocos[1].ini).toBe(blocos[0].fim);
    expect(blocos[2].fim).toBe(x.length);
    for (const b of blocos) expect((b.fim - b.ini) / T).toBeLessThanOrEqual(65);
  });

  it("um áudio curto é um bloco só; um resto curto junta-se ao anterior", () => {
    expect(cortarEmBlocos(audio(20))).toEqual([{ ini: 0, fim: 20 * T }]);
    // 58 s com pausa aos 50: sobravam 8 s, que se juntam ao bloco (fica um de 58 s)
    expect(cortarEmBlocos(audio(58, [50]))).toEqual([{ ini: 0, fim: 58 * T }]);
    // 62 s com pausa aos 40: sobram 22 s, que são um bloco à parte
    expect(cortarEmBlocos(audio(62, [40]))).toHaveLength(2);
  });

  it("o ponto calado acha a pausa", () => {
    const x = audio(10, [6]);
    const p = pontoCalado(x, 2 * T, 9 * T) / T;
    expect(p).toBeGreaterThanOrEqual(6);
    expect(p).toBeLessThanOrEqual(6.6);
  });

  it("sobe o volume de um bloco baixo, no máximo 4 vezes; um normal fica igual", () => {
    const baixo = new Float32Array(T).map((_, i) => 0.05 * Math.sin(i / 5));
    expect(Math.max(...normalizar(baixo))).toBeCloseTo(0.2, 1);
    const normal = new Float32Array(T).map((_, i) => 0.9 * Math.sin(i / 5));
    expect(normalizar(normal)).toBe(normal);
    expect(rmsMaximo(new Float32Array(T))).toBe(0);
  });
});

describe("as frases revistas no lugar das provisórias (11/11)", () => {
  const f = (inicio: number, texto: string, revista = false): Fala => ({ inicio, fim: inicio + 1, texto, falante: "cliente", confianca_falante: 0.3, ...(revista ? { revista } : {}) });
  it("substitui só as provisórias do intervalo e mantém a ordem", () => {
    const antes = [f(2, "a"), f(10, "b"), f(30, "c revista", true), f(61, "d")];
    const depois = juntarBloco(antes, [f(3, "A", true), f(12, "B", true)], 0, 50);
    expect(depois.map((x) => x.texto)).toEqual(["A", "B", "c revista", "d"]);
  });
  it("uma provisória atrasada num intervalo já revisto não entra", () => {
    expect(jaRevisto(20, [[0, 45]])).toBe(true);
    expect(jaRevisto(45, [[0, 45]])).toBe(false);
  });
});

describe("a conversa guardada e as contas (11/11)", () => {
  it("lê a transcrição guardada no negócio, com quem fala e os tempos", () => {
    const fs = falasDoTexto("0:03 Cliente: Quero mudar a banheira.\n1:10 Comercial: Para quando?\ncontinua na linha seguinte\n2:00 Outra pessoa: Eu também acho.");
    expect(fs.map((x) => [x.inicio, x.falante, x.texto])).toEqual([
      [3, "cliente", "Quero mudar a banheira."], [70, "comercial", "Para quando? continua na linha seguinte"], [120, "outro", "Eu também acho."]]);
    expect(fs[0].fim).toBe(70);
    expect(falasDoTexto(undefined)).toEqual([]);
  });
  it("conta quem fala quanto e as perguntas do comercial", () => {
    const m = metricasDaConversa(falasDoTexto("0:00 Comercial: Bom dia, é a Dona Inês?\n0:05 Cliente: Sim sou eu mesma.\n0:20 Comercial: Moradia ou andar?"));
    expect(m).toMatchObject({ falas: 3, perguntasComercial: 2, duracaoS: 23 });
    expect(m.pctComercial + m.pctCliente).toBe(100);
  });
  it("lerInsights aguenta o vazio e o estragado", () => {
    expect(lerInsights(undefined)).toBeNull();
    expect(lerInsights("{x")).toBeNull();
    expect(lerInsights('{"insights":{"resumo":"ok"},"tempos":[],"em":"","metricas":{}}')?.insights.resumo).toBe("ok");
  });
});

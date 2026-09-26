import { describe, expect, it } from "vitest";
import {
  comSitio,
  comoDistancia,
  compararCaminhos,
  distanciaKm,
  horasPorRemarcar,
  ordenarPorProximidade,
  quilometros,
  type Paragem,
} from "../rota";

/* Sítios reais, para os números serem verificáveis contra o mundo. */
const LISBOA = { latitude: 38.7223, longitude: -9.1393 };
const PORTO = { latitude: 41.1579, longitude: -8.6291 };
const CASCAIS = { latitude: 38.6979, longitude: -9.4215 };
const SINTRA = { latitude: 38.7982, longitude: -9.3877 };

const p = (id: string, c: { latitude: number; longitude: number }): Paragem => ({ id, ...c });

describe("a distância entre dois pontos", () => {
  it("Lisboa ao Porto dá os ~275 km que dá", () => {
    // Se alguém trocar a fórmula por uma subtração simples, este número muda
    // e o teste apanha-o.
    expect(distanciaKm(LISBOA, PORTO)).toBeGreaterThan(270);
    expect(distanciaKm(LISBOA, PORTO)).toBeLessThan(280);
  });

  it("Lisboa a Cascais dá os ~25 km que dá", () => {
    expect(distanciaKm(LISBOA, CASCAIS)).toBeGreaterThan(23);
    expect(distanciaKm(LISBOA, CASCAIS)).toBeLessThan(27);
  });

  it("de um sítio para ele próprio é zero", () => {
    expect(distanciaKm(LISBOA, LISBOA)).toBe(0);
  });

  it("é igual nos dois sentidos", () => {
    expect(distanciaKm(LISBOA, PORTO)).toBeCloseTo(distanciaKm(PORTO, LISBOA), 9);
  });

  it("um grau de longitude vale menos em Lisboa do que no equador", () => {
    // É por isto que a fórmula tem um cosseno lá dentro. Sem ele, as paragens
    // saem ordenadas ao contrário em cidades a norte.
    const noEquador = distanciaKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 });
    const emLisboa = distanciaKm(
      { latitude: 38.72, longitude: -9.0 },
      { latitude: 38.72, longitude: -8.0 }
    );
    expect(noEquador).toBeGreaterThan(110);
    expect(emLisboa).toBeLessThan(90);
  });
});

describe("os quilómetros de um caminho", () => {
  it("somam os saltos, e não contam ida nem volta a casa", () => {
    const caminho = [p("a", LISBOA), p("b", CASCAIS)];
    expect(quilometros(caminho)).toBeCloseTo(distanciaKm(LISBOA, CASCAIS), 6);
  });

  it("um caminho de uma paragem só não tem quilómetros nenhuns", () => {
    expect(quilometros([p("a", LISBOA)])).toBe(0);
  });

  it("um caminho vazio também não", () => {
    expect(quilometros([])).toBe(0);
  });
});

describe("ordenar pela estrada", () => {
  it("mantém a primeira paragem onde estava", () => {
    // A primeira hora costuma estar combinada com o cliente. Trocá-la seria
    // resolver um problema criando outro maior.
    const dia = [p("porto", PORTO), p("lisboa", LISBOA), p("cascais", CASCAIS)];
    expect(ordenarPorProximidade(dia)[0].id).toBe("porto");
  });

  it("apanha o dia mal ordenado", () => {
    // Lisboa → Porto → Cascais é ir ao Porto e voltar. O caminho certo é
    // deixar o Porto para o fim.
    const mau = [p("lisboa", LISBOA), p("porto", PORTO), p("cascais", CASCAIS)];
    const bom = ordenarPorProximidade(mau);
    expect(bom.map((x) => x.id)).toEqual(["lisboa", "cascais", "porto"]);
    expect(quilometros(bom)).toBeLessThan(quilometros(mau));
  });

  it("não mexe no que já está bem", () => {
    const bom = [p("lisboa", LISBOA), p("sintra", SINTRA), p("porto", PORTO)];
    expect(ordenarPorProximidade(bom).map((x) => x.id)).toEqual(["lisboa", "sintra", "porto"]);
  });

  it("com duas ou menos paragens não há nada para ordenar", () => {
    expect(ordenarPorProximidade([]).length).toBe(0);
    expect(ordenarPorProximidade([p("a", LISBOA)]).map((x) => x.id)).toEqual(["a"]);
    expect(ordenarPorProximidade([p("a", LISBOA), p("b", PORTO)]).map((x) => x.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("não perde nem repete paragens", () => {
    const dia = [
      p("a", LISBOA),
      p("b", PORTO),
      p("c", CASCAIS),
      p("d", SINTRA),
      p("e", { latitude: 39.4, longitude: -8.9 }),
    ];
    const saida = ordenarPorProximidade(dia);
    expect(saida.length).toBe(5);
    expect(new Set(saida.map((x) => x.id)).size).toBe(5);
  });

  it("não altera a lista que recebeu", () => {
    const dia = [p("lisboa", LISBOA), p("porto", PORTO), p("cascais", CASCAIS)];
    ordenarPorProximidade(dia);
    expect(dia.map((x) => x.id)).toEqual(["lisboa", "porto", "cascais"]);
  });
});

describe("comparar as duas hipóteses", () => {
  it("diz que vale a pena quando há muito para ganhar", () => {
    const mau = [p("lisboa", LISBOA), p("porto", PORTO), p("cascais", CASCAIS)];
    const c = compararCaminhos(mau);
    expect(c.valeAPena).toBe(true);
    expect(c.poupanca).toBeGreaterThan(200);
    expect(c.kmMelhor).toBeLessThan(c.kmAtual);
  });

  it("cala-se quando a diferença é pequena", () => {
    // Um técnico que reordena o dia por meio quilómetro perde mais tempo a
    // pensar nisso do que a conduzir.
    const quaseIgual = [
      p("a", { latitude: 38.72, longitude: -9.14 }),
      p("b", { latitude: 38.73, longitude: -9.14 }),
      p("c", { latitude: 38.725, longitude: -9.14 }),
    ];
    expect(compararCaminhos(quaseIgual).valeAPena).toBe(false);
  });

  it("a poupança nunca é negativa", () => {
    const bom = [p("lisboa", LISBOA), p("sintra", SINTRA), p("porto", PORTO)];
    expect(compararCaminhos(bom).poupanca).toBeGreaterThanOrEqual(0);
  });

  it("com uma paragem só não há nada a dizer", () => {
    const c = compararCaminhos([p("a", LISBOA)]);
    expect(c.valeAPena).toBe(false);
    expect(c.kmAtual).toBe(0);
  });
});

describe("só as paragens que são um sítio", () => {
  it("deixa de fora quem não tem coordenadas", () => {
    const paragens = [
      { id: "a", latitude: 38.72, longitude: -9.14 },
      { id: "b", latitude: null, longitude: null },
      { id: "c", latitude: 0, longitude: 0 },
      { id: "d", latitude: 412, longitude: -9.14 },
    ];
    expect(comSitio(paragens).map((x) => x.id)).toEqual(["a"]);
  });
});

describe("os quilómetros escritos", () => {
  it("abaixo de um quilómetro vai em metros", () => {
    expect(comoDistancia(0.4)).toBe("400 m");
    expect(comoDistancia(0)).toBe("0 m");
  });

  it("acima vai com uma casa, e vírgula", () => {
    expect(comoDistancia(24.61)).toBe("24,6 km");
    expect(comoDistancia(275)).toBe("275,0 km");
  });

  it("o que não é número não finge ser", () => {
    expect(comoDistancia(Number.NaN)).toBe("—");
    expect(comoDistancia(-1)).toBe("—");
  });
});

describe("o preço de reordenar: as horas", () => {
  it("um dia por ordem não precisa de telefonema nenhum", () => {
    expect(horasPorRemarcar(["08:00", "10:00", "12:00"])).toBe(0);
  });

  it("conta cada paragem que caiu para trás", () => {
    // 08 → 12 → 15 → 10: só a última ficou fora de sítio.
    expect(horasPorRemarcar(["08:00", "12:00", "15:00", "10:00"])).toBe(1);
  });

  it("um dia todo ao contrário conta todas menos a primeira", () => {
    expect(horasPorRemarcar(["15:00", "12:00", "10:00"])).toBe(2);
  });

  it("as ordens sem hora não contam — não há nada para remarcar", () => {
    expect(horasPorRemarcar(["08:00", null, "10:00"])).toBe(0);
    expect(horasPorRemarcar([null, null])).toBe(0);
  });

  it("uma lista vazia não dá trabalho a ninguém", () => {
    expect(horasPorRemarcar([])).toBe(0);
  });
});

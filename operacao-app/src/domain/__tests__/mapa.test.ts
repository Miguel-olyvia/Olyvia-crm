import { describe, expect, it } from "vitest";
import {
  comoTexto,
  coordenadasDeLink,
  coordenadasValidas,
  MAXIMO_DE_PARAGENS,
  linkParaIr,
  linkParaRota,
  linkParaVer,
  temSitio,
} from "../mapa";

/** Praça do Comércio, Lisboa. */
const LISBOA = { latitude: 38.7223, longitude: -9.1393 };

describe("o que é um sítio no mapa", () => {
  it("aceita coordenadas normais", () => {
    expect(coordenadasValidas(38.7223, -9.1393)).toBe(true);
    expect(coordenadasValidas(-33.8688, 151.2093)).toBe(true);
  });

  it("aceita os extremos", () => {
    expect(coordenadasValidas(90, 180)).toBe(true);
    expect(coordenadasValidas(-90, -180)).toBe(true);
  });

  it("recusa uma latitude impossível", () => {
    // Um engano a colar punha o técnico a conduzir para o meio do nada, e o
    // mapa nem dava erro — desenhava o pin onde calhasse.
    expect(coordenadasValidas(412, -9.1393)).toBe(false);
    expect(coordenadasValidas(38.7223, 999)).toBe(false);
  });

  it("recusa o zero-zero", () => {
    // Fica no Atlântico, ao largo do Gana. É quase sempre um campo vazio que
    // virou zero, e não um sítio onde alguém vá trabalhar.
    expect(coordenadasValidas(0, 0)).toBe(false);
  });

  it("recusa o que não é número", () => {
    expect(coordenadasValidas(Number.NaN, 0)).toBe(false);
    expect(coordenadasValidas("38.7", -9.1)).toBe(false);
    expect(coordenadasValidas(null, null)).toBe(false);
    expect(coordenadasValidas(undefined, undefined)).toBe(false);
  });
});

describe("ler um link do Maps colado", () => {
  it("o pin exato, quando o link o traz", () => {
    const r = coordenadasDeLink(
      "https://www.google.com/maps/place/Pra%C3%A7a+do+Com%C3%A9rcio/@38.7100,-9.1500,17z/data=!4m6!3m5!1s0x0:0x0!8m2!3d38.7075!4d-9.1364"
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      // O !3d é o sítio; o @ é o centro do ecrã. Ganha o !3d.
      expect(r.coordenadas.latitude).toBeCloseTo(38.7075, 4);
      expect(r.coordenadas.longitude).toBeCloseTo(-9.1364, 4);
    }
  });

  it("o centro do ecrã, quando não há pin", () => {
    const r = coordenadasDeLink("https://www.google.com/maps/@38.7223,-9.1393,15z");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.coordenadas.latitude).toBeCloseTo(38.7223, 4);
  });

  it("a forma antiga com ?q=", () => {
    const r = coordenadasDeLink("https://maps.google.com/maps?q=38.7223,-9.1393");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.coordenadas.longitude).toBeCloseTo(-9.1393, 4);
  });

  it("a forma documentada, com ?api=1&query=", () => {
    const r = coordenadasDeLink(
      "https://www.google.com/maps/search/?api=1&query=41.1579,-8.6291"
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.coordenadas.latitude).toBeCloseTo(41.1579, 4);
  });

  it("coordenadas escritas à mão, sem link nenhum", () => {
    const r = coordenadasDeLink("38.7223, -9.1393");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.coordenadas.latitude).toBeCloseTo(38.7223, 4);
  });

  it("um link encurtado diz o que fazer, em vez de falhar em silêncio", () => {
    const r = coordenadasDeLink("https://maps.app.goo.gl/abc123");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("barra de endereço");
  });

  it("texto sem coordenadas nenhumas explica-se", () => {
    const r = coordenadasDeLink("Rua Augusta, Lisboa");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("coordenadas");
  });

  it("vazio pede o link", () => {
    expect(coordenadasDeLink("").ok).toBe(false);
    expect(coordenadasDeLink("   ").ok).toBe(false);
  });

  it("meio link também dá coordenadas — e é por isso que só se lê no fim", () => {
    // A meio de escrever `41.1456,-8.6146`, o texto já contém `41.1456,-8`,
    // que é um sítio perfeitamente válido — a 68 km do certo. Nenhuma leitura
    // de texto consegue distinguir os dois casos, porque não há nada para
    // distinguir. Quem tem de resolver isto é o campo, lendo só quando o
    // texto está inteiro: ao colar, ao sair, ou no Enter.
    const meio = coordenadasDeLink("41.1456,-8");
    expect(meio.ok).toBe(true);
    if (meio.ok) expect(meio.coordenadas.longitude).toBe(-8);

    const inteiro = coordenadasDeLink("41.1456,-8.6146");
    expect(inteiro.ok).toBe(true);
    if (inteiro.ok) expect(inteiro.coordenadas.longitude).toBeCloseTo(-8.6146, 4);
  });

  it("um link com números impossíveis é recusado, e diz quais", () => {
    const r = coordenadasDeLink("https://www.google.com/maps/@412,-9.1393,15z");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("412");
  });
});

describe("os links que se abrem", () => {
  it("com coordenadas, manda o ponto", () => {
    const u = linkParaVer(LISBOA)!;
    expect(u).toContain("api=1");
    expect(u).toContain("38.7223%2C-9.1393");
  });

  it("sem coordenadas, manda a morada", () => {
    const u = linkParaVer({ morada: "Rua Augusta 100, Lisboa" })!;
    expect(u).toContain("Rua%20Augusta%20100");
  });

  it("as coordenadas ganham sempre à morada", () => {
    // Uma morada escrita à mão tem gralhas e ruas com o mesmo nome em três
    // cidades. Um ponto não tem nada disso.
    const u = linkParaVer({ ...LISBOA, morada: "Rua Augusta 100" })!;
    expect(u).toContain("38.7223");
    expect(u).not.toContain("Augusta");
  });

  it("sem nada, não há link", () => {
    expect(linkParaVer({})).toBeNull();
    expect(linkParaVer({ morada: "   " })).toBeNull();
    expect(linkParaVer({ latitude: 0, longitude: 0 })).toBeNull();
  });

  it("o link de ir é de navegação, e não de ver", () => {
    const u = linkParaIr(LISBOA)!;
    expect(u).toContain("/dir/");
    expect(u).toContain("destination=");
  });

  it("uma morada com & e # não parte o link", () => {
    const u = linkParaVer({ morada: "Praça 5 & 6, nº 3" })!;
    expect(u).not.toContain("& ");
    expect(u).toContain("%26");
  });

  it("temSitio diz se dá para abrir de todo", () => {
    expect(temSitio(LISBOA)).toBe(true);
    expect(temSitio({ morada: "Rua Augusta" })).toBe(true);
    expect(temSitio({})).toBe(false);
    expect(temSitio({ latitude: 38.7, longitude: null })).toBe(false);
  });
});

describe("as coordenadas escritas", () => {
  it("levam seis casas — chegam a uns dez centímetros", () => {
    expect(comoTexto(LISBOA)).toBe("38.722300, -9.139300");
  });
});

describe("o link do dia inteiro", () => {
  const PORTO = { latitude: 41.1579, longitude: -8.6291 };
  const CASCAIS = { latitude: 38.6979, longitude: -9.4215 };

  it("com duas paragens é só origem e destino", () => {
    const u = linkParaRota([LISBOA, PORTO])!;
    expect(u).toContain("origin=38.7223%2C-9.1393");
    expect(u).toContain("destination=41.1579%2C-8.6291");
    expect(u).not.toContain("waypoints");
  });

  it("as do meio vão em waypoints, pela ordem dada", () => {
    const u = linkParaRota([LISBOA, CASCAIS, PORTO])!;
    expect(u).toContain("waypoints=38.6979%2C-9.4215");
    expect(u).toContain("destination=41.1579%2C-8.6291");
  });

  it("de carro, que é como o técnico anda", () => {
    expect(linkParaRota([LISBOA, PORTO])).toContain("travelmode=driving");
  });

  it("uma paragem só não é um caminho", () => {
    expect(linkParaRota([LISBOA])).toBeNull();
    expect(linkParaRota([])).toBeNull();
  });

  it("um dia grande de mais recusa-se, em vez de cortar em silêncio", () => {
    // Cortar daria um caminho que salta sítios sem ninguém perceber.
    const muitas = Array.from({ length: MAXIMO_DE_PARAGENS + 1 }, (_, i) => ({
      latitude: 38.7 + i * 0.01,
      longitude: -9.1,
    }));
    expect(linkParaRota(muitas)).toBeNull();
  });
});

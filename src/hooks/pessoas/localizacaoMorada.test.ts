// «Estou no local»: a morada da obra a partir da localização do dispositivo, pela mesma via do protótipo (OpenStreetMap/Nominatim, reverse).
// Só devolve rua, código postal e localidade; as coordenadas nunca saem daqui (não se guardam). Rede e geolocalização são simuladas.
import { afterEach, describe, expect, it, vi } from "vitest";
import { moradaDaPosicao, obterMoradaDoLocal, ErroLocalizacao, URL_MORADAS } from "./localizacaoMorada";

const resposta = (json: unknown, ok = true, status = 200) => ({ ok, status, json: async () => json }) as unknown as Response;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("moradaDaPosicao", () => {
  it("monta a rua com o número, o código postal e a localidade, e pede em português", async () => {
    const pedido = vi.fn().mockResolvedValue(resposta({
      address: { road: "Rua das Flores", house_number: "12", postcode: "4000-123", town: "Porto (União de freguesias)" },
    }));
    const m = await moradaDaPosicao(41.15, -8.61, pedido);
    expect(m).toEqual({ rua: "Rua das Flores 12", codigoPostal: "4000-123", localidade: "Porto" });
    const url = String(pedido.mock.calls[0][0]);
    expect(url.startsWith(URL_MORADAS)).toBe(true);
    expect(url).toContain("lat=41.15");
    expect(url).toContain("lon=-8.61");
    expect(url).toContain("accept-language=pt");
  });

  it("usa a primeira via disponível e a primeira localidade disponível", async () => {
    const pedido = vi.fn().mockResolvedValue(resposta({ address: { pedestrian: "Praça Nova", village: "Aldeia", postcode: "1000-001" } }));
    expect(await moradaDaPosicao(1, 2, pedido)).toEqual({ rua: "Praça Nova", codigoPostal: "1000-001", localidade: "Aldeia" });
  });

  it("um código postal fora do formato 0000-000 fica vazio (a base só aceita esse formato)", async () => {
    const pedido = vi.fn().mockResolvedValue(resposta({ address: { road: "Rua A", postcode: "1000", city: "Lisboa" } }));
    expect((await moradaDaPosicao(1, 2, pedido)).codigoPostal).toBe("");
  });

  it("sem rua nem localidade é um erro 'sem morada'", async () => {
    const pedido = vi.fn().mockResolvedValue(resposta({ address: { postcode: "1000-001" } }));
    await expect(moradaDaPosicao(1, 2, pedido)).rejects.toMatchObject({ motivo: "semMorada" });
  });

  it("resposta sem 'address' é 'sem morada'", async () => {
    const pedido = vi.fn().mockResolvedValue(resposta({}));
    await expect(moradaDaPosicao(1, 2, pedido)).rejects.toBeInstanceOf(ErroLocalizacao);
  });

  it("o serviço recusar (HTTP) ou a rede falhar (CSP incluída) é 'servico'", async () => {
    await expect(moradaDaPosicao(1, 2, vi.fn().mockResolvedValue(resposta({}, false, 503)))).rejects.toMatchObject({ motivo: "servico" });
    await expect(moradaDaPosicao(1, 2, vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))).rejects.toMatchObject({ motivo: "servico" });
  });
});

function geolocalizacao(resultado: "ok" | "negada" | "indisponivel") {
  const getCurrentPosition = vi.fn((aceita: PositionCallback, recusa: PositionErrorCallback) => {
    if (resultado === "ok") aceita({ coords: { latitude: 38.7, longitude: -9.1, accuracy: 12 } } as GeolocationPosition);
    else recusa({ code: resultado === "negada" ? 1 : 2, PERMISSION_DENIED: 1 } as GeolocationPositionError);
  });
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition } });
  return getCurrentPosition;
}

describe("obterMoradaDoLocal", () => {
  it("pede a posição com alta precisão e devolve a morada e a precisão, sem coordenadas", async () => {
    const pos = geolocalizacao("ok");
    const pedido = vi.fn().mockResolvedValue(resposta({ address: { road: "Rua B", postcode: "1000-002", city: "Lisboa" } }));
    const r = await obterMoradaDoLocal(pedido);
    expect(r).toEqual({ morada: { rua: "Rua B", codigoPostal: "1000-002", localidade: "Lisboa" }, precisaoMetros: 12 });
    expect(Object.keys(r)).not.toContain("latitude");
    expect(pos.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: true });
  });

  it("sem geolocalização no dispositivo é 'semSuporte'", async () => {
    vi.stubGlobal("navigator", {});
    await expect(obterMoradaDoLocal(vi.fn())).rejects.toMatchObject({ motivo: "semSuporte" });
  });

  it("autorização recusada é 'negada'; outra falha é 'posicao'; e a rede nem é chamada", async () => {
    const pedido = vi.fn();
    geolocalizacao("negada");
    await expect(obterMoradaDoLocal(pedido)).rejects.toMatchObject({ motivo: "negada" });
    geolocalizacao("indisponivel");
    await expect(obterMoradaDoLocal(pedido)).rejects.toMatchObject({ motivo: "posicao" });
    expect(pedido).not.toHaveBeenCalled();
  });
});

// O universo de exemplo de RH tem uma data de referência fixa: o relógio do computador não o move.
// Corre a mesma fotografia com o relógio simulado em duas datas e exige que seja igual.
import { afterEach, describe, expect, it, vi } from "vitest";
import { HOJE_EXEMPLO_RH, agoraExemplo, momentoDePicagemAgora } from "./hojeExemplo";

interface Fotografia {
  hoje: string;
  hojeDaAssiduidade: string;
  hojeDaBase: string;
  pedroSaida: string | null;
  pedroDiasDeContratoSetembro: unknown;
  totalBrutoSetembro: number;
  totalBrutoAgosto: number;
  periodos: string[];
  fechos: string[];
  estadosDeAdmissao: Record<string, string>;
  horasAteExpirar: Record<string, number>;
}

async function fotografar(relogio: string): Promise<Fotografia> {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(relogio));
  const { hojeIso } = await import("@/components/rh-exemplo/dados/datas");
  const assiduidade = await import("@/components/rh-exemplo/lib/assiduidade");
  const { dataDeHojeBase } = await import("@/components/rh-exemplo/lib/dataBase");
  const { lerEstado, repor } = await import("@/components/rh-exemplo/dados/loja");
  const { lerGestao, reporGestao } = await import("@/components/rh-exemplo/dados/lojaGestao");
  const { reporFluxosB } = await import("@/components/rh-exemplo/dados/lojaFluxosB");
  const { lerFluxosC, reporFluxosC } = await import("@/components/rh-exemplo/fluxosC/lojaFluxosC");
  const { calcularMes, fichasDoCalculo } = await import("@/components/rh-exemplo/fluxosC/salarioEntrada");
  const { criarAdmissoesIniciais } = await import("@/components/rh-exemplo/dados/admissaoExemplo");
  const { estadoVisivel } = await import("@/components/rh-exemplo/lib/admissaoFluxo");
  repor();
  reporGestao();
  reporFluxosB();
  reporFluxosC();

  const estado = lerEstado();
  const linhasDe = (mes: number) => calcularMes(fichasDoCalculo(estado.fichas, estado.ordem, 2026, mes), lerFluxosC(), 2026, mes);
  const total = (mes: number): number =>
    Math.round(linhasDe(mes).reduce((s, l) => s + (l.resultado.totalBruto ?? 0), 0) * 100) / 100;
  const admissoes = criarAdmissoesIniciais(estado);
  const ids = Object.keys(admissoes.porPessoa).sort();
  return {
    hoje: hojeIso(),
    hojeDaAssiduidade: assiduidade.hojeIso(),
    hojeDaBase: dataDeHojeBase(),
    pedroSaida: estado.fichas["p-pedro"].pessoa.data_saida ?? null,
    pedroDiasDeContratoSetembro: linhasDe(9).find((l) => l.pessoaId === "p-pedro")?.entrada.diasDeContrato,
    totalBrutoSetembro: total(9),
    totalBrutoAgosto: total(8),
    periodos: lerGestao().periodos.map((p) => `${p.ano}-${p.mes}:${p.estado}`).sort(),
    fechos: Object.keys(lerFluxosC().fechos),
    estadosDeAdmissao: Object.fromEntries(ids.map((id) => [id, estadoVisivel(admissoes.porPessoa[id], agoraExemplo())])),
    horasAteExpirar: Object.fromEntries(
      ids.map((id) => [id, Math.round((Date.parse(admissoes.porPessoa[id].login.expiraEm) - agoraExemplo().getTime()) / 3_600_000)]),
    ),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("o relógio do computador não mexe nos dados de exemplo de RH", () => {
  it("a mesma fotografia com o relógio em 14/10/2026 e em 1/3/2027", async () => {
    const emOutubro = await fotografar("2026-10-14T12:00:00Z");
    const emMarco = await fotografar("2027-03-01T12:00:00Z");
    expect(emMarco).toEqual(emOutubro);
  });

  it("fixa Setembro a processar, Agosto fechado, o Pedro a 4/9 e os totais de 14/10", async () => {
    const f = await fotografar("2027-03-01T12:00:00Z");
    expect(f.hoje).toBe(HOJE_EXEMPLO_RH);
    expect(f.hojeDaAssiduidade).toBe(HOJE_EXEMPLO_RH);
    expect(f.hojeDaBase).toBe(HOJE_EXEMPLO_RH);
    expect(f.pedroSaida).toBe("2026-09-04");
    expect(f.pedroDiasDeContratoSetembro).toEqual({ dias: 4, doMes: 30 });
    expect(f.totalBrutoSetembro).toBe(18688.01);
    expect(f.totalBrutoAgosto).toBe(19396.65);
    expect(f.periodos).toEqual(["2026-8:fechado", "2026-9:aberto"]);
    expect(f.fechos).toEqual(["2026-08"]);
  });

  it("os convites de admissão não mudam de estado com o tempo (Lara 6 dias, Beatriz 30 h, Rúben expirada)", async () => {
    const f = await fotografar("2027-03-01T12:00:00Z");
    expect(f.estadosDeAdmissao["p-ruben"]).toBe("expirado");
    expect(f.horasAteExpirar["p-lara"]).toBe(6 * 24 + 4);
    expect(f.horasAteExpirar["p-beatriz"]).toBe(30);
    expect(f.horasAteExpirar["p-ruben"]).toBe(-48);
    for (const [id, estado] of Object.entries(f.estadosDeAdmissao)) {
      if (id !== "p-ruben") expect(estado).not.toBe("expirado");
    }
  });

  it("uma picagem feita agora cai no dia de referência, com a hora do relógio real", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-03-01T09:30:15"));
    const momento = new Date(momentoDePicagemAgora());
    expect(momento.getFullYear()).toBe(2026);
    expect(momento.getMonth()).toBe(9);
    expect(momento.getDate()).toBe(14);
    expect([momento.getHours(), momento.getMinutes(), momento.getSeconds()]).toEqual([9, 30, 15]);
  });
});

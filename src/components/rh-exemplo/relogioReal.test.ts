// Relógio real nos ecrãs de RH que já falam com dados reais: «hoje» é o do computador, não o 14/10/2026 do exemplo.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hojeIso as hojeIsoAssiduidade } from "@/components/rh-exemplo/lib/assiduidade";
import { hojeIso as hojeIsoAusencias } from "@/components/rh-exemplo/lib/ausencias";
import { dataDeHojeBase } from "@/components/rh-exemplo/lib/dataBase";
import { hojeIsoServidor } from "@/components/rh-exemplo/lib/horario";

const DIA_REAL = "2027-03-05";

describe("relógio real das funções de data", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(`${DIA_REAL}T10:00:00Z`));
  });
  afterEach(() => vi.useRealTimers());

  it("hojeIso (assiduidade) devolve o dia do relógio", () => expect(hojeIsoAssiduidade()).toBe(DIA_REAL));
  it("hojeIso (ausências) devolve o dia do relógio", () => expect(hojeIsoAusencias()).toBe(DIA_REAL));
  it("hojeIsoServidor devolve o dia UTC do relógio", () => expect(hojeIsoServidor()).toBe(DIA_REAL));
  it("dataDeHojeBase devolve o dia UTC do relógio", () => expect(dataDeHojeBase()).toBe(DIA_REAL));
  it("continua a aceitar uma data explícita", () => {
    expect(hojeIsoAssiduidade(new Date(2026, 0, 2))).toBe("2026-01-02");
    expect(dataDeHojeBase(new Date("2026-01-02T12:00:00Z"))).toBe("2026-01-02");
  });
});

describe("ficheiros ligados a dados reais não usam o relógio de exemplo", () => {
  const RAIZ = join(process.cwd(), "src/components/rh-exemplo");
  it.each([
    "lib/assiduidade.ts",
    "lib/ausencias.ts",
    "lib/horario.ts",
    "lib/dataBase.ts",
    "PessoaAusenciasTab.tsx",
    "PessoaAssiduidadeTab.tsx",
    "PessoaRelatorioAssiduidadeMensal.tsx",
    "ausencias/AjusteSaldoSheet.tsx",
    "ausencias/PedirAusenciaSheet.tsx",
    "assiduidadeAbas/AbaPicar.tsx",
    "PessoaVisaoGeralTab.tsx",
    "novaPessoa/FormularioNovaPessoa.tsx",
    "novaPessoa/AbaRetribuicao.tsx",
    "../../pages/rh-exemplo/RhAusenciasOrganizacao.tsx",
  ])("%s", (f) => {
    expect(readFileSync(join(RAIZ, f), "utf8")).not.toMatch(/hojeExemplo|agoraExemplo|HOJE_EXEMPLO_RH/);
  });
});

// Os dados REAIS de uma pessoa para o custo: cargo, centro e filial vem dos catalogos reais, a retribuicao do mes e a dada
// (o total bruto estimado do processamento) e as horas por semana derivam das horas realmente planeadas do mes.
import { describe, expect, it } from "vitest";
import { horasPrevistasDoMes } from "@/components/rh-exemplo/lib/custo";
import { horasSemanaisDoPlaneado, pessoaParaCusto, SEM_CATALOGOS } from "./pessoaParaCusto";

const PESSOA = { id: "p1", nome_completo: "Ana Real", cargo: "Texto antigo", cargo_id: "c1", local_id: "l1" };
const CATALOGOS = {
  locais: [{ id: "l1", nome: "Loja Porto", organograma_node_id: "f1" }, { id: "l2", nome: "Loja Sem Filial", organograma_node_id: null }],
  filiais: [{ id: "f1", name: "Filial Porto" }],
  cargos: [{ id: "c1", nome: "Gerente" }],
};
const DADOS = { retribuicaoMes: 1234.5, planeadoMinutos: 9600 };

describe("horasSemanaisDoPlaneado", () => {
  it("as horas previstas do custo voltam a ser exactamente as horas planeadas do mes, em qualquer mes", () => {
    for (const mes of ["2026-02", "2026-09", "2026-10", "2026-12", "2027-03"]) {
      for (const horasPlaneadas of [120, 160, 173.5, 8]) {
        const semanais = horasSemanaisDoPlaneado(horasPlaneadas * 60, mes);
        expect(horasPrevistasDoMes(semanais, mes)).toBeCloseTo(horasPlaneadas, 1);
      }
    }
  });

  it("sem horas planeadas (ou negativas) fica a 0: o custo por hora fica sem valor, nao se inventa uma semana de 40 h", () => {
    expect(horasSemanaisDoPlaneado(0, "2026-09")).toBe(0);
    expect(horasSemanaisDoPlaneado(-60, "2026-09")).toBe(0);
  });

  it("um mes de 22 dias uteis com 8 h por dia dá 40 h por semana", () => {
    // Setembro de 2026 tem 22 dias uteis.
    expect(horasSemanaisDoPlaneado(22 * 8 * 60, "2026-09")).toBeCloseTo(40, 6);
  });
});

describe("pessoaParaCusto", () => {
  it("junta o cargo do catalogo, o centro e a filial, a retribuicao dada e as horas derivadas", () => {
    const p = pessoaParaCusto(PESSOA, CATALOGOS, DADOS, "2026-09");
    expect(p).toMatchObject({
      pessoaId: "p1", nome: "Ana Real", cargo: "Gerente", centroId: "l1", centro: "Loja Porto", filialId: "f1", filial: "Filial Porto",
      retribuicaoMes: 1234.5,
    });
    expect(p.horasSemanais).toBeCloseTo(horasSemanaisDoPlaneado(9600, "2026-09"), 10);
  });

  it("o tipo de contrato fica sem valor: nao ha fonte para toda a organizacao", () => {
    expect(pessoaParaCusto(PESSOA, CATALOGOS, DADOS, "2026-09").tipoContrato).toBeNull();
  });

  it("um cargo fora do catalogo cai para o texto da pessoa, e sem nenhum fica sem cargo", () => {
    expect(pessoaParaCusto({ ...PESSOA, cargo_id: "x" }, CATALOGOS, DADOS, "2026-09").cargo).toBe("Texto antigo");
    expect(pessoaParaCusto({ ...PESSOA, cargo_id: null, cargo: null }, CATALOGOS, DADOS, "2026-09").cargo).toBeNull();
  });

  it("um centro sem filial ou uma pessoa sem centro nao inventam filial", () => {
    const semFilial = pessoaParaCusto({ ...PESSOA, local_id: "l2" }, CATALOGOS, DADOS, "2026-09");
    expect(semFilial).toMatchObject({ centroId: "l2", centro: "Loja Sem Filial", filialId: null, filial: null });
    const semCentro = pessoaParaCusto({ ...PESSOA, local_id: null }, CATALOGOS, DADOS, "2026-09");
    expect(semCentro).toMatchObject({ centroId: null, centro: null, filialId: null, filial: null });
  });

  it("sem catalogos nao rebenta: so o texto da pessoa", () => {
    const p = pessoaParaCusto(PESSOA, SEM_CATALOGOS, DADOS, "2026-09");
    expect(p).toMatchObject({ cargo: "Texto antigo", centro: null, filial: null });
  });

  it("sem retribuicao fica sem retribuicao (nao zero)", () => {
    expect(pessoaParaCusto(PESSOA, CATALOGOS, { ...DADOS, retribuicaoMes: null }, "2026-09").retribuicaoMes).toBeNull();
  });
});

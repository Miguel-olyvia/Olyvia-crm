// Os dados REAIS de uma pessoa para o custo: cargo, centro e filial vem dos catalogos reais, a retribuicao do mes e a dada
// (o total bruto estimado do processamento) e as horas por semana derivam das horas realmente planeadas do mes.
import { describe, expect, it } from "vitest";
import { horasPrevistasDoMes } from "@/components/rh-exemplo/lib/custo";
import { horasContratuaisNoMes, horasSemanaisDaBase, horasSemanaisDoPlaneado, pessoaParaCusto, SEM_CATALOGOS } from "./pessoaParaCusto";

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

  it("o tipo de contrato fica sem valor quando nao se leu nenhum vinculo, e vem do vinculo quando se leu", () => {
    expect(pessoaParaCusto(PESSOA, CATALOGOS, DADOS, "2026-09").tipoContrato).toBeNull();
    expect(pessoaParaCusto(PESSOA, CATALOGOS, { ...DADOS, tipoContrato: null }, "2026-09").tipoContrato).toBeNull();
    expect(pessoaParaCusto(PESSOA, CATALOGOS, { ...DADOS, tipoContrato: "termo_certo" }, "2026-09").tipoContrato).toBe("termo_certo");
  });

  it("as horas por semana do contrato mandam; sem elas (ou a zero) deriva do planeado", () => {
    expect(pessoaParaCusto(PESSOA, CATALOGOS, { ...DADOS, horasContratuais: 20 }, "2026-09").horasSemanais).toBe(20);
    const derivado = horasSemanaisDoPlaneado(9600, "2026-09");
    expect(pessoaParaCusto(PESSOA, CATALOGOS, { ...DADOS, horasContratuais: null }, "2026-09").horasSemanais).toBeCloseTo(derivado, 10);
    expect(pessoaParaCusto(PESSOA, CATALOGOS, { ...DADOS, horasContratuais: 0 }, "2026-09").horasSemanais).toBeCloseTo(derivado, 10);
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

  it("o seguro e o do cargo da pessoa: 5 % no cargo com seguro, sem seguro no cargo sem ele (ou sem catalogo)", () => {
    const comSeguro = { ...CATALOGOS, cargos: [{ id: "c1", nome: "Gerente", seguro_acidentes_pct: 5 }] };
    const semSeguro = { ...CATALOGOS, cargos: [{ id: "c1", nome: "Gerente", seguro_acidentes_pct: null }] };
    expect(pessoaParaCusto(PESSOA, comSeguro, DADOS, "2026-09").seguroPct).toBe(5);
    expect(pessoaParaCusto(PESSOA, semSeguro, DADOS, "2026-09").seguroPct).toBeNull();
    expect(pessoaParaCusto(PESSOA, CATALOGOS, DADOS, "2026-09").seguroPct).toBeNull();
    expect(pessoaParaCusto(PESSOA, SEM_CATALOGOS, DADOS, "2026-09").seguroPct).toBeNull();
  });

  it("uma pessoa que so existe no gravado (cargo desconhecido) fica com o seguro desconhecido, nao «sem seguro»", () => {
    const soNoGravado = { id: "p9", nome_completo: "Saiu", cargo: null, cargo_id: null, local_id: null, soNoGravado: true as const };
    expect(pessoaParaCusto(soNoGravado, CATALOGOS, DADOS, "2026-09")).toMatchObject({ seguroPct: null, seguroDesconhecido: true });
    // Uma pessoa da lista sem cargo atribuido e outra coisa: sabe-se que nao tem cargo, logo nao ha seguro.
    expect(pessoaParaCusto({ ...PESSOA, cargo_id: null }, CATALOGOS, DADOS, "2026-09").seguroDesconhecido).toBeUndefined();
    expect(pessoaParaCusto(PESSOA, CATALOGOS, DADOS, "2026-09").seguroDesconhecido).toBeUndefined();
  });

  it("a decomposicao so vale para a retribuicao real: sem retribuicao ou com estimativa pelo cargo fica a null", () => {
    const decomposicao = { salarioBase: 1000, divisor: 14, duodecimos: 0, subsidioAlimentacao: 0, horasExtra: 0, descontoFaltas: 0, iht: null, km: null, ajudas: null };
    expect(pessoaParaCusto(PESSOA, CATALOGOS, { ...DADOS, decomposicao }, "2026-09").decomposicao).toBe(decomposicao);
    expect(pessoaParaCusto(PESSOA, CATALOGOS, { ...DADOS, retribuicaoMes: null, decomposicao }, "2026-09").decomposicao).toBeNull();
    const estimativa = { estado: "estimado" as const, cargo: "Gerente", salario: 1200 };
    const estimada = pessoaParaCusto(PESSOA, CATALOGOS, { ...DADOS, retribuicaoMes: null, decomposicao, estimativa }, "2026-09");
    expect(estimada).toMatchObject({ retribuicaoMes: 1200, decomposicao: null });
  });
});

describe("horasSemanaisDaBase", () => {
  it("o contrato ganha ao planeado, e sem contrato nem planeado fica a 0 (nunca 40 inventadas)", () => {
    expect(horasSemanaisDaBase(35, 9600, "2026-09")).toBe(35);
    expect(horasSemanaisDaBase(undefined, 0, "2026-09")).toBe(0);
    expect(horasSemanaisDaBase(null, 22 * 8 * 60, "2026-09")).toBeCloseTo(40, 6);
  });
});

describe("horasContratuaisNoMes", () => {
  const versoes = [
    { valido_de: "2025-01-01", valido_ate: "2026-04-01", horas_semanais_equivalentes: 40 },
    { valido_de: "2026-04-01", valido_ate: null, horas_semanais_equivalentes: 20 },
  ];

  it("escolhe a versao que cobre o mes, com o fim exclusivo (a de 40 h acaba a 1 de abril)", () => {
    expect(horasContratuaisNoMes(versoes, "2026-03")).toBe(40);
    expect(horasContratuaisNoMes(versoes, "2026-04")).toBe(20);
    expect(horasContratuaisNoMes(versoes, "2026-09")).toBe(20);
  });

  it("antes de qualquer versao, sem versoes, ou com a versao sem horas equivalentes, fica sem valor", () => {
    expect(horasContratuaisNoMes(versoes, "2024-12")).toBeNull();
    expect(horasContratuaisNoMes([], "2026-09")).toBeNull();
    expect(horasContratuaisNoMes([{ valido_de: "2026-01-01", valido_ate: null, horas_semanais_equivalentes: null }], "2026-09")).toBeNull();
  });
});

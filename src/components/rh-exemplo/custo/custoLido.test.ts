// O custo sem React: a RETRIBUICAO de cada pessoa vem de fora (o total bruto estimado do processamento salarial real) e
// o resto (avulsos, equipamentos, taxas) vem do store em memoria do custo. O modulo «Custos» e as abas Custo das fichas
// tem de bater, ao centimo. A data e fixa (14/10/2026) para os dados de exemplo serem os mesmos.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { repor, lerEstado } from "@/components/rh-exemplo/dados/loja";
import { atribuirEquipamento, definirMesCusto, devolverEquipamento, lerCusto, reporCusto } from "@/components/rh-exemplo/dados/lojaCusto";
import { contaUmaVez } from "@/components/rh-exemplo/lib/comoConta";
import { totaisDaOrganizacao, type PessoaParaCusto } from "@/components/rh-exemplo/lib/custoOrganizacao";
import { situacaoDoEquipamento, valorDoEquipamentoNoMes, type EquipamentoPessoa } from "@/components/rh-exemplo/lib/equipamentos";
import { custoDaPessoa, linhasDaOrganizacao } from "./custoLido";

const MES = "2026-09";
const cent = (v: number | null): number => Math.round((v ?? 0) * 100);

const pessoa = (pessoaId: string, retribuicaoMes: number | null = 1000, extra: Partial<PessoaParaCusto> = {}): PessoaParaCusto => ({
  pessoaId, nome: pessoaId, cargo: null, centroId: null, centro: null, filialId: null, filial: null, tipoContrato: null,
  retribuicaoMes, horasSemanais: 40, ...extra,
});

/** As pessoas dos dados de exemplo do custo (os equipamentos e avulsos de exemplo estao ligados a estes ids). */
const PESSOAS = [pessoa("p-hugo", 1400), pessoa("p-ines", 1100), pessoa("p-tiago", 950.55), pessoa("p-marta", 2000)];
const fichaDe = (id: string, mes: string, horasFeitas = 0) => custoDaPessoa(PESSOAS.find((p) => p.pessoaId === id) as PessoaParaCusto, mes, horasFeitas);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T12:00:00"));
  repor();
  reporCusto();
});

afterEach(() => vi.useRealTimers());

describe("a retribuicao vem de fora e o custo bate entre o modulo e a ficha", () => {
  it("a retribuicao de cada linha e exactamente a que se passou, sem conta repetida", () => {
    const linhas = linhasDaOrganizacao(MES, PESSOAS);
    expect(linhas.map((l) => l.pessoaId)).toEqual(PESSOAS.map((p) => p.pessoaId));
    for (const p of PESSOAS) expect(linhas.find((l) => l.pessoaId === p.pessoaId)?.retribuicao).toBe(p.retribuicaoMes);
    expect(cent(totaisDaOrganizacao(linhas).retribuicao)).toBe(cent(PESSOAS.reduce((s, p) => s + (p.retribuicaoMes ?? 0), 0)));
  });

  it("uma pessoa sem retribuicao fica sem custo (nao zero) e conta como «sem valor»", () => {
    const linhas = linhasDaOrganizacao(MES, [pessoa("p-tiago", null), pessoa("p-ines", 1100)]);
    expect(linhas[0].retribuicao).toBeNull();
    expect(linhas[0].total).toBeNull();
    expect(linhas[1].total).not.toBeNull();
    expect(totaisDaOrganizacao(linhas).semValor).toBe(1);
    const ficha = custoDaPessoa(pessoa("p-tiago", null), MES, 0);
    expect(ficha.retribuicaoMes).toBeNull();
    expect(ficha.atual.total).toBeNull();
    expect(ficha.composicao).toEqual([]);
  });

  it("sem pessoas nao ha linhas nem totais inventados", () => {
    expect(linhasDaOrganizacao(MES, [])).toEqual([]);
    expect(totaisDaOrganizacao([]).total).toBe(0);
  });

  it("o custo total do modulo e a soma das abas Custo das fichas, pessoa a pessoa e no total", () => {
    const linhas = linhasDaOrganizacao(MES, PESSOAS);
    for (const l of linhas) {
      const ficha = fichaDe(l.pessoaId, MES);
      expect(ficha.atual.total).toBe(l.total);
      expect(ficha.retribuicaoMes).toBe(l.retribuicao);
      expect(ficha.atual.outrosCustos).toBe(l.equipamentosMes);
      expect(ficha.atual.kmEAjudas).toBe(l.avulsosMes);
    }
    const somaDasFichas = linhas.reduce((s, l) => s + cent(fichaDe(l.pessoaId, MES).atual.total), 0);
    expect(cent(totaisDaOrganizacao(linhas).total)).toBe(somaDasFichas);
  });

  it("os totais fecham: retribuicao + encargos + seguro + avulsos + equipamentos = custo total", () => {
    const t = totaisDaOrganizacao(linhasDaOrganizacao(MES, PESSOAS));
    expect(t.semValor).toBe(0);
    expect(cent(t.retribuicao) + cent(t.encargos) + cent(t.seguro) + cent(t.avulsos) + cent(t.equipamentos)).toBe(cent(t.total));
    expect(t.avulsos).toBeGreaterThan(0);
    expect(t.equipamentos).toBeGreaterThan(0);
  });

  it("os acumulados nao se inventam: precisam do calculo de cada mes anterior e ficam sem valor", () => {
    const ficha = fichaDe("p-tiago", MES);
    expect(ficha.acumuladoAno).toBeNull();
    expect(ficha.acumuladoAdmissao).toBeNull();
  });

  it("as horas feitas do mes sao as passadas (as da assiduidade), e o custo por hora feita acompanha-as", () => {
    const ficha = fichaDe("p-tiago", MES, 150.5);
    expect(ficha.atual.horasFeitas).toBe(150.5);
    expect(cent(ficha.atual.porHoraFeita)).toBe(cent((ficha.atual.total ?? 0) / 150.5));
    expect(fichaDe("p-tiago", MES, 0).atual.porHoraFeita).toBeNull();
  });

  it("as horas previstas acompanham as horas semanais dadas (derivadas das horas planeadas do mes)", () => {
    const meio = custoDaPessoa(pessoa("p-tiago", 1000, { horasSemanais: 20 }), MES, 0);
    const inteiro = custoDaPessoa(pessoa("p-tiago", 1000, { horasSemanais: 40 }), MES, 0);
    expect(meio.atual.horasPrevistas * 2).toBeCloseTo(inteiro.atual.horasPrevistas, 1);
    expect(custoDaPessoa(pessoa("p-tiago", 1000, { horasSemanais: 0 }), MES, 0).atual.porHoraPrevista).toBeNull();
  });
});

describe("os dados de exemplo do custo", () => {
  const todos = () => lerCusto().equipamentos;

  it("quase todas as pessoas têm equipamentos, e há viatura, ferramentas, fardamento, um totalmente repartido e um devolvido", () => {
    expect(new Set(todos().map((e) => e.pessoaId)).size).toBeGreaterThanOrEqual(11);
    for (const tipo of ["telemovel", "portatil", "viatura", "fardamento", "ferramentas"]) {
      expect(todos().some((e) => e.tipo === tipo)).toBe(true);
    }
    expect(todos().some((e) => e.conta.modo === "repartido" && situacaoDoEquipamento(e, MES).completo)).toBe(true);
    expect(todos().some((e) => e.estado === "devolvido" && e.devolucao !== null)).toBe(true);
    expect(todos().find((e) => e.tipo === "viatura")?.pessoaId).toBe("p-hugo");
  });

  it("ninguém recebe um equipamento antes de ser admitido", () => {
    const fichas = lerEstado().fichas;
    for (const e of todos()) expect(e.entrega >= (fichas[e.pessoaId].pessoa.data_admissao ?? "")).toBe(true);
  });

  it("há valores avulsos (km e ajudas de custo) em Setembro", () => {
    const set = lerCusto().avulsos.filter((a) => a.data.startsWith(MES));
    expect(set.some((a) => a.tipo === "km")).toBe(true);
    expect(set.some((a) => a.tipo === "ajuda")).toBe(true);
  });

  it("os equipamentos de exemplo usam os três modos, e os avulsos são pagos de uma vez na sua data", () => {
    const modos = new Set(todos().map((e) => e.conta.modo));
    expect([...modos].sort()).toEqual(["repartido", "todosMeses", "umaVez"]);
    expect(todos().some((e) => e.conta.modo === "repartido" && e.conta.meses === 36)).toBe(true);
    expect(todos().some((e) => e.conta.modo === "repartido" && e.conta.meses === 12)).toBe(true);
    expect(todos().find((e) => e.tipo === "viatura")?.conta.modo).toBe("todosMeses");
    expect(todos().find((e) => e.tipo === "telemovel" && e.conta.modo === "umaVez")?.entrega.startsWith(MES)).toBe(true);
    expect(todos().some((e) => e.tipo === "fardamento" && e.conta.modo === "umaVez")).toBe(true);
    expect(lerCusto().avulsos.every((a) => a.conta.modo === "umaVez")).toBe(true);
  });
});

describe("os totais batem mês a mês, qualquer que seja o «como conta»", () => {
  const MESES = ["2026-08", "2026-09", "2026-10", "2026-11", "2027-03", "2028-09"];

  it("o total do módulo é a soma das abas Custo das fichas, em cada mês", () => {
    for (const mes of MESES) {
      const linhas = linhasDaOrganizacao(mes, PESSOAS);
      const soma = linhas.reduce((s, l) => s + cent(fichaDe(l.pessoaId, mes).atual.total), 0);
      const t = totaisDaOrganizacao(linhas);
      expect(cent(t.total)).toBe(soma);
      expect(cent(t.retribuicao) + cent(t.encargos) + cent(t.seguro) + cent(t.avulsos) + cent(t.equipamentos)).toBe(cent(t.total));
    }
  });

  it("um pago de uma vez só aparece no mês da entrega, no módulo e na ficha", () => {
    const telemovel = lerCusto().equipamentos.find((e) => e.pessoaId === "p-ines" && e.conta.modo === "umaVez");
    expect(telemovel).toBeDefined();
    const valor = telemovel?.valor ?? 0;
    const mes = (telemovel?.entrega ?? "").slice(0, 7);
    const naquele = linhasDaOrganizacao(mes, PESSOAS).find((l) => l.pessoaId === "p-ines");
    expect(cent(naquele?.equipamentosMes ?? null)).toBeGreaterThanOrEqual(cent(valor));
    expect(cent(fichaDe("p-ines", mes).atual.outrosCustos)).toBe(cent(naquele?.equipamentosMes ?? null));
    const conta = (m: string) => valorDoEquipamentoNoMes(telemovel as EquipamentoPessoa, m);
    expect([conta("2026-08"), conta(mes), conta("2026-10")]).toEqual([0, valor, 0]);
  });

  it("um avulso de Setembro não conta em Outubro, na ficha nem no módulo", () => {
    const set = linhasDaOrganizacao(MES, PESSOAS).find((l) => l.pessoaId === "p-tiago");
    const out = linhasDaOrganizacao("2026-10", PESSOAS).find((l) => l.pessoaId === "p-tiago");
    expect(set?.avulsosMes).toBeGreaterThan(0);
    expect(out?.avulsosMes).toBe(0);
    expect(fichaDe("p-tiago", "2026-10").atual.kmEAjudas).toBe(0);
  });
});

describe("atribuir e devolver equipamento mexem no custo da pessoa e no módulo", () => {
  const novo = { pessoaId: "p-tiago", tipo: "portatil" as const, descricao: "Portátil de teste", valor: 1800, entrega: "2026-09-01", autor: "Sofia" };

  it("atribuir um equipamento de 1800 acrescenta 50 (1800 / 36) ao custo do mês, na ficha e no módulo", () => {
    const antes = fichaDe("p-tiago", MES);
    const totalAntes = totaisDaOrganizacao(linhasDaOrganizacao(MES, PESSOAS));
    expect(atribuirEquipamento(novo).erro).toBeNull();
    const depois = fichaDe("p-tiago", MES);
    expect(depois.equipamentos).toHaveLength(antes.equipamentos.length + 1);
    expect(cent(depois.atual.outrosCustos) - cent(antes.atual.outrosCustos)).toBe(5000);
    expect(cent(depois.atual.total) - cent(antes.atual.total)).toBe(5000);
    const totalDepois = totaisDaOrganizacao(linhasDaOrganizacao(MES, PESSOAS));
    expect(cent(totalDepois.equipamentos) - cent(totalAntes.equipamentos)).toBe(5000);
    expect(cent(totalDepois.total) - cent(totalAntes.total)).toBe(5000);
    expect(totalDepois.nEquipamentos).toBe(totalAntes.nEquipamentos + 1);
  });

  it("pago de uma vez conta o valor todo só no mês da entrega, na ficha e no módulo", () => {
    expect(atribuirEquipamento({ ...novo, conta: contaUmaVez() }).erro).toBeNull();
    const set = fichaDe("p-tiago", MES);
    const out = fichaDe("p-tiago", "2026-10");
    expect(cent(set.atual.outrosCustos) - cent(out.atual.outrosCustos)).toBeGreaterThanOrEqual(180000);
    const doMes = linhasDaOrganizacao(MES, PESSOAS).find((l) => l.pessoaId === "p-tiago");
    expect(doMes?.equipamentosMes).toBe(set.atual.outrosCustos);
  });

  it("recusa sem pessoa, sem descrição, com valor 0 e sem data, e não guarda nada", () => {
    const antes = todosOsEquipamentos();
    expect(atribuirEquipamento({ ...novo, pessoaId: "" }).erro).toBe("semPessoa");
    expect(atribuirEquipamento({ ...novo, descricao: " " }).erro).toBe("semDescricao");
    expect(atribuirEquipamento({ ...novo, valor: 0 }).erro).toBe("valorZero");
    expect(atribuirEquipamento({ ...novo, entrega: "" }).erro).toBe("semData");
    expect(todosOsEquipamentos()).toBe(antes);
  });

  it("devolver pára a amortização depois do mês da devolução e fica registado com data e estado", () => {
    const { id } = atribuirEquipamento({ ...novo, entrega: "2026-08-01" });
    expect(devolverEquipamento(id ?? "", "2026-09-10", "").erro).toBe("semEstado");
    expect(devolverEquipamento(id ?? "", "2026-07-01", "bom").erro).toBe("antesDaEntrega");
    expect(devolverEquipamento(id ?? "", "2026-09-10", "desgaste").erro).toBeNull();
    expect(lerCusto().equipamentos.find((e) => e.id === id)).toMatchObject({ estado: "devolvido", devolucao: "2026-09-10", estadoDevolucao: "desgaste" });
    const set = fichaDe("p-tiago", "2026-09");
    const out = fichaDe("p-tiago", "2026-10");
    expect(cent(set.atual.outrosCustos) - cent(out.atual.outrosCustos)).toBe(5000);
    expect(devolverEquipamento(id ?? "", "2026-09-11", "bom").erro).not.toBeNull();
  });

  it("o mês mostrado só aceita «AAAA-MM» válido", () => {
    definirMesCusto("2026-11");
    expect(lerCusto().mes).toBe("2026-11");
    definirMesCusto("2026-13");
    definirMesCusto("");
    definirMesCusto("novembro");
    expect(lerCusto().mes).toBe("2026-11");
    reporCusto();
    expect(lerCusto().mes).toBe("2026-09");
  });
});

function todosOsEquipamentos() {
  return lerCusto().equipamentos;
}

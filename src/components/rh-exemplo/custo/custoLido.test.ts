// O custo sem React: a RETRIBUICAO de cada pessoa vem de fora (o total bruto estimado do processamento salarial real), os
// avulsos de exemplo vem do store em memoria e os equipamentos, as definicoes e as excecoes de taxa entram por parametro
// (`DadosCusto`, que na aplicacao vem da base). O modulo «Custos» e as abas Custo das fichas tem de bater, ao centimo.
// A data e fixa (14/10/2026) para os dados de exemplo serem os mesmos.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { definirMesCusto, lerCusto, reporCusto } from "@/components/rh-exemplo/dados/lojaCusto";
import { contaRepartida, contaTodosMeses, contaUmaVez } from "@/components/rh-exemplo/lib/comoConta";
import { totaisDaOrganizacao, type PessoaParaCusto } from "@/components/rh-exemplo/lib/custoOrganizacao";
import { valorDoEquipamentoNoMes, validarDevolucao, validarEquipamento, type EquipamentoPessoa } from "@/components/rh-exemplo/lib/equipamentos";
import { custoDaPessoa, linhasDaOrganizacao, type DadosCusto } from "./custoLido";

const MES = "2026-09";
const cent = (v: number | null): number => Math.round((v ?? 0) * 100);

const pessoa = (pessoaId: string, retribuicaoMes: number | null = 1000, extra: Partial<PessoaParaCusto> = {}): PessoaParaCusto => ({
  pessoaId, nome: pessoaId, cargo: null, centroId: null, centro: null, filialId: null, filial: null, tipoContrato: null,
  retribuicaoMes, horasSemanais: 40, ...extra,
});

/** As pessoas dos testes (os avulsos de exemplo e os equipamentos de teste estao ligados a estes ids). */
const PESSOAS = [pessoa("p-hugo", 1400), pessoa("p-ines", 1100), pessoa("p-tiago", 950.55), pessoa("p-marta", 2000)];

const equipamento = (extra: Partial<EquipamentoPessoa> & Pick<EquipamentoPessoa, "id" | "pessoaId">): EquipamentoPessoa => ({
  tipo: "portatil", descricao: "Equipamento de teste", valor: 900, entrega: "2026-01-10", conta: contaRepartida(),
  estado: "atribuido", devolucao: null, estadoDevolucao: null, autor: "Sofia", ...extra,
});

/** Os equipamentos de teste: um por pessoa, em modos diferentes (todos os meses, de uma vez, repartido 12 e 36). */
const EQUIPAMENTOS: EquipamentoPessoa[] = [
  equipamento({ id: "eq-hugo", pessoaId: "p-hugo", tipo: "viatura", valor: 350, conta: contaTodosMeses("2026-01") }),
  equipamento({ id: "eq-ines", pessoaId: "p-ines", tipo: "telemovel", valor: 600, entrega: "2026-09-03", conta: contaUmaVez() }),
  equipamento({ id: "eq-tiago-f", pessoaId: "p-tiago", tipo: "ferramentas", valor: 600, entrega: "2026-02-01", conta: contaRepartida(12) }),
  equipamento({ id: "eq-tiago-u", pessoaId: "p-tiago", tipo: "fardamento", valor: 80, entrega: "2026-09-02", conta: contaUmaVez() }),
  equipamento({ id: "eq-marta", pessoaId: "p-marta", valor: 900, entrega: "2025-05-01", conta: contaRepartida(36) }),
];

const dadosDe = (equipamentos: readonly EquipamentoPessoa[] = EQUIPAMENTOS, excecoes: Record<string, number | null> = {}): DadosCusto => ({
  equipamentos,
  definicoes: { taxaEmpresa: 23.75, seguro: 5, valorPorKm: 0.4, ajudaPorDia: 25 },
  excecoes,
});

const DADOS = dadosDe();
const fichaDe = (id: string, mes: string, horasFeitas = 0, dados: DadosCusto = DADOS) =>
  custoDaPessoa(PESSOAS.find((p) => p.pessoaId === id) as PessoaParaCusto, mes, horasFeitas, dados);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-14T12:00:00"));
  reporCusto();
});

afterEach(() => vi.useRealTimers());

describe("a retribuicao vem de fora e o custo bate entre o modulo e a ficha", () => {
  it("a retribuicao de cada linha e exactamente a que se passou, sem conta repetida", () => {
    const linhas = linhasDaOrganizacao(MES, PESSOAS, DADOS);
    expect(linhas.map((l) => l.pessoaId)).toEqual(PESSOAS.map((p) => p.pessoaId));
    for (const p of PESSOAS) expect(linhas.find((l) => l.pessoaId === p.pessoaId)?.retribuicao).toBe(p.retribuicaoMes);
    expect(cent(totaisDaOrganizacao(linhas).retribuicao)).toBe(cent(PESSOAS.reduce((s, p) => s + (p.retribuicaoMes ?? 0), 0)));
  });

  it("uma pessoa sem retribuicao fica sem custo (nao zero) e conta como «sem valor»", () => {
    const linhas = linhasDaOrganizacao(MES, [pessoa("p-tiago", null), pessoa("p-ines", 1100)], DADOS);
    expect(linhas[0].retribuicao).toBeNull();
    expect(linhas[0].total).toBeNull();
    expect(linhas[1].total).not.toBeNull();
    expect(totaisDaOrganizacao(linhas).semValor).toBe(1);
    const ficha = custoDaPessoa(pessoa("p-tiago", null), MES, 0, DADOS);
    expect(ficha.retribuicaoMes).toBeNull();
    expect(ficha.atual.total).toBeNull();
    expect(ficha.composicao).toEqual([]);
  });

  it("sem pessoas nao ha linhas nem totais inventados", () => {
    expect(linhasDaOrganizacao(MES, [], DADOS)).toEqual([]);
    expect(totaisDaOrganizacao([]).total).toBe(0);
  });

  it("sem equipamentos (a base ainda sem dados) o custo fica sem outros custos, sem rebentar", () => {
    const vazio = dadosDe([]);
    const t = totaisDaOrganizacao(linhasDaOrganizacao(MES, PESSOAS, vazio));
    expect(t.equipamentos).toBe(0);
    expect(t.nEquipamentos).toBe(0);
    expect(fichaDe("p-tiago", MES, 0, vazio).equipamentos).toEqual([]);
  });

  it("o custo total do modulo e a soma das abas Custo das fichas, pessoa a pessoa e no total", () => {
    const linhas = linhasDaOrganizacao(MES, PESSOAS, DADOS);
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
    const t = totaisDaOrganizacao(linhasDaOrganizacao(MES, PESSOAS, DADOS));
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
    const meio = custoDaPessoa(pessoa("p-tiago", 1000, { horasSemanais: 20 }), MES, 0, DADOS);
    const inteiro = custoDaPessoa(pessoa("p-tiago", 1000, { horasSemanais: 40 }), MES, 0, DADOS);
    expect(meio.atual.horasPrevistas * 2).toBeCloseTo(inteiro.atual.horasPrevistas, 1);
    expect(custoDaPessoa(pessoa("p-tiago", 1000, { horasSemanais: 0 }), MES, 0, DADOS).atual.porHoraPrevista).toBeNull();
  });
});

describe("os equipamentos, as definicoes e as excecoes vem dos dados passados", () => {
  it("a ficha so traz os equipamentos da propria pessoa", () => {
    expect(fichaDe("p-tiago", MES).equipamentos.map((e) => e.id)).toEqual(["eq-tiago-f", "eq-tiago-u"]);
    expect(fichaDe("p-ines", MES).equipamentos.map((e) => e.id)).toEqual(["eq-ines"]);
  });

  it("os equipamentos de teste usam os tres modos de «como conta»", () => {
    expect([...new Set(EQUIPAMENTOS.map((e) => e.conta.modo))].sort()).toEqual(["repartido", "todosMeses", "umaVez"]);
  });

  it("uma excecao de taxa da pessoa muda os encargos dela e fica na ficha; sem excecao, vale a taxa da empresa", () => {
    const sem = fichaDe("p-marta", MES);
    const com = fichaDe("p-marta", MES, 0, dadosDe(EQUIPAMENTOS, { "p-marta": 10 }));
    expect(sem.taxaExcecao).toBeNull();
    expect(com.taxaExcecao).toBe(10);
    expect(com.atual.encargosTaxa).toBeLessThan(sem.atual.encargosTaxa);
    expect(cent(com.atual.encargosTaxa)).toBe(cent(2000 * 0.1));
  });

  it("as definicoes passadas mandam: o seguro de 0 tira o seguro do custo", () => {
    const semSeguro: DadosCusto = { ...DADOS, definicoes: { ...DADOS.definicoes, seguro: 0 } };
    expect(fichaDe("p-marta", MES, 0, semSeguro).atual.seguro).toBe(0);
    expect(cent(fichaDe("p-marta", MES).atual.seguro)).toBe(cent(2000 * 0.05));
  });

  it("os avulsos de exemplo do store: km e ajudas de custo em Setembro, pagos de uma vez na sua data", () => {
    const set = lerCusto().avulsos.filter((a) => a.data.startsWith(MES));
    expect(set.some((a) => a.tipo === "km")).toBe(true);
    expect(set.some((a) => a.tipo === "ajuda")).toBe(true);
    expect(lerCusto().avulsos.every((a) => a.conta.modo === "umaVez")).toBe(true);
  });

  it("os avulsos passados (da base) substituem os do store", () => {
    const sem = custoDaPessoa(PESSOAS[2], MES, 0, DADOS, []);
    expect(sem.avulsos).toEqual([]);
    expect(sem.atual.kmEAjudas).toBe(0);
  });
});

describe("os totais batem mês a mês, qualquer que seja o «como conta»", () => {
  const MESES = ["2026-08", "2026-09", "2026-10", "2026-11", "2027-03", "2028-09"];

  it("o total do módulo é a soma das abas Custo das fichas, em cada mês", () => {
    for (const mes of MESES) {
      const linhas = linhasDaOrganizacao(mes, PESSOAS, DADOS);
      const soma = linhas.reduce((s, l) => s + cent(fichaDe(l.pessoaId, mes).atual.total), 0);
      const t = totaisDaOrganizacao(linhas);
      expect(cent(t.total)).toBe(soma);
      expect(cent(t.retribuicao) + cent(t.encargos) + cent(t.seguro) + cent(t.avulsos) + cent(t.equipamentos)).toBe(cent(t.total));
    }
  });

  it("um pago de uma vez só aparece no mês da entrega, no módulo e na ficha", () => {
    const telemovel = EQUIPAMENTOS.find((e) => e.pessoaId === "p-ines" && e.conta.modo === "umaVez") as EquipamentoPessoa;
    const valor = telemovel.valor;
    const mes = telemovel.entrega.slice(0, 7);
    const naquele = linhasDaOrganizacao(mes, PESSOAS, DADOS).find((l) => l.pessoaId === "p-ines");
    expect(cent(naquele?.equipamentosMes ?? null)).toBeGreaterThanOrEqual(cent(valor));
    expect(cent(fichaDe("p-ines", mes).atual.outrosCustos)).toBe(cent(naquele?.equipamentosMes ?? null));
    const conta = (m: string) => valorDoEquipamentoNoMes(telemovel, m);
    expect([conta("2026-08"), conta(mes), conta("2026-10")]).toEqual([0, valor, 0]);
  });

  it("um avulso de Setembro não conta em Outubro, na ficha nem no módulo", () => {
    const set = linhasDaOrganizacao(MES, PESSOAS, DADOS).find((l) => l.pessoaId === "p-tiago");
    const out = linhasDaOrganizacao("2026-10", PESSOAS, DADOS).find((l) => l.pessoaId === "p-tiago");
    expect(set?.avulsosMes).toBeGreaterThan(0);
    expect(out?.avulsosMes).toBe(0);
    expect(fichaDe("p-tiago", "2026-10").atual.kmEAjudas).toBe(0);
  });
});

describe("um equipamento atribuído ou devolvido mexe no custo da pessoa e no módulo", () => {
  const novo = equipamento({ id: "eq-novo", pessoaId: "p-tiago", descricao: "Portátil de teste", valor: 1800, entrega: "2026-09-01" });

  it("um equipamento de 1800 repartido por 36 acrescenta 50 (1800 / 36) ao custo do mês, na ficha e no módulo", () => {
    const comNovo = dadosDe([...EQUIPAMENTOS, novo]);
    const antes = fichaDe("p-tiago", MES);
    const totalAntes = totaisDaOrganizacao(linhasDaOrganizacao(MES, PESSOAS, DADOS));
    const depois = fichaDe("p-tiago", MES, 0, comNovo);
    expect(depois.equipamentos).toHaveLength(antes.equipamentos.length + 1);
    expect(cent(depois.atual.outrosCustos) - cent(antes.atual.outrosCustos)).toBe(5000);
    expect(cent(depois.atual.total) - cent(antes.atual.total)).toBe(5000);
    const totalDepois = totaisDaOrganizacao(linhasDaOrganizacao(MES, PESSOAS, comNovo));
    expect(cent(totalDepois.equipamentos) - cent(totalAntes.equipamentos)).toBe(5000);
    expect(cent(totalDepois.total) - cent(totalAntes.total)).toBe(5000);
    expect(totalDepois.nEquipamentos).toBe(totalAntes.nEquipamentos + 1);
  });

  it("pago de uma vez conta o valor todo só no mês da entrega, na ficha e no módulo", () => {
    const comNovo = dadosDe([...EQUIPAMENTOS, { ...novo, conta: contaUmaVez() }]);
    const set = fichaDe("p-tiago", MES, 0, comNovo);
    const out = fichaDe("p-tiago", "2026-10", 0, comNovo);
    expect(cent(set.atual.outrosCustos) - cent(out.atual.outrosCustos)).toBeGreaterThanOrEqual(180000);
    const doMes = linhasDaOrganizacao(MES, PESSOAS, comNovo).find((l) => l.pessoaId === "p-tiago");
    expect(doMes?.equipamentosMes).toBe(set.atual.outrosCustos);
  });

  it("a validacao recusa sem pessoa, sem descrição, com valor 0 e sem data", () => {
    const base = { pessoaId: "p-tiago", descricao: "Portátil de teste", valor: 1800, entrega: "2026-09-01" };
    expect(validarEquipamento(base)).toBeNull();
    expect(validarEquipamento({ ...base, pessoaId: "" })).toBe("semPessoa");
    expect(validarEquipamento({ ...base, descricao: " " })).toBe("semDescricao");
    expect(validarEquipamento({ ...base, valor: 0 })).toBe("valorZero");
    expect(validarEquipamento({ ...base, entrega: "" })).toBe("semData");
  });

  it("devolver pára a amortização depois do mês da devolução", () => {
    const entregue = { ...novo, entrega: "2026-08-01" };
    expect(validarDevolucao(entregue, "2026-09-10", "")).toBe("semEstado");
    expect(validarDevolucao(entregue, "2026-07-01", "bom")).toBe("antesDaEntrega");
    expect(validarDevolucao(entregue, "2026-09-10", "desgaste")).toBeNull();
    const devolvido: EquipamentoPessoa = { ...entregue, estado: "devolvido", devolucao: "2026-09-10", estadoDevolucao: "desgaste" };
    const dados = dadosDe([devolvido]);
    const set = fichaDe("p-tiago", "2026-09", 0, dados);
    const out = fichaDe("p-tiago", "2026-10", 0, dados);
    expect(cent(set.atual.outrosCustos) - cent(out.atual.outrosCustos)).toBe(5000);
    expect(cent(out.atual.outrosCustos)).toBe(0);
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

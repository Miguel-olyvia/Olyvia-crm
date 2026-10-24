import { beforeEach, describe, expect, it } from "vitest";
import { diaIso } from "@/components/rh-exemplo/dados/datas";
import {
  alterarContaAvulso,
  alterarContaEquipamento,
  anularAvulso,
  atribuirEquipamento,
  definirExcecaoTaxa,
  lerCusto,
  registarAvulso,
  reporCusto,
  type NovoAvulso,
} from "@/components/rh-exemplo/dados/lojaCusto";
import { contaRepartida, contaTodosMeses, contaUmaVez } from "@/components/rh-exemplo/lib/comoConta";
import { valorDoAvulsoNoMes, type AvulsoCusto } from "@/components/rh-exemplo/lib/custoMes";
import { valorDoEquipamentoNoMes, type EquipamentoPessoa } from "@/components/rh-exemplo/lib/equipamentos";

const base: NovoAvulso = {
  pessoaId: "p-tiago",
  tipo: "km",
  data: diaIso(0),
  descricao: "Visita",
  quantidade: 100,
  valorUnitario: 0.4,
  autor: "Sofia Rebelo",
  podeProcessar: true,
};

beforeEach(() => reporCusto());

const ultimoAvulso = (): AvulsoCusto => lerCusto().avulsos.at(-1) as AvulsoCusto;

describe("store do custo", () => {
  it("regista quilómetros com valor = km x valor por km, autor e data", () => {
    const antes = lerCusto().avulsos.length;
    expect(registarAvulso(base)).toEqual({ erro: null });
    const novo = lerCusto().avulsos.at(-1);
    expect(lerCusto().avulsos).toHaveLength(antes + 1);
    expect(novo).toMatchObject({ valor: 40, autor: "Sofia Rebelo", anulado: null, conta: contaUmaVez() });
  });

  it("recusa sem autorização, sem descrição e com valor 0, e não guarda nada", () => {
    const antes = lerCusto().avulsos.length;
    expect(registarAvulso({ ...base, podeProcessar: false }).erro).toBe("semAutorizacao");
    expect(registarAvulso({ ...base, descricao: " " }).erro).toBe("semDescricao");
    expect(registarAvulso({ ...base, quantidade: 0 }).erro).toBe("valorZero");
    expect(lerCusto().avulsos).toHaveLength(antes);
  });

  it("um avulso conta no mês da sua data, mesmo que esse mês já tenha passado: nunca salta para outro", () => {
    registarAvulso({ ...base, data: "2026-09-09" });
    const novo = ultimoAvulso();
    expect(novo.data).toBe("2026-09-09");
    expect(valorDoAvulsoNoMes(novo, "2026-09")).toBe(40);
    expect(valorDoAvulsoNoMes(novo, "2026-10")).toBe(0);
  });

  it("a data é obrigatória: sem data (ou mal escrita) recusa-se e não guarda nada", () => {
    const antes = lerCusto().avulsos.length;
    expect(registarAvulso({ ...base, data: "" }).erro).toBe("semData");
    expect(registarAvulso({ ...base, data: "09/09/2026" }).erro).toBe("semData");
    expect(lerCusto().avulsos).toHaveLength(antes);
  });

  it("sem escolha, o avulso é pago de uma vez; pode registar-se repartido ou todos os meses", () => {
    registarAvulso({ ...base, data: "2026-09-09" });
    expect(ultimoAvulso().conta).toEqual(contaUmaVez());
    registarAvulso({ ...base, data: "2026-09-09", conta: contaRepartida(2) });
    const repartido = ultimoAvulso();
    expect(["2026-09", "2026-10", "2026-11"].map((m) => valorDoAvulsoNoMes(repartido, m))).toEqual([20, 20, 0]);
    registarAvulso({ ...base, data: "2026-09-09", conta: contaTodosMeses("2026-09", "2026-10") });
    const mensal = ultimoAvulso();
    expect(["2026-10", "2026-11"].map((m) => valorDoAvulsoNoMes(mensal, m))).toEqual([40, 0]);
  });

  it("recusa uma conta inválida sem guardar nada", () => {
    const antes = lerCusto().avulsos.length;
    expect(registarAvulso({ ...base, conta: contaRepartida(0) }).erro).toBe("mesesInvalidos");
    expect(registarAvulso({ ...base, conta: contaTodosMeses("") }).erro).toBe("semInicio");
    expect(lerCusto().avulsos).toHaveLength(antes);
  });

  it("alterar como conta de um avulso já registado muda os meses em que conta", () => {
    registarAvulso({ ...base, data: "2026-09-09" });
    const id = ultimoAvulso().id;
    expect(alterarContaAvulso(id, contaRepartida(0)).erro).toBe("mesesInvalidos");
    expect(alterarContaAvulso(id, contaRepartida(4)).erro).toBeNull();
    const a = lerCusto().avulsos.find((x) => x.id === id) as AvulsoCusto;
    expect(a.conta).toEqual(contaRepartida(4));
    expect(valorDoAvulsoNoMes(a, "2026-12")).toBe(10);
    expect(valorDoAvulsoNoMes(a, "2027-01")).toBe(0);
  });

  it("uma ajuda de custo multiplica os dias pelo valor diário", () => {
    registarAvulso({ ...base, tipo: "ajuda", quantidade: 2, valorUnitario: 25, descricao: "Feira" });
    expect(lerCusto().avulsos.at(-1)).toMatchObject({ tipo: "ajuda", valor: 50 });
  });

  it("anular exige motivo, mantém o registo visível e marca quem anulou", () => {
    registarAvulso(base);
    const id = lerCusto().avulsos.at(-1)?.id ?? "";
    expect(anularAvulso(id, "", "Sofia", true).erro).toBe("semMotivo");
    expect(anularAvulso(id, "Engano", "Sofia", false).erro).toBe("semAutorizacao");
    expect(anularAvulso(id, "Registado por engano", "Sofia", true).erro).toBeNull();
    const anulado = lerCusto().avulsos.find((a) => a.id === id);
    expect(anulado?.anulado).toMatchObject({ motivo: "Registado por engano", por: "Sofia" });
  });

  it("a exceção de taxa é por pessoa e pode ser retirada", () => {
    definirExcecaoTaxa("p-rui", 11);
    expect(lerCusto().excecoes["p-rui"]).toBe(11);
    definirExcecaoTaxa("p-rui", null);
    expect(lerCusto().excecoes["p-rui"]).toBeNull();
  });
});

describe("store do custo: equipamentos com «como conta»", () => {
  const novo = { pessoaId: "p-tiago", tipo: "portatil" as const, descricao: "Portátil", valor: 900, entrega: "2026-11-15", autor: "Sofia" };
  const ler = (id: string | null) => lerCusto().equipamentos.find((e) => e.id === id) as EquipamentoPessoa;

  it("sem escolha, o equipamento fica repartido por 36 meses (o do fluxo 11)", () => {
    const { id } = atribuirEquipamento(novo);
    expect(ler(id).conta).toEqual(contaRepartida(36));
    expect(valorDoEquipamentoNoMes(ler(id), "2026-11")).toBe(25);
  });

  it("pago de uma vez só conta no mês da entrega; mudar para repartido por 12 conta nos 12 meses", () => {
    const { id } = atribuirEquipamento({ ...novo, conta: contaUmaVez() });
    expect([valorDoEquipamentoNoMes(ler(id), "2026-11"), valorDoEquipamentoNoMes(ler(id), "2026-12")]).toEqual([900, 0]);
    expect(alterarContaEquipamento(id ?? "", contaRepartida(12)).erro).toBeNull();
    const meses = ["2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06", "2027-07", "2027-08", "2027-09", "2027-10"];
    expect(meses.every((m) => valorDoEquipamentoNoMes(ler(id), m) === 75)).toBe(true);
    expect(valorDoEquipamentoNoMes(ler(id), "2027-11")).toBe(0);
  });

  it("recusa uma conta inválida ao atribuir e ao alterar, sem mexer em nada", () => {
    const antes = lerCusto().equipamentos;
    expect(atribuirEquipamento({ ...novo, conta: contaRepartida(121) }).erro).toBe("mesesInvalidos");
    expect(atribuirEquipamento({ ...novo, conta: contaTodosMeses("2026-09", "2026-08") }).erro).toBe("fimAntesInicio");
    expect(lerCusto().equipamentos).toBe(antes);
    const { id } = atribuirEquipamento(novo);
    expect(alterarContaEquipamento(id ?? "", contaTodosMeses("")).erro).toBe("semInicio");
    expect(ler(id).conta).toEqual(contaRepartida(36));
  });
});

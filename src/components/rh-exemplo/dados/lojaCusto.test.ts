import { beforeEach, describe, expect, it } from "vitest";
import { diaIso } from "@/components/rh-exemplo/dados/datas";
import {
  alterarContaAvulso,
  anularAvulso,
  lerCusto,
  registarAvulso,
  reporCusto,
  type NovoAvulso,
} from "@/components/rh-exemplo/dados/lojaCusto";
import { contaRepartida, contaTodosMeses, contaUmaVez } from "@/components/rh-exemplo/lib/comoConta";
import { valorDoAvulsoNoMes, type AvulsoCusto } from "@/components/rh-exemplo/lib/custoMes";

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
});

// Equipamentos, definições e exceções de taxa já não vivem neste store: vêm da base (hooks `useEquipamentosCusto`,
// `useCustoDefinicoes`, `useCustoExcecoes`). As contas de «como conta» dos equipamentos têm os seus testes em lib/.

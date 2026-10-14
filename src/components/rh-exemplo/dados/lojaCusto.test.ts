import { beforeEach, describe, expect, it } from "vitest";
import { diaIso } from "@/components/rh-exemplo/dados/datas";
import {
  anularAvulso,
  definirExcecaoTaxa,
  lerCusto,
  registarAvulso,
  reporCusto,
  type NovoAvulso,
} from "@/components/rh-exemplo/dados/lojaCusto";

const base: NovoAvulso = {
  pessoaId: "p-tiago",
  tipo: "km",
  data: diaIso(0),
  descricao: "Visita",
  quantidade: 100,
  valorUnitario: 0.4,
  devolucao: null,
  autor: "Sofia Rebelo",
  podeProcessar: true,
};

beforeEach(() => reporCusto());

describe("store do custo", () => {
  it("regista quilómetros com valor = km x valor por km, autor e data", () => {
    const antes = lerCusto().avulsos.length;
    expect(registarAvulso(base)).toEqual({ erro: null });
    const novo = lerCusto().avulsos.at(-1);
    expect(lerCusto().avulsos).toHaveLength(antes + 1);
    expect(novo).toMatchObject({ valor: 40, autor: "Sofia Rebelo", anulado: null, dataReal: null });
  });

  it("recusa sem autorização, sem descrição e com valor 0, e não guarda nada", () => {
    const antes = lerCusto().avulsos.length;
    expect(registarAvulso({ ...base, podeProcessar: false }).erro).toBe("semAutorizacao");
    expect(registarAvulso({ ...base, descricao: " " }).erro).toBe("semDescricao");
    expect(registarAvulso({ ...base, quantidade: 0 }).erro).toBe("valorZero");
    expect(lerCusto().avulsos).toHaveLength(antes);
  });

  it("uma data de um mês fechado conta no mês aberto, com a data real na nota", () => {
    registarAvulso({ ...base, data: diaIso(-60) });
    const novo = lerCusto().avulsos.at(-1);
    expect(novo?.dataReal).toBe(diaIso(-60));
    expect(novo?.mesContagem).toBe(diaIso(0).slice(0, 7));
  });

  it("o equipamento guarda o valor de compra e não multiplica", () => {
    registarAvulso({ ...base, tipo: "equipamento", quantidade: 1, valorUnitario: 900, descricao: "Portátil" });
    expect(lerCusto().avulsos.at(-1)?.valor).toBe(900);
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

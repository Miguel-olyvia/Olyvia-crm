/**
 * Validacao em runtime do que as RPCs do fluxo 2 devolvem. Um `data` nulo (ou
 * sem as chaves) com `error` nulo nao e um sucesso: o ecra mostraria "feito"
 * sobre uma resposta que ninguem leu.
 */
import { describe, expect, it } from "vitest";
import { lerResultadoDefinirSalario, lerResultadoMudarCargo } from "@/lib/hr/respostasRpc";

const MUDAR_OK = {
  cargo_anterior_id: "c1",
  cargo_id: "c2",
  desde: "2026-10-06",
  salario_antes: 1000,
  periodicidade_antes: "mensal",
  salario_depois: 1200,
  periodicidade_depois: "mensal",
  versoes_criadas: 2,
};

describe("lerResultadoMudarCargo", () => {
  it("aceita a resposta completa", () => {
    expect(lerResultadoMudarCargo(MUDAR_OK)).toEqual(MUDAR_OK);
  });

  it("aceita NULL no que a base pode devolver NULL (primeiro cargo, sem retribuicao)", () => {
    const resposta = {
      ...MUDAR_OK,
      cargo_anterior_id: null,
      salario_antes: null,
      periodicidade_antes: null,
      salario_depois: null,
      periodicidade_depois: null,
      versoes_criadas: 0,
    };
    expect(lerResultadoMudarCargo(resposta)).toEqual(resposta);
  });

  it.each([null, undefined, "texto", 3, [], {}])("rejeita %j", (invalida) => {
    expect(lerResultadoMudarCargo(invalida)).toBeNull();
  });

  it.each(["cargo_id", "desde", "versoes_criadas", "salario_antes", "salario_depois", "periodicidade_depois"])(
    "rejeita quando falta a chave %s",
    (chave) => {
      const { [chave]: _fora, ...sem } = MUDAR_OK as Record<string, unknown>;
      expect(lerResultadoMudarCargo(sem)).toBeNull();
    },
  );

  it("rejeita tipos errados (versoes_criadas como texto, cargo_id como numero)", () => {
    expect(lerResultadoMudarCargo({ ...MUDAR_OK, versoes_criadas: "2" })).toBeNull();
    expect(lerResultadoMudarCargo({ ...MUDAR_OK, cargo_id: 7 })).toBeNull();
    expect(lerResultadoMudarCargo({ ...MUDAR_OK, salario_antes: "1000" })).toBeNull();
  });
});

describe("lerResultadoDefinirSalario", () => {
  const OK = { periodo_id: "p1", pessoas_actualizadas: 3, pessoas_sem_retribuicao: 1 };

  it("aceita a resposta completa", () => {
    expect(lerResultadoDefinirSalario(OK)).toEqual(OK);
  });

  it.each([null, undefined, "x", [], {}, { pessoas_actualizadas: 3 }])("rejeita %j", (invalida) => {
    expect(lerResultadoDefinirSalario(invalida)).toBeNull();
  });

  it("rejeita contagens que nao sao numeros", () => {
    expect(lerResultadoDefinirSalario({ ...OK, pessoas_actualizadas: "3" })).toBeNull();
    expect(lerResultadoDefinirSalario({ ...OK, periodo_id: null })).toBeNull();
  });
});

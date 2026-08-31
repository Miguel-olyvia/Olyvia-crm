import { describe, expect, it } from "vitest";
import {
  TENTATIVAS_ATE_DESISTIR,
  chaveDaMedicao,
  chaveDaTarefa,
  comoContagem,
  desistiu,
  especieDaFalha,
  juntar,
  type PorEnviar,
} from "../fila";

const item = (chave: string, p: Partial<PorEnviar> = {}): PorEnviar => ({
  chave,
  tipo: "tarefa",
  ordemId: "o1",
  carga: {},
  criadaEm: 1000,
  tentativas: 0,
  ...p,
});

describe("que espécie de falha é", () => {
  it("o browser a dizer que não há rede chega — venha o erro que vier", () => {
    expect(especieDaFalha(new Error("qualquer coisa"), false)).toBe("sem_rede");
  });

  it("as mensagens que os browsers dão quando o pedido nem sai", () => {
    for (const m of [
      "Failed to fetch",
      "TypeError: Failed to fetch",
      "NetworkError when attempting to fetch resource.",
      "Load failed",
      "The Internet connection appears to be offline.",
      "net::ERR_INTERNET_DISCONNECTED",
      "signal timed out: timeout",
    ]) {
      expect(especieDaFalha(new Error(m), true), m).toBe("sem_rede");
    }
  });

  it("uma recusa do servidor NÃO é falta de rede", () => {
    // Guardar isto para tentar outra vez seria mentir ao técnico: a resposta
    // dava o mesmo não, e entretanto ele ficava a pensar que estava gravado.
    for (const m of [
      "Sem permissão para responder.",
      "A ordem não está em curso.",
      "new row violates row-level security policy",
      "duplicate key value violates unique constraint",
    ]) {
      expect(especieDaFalha(new Error(m), true), m).toBe("recusada");
    }
  });

  it("uma mensagem que ninguém conhece conta como recusa", () => {
    // É o lado seguro por onde falhar: o técnico vê o erro e volta a
    // responder, em vez de ficar com uma resposta presa numa fila calada.
    expect(especieDaFalha(new Error("erro estranho nº 12"), true)).toBe("recusada");
    expect(especieDaFalha(null, true)).toBe("recusada");
    expect(especieDaFalha(undefined, true)).toBe("recusada");
  });

  it("não se importa com maiúsculas", () => {
    expect(especieDaFalha(new Error("FAILED TO FETCH"), true)).toBe("sem_rede");
  });
});

describe("as chaves", () => {
  it("uma por pergunta", () => {
    expect(chaveDaTarefa("t1")).toBe("tarefa:t1");
    expect(chaveDaMedicao("t1", "m1")).toBe("medicao:t1:m1");
  });

  it("uma tarefa e uma medição da mesma tarefa não se confundem", () => {
    expect(chaveDaTarefa("t1")).not.toBe(chaveDaMedicao("t1", "m1"));
  });

  it("duas medições da mesma tarefa são coisas diferentes", () => {
    expect(chaveDaMedicao("t1", "m1")).not.toBe(chaveDaMedicao("t1", "m2"));
  });
});

describe("juntar à fila", () => {
  it("uma resposta nova vai para o fim", () => {
    const f = juntar([item("a")], item("b"));
    expect(f.map((x) => x.chave)).toEqual(["a", "b"]);
  });

  it("corrigir um valor substitui, não acumula", () => {
    // Sem isto, o servidor recebia o valor errado e logo a seguir o certo — e
    // o histórico ficava com uma correção que nunca existiu.
    const f = juntar(
      [item("a", { carga: { v: 1 } }), item("b")],
      item("a", { carga: { v: 2 } })
    );
    expect(f.length).toBe(2);
    expect(f[0].carga).toEqual({ v: 2 });
  });

  it("e fica no lugar onde estava", () => {
    // Corrigir não põe a pessoa no fim da bicha.
    const f = juntar([item("a"), item("b"), item("c")], item("a", { criadaEm: 9999 }));
    expect(f.map((x) => x.chave)).toEqual(["a", "b", "c"]);
    expect(f[0].criadaEm).toBe(1000);
  });

  it("não altera a fila que recebeu", () => {
    const original = [item("a")];
    juntar(original, item("b"));
    expect(original.length).toBe(1);
  });
});

describe("desistir", () => {
  it("aguenta várias tentativas", () => {
    expect(desistiu(item("a", { tentativas: 0 }))).toBe(false);
    expect(desistiu(item("a", { tentativas: TENTATIVAS_ATE_DESISTIR - 1 }))).toBe(false);
  });

  it("mas não bate à porta para sempre", () => {
    expect(desistiu(item("a", { tentativas: TENTATIVAS_ATE_DESISTIR }))).toBe(true);
  });
});

describe("o que se diz a quem tem trabalho à espera", () => {
  it("conta certo", () => {
    expect(comoContagem(1)).toBe("1 resposta por enviar");
    expect(comoContagem(4)).toBe("4 respostas por enviar");
  });

  it("com nada à espera não se diz nada", () => {
    expect(comoContagem(0)).toBe("");
    expect(comoContagem(-1)).toBe("");
  });
});

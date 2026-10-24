import { describe, expect, it } from "vitest";
import { ORDENS_SELECT, ordenarNegocios, proximaOrdem } from "./ordenacaoQuadro";
import { DADOS_EXEMPLO, HOJE_EXEMPLO } from "./negocioMetasExemplo";

const { negocios } = DADOS_EXEMPLO;
const ids = (ls: readonly { id: string }[]) => ls.map((n) => n.id);

describe("ordem por defeito: urgência", () => {
  it("atrasados, parados, urgentes, em dia e ganhos; no grupo, o prazo mais próximo primeiro", () => {
    expect(ids(ordenarNegocios(negocios, null, HOJE_EXEMPLO))).toEqual(
      ["n8", "n6", "n9", "n10", "n5", "n1", "n2", "n3", "n4", "n7"],
    );
  });
});

describe("por prazo", () => {
  it("atrasados primeiro e os sem prazo no fim", () => {
    const r = ordenarNegocios(negocios, { coluna: "prazo", dir: "asc" }, HOJE_EXEMPLO);
    expect(ids(r).slice(0, 5)).toEqual(["n8", "n6", "n9", "n5", "n10"]);
    expect(ids(r).slice(5)).toEqual(["n1", "n2", "n3", "n4", "n7"]);
  });
  it("invertida, os sem prazo continuam no fim", () => {
    const r = ordenarNegocios(negocios, { coluna: "prazo", dir: "desc" }, HOJE_EXEMPLO);
    expect(ids(r).slice(0, 5)).toEqual(["n10", "n5", "n9", "n6", "n8"]);
    expect(ids(r).slice(5)).toEqual(["n1", "n2", "n3", "n4", "n7"]);
  });
});

describe("por saúde", () => {
  it("do pior para o melhor, mantendo a ordem recebida nos empates", () => {
    const r = ordenarNegocios(negocios, { coluna: "saude", dir: "asc" }, HOJE_EXEMPLO);
    expect(ids(r)).toEqual(["n6", "n8", "n9", "n10", "n1", "n2", "n3", "n4", "n5", "n7"]);
  });
  it("invertida põe os ganhos primeiro e os atrasados no fim", () => {
    const r = ordenarNegocios(negocios, { coluna: "saude", dir: "desc" }, HOJE_EXEMPLO);
    expect(ids(r).slice(-2)).toEqual(["n6", "n8"]);
  });
});

describe("outras colunas", () => {
  it("pessoa: inverte ao segundo clique", () => {
    const o1 = proximaOrdem(null, "pessoa");
    expect(o1).toEqual({ coluna: "pessoa", dir: "asc" });
    expect(ids(ordenarNegocios(negocios, o1, HOJE_EXEMPLO))[0]).toBe("n9");
    const o2 = proximaOrdem(o1, "pessoa");
    expect(o2.dir).toBe("desc");
    expect(ids(ordenarNegocios(negocios, o2, HOJE_EXEMPLO))[0]).toBe("n10");
  });
  it("valor começa do maior e os sem valor ficam no fim", () => {
    const r = ordenarNegocios(negocios, proximaOrdem(null, "valor"), HOJE_EXEMPLO);
    expect(r[0].id).toBe("n10");
    expect(r[r.length - 1].id).toBe("n8");
    const asc = ordenarNegocios(negocios, { coluna: "valor", dir: "asc" }, HOJE_EXEMPLO);
    expect(asc[asc.length - 1].id).toBe("n8");
  });
  it("parado: o mais parado primeiro, os sem parado no fim", () => {
    const r = ordenarNegocios(negocios, proximaOrdem(null, "parado"), HOJE_EXEMPLO);
    expect(ids(r).slice(0, 3)).toEqual(["n8", "n6", "n9"]);
  });
  it("não altera a lista recebida", () => {
    const antes = ids(negocios);
    ordenarNegocios(negocios, { coluna: "valor", dir: "asc" }, HOJE_EXEMPLO);
    expect(ids(negocios)).toEqual(antes);
  });
});

describe("opções do select Ordenar", () => {
  it("a primeira é a urgência (ordem por defeito) e as colunas principais existem", () => {
    expect(ORDENS_SELECT[0]).toBe("urgencia");
    expect(ORDENS_SELECT).toEqual(expect.arrayContaining(["prazo", "saude", "valor", "parado"]));
  });
});

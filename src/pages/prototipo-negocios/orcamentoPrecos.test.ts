import { describe, expect, it } from "vitest";
import { acoes, alertas, seed, tot } from "./motor";
import { PREFIXO_LEV } from "./efeitosLevantamento";

describe("preços mudados à mão na lista do orçamento", () => {
  const preparar = () => {
    const S = seed();
    const A = acoes(S, () => {}, (fn) => fn());
    const d = S.deals.find((x) => x.id === 1031)!; // proposta enviada: reabre-se o estado para mexer
    d.orc!.enviada = null;
    A.campo(d.id, "diag_portas_proteger", "3"); // põe as linhas do levantamento no orçamento
    return { S, A, d };
  };
  it("serviço: muda o preço por unidade e o total", () => {
    const { S, A, d } = preparar();
    const i = d.orc!.linhas.findIndex((l) => l.t === "svc");
    const antes = tot(d, S).pf;
    A.precoLinha(d.id, i, 99);
    expect(d.orc!.linhas[i]).toMatchObject({ pu: 99 });
    expect(tot(d, S).pf).not.toBeCloseTo(antes, 2);
  });
  it("linha do levantamento: o preço à mão fica quando a linha se refaz por outro campo mudar", () => {
    const { A, d } = preparar();
    const i = d.orc!.linhas.findIndex((l) => l.t === "mat" && l.d.startsWith(PREFIXO_LEV + "Plástico"));
    const desc = (d.orc!.linhas[i] as { d: string }).d;
    A.precoLinha(d.id, i, 50);
    A.campo(d.id, "tem_elevador", "Sim"); // refaz as linhas do levantamento
    expect(d.orc!.linhas.find((l) => l.t === "mat" && l.d === desc)).toMatchObject({ preco: 50 });
    A.reporPreco(d.id, d.orc!.linhas.findIndex((l) => l.t === "mat" && l.d === desc));
    expect(d.orc!.linhas.find((l) => l.t === "mat" && l.d === desc)).toMatchObject({ preco: 21 });
  });
  it("abaixo do custo à mão bloqueia, com a sugestão do alvo", () => {
    const { S, A, d } = preparar();
    const i = d.orc!.linhas.findIndex((l) => l.t === "mat" && l.d.startsWith(PREFIXO_LEV + "Plástico"));
    A.precoLinha(d.id, i, 1);
    const a = alertas(d, S).find((x) => x.i === i)!;
    expect(a.k).toBe("x");
    A.sugerido(d.id, i, a.sug!);
    expect(alertas(d, S).some((x) => x.i === i)).toBe(false);
  });
  it("não se muda depois de enviada", () => {
    const S = seed();
    const A = acoes(S, () => {}, (fn) => fn());
    const d = S.deals.find((x) => x.id === 1031)!;
    const antes = JSON.stringify(d.orc);
    A.precoLinha(d.id, 0, 1);
    expect(JSON.stringify(d.orc)).toBe(antes);
  });
});

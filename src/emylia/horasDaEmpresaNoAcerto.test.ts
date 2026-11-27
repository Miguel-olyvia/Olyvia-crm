// 27/11 (teste do 1029 no testarh): ao abrir o Estúdio do plano, a regra das microtarefas (ajustarHorasPelasMicro) sobe as horas das
// tarefas e marca as horas a mais como da empresa (hNossa). Essas horas não mudam o valor para o cliente (impactoDoPlano já as tirava),
// mas mudancasDeValor contava-as e o plano ficava bloqueado em «O valor mudou: primeiro a retificação vai ao Financeiro».
import { describe, expect, it } from "vitest";
import { guardarBase } from "./ajustesPlano";
import { acertoDoValorPendente, acoes, horasDoPlanoParaOCliente, mudancasDeValor, seed, type Estado, type Negocio } from "./motor";

type Ac = ReturnType<typeof acoes>;
const prontoParaAprovar = () => {
  const S = seed();
  const d = S.deals.find((x) => x.id === 1031)!;
  const A = acoes(S, () => {}, (fn) => fn());
  A.aceitar(d.id);
  S.role = "comercial"; A.enviarContrato(d.id); A.assinar(d.id);
  S.role = "financeiro"; d.fin.fatura = { n: "FT TESTE/" + d.id, q: "hoje" }; A.validar(d.id);
  S.role = "operacoes"; A.supervisorMedidas(d.id, "hn"); A.retificarMedidas(d.id);
  guardarBase(d.obra.plano!); // a referência do orçamento (guarda-se na primeira mudança ao plano)
  return { S, d, A };
};
const subirPelaRegra = (d: Negocio, horas: number) => {
  const p = d.obra.plano!, t = p.tasks[0];
  t.h = (p.base![0].h) + horas;
  t.hNossa = horas;
};

describe("as horas da empresa não pedem o acerto do valor (27/11)", () => {
  it("o plano com horas da regra das microtarefas não muda o valor nem bloqueia a aprovação", () => {
    const { d } = prontoParaAprovar();
    subirPelaRegra(d, 6);
    expect(horasDoPlanoParaOCliente(d.obra.plano!)).toBe(0);
    expect(mudancasDeValor(d)).toEqual([]);
    expect(acertoDoValorPendente(d)).toBe(false);
  });
  it("as horas a mais que não são da empresa continuam a mudar o valor", () => {
    const { d } = prontoParaAprovar();
    const p = d.obra.plano!;
    p.tasks[0].h = p.base![0].h + 4;
    expect(horasDoPlanoParaOCliente(p)).toBe(4);
    expect(mudancasDeValor(d).join(" ")).toMatch(/\+4 h/);
    expect(acertoDoValorPendente(d)).toBe(true);
  });
  it("só a parte da empresa sai: 6 h a mais com 2 h da empresa dão 4 h ao cliente", () => {
    const { d } = prontoParaAprovar();
    const p = d.obra.plano!;
    p.tasks[0].h = p.base![0].h + 6;
    p.tasks[0].hNossa = 2;
    expect(horasDoPlanoParaOCliente(p)).toBe(4);
  });
  it("aprova-se o plano com as horas da empresa", () => {
    const { S, d, A } = prontoParaAprovar() as { S: Estado; d: Negocio; A: Ac };
    subirPelaRegra(d, 6);
    S.role = "operacoes"; A.resolverConflitos(d.id); A.aprovarPlano(d.id);
    expect(d.obra.plano?.estado).toBe("aprovado");
  });
});

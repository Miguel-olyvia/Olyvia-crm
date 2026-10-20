// vistaDaLista: a Lista real só afirma o que a base devolveu; o resto fica por saber (undefined), pronto para o Lote C.
import { describe, expect, it } from "vitest";
import { pessoaLista } from "./fabricaLista";
import { vistaDaLista } from "./vistaDaLista";

describe("vistaDaLista: o que a base dá", () => {
  it("passa identidade, papel, etapa, fase, encerramento, valor e passo", () => {
    const v = vistaDaLista(pessoaLista("p1", {
      nome: "Ana", papel: "lead", etapa: "qualificada", faseEtapa: "proposta", encerrada: "obraInviavel", valorEmJogo: 900, passo: null,
    }));
    expect(v).toMatchObject({
      id: "p1", nome: "Ana", papel: "lead", etapa: "qualificada", faseEtapa: "proposta", encerrada: "obraInviavel",
      valorEmJogo: 900, passo: null, exemplo: false, empresa: false, perdidaMotivo: null,
    });
  });
  it("nunca é de exemplo", () => {
    expect(vistaDaLista(pessoaLista("p1")).exemplo).toBe(false);
  });
  it("o passo é o que o adaptador calculou", () => {
    expect(vistaDaLista(pessoaLista("p1", { passo: "marcarVisita" })).passo).toBe("marcarVisita");
  });
  it("uma cliente não tem etapa (o papel é o selo); uma lead leva a etapa", () => {
    expect(vistaDaLista(pessoaLista("p1", { papel: "cliente", etapa: "cliente" })).etapa).toBeNull();
    expect(vistaDaLista(pessoaLista("p2", { papel: "lead", etapa: "emContacto" })).etapa).toBe("emContacto");
  });
  it("uma cliente com etapa diferente de «cliente» (não devia haver) também fica sem etapa", () => {
    expect(vistaDaLista(pessoaLista("p1", { papel: "cliente", etapa: "qualificada" })).etapa).toBeNull();
  });
  it("dias sem contacto passam tal como estão (null = nunca)", () => {
    expect(vistaDaLista(pessoaLista("p1", { diasSemContacto: 4 })).diasSemContacto).toBe(4);
    expect(vistaDaLista(pessoaLista("p2", { diasSemContacto: null })).diasSemContacto).toBeNull();
  });
});

describe("vistaDaLista: o resultado do último contacto", () => {
  it("nunca houve contacto (ultimoContactoEm nulo): «Sem contacto»", () => {
    expect(vistaDaLista(pessoaLista("p1", { ultimoContactoEm: null, diasSemContacto: null })).resultado).toBe("semContacto");
  });
  it("houve contacto mas a lista não traz o resultado: desconhecido, nunca «Sem contacto»", () => {
    expect(vistaDaLista(pessoaLista("p1", { ultimoContactoEm: "2026-10-01T10:00:00Z", diasSemContacto: 3 })).resultado).toBeUndefined();
  });
});

describe("vistaDaLista: o comercial", () => {
  it("sem responsável na base: «sem comercial» (null)", () => {
    expect(vistaDaLista(pessoaLista("p1", { responsavelId: null })).comercial).toBeNull();
  });
  it("com responsável e o nome resolvido: o nome", () => {
    expect(vistaDaLista(pessoaLista("p1", { responsavelId: "u1" }), { comercial: "Rui Dias" }).comercial).toBe("Rui Dias");
  });
  it("com responsável e o nome por resolver (a carregar, em erro ou fora do alcance): por saber (undefined), nunca «sem comercial»", () => {
    expect(vistaDaLista(pessoaLista("p1", { responsavelId: "u1" })).comercial).toBeUndefined();
    expect(vistaDaLista(pessoaLista("p1", { responsavelId: "u1" }), {}).comercial).toBeUndefined();
  });
});

describe("vistaDaLista: telefone e email", () => {
  it("sem leitura: por saber (undefined)", () => {
    const v = vistaDaLista(pessoaLista("p1"));
    expect(v.telefone).toBeUndefined();
    expect(v.email).toBeUndefined();
  });
  it("com a leitura: os valores, e null quando se sabe que não há", () => {
    const v = vistaDaLista(pessoaLista("p1"), { contacto: { telefone: "912345678", email: null } });
    expect(v.telefone).toBe("912345678");
    expect(v.email).toBeNull();
  });
});

describe("vistaDaLista: selos da sublinha", () => {
  it("MQL/SQL, voltou e atrasada passam", () => {
    const v = vistaDaLista(pessoaLista("p1", { qualificacao: "SQL", voltou: true, atrasada: true }));
    expect([v.qualificacao, v.voltou, v.atrasada]).toEqual(["SQL", true, true]);
  });
  it("sem qualificação: null (não se escreve nada)", () => {
    expect(vistaDaLista(pessoaLista("p1", { qualificacao: null })).qualificacao).toBeNull();
  });
  it("sem dado de voltou ou de atrasada (null): a vista não afirma nada", () => {
    const v = vistaDaLista(pessoaLista("p1", { voltou: null, atrasada: null }));
    expect(v.voltou).toBeNull();
    expect(v.atrasada).toBeNull();
  });
});

describe("vistaDaLista: o resultado do último contacto", () => {
  it("o resultado que a base deu", () => {
    const v = vistaDaLista(pessoaLista("p1", { ultimoContactoEm: "2026-10-01T10:00:00Z", diasSemContacto: 3, ultimoResultado: "naoAtendeu" }));
    expect(v.resultado).toBe("naoAtendeu");
  });
  it("um resultado de outro tipo (Leads) vai como «outro»", () => {
    const v = vistaDaLista(pessoaLista("p1", { ultimoContactoEm: "2026-10-01T10:00:00Z", ultimoResultado: "outro" }));
    expect(v.resultado).toBe("outro");
  });
  it("sem contacto em NENHUMA das fontes, mesmo que haja um resultado antigo: «Sem contacto»", () => {
    expect(vistaDaLista(pessoaLista("p1", { ultimoContactoEm: null, ultimoResultado: "naoAtendeu" })).resultado).toBe("semContacto");
  });
});

describe("vistaDaLista: origem, campanha, formulário e criado em", () => {
  const LEAD = "22222222-2222-4222-8222-222222222222";
  it("passa criado em e origem", () => {
    const v = vistaDaLista(pessoaLista("p1", { leadId: LEAD, criadoEm: "2026-06-01T10:00:00Z", origem: "web" }));
    expect(v.criadoEm).toBe("2026-06-01T10:00:00Z");
    expect(v.origem).toBe("web");
  });
  it("lead sem campanha: «Manual» (formulário null) e campanha null", () => {
    const v = vistaDaLista(pessoaLista("p1", { leadId: LEAD, campanhaId: null }));
    expect(v.formulario).toBeNull();
    expect(v.campanha).toBeNull();
  });
  it("com campanha e formulário: os nomes", () => {
    const v = vistaDaLista(pessoaLista("p1", { leadId: LEAD, campanhaId: "c1", campanha: "Cozinhas", formulario: "Pedido" }));
    expect([v.campanha, v.formulario]).toEqual(["Cozinhas", "Pedido"]);
  });
  it("campanha escondida pela RLS (id sem nome): por saber, nunca «Manual»", () => {
    const v = vistaDaLista(pessoaLista("p1", { leadId: LEAD, campanhaId: "c1", campanha: null, formulario: null }));
    expect(v.formulario).toBeUndefined();
    expect(v.campanha).toBeUndefined();
  });
  it("pessoa sem lead (só cliente): nada se sabe da origem, nunca «Manual»", () => {
    const v = vistaDaLista(pessoaLista("p1", { papel: "cliente", leadId: null, clienteId: "c" }));
    expect([v.formulario, v.campanha, v.origem]).toEqual([undefined, undefined, undefined]);
  });
});

describe("vistaDaLista: a localidade saiu da Lista", () => {
  it("a vista não traz localidade", () => {
    expect(vistaDaLista(pessoaLista("p1")).localidade).toBeUndefined();
  });
});

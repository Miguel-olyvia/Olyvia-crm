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

describe("vistaDaLista: o que ainda não existe na função fica por saber", () => {
  it("criado em, MQL/SQL, voltou, atrasada, origem, campanha, localidade e formulário são undefined", () => {
    const v = vistaDaLista(pessoaLista("p1"));
    for (const campo of ["criadoEm", "qualificacao", "voltou", "atrasada", "origem", "campanha", "localidade", "formulario"] as const) {
      expect(v[campo], campo).toBeUndefined();
    }
  });
});

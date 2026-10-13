import { describe, expect, it } from "vitest";
import {
  adiar, juntarAtividade, juntarNota, ligacoes, perder, registarChamada, selosCabecalho, somarDias, type EstadoAcoes,
} from "./acoesPessoa";
import { ATIVIDADE_EXEMPLO, PESSOAS_EXEMPLO } from "./pessoasExemplo";
import type { ItemAtividade, Pessoa } from "./pessoasTipos";

const pessoa = (id: string, extra: Partial<Pessoa> = {}): Pessoa => ({
  id, nome: id, contacto: { telefone: null, email: null }, comercial: "Ana", origem: "site", etapa: "emContacto",
  ultimoContactoDias: 9, ...extra,
});
const estado = (pessoas: Pessoa[] = [pessoa("a"), pessoa("c", { etapa: "cliente" })]): EstadoAcoes => ({
  pessoas, atividade: [], contactadas: [],
});
const item = (id: string, quando: string): ItemAtividade => ({
  id, pessoaId: "a", tipo: "nota", titulo: id, detalhe: "", quando, exemplo: true,
});
const chamada = { resultado: "atendeuInteressado", nota: "Quer visita", passo: "ligarAmanha", hoje: "2026-10-13" } as const;

describe("dados de exemplo da ficha", () => {
  it("preenche os campos novos nas 13 pessoas e gera 2 ou 3 itens de atividade por pessoa", () => {
    expect(PESSOAS_EXEMPLO).toHaveLength(13);
    expect(PESSOAS_EXEMPLO.filter((p) => p.empresa)).toHaveLength(3);
    expect(PESSOAS_EXEMPLO.filter((p) => p.qualificacao)).toHaveLength(4);
    expect(PESSOAS_EXEMPLO.filter((p) => p.etapa === "cliente").every((p) => p.nif)).toBe(true);
    expect(PESSOAS_EXEMPLO.every((p) => p.morada && p.distrito && p.desde && p.resultadoContacto)).toBe(true);
    PESSOAS_EXEMPLO.forEach((p) => {
      const n = ATIVIDADE_EXEMPLO.filter((i) => i.pessoaId === p.id).length;
      expect([2, 3]).toContain(n);
    });
    expect(ATIVIDADE_EXEMPLO.every((i) => i.exemplo)).toBe(true);
  });
});

describe("somarDias", () => {
  it("passa o fim do mês e do ano", () => {
    expect(somarDias("2026-10-30", 3)).toBe("2026-11-02");
    expect(somarDias("2026-12-30", 3)).toBe("2027-01-02");
    expect(somarDias("2026-10-13", 0)).toBe("2026-10-13");
  });
});

describe("registarChamada", () => {
  it("zera os dias, guarda o resultado e acrescenta a chamada à atividade", () => {
    const novo = registarChamada(estado(), "a", chamada);
    const p = novo.pessoas.find((x) => x.id === "a")!;
    expect(p.ultimoContactoDias).toBe(0);
    expect(p.resultadoContacto).toBe("atendeuInteressado");
    expect(novo.atividade).toHaveLength(1);
    expect(novo.atividade[0]).toMatchObject({ pessoaId: "a", tipo: "chamada", detalhe: "Quer visita", quando: "2026-10-13", exemplo: false });
  });

  it("só um resultado 'atendeu' marca a pessoa como respondida (tira de 'Voltou a contactar'), sem repetir", () => {
    const uma = registarChamada(estado(), "a", chamada);
    expect(uma.contactadas).toEqual(["a"]);
    expect(registarChamada(uma, "a", chamada).contactadas).toEqual(["a"]);
    expect(registarChamada(estado(), "a", { ...chamada, resultado: "atendeuMaisTarde" }).contactadas).toEqual(["a"]);
  });

  it.each(["naoAtendeu", "numeroErrado", "semInteresse"] as const)("o resultado %s não tira de 'Voltou a contactar'", (resultado) => {
    const novo = registarChamada(estado(), "a", { ...chamada, resultado });
    expect(novo.contactadas).toEqual([]);
    expect(novo.pessoas[0].ultimoContactoDias).toBe(0);
    expect(novo.atividade).toHaveLength(1);
  });

  it("numa pessoa perdida regista a chamada e mantém a perda", () => {
    const perdida = { motivo: "preco", data: "2026-10-01" } as const;
    const novo = registarChamada(estado([pessoa("a", { perdida })]), "a", chamada);
    expect(novo.pessoas[0].perdida).toEqual(perdida);
    expect(novo.atividade).toHaveLength(1);
  });

  it.each([
    ["ligarAmanha", "2026-10-14"], ["ligarHoje", "2026-10-13"], ["visitaOuOrcamento", "2026-10-15"], ["nenhum", null],
  ] as const)("o passo %s define o próximo contacto %s", (passo, esperado) => {
    const p = registarChamada(estado(), "a", { ...chamada, passo }).pessoas.find((x) => x.id === "a")!;
    expect(p.proximoContacto).toBe(esperado);
  });

  it("não altera o estado de entrada e ignora um id que não existe", () => {
    const antes = estado();
    const copia = JSON.stringify(antes);
    registarChamada(antes, "a", chamada);
    expect(JSON.stringify(antes)).toBe(copia);
    expect(registarChamada(antes, "x", chamada)).toBe(antes);
  });

  it("a chamada mais recente fica à frente das anteriores", () => {
    const duas = registarChamada(registarChamada(estado(), "a", chamada), "a", { ...chamada, nota: "Segunda" });
    expect(duas.atividade.map((i) => i.detalhe)).toEqual(["Segunda", "Quer visita"]);
  });
});

describe("juntarNota", () => {
  it("acrescenta a nota à atividade, sem a tratar como chave de tradução", () => {
    const novo = juntarNota(estado(), "a", "  pessoasPagina.seed.created  ", "2026-10-13");
    expect(novo.atividade[0]).toMatchObject({ tipo: "nota", detalhe: "pessoasPagina.seed.created", exemplo: false, quando: "2026-10-13" });
    expect(novo.atividade[0].chaveDetalhe).toBeUndefined();
  });

  it("ignora texto vazio e ids que não existem", () => {
    const e = estado();
    expect(juntarNota(e, "a", "   ", "2026-10-13")).toBe(e);
    expect(juntarNota(e, "x", "olá", "2026-10-13")).toBe(e);
  });
});

describe("adiar", () => {
  it.each([[1, "2026-10-14"], [3, "2026-10-16"], [7, "2026-10-20"]] as const)("em %s dia(s)", (dias, esperado) => {
    expect(adiar(estado(), "a", dias, "2026-10-13").pessoas[0].proximoContacto).toBe(esperado);
  });

  it("passa o mês", () => {
    expect(adiar(estado(), "a", 7, "2026-10-28").pessoas[0].proximoContacto).toBe("2026-11-04");
  });

  it("ignora um id que não existe", () => {
    const e = estado();
    expect(adiar(e, "x", 3, "2026-10-13")).toBe(e);
  });
});

describe("perder", () => {
  it("marca a lead como perdida, limpa o próximo contacto e regista na atividade", () => {
    const e = estado([pessoa("a", { proximoContacto: "2026-10-20" })]);
    const novo = perder(e, "a", "preco", "2026-10-13");
    expect(novo.pessoas[0].perdida).toEqual({ motivo: "preco", data: "2026-10-13" });
    expect(novo.pessoas[0].proximoContacto).toBeNull();
    expect(novo.atividade[0]).toMatchObject({ pessoaId: "a", tipo: "historico", exemplo: false });
  });

  it("ignora clientes", () => {
    const e = estado();
    expect(perder(e, "c", "preco", "2026-10-13")).toBe(e);
  });

  it("ignora leads que já estão perdidas", () => {
    const e = estado([pessoa("a", { perdida: { motivo: "adiou", data: "2026-10-01" } })]);
    expect(perder(e, "a", "preco", "2026-10-13")).toBe(e);
  });
});

describe("juntarAtividade", () => {
  it("junta e ordena da mais recente para a mais antiga, com as novas à frente em empate", () => {
    const semente = [item("s1", "2026-10-01"), item("s2", "2026-10-10")];
    const novas = [item("n1", "2026-10-10"), item("n2", "2026-10-13")];
    expect(juntarAtividade(semente, novas).map((i) => i.id)).toEqual(["n2", "n1", "s2", "s1"]);
  });

  it("não altera as listas de entrada", () => {
    const semente = [item("s1", "2026-10-01"), item("s2", "2026-10-10")];
    const novas = [item("n1", "2026-10-05")];
    juntarAtividade(semente, novas);
    expect(semente.map((i) => i.id)).toEqual(["s1", "s2"]);
    expect(novas).toHaveLength(1);
  });
});

describe("selosCabecalho", () => {
  it("cliente com etapa cliente: uma só etiqueta", () => {
    expect(selosCabecalho("cliente", "cliente")).toEqual([{ tipo: "papel", valor: "cliente" }]);
  });
  it("lead com etapa: duas etiquetas", () => {
    expect(selosCabecalho("lead", "nova")).toEqual([{ tipo: "papel", valor: "lead" }, { tipo: "etapa", valor: "nova" }]);
  });
  it("cliente com outra etapa mantém as duas", () => {
    expect(selosCabecalho("cliente", "qualificada")).toHaveLength(2);
  });
});

describe("ligacoes", () => {
  it("telefone de 9 dígitos ganha 351 no WhatsApp e o tel: fica só com dígitos", () => {
    const l = ligacoes({ telefone: "912 345 601", email: "a+b@exemplo.pt" });
    expect(l.telefone).toBe("tel:912345601");
    expect(l.whatsapp).toBe("https://wa.me/351912345601");
    expect(l.email).toBe("mailto:a+b@exemplo.pt");
  });
  it("não repete o 351 nem o sinal +", () => {
    expect(ligacoes({ telefone: "+351 912 345 601", email: null }).whatsapp).toBe("https://wa.me/351912345601");
    expect(ligacoes({ telefone: "+351 912 345 601", email: null }).telefone).toBe("tel:+351912345601");
    expect(ligacoes({ telefone: "351912345601", email: null }).whatsapp).toBe("https://wa.me/351912345601");
  });
  it("sem telefone ou sem email, esse botão não existe", () => {
    expect(ligacoes({ telefone: null, email: "a@b.pt" })).toEqual({ email: "mailto:a@b.pt" });
    expect(ligacoes({ telefone: "912 345 601", email: null })).not.toHaveProperty("email");
    expect(ligacoes({ telefone: null, email: null })).toEqual({});
    expect(ligacoes({ telefone: "  ", email: " " })).toEqual({});
  });
  it("um email com campos extra não vira mailto:", () => {
    expect(ligacoes({ telefone: null, email: "a@b.pt?bcc=x" })).toEqual({});
    expect(ligacoes({ telefone: null, email: "a@b.pt,c@d.pt" })).toEqual({});
  });
});

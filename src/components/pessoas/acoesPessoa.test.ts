import { describe, expect, it } from "vitest";
import {
  adiar, juntarAtividade, juntarNota, ligacoes, perder, reativar, registarChamada, somarDias, type EstadoAcoes,
} from "./acoesPessoa";
import { ATIVIDADE_EXEMPLO, PESSOAS_EXEMPLO } from "./pessoasExemplo";
import type { ItemAtividade, Pessoa } from "./pessoasTipos";

const pessoa = (id: string, extra: Partial<Pessoa> = {}): Pessoa => ({
  id, nome: id, contacto: { telefone: null, email: null }, comercial: "Ana", origem: "site", viaEntrada: "formulario", saude: 50,
  etapa: "emContacto", ultimoContactoDias: 9, ...extra,
});
const estado = (pessoas: Pessoa[] = [pessoa("a"), pessoa("c", { etapa: "cliente" })]): EstadoAcoes => ({
  pessoas, atividade: [], contactadas: [],
});
const item = (id: string, quando: string): ItemAtividade => ({
  id, pessoaId: "a", tipo: "nota", titulo: id, detalhe: "", quando, exemplo: true,
});
const chamada = { resultado: "atendeuInteressado", nota: "Quer visita", passo: "ligarAmanha", hoje: "2026-10-13" } as const;

describe("dados de exemplo da ficha", () => {
  it("preenche os campos novos nas 17 pessoas e gera 1 a 3 itens de atividade por pessoa", () => {
    expect(PESSOAS_EXEMPLO).toHaveLength(17);
    expect(PESSOAS_EXEMPLO.filter((p) => p.empresa)).toHaveLength(4);
    expect(PESSOAS_EXEMPLO.filter((p) => p.qualificacao)).toHaveLength(6);
    expect(PESSOAS_EXEMPLO.filter((p) => p.etapa === "cliente").every((p) => p.nif)).toBe(true);
    expect(PESSOAS_EXEMPLO.every((p) => p.morada && p.distrito && p.desde)).toBe(true);
    expect(PESSOAS_EXEMPLO.every((p) => p.saude >= 0 && p.saude <= 100 && p.canal)).toBe(true);
    PESSOAS_EXEMPLO.forEach((p) => {
      const n = ATIVIDADE_EXEMPLO.filter((i) => i.pessoaId === p.id).length;
      expect([1, 2, 3]).toContain(n);
    });
    expect(ATIVIDADE_EXEMPLO.every((i) => i.exemplo)).toBe(true);
  });

  it("só as pessoas sem chamada ficam sem resultado (Sem contacto) e as duas perdidas têm passo", () => {
    expect(PESSOAS_EXEMPLO.filter((p) => !p.resultadoContacto).map((p) => p.id).sort()).toEqual(["p-beatriz", "p-hugo"]);
    expect(PESSOAS_EXEMPLO.filter((p) => p.perdida).map((p) => [p.id, p.perdida?.passo])).toEqual([["p-joana", 1], ["p-fabio", 3]]);
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

  it("vale para a lead e para o cliente", () => {
    const novo = registarChamada(estado(), "c", { ...chamada, resultado: "semInteresse" });
    expect(novo.pessoas.find((x) => x.id === "c")?.resultadoContacto).toBe("semInteresse");
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
    const perdida = { motivo: "preco", data: "2026-10-01", passo: 2 } as const;
    const novo = registarChamada(estado([pessoa("a", { perdida })]), "a", chamada);
    expect(novo.pessoas[0].perdida).toEqual(perdida);
    expect(novo.atividade).toHaveLength(1);
  });

  it.each([
    ["ligarAmanha", "2026-10-14"], ["ligarHoje", "2026-10-13"], ["nenhum", null],
  ] as const)("o passo %s define o próximo contacto %s", (passo, esperado) => {
    const p = registarChamada(estado(), "a", { ...chamada, passo }).pessoas.find((x) => x.id === "a")!;
    expect(p.proximoContacto).toBe(esperado);
    expect(p.proximoHora).toBeUndefined();
  });

  describe("passos com dia e hora", () => {
    const visita = { ...chamada, passo: "marcarVisita", data: "2026-10-16", hora: "09:30", onde: " Rua A, Lisboa " } as const;

    it("marcar visita: etapa Visita, dia e hora no próximo contacto, e duas linhas na atividade (visita à frente)", () => {
      const novo = registarChamada(estado([pessoa("a", { etapa: "nova" })]), "a", visita);
      expect(novo.pessoas[0]).toMatchObject({
        etapa: "visitaMarcada", proximoContacto: "2026-10-16", proximoHora: "09:30", resultadoContacto: "atendeuInteressado", ultimoContactoDias: 0,
      });
      expect(novo.atividade).toHaveLength(2);
      expect(novo.atividade[0]).toMatchObject({ chaveTitulo: "pessoasPagina.activity.visitBooked", detalhe: "16/10 · 09:30 · Rua A, Lisboa" });
      expect(novo.atividade[1]).toMatchObject({ tipo: "chamada", detalhe: "Quer visita" });
      expect(novo.contactadas).toEqual(["a"]);
    });

    it("marcar visita sem dia, com dia passado, sem hora ou numa perdida não grava nada", () => {
      const antes = estado();
      expect(registarChamada(antes, "a", { ...visita, data: "" })).toBe(antes);
      expect(registarChamada(antes, "a", { ...visita, data: "2026-10-12" })).toBe(antes);
      expect(registarChamada(antes, "a", { ...visita, hora: "" })).toBe(antes);
      const perdida = estado([pessoa("a", { perdida: { motivo: "preco", data: "2026-10-01", passo: 1 } })]);
      expect(registarChamada(perdida, "a", visita)).toBe(perdida);
    });

    it("ligar numa data e hora: guarda dia e hora e acrescenta a chamada agendada à atividade", () => {
      const novo = registarChamada(estado(), "a", { ...chamada, resultado: "atendeuMaisTarde", passo: "ligarData", data: "2026-10-14", hora: "15:00" });
      expect(novo.pessoas[0]).toMatchObject({ proximoContacto: "2026-10-14", proximoHora: "15:00", etapa: "emContacto" });
      expect(novo.atividade[0]).toMatchObject({ chaveTitulo: "pessoasPagina.activity.callScheduled", detalhe: "14/10 · 15:00" });
      expect(novo.atividade).toHaveLength(2);
    });

    it("sem interesse + perder: regista a chamada e perde a lead com o motivo; sem motivo não grava", () => {
      const dados = { ...chamada, resultado: "semInteresse", passo: "perder", motivo: "preco", contexto: { passo: 0, papel: "lead" } } as const;
      const novo = registarChamada(estado(), "a", dados);
      expect(novo.pessoas[0].perdida).toMatchObject({ motivo: "preco", data: "2026-10-13", passo: 0 });
      expect(novo.pessoas[0].proximoContacto).toBeNull();
      expect(novo.atividade.map((i) => i.chaveTitulo)).toEqual(["pessoasPagina.activity.lost", "pessoasPagina.result.semInteresse"]);
      const antes = estado();
      expect(registarChamada(antes, "a", { ...dados, motivo: undefined })).toBe(antes);
    });

    it("a visita vale também para um cliente (continua cliente)", () => {
      const novo = registarChamada(estado(), "c", visita);
      expect(novo.pessoas.find((x) => x.id === "c")).toMatchObject({ proximoContacto: "2026-10-16", proximoHora: "09:30", etapa: "cliente" });
    });
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
    expect(novo.pessoas[0].perdida).toEqual({ motivo: "preco", data: "2026-10-13", passo: 1 });
    expect(novo.pessoas[0].proximoContacto).toBeNull();
    expect(novo.atividade[0]).toMatchObject({ pessoaId: "a", tipo: "historico", exemplo: false });
  });

  it.each([["nova", 0], ["emContacto", 1], ["visitaMarcada", 2], ["qualificada", 3]] as const)(
    "em qualquer passo antes de cliente: a etapa guardada %s dá o passo %s", (etapa, passo) => {
      const novo = perder(estado([pessoa("a", { etapa })]), "a", "adiou", "2026-10-13");
      expect(novo.pessoas[0].perdida?.passo).toBe(passo);
    },
  );

  it("o passo dado por quem chama (que conhece os negócios) manda sobre a etapa guardada", () => {
    expect(perder(estado([pessoa("a", { etapa: "nova" })]), "a", "preco", "2026-10-13", { passo: 3 }).pessoas[0].perdida?.passo).toBe(3);
  });

  it("o cliente não pode ser perdido (etapa guardada ou passo 4)", () => {
    const e = estado();
    expect(perder(e, "c", "preco", "2026-10-13")).toBe(e);
    expect(perder(e, "a", "preco", "2026-10-13", { passo: 4 })).toBe(e);
  });

  it("um cliente com passo limitado a 3 (negócio novo em aberto) também não se perde, pelo papel", () => {
    const e = estado([pessoa("a", { etapa: "qualificada" })]);
    expect(perder(e, "a", "preco", "2026-10-13", { passo: 3, papel: "cliente" })).toBe(e);
    expect(perder(e, "a", "preco", "2026-10-13", { passo: 3, papel: "lead" }).pessoas[0].perdida?.passo).toBe(3);
  });

  it("ignora leads que já estão perdidas e ids que não existem", () => {
    const e = estado([pessoa("a", { perdida: { motivo: "adiou", data: "2026-10-01", passo: 1 } })]);
    expect(perder(e, "a", "preco", "2026-10-13")).toBe(e);
    expect(perder(e, "x", "preco", "2026-10-13")).toBe(e);
  });
});

describe("reativar", () => {
  const perdida = { motivo: "preco", data: "2026-10-01", passo: 2 } as const;

  it("só em perdidas: limpa a perda, repõe o próximo contacto para amanhã e regista na atividade", () => {
    const e = estado([pessoa("a", { perdida, proximoContacto: null })]);
    const novo = reativar(e, "a", "2026-10-13");
    expect(novo.pessoas[0].perdida).toBeUndefined();
    expect(novo.pessoas[0].proximoContacto).toBe("2026-10-14");
    expect(novo.atividade[0]).toMatchObject({ pessoaId: "a", tipo: "historico", chaveTitulo: "pessoasPagina.activity.reactivated", exemplo: false });
    expect(e.pessoas[0].perdida).toEqual(perdida);
  });

  it("numa lead que não está perdida, num cliente ou num id que não existe, não faz nada", () => {
    const e = estado();
    expect(reativar(e, "a", "2026-10-13")).toBe(e);
    expect(reativar(e, "c", "2026-10-13")).toBe(e);
    expect(reativar(e, "x", "2026-10-13")).toBe(e);
  });

  it("perder e reativar voltam à lead em curso, com as duas linhas na atividade", () => {
    const volta = reativar(perder(estado([pessoa("a")]), "a", "preco", "2026-10-13"), "a", "2026-10-14");
    expect(volta.pessoas[0].perdida).toBeUndefined();
    expect(volta.atividade).toHaveLength(2);
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

// "Nova lead": a validação e a pessoa, o pedido e a atividade que saem dela, em memória.
import { afterEach, describe, expect, it } from "vitest";
import { marcarVisitaDoPedido } from "./acoesPedido";
import { montarLead, validarNovaLead, type DadosNovaLead } from "./novaLead";
import { faseDoPedido } from "./pedidoNegocio";
import { pessoasNovas, registarLead, repor } from "./pessoasNovas";
import { juntarPessoas } from "./juntarPessoas";
import { PESSOAS_EXEMPLO, NEGOCIOS_PESSOAS_EXEMPLO } from "./pessoasExemplo";
import { textoMorada } from "./formatoPessoas";
import { HOJE_EXEMPLO } from "@/components/negocio-metas/negocioMetasExemplo";

const HOJE = HOJE_EXEMPLO;
const DADOS: DadosNovaLead = {
  nome: "  Teresa Lobo ", telefone: "912 345 678", email: " teresa@exemplo.pt ", localidade: " Sintra ", origem: "indicacao",
  formulario: "", comercial: "Ana Ribeiro", nota: " Ligar depois das 18h ",
};

afterEach(repor);

describe("validarNovaLead", () => {
  it("só o nome é obrigatório; o resto só se valida se se escreveu", () => {
    expect(validarNovaLead({ ...DADOS, telefone: "", email: "", nota: "" })).toEqual({});
    expect(validarNovaLead({ ...DADOS, nome: "   " })).toEqual({ nome: "obrigatorio" });
    expect(validarNovaLead({ ...DADOS, nome: "x".repeat(81) })).toEqual({ nome: "comprido" });
  });

  it.each(["12345", "abcdefghi", "1234567890123456", "91 234 56x"])("recusa o telefone %j", (telefone) => {
    expect(validarNovaLead({ ...DADOS, telefone })).toEqual({ telefone: "invalido" });
  });

  it.each(["+351 912 345 678", "912-345-678"])("aceita o telefone %j", (telefone) => {
    expect(validarNovaLead({ ...DADOS, telefone })).toEqual({});
  });

  it("recusa um email sem domínio e uma nota com mais de 280 caracteres", () => {
    expect(validarNovaLead({ ...DADOS, email: "teresa@" })).toEqual({ email: "invalido" });
    expect(validarNovaLead({ ...DADOS, nota: "x".repeat(281) })).toEqual({ nota: "comprido" });
  });
});

describe("montarLead", () => {
  it("cria uma lead por contactar, com o contacto aparado e o primeiro contacto para hoje", () => {
    const { pessoa } = montarLead(DADOS, HOJE, 3);
    expect(pessoa).toMatchObject({
      id: "p-novo-3", nome: "Teresa Lobo", contacto: { telefone: "912 345 678", email: "teresa@exemplo.pt" },
      origem: "indicacao", viaEntrada: "manual", proximoContacto: HOJE, desde: HOJE, comercial: "Ana Ribeiro",
    });
    expect(pessoa.morada).toEqual({ linha: "", cp: "", localidade: "Sintra" });
    expect(textoMorada(pessoa.morada!)).toBe("Sintra");
    expect(pessoa.formulario).toBeUndefined();
    // A etapa deriva dos pedidos: a pessoa não a guarda.
    expect(pessoa).not.toHaveProperty("etapa");
  });

  it("o contacto que não se escreveu fica a null, e sem localidade não há morada", () => {
    const { pessoa } = montarLead({ ...DADOS, telefone: "", email: "", localidade: "", formulario: " Pedido de orçamento " }, HOJE, 1);
    expect(pessoa.contacto).toEqual({ telefone: null, email: null });
    expect(pessoa.morada).toBeUndefined();
    expect(pessoa.formulario).toBe("Pedido de orçamento");
  });

  it("a atividade tem a criação e, se há nota, a nota (a mais recente primeiro)", () => {
    const { atividade } = montarLead(DADOS, HOJE, 2);
    expect(atividade.map((a) => a.tipo)).toEqual(["nota", "historico"]);
    expect(atividade[0]).toMatchObject({ detalhe: "Ligar depois das 18h", pessoaId: "p-novo-2", exemplo: false });
    expect(montarLead({ ...DADOS, nota: "" }, HOJE, 2).atividade).toHaveLength(1);
  });

  it("uma lead nova aparece na lista como lead sem negócio, e por contactar", () => {
    const { pessoa, pedido } = montarLead(DADOS, HOJE, 1);
    const resumos = juntarPessoas([...PESSOAS_EXEMPLO, pessoa], NEGOCIOS_PESSOAS_EXEMPLO, HOJE, [pedido]);
    const resumo = resumos[resumos.length - 1];
    expect(resumo).toMatchObject({ papel: "lead", etapa: "nova", semNegocio: true });
  });
});

describe("pessoasNovas (o store)", () => {
  it("regista as leads com ids em série, guarda a atividade e repor esquece tudo", () => {
    expect(pessoasNovas().pessoas).toEqual([]);
    expect(registarLead(DADOS, HOJE).pessoa.id).toBe("p-novo-1");
    expect(registarLead({ ...DADOS, nome: "Outra" }, HOJE).pessoa.id).toBe("p-novo-2");
    expect(pessoasNovas().pessoas.map((p) => p.nome)).toEqual(["Teresa Lobo", "Outra"]);
    // Cada lead leva a nota e o registo de criação: 2 + 2.
    expect(pessoasNovas().atividade).toHaveLength(4);
    repor();
    expect(pessoasNovas().pessoas).toEqual([]);
    expect(registarLead(DADOS, HOJE).pessoa.id).toBe("p-novo-1");
  });
});

describe("marcar a visita à lead nova", () => {
  it("a visita vai para o pedido por contactar com que a lead nasce: passa a Visita, na morada da lead", () => {
    const { pessoa, pedido } = montarLead({ ...DADOS, localidade: "Braga" }, HOJE, 1);
    const comMorada = { ...pessoa, morada: { linha: "Largo da Sé 5", cp: "4700-010", localidade: "Braga" } };
    const estado = { pessoas: [comMorada], pedidos: [pedido], atividade: [], contactadas: [] as string[] };
    const depois = marcarVisitaDoPedido(estado, pedido.id, { data: "2026-10-20", hora: "10:30", nota: "" }, HOJE);
    expect(faseDoPedido(depois.pedidos[0])).toBe("visita");
    expect(depois.pedidos[0].visitas[0]).toMatchObject({ igualALead: true, morada: { rua: "Largo da Sé 5", localidade: "Braga" } });
    expect(depois.contactadas).toEqual([pessoa.id]);
  });
});

describe("a lead nova leva o pedido por contactar", () => {
  it("montarLead devolve também o pedido: por contactar, sem visitas, com o comercial e a data de hoje", () => {
    const { pessoa, pedido } = montarLead(DADOS, HOJE, 3);
    expect(pedido).toEqual({
      id: "pd-novo-3", pessoaId: pessoa.id, servico: "", comercial: "Ana Ribeiro", criadoEm: HOJE, contactado: false, visitas: [],
    });
    expect(faseDoPedido(pedido)).toBe("porContactar");
  });

  it("o store guarda os pedidos ao lado das pessoas, e repor esquece-os", () => {
    expect(pessoasNovas().pedidos).toEqual([]);
    const primeira = registarLead(DADOS, HOJE);
    registarLead({ ...DADOS, nome: "Outra" }, HOJE);
    expect(pessoasNovas().pedidos.map((p) => p.id)).toEqual(["pd-novo-1", "pd-novo-2"]);
    expect(pessoasNovas().pedidos[0]).toBe(primeira.pedido);
    repor();
    expect(pessoasNovas().pedidos).toEqual([]);
  });
});

// "Nova lead" e "Marcar visita": a validação e a pessoa (ou o estado) que saem delas, em memória.
import { afterEach, describe, expect, it } from "vitest";
import { montarLead, validarNovaLead, type DadosNovaLead } from "./novaLead";
import { pessoasNovas, registarLead, repor } from "./pessoasNovas";
import { marcarVisita, validarVisita, type DadosVisita } from "./visitaPessoa";
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
      id: "p-novo-3", nome: "Teresa Lobo", contacto: { telefone: "912 345 678", email: "teresa@exemplo.pt" }, etapa: "nova",
      origem: "indicacao", viaEntrada: "manual", proximoContacto: HOJE, desde: HOJE, comercial: "Ana Ribeiro",
    });
    expect(pessoa.morada).toEqual({ linha: "", cp: "", localidade: "Sintra" });
    expect(textoMorada(pessoa.morada!)).toBe("Sintra");
    expect(pessoa.formulario).toBeUndefined();
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
    const { pessoa } = montarLead(DADOS, HOJE, 1);
    const resumo = juntarPessoas([...PESSOAS_EXEMPLO, pessoa], NEGOCIOS_PESSOAS_EXEMPLO, HOJE).at(-1)!;
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

describe("validarVisita e marcarVisita", () => {
  const visita: DadosVisita = { data: "2026-10-20", hora: "10:30", nota: " Levar o catálogo ", servico: "Cozinha" };
  const estado = {
    pessoas: PESSOAS_EXEMPLO.filter((p) => p.id === "p-hugo" || p.id === "p-fabio"), atividade: [], contactadas: [] as string[],
  };

  it("o dia é obrigatório e não pode ser anterior a hoje; a hora, se houver, é HH:MM", () => {
    expect(validarVisita({ ...visita, data: "" }, HOJE)).toBe("dataVazia");
    expect(validarVisita({ ...visita, data: "2026-10-12" }, HOJE)).toBe("dataPassada");
    expect(validarVisita({ ...visita, data: HOJE }, HOJE)).toBeNull();
    expect(validarVisita({ ...visita, hora: "25:00" }, HOJE)).toBe("horaInvalida");
    expect(validarVisita({ ...visita, hora: "" }, HOJE)).toBeNull();
    expect(validarVisita({ ...visita, nota: "x".repeat(141) }, HOJE)).toBe("notaComprida");
  });

  it("passa a pessoa à etapa Visita, põe o contacto no dia da visita e regista-o na atividade", () => {
    const antes = estado.pessoas.find((p) => p.id === "p-hugo")!;
    expect(["nova", "emContacto"]).toContain(antes.etapa);
    const depois = marcarVisita(estado, "p-hugo", visita, HOJE);
    const pessoa = depois.pessoas.find((p) => p.id === "p-hugo")!;
    expect(pessoa).toMatchObject({ etapa: "visitaMarcada", proximoContacto: "2026-10-20", ultimoContactoDias: 0 });
    expect(depois.contactadas).toEqual(["p-hugo"]);
    expect(depois.atividade[0]).toMatchObject({ pessoaId: "p-hugo", chaveTitulo: "pessoasPagina.activity.visitBooked", exemplo: false });
    // A linha da atividade diz também a morada da visita (sem escolha, a da lead).
    expect(depois.atividade[0].detalhe).toBe("2026-10-20 10:30 · Cozinha · Levar o catálogo · Largo da Sé 5, 4700-010 Braga");
    expect(pessoa.visita).toMatchObject({ igualALead: true, moradaVisita: { rua: "Largo da Sé 5", localidade: "Braga" } });
    expect(antes.etapa).not.toBe("visitaMarcada");
  });

  it("ids que não existem, pessoas perdidas e dados inválidos deixam o estado como está", () => {
    expect(marcarVisita(estado, "nao-existe", visita, HOJE)).toBe(estado);
    expect(marcarVisita(estado, "p-hugo", { ...visita, data: "" }, HOJE)).toBe(estado);
    const perdida = { ...estado, pessoas: [{ ...estado.pessoas[0], perdida: { motivo: "preco" as const, data: HOJE } }] };
    expect(marcarVisita(perdida, perdida.pessoas[0].id, visita, HOJE)).toBe(perdida);
  });

});

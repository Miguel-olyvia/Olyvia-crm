// "Nova lead": a validação e a pessoa e a atividade que saem dela, em memória. Não nasce com pedido: a abordagem lê os registos da pessoa.
import { afterEach, describe, expect, it } from "vitest";
import { montarLead, validarNovaLead, type DadosNovaLead } from "./novaLead";
import { pessoasNovas, registarLead, repor } from "./pessoasNovas";
import { juntarPessoas } from "./juntarPessoas";
import { PESSOAS_EXEMPLO, NEGOCIOS_PESSOAS_EXEMPLO } from "./pessoasExemplo";
import { visitaNova } from "./visitaDaPessoa";
import { REGISTOS_VAZIOS } from "@/components/negocio-metas/registosTipos";
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
    // A etapa deriva dos registos: a pessoa não a guarda.
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
    const { pessoa } = montarLead(DADOS, HOJE, 1);
    const resumos = juntarPessoas([...PESSOAS_EXEMPLO, pessoa], NEGOCIOS_PESSOAS_EXEMPLO, HOJE, REGISTOS_VAZIOS);
    const resumo = resumos[resumos.length - 1];
    expect(resumo).toMatchObject({ papel: "lead", etapa: "nova", semNegocio: true, parte: "abordagem", coluna: "porContactar" });
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

describe("a lead nova não leva pedido", () => {
  it("montarLead devolve só a pessoa e a atividade", () => {
    expect(Object.keys(montarLead(DADOS, HOJE, 3)).sort()).toEqual(["atividade", "pessoa"]);
  });

  it("o store só guarda pessoas e atividade", () => {
    registarLead(DADOS, HOJE);
    expect(Object.keys(pessoasNovas()).sort()).toEqual(["atividade", "pessoas"]);
  });

  it("a visita marca-se na pessoa, na morada da lead (a ficha só tem a localidade: falta a rua e não se marca sem outra morada)", () => {
    const { pessoa } = montarLead({ ...DADOS, localidade: "Braga" }, HOJE, 1);
    expect(visitaNova(pessoa, { data: "2026-10-20", hora: "10:30", nota: "" }, [], HOJE)).not.toBeNull();
    const comMorada = { ...pessoa, morada: { linha: "Largo da Sé 5", cp: "4700-010", localidade: "Braga" } };
    expect(visitaNova(comMorada, { data: "2026-10-20", hora: "10:30", nota: "" }, [], HOJE)?.visita).toMatchObject({
      igualALead: true, morada: { rua: "Largo da Sé 5", localidade: "Braga" },
    });
  });
});

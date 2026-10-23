import { describe, expect, it } from "vitest";
import { negocioMetasNovoTranslations } from "@/translations/negocioMetasNovo";
import { BLOCO_QUALIFICACAO } from "./qualificacaoExemplo";
import {
  alternarResposta, chaveBloco, chaveOpcao, chavePergunta, chaveSeccao, contarRespostas, contarSeccao, contarTotal,
  limparOcultas, perguntasVisiveis, respostasEmTexto, seccaoCompleta, visitaEmTexto,
} from "./respostasVisita";
import { SECCOES_VISITA } from "./visitaExemplo";

const seccao = (id: string) => SECCOES_VISITA.find((s) => s.id === id)!;
const TODOS = [BLOCO_QUALIFICACAO, ...SECCOES_VISITA.flatMap((s) => s.blocos)];
const texto = (chave: string) => negocioMetasNovoTranslations.pt[`businessGoals.new.${chave}`] ?? chave;

describe("as listas do protótipo", () => {
  it("a Visita tem as sete secções, pela ordem do protótipo", () => {
    expect(SECCOES_VISITA.map((s) => s.id)).toEqual(["visitas", "exterior", "interior", "area", "medidas", "necessidades", "escolhas"]);
    expect(SECCOES_VISITA.map((s) => s.titulo[0])).toEqual([
      "Visitas", "Exterior do edifício", "Interior do espaço", "Área de intervenção", "Medidas da área", "Necessidades do cliente", "Escolhas do cliente",
    ]);
  });

  it("a Qualificação tem as seis perguntas e as opções pedidas", () => {
    const [imovel, posse, decisor, orcamento, prazo, outros] = BLOCO_QUALIFICACAO.perguntas;
    expect(BLOCO_QUALIFICACAO.perguntas).toHaveLength(6);
    expect(imovel.opcoes.map((o) => o[1])).toEqual(["Apartamento", "Moradia", "Loja", "Escritório"]);
    expect(posse.opcoes.map((o) => o[1])).toEqual(["Proprietário", "Inquilino", "Administração"]);
    expect(decisor.opcoes.map((o) => o[1])).toEqual(["O próprio", "Com a família", "Administração"]);
    expect(orcamento.opcoes.map((o) => o[1])).toEqual(["Até 3.000 €", "3.000 a 6.000 €", "6.000 a 10.000 €", "Mais de 10.000 €", "Não sabe"]);
    expect(prazo.opcoes.map((o) => o[1])).toEqual(["Urgente (1 mês)", "1 a 3 meses", "3 a 6 meses", "Sem pressa"]);
    expect(outros.opcoes.map((o) => o[1])).toEqual(["Sim", "Não"]);
  });

  it("os ids das perguntas são únicos em todo o painel e cada pergunta tem opções", () => {
    const ids = TODOS.flatMap((b) => b.perguntas.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of TODOS) for (const p of b.perguntas) expect(p.opcoes.length, p.id).toBeGreaterThan(1);
  });

  it("toda a pergunta, opção, bloco e secção tem texto em pt e en", () => {
    for (const lingua of ["pt", "en"] as const) {
      const textos = negocioMetasNovoTranslations[lingua];
      const chaves = [
        ...SECCOES_VISITA.map((s) => chaveSeccao(s.id)),
        ...TODOS.flatMap((b) => [
          ...(b.titulo ? [chaveBloco(b.id)] : []),
          ...b.perguntas.flatMap((p) => [chavePergunta(p.id), ...p.opcoes.map(([c]) => chaveOpcao(p.id, c))]),
        ]),
      ];
      for (const c of chaves) expect(textos[`businessGoals.new.${c}`], `${lingua} ${c}`).toBeTruthy();
    }
  });
});

describe("perguntas condicionais", () => {
  const exterior = seccao("exterior");

  it("Impacto no preço só aparece com acesso difícil, e a zona só com estacionamento pago", () => {
    const ids = (r: Record<string, string>) => perguntasVisiveis(exterior.blocos, r).map((p) => p.id);
    expect(ids({})).toEqual(["acesso", "estacionamento", "distEntulho", "temElevador"]);
    expect(ids({ acesso: "dificil" })).toContain("impactoPreco");
    expect(ids({ acesso: "facil" })).not.toContain("impactoPreco");
    expect(ids({ estacionamento: "pago" })).toContain("zonaEstacionamento");
    expect(ids({ estacionamento: "sem" })).not.toContain("zonaEstacionamento");
  });

  it("a Tipologia aparece em Casa e sem tipo de espaço, e não em Escritório", () => {
    const ids = (r: Record<string, string>) => perguntasVisiveis(seccao("interior").blocos, r).map((p) => p.id);
    expect(ids({})).toContain("tipologia");
    expect(ids({ tipoEspaco: "casa" })).toContain("tipologia");
    expect(ids({ tipoEspaco: "escritorio" })).not.toContain("tipologia");
  });

  it("limparOcultas tira as respostas de perguntas que deixaram de se ver, e não mexe no que se vê", () => {
    const r = { acesso: "facil", impactoPreco: "p10", estacionamento: "pago" };
    expect(limparOcultas(exterior.blocos, r)).toEqual({ acesso: "facil", estacionamento: "pago" });
    expect(limparOcultas(exterior.blocos, { acesso: "dificil", impactoPreco: "p10" })).toEqual({ acesso: "dificil", impactoPreco: "p10" });
  });
});

describe("contar respostas", () => {
  it("por secção: n de m, só com as perguntas visíveis", () => {
    const exterior = seccao("exterior");
    expect(contarSeccao(exterior, {})).toEqual({ respondidas: 0, total: 4 });
    expect(contarSeccao(exterior, { acesso: "dificil", estacionamento: "pago" })).toEqual({ respondidas: 2, total: 6 });
    expect(contarSeccao(seccao("escolhas"), { materiaisCliente: "sim" })).toEqual({ respondidas: 1, total: 2 });
  });

  it("uma resposta que não é opção da pergunta não conta", () => {
    expect(contarRespostas([BLOCO_QUALIFICACAO], { imovel: "castelo" })).toEqual({ respondidas: 0, total: 6 });
  });

  it("no total soma as secções, e as Medidas (sem perguntas) não contam", () => {
    const vazio = contarTotal(SECCOES_VISITA, {});
    expect(vazio.respondidas).toBe(0);
    expect(contarTotal(SECCOES_VISITA, { acesso: "facil", janela: "sim", mantemMoveis: "nao" }).respondidas).toBe(3);
    expect(contarSeccao(seccao("medidas"), {})).toEqual({ respondidas: 0, total: 0 });
  });

  it("uma secção só está completa quando tem perguntas e todas respondidas", () => {
    const escolhas = seccao("escolhas");
    expect(seccaoCompleta(escolhas, { materiaisCliente: "sim" })).toBe(false);
    expect(seccaoCompleta(escolhas, { materiaisCliente: "sim", mobilidadeReduzida: "nao" })).toBe(true);
    expect(seccaoCompleta(seccao("medidas"), {})).toBe(false);
  });
});

describe("alternarResposta", () => {
  it("escolhe, troca e, ao tocar de novo na escolhida, retira (sem mexer no original)", () => {
    const antes = {};
    const a = alternarResposta(TODOS, antes, "imovel", "loja");
    expect(a).toEqual({ imovel: "loja" });
    expect(antes).toEqual({});
    expect(alternarResposta(TODOS, a, "imovel", "moradia")).toEqual({ imovel: "moradia" });
    expect(alternarResposta(TODOS, a, "imovel", "loja")).toEqual({});
  });

  it("ao mudar a resposta de que outra depende, essa outra desaparece (também ao retirar a resposta de que depende)", () => {
    const dificil = alternarResposta(TODOS, {}, "acesso", "dificil");
    const comImpacto = alternarResposta(TODOS, dificil, "impactoPreco", "p15");
    expect(comImpacto).toEqual({ acesso: "dificil", impactoPreco: "p15" });
    expect(alternarResposta(TODOS, comImpacto, "acesso", "facil")).toEqual({ acesso: "facil" });
    expect(alternarResposta(TODOS, comImpacto, "acesso", "dificil")).toEqual({});
  });
});

describe("em texto para o negócio", () => {
  it("a Qualificação dá pergunta e resposta, só das respondidas, pela ordem do ecrã", () => {
    expect(respostasEmTexto([BLOCO_QUALIFICACAO], { prazo: "urgente", imovel: "apartamento" }, texto)).toEqual([
      { pergunta: "Tipo de imóvel", resposta: "Apartamento" },
      { pergunta: "Para quando", resposta: "Urgente (1 mês)" },
    ]);
    expect(respostasEmTexto([BLOCO_QUALIFICACAO], {}, texto)).toEqual([]);
  });

  it("a Visita só leva as secções com respostas, e ignora as de perguntas ocultas", () => {
    const visita = visitaEmTexto(SECCOES_VISITA, { acesso: "facil", impactoPreco: "p10", materiaisCliente: "sim" }, texto);
    expect(visita.map((s) => s.titulo)).toEqual(["Exterior do edifício", "Escolhas do cliente"]);
    expect(visita[0].respostas).toEqual([{ pergunta: "Acesso", resposta: "Fácil" }]);
    expect(visitaEmTexto(SECCOES_VISITA, {}, texto)).toEqual([]);
  });
});

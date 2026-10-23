// O questionário do formulário do levantamento: ler o que neg_questionario_levantamento devolve (sem inativas) para as secções e perguntas
// que o formulário desenha, e o catálogo do código (o protótipo sem base). Só lógica pura.
import { describe, expect, it } from "vitest";
import { copiarBruto, QUESTIONARIO_BRUTO } from "@/hooks/pessoas/workflow/questionarioTestUtil";
import {
  blocosDaQualificacao, lerQuestionarioForm, QUESTIONARIO_CODIGO, seccaoDaPergunta, seccoesDaVisita, todasAsPerguntas, todosOsBlocos,
} from "./questionarioForm";
import { BLOCO_QUALIFICACAO } from "./qualificacaoExemplo";
import { SECCOES_VISITA } from "./visitaExemplo";

const lido = () => lerQuestionarioForm(QUESTIONARIO_BRUTO)!;
const pergunta = (chave: string) => todasAsPerguntas(lido().seccoes).find((p) => p.id === chave)!;

describe("lerQuestionarioForm", () => {
  it("devolve a versão e as secções pela ordem da base, com os textos tal como a organização os escreveu", () => {
    const q = lido();
    expect(q.versao).toBe(7);
    expect(q.semBase).toBe(false);
    expect(q.seccoes.map((s) => s.id)).toEqual(["visitas", "exterior", "medidas", "qualificacao"]);
    expect(q.seccoes.map((s) => s.titulo[0])).toEqual(["Visitas", "Exterior do edifício", "Medidas da área", "Qualificação"]);
    // Um só texto (D1): o mesmo nas duas posições do par, e marcado como literal (não é uma chave de tradução).
    expect(q.seccoes[1].titulo).toEqual(["Exterior do edifício", "Exterior do edifício"]);
    expect(q.seccoes.every((s) => s.literal === true)).toBe(true);
  });

  it("as secções especiais não têm perguntas e a Qualificação fica na sua aba", () => {
    const q = lido();
    expect(q.seccoes.find((s) => s.id === "visitas")).toMatchObject({ especial: "visitas", blocos: [] });
    expect(q.seccoes.find((s) => s.id === "medidas")).toMatchObject({ especial: "medidas", blocos: [] });
    expect(q.seccoes.find((s) => s.id === "qualificacao")?.aba).toBe("qualificacao");
    expect(q.seccoes.find((s) => s.id === "exterior")?.aba).toBe("visita");
  });

  it("agrupa em blocos as perguntas seguidas com o mesmo subtítulo (D2)", () => {
    const exterior = lido().seccoes.find((s) => s.id === "exterior")!;
    expect(exterior.blocos).toHaveLength(2);
    expect(exterior.blocos[0].titulo).toEqual(["Acesso e estacionamento", "Acesso e estacionamento"]);
    expect(exterior.blocos[0].perguntas.map((p) => p.id)).toEqual(["acesso", "impactoPreco"]);
    expect(exterior.blocos[1].titulo).toBeUndefined();
    expect(exterior.blocos[1].perguntas.map((p) => p.id)).toEqual(["notas"]);
  });

  it("a pergunta é identificada pela chave da base e leva o tipo e as opções pela ordem", () => {
    const acesso = pergunta("acesso");
    expect(acesso).toMatchObject({ id: "acesso", tipo: "escolha_unica", literal: true });
    expect(acesso.rotulo[0]).toBe("Acesso");
    expect(acesso.opcoes.map((o) => o[0])).toEqual(["facil", "dificil"]);
    expect(acesso.opcoes.map((o) => o[1])).toEqual(["Fácil", "Difícil"]);
    expect(pergunta("imovel").tipo).toBe("escolha_multipla");
    expect(pergunta("notas")).toMatchObject({ tipo: "texto", textoMax: 2000 });
  });

  it("a pergunta de número leva os limites, as casas e a unidade", () => {
    expect(pergunta("orcCliente")).toMatchObject({ tipo: "numero", numero: { min: 0, max: 100000, casas: 2, unidade: "€" } });
  });

  it("a condição aponta para a chave da pergunta e para as chaves das opções (D9: só decide o que se vê)", () => {
    expect(pergunta("impactoPreco").se).toEqual({ pergunta: "acesso", valores: ["dificil"] });
  });

  it("«aparece também sem resposta» conta como a chave vazia, como no catálogo do código", () => {
    const bruto = copiarBruto();
    const impacto = bruto.seccoes[1].perguntas[1] as { depende: { sem_resposta: boolean } };
    impacto.depende.sem_resposta = true;
    const p = todasAsPerguntas(lerQuestionarioForm(bruto)!.seccoes).find((x) => x.id === "impactoPreco")!;
    expect(p.se).toEqual({ pergunta: "acesso", valores: ["dificil", ""] });
  });

  it("não mostra a quem preenche de novo as secções, perguntas e opções inativas (D5)", () => {
    const bruto = copiarBruto();
    (bruto.seccoes[1].perguntas[0] as { activa: boolean }).activa = false;
    const q = lerQuestionarioForm(bruto)!;
    expect(todasAsPerguntas(q.seccoes).map((p) => p.id)).not.toContain("acesso");
    // «impactoPreco» tem uma opção inativa (p10) que a base nem devolve sem pedir as inativas.
    expect(pergunta("impactoPreco").opcoes.map((o) => o[0])).toEqual(["p5"]);
    const sem = copiarBruto();
    (sem.seccoes[1] as { activa: boolean }).activa = false;
    expect(lerQuestionarioForm(sem)!.seccoes.map((s) => s.id)).not.toContain("exterior");
  });

  it.each([null, undefined, "x", 3, [], {}, { versao: 0, seccoes: [] }, { versao: 1.5, seccoes: [] }, { versao: 2 }, { versao: 2, seccoes: "x" }])(
    "devolve null para %j (nunca inventa um questionário)", (cru) => {
      expect(lerQuestionarioForm(cru)).toBeNull();
    },
  );

  it("ignora itens que não se reconhecem em vez de partir", () => {
    const bruto = copiarBruto() as unknown as { seccoes: unknown[] };
    bruto.seccoes.push(null, "x", { id: 1 }, { chave: 5, titulo: "x" }, { chave: "semTitulo" });
    const exterior = bruto.seccoes[1] as { perguntas: unknown[] };
    exterior.perguntas.push({ chave: "estranha", texto: "t", tipo: "inventado", opcoes: [] }, 7);
    const q = lerQuestionarioForm(bruto)!;
    expect(q.seccoes).toHaveLength(4);
    expect(todasAsPerguntas(q.seccoes).map((p) => p.id)).not.toContain("estranha");
  });

  it("uma condição que aponta para uma pergunta que não existe fica sem condição (a pergunta vê-se)", () => {
    const bruto = copiarBruto();
    (bruto.seccoes[1].perguntas[1] as { depende: unknown }).depende = { pergunta_chave: "nao-existe", opcoes: ["x"], sem_resposta: false };
    expect(todasAsPerguntas(lerQuestionarioForm(bruto)!.seccoes).find((p) => p.id === "impactoPreco")!.se).toBeUndefined();
  });
});

describe("os selectores do questionário", () => {
  it("a aba Visita tem as secções da aba visita; a Qualificação tem os seus blocos", () => {
    const q = lido();
    expect(seccoesDaVisita(q).map((s) => s.id)).toEqual(["visitas", "exterior", "medidas"]);
    expect(blocosDaQualificacao(q).flatMap((b) => b.perguntas.map((p) => p.id))).toEqual(["imovel", "orcCliente"]);
    expect(todosOsBlocos(q).flatMap((b) => b.perguntas).map((p) => p.id)).toEqual(["acesso", "impactoPreco", "notas", "imovel", "orcCliente"]);
  });

  it("sem secção de Qualificação não há blocos (a aba fica vazia, não rebenta)", () => {
    expect(blocosDaQualificacao({ versao: 1, semBase: false, seccoes: [] })).toEqual([]);
  });

  it("seccaoDaPergunta devolve a chave da secção onde a pergunta está", () => {
    const q = lido();
    expect(seccaoDaPergunta(q, "acesso")).toBe("exterior");
    expect(seccaoDaPergunta(q, "imovel")).toBe("qualificacao");
    expect(seccaoDaPergunta(q, "desconhecida")).toBeNull();
  });
});

describe("QUESTIONARIO_CODIGO: o catálogo do código (protótipo sem base)", () => {
  it("é o catálogo de hoje: as sete secções da Visita e a Qualificação, sem versão e marcado como sem base", () => {
    expect(QUESTIONARIO_CODIGO.versao).toBeNull();
    expect(QUESTIONARIO_CODIGO.semBase).toBe(true);
    expect(seccoesDaVisita(QUESTIONARIO_CODIGO).map((s) => s.id)).toEqual(SECCOES_VISITA.map((s) => s.id));
    expect(blocosDaQualificacao(QUESTIONARIO_CODIGO)).toEqual([BLOCO_QUALIFICACAO]);
  });

  it("os textos continuam a ser chaves de tradução (não literais) e todas as perguntas são de escolha única", () => {
    expect(QUESTIONARIO_CODIGO.seccoes.some((s) => s.literal)).toBe(false);
    for (const p of todasAsPerguntas(QUESTIONARIO_CODIGO.seccoes)) expect(p.tipo ?? "escolha_unica", p.id).toBe("escolha_unica");
    expect(todasAsPerguntas(QUESTIONARIO_CODIGO.seccoes)).toHaveLength(36);
  });
});

describe("lerQuestionarioForm: chaves de opção", () => {
  it("uma opção cuja chave tem vírgula fica de fora: a escolha múltipla guarda as chaves separadas por vírgula e uma chave assim partia-se em duas", () => {
    const cru = copiarBruto() as unknown as { seccoes: { perguntas: { id: string; opcoes: { id: string; chave: string; texto: string }[] }[] }[] };
    cru.seccoes[3].perguntas[0].opcoes.push({ id: "x1", chave: "a,b", texto: "Mista", ordem: 2, activa: true } as never);
    const q = lerQuestionarioForm(cru)!;
    const imovel = todasAsPerguntas(q.seccoes).find((p) => p.id === "imovel")!;
    expect(imovel.opcoes.map((o) => o[0])).toEqual(["apartamento", "moradia"]);
  });

  it("as chaves que a base gera (sem vírgula) continuam todas", () => {
    expect(pergunta("imovel").opcoes.map((o) => o[0])).toEqual(["apartamento", "moradia"]);
  });
});

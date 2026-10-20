// O questionário do levantamento em forma pura: ler o que neg_questionario_levantamento devolve e montar o que neg_guardar_questionario
// aceita (ids nos itens que já existem, refs nos novos; condições por id ou ref; sem chaves).
import { describe, expect, it } from "vitest";
import { criarOpcao, criarPergunta, criarSeccao, lerQuestionario, paraEnvio, type SeccaoEd } from "./questionario";
import { copiarBruto, QUESTIONARIO_BRUTO, uuid } from "./questionarioTestUtil";

const lido = () => lerQuestionario(QUESTIONARIO_BRUTO)!;
const REF = /^[A-Za-z0-9_]{1,40}$/;

describe("lerQuestionario", () => {
  it("lê a versão e as secções pela ordem da base, com as especiais marcadas", () => {
    const q = lido();
    expect(q.versao).toBe(7);
    expect(q.seccoes.map((s) => s.titulo)).toEqual(["Visitas", "Exterior do edifício", "Medidas da área", "Qualificação"]);
    expect(q.seccoes.map((s) => s.especial)).toEqual(["visitas", null, "medidas", null]);
    expect(q.seccoes[3].aba).toBe("qualificacao");
    expect(q.seccoes[1].id).toBe(uuid(2));
    expect(q.seccoes[1].k).toBe(uuid(2));
  });

  it("a condição passa de chaves de opção (como a base guarda) a ids de opção, e aponta para o id da pergunta", () => {
    const impacto = lido().seccoes[1].perguntas[1];
    expect(impacto.depende).toEqual({ pergunta: uuid(10), opcoes: [uuid(101)], semResposta: false });
  });

  it("números e textos viram texto de formulário: vazio quando a base tem null, 2000 quando é o tamanho de omissão", () => {
    const [imovel, orc] = lido().seccoes[3].perguntas;
    expect(orc).toMatchObject({ tipo: "numero", min: "0", max: "100000", casas: "2", unidade: "€", bloco: "" });
    expect(imovel).toMatchObject({ tipo: "escolha_multipla", min: "", max: "", casas: "", unidade: "", textoMax: "" });
    expect(lido().seccoes[1].perguntas[2]).toMatchObject({ tipo: "texto", textoMax: "2000" });
  });

  it("lê as opções inativas e a chave que a base lhes deu", () => {
    const opcoes = lido().seccoes[1].perguntas[1].opcoes;
    expect(opcoes.map((o) => [o.texto, o.activa, o.chave])).toEqual([["5%", true, "p5"], ["10%", false, "p10"]]);
  });

  it.each([undefined, null, "x", 3, {}, { versao: "7", seccoes: [] }, { versao: 7, seccoes: "x" }, { versao: 0, seccoes: [] }])(
    "%j não é um questionário: dá null",
    (cru) => {
      expect(lerQuestionario(cru)).toBeNull();
    },
  );

  it("é tolerante: secção sem lista de perguntas fica vazia, e uma condição para uma pergunta que não existe cai", () => {
    const cru = copiarBruto();
    (cru.seccoes[0] as { perguntas?: unknown }).perguntas = undefined;
    cru.seccoes[1].perguntas[1].depende!.pergunta_id = uuid(999);
    const q = lerQuestionario(cru)!;
    expect(q.seccoes[0].perguntas).toEqual([]);
    expect(q.seccoes[1].perguntas[1].depende).toBeNull();
  });
});

describe("paraEnvio", () => {
  it("manda id nos itens que existem e nunca manda chaves, ordem, aba nem especial", () => {
    const envio = paraEnvio(lido().seccoes) as Record<string, unknown>[];
    expect(envio).toHaveLength(4);
    expect(envio[1]).toMatchObject({ id: uuid(2), titulo: "Exterior do edifício", activa: true });
    expect(JSON.stringify(envio)).not.toMatch(/"(chave|ordem|aba|especial|k)"/);
    expect(envio[0]).toEqual({ id: uuid(1), titulo: "Visitas", activa: true, perguntas: [] });
  });

  it("pergunta de escolha: opções com id e activa; subtítulo vazio vai como null; sem número nem texto_max", () => {
    const acesso = (paraEnvio(lido().seccoes) as { perguntas: Record<string, unknown>[] }[])[1].perguntas[0];
    expect(acesso).toEqual({
      id: uuid(10), texto: "Acesso", tipo: "escolha_unica", bloco: "Acesso e estacionamento", activa: true,
      opcoes: [{ id: uuid(100), texto: "Fácil", activa: true }, { id: uuid(101), texto: "Difícil", activa: true }],
    });
  });

  it("a condição vai por ids e com sem_resposta", () => {
    const impacto = (paraEnvio(lido().seccoes) as { perguntas: Record<string, unknown>[] }[])[1].perguntas[1];
    expect(impacto.depende).toEqual({ pergunta: uuid(10), opcoes: [uuid(101)], sem_resposta: false });
  });

  it("texto: texto_max null quando é o de omissão (2000) ou está vazio, e o número quando é outro", () => {
    const base = lido();
    expect((paraEnvio(base.seccoes) as { perguntas: Record<string, unknown>[] }[])[1].perguntas[2]).toMatchObject({ tipo: "texto", texto_max: null, opcoes: [] });
    const outro: SeccaoEd[] = JSON.parse(JSON.stringify(base.seccoes));
    outro[1].perguntas[2].textoMax = "300";
    expect((paraEnvio(outro) as { perguntas: Record<string, unknown>[] }[])[1].perguntas[2]).toMatchObject({ texto_max: 300 });
  });

  it("número: min, max, casas e unidade como números/null; vazio vai como null", () => {
    const base = lido();
    expect((paraEnvio(base.seccoes) as { perguntas: Record<string, unknown>[] }[])[3].perguntas[1]).toMatchObject({
      tipo: "numero", numero: { min: 0, max: 100000, casas: 2, unidade: "€" }, opcoes: [],
    });
    const vazio: SeccaoEd[] = JSON.parse(JSON.stringify(base.seccoes));
    Object.assign(vazio[3].perguntas[1], { min: "", max: " ", casas: "", unidade: "" });
    expect((paraEnvio(vazio) as { perguntas: Record<string, unknown>[] }[])[3].perguntas[1]).toMatchObject({
      numero: { min: null, max: null, casas: null, unidade: null },
    });
  });

  it("os textos vão aparados, e um subtítulo só de espaços vai como null", () => {
    const base: SeccaoEd[] = JSON.parse(JSON.stringify(lido().seccoes));
    base[1].titulo = "  Exterior  ";
    base[1].perguntas[0].texto = " Acesso ";
    base[1].perguntas[0].bloco = "   ";
    base[1].perguntas[0].opcoes[0].texto = " Fácil ";
    const envio = paraEnvio(base) as { titulo: string; perguntas: { texto: string; bloco: unknown; opcoes: { texto: string }[] }[] }[];
    expect(envio[1].titulo).toBe("Exterior");
    expect(envio[1].perguntas[0]).toMatchObject({ texto: "Acesso", bloco: null });
    expect(envio[1].perguntas[0].opcoes[0].texto).toBe("Fácil");
  });

  it("uma pergunta de texto ou de número nunca leva opções, mesmo que o rascunho as tenha guardado da escolha anterior", () => {
    const base: SeccaoEd[] = JSON.parse(JSON.stringify(lido().seccoes));
    base[1].perguntas[0].tipo = "texto";
    const acesso = (paraEnvio(base) as { perguntas: Record<string, unknown>[] }[])[1].perguntas[0];
    expect(acesso.opcoes).toEqual([]);
    expect(acesso).toHaveProperty("texto_max", null);
    expect(acesso).not.toHaveProperty("numero");
  });

  it("itens novos vão com ref (nunca com id), e a condição para um item novo aponta para a ref dele", () => {
    const p1 = criarPergunta("escolha_unica");
    const p2 = criarPergunta("escolha_unica");
    p1.texto = "Piso"; p1.opcoes.forEach((o, i) => { o.texto = `Op${i}`; });
    p2.texto = "Qual piso";
    p2.opcoes.forEach((o, i) => { o.texto = `Q${i}`; });
    p2.depende = { pergunta: p1.k, opcoes: [p1.opcoes[0].k], semResposta: true };
    const s = criarSeccao();
    s.titulo = "Nova";
    s.perguntas = [p1, p2];
    const envio = paraEnvio([s]) as { id?: string; ref: string; perguntas: { id?: string; ref: string; depende?: { pergunta: string; opcoes: string[] }; opcoes: { ref: string }[] }[] }[];
    expect(envio[0].id).toBeUndefined();
    expect(envio[0].ref).toMatch(REF);
    expect(envio[0].perguntas[0].id).toBeUndefined();
    expect(envio[0].perguntas[1].depende).toEqual({ pergunta: envio[0].perguntas[0].ref, opcoes: [envio[0].perguntas[0].opcoes[0].ref], sem_resposta: true });
    const refs = [envio[0].ref, ...envio[0].perguntas.flatMap((p) => [p.ref, ...p.opcoes.map((o) => o.ref)])];
    expect(new Set(refs).size).toBe(refs.length);
    for (const r of refs) expect(r).toMatch(REF);
    expect(r_naoUuid(refs)).toBe(true);
  });
});

const r_naoUuid = (refs: string[]): boolean => refs.every((r) => !/^[0-9a-f]{8}-/.test(r));

describe("criadores", () => {
  it("cada criador dá uma chave interna nova e id null", () => {
    const k = [criarSeccao().k, criarSeccao().k, criarPergunta().k, criarOpcao().k];
    expect(new Set(k).size).toBe(4);
    for (const x of [criarSeccao(), criarPergunta(), criarOpcao()]) expect(x.id).toBeNull();
  });

  it("uma secção nova é da aba visita, sem especial, ativa e sem perguntas", () => {
    expect(criarSeccao()).toMatchObject({ aba: "visita", especial: null, activa: true, perguntas: [], titulo: "" });
  });

  it("uma pergunta nova de escolha traz duas opções vazias (o mínimo que a base aceita); de texto ou número, nenhuma", () => {
    expect(criarPergunta("escolha_unica").opcoes).toHaveLength(2);
    expect(criarPergunta("escolha_multipla").opcoes).toHaveLength(2);
    expect(criarPergunta("texto").opcoes).toHaveLength(0);
    expect(criarPergunta("numero").opcoes).toHaveLength(0);
    expect(criarPergunta().tipo).toBe("escolha_unica");
  });
});

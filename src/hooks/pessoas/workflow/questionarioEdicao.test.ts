// As operações do editor do levantamento (funções puras, sempre devolvem cópias) e a validação local, que espelha os limites da base
// (migration 20261226090000) para o utilizador ver o erro ao lado do campo e não só depois de um pedido recusado.
import { describe, expect, it } from "vitest";
import { criarOpcao, criarPergunta, criarSeccao, lerQuestionario, type SeccaoEd } from "./questionario";
import {
  adicionarOpcao, adicionarPergunta, adicionarSeccao, alterarOpcao, alterarPergunta, alterarSeccao, alvosPossiveis, dependentesDe,
  itensApagados, limparCondicoes, moverItem, moverOpcao, moverPergunta, moverSeccao, removerOpcao, removerPergunta, removerSeccao, validar,
} from "./questionarioEdicao";
import { QUESTIONARIO_BRUTO, uuid } from "./questionarioTestUtil";

const base = (): SeccaoEd[] => JSON.parse(JSON.stringify(lerQuestionario(QUESTIONARIO_BRUTO)!.seccoes));
const pergunta = (s: SeccaoEd[], k: string) => s.flatMap((x) => x.perguntas).find((p) => p.k === k)!;
const codigos = (s: SeccaoEd[]) => validar(s).map((p) => p.codigo);

describe("moverItem", () => {
  it("troca de posição sem alterar a lista original", () => {
    const l = ["a", "b", "c"];
    expect(moverItem(l, 0, 2)).toEqual(["b", "c", "a"]);
    expect(moverItem(l, 2, 1)).toEqual(["a", "c", "b"]);
    expect(l).toEqual(["a", "b", "c"]);
  });
  it("fora dos limites devolve a mesma lista", () => {
    const l = ["a", "b"];
    expect(moverItem(l, 0, -1)).toBe(l);
    expect(moverItem(l, 1, 2)).toBe(l);
    expect(moverItem(l, 1, 1)).toBe(l);
  });
});

describe("secções", () => {
  it("moverSeccao reordena, também as especiais (Visitas e Medidas só se reordenam)", () => {
    const s = base();
    expect(moverSeccao(s, uuid(1), 1).map((x) => x.titulo)).toEqual(["Exterior do edifício", "Visitas", "Medidas da área", "Qualificação"]);
    expect(moverSeccao(s, uuid(3), -1).map((x) => x.titulo)).toEqual(["Visitas", "Medidas da área", "Exterior do edifício", "Qualificação"]);
    expect(moverSeccao(s, uuid(1), -1)).toBe(s);
    expect(moverSeccao(s, uuid(4), 1)).toBe(s);
    expect(s.map((x) => x.titulo)[0]).toBe("Visitas");
  });

  it("adicionarSeccao põe-na no fim; alterarSeccao muda só essa; removerSeccao tira uma normal", () => {
    const s = base();
    const nova = criarSeccao();
    const com = adicionarSeccao(s, nova);
    expect(com).toHaveLength(5);
    expect(com[4]).toBe(nova);
    expect(alterarSeccao(com, nova.k, { titulo: "X" })[4].titulo).toBe("X");
    expect(alterarSeccao(com, nova.k, { titulo: "X" })[1]).toBe(com[1]);
    expect(removerSeccao(com, nova.k)).toHaveLength(4);
  });

  it("Visitas, Medidas e Qualificação não se apagam: removerSeccao ignora-as", () => {
    const s = base();
    for (const id of [uuid(1), uuid(3), uuid(4)]) expect(removerSeccao(s, id)).toBe(s);
  });

  it("uma secção especial não muda de título, nem se desativa: alterarSeccao ignora esses campos", () => {
    const s = base();
    const depois = alterarSeccao(s, uuid(1), { titulo: "Outro", activa: false });
    expect(depois[0].titulo).toBe("Visitas");
    expect(depois[0].activa).toBe(true);
  });

  it("a Qualificação pode mudar de nome", () => {
    expect(alterarSeccao(base(), uuid(4), { titulo: "Perfil" })[3].titulo).toBe("Perfil");
  });

  it("apagar uma secção tira as condições que dependiam das perguntas dela", () => {
    const s = base();
    const nova = criarSeccao();
    const p = criarPergunta("texto");
    p.depende = { pergunta: uuid(10), opcoes: [uuid(101)], semResposta: false };
    const com = adicionarPergunta(adicionarSeccao(s, nova), nova.k, p);
    expect(pergunta(com, p.k).depende).not.toBeNull();
    const sem = removerSeccao(com, uuid(2));
    expect(pergunta(sem, p.k).depende).toBeNull();
  });
});

describe("perguntas", () => {
  it("adicionarPergunta põe no fim da secção; moverPergunta reordena dentro da secção e ignora os limites", () => {
    const s = base();
    const p = criarPergunta("texto");
    const com = adicionarPergunta(s, uuid(2), p);
    expect(com[1].perguntas.map((x) => x.k)).toEqual([uuid(10), uuid(11), uuid(12), p.k]);
    expect(moverPergunta(com, p.k, -1)[1].perguntas.map((x) => x.k)).toEqual([uuid(10), uuid(11), p.k, uuid(12)]);
    expect(moverPergunta(com, uuid(10), -1)).toBe(com);
    expect(moverPergunta(com, p.k, 1)).toBe(com);
  });

  it("uma secção especial não aceita perguntas", () => {
    const s = base();
    expect(adicionarPergunta(s, uuid(1), criarPergunta())).toBe(s);
    expect(adicionarPergunta(s, uuid(3), criarPergunta())).toBe(s);
  });

  it("removerPergunta tira a pergunta e as condições que a tinham como alvo", () => {
    const s = removerPergunta(base(), uuid(10));
    expect(pergunta(s, uuid(11)).depende).toBeNull();
    expect(s[1].perguntas.map((x) => x.k)).toEqual([uuid(11), uuid(12)]);
  });

  it("alterarPergunta muda só essa, sem tocar na original", () => {
    const s = base();
    const depois = alterarPergunta(s, uuid(12), { texto: "Novo texto" });
    expect(pergunta(depois, uuid(12)).texto).toBe("Novo texto");
    expect(pergunta(s, uuid(12)).texto).toBe("Notas sobre o exterior");
    expect(depois[1].perguntas[0]).toBe(s[1].perguntas[0]);
  });

  it("mudar o tipo do alvo para texto tira a condição de quem dependia dele", () => {
    const depois = alterarPergunta(base(), uuid(10), { tipo: "texto" });
    expect(pergunta(depois, uuid(11)).depende).toBeNull();
  });

  it("mudar de única para múltipla mantém a condição (continua a ser escolha) e as opções", () => {
    const depois = alterarPergunta(base(), uuid(10), { tipo: "escolha_multipla" });
    expect(pergunta(depois, uuid(11)).depende).not.toBeNull();
    expect(pergunta(depois, uuid(10)).opcoes).toHaveLength(2);
  });

  it("alvosPossiveis: só perguntas de escolha, que não são ela, e que não têm condição própria", () => {
    const s = base();
    expect(alvosPossiveis(s, uuid(12)).map((p) => p.k)).toEqual([uuid(10), uuid(20)]);
    expect(alvosPossiveis(s, uuid(10)).map((p) => p.k)).toEqual([uuid(20)]);
    expect(alvosPossiveis(s, uuid(11)).map((p) => p.k)).toEqual([uuid(10), uuid(20)]);
  });

  it("dependentesDe lista quem usa a pergunta como condição", () => {
    expect(dependentesDe(base(), uuid(10)).map((p) => p.k)).toEqual([uuid(11)]);
    expect(dependentesDe(base(), uuid(12))).toEqual([]);
  });

  it("limparCondicoes tira a condição de uma pergunta que ela própria é alvo de outra (um só nível) e repara opções em falta", () => {
    const s = base();
    const alterada = alterarPergunta(s, uuid(10), { depende: { pergunta: uuid(20), opcoes: [uuid(200)], semResposta: false } });
    // 10 passou a depender de 20 e 11 depende de 10: 11 já não pode, porque 10 deixou de ser um alvo válido.
    expect(pergunta(alterada, uuid(11)).depende).toBeNull();
    expect(pergunta(alterada, uuid(10)).depende).not.toBeNull();
    const semOpcao = base();
    semOpcao[1].perguntas[1].depende = { pergunta: uuid(10), opcoes: [uuid(101), "ref-que-nao-existe"], semResposta: false };
    expect(pergunta(limparCondicoes(semOpcao), uuid(11)).depende?.opcoes).toEqual([uuid(101)]);
  });
});

describe("opções", () => {
  it("adicionarOpcao põe no fim; moverOpcao reordena; alterarOpcao muda texto e ativa", () => {
    const s = base();
    const o = criarOpcao();
    const com = adicionarOpcao(s, uuid(10), o);
    expect(pergunta(com, uuid(10)).opcoes.map((x) => x.k)).toEqual([uuid(100), uuid(101), o.k]);
    expect(pergunta(moverOpcao(com, uuid(10), o.k, -1), uuid(10)).opcoes.map((x) => x.k)).toEqual([uuid(100), o.k, uuid(101)]);
    expect(moverOpcao(com, uuid(10), uuid(100), -1)).toBe(com);
    const mud = alterarOpcao(com, uuid(10), o.k, { texto: "Talvez", activa: false });
    expect(pergunta(mud, uuid(10)).opcoes[2]).toMatchObject({ texto: "Talvez", activa: false });
  });

  it("removerOpcao tira-a das condições; se a condição ficar sem opções, deixa de existir", () => {
    const s = removerOpcao(base(), uuid(10), uuid(101));
    expect(pergunta(s, uuid(10)).opcoes.map((o) => o.k)).toEqual([uuid(100)]);
    expect(pergunta(s, uuid(11)).depende).toBeNull();
    const dois = base();
    dois[1].perguntas[1].depende = { pergunta: uuid(10), opcoes: [uuid(100), uuid(101)], semResposta: false };
    expect(pergunta(removerOpcao(dois, uuid(10), uuid(101)), uuid(11)).depende?.opcoes).toEqual([uuid(100)]);
  });
});

describe("validar", () => {
  it("o questionário lido da base é válido", () => {
    expect(validar(base())).toEqual([]);
  });

  it("título da secção vazio ou só espaços, ou com mais de 80", () => {
    const s = base();
    expect(codigos(alterarSeccao(s, uuid(2), { titulo: "   " }))).toEqual(["tituloSeccao"]);
    expect(codigos(alterarSeccao(s, uuid(2), { titulo: "x".repeat(81) }))).toEqual(["tituloSeccao"]);
    expect(codigos(alterarSeccao(s, uuid(2), { titulo: "x".repeat(80) }))).toEqual([]);
  });

  it("texto da pergunta vazio ou com mais de 200; subtítulo com mais de 80", () => {
    const s = base();
    expect(codigos(alterarPergunta(s, uuid(12), { texto: "" }))).toEqual(["textoPergunta"]);
    expect(codigos(alterarPergunta(s, uuid(12), { texto: "x".repeat(201) }))).toEqual(["textoPergunta"]);
    expect(codigos(alterarPergunta(s, uuid(12), { texto: "x".repeat(200) }))).toEqual([]);
    expect(codigos(alterarPergunta(s, uuid(12), { bloco: "x".repeat(81) }))).toEqual(["blocoLongo"]);
  });

  it("caracteres de controlo (quebra de linha, tabulação) são recusados como a base os recusa", () => {
    expect(codigos(alterarPergunta(base(), uuid(12), { texto: "a\nb" }))).toEqual(["caracteresControlo"]);
    expect(codigos(alterarSeccao(base(), uuid(2), { titulo: "a\tb" }))).toEqual(["caracteresControlo"]);
  });

  it("a Pergunta aponta o item com problema (k) para o ecrã o assinalar", () => {
    expect(validar(alterarPergunta(base(), uuid(12), { texto: "" }))[0]).toMatchObject({ codigo: "textoPergunta", k: uuid(12) });
  });

  it("escolha com menos de 2 ou mais de 30 opções", () => {
    const s = base();
    expect(codigos(removerOpcao(s, uuid(10), uuid(100)))).toContain("poucasOpcoes");
    const a = criarPergunta("escolha_unica");
    a.texto = "Nova";
    a.opcoes.forEach((o, i) => { o.texto = `o${i}`; });
    const com = adicionarPergunta(s, uuid(2), a);
    expect(codigos(com)).toEqual([]);
    let cheia = com;
    for (let i = 0; i < 28; i += 1) cheia = adicionarOpcao(cheia, a.k, Object.assign(criarOpcao(), { texto: `x${i}` }));
    expect(pergunta(cheia, a.k).opcoes).toHaveLength(30);
    expect(codigos(cheia)).toEqual([]);
    const forcada = adicionarOpcao(cheia, a.k, Object.assign(criarOpcao(), { texto: "31" }));
    expect(codigos(forcada)).toContain("muitasOpcoes");
  });

  it("desativar uma opção não conta como tirá-la: a base ainda conta as desativadas", () => {
    expect(codigos(alterarOpcao(base(), uuid(10), uuid(100), { activa: false }))).toEqual([]);
  });

  it("opção sem texto ou com mais de 80 caracteres", () => {
    const s = base();
    expect(codigos(alterarOpcao(s, uuid(10), uuid(100), { texto: " " }))).toEqual(["textoOpcao"]);
    expect(codigos(alterarOpcao(s, uuid(10), uuid(100), { texto: "x".repeat(81) }))).toEqual(["textoOpcao"]);
  });

  it("número: mínimo não pode passar o máximo, valores têm de ser números com até 3 decimais, casas inteiras de 0 a 3, unidade até 12", () => {
    const s = base();
    const ok = (patch: object) => codigos(alterarPergunta(s, uuid(21), patch));
    expect(ok({ min: "10", max: "5" })).toEqual(["limitesNumero"]);
    expect(ok({ min: "abc" })).toEqual(["limitesNumero"]);
    expect(ok({ max: "1.2345" })).toEqual(["limitesNumero"]);
    expect(ok({ max: "100000000000" })).toEqual(["limitesNumero"]);
    expect(ok({ min: "-5", max: "5", casas: "0" })).toEqual([]);
    expect(ok({ min: "", max: "" })).toEqual([]);
    expect(ok({ casas: "4" })).toEqual(["casasNumero"]);
    expect(ok({ casas: "-1" })).toEqual(["casasNumero"]);
    expect(ok({ casas: "1.5" })).toEqual(["casasNumero"]);
    expect(ok({ unidade: "x".repeat(13) })).toEqual(["unidadeLonga"]);
    expect(ok({ unidade: "x".repeat(12) })).toEqual([]);
  });

  it("texto máximo: inteiro de 1 a 2000, ou vazio", () => {
    const s = base();
    const ok = (v: string) => codigos(alterarPergunta(s, uuid(12), { textoMax: v }));
    expect(ok("")).toEqual([]);
    expect(ok("1")).toEqual([]);
    expect(ok("2000")).toEqual([]);
    expect(ok("0")).toEqual(["textoMaxInvalido"]);
    expect(ok("2001")).toEqual(["textoMaxInvalido"]);
    expect(ok("12.5")).toEqual(["textoMaxInvalido"]);
    expect(ok("abc")).toEqual(["textoMaxInvalido"]);
  });

  it("os campos de outro tipo não contam: o número de uma pergunta de escolha não é validado", () => {
    expect(codigos(alterarPergunta(base(), uuid(10), { min: "abc", casas: "9", textoMax: "0" }))).toEqual([]);
  });

  it("condição para uma pergunta que não é alvo válido, ou sem opções", () => {
    const s = base();
    const p = (depende: object) => { const c = base(); c[1].perguntas[2].depende = depende as never; return c; };
    expect(codigos(p({ pergunta: uuid(12), opcoes: [], semResposta: false }))).toContain("condicaoInvalida");
    expect(codigos(p({ pergunta: uuid(11), opcoes: [uuid(110)], semResposta: false }))).toContain("condicaoInvalida");
    expect(codigos(p({ pergunta: uuid(10), opcoes: [uuid(110)], semResposta: false }))).toContain("condicaoInvalida");
    expect(codigos(p({ pergunta: uuid(10), opcoes: [uuid(100)], semResposta: true }))).toEqual([]);
    expect(codigos(s)).toEqual([]);
  });

  it("até 20 secções e 150 perguntas", () => {
    let s = base();
    while (s.length < 20) s = adicionarSeccao(s, Object.assign(criarSeccao(), { titulo: `S${s.length}` }));
    expect(codigos(s)).toEqual([]);
    expect(codigos(adicionarSeccao(s, Object.assign(criarSeccao(), { titulo: "S21" })))).toEqual(["demasiadasSeccoes"]);
    let p = base();
    for (let i = 0; p.flatMap((x) => x.perguntas).length < 151; i += 1) {
      p = adicionarPergunta(p, uuid(2), Object.assign(criarPergunta("texto"), { texto: `P${i}` }));
    }
    expect(codigos(p)).toEqual(["demasiadasPerguntas"]);
  });
});

describe("itensApagados (o que o rascunho tem e a base, relida, já não tem)", () => {
  const relido = (mexer: (c: { versao: number; seccoes: { id: string; perguntas: { id: string; opcoes: { id: string }[] }[] }[] }) => void) => {
    const c = JSON.parse(JSON.stringify(QUESTIONARIO_BRUTO));
    mexer(c);
    return lerQuestionario(c)!;
  };

  it("sem diferenças, não há nada", () => {
    expect(itensApagados(base(), lerQuestionario(QUESTIONARIO_BRUTO)!)).toEqual([]);
  });

  it("uma pergunta e uma opção apagadas, com o nome (e a pergunta, no caso da opção)", () => {
    const novo = relido((c) => {
      c.seccoes[1].perguntas = c.seccoes[1].perguntas.filter((p) => p.id !== uuid(12));
      c.seccoes[3].perguntas[0].opcoes = c.seccoes[3].perguntas[0].opcoes.filter((o) => o.id !== uuid(201));
    });
    expect(itensApagados(base(), novo)).toEqual([
      { tipo: "pergunta", nome: "Notas sobre o exterior" },
      { tipo: "opcao", nome: "Moradia", pergunta: "Tipo de imóvel" },
    ]);
  });

  it("uma secção apagada conta uma só vez: as perguntas e opções dela não se repetem", () => {
    const novo = relido((c) => { c.seccoes = c.seccoes.filter((s) => s.id !== uuid(2)); });
    expect(itensApagados(base(), novo)).toEqual([{ tipo: "seccao", nome: "Exterior do edifício" }]);
  });

  it("uma pergunta apagada conta uma só vez: as opções dela não se repetem", () => {
    const novo = relido((c) => { c.seccoes[1].perguntas = c.seccoes[1].perguntas.filter((p) => p.id !== uuid(10)); });
    expect(itensApagados(base(), novo)).toEqual([{ tipo: "pergunta", nome: "Acesso" }]);
  });

  it("o que só existe no rascunho (novo, sem id) não conta como apagado", () => {
    const s = adicionarSeccao(base(), Object.assign(criarSeccao(), { titulo: "Nova" }));
    expect(itensApagados(s, lerQuestionario(QUESTIONARIO_BRUTO)!)).toEqual([]);
  });

  it("não altera o que recebe", () => {
    const s = base();
    const antes = JSON.stringify(s);
    itensApagados(s, relido((c) => { c.seccoes = c.seccoes.slice(0, 1); }));
    expect(JSON.stringify(s)).toBe(antes);
  });
});

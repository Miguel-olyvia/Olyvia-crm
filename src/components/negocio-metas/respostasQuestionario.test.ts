// Das respostas do formulário para a base (o formato novo de p_respostas), a validação de texto e número antes de gravar, e a leitura das
// respostas já gravadas com o snapshot (D5: o texto que a pessoa viu, não o atual). Só lógica pura.
import { describe, expect, it } from "vitest";
import { copiarBruto, QUESTIONARIO_BRUTO } from "@/hooks/pessoas/workflow/questionarioTestUtil";
import { lerQuestionarioForm, todasAsPerguntas } from "./questionarioForm";
import {
  aplicarGravadas, respostasDeGravadas, respostasParaBase, validarRespostas, type RespostaGravada,
} from "./respostasQuestionario";

const q = () => lerQuestionarioForm(QUESTIONARIO_BRUTO)!;

describe("respostasParaBase (o formato novo: refs e escolhas)", () => {
  it("cada tipo vai no seu formato, com a chave da pergunta e as chaves das opções", () => {
    expect(respostasParaBase(q(), { acesso: "dificil", imovel: "moradia,apartamento", notas: "  portão partido ", orcCliente: "12,5" })).toEqual({
      acesso: { escolhas: ["dificil"] },
      imovel: { escolhas: ["apartamento", "moradia"] },
      notas: { texto: "portão partido" },
      orcCliente: { numero: 12.5 },
    });
  });

  it("não manda a secção nem a chave `resposta` do formato antigo", () => {
    const saida = respostasParaBase(q(), { acesso: "facil" });
    expect(JSON.stringify(saida)).not.toMatch(/seccao|resposta/);
  });

  it("não manda o que está por responder, vazio, ou que já não se vê (a condição só se impõe no ecrã)", () => {
    // «impactoPreco» só aparece com acesso difícil: a resposta que sobrou escondida não segue.
    expect(respostasParaBase(q(), { acesso: "facil", impactoPreco: "p5", notas: "   ", orcCliente: "" })).toEqual({ acesso: { escolhas: ["facil"] } });
  });

  it("uma chave que já não é opção da pergunta, e um número que não é número, não seguem", () => {
    expect(respostasParaBase(q(), { acesso: "naoExiste", orcCliente: "abc" })).toEqual({});
  });

  it("uma pergunta que o questionário não conhece não segue", () => {
    expect(respostasParaBase(q(), { fantasma: "a" })).toEqual({});
  });

  it("sem respostas, objeto vazio (a base apaga o que deixou de vir)", () => {
    expect(respostasParaBase(q(), {})).toEqual({});
  });
});

describe("validarRespostas", () => {
  it("número fora dos limites, com mais casas do que as permitidas, ou que não é número", () => {
    expect(validarRespostas(q(), { orcCliente: "100000.01" })).toEqual({ orcCliente: "fora" });
    expect(validarRespostas(q(), { orcCliente: "-1" })).toEqual({ orcCliente: "fora" });
    expect(validarRespostas(q(), { orcCliente: "1,234" })).toEqual({ orcCliente: "casas" });
    expect(validarRespostas(q(), { orcCliente: "abc" })).toEqual({ orcCliente: "invalido" });
    expect(validarRespostas(q(), { orcCliente: "1e3" })).toEqual({ orcCliente: "invalido" });
  });

  it("fronteiras certas: o mínimo, o máximo e as casas permitidas passam", () => {
    expect(validarRespostas(q(), { orcCliente: "0" })).toEqual({});
    expect(validarRespostas(q(), { orcCliente: "100000" })).toEqual({});
    expect(validarRespostas(q(), { orcCliente: "99999,99" })).toEqual({});
    expect(validarRespostas(q(), { orcCliente: " 7 " })).toEqual({});
  });

  it("sem limites a pergunta de número aceita até 3 casas e o máximo da base", () => {
    const bruto = copiarBruto();
    (bruto.seccoes[3].perguntas[1] as { numero: unknown }).numero = { min: null, max: null, casas: null, unidade: null };
    const livre = lerQuestionarioForm(bruto)!;
    expect(validarRespostas(livre, { orcCliente: "-5,125" })).toEqual({});
    expect(validarRespostas(livre, { orcCliente: "1,2345" })).toEqual({ orcCliente: "casas" });
    expect(validarRespostas(livre, { orcCliente: "100000000000" })).toEqual({ orcCliente: "fora" });
  });

  it("texto acima do máximo da pergunta", () => {
    const bruto = copiarBruto();
    (bruto.seccoes[1].perguntas[2] as { texto_max: number }).texto_max = 5;
    const curto = lerQuestionarioForm(bruto)!;
    expect(validarRespostas(curto, { notas: "123456" })).toEqual({ notas: "comprido" });
    expect(validarRespostas(curto, { notas: " 12345 " })).toEqual({});
  });

  it("só valida o que se vê: a resposta escondida não bloqueia a gravação", () => {
    expect(validarRespostas(q(), { acesso: "facil", impactoPreco: "p5" })).toEqual({});
  });
});

const gravada = (extra: Partial<RespostaGravada>): RespostaGravada => ({
  seccao: "exterior", pergunta: "acesso", tipo: "escolha_unica", resposta: "facil", perguntaTexto: "Acesso (texto de então)", seccaoTitulo: "Exterior (de então)",
  bloco: null, ordem: 1000, escolhas: ["facil"], escolhasTexto: ["Fácil (de então)"], valorTexto: null, valorNumero: null, ...extra,
});

describe("respostasDeGravadas", () => {
  it("passa cada tipo ao texto do formulário", () => {
    expect(respostasDeGravadas([
      gravada({}),
      gravada({ pergunta: "imovel", tipo: "escolha_multipla", resposta: null, escolhas: ["moradia", "apartamento"], escolhasTexto: ["M", "A"] }),
      gravada({ pergunta: "notas", tipo: "texto", resposta: null, escolhas: null, escolhasTexto: null, valorTexto: "texto" }),
      gravada({ pergunta: "orcCliente", tipo: "numero", resposta: null, escolhas: null, escolhasTexto: null, valorNumero: 12.5 }),
    ])).toEqual({ acesso: "facil", imovel: "moradia,apartamento", notas: "texto", orcCliente: "12.5" });
  });

  it("a resposta antiga, sem snapshot, é uma escolha única pela chave", () => {
    const antiga = gravada({ tipo: null, perguntaTexto: null, seccaoTitulo: null, escolhas: null, escolhasTexto: null, ordem: null });
    expect(respostasDeGravadas([antiga])).toEqual({ acesso: "facil" });
  });

  it("sem respostas, vazio", () => expect(respostasDeGravadas([])).toEqual({}));
});

describe("aplicarGravadas: o texto gravado, não o atual (D5)", () => {
  it("a pergunta e a opção respondidas mostram o texto de quando se respondeu; as outras opções ficam como estão", () => {
    const novo = aplicarGravadas(q(), [gravada({})]);
    const acesso = todasAsPerguntas(novo.seccoes).find((p) => p.id === "acesso")!;
    expect(acesso.rotulo[0]).toBe("Acesso (texto de então)");
    expect(acesso.opcoes.find((o) => o[0] === "facil")?.[1]).toBe("Fácil (de então)");
    expect(acesso.opcoes.find((o) => o[0] === "dificil")?.[1]).toBe("Difícil");
  });

  it("não altera o questionário recebido", () => {
    const original = q();
    const antes = JSON.stringify(original);
    aplicarGravadas(original, [gravada({})]);
    expect(JSON.stringify(original)).toBe(antes);
  });

  it("uma opção que deixou de existir mas foi escolhida continua visível e escolhida", () => {
    const novo = aplicarGravadas(q(), [gravada({ resposta: "antiga", escolhas: ["antiga"], escolhasTexto: ["Opção de outros tempos"] })]);
    const acesso = todasAsPerguntas(novo.seccoes).find((p) => p.id === "acesso")!;
    expect(acesso.opcoes.map((o) => o[0])).toEqual(["facil", "dificil", "antiga"]);
    expect(acesso.opcoes[2][1]).toBe("Opção de outros tempos");
    expect(perguntaTemOpcao(novo, "acesso", "antiga")).toBe(true);
  });

  it("uma pergunta desativada ou apagada reaparece na sua secção com o texto gravado, e com as opções escolhidas", () => {
    const novo = aplicarGravadas(q(), [gravada({
      pergunta: "tempoPerdido", tipo: "escolha_multipla", resposta: null, perguntaTexto: "Pergunta que já não existe", escolhas: ["x", "y"], escolhasTexto: ["Xis", "Ipsilon"],
    })]);
    const exterior = novo.seccoes.find((s) => s.id === "exterior")!;
    const extra = exterior.blocos.flatMap((b) => b.perguntas).find((p) => p.id === "tempoPerdido")!;
    expect(extra).toMatchObject({ tipo: "escolha_multipla", literal: true });
    expect(extra.rotulo[0]).toBe("Pergunta que já não existe");
    expect(extra.opcoes.map((o) => [o[0], o[1]])).toEqual([["x", "Xis"], ["y", "Ipsilon"]]);
  });

  it("texto e número gravados de uma pergunta que já não existe voltam com o seu tipo", () => {
    const novo = aplicarGravadas(q(), [
      gravada({ pergunta: "obs", tipo: "texto", resposta: null, perguntaTexto: "Observação", escolhas: null, escolhasTexto: null, valorTexto: "olá" }),
      gravada({ pergunta: "area", tipo: "numero", resposta: null, perguntaTexto: "Área", escolhas: null, escolhasTexto: null, valorNumero: 4 }),
    ]);
    const todas = todasAsPerguntas(novo.seccoes);
    expect(todas.find((p) => p.id === "obs")).toMatchObject({ tipo: "texto" });
    expect(todas.find((p) => p.id === "area")).toMatchObject({ tipo: "numero" });
  });

  it("uma secção que já não existe reaparece à parte, com o título gravado, ou com a chave se não houver snapshot", () => {
    const novo = aplicarGravadas(q(), [
      gravada({ seccao: "extinta", seccaoTitulo: "Secção extinta", pergunta: "p1", perguntaTexto: "P1" }),
      gravada({ seccao: "velha", seccaoTitulo: null, pergunta: "p2", perguntaTexto: null, tipo: null, escolhas: null, escolhasTexto: null, resposta: "k" }),
    ]);
    const extinta = novo.seccoes.find((s) => s.id === "extinta")!;
    expect(extinta.titulo[0]).toBe("Secção extinta");
    expect(extinta.literal).toBe(true);
    expect(novo.seccoes.find((s) => s.id === "velha")?.titulo[0]).toBe("velha");
    // Sem snapshot da pergunta, vê-se a chave crua (nunca se esconde uma resposta); a opção responde pela sua chave.
    const p2 = todasAsPerguntas(novo.seccoes).find((p) => p.id === "p2")!;
    expect(p2.rotulo[0]).toBe("p2");
    expect(p2.opcoes).toEqual([["k", "k", "k"]]);
  });

  it("uma resposta antiga (sem snapshot) a uma pergunta que existe fica com o texto atual", () => {
    const antiga = gravada({ tipo: null, perguntaTexto: null, seccaoTitulo: null, escolhas: null, escolhasTexto: null, ordem: null });
    const acesso = todasAsPerguntas(aplicarGravadas(q(), [antiga]).seccoes).find((p) => p.id === "acesso")!;
    expect(acesso.rotulo[0]).toBe("Acesso");
    expect(acesso.opcoes.find((o) => o[0] === "facil")?.[1]).toBe("Fácil");
  });

  it("sem respostas gravadas devolve o mesmo questionário", () => {
    const original = q();
    expect(aplicarGravadas(original, [])).toEqual(original);
  });

  it("depois de aplicar, as respostas gravadas contam como respondidas e seguem para a base", () => {
    const gravadas = [gravada({ resposta: "antiga", escolhas: ["antiga"], escolhasTexto: ["Opção de outros tempos"] })];
    const novo = aplicarGravadas(q(), gravadas);
    expect(respostasParaBase(novo, respostasDeGravadas(gravadas))).toEqual({ acesso: { escolhas: ["antiga"] } });
  });
});

function perguntaTemOpcao(qf: ReturnType<typeof q>, pergunta: string, opcao: string): boolean {
  return todasAsPerguntas(qf.seccoes).find((p) => p.id === pergunta)!.opcoes.some((o) => o[0] === opcao);
}

// 17/11 (gravação do Rúben: «não preenche campos ou ajusta, nada»): a Olyvia preenche as perguntas que estão no ecrã pela frase dita.
import { afterEach, describe, expect, it } from "vitest";
import { chavesDoRotulo, lerCampos, numeroDito, planoPreencher, preencherPelaFrase, type CampoEcra } from "./preencherOlyvia";

const op = (rotulo: string, ...ops: string[]): CampoEcra => ({ rotulo, tipo: "opcoes", opcoes: ops.map((texto) => ({ texto, ligado: false })) });
// o passo «Exterior do edifício» da Visita, como se vê no ecrã (gravação de 17/11)
const EXTERIOR: CampoEcra[] = [
  op("Acesso", "Fácil", "Difícil"),
  op("Estacionamento", "Pago", "Não pago", "Sem estacionamento"),
  op("Contentor de entulho (opcional)", "Não", "Na via pública (licença)", "Em espaço privado"),
  op("Espaço para colocar o contentor de entulho (opcional)", "Sim", "Não"),
  op("Distância ao contentor (opcional)", "Até 10 m", "10 a 30 m", "Mais de 30 m"),
  op("Tem elevador", "Sim", "Não"),
  { rotulo: "Andares do prédio", tipo: "contador", valor: "—" },
  { rotulo: "Andar da fração", tipo: "contador", valor: "R/C" },
];
/** O plano em texto: «Acesso=Fácil», «Andares do prédio=4». */
const plano = (frase: string, campos = EXTERIOR) => planoPreencher(frase, campos).map((a) => {
  const c = campos[a.campo];
  return `${c.rotulo.replace(/ \(opcional\)/, "")}=${a.tipo === "opcao" ? c.opcoes![a.opcao].texto : a.tipo === "contador" ? a.n : a.texto}`;
});

describe("o plano: que resposta dar a cada pergunta", () => {
  it("a frase da gravação: «põe acesso fácil, estacionamento pago, contentor de entulho na via pública»", () => {
    expect(plano("põe acesso fácil, estacionamento pago, contentor de entulho na via pública")).toEqual([
      "Acesso=Fácil", "Estacionamento=Pago", "Contentor de entulho=Na via pública (licença)",
    ]);
  });
  it("sem verbo e por outra ordem; «não pago» não é «pago»; «sem estacionamento»", () => {
    expect(plano("estacionamento não pago e acesso difícil")).toEqual(["Estacionamento=Não pago", "Acesso=Difícil"]);
    expect(plano("sem estacionamento")).toEqual(["Estacionamento=Sem estacionamento"]);
  });
  it("sim e não: «tem elevador», «não tem elevador», «sem elevador», «elevador sim»", () => {
    expect(plano("tem elevador")).toEqual(["Tem elevador=Sim"]);
    expect(plano("não tem elevador")).toEqual(["Tem elevador=Não"]);
    expect(plano("sem elevador")).toEqual(["Tem elevador=Não"]);
    expect(plano("elevador sim")).toEqual(["Tem elevador=Sim"]);
  });
  it("contadores: «quatro andares», «andares do prédio 3», «andar da fração rés-do-chão»", () => {
    expect(plano("andares do prédio 3")).toEqual(["Andares do prédio=3"]);
    expect(plano("o prédio tem quatro andares")).toEqual(["Andares do prédio=4"]);
    expect(plano("andar da fração rés do chão")).toEqual(["Andar da fração=0"]);
  });
  it("distâncias em metros («até 10 metros») e respostas sem a pergunta, se só uma pergunta as tem («fácil»)", () => {
    expect(plano("distância ao contentor até 10 metros")).toEqual(["Distância ao contentor=Até 10 m"]);
    expect(plano("fácil")).toEqual(["Acesso=Fácil"]);
  });
  it("frases que não são respostas não fazem nada", () => {
    expect(plano("abre o Ruben Carvalho")).toEqual([]);
    expect(plano("bom dia")).toEqual([]);
  });
  it("texto: «morada é rua das flores 23»", () => {
    expect(plano("morada é rua das flores 23", [{ rotulo: "Morada", tipo: "texto", valor: "" }])).toEqual(["Morada=rua das flores 23"]);
  });
  it("as chaves de um rótulo e os números ditos", () => {
    expect(chavesDoRotulo("Tem elevador")).toEqual(["tem elevador", "elevador"]);
    expect(chavesDoRotulo("Andares do prédio")).toEqual(["andares do predio", "andares"]);
    expect(numeroDito("dois andares")).toBe(2);
    expect(numeroDito("12")).toBe(12);
  });
});

// o ecrã: perguntas como as desenha CamposFase.tsx (CampoSimples: role=group + aria-labelledby, aria-pressed, «Menos»/«Mais»)
function montarEcra() {
  document.body.innerHTML = `
    <div data-campo="acesso"><span id="r1">Acesso</span>
      <div role="group" aria-labelledby="r1"><button aria-pressed="false">Fácil</button><button aria-pressed="false">Difícil</button></div></div>
    <div data-campo="est"><span id="r2">Estacionamento</span>
      <div role="group" aria-labelledby="r2"><button aria-pressed="false">Pago</button><button aria-pressed="false">Não pago</button></div></div>
    <div data-campo="and"><span id="r3">Andares do prédio</span>
      <div role="group" aria-labelledby="r3"><button aria-label="Menos">-</button><output>—</output><button aria-label="Mais">+</button></div></div>
    <label for="fx-morada"><span id="fx-morada-rot">Morada</span></label><input id="fx-morada" />
    <div data-olyvia><div role="group" aria-label="Comando"><button aria-pressed="false">Acesso</button></div></div>`;
  const cliques: string[] = [];
  document.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    cliques.push(b.getAttribute("aria-label") || b.textContent || "");
    if (b.hasAttribute("aria-pressed")) b.setAttribute("aria-pressed", "true");
    const out = b.parentElement?.querySelector("output");
    if (out) { const v = out.textContent === "—" ? 0 : Number(out.textContent); out.textContent = String(b.getAttribute("aria-label") === "Mais" ? v + 1 : Math.max(0, v - 1)); }
  }));
  return cliques;
}
afterEach(() => { document.body.innerHTML = ""; });

describe("no ecrã", () => {
  it("lê as perguntas à vista (não as da própria Olyvia)", () => {
    montarEcra();
    expect(lerCampos().map((c) => `${c.rotulo}:${c.tipo}`)).toEqual(["Acesso:opcoes", "Estacionamento:opcoes", "Andares do prédio:contador", "Morada:texto"]);
  });
  it("carrega nos botões, conta até ao número e escreve na caixa", async () => {
    const cliques = montarEcra();
    const feito = await preencherPelaFrase("acesso fácil estacionamento não pago andares do prédio 3 morada é rua das flores");
    expect(cliques).toEqual(["Fácil", "Não pago", "Mais", "Mais", "Mais"]);
    expect(document.querySelector("output")!.textContent).toBe("3");
    expect((document.getElementById("fx-morada") as HTMLInputElement).value).toBe("rua das flores");
    expect(feito).toEqual(["Acesso: Fácil", "Estacionamento: Não pago", "Andares do prédio: 3", "Morada: rua das flores"]);
  });
});

// As perguntas do formulário do levantamento lidas da base: escolha única, escolha múltipla, texto e número, com o texto da organização
// (literal, não chave de tradução), a visibilidade condicional e o que vem do snapshot (D5). Tradução simulada com as de «Novo negócio».
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { QUESTIONARIO_BRUTO } from "@/hooks/pessoas/workflow/questionarioTestUtil";
import { BlocosPerguntas } from "./PerguntaEscolha";
import { lerQuestionarioForm, todosOsBlocos } from "./questionarioForm";
import { aplicarGravadas, validarRespostas, type RespostaGravada } from "./respostasQuestionario";
import { alternarResposta, mudarResposta } from "./respostasVisita";
import type { Respostas } from "./perguntasTipos";

vi.mock("@/hooks/useTranslation", async () => {
  const { negocioMetasTranslations } = await import("@/translations/negocioMetas");
  return {
    useTranslation: () => ({
      language: "pt",
      t: (key: string, params?: Record<string, string | number>) => {
        let texto = negocioMetasTranslations.pt[key] ?? key;
        Object.entries(params ?? {}).forEach(([k, v]) => { texto = texto.replace(`{${k}}`, String(v)); });
        return texto;
      },
    }),
  };
});

const questionario = () => lerQuestionarioForm(QUESTIONARIO_BRUTO)!;

/** O formulário mínimo: o estado das respostas e os blocos de todas as secções com perguntas. */
function Formulario({ q = questionario(), inicial = {}, aoMudar }: { q?: ReturnType<typeof questionario>; inicial?: Respostas; aoMudar?: (r: Respostas) => void }) {
  const [respostas, setRespostas] = useState<Respostas>(inicial);
  const blocos = todosOsBlocos(q);
  const atualizar = (r: Respostas) => { setRespostas(r); aoMudar?.(r); };
  return (
    <BlocosPerguntas
      blocos={blocos} respostas={respostas} erros={validarRespostas(q, respostas)}
      aoEscolher={(p, o) => atualizar(alternarResposta(blocos, respostas, p, o))}
      aoEscrever={(p, v) => atualizar(mudarResposta(blocos, respostas, p, v))}
    />
  );
}

describe("perguntas da base", () => {
  it("mostra o texto da organização (um só texto, sem passar pela tradução) nas perguntas, opções e subtítulos", () => {
    render(<Formulario />);
    expect(screen.getByRole("heading", { name: "Acesso e estacionamento" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Acesso" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Fácil" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Difícil" })).toBeInTheDocument();
  });

  it("escolha única: escolher e retirar", () => {
    render(<Formulario />);
    const facil = screen.getByRole("radio", { name: "Fácil" });
    fireEvent.click(facil);
    expect(facil).toHaveAttribute("aria-checked", "true");
    fireEvent.click(facil);
    expect(facil).toHaveAttribute("aria-checked", "false");
  });

  it("a pergunta condicionada só aparece com a opção pedida, e some (com a resposta) quando ela se retira", () => {
    const aoMudar = vi.fn();
    render(<Formulario aoMudar={aoMudar} />);
    expect(screen.queryByRole("radiogroup", { name: "Impacto no preço" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Difícil" }));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Impacto no preço" })).getByRole("radio", { name: "5%" }));
    expect(aoMudar).toHaveBeenLastCalledWith({ acesso: "dificil", impactoPreco: "p5" });
    fireEvent.click(screen.getByRole("radio", { name: "Fácil" }));
    expect(screen.queryByRole("radiogroup", { name: "Impacto no preço" })).not.toBeInTheDocument();
    expect(aoMudar).toHaveBeenLastCalledWith({ acesso: "facil" });
  });

  it("escolha múltipla: um grupo de caixas, cada opção liga e desliga sem tirar as outras", () => {
    const aoMudar = vi.fn();
    render(<Formulario aoMudar={aoMudar} />);
    const grupo = screen.getByRole("group", { name: "Tipo de imóvel" });
    const apartamento = within(grupo).getByRole("checkbox", { name: "Apartamento" });
    const moradia = within(grupo).getByRole("checkbox", { name: "Moradia" });
    fireEvent.click(moradia);
    fireEvent.click(apartamento);
    expect(apartamento).toHaveAttribute("aria-checked", "true");
    expect(moradia).toHaveAttribute("aria-checked", "true");
    expect(aoMudar).toHaveBeenLastCalledWith({ imovel: "apartamento,moradia" });
    fireEvent.click(moradia);
    expect(moradia).toHaveAttribute("aria-checked", "false");
    expect(apartamento).toHaveAttribute("aria-checked", "true");
  });

  it("escolha múltipla: o teclado liga e desliga (Espaço e Enter são o clique de um botão)", () => {
    render(<Formulario />);
    const apartamento = screen.getByRole("checkbox", { name: "Apartamento" });
    apartamento.focus();
    expect(apartamento.tagName).toBe("BUTTON");
    expect(apartamento).toHaveAttribute("type", "button");
  });

  it("texto: campo com o rótulo da pergunta, limite de caracteres da pergunta, e a resposta sobe ao escrever", () => {
    const aoMudar = vi.fn();
    render(<Formulario aoMudar={aoMudar} />);
    const campo = screen.getByRole("textbox", { name: "Notas sobre o exterior" });
    expect(campo).toHaveAttribute("maxlength", "2000");
    fireEvent.change(campo, { target: { value: "portão partido" } });
    expect(aoMudar).toHaveBeenLastCalledWith({ notas: "portão partido" });
    fireEvent.change(campo, { target: { value: "" } });
    expect(aoMudar).toHaveBeenLastCalledWith({});
  });

  it("número: campo com a unidade dita em texto, aceita vírgula decimal e avisa quando está fora dos limites", () => {
    render(<Formulario />);
    const campo = screen.getByRole("textbox", { name: /Orçamento do cliente/ });
    expect(campo).toHaveAttribute("inputmode", "decimal");
    expect(screen.getByText("€")).toBeInTheDocument();
    fireEvent.change(campo, { target: { value: "12,5" } });
    expect(campo).not.toHaveAttribute("aria-invalid");
    fireEvent.change(campo, { target: { value: "100001" } });
    expect(campo).toHaveAttribute("aria-invalid", "true");
    const erro = document.getElementById(campo.getAttribute("aria-describedby")!.split(" ").find((i) => i.endsWith("-erro"))!)!;
    expect(erro.textContent).toMatch(/0.*100\.?000/);
    fireEvent.change(campo, { target: { value: "1,234" } });
    expect(campo).toHaveAttribute("aria-invalid", "true");
  });

  it("sem aoEscrever, texto e número ficam só de leitura em vez de aceitarem o que se escreve e perderem-no", () => {
    const q = questionario();
    render(<BlocosPerguntas blocos={todosOsBlocos(q)} respostas={{ notas: "x" }} aoEscolher={() => {}} />);
    expect(screen.getByRole("textbox", { name: "Notas sobre o exterior" })).toHaveAttribute("readonly");
  });
});

const gravada = (extra: Partial<RespostaGravada>): RespostaGravada => ({
  seccao: "exterior", pergunta: "acesso", tipo: "escolha_unica", resposta: "facil", perguntaTexto: "Acesso de então", seccaoTitulo: "Exterior de então",
  bloco: null, ordem: 1000, escolhas: ["facil"], escolhasTexto: ["Fácil de então"], valorTexto: null, valorNumero: null, ...extra,
});

describe("respostas já gravadas (snapshot)", () => {
  it("mostra o texto gravado da pergunta e da opção, não o atual", () => {
    const q = aplicarGravadas(questionario(), [gravada({})]);
    render(<Formulario q={q} inicial={{ acesso: "facil" }} />);
    expect(screen.getByRole("radiogroup", { name: "Acesso de então" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Fácil de então" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByRole("radio", { name: "Fácil" })).not.toBeInTheDocument();
  });

  it("uma resposta a uma pergunta que entretanto foi desativada continua visível e escolhida (D5)", () => {
    const q = aplicarGravadas(questionario(), [gravada({
      pergunta: "velha", perguntaTexto: "Pergunta desativada", escolhas: ["x", "y"], escolhasTexto: ["Xis", "Ipsilon"], tipo: "escolha_multipla", resposta: null,
    })]);
    render(<Formulario q={q} inicial={{ velha: "x" }} />);
    const grupo = screen.getByRole("group", { name: "Pergunta desativada" });
    expect(within(grupo).getByRole("checkbox", { name: "Xis" })).toHaveAttribute("aria-checked", "true");
    expect(within(grupo).getByRole("checkbox", { name: "Ipsilon" })).toHaveAttribute("aria-checked", "false");
  });
});

describe("o texto da organização é só texto (XSS armazenado)", () => {
  const PAYLOAD = "<img src=x onerror=alert(1)>";
  const SCRIPT = "<script>alert(2)</script>";
  type Cru = { seccoes: { perguntas: { texto: string; bloco: string | null; opcoes: { texto: string }[]; numero?: { unidade: string } | null }[] }[] };

  it("pergunta, subtítulo, opção e unidade da base aparecem como texto, sem criar elementos", () => {
    const cru = JSON.parse(JSON.stringify(QUESTIONARIO_BRUTO)) as Cru;
    cru.seccoes[1].perguntas[0].texto = `Acesso ${PAYLOAD}`;
    cru.seccoes[1].perguntas[0].bloco = `Bloco ${PAYLOAD}`;
    cru.seccoes[1].perguntas[0].opcoes[0].texto = `Fácil ${SCRIPT}`;
    cru.seccoes[3].perguntas[1].numero = { ...cru.seccoes[3].perguntas[1].numero!, unidade: PAYLOAD };
    const { container } = render(<Formulario q={lerQuestionarioForm(cru)!} />);
    expect(screen.getByRole("heading", { name: `Bloco ${PAYLOAD}` })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: `Acesso ${PAYLOAD}` })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: `Fácil ${SCRIPT}` })).toBeInTheDocument();
    expect(screen.getByText(PAYLOAD)).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toMatch(/<img/i);
    expect(container.innerHTML).not.toMatch(/<script/i);
  });

  it("o mesmo para o que vem do snapshot gravado (aplicarGravadas): texto da pergunta, da opção e de uma pergunta que já não existe", () => {
    const q = aplicarGravadas(questionario(), [
      gravada({ perguntaTexto: `Acesso ${PAYLOAD}`, escolhasTexto: [`Fácil ${SCRIPT}`] }),
      gravada({
        pergunta: "velha", perguntaTexto: `Velha ${PAYLOAD}`, tipo: "escolha_multipla", resposta: null, escolhas: ["x"], escolhasTexto: [PAYLOAD], seccao: "velhaSeccao", seccaoTitulo: PAYLOAD,
      }),
    ]);
    const { container } = render(<Formulario q={q} inicial={{ acesso: "facil", velha: "x" }} />);
    expect(screen.getByRole("radiogroup", { name: `Acesso ${PAYLOAD}` })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: `Fácil ${SCRIPT}` })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: `Velha ${PAYLOAD}` })).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });
});

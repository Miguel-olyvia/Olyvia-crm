// Arranque do canal de denúncias, do lado de quem denuncia: o formulário anónimo e o identificado mostram campos
// diferentes, enviar devolve código e PIN, e acompanhar com o par certo mostra o estado e a conversa (com o errado, uma
// mensagem genérica). Tudo em memória, sem base.
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { lerDenuncias, repor } from "@/components/canal-denuncias/dados/loja";
import AcompanharDenuncia from "./AcompanharDenuncia";
import NovaDenuncia from "./NovaDenuncia";

const mostrar = (pagina: JSX.Element) =>
  render(
    <LanguageProvider>
      <MemoryRouter>{pagina}</MemoryRouter>
    </LanguageProvider>,
  );

// As ações da fonte são assíncronas: o clique espera pelas promessas para o ecrã já refletir o resultado.
const clicar = async (nome: RegExp | string) => {
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: nome })); });
};
const escrever = (rotulo: RegExp | string, valor: string) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
const escolherModo = (nome: RegExp) => fireEvent.click(screen.getByRole("radio", { name: nome }));

const ANONIMO = /Quero denunciar de forma anónima/;
const IDENTIFICAR = /Quero identificar-me/;

function preencherOQueAconteceu(): void {
  escrever(/Tipo de denúncia/, "fraude");
  escrever(/Descreve o que aconteceu/, "Há despesas lançadas duas vezes com a mesma fatura no departamento comercial.");
  escrever(/Quando aconteceu/, "Em Setembro");
  escrever(/Onde aconteceu/, "Contabilidade");
}

async function irAteRever(modo: RegExp): Promise<void> {
  escolherModo(modo);
  await clicar("Continuar");
  preencherOQueAconteceu();
  await clicar("Continuar");
  await clicar("Continuar");
  await clicar("Continuar");
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

beforeEach(() => {
  cleanup();
  window.localStorage.setItem("language", "pt");
  repor();
});

afterEach(() => vi.restoreAllMocks());

describe("página pública: a organização e a estrutura de RH", () => {
  const mostrarEm = (endereco: string, pagina: JSX.Element) =>
    render(
      <LanguageProvider>
        <MemoryRouter initialEntries={[endereco]}>{pagina}</MemoryRouter>
      </LanguageProvider>,
    );

  it("sem parâmetro mostra a organização de exemplo; com ?org= mostra a escolhida e a denúncia fica dela", async () => {
    mostrarEm("/canal-denuncias/nova", <NovaDenuncia />);
    expect(screen.getByText("Olyvia Retail (exemplo)")).toBeInTheDocument();
    cleanup();
    mostrarEm("/canal-denuncias/nova?org=org-exemplo-casa-aurora", <NovaDenuncia />);
    expect(screen.getByText("Casa Aurora, Lda. (exemplo)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Acompanhar" })).toHaveAttribute("href", "/canal-denuncias/acompanhar?org=org-exemplo-casa-aurora");
    await irAteRever(ANONIMO);
    fireEvent.click(screen.getByRole("checkbox", { name: /boa-fé/ }));
    await clicar("Enviar denúncia");
    expect(lerDenuncias().find((d) => d.codigo === "DEN-2026-0042")?.organizationId).toBe("org-exemplo-casa-aurora");
  });

  it("um parâmetro ?org= desconhecido cai na organização de exemplo", async () => {
    mostrarEm("/canal-denuncias/nova?org=nao-existe", <NovaDenuncia />);
    expect(screen.getByText("Olyvia Retail (exemplo)")).toBeInTheDocument();
  });

  it("o formulário não tem nenhum campo de filial ou centro: «onde» é texto livre e opcional", async () => {
    mostrarEm("/canal-denuncias/nova", <NovaDenuncia />);
    escolherModo(ANONIMO);
    await clicar("Continuar");
    expect(screen.queryByRole("combobox", { name: /filial|centro|local de trabalho/i })).not.toBeInTheDocument();
    const onde = screen.getByLabelText(/Onde aconteceu/);
    expect(onde.tagName).toBe("INPUT");
    expect(onde).not.toHaveAttribute("aria-required");
    escrever(/Tipo de denúncia/, "fraude");
    escrever(/Descreve o que aconteceu/, "Há despesas lançadas duas vezes com a mesma fatura no departamento comercial.");
    escrever(/Quando aconteceu/, "Em Setembro");
    await clicar("Continuar");
    expect(screen.getByRole("heading", { name: "Quem está envolvido" })).toBeInTheDocument();
  });
});

describe("formulário de denúncia", () => {
  it("o passo 0 pede a escolha e o modo anónimo e o identificado mostram campos diferentes", async () => {
    mostrar(<NovaDenuncia />);
    expect(screen.getByText("A tua denúncia é tratada com confidencialidade e sem retaliação.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Nome")).not.toBeInTheDocument();

    escolherModo(ANONIMO);
    expect(screen.queryByLabelText("Nome")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.getByText(/Vais receber um código e um PIN/)).toBeInTheDocument();

    escolherModo(IDENTIFICAR);
    expect(screen.getByLabelText(/^Nome/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Telefone/)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Podem contactar-me?" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /Só o responsável do canal vê a minha identidade/ })).toBeChecked();
    expect(screen.queryByText(/Vais receber um código e um PIN/)).not.toBeInTheDocument();
  });

  it("sem escolher o modo não avança e diz porquê", async () => {
    mostrar(<NovaDenuncia />);
    await clicar("Continuar");
    expect(screen.getByText("Escolhe como queres denunciar.")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Falta corrigir 1 campo(s)");
    expect(screen.getByText("Passo 1 de 5", { exact: false })).toBeInTheDocument();
  });

  it("os erros do passo 1 ficam ligados a cada campo por aria-describedby", async () => {
    mostrar(<NovaDenuncia />);
    escolherModo(ANONIMO);
    await clicar("Continuar");
    await clicar("Continuar");
    const tipo = screen.getByLabelText(/Tipo de denúncia/);
    expect(tipo).toHaveAttribute("aria-invalid", "true");
    expect(tipo.getAttribute("aria-describedby")).toBe("den-tipo-erro");
    expect(document.getElementById("den-tipo-erro")).toHaveTextContent("Escolhe o tipo de denúncia.");
    expect(document.getElementById("den-descricao-erro")).toHaveTextContent("pelo menos 30 caracteres");
    expect(screen.getByLabelText(/Descreve o que aconteceu/).getAttribute("aria-describedby")).toContain("den-descricao-erro");
    expect(screen.getByText("Passo 2 de 5", { exact: false })).toBeInTheDocument();
  });

  it("identificada que quer ser contactada tem de dar email ou telefone", async () => {
    mostrar(<NovaDenuncia />);
    escolherModo(IDENTIFICAR);
    fireEvent.click(screen.getByRole("radio", { name: "Sim" }));
    await clicar("Continuar");
    expect(screen.getByText(/indica um email ou um telefone/)).toBeInTheDocument();
    escrever(/^Telefone/, "910 000 000");
    await clicar("Continuar");
    expect(screen.getByText("Passo 2 de 5", { exact: false })).toBeInTheDocument();
  });

  it("enviar uma denúncia anónima devolve o código, o PIN e os prazos, sem guardar identidade", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    mostrar(<NovaDenuncia />);
    await irAteRever(ANONIMO);
    expect(screen.getByText(/pode identificar-te, mesmo no modo anónimo/)).toBeInTheDocument();
    await clicar("Enviar denúncia");
    expect(screen.getByText("Para enviar, confirma a declaração de boa-fé.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /boa-fé/ }));
    await clicar("Enviar denúncia");

    expect(screen.getByText("Denúncia enviada")).toBeInTheDocument();
    expect(screen.getByText("DEN-2026-0042")).toBeInTheDocument();
    expect(screen.getByText("500000")).toBeInTheDocument();
    expect(screen.getByText(/única forma de acompanhar uma denúncia anónima e não se recuperam/)).toBeInTheDocument();
    expect(screen.getByText(/em 7 dias, até 22\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/em 3 meses, até 15\/01\/2027/)).toBeInTheDocument();
    expect(screen.getByText("Prazos de referência (exemplo)")).toBeInTheDocument();

    const nova = lerDenuncias().find((d) => d.codigo === "DEN-2026-0042")!;
    expect(nova).toMatchObject({ anonima: true, identidade: null, estado: "recebida", pin: "500000", tipo: "fraude" });
    expect(lerDenuncias()).toHaveLength(15);
    expect(nova.organizationId).toBe("org-exemplo-olyvia-retail");
    expect(nova.pessoaId).toBeNull();
  });

  it("enviar uma denúncia identificada guarda a identidade só nessa", async () => {
    mostrar(<NovaDenuncia />);
    escolherModo(IDENTIFICAR);
    escrever(/^Nome/, "Ana Reis");
    escrever(/^Email/, "ana.reis@exemplo.pt");
    await clicar("Continuar");
    preencherOQueAconteceu();
    await clicar("Continuar");
    await clicar("Continuar");
    await clicar("Continuar");
    expect(screen.getByText(/Identificada — Ana Reis · ana.reis@exemplo.pt/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /boa-fé/ }));
    await clicar("Enviar denúncia");
    const nova = lerDenuncias().find((d) => d.codigo === "DEN-2026-0042")!;
    expect(nova.anonima).toBe(false);
    expect(nova.identidade).toMatchObject({ nome: "Ana Reis", email: "ana.reis@exemplo.pt" });
  });

  it("mudar de ideias entre o modo identificado e o anónimo não deixa nome escondido na denúncia", async () => {
    mostrar(<NovaDenuncia />);
    escolherModo(IDENTIFICAR);
    escrever(/^Nome/, "Ana Reis");
    escolherModo(ANONIMO);
    await clicar("Continuar");
    preencherOQueAconteceu();
    await clicar("Continuar");
    await clicar("Continuar");
    await clicar("Continuar");
    expect(screen.queryByText(/Ana Reis/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /boa-fé/ }));
    await clicar("Enviar denúncia");
    expect(lerDenuncias().find((d) => d.codigo === "DEN-2026-0042")?.identidade).toBeNull();
  });

  it("as provas: anexos simulados em memória, no máximo 5, com remover", async () => {
    mostrar(<NovaDenuncia />);
    escolherModo(ANONIMO);
    await clicar("Continuar");
    preencherOQueAconteceu();
    await clicar("Continuar");
    await clicar("Continuar");
    expect(screen.getByRole("heading", { name: "Provas" })).toBeInTheDocument();
    const entrada = document.querySelector('input[type="file"]') as HTMLInputElement;
    const ficheiros = Array.from({ length: 6 }, (_, i) => new File(["x".repeat(2048)], `prova-${i + 1}.pdf`, { type: "application/pdf" }));
    fireEvent.change(entrada, { target: { files: ficheiros } });
    const lista = screen.getByRole("list", { name: "Ficheiros juntos" });
    expect(within(lista).getAllByRole("listitem")).toHaveLength(5);
    expect(within(lista).getByText(/prova-1\.pdf/)).toBeInTheDocument();
    expect(within(lista).getAllByText(/2\.0 KB/)).toHaveLength(5);
    expect(screen.getByRole("status")).toHaveTextContent("Só cabem 5 ficheiros");
    expect(screen.getByText("5 de 5 ficheiros")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Adicionar ficheiros" })).toBeDisabled();
    await clicar("Remover prova-2.pdf");
    expect(within(screen.getByRole("list", { name: "Ficheiros juntos" })).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Adicionar ficheiros" })).toBeEnabled();
  });

  it("o rascunho fica em memória: sair e voltar recupera o passo e o texto", async () => {
    const { unmount } = mostrar(<NovaDenuncia />);
    escolherModo(ANONIMO);
    await clicar("Continuar");
    escrever(/Descreve o que aconteceu/, "Um texto a meio");
    unmount();
    mostrar(<NovaDenuncia />);
    expect(screen.getByText("Passo 2 de 5", { exact: false })).toBeInTheDocument();
    expect(screen.getByLabelText(/Descreve o que aconteceu/)).toHaveValue("Um texto a meio");
  });
});

describe("acompanhar uma denúncia", () => {
  const entrar = async (codigo: string, pin: string) => {
    escrever(/Código de acompanhamento/, codigo);
    escrever("PIN", pin);
    await clicar("Ver o estado");
  };

  it("com o código e o PIN certos mostra o estado, as datas e a conversa", async () => {
    mostrar(<AcompanharDenuncia />);
    await entrar("den-2026-0039", "205861");
    expect(screen.getByRole("heading", { name: "Denúncia DEN-2026-0039" })).toBeInTheDocument();
    expect(screen.getByText("Em análise")).toBeInTheDocument();
    expect(screen.getByText("21/09/2026")).toBeInTheDocument();
    expect(screen.getByText("23/09/2026")).toBeInTheDocument();
    expect(screen.getByText("21/12/2026")).toBeInTheDocument();
    const conversa = screen.getByRole("list", { name: "Mensagens" });
    expect(within(conversa).getAllByRole("listitem")).toHaveLength(3);
    expect(within(conversa).getByText(/Duas em Março e uma em Junho/)).toBeInTheDocument();
    expect(within(conversa).getByText(/mensagens-fornecedor\.pdf/)).toBeInTheDocument();
    expect(screen.queryByText(/Gravidade/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Cruzar com o registo de presentes/)).not.toBeInTheDocument();
  });

  it("com o código ou o PIN errados dá a mesma mensagem, sem dizer qual falhou", async () => {
    mostrar(<AcompanharDenuncia />);
    await entrar("DEN-2026-0039", "000000");
    const pinErrado = screen.getByRole("alert").textContent;
    escrever(/Código de acompanhamento/, "DEN-2026-9999");
    escrever("PIN", "205861");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await clicar("Ver o estado");
    const codigoErrado = screen.getByRole("alert").textContent;
    expect(pinErrado).toBe(codigoErrado);
    expect(pinErrado).toMatch(/Não encontrámos nenhuma denúncia com estes dados/);
    expect(pinErrado).not.toMatch(/PIN (está|incorreto)|código (está|incorreto)/i);
    expect(screen.queryByRole("heading", { name: /Denúncia DEN/ })).not.toBeInTheDocument();
  });

  it("o denunciante responde e anexa mesmo sendo anónimo, e uma resposta retoma a análise", async () => {
    mostrar(<AcompanharDenuncia />);
    await entrar("DEN-2026-0040", "733104");
    expect(screen.getByText("Recebida")).toBeInTheDocument();
    expect(screen.getByText("Confirmamos a receção até")).toBeInTheDocument();
    expect(screen.getByText("Ainda não há mensagens.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sair" }));

    await entrar("DEN-2026-0038", "917340");
    expect(screen.getByText("Pedimos mais informação")).toBeInTheDocument();
    await clicar("Enviar resposta");
    expect(screen.getByText("Escreve uma mensagem ou junta um ficheiro.")).toBeInTheDocument();
    escrever(/A tua resposta/, "Foi a 12 e a 14 de Setembro.");
    const entradaFicheiro = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(entradaFicheiro, { target: { files: [new File(["x"], "fatura.pdf")] } });
    expect(screen.getByText(/fatura\.pdf/)).toBeInTheDocument();
    await clicar("Enviar resposta");
    const conversa = screen.getByRole("list", { name: "Mensagens" });
    expect(within(conversa).getAllByRole("listitem")).toHaveLength(2);
    expect(within(conversa).getByText(/Foi a 12 e a 14 de Setembro/)).toBeInTheDocument();
    expect(within(conversa).getByText(/fatura\.pdf/)).toBeInTheDocument();
    expect(screen.getByText("Em análise")).toBeInTheDocument();
    expect(lerDenuncias().find((d) => d.codigo === "DEN-2026-0038")?.estado).toBe("em_analise");
  });

  it("uma denúncia fechada mostra o resultado e já não aceita mensagens", async () => {
    mostrar(<AcompanharDenuncia />);
    await entrar("DEN-2026-0033", "846213");
    expect(screen.getByText("Resultado: Procedente")).toBeInTheDocument();
    expect(screen.getByText(/Extintores substituídos/)).toBeInTheDocument();
    expect(screen.getByText(/já não aceita mensagens/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enviar resposta" })).not.toBeInTheDocument();
  });
});

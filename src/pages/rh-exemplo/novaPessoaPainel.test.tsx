import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { repor } from "@/components/rh-exemplo/dados/loja";
import PessoasRh from "./PessoasRh";

const renderLista = () =>
  render(
    <LanguageProvider>
      <MemoryRouter initialEntries={["/rh-exemplo/pessoas"]}>
        <Routes>
          <Route path="/rh-exemplo/pessoas" element={<PessoasRh />} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );

beforeAll(() => {
  // O Radix Select precisa de APIs que o jsdom não traz.
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.scrollIntoView ??= () => undefined;
  // O interruptor do Radix dentro de um formulário mede-se com ResizeObserver, que o jsdom não traz.
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

beforeEach(() => {
  window.localStorage.setItem("language", "pt");
  repor();
});

const painel = () => screen.getByRole("dialog");
const campo = (id: string) => document.getElementById(id) as HTMLInputElement;

function abrirNovaPessoa() {
  renderLista();
  fireEvent.click(screen.getByRole("button", { name: "Nova pessoa" }));
  return painel();
}

const irParaAba = (nome: RegExp | string) => fireEvent.mouseDown(within(painel()).getByRole("tab", { name: nome }), { button: 0 });
const escrever = (id: string, valor: string) => fireEvent.change(campo(id), { target: { value: valor } });

/** Abre o seletor com o teclado e escolhe a opção com esse nome. */
function escolher(rotulo: RegExp | string, opcao: RegExp | string) {
  const gatilho = within(painel()).getByRole("combobox", { name: rotulo });
  fireEvent.keyDown(gatilho, { key: "Enter" });
  fireEvent.click(screen.getByRole("option", { name: opcao }));
}

/** O mínimo para criar com convite: nome, e-mail pessoal, cargo, tipo de contrato, subsídio e duodécimos. */
function preencherMinimo() {
  escrever("hr-novo-primeiro-nome", "Teresa");
  escrever("hr-novo-apelido", "Nogueira");
  irParaAba(/Contacto e morada/);
  escrever("hr-novo-email-pessoal", "teresa@exemplo.pt");
  irParaAba(/Contrato e local/);
  escolher(/^Cargo/, /Vendedor/);
  escolher(/^Tipo de contrato/, /Sem termo/);
  irParaAba(/Retribuição e bancário/);
  escrever("hr-novo-subsidio", "7,63");
  escolher(/^Subsidios em duodecimos/, /^50 %/);
}

describe("RH de exemplo: Nova pessoa em painel lateral", () => {
  it("abre o painel com migalhas, selo, seis abas e o rodapé com um só botão primário", () => {
    const nova = abrirNovaPessoa();
    expect(within(nova).getByRole("navigation", { name: "Onde está" })).toHaveTextContent("Recursos Humanos");
    expect(within(nova).getByRole("heading", { name: "Nova pessoa" })).toBeInTheDocument();
    expect(within(nova).getByText("Novo · por gravar")).toBeInTheDocument();
    expect(within(nova).getAllByRole("tab").map((a) => a.textContent)).toEqual([
      "Dados pessoais", "Contacto e morada", "Contrato e local", "Retribuição e bancário", "Outros dados", "Acesso e convite",
    ]);
    expect(within(nova).getByRole("button", { name: "Cancelar" })).toBeInTheDocument();
    expect(within(nova).getByRole("button", { name: "Criar e enviar convite" })).toBeInTheDocument();
    expect(within(nova).getByRole("button", { name: "Criar pessoa" })).toBeInTheDocument();
    expect(within(nova).getByText(/O link do convite vale 7 dias/)).toBeInTheDocument();
    expect(within(nova).getByText(/nada fica gravado/)).toBeInTheDocument();
  });

  it("o foco inicial vai para o nome", () => {
    abrirNovaPessoa();
    expect(campo("hr-novo-primeiro-nome")).toHaveFocus();
  });

  it("cada campo diz se é obrigatório e onde se pede (no convite, na ficha, opcional), e as secções têm o interruptor do convite", () => {
    const nova = abrirNovaPessoa();
    expect(within(nova).getAllByText("obrigatório").length).toBeGreaterThanOrEqual(2);
    expect(within(nova).getAllByText("no convite").length).toBeGreaterThan(3);
    expect(within(nova).getAllByRole("switch", { name: "Pedir à pessoa no convite" }).length).toBeGreaterThanOrEqual(3);
    expect(campo("hr-novo-primeiro-nome")).toHaveAttribute("aria-required", "true");
    irParaAba(/Contrato e local/);
    expect(within(nova).getAllByText("só do RH").length).toBeGreaterThanOrEqual(3);
  });

  it("todos os campos de cada aba estão no ecrã, sem esconder nenhum", () => {
    const nova = abrirNovaPessoa();
    const abas: Array<[RegExp, string[]]> = [
      [/Dados pessoais/, ["hr-novo-nome-tratamento", "hr-novo-genero", "hr-novo-nacionalidade", "hr-novo-estado-civil", "hr-novo-dependentes", "hr-novo-data-nascimento", "hr-novo-naturalidade-concelho", "hr-novo-tipo-documento", "hr-novo-nif", "hr-novo-niss", "hr-novo-carta-numero", "hr-novo-anexo-cartao_cidadao", "hr-novo-anexo-fotografia"]],
      [/Contacto e morada/, ["hr-novo-email-pessoal", "hr-novo-email-trabalho", "hr-novo-morada-linha2", "hr-novo-morada-distrito", "hr-novo-morada-pais", "hr-novo-emergencia-nome", "hr-novo-emergencia-telefone-alt"]],
      [/Contrato e local/, ["hr-novo-local", "hr-novo-reporta-a", "hr-novo-cargo", "hr-novo-data-admissao", "hr-novo-tipo-contrato", "hr-novo-regime", "hr-novo-tipo-trabalho", "hr-novo-horas-trabalho", "hr-novo-tipo-horario", "hr-novo-politica-feriados"]],
      [/Retribuição e bancário/, ["hr-novo-subsidio", "hr-novo-subsidio-modo", "hr-novo-duodecimos", "hr-novo-conta-numero", "hr-novo-conta-agencia", "hr-novo-conta-bic", "hr-novo-anexo-comprovativo_iban"]],
      [/Outros dados/, ["hr-novo-habilitacao", "hr-novo-saude-incapacidade", "hr-novo-sindicalizado", "hr-novo-tamanho-cima", "hr-novo-tamanho-calcado"]],
      [/Acesso e convite/, ["hr-novo-criar-acesso", "hr-novo-papel", "hr-novo-email-acesso"]],
    ];
    for (const [aba, ids] of abas) {
      irParaAba(aba);
      for (const id of ids) expect(campo(id), id).toBeInTheDocument();
    }
    expect(within(nova).getByText(/https:\/\/exemplo\.olyvia\.pt\/convite\//)).toBeInTheDocument();
  });

  it("criar vazio mostra os erros por campo ligados por aria-describedby, conta-os por aba e leva o foco ao primeiro", () => {
    const nova = abrirNovaPessoa();
    fireEvent.click(within(nova).getByRole("button", { name: "Criar pessoa" }));
    const nome = campo("hr-novo-primeiro-nome");
    expect(nome).toHaveAttribute("aria-invalid", "true");
    expect(document.getElementById(nome.getAttribute("aria-describedby") ?? "")).toHaveTextContent("Obrigatório");
    expect(nome).toHaveFocus();
    expect(within(nova).getByRole("status")).toHaveTextContent(/campos por corrigir/);
    const abas = within(nova).getAllByRole("tab");
    expect(abas[0]).toHaveTextContent("por corrigir");
    expect(abas[2]).toHaveTextContent("por corrigir");
    expect(abas[5]).not.toHaveTextContent("por corrigir");
  });

  it("com erro só noutra aba, criar abre essa aba e dá foco ao campo", async () => {
    const nova = abrirNovaPessoa();
    escrever("hr-novo-primeiro-nome", "Teresa");
    escrever("hr-novo-apelido", "Nogueira");
    fireEvent.click(within(nova).getByRole("button", { name: "Criar e enviar convite" }));
    expect(within(nova).getByRole("tab", { name: /Contacto e morada/ })).toHaveAttribute("data-state", "active");
    await waitFor(() => expect(campo("hr-novo-email-pessoal")).toHaveFocus());
    expect(campo("hr-novo-email-pessoal")).toHaveAttribute("aria-invalid", "true");
  });

  it("um NIF com dígito de controlo errado dá erro no campo, e o certo não", () => {
    abrirNovaPessoa();
    escrever("hr-novo-nif", "123456780");
    fireEvent.blur(campo("hr-novo-nif"));
    expect(campo("hr-novo-nif")).toHaveAttribute("aria-invalid", "true");
    escrever("hr-novo-nif", "123456789");
    expect(campo("hr-novo-nif")).not.toHaveAttribute("aria-invalid");
  });

  it("os anexos são simulados: escolhe-se um ficheiro, vê-se o nome e retira-se; o máximo é 4", () => {
    const nova = abrirNovaPessoa();
    const entrada = within(nova).getByLabelText(/Ficheiro de Cartão de cidadão/) as HTMLInputElement;
    const pdf = (nome: string) => new File(["x"], nome, { type: "application/pdf" });
    fireEvent.change(entrada, { target: { files: [pdf("cc-frente.pdf")] } });
    fireEvent.change(entrada, { target: { files: [pdf("cc-verso.pdf")] } });
    expect(within(nova).getByText(/cc-frente\.pdf/)).toBeInTheDocument();
    expect(within(nova).getByText(/2 de 4 ficheiros/)).toBeInTheDocument();
    fireEvent.change(entrada, { target: { files: [pdf("cc-outro.pdf")] } });
    expect(within(nova).getByRole("alert")).toBeInTheDocument();
    fireEvent.click(within(nova).getByRole("button", { name: "Retirar cc-frente.pdf" }));
    expect(within(nova).queryByText(/cc-frente\.pdf/)).not.toBeInTheDocument();
  });

  it("Cancelar fecha o painel", () => {
    const nova = abrirNovaPessoa();
    fireEvent.click(within(nova).getByRole("button", { name: "Cancelar" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("preenche, cria e envia o convite: a pessoa entra na lista, a ficha abre e mostra o que se escreveu", async () => {
    const nova = abrirNovaPessoa();
    preencherMinimo();
    irParaAba(/Dados pessoais/);
    escrever("hr-novo-nome-tratamento", "Teté");
    escrever("hr-novo-nif", "123456789");
    fireEvent.click(within(nova).getByRole("button", { name: "Criar e enviar convite" }));
    const titulo = await screen.findByRole("heading", { level: 1, name: "Teresa Nogueira" });
    const ficha = titulo.closest<HTMLElement>('[role="dialog"]') as HTMLElement;
    expect(within(ficha).getAllByRole("tab")).toHaveLength(8);
    expect(within(ficha).getByText(/^.+ · Vendedor\/a$/)).toBeInTheDocument();
    fireEvent.mouseDown(within(ficha).getByRole("tab", { name: /Detalhes pessoais/ }), { button: 0 });
    expect(await within(ficha).findByText("Teté")).toBeInTheDocument();
    expect(within(ficha).getByText(/teresa@exemplo\.pt/)).toBeInTheDocument();
  });
});

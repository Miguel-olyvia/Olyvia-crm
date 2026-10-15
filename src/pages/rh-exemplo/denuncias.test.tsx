// O canal de denúncias DENTRO da app: «Denunciar» e «As minhas denúncias» (A minha área) e a gestão no RH. Uma denúncia
// identificada feita na app aparece na lista da pessoa; uma anónima não (só pelo código e PIN); a gestão mostra anónimas
// e identificadas, nunca a identidade de uma anónima; e tudo é da organização ativa (as de outra não aparecem).
// Tudo em memória, sem base.
import { beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { lerDenuncias, repor, submeter } from "@/components/canal-denuncias/dados/loja";
import { ORG_ATIVA, OUTRA_ORG } from "@/components/canal-denuncias/dados/organizacoes";
import { PaginaMinhasDenuncias } from "@/components/canal-denuncias/minhaArea/PaginaMinhasDenuncias";
import { FORMULARIO_VAZIO } from "@/components/canal-denuncias/lib/formulario";
import { repor as reporRh } from "@/components/rh-exemplo/dados/loja";
import NovaDenuncia from "@/pages/canal-denuncias/NovaDenuncia";
import RhDenunciar from "./RhDenunciar";
import RhDenuncias from "./RhDenuncias";
import RhMinhasDenuncias from "./RhMinhasDenuncias";

function Endereco() {
  const { pathname, search } = useLocation();
  return <output data-testid="endereco">{`${pathname}${search}`}</output>;
}

const mostrar = (endereco: string) =>
  render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[endereco]}>
        <Routes>
          <Route path="/rh-exemplo/denunciar" element={<RhDenunciar />} />
          <Route path="/rh-exemplo/minhas-denuncias" element={<RhMinhasDenuncias />} />
          <Route path="/rh-exemplo/denuncias" element={<RhDenuncias />} />
        </Routes>
        <Endereco />
      </MemoryRouter>
    </LanguageProvider>,
  );

const clicar = (nome: RegExp | string) => fireEvent.click(screen.getByRole("button", { name: nome }));
const escrever = (rotulo: RegExp | string, valor: string) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
const escolherModo = (nome: RegExp) => fireEvent.click(screen.getByRole("radio", { name: nome }));
const aba = (nome: RegExp) => fireEvent.mouseDown(screen.getByRole("tab", { name: nome }), { button: 0 });
const linhas = () => within(screen.getByRole("table")).getAllByRole("row").slice(1);
const cartoes = () => within(screen.getByRole("list", { name: "As minhas denúncias identificadas" })).getAllByRole("listitem");

const ANONIMO = /Quero denunciar de forma anónima/;
const IDENTIFICAR = /Quero identificar-me/;
const SOFIA = "Sofia Rebelo";
const EMAIL_SOFIA = "sofia.rebelo@olyvia-exemplo.pt";

function denunciarAteEnviar(modo: RegExp): void {
  escolherModo(modo);
  clicar("Continuar");
  escrever(/Tipo de denúncia/, "dados");
  escrever(/Descreve o que aconteceu/, "A impressora do corredor guarda cópias de documentos com dados de clientes sem proteção.");
  escrever(/Quando aconteceu/, "Esta semana");
  clicar("Continuar");
  clicar("Continuar");
  clicar("Continuar");
  fireEvent.click(screen.getByRole("checkbox", { name: /boa-fé/ }));
  clicar("Enviar denúncia");
}

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
});

beforeEach(() => {
  cleanup();
  window.localStorage.setItem("language", "pt");
  repor();
  reporRh();
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});

afterEach(() => vi.restoreAllMocks());

describe("A minha área > Denunciar", () => {
  it("é o mesmo assistente do público, com o nome da organização ativa e a ligação discreta à página pública", () => {
    mostrar("/rh-exemplo/denunciar");
    expect(screen.getByRole("heading", { level: 1, name: "Denunciar" })).toBeInTheDocument();
    expect(screen.getByText("Organização: Olyvia Retail (exemplo)")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: ANONIMO })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: IDENTIFICAR })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver a página pública (como a vê quem não tem login)" })).toHaveAttribute("href", "/canal-denuncias/nova");
    expect(screen.getByRole("link", { name: "A minha área (exemplo)" })).toBeInTheDocument();
  });

  it("identificada: o nome e o email vêm da pessoa com a sessão; voltar a anónima não deixa nada da pessoa", () => {
    mostrar("/rh-exemplo/denunciar");
    escolherModo(IDENTIFICAR);
    expect(screen.getByLabelText(/^Nome/)).toHaveValue(SOFIA);
    expect(screen.getByLabelText(/^Email/)).toHaveValue(EMAIL_SOFIA);
    escolherModo(ANONIMO);
    expect(screen.queryByLabelText(/^Nome/)).not.toBeInTheDocument();
    escolherModo(IDENTIFICAR);
    expect(screen.getByLabelText(/^Nome/)).toHaveValue(SOFIA);
  });

  it("uma denúncia identificada fica ligada à pessoa e da organização ativa, e mostra o código e o PIN", () => {
    mostrar("/rh-exemplo/denunciar");
    denunciarAteEnviar(IDENTIFICAR);
    expect(screen.getByText("Denúncia enviada")).toBeInTheDocument();
    expect(screen.getByText("DEN-2026-0042")).toBeInTheDocument();
    expect(screen.getByText("500000")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Acompanhar esta denúncia" })).toHaveAttribute("href", "/rh-exemplo/minhas-denuncias?aba=identificadas");
    expect(screen.queryByRole("button", { name: "Guardar o código nesta sessão" })).not.toBeInTheDocument();
    expect(lerDenuncias().find((d) => d.codigo === "DEN-2026-0042")).toMatchObject({
      anonima: false, pessoaId: "p-sofia", organizationId: ORG_ATIVA.id, identidade: { nome: SOFIA, email: EMAIL_SOFIA },
    });
  });

  it("uma denúncia anónima não fica ligada à pessoa e oferece guardar só o código", () => {
    mostrar("/rh-exemplo/denunciar");
    denunciarAteEnviar(ANONIMO);
    expect(screen.getByRole("link", { name: "Acompanhar esta denúncia" })).toHaveAttribute("href", "/rh-exemplo/minhas-denuncias?aba=anonimas");
    expect(screen.getByRole("button", { name: "Guardar o código nesta sessão" })).toBeInTheDocument();
    expect(lerDenuncias().find((d) => d.codigo === "DEN-2026-0042")).toMatchObject({
      anonima: true, pessoaId: null, identidade: null, organizationId: ORG_ATIVA.id,
    });
  });

  it("o rascunho de dentro da app nunca aparece na página pública", () => {
    mostrar("/rh-exemplo/denunciar");
    escolherModo(IDENTIFICAR);
    expect(screen.getByLabelText(/^Nome/)).toHaveValue(SOFIA);
    cleanup();
    render(
      <LanguageProvider>
        <MemoryRouter initialEntries={["/canal-denuncias/nova"]}>
          <Routes>
            <Route path="/canal-denuncias/nova" element={<NovaDenuncia />} />
          </Routes>
        </MemoryRouter>
      </LanguageProvider>,
    );
    expect(screen.queryByLabelText(/^Nome/)).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: IDENTIFICAR })).not.toBeChecked();
  });
});

describe("A minha área > As minhas denúncias", () => {
  it("«Identificadas» lista as da própria pessoa, com estado e prazo, sem anónimas nem as de outra organização", () => {
    mostrar("/rh-exemplo/minhas-denuncias");
    expect(screen.getByRole("heading", { level: 1, name: "As minhas denúncias" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Identificadas/, selected: true })).toBeInTheDocument();
    const itens = cartoes();
    expect(itens).toHaveLength(2);
    const analise = itens.find((c) => within(c).queryByText("DEN-2026-0031"))!;
    expect(within(analise).getByText("Em análise")).toBeInTheDocument();
    expect(within(analise).getByText("Responder até 22/12")).toBeInTheDocument();
    expect(within(analise).getByText(/Folhas de assiduidade com NIF e moradas/)).toBeInTheDocument();
    const concluida = itens.find((c) => within(c).queryByText("DEN-2026-0030"))!;
    expect(within(concluida).getByText("Concluída")).toBeInTheDocument();
    for (const alheio of ["DEN-2026-0007", "DEN-2026-0039", "DEN-2026-0040"]) expect(screen.queryByText(alheio)).not.toBeInTheDocument();
  });

  it("uma denúncia identificada feita na app aparece na lista; uma anónima não, e só se acompanha pelo código e PIN", () => {
    mostrar("/rh-exemplo/denunciar");
    denunciarAteEnviar(IDENTIFICAR);
    fireEvent.click(screen.getByRole("link", { name: "Acompanhar esta denúncia" }));
    expect(screen.getByTestId("endereco").textContent).toBe("/rh-exemplo/minhas-denuncias?aba=identificadas");
    expect(cartoes()).toHaveLength(3);
    expect(screen.getByText("DEN-2026-0042")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Identificadas/ })).toHaveTextContent("3");

    cleanup();
    mostrar("/rh-exemplo/denunciar");
    denunciarAteEnviar(ANONIMO);
    fireEvent.click(screen.getByRole("button", { name: "Guardar o código nesta sessão" }));
    expect(screen.getByRole("button", { name: "Código guardado" })).toBeDisabled();
    fireEvent.click(screen.getByRole("link", { name: "Acompanhar esta denúncia" }));
    expect(screen.getByTestId("endereco").textContent).toBe("/rh-exemplo/minhas-denuncias?aba=anonimas");
    aba(/^Identificadas/);
    expect(cartoes()).toHaveLength(3);
    expect(screen.queryByText("DEN-2026-0043")).not.toBeInTheDocument();
  });

  it("«Anónimas» explica a ausência de ligação e abre a denúncia pelo código e PIN, com a conversa", () => {
    mostrar("/rh-exemplo/minhas-denuncias?aba=anonimas");
    expect(screen.getByRole("tab", { name: /^Anónimas/, selected: true })).toBeInTheDocument();
    expect(screen.getByText(/não fica ligada a ti, por isso não aparece numa lista/)).toBeInTheDocument();
    expect(screen.getByText(/Não guardaste nenhum código/)).toBeInTheDocument();
    escrever(/^Código de acompanhamento/, "den-2026-0039");
    escrever(/^PIN/, "000000");
    clicar("Ver o estado");
    expect(screen.getByRole("alert")).toHaveTextContent("Não encontrámos nenhuma denúncia com estes dados");
    escrever(/^PIN/, "205861");
    clicar("Ver o estado");
    expect(screen.getByRole("region", { name: "Denúncia DEN-2026-0039" })).toBeInTheDocument();
    expect(screen.getByText(/Duas em Março/)).toBeInTheDocument();
    expect(screen.queryByText("Notas internas")).not.toBeInTheDocument();
  });

  it("os códigos guardados nesta sessão preenchem o código, falta sempre o PIN; só a organização ativa abre", () => {
    mostrar("/rh-exemplo/minhas-denuncias?aba=anonimas");
    escrever(/^Código de acompanhamento/, "DEN-2026-0039");
    escrever(/^PIN/, "205861");
    clicar("Ver o estado");
    clicar("Guardar o código nesta sessão");
    clicar("Sair");
    fireEvent.click(screen.getByRole("button", { name: "Usar o código DEN-2026-0039" }));
    expect(screen.getByLabelText(/^Código de acompanhamento/)).toHaveValue("DEN-2026-0039");
    expect(screen.getByLabelText(/^PIN/)).toHaveValue("");
    escrever(/^Código de acompanhamento/, "DEN-2026-0008");
    escrever(/^PIN/, "603117");
    clicar("Ver o estado");
    expect(screen.getByRole("alert")).toHaveTextContent("Não encontrámos nenhuma denúncia com estes dados");
  });

  it("o painel lateral tem o estado, os prazos e a conversa, onde ela responde, sem notas internas nem gestão", () => {
    mostrar("/rh-exemplo/minhas-denuncias");
    fireEvent.click(screen.getByRole("button", { name: "Abrir denúncia DEN-2026-0031" }));
    const painel = screen.getByRole("dialog");
    expect(within(painel).getByText("Em análise")).toBeInTheDocument();
    expect(within(painel).getByText("Resposta sobre as medidas até")).toBeInTheDocument();
    const conversa = within(painel).getByRole("list", { name: "Mensagens" });
    expect(within(conversa).getAllByRole("listitem")).toHaveLength(3);
    expect(within(conversa).getAllByText("Responsável do canal")).toHaveLength(2);
    expect(within(painel).queryByRole("tab")).not.toBeInTheDocument();
    expect(within(painel).queryByText(/Notas internas|Gravidade|Ver identidade/)).not.toBeInTheDocument();
    fireEvent.change(within(painel).getByLabelText("A tua resposta"), { target: { value: "Obrigada, fico a aguardar." } });
    fireEvent.click(within(painel).getByRole("button", { name: "Enviar resposta" }));
    expect(within(painel).getAllByRole("listitem")).toHaveLength(4);
    expect(within(painel).getByText("Obrigada, fico a aguardar.")).toBeInTheDocument();
    expect(lerDenuncias().find((d) => d.codigo === "DEN-2026-0031")?.mensagens).toHaveLength(4);
  });

  it("uma denúncia concluída mostra o desfecho e já não aceita mensagens", () => {
    mostrar("/rh-exemplo/minhas-denuncias");
    fireEvent.click(screen.getByRole("button", { name: "Abrir denúncia DEN-2026-0030" }));
    const painel = screen.getByRole("dialog");
    expect(within(painel).getByText(/Resultado: Procedente/)).toBeInTheDocument();
    expect(within(painel).getByText(/já não aceita mensagens/)).toBeInTheDocument();
    expect(within(painel).queryByLabelText("A tua resposta")).not.toBeInTheDocument();
  });

  it("sem denúncias identificadas na organização ativa, o estado vazio leva a «Denunciar»", () => {
    render(
      <LanguageProvider>
        <MemoryRouter initialEntries={["/rh-exemplo/minhas-denuncias"]}>
          <Routes>
            <Route path="/rh-exemplo/minhas-denuncias" element={<PaginaMinhasDenuncias organizacaoId={ORG_ATIVA.id} organizacaoNome={ORG_ATIVA.nome} pessoaId="p-sem-denuncias" />} />
            <Route path="/rh-exemplo/denunciar" element={<RhDenunciar />} />
          </Routes>
          <Endereco />
        </MemoryRouter>
      </LanguageProvider>,
    );
    expect(screen.getByText("Ainda não fizeste nenhuma denúncia identificada")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "As minhas denúncias identificadas" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Denunciar" }));
    expect(screen.getByTestId("endereco").textContent).toBe("/rh-exemplo/denunciar");
    expect(screen.getByRole("heading", { level: 1, name: "Denunciar" })).toBeInTheDocument();
  });
});

describe("Recursos Humanos > Denúncias", () => {
  it("mostra anónimas e identificadas da organização ativa, com contadores nas abas, sem as de outra organização", () => {
    mostrar("/rh-exemplo/denuncias");
    expect(screen.getByRole("heading", { level: 1, name: "Gestão de denúncias" })).toBeInTheDocument();
    expect(screen.getByText("Organização: Olyvia Retail (exemplo)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver a página pública (como a vê quem não tem login)" })).toHaveAttribute("href", "/canal-denuncias/nova");
    expect(screen.getByRole("tab", { name: /^Todas/ })).toHaveTextContent("12");
    expect(screen.getByRole("tab", { name: /^Anónimas/ })).toHaveTextContent("5");
    expect(screen.getByRole("tab", { name: /^Identificadas/ })).toHaveTextContent("7");
    expect(linhas()).toHaveLength(12);
    for (const alheio of ["DEN-2026-0007", "DEN-2026-0008"]) expect(screen.queryByText(alheio)).not.toBeInTheDocument();
  });

  it("o filtro Anónimas e Identificadas separa a lista e «Todas» volta a juntá-la", () => {
    mostrar("/rh-exemplo/denuncias");
    aba(/^Anónimas/);
    expect(screen.getByRole("tab", { name: /^Anónimas/, selected: true })).toBeInTheDocument();
    expect(linhas()).toHaveLength(5);
    expect(linhas().every((l) => within(l).queryByText("Anónima") !== null)).toBe(true);
    aba(/^Identificadas/);
    expect(linhas()).toHaveLength(7);
    expect(linhas().every((l) => within(l).queryByText("Identificada") !== null)).toBe(true);
    aba(/^Todas/);
    expect(linhas()).toHaveLength(12);
  });

  it("nunca mostra a identidade de uma anónima, nem na lista nem no painel", () => {
    mostrar("/rh-exemplo/denuncias");
    const nomes = lerDenuncias().flatMap((d) => (d.identidade ? [d.identidade.nome, d.identidade.email] : []));
    expect(nomes.length).toBeGreaterThan(5);
    for (const nome of nomes) expect(screen.getByRole("table")).not.toHaveTextContent(nome);
    fireEvent.click(screen.getByRole("button", { name: "Abrir denúncia DEN-2026-0039" }));
    const painel = screen.getByRole("dialog");
    expect(within(painel).getByText("Identidade desconhecida")).toBeInTheDocument();
    expect(within(painel).queryByRole("button", { name: "Ver identidade" })).not.toBeInTheDocument();
    for (const nome of nomes) expect(painel).not.toHaveTextContent(nome);
  });

  it("uma identificada da Sofia, feita na app, aparece na gestão com a identidade protegida", () => {
    submeter({ ...FORMULARIO_VAZIO, anonima: false, nome: SOFIA, email: EMAIL_SOFIA, tipo: "dados", descricao: "x".repeat(40), quando: "Hoje", boaFe: true },
      { organizationId: ORG_ATIVA.id, pessoaId: "p-sofia" });
    mostrar("/rh-exemplo/denuncias");
    expect(linhas()).toHaveLength(13);
    expect(screen.getByRole("tab", { name: /^Identificadas/ })).toHaveTextContent("8");
    expect(screen.getByRole("table")).not.toHaveTextContent(EMAIL_SOFIA);
    fireEvent.click(screen.getByRole("button", { name: "Abrir denúncia DEN-2026-0042" }));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Ver identidade" })).toBeInTheDocument();
  });

  it("uma denúncia de outra organização não aparece na gestão nem na lista da pessoa, mesmo feita pela mesma pessoa", () => {
    submeter({ ...FORMULARIO_VAZIO, anonima: false, nome: SOFIA, tipo: "fraude", descricao: "x".repeat(40), quando: "Hoje", boaFe: true },
      { organizationId: OUTRA_ORG.id, pessoaId: "p-sofia" });
    mostrar("/rh-exemplo/denuncias");
    expect(linhas()).toHaveLength(12);
    expect(screen.queryByText("DEN-2026-0042")).not.toBeInTheDocument();
    cleanup();
    mostrar("/rh-exemplo/minhas-denuncias");
    expect(cartoes()).toHaveLength(2);
    expect(screen.queryByText("DEN-2026-0042")).not.toBeInTheDocument();
  });

  it("não há nenhum Select de filial ou centro, nem coluna de filial ou centro, na gestão", () => {
    mostrar("/rh-exemplo/denuncias");
    expect(screen.getAllByRole("combobox")).toHaveLength(3);
    for (const nome of ["Estado", "Tipo", "Responsável"]) expect(screen.getByRole("combobox", { name: nome })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /filial|centro|local/i })).not.toBeInTheDocument();
    const colunas = within(screen.getByRole("table")).getAllByRole("columnheader").map((c) => c.textContent);
    expect(colunas.join(" ")).not.toMatch(/filial|centro|local/i);
    expect(screen.queryByLabelText(/filial|centro/i)).not.toBeInTheDocument();
  });
});


// Arranque do Portal do colaborador (a página pública do link): a navegação com as duas secções e a certa por token, o selo do
// prazo, o acesso terminado sem navegação, e a troca de documentos nos dois sentidos (a pessoa envia e o RH vê; o RH pede e a
// pessoa vê; a pessoa pede e o RH responde), com a ficha de RH a usar a mesma loja. Tudo em memória, sem base.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { repor } from "@/components/rh-exemplo/dados/loja";
import { lerPortal } from "@/components/rh-exemplo/dados/lojaPortalDocumentos";
import { PortalColaboradorRh } from "@/components/rh-exemplo/portal/PortalColaboradorRh";
import PessoaRhDetalhe from "./PessoaRhDetalhe";
import RhPortalColaborador from "./RhPortalColaborador";

const portal = (token: string, pesquisa = "") =>
  render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[`/rh-exemplo/portal-colaborador/${token}${pesquisa}`]}>
        <Routes>
          <Route path="/rh-exemplo/portal-colaborador/:token" element={<RhPortalColaborador />} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );

const lado = (pessoaId: string) =>
  render(
    <LanguageProvider>
      <MemoryRouter>
        <PortalColaboradorRh pessoaId={pessoaId} />
      </MemoryRouter>
    </LanguageProvider>,
  );

const ficha = (id: string) =>
  render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[`/rh-exemplo/pessoas/${id}`]}>
        <Routes>
          <Route path="/rh-exemplo/pessoas/:id" element={<PessoaRhDetalhe />} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );

const pdf = (nome: string) => new File(["conteudo"], nome, { type: "application/pdf" });
const escolher = (...nomes: string[]) =>
  fireEvent.change(screen.getByLabelText("Escolher ficheiros"), { target: { files: nomes.map(pdf) } });
const aba = (nome: RegExp) => fireEvent.mouseDown(screen.getByRole("tab", { name: nome }), { button: 0 });
const nav = () => screen.getByRole("navigation", { name: "Secções do portal" });

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
  (window.HTMLElement.prototype as unknown as Record<string, unknown>).scrollIntoView ??= () => undefined;
});

beforeEach(() => {
  cleanup();
  window.localStorage.setItem("language", "pt");
  repor();
});

describe("a navegação do portal", () => {
  it("mostra a barra com as duas entradas, a secção certa por token e o estado da ficha em texto", () => {
    portal("exemplo");
    const entradas = within(nav()).getAllByRole("link");
    expect(entradas.map((e) => e.textContent)).toEqual([expect.stringContaining("Ficha de admissão"), expect.stringContaining("Documentos")]);
    expect(screen.getByTestId("portal-nav-ficha")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("portal-nav-documentos")).not.toHaveAttribute("aria-current");
    expect(within(screen.getByTestId("portal-nav-ficha")).getByText("A preencher")).toBeInTheDocument();
    expect(within(screen.getByTestId("portal-nav-documentos")).getByText("3 por tratar")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Ficha de admissão" })).toBeInTheDocument();
    cleanup();
    portal("contrato");
    expect(screen.getByTestId("portal-nav-documentos")).toHaveAttribute("aria-current", "page");
    expect(within(screen.getByTestId("portal-nav-documentos")).getByText("3 por tratar")).toBeInTheDocument();
    expect(within(screen.getByTestId("portal-nav-ficha")).getByText("Aprovada")).toBeInTheDocument();
    cleanup();
    portal("assinado");
    expect(screen.getByTestId("portal-nav-ficha")).toHaveAttribute("aria-current", "page");
    expect(within(screen.getByTestId("portal-nav-documentos")).queryByText(/por tratar/)).not.toBeInTheDocument();
  });

  it.each([
    ["devolvida", "Devolvida"], ["submetida", "Submetida"], ["exemplo", "A preencher"], ["lara", "A preencher"],
  ])("a etiqueta da ficha do token «%s» é «%s»", (token, etiqueta) => {
    portal(token);
    expect(within(screen.getByTestId("portal-nav-ficha")).getByText(etiqueta)).toBeInTheDocument();
  });

  it("a secção ativa fica no endereço: a ligação muda de secção e a aba abre pelo endereço", () => {
    portal("exemplo", "?sec=documentos&aba=pedidos");
    expect(screen.getByRole("tab", { selected: true, name: /Pedidos do RH/ })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("portal-nav-ficha"));
    expect(screen.getByRole("heading", { level: 1, name: "Ficha de admissão" })).toBeInTheDocument();
    expect(screen.getByTestId("portal-nav-ficha")).toHaveAttribute("aria-current", "page");
  });

  it("mostra os passos da admissão com o atual marcado (e a cor não é o único sinal: há texto)", () => {
    portal("submetida");
    const passos = screen.getByRole("navigation", { name: "Passos da admissão" });
    expect(within(passos).getByText("Aprovação do RH").closest("li")).toHaveAttribute("aria-current", "step");
    expect(within(passos).getByText("Ficha").closest("li")).toHaveTextContent("Feito");
    expect(within(passos).getByText("Contrato").closest("li")).toHaveTextContent("Por fazer");
    expect(within(passos).getAllByRole("listitem")).toHaveLength(4);
  });

  it("o selo do prazo avisa a âmbar, com texto, quando restam menos de 2 dias", () => {
    portal("exemplo");
    const selo = screen.getByTestId("portal-selo");
    expect(selo).toHaveAttribute("data-aviso", "sim");
    expect(selo).toHaveTextContent(/Acesso temporário · termina a \d\d\/\d\d às \d\d:\d\d \(\d+ (?:h|dias?)\)/);
    expect(selo).toHaveTextContent("Termina em breve");
    cleanup();
    portal("contrato");
    expect(screen.getByTestId("portal-selo")).toHaveAttribute("data-aviso", "nao");
    expect(screen.getByTestId("portal-selo")).toHaveTextContent(/\(5 dias\)/);
    expect(screen.getByTestId("portal-selo")).not.toHaveTextContent("Termina em breve");
  });

  it("o cabeçalho tem a organização, «Portal do colaborador» e o nome da pessoa; «Sair» fecha e o mesmo link volta a entrar", () => {
    portal("contrato");
    const cabecalho = screen.getByRole("banner");
    expect(within(cabecalho).getByText("Olyvia Retail (exemplo)")).toBeInTheDocument();
    expect(within(cabecalho).getByText("Portal do colaborador")).toBeInTheDocument();
    expect(within(cabecalho).getByText("Vasco Duarte")).toBeInTheDocument();
    fireEvent.click(within(cabecalho).getByRole("button", { name: "Sair" }));
    expect(screen.getByRole("heading", { level: 1, name: "Saíste do portal" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Secções do portal" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Voltar a entrar" }));
    expect(screen.getByTestId("portal-colaborador")).toBeInTheDocument();
  });

  it.each([["expirada", "O teu acesso temporário terminou"], ["revogada", "Este link já não é válido"]])(
    "o token «%s» mostra o acesso terminado, com instruções e sem navegação",
    (token, titulo) => {
      portal(token);
      expect(screen.getByRole("heading", { level: 1, name: titulo })).toBeInTheDocument();
      expect(screen.getByText("O que fazer")).toBeInTheDocument();
      expect(screen.queryByRole("navigation", { name: "Secções do portal" })).not.toBeInTheDocument();
      expect(screen.queryByTestId("portal-colaborador")).not.toBeInTheDocument();
    },
  );

  it("um token desconhecido também não tem navegação", () => {
    portal("qualquer");
    expect(screen.queryByRole("navigation", { name: "Secções do portal" })).not.toBeInTheDocument();
    expect(screen.getByText("O que fazer")).toBeInTheDocument();
  });
});

describe("Documentos: recebidos, pedidos do RH e os meus pedidos", () => {
  it("«Recebidos» mostra o regulamento como novo; ver marca-o como visto e descarregar diz o que fez", () => {
    portal("exemplo", "?sec=documentos");
    const item = screen.getByTestId("recebido-dr-beatriz-1");
    expect(within(item).getByText("Novo")).toBeInTheDocument();
    fireEvent.click(within(item).getByRole("button", { name: "Ver" }));
    expect(within(item).getByText("Visto")).toBeInTheDocument();
    expect(within(item).getByRole("button", { name: "Fechar" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(within(item).getByRole("button", { name: "Descarregar" }));
    expect(within(item).getByText(/Cópia de exemplo de «Regulamento interno.pdf» descarregada/)).toBeInTheDocument();
    expect(lerPortal("p-beatriz").vistos).toContain("dr-beatriz-1");
  });

  it("a pessoa envia um documento pedido (só nomes, máximo 4) e o RH vê-o por aceitar", () => {
    portal("exemplo", "?sec=documentos&aba=pedidos");
    const pedido = screen.getByTestId("pedido-rh-pr-beatriz-1");
    fireEvent.click(within(pedido).getByRole("button", { name: "Enviar: Cartão de cidadão" }));
    fireEvent.click(within(pedido).getByRole("button", { name: "Enviar ficheiros" }));
    expect(within(pedido).getByRole("alert")).toHaveTextContent("Escolhe pelo menos um ficheiro");
    escolher("cc-frente.pdf", "cc-verso.pdf");
    expect(within(pedido).getByText("2 de 4 ficheiros")).toBeInTheDocument();
    fireEvent.click(within(pedido).getByRole("button", { name: "Enviar ficheiros" }));
    expect(lerPortal("p-beatriz").pedidosRh[0]).toMatchObject({ estado: "enviado", ficheiros: ["cc-frente.pdf", "cc-verso.pdf"] });
    expect(screen.queryByTestId("pedido-rh-pr-beatriz-1")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("enviado-pr-beatriz-1")).getByText("Enviado")).toBeInTheDocument();
    cleanup();
    lado("p-beatriz");
    const linha = screen.getByTestId("rh-pedido-pr-beatriz-1");
    expect(within(linha).getByText("Enviado")).toBeInTheDocument();
    expect(within(linha).getByText(/cc-frente.pdf, cc-verso.pdf/)).toBeInTheDocument();
    fireEvent.click(within(linha).getByRole("button", { name: "Aceitar: Cartão de cidadão" }));
    expect(lerPortal("p-beatriz").pedidosRh[0].estado).toBe("aceite");
  });

  it("não deixa escolher mais de 4 ficheiros por documento, nem formatos que o convite não aceita", () => {
    portal("exemplo", "?sec=documentos&aba=pedidos");
    const pedido = screen.getByTestId("pedido-rh-pr-beatriz-1");
    fireEvent.click(within(pedido).getByRole("button", { name: "Enviar: Cartão de cidadão" }));
    escolher("a.pdf", "b.pdf", "c.pdf", "d.pdf");
    expect(within(pedido).getByText("4 de 4 ficheiros")).toBeInTheDocument();
    escolher("e.pdf");
    expect(within(pedido).getByRole("alert")).toHaveTextContent("No máximo 4 ficheiros por documento");
    expect(within(pedido).getByText("4 de 4 ficheiros")).toBeInTheDocument();
    fireEvent.click(within(pedido).getByRole("button", { name: "Remover d.pdf" }));
    expect(within(pedido).getByText("3 de 4 ficheiros")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Escolher ficheiros"), { target: { files: [new File(["x"], "virus.exe", { type: "application/x-msdownload" })] } });
    expect(within(pedido).getByRole("alert")).toBeInTheDocument();
    expect(within(pedido).getByText("3 de 4 ficheiros")).toBeInTheDocument();
  });

  it("o RH recusa com motivo (mínimo 3 caracteres) e a pessoa vê o motivo e pode enviar de novo", () => {
    portal("submetida", "?sec=documentos&aba=pedidos");
    expect(screen.getByRole("heading", { level: 3, name: "Enviados por mim" })).toBeInTheDocument();
    cleanup();
    lado("p-marco");
    const linha = screen.getByTestId("rh-pedido-pr-marco-2");
    fireEvent.click(within(linha).getByRole("button", { name: "Recusar: Comprovativo de IBAN" }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.change(within(dialogo).getByRole("textbox"), { target: { value: "ab" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Recusar" }));
    expect(within(dialogo).getByRole("alert")).toHaveTextContent("pelo menos 3 caracteres");
    expect(lerPortal("p-marco").pedidosRh[1].estado).toBe("enviado");
    fireEvent.change(within(dialogo).getByRole("textbox"), { target: { value: "Documento cortado" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Recusar" }));
    expect(lerPortal("p-marco").pedidosRh[1]).toMatchObject({ estado: "recusado", motivoRecusa: "Documento cortado" });
    cleanup();
    portal("submetida", "?sec=documentos&aba=pedidos");
    const pedido = screen.getByTestId("pedido-rh-pr-marco-2");
    expect(within(pedido).getByText("O RH recusou: Documento cortado")).toBeInTheDocument();
    expect(within(pedido).getByRole("button", { name: "Enviar: Comprovativo de IBAN" })).toHaveTextContent("Enviar de novo");
  });

  it("o RH pede um documento (tipo, prazo, nota) e a pessoa vê-o por enviar", () => {
    lado("p-vasco");
    fireEvent.click(screen.getByRole("button", { name: "Pedir documento à pessoa" }));
    const dialogo = screen.getByRole("dialog", { name: "Pedir documento à pessoa" });
    fireEvent.change(within(dialogo).getByLabelText("Tipo de documento"), { target: { value: "outro" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Pedir à pessoa" }));
    expect(within(dialogo).getByRole("alert")).toHaveTextContent("Diz que documento é");
    fireEvent.change(within(dialogo).getByLabelText("Que documento?"), { target: { value: "Certificado de habilitações" } });
    fireEvent.change(within(dialogo).getByLabelText("Prazo"), { target: { value: "2026-10-30" } });
    fireEvent.change(within(dialogo).getByLabelText("Nota para o RH (opcional)"), { target: { value: "Cópia simples" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Pedir à pessoa" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    cleanup();
    portal("contrato", "?sec=documentos&aba=pedidos");
    const novo = screen.getByRole("heading", { level: 3, name: "Certificado de habilitações" }).closest("li") as HTMLElement;
    expect(within(novo).getByText("Por enviar")).toBeInTheDocument();
    expect(within(novo).getByText("Prazo: 30/10")).toBeInTheDocument();
    expect(within(novo).getByText("Cópia simples")).toBeInTheDocument();
    expect(within(screen.getByTestId("portal-nav-documentos")).getByText("4 por tratar")).toBeInTheDocument();
  });

  it("a pessoa pede um documento ao RH, o RH responde e ele aparece em «Recebidos» e como «Disponível»", () => {
    portal("contrato", "?sec=documentos&aba=meus");
    fireEvent.click(screen.getByRole("button", { name: "Pedir documento" }));
    const painel = screen.getByRole("dialog", { name: "Pedir documento ao RH" });
    expect(within(painel).getByLabelText("Tipo de documento")).toHaveValue("declaracao_vinculo");
    fireEvent.click(within(painel).getByRole("radio", { name: "Urgente" }));
    fireEvent.change(within(painel).getByLabelText("Nota para o RH (opcional)"), { target: { value: "Para o banco" } });
    fireEvent.click(within(painel).getByRole("button", { name: "Enviar pedido" }));
    const meu = screen.getByTestId("meu-pedido-pp-1");
    expect(within(meu).getByText("Pedido")).toBeInTheDocument();
    expect(within(meu).getByText(/Urgente/)).toBeInTheDocument();
    cleanup();

    lado("p-vasco");
    const linha = screen.getByTestId("rh-pedido-pessoa-pp-1");
    fireEvent.click(within(linha).getByRole("button", { name: "Marcar em preparação: Declaração de vínculo" }));
    expect(within(linha).getByText("Em preparação")).toBeInTheDocument();
    fireEvent.click(within(linha).getByRole("button", { name: "Responder: Declaração de vínculo" }));
    const resposta = screen.getByRole("dialog", { name: "Responder ao pedido: Declaração de vínculo" });
    fireEvent.click(within(resposta).getByRole("button", { name: "Enviar à pessoa" }));
    expect(within(resposta).getByRole("alert")).toHaveTextContent("Escolhe pelo menos um ficheiro");
    escolher("declaracao-vasco.pdf");
    fireEvent.click(within(resposta).getByRole("button", { name: "Enviar à pessoa" }));
    expect(within(screen.getByTestId("rh-pedido-pessoa-pp-1")).getByText("Disponível")).toBeInTheDocument();
    cleanup();

    portal("contrato", "?sec=documentos&aba=meus");
    const disponivel = screen.getByTestId("meu-pedido-pp-1");
    expect(within(disponivel).getByText("Disponível")).toBeInTheDocument();
    expect(within(disponivel).getByText(/Já está em Recebidos: declaracao-vasco.pdf/)).toBeInTheDocument();
    fireEvent.click(within(disponivel).getByRole("link", { name: "Ver em Recebidos" }));
    expect(screen.getByRole("tab", { selected: true, name: /Recebidos/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Declaração de vínculo" })).toBeInTheDocument();
  });

  it("o RH recusa um pedido da pessoa com motivo e a pessoa vê o motivo", () => {
    portal("contrato", "?sec=documentos&aba=meus");
    fireEvent.click(screen.getByRole("button", { name: "Pedir documento" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Enviar pedido" }));
    cleanup();
    lado("p-vasco");
    fireEvent.click(screen.getByRole("button", { name: "Recusar: Declaração de vínculo" }));
    const dialogo = screen.getByRole("dialog");
    fireEvent.change(within(dialogo).getByRole("textbox"), { target: { value: "Já foi emitida em setembro" } });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Recusar" }));
    cleanup();
    portal("contrato", "?sec=documentos&aba=meus");
    const meu = screen.getByTestId("meu-pedido-pp-1");
    expect(within(meu).getByText("Recusado")).toBeInTheDocument();
    expect(within(meu).getByText("O RH recusou: Já foi emitida em setembro")).toBeInTheDocument();
  });

  it("o RH envia um documento que pede assinatura; a pessoa assina com o nome completo e o RH vê «Assinado»", () => {
    lado("p-vasco");
    fireEvent.click(screen.getByRole("button", { name: "Enviar documento à pessoa" }));
    const dialogo = screen.getByRole("dialog", { name: "Enviar documento à pessoa" });
    expect(within(dialogo).queryByRole("option", { name: "Contrato de trabalho sem termo" })).not.toBeInTheDocument();
    fireEvent.change(within(dialogo).getByLabelText("Documento"), { target: { value: "mod-outro" } });
    fireEvent.click(within(dialogo).getByRole("checkbox", { name: "Precisa de assinatura da pessoa" }));
    fireEvent.click(within(dialogo).getByRole("button", { name: "Enviar à pessoa" }));
    cleanup();

    portal("contrato", "?sec=documentos");
    const item = screen.getByRole("heading", { level: 3, name: "Acordo de confidencialidade" }).closest("li") as HTMLElement;
    expect(within(item).getByText("Novo")).toBeInTheDocument();
    fireEvent.click(within(item).getByRole("button", { name: "Assinar" }));
    expect(within(item).getByRole("alert")).toHaveTextContent("Aceite");
    fireEvent.click(within(item).getByRole("checkbox", { name: "Li o documento e aceito." }));
    fireEvent.change(within(item).getByLabelText("Escreve o teu nome completo para assinar"), { target: { value: "Vasco Duarte" } });
    fireEvent.click(within(item).getByRole("button", { name: "Assinar" }));
    expect(within(item).getByText("Assinado")).toBeInTheDocument();
    cleanup();
    lado("p-vasco");
    expect(within(screen.getByTestId("rh-trocas")).getAllByText("Assinado").length).toBeGreaterThan(0);
  });

  it("o contrato aparece em Recebidos como documento por assinar e recusar assinar chega ao RH", () => {
    portal("contrato", "?sec=documentos");
    const contrato = screen.getByTestId("recebido-contrato");
    expect(within(contrato).getByText("Novo")).toBeInTheDocument();
    expect(within(contrato).getByText("Este documento está por assinar.")).toBeInTheDocument();
    fireEvent.click(within(contrato).getByRole("button", { name: "Recusar assinar" }));
    fireEvent.change(within(contrato).getByLabelText("Porque não queres assinar?"), { target: { value: "Horário errado" } });
    fireEvent.click(within(contrato).getByRole("button", { name: "Enviar recusa" }));
    cleanup();
    lado("p-vasco");
    expect(screen.getByText(/A pessoa recusou assinar: Horário errado/)).toBeInTheDocument();
  });

  it("assinar o contrato não tira a pessoa de Documentos (a secção fica a da abertura)", () => {
    portal("contrato");
    const contrato = screen.getByTestId("recebido-contrato");
    fireEvent.click(within(contrato).getByRole("checkbox", { name: "Li o contrato e aceito." }));
    fireEvent.change(within(contrato).getByLabelText("Escreve o teu nome completo para assinar"), { target: { value: "Vasco Duarte" } });
    fireEvent.click(within(contrato).getByRole("button", { name: "Assinar" }));
    expect(within(screen.getByTestId("recebido-contrato")).getByText(/Assinado por Vasco Duarte/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Documentos" })).toBeInTheDocument();
    expect(screen.getByTestId("portal-nav-documentos")).toHaveAttribute("aria-current", "page");
    expect(within(screen.getByTestId("portal-nav-documentos")).getByText("2 por tratar")).toBeInTheDocument();
  });

  it("na ficha de quem já assinou, as trocas mostram o contrato assinado e a cópia que a pessoa pediu", () => {
    lado("p-eva");
    const trocas = within(screen.getByTestId("rh-trocas"));
    expect(trocas.getByTestId("rh-recebido-contrato")).toHaveTextContent("Assinado");
    expect(trocas.getByTestId("rh-pedido-pessoa-pp-eva-1")).toHaveTextContent("Disponível");
    expect(trocas.getByTestId("rh-recebido-dr-eva-2")).toHaveTextContent("Cópia do contrato");
    expect(screen.getByTestId("rh-portal-endereco").textContent).toMatch(/\/rh-exemplo\/portal-colaborador\/assinado$/);
  });
});

describe("a ficha de RH", () => {
  it("em admissão, a Visão geral mostra o portal em resumo e «Gerir em Documentos» abre as trocas", () => {
    ficha("p-beatriz");
    const cartao = screen.getByTestId("rh-portal-colaborador");
    expect(within(cartao).getByTestId("rh-portal-endereco").textContent).toMatch(/\/rh-exemplo\/portal-colaborador\/exemplo$/);
    expect(within(cartao).getByText(/O acesso termina a \d\d\/\d\d às \d\d:\d\d/)).toBeInTheDocument();
    expect(within(cartao).getByText("Nada à espera do RH.")).toBeInTheDocument();
    expect(within(cartao).queryByRole("button", { name: "Enviar documento à pessoa" })).not.toBeInTheDocument();
    act(() => fireEvent.click(within(cartao).getByRole("button", { name: "Gerir em Documentos" })));
    expect(screen.getByRole("button", { name: "Enviar documento à pessoa" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pedir documento à pessoa" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Trocas com a pessoa" })).toBeInTheDocument();
  });

  it("quem não está em admissão não tem portal", () => {
    ficha("p-sofia");
    expect(screen.queryByTestId("rh-portal-colaborador")).not.toBeInTheDocument();
  });
});

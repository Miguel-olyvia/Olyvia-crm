import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "pt" }) }));
vi.mock("@/components/RichTextEditor", () => ({
  RichTextEditor: ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
    <textarea aria-label={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import { ConteudoPorIdioma } from "../ConteudoPorIdioma";
import { SeccoesPorIdioma } from "../SeccoesPorIdioma";

const SECCOES = [
  { id: "header", type: "header", label: "Cabeçalho", visible: true, settings: { customTitle: "PROPOSTA" } },
  { id: "terms", type: "terms", label: "Condições Gerais", visible: true, settings: { sectionLabel: "CONDIÇÕES GERAIS" } },
  { id: "client_info", type: "client_info", label: "Cliente", visible: false, settings: { sectionLabel: "CLIENTE" } },
  { id: "custom_1", type: "custom", label: "Garantia", visible: true, settings: { content: "Dois anos" } },
  { id: "footer", type: "footer", label: "Rodapé", visible: true, settings: {} },
];

describe("SeccoesPorIdioma", () => {
  function montar(valores: Record<string, string> = {}) {
    const onEscrever = vi.fn();
    render(
      <SeccoesPorIdioma
        codigo="en"
        seccoes={SECCOES}
        valorDaSeccao={(id, campo) => valores[`${id}.${campo}`] ?? ""}
        onEscrever={onEscrever}
      />,
    );
    return onEscrever;
  }

  it("mostra só os campos de texto de cada secção, cada um com um nome acessível único", () => {
    montar();
    const nomes = screen.getAllByRole("textbox").map((e) => e.getAttribute("aria-label"));
    expect(new Set(nomes).size).toBe(nomes.length);
    expect(nomes).toEqual(expect.arrayContaining([
      "Cabeçalho · Título personalizado",
      "Cabeçalho · Nome da secção",
      "Condições Gerais · Título visível na proposta",
      "Garantia · Nome da secção",
      "Garantia · Conteúdo",
    ]));
    // sem interruptores, sem arrastar, sem ícones: só texto
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("a secção do rodapé só tem o nome (não tem título visível)", () => {
    montar();
    expect(screen.getByLabelText("Rodapé · Nome da secção")).toBeInTheDocument();
    expect(screen.queryByLabelText("Rodapé · Título visível na proposta")).toBeNull();
  });

  it("assinala as secções escondidas com texto", () => {
    montar();
    expect(screen.getByText("Cliente")).toBeInTheDocument();
    expect(screen.getAllByText("(escondida)")).toHaveLength(1);
  });

  it("mostra o português ao lado de cada campo", () => {
    montar();
    expect(screen.getByText("Português: PROPOSTA")).toBeInTheDocument();
    expect(screen.getByText("Português: Dois anos")).toBeInTheDocument();
  });

  it("escrever chama onEscrever com o id, o campo e o valor", () => {
    const onEscrever = montar();
    fireEvent.change(screen.getByLabelText("Cabeçalho · Título personalizado"), { target: { value: "PROPOSAL" } });
    expect(onEscrever).toHaveBeenCalledWith("header", "customTitle", "PROPOSAL");
    fireEvent.change(screen.getByLabelText("Garantia · Conteúdo"), { target: { value: "Two years" } });
    expect(onEscrever).toHaveBeenCalledWith("custom_1", "content", "Two years");
  });

  it("mostra o valor já traduzido", () => {
    montar({ "terms.sectionLabel": "GENERAL TERMS" });
    expect(screen.getByLabelText("Condições Gerais · Título visível na proposta")).toHaveValue("GENERAL TERMS");
  });

  it("sem secções não rebenta", () => {
    render(<SeccoesPorIdioma codigo="en" seccoes={[]} valorDaSeccao={() => ""} onEscrever={vi.fn()} />);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });
});

describe("ConteudoPorIdioma", () => {
  const BASE = {
    header_text: "",
    footer_text: "Rodapé pt",
    terms_conditions: "Termos pt",
    thank_you_message: "Obrigado",
    accept_button_text: "Aceitar Proposta",
    reject_button_text: "Recusar",
    email_subject: "Proposta: {{titulo_proposta}}",
    email_body: "<p>Olá <strong>cliente</strong></p>",
    verification_email_subject: "Código",
    verification_email_body: "<p>Código</p>",
    accept_enabled: true,
    accept_verification_method: "none" as "none" | "email",
  };

  function montar(extra: Partial<typeof BASE> = {}, valores: Record<string, string> = {}) {
    const onEscrever = vi.fn();
    render(<ConteudoPorIdioma codigo="en" base={{ ...BASE, ...extra }} valorDoTexto={(c) => valores[c] ?? ""} onEscrever={onEscrever} />);
    return onEscrever;
  }

  it("mostra os campos de texto que o editor mostra, com nomes únicos", () => {
    montar();
    const nomes = [...screen.getAllByRole("textbox")].map((e) => e.getAttribute("aria-label") ?? e.id);
    expect(screen.getByLabelText("Termos e condições")).toBeInTheDocument();
    expect(screen.getByLabelText("Mensagem na proposta")).toBeInTheDocument();
    expect(screen.getByLabelText("Texto do rodapé")).toBeInTheDocument();
    expect(screen.getByLabelText("Texto do botão Aceitar")).toBeInTheDocument();
    expect(screen.getByLabelText("Texto do botão Recusar")).toBeInTheDocument();
    expect(screen.getByLabelText("Assunto do email")).toBeInTheDocument();
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it("o texto do cabeçalho só aparece se o português o tiver", () => {
    montar();
    expect(screen.queryByLabelText("Texto do cabeçalho")).toBeNull();
  });

  it("com texto de cabeçalho em português, aparece", () => {
    montar({ header_text: "Cabeçalho pt" });
    expect(screen.getByLabelText("Texto do cabeçalho")).toBeInTheDocument();
  });

  it("os emails de verificação só aparecem com verificação por email ligada", () => {
    montar();
    expect(screen.queryByLabelText("Assunto do email de verificação")).toBeNull();
  });

  it("com verificação por email aparecem", () => {
    montar({ accept_verification_method: "email" });
    expect(screen.getByLabelText("Assunto do email de verificação")).toBeInTheDocument();
    expect(screen.getByText("Corpo do email de verificação")).toBeInTheDocument();
  });

  it("mostra o texto em português de cada campo (sem tags) e o aviso de que cai no português", () => {
    montar();
    expect(screen.getByText("Rodapé pt")).toBeInTheDocument();
    expect(screen.getByText("Olá cliente")).toBeInTheDocument();
    expect(screen.getAllByText("Se ficar vazio, usa-se o texto em português.").length).toBeGreaterThan(0);
  });

  it("escrever chama onEscrever com a chave do campo", () => {
    const onEscrever = montar();
    fireEvent.change(screen.getByLabelText("Texto do botão Aceitar"), { target: { value: "Accept Proposal" } });
    expect(onEscrever).toHaveBeenCalledWith("accept_button_text", "Accept Proposal");
    fireEvent.change(screen.getByLabelText("Termos e condições"), { target: { value: "Terms" } });
    expect(onEscrever).toHaveBeenCalledWith("terms_conditions", "Terms");
  });

  it("o corpo do email (HTML) vazio de texto grava-se como vazio", () => {
    const onEscrever = montar();
    fireEvent.change(screen.getByLabelText("Corpo do email (inglês)"), { target: { value: "<p></p>" } });
    expect(onEscrever).toHaveBeenCalledWith("email_body", "");
  });

  it("o corpo do email com texto passa tal e qual", () => {
    const onEscrever = montar();
    fireEvent.change(screen.getByLabelText("Corpo do email (inglês)"), { target: { value: "<p>Hello</p>" } });
    expect(onEscrever).toHaveBeenCalledWith("email_body", "<p>Hello</p>");
  });

  it("mostra o valor já traduzido", () => {
    montar({}, { footer_text: "English footer" });
    expect(screen.getByLabelText("Texto do rodapé")).toHaveValue("English footer");
  });
});

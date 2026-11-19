// Clicar num item de «O que falta traduzir» leva ao campo, no idioma aberto (estado das versões partilhado).
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "pt" }) }));

import { PainelDaVersao } from "../PainelDaVersao";
import { useVersoesDaProposta } from "../useVersoesDaProposta";

const CONFIG = {
  header_text: "",
  footer_text: "Rodapé em português",
  terms_conditions: "Termos em português",
  thank_you_message: "Obrigado",
  accept_button_text: "Aceitar Proposta",
  reject_button_text: "Recusar",
  email_subject: "Assunto pt",
  email_body: "<p>Olá</p>",
  verification_email_subject: "Código",
  verification_email_body: "<p>Código</p>",
  accept_enabled: true,
  accept_verification_method: "none" as "none" | "email",
  sections: [
    { id: "header", type: "header", label: "Cabeçalho", visible: true, settings: { customTitle: "PROPOSTA" } },
    { id: "terms", type: "terms", label: "Condições Gerais", visible: true, settings: { sectionLabel: "CONDIÇÕES GERAIS" } },
    { id: "custom_1", type: "custom", label: "Garantia", visible: true, settings: { content: "Dois anos" } },
  ],
};

let ultimo: ReturnType<typeof useVersoesDaProposta<typeof CONFIG>>;

function Harness({ config = CONFIG }: { config?: typeof CONFIG }) {
  const versoes = useVersoesDaProposta(config);
  ultimo = versoes;
  useEffect(() => versoes.adicionar("en", true), []); // eslint-disable-line react-hooks/exhaustive-deps
  if (versoes.ehBase) return null;
  return (
    <>
      <p data-testid="contador">{versoes.resumoAtivo?.faltam}</p>
      <PainelDaVersao versoes={versoes} config={config} />
    </>
  );
}

const ir = (nome: string | RegExp) => fireEvent.click(screen.getByRole("button", { name: nome }));
const aba = (nome: string) => fireEvent.mouseDown(screen.getByRole("tab", { name: nome }), { button: 0 });
const emUso = (nome: string) => screen.getByRole("tab", { name: nome }).getAttribute("data-state");

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("PainelDaVersao — ir para o campo", () => {
  it("campo de secção, estando no separador Conteúdo: muda para Secções, foca e destaca", async () => {
    render(<Harness />);
    aba("Conteúdo");
    expect(emUso("Conteúdo")).toBe("active");
    ir("Ir para: Secção «Condições Gerais» · Título visível na proposta");
    expect(emUso("Secções")).toBe("active");
    const campo = await screen.findByLabelText("Condições Gerais · Título visível na proposta");
    await waitFor(() => expect(campo).toHaveFocus());
    expect(campo.closest("[data-destacado]")).toHaveAttribute("data-destacado", "true");
  });

  it("campo de texto, estando em Secções: muda para Conteúdo e foca o campo", async () => {
    render(<Harness />);
    expect(emUso("Secções")).toBe("active");
    ir("Ir para: Texto do rodapé");
    expect(emUso("Conteúdo")).toBe("active");
    await waitFor(() => expect(screen.getByLabelText("Texto do rodapé")).toHaveFocus());
  });

  it("botões Aceitar/Recusar e assunto do email (campos curtos) também", async () => {
    render(<Harness />);
    ir("Ir para: Texto do botão Aceitar");
    await waitFor(() => expect(screen.getByLabelText("Texto do botão Aceitar")).toHaveFocus());
    ir("Ir para: Assunto do email");
    await waitFor(() => expect(screen.getByLabelText("Assunto do email")).toHaveFocus());
  });

  it("conteúdo de uma secção personalizada: foca a caixa de texto", async () => {
    render(<Harness />);
    aba("Conteúdo");
    ir("Ir para: Secção «Garantia» · Conteúdo");
    await waitFor(() => expect(screen.getByLabelText("Garantia · Conteúdo")).toHaveFocus());
  });

  it("corpo do email (editor rico): o foco vai para o editável", async () => {
    render(<Harness />);
    ir("Ir para: Corpo do email");
    await waitFor(() => expect(document.querySelector<HTMLElement>('[contenteditable="true"]')).toHaveFocus());
    const editavel = document.querySelector<HTMLElement>('[contenteditable="true"]')!;
    expect(editavel.closest("[data-destacado]")).toHaveAttribute("data-destacado", "true");
  });

  it("campos do email de verificação, com a verificação desligada, aparecem para se poder traduzir", async () => {
    render(<Harness />);
    expect(screen.queryByLabelText("Assunto do email de verificação")).toBeNull();
    ir("Ir para: Assunto do email de verificação");
    await waitFor(() => expect(screen.getByLabelText("Assunto do email de verificação")).toHaveFocus());
  });

  it("depois de escrever no campo, o cartão passa a «Traduzido» e o contador desce", () => {
    render(<Harness />);
    const antes = Number(screen.getByTestId("contador").textContent);
    expect(screen.getByRole("button", { name: "Ir para: Texto do rodapé" })).toHaveAccessibleDescription("Igual ao português");
    ir("Ir para: Texto do rodapé");
    fireEvent.change(screen.getByLabelText("Texto do rodapé"), { target: { value: "English footer" } });
    expect(screen.getByRole("button", { name: "Ir para: Texto do rodapé" })).toHaveAccessibleDescription("Traduzido");
    expect(Number(screen.getByTestId("contador").textContent)).toBe(antes - 1);
  });

  it("escreve no mesmo estado das versões que os separadores usam (uma só fonte)", () => {
    render(<Harness />);
    ir("Ir para: Texto do rodapé");
    fireEvent.change(screen.getByLabelText("Texto do rodapé"), { target: { value: "English footer" } });
    expect((ultimo.versoes.en as Record<string, unknown>).footer_text).toBe("English footer");
    expect(ultimo.configVisivel.footer_text).toBe("English footer");
  });

  it("não perde o que se escreveu ao mudar de separador", () => {
    render(<Harness />);
    ir("Ir para: Texto do rodapé");
    fireEvent.change(screen.getByLabelText("Texto do rodapé"), { target: { value: "English footer" } });
    aba("Secções");
    aba("Conteúdo");
    expect(screen.getByLabelText("Texto do rodapé")).toHaveValue("English footer");
  });

  it("clicar num cartão só muda o separador e o foco: não altera nenhuma versão", () => {
    render(<Harness />);
    const antes = JSON.stringify(ultimo.versoes);
    ir("Ir para: Texto do rodapé");
    expect(JSON.stringify(ultimo.versoes)).toBe(antes);
  });

  it("o destaque desaparece sozinho", () => {
    vi.useFakeTimers();
    try {
      render(<Harness />);
      ir("Ir para: Texto do rodapé");
      act(() => { vi.advanceTimersByTime(50); }); // o separador monta numa 2.ª renderização; o destaque chega logo a seguir
      expect(document.querySelector("[data-destacado]")).not.toBeNull();
      act(() => { vi.advanceTimersByTime(2100); });
      expect(document.querySelector("[data-destacado]")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

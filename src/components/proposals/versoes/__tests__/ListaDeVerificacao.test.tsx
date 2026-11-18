import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "pt" }) }));

import { ListaDeVerificacao } from "../ListaDeVerificacao";
import type { CampoDeVerificacao } from "../modeloVersoes";

const CAMPOS: CampoDeVerificacao[] = [
  { chave: "footer_text", tipo: "texto", campo: "footer_text", base: "Rodapé em português", traduzido: "English footer", estado: "traduzido" },
  { chave: "terms_conditions", tipo: "texto", campo: "terms_conditions", base: "Termos", traduzido: "Termos", estado: "igual" },
  { chave: "email_body", tipo: "texto", campo: "email_body", base: "<p>Olá <strong>cliente</strong></p>", traduzido: "", estado: "falta" },
  { chave: "sections.terms.sectionLabel", tipo: "seccao", campo: "sectionLabel", seccaoId: "terms", base: "CONDIÇÕES GERAIS", traduzido: "", estado: "falta" },
];

function montar(extra: Partial<React.ComponentProps<typeof ListaDeVerificacao>> = {}) {
  const props = {
    codigo: "en",
    campos: CAMPOS,
    seccoes: [{ id: "terms", label: "Condições Gerais" }],
    desatualizado: false,
    onMarcarAtualizada: vi.fn(),
    onRemover: vi.fn(),
    ...extra,
  };
  render(<ListaDeVerificacao {...props} />);
  return props;
}

describe("ListaDeVerificacao", () => {
  it("resume quantos faltam e lista cada campo com o estado escrito por extenso", () => {
    montar();
    expect(screen.getByText("O que falta traduzir")).toBeInTheDocument();
    expect(screen.getByText("3 por traduzir")).toBeInTheDocument();
    const itens = screen.getAllByRole("listitem");
    expect(itens).toHaveLength(4);
    expect(within(itens[0]).getByText("Texto do rodapé")).toBeInTheDocument();
    expect(within(itens[0]).getByText("Traduzido")).toBeInTheDocument();
    expect(within(itens[1]).getByText("Igual ao português")).toBeInTheDocument();
    expect(within(itens[2]).getByText("Em falta")).toBeInTheDocument();
  });

  it("mostra o português ao lado, sem tags", () => {
    montar();
    expect(screen.getByText("Rodapé em português")).toBeInTheDocument();
    expect(screen.getByText("Olá cliente")).toBeInTheDocument();
  });

  it("os campos de secção levam o nome da secção", () => {
    montar();
    expect(screen.getByText("Secção «Condições Gerais» · Título visível na proposta")).toBeInTheDocument();
  });

  it("tudo traduzido: diz-o", () => {
    montar({ campos: [CAMPOS[0]] });
    expect(screen.getByText("Está tudo traduzido")).toBeInTheDocument();
    expect(screen.queryByText(/por traduzir/)).toBeNull();
  });

  it("sem campos (português vazio): não rebenta", () => {
    montar({ campos: [] });
    expect(screen.getByText("Está tudo traduzido")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("aviso de que o português mudou, com botão para marcar como atualizada", () => {
    const props = montar({ desatualizado: true });
    expect(screen.getByText(/O português mudou desde que esta versão foi escrita/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Já revi, marcar como atualizada" }));
    expect(props.onMarcarAtualizada).toHaveBeenCalledTimes(1);
  });

  it("sem desatualização não há aviso", () => {
    montar();
    expect(screen.queryByText(/O português mudou/)).toBeNull();
  });

  it("remover a versão pede confirmação", () => {
    const props = montar();
    fireEvent.click(screen.getByRole("button", { name: "Remover a versão English" }));
    const dialogo = screen.getByRole("alertdialog", { name: "Remover a versão English?" });
    fireEvent.click(within(dialogo).getByRole("button", { name: "Manter" }));
    expect(props.onRemover).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Remover a versão English" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remover" }));
    expect(props.onRemover).toHaveBeenCalledWith("en");
  });
});

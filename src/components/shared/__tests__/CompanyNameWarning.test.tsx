import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CompanyNameWarning } from "@/components/shared/CompanyNameWarning";

describe("CompanyNameWarning", () => {
  it("nao desenha nada quando o nome parece de pessoa", () => {
    const { container } = render(<CompanyNameWarning first="Rui" last="Costa" company="" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("sufixo de empresa: aviso com role=alert e texto explicativo", () => {
    render(<CompanyNameWarning first="Rui" last="Evolar Lda" company="" />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Parece um nome de empresa");
    expect(alert).toHaveTextContent("preencha o campo Empresa");
    expect(alert).toHaveTextContent("propostas e PDFs");
  });

  it("empresa igual ao nome: explica a repeticao", () => {
    render(<CompanyNameWarning first="Rui" last="Costa" company="Rui Costa" />);
    expect(screen.getByRole("alert")).toHaveTextContent("igual ao nome e apelido");
  });

  it("no formulario de cliente sem campo Empresa, manda escolher o tipo Empresa", () => {
    render(<CompanyNameWarning first="Evolar" last="Lda" company="" fix="type" />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("tipo Empresa");
    expect(alert).not.toHaveTextContent("campo Empresa");
  });

  it("tema escuro: classes dark e icone escondido aos leitores de ecra", () => {
    render(<CompanyNameWarning first="Evolar" last="Lda" company="" />);
    const alert = screen.getByRole("alert");
    expect(alert.className).toMatch(/dark:/);
    expect(alert.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});

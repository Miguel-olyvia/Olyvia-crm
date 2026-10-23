// O aviso que a página de contratos mostra antes de anular um contrato ligado a um negócio e gerar o substituto (texto visível).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AvisoSubstitutoNegocio } from "./AvisoSubstitutoNegocio";

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

afterEach(cleanup);

describe("AvisoSubstitutoNegocio", () => {
  it("sem aviso não desenha nada", () => {
    const { container } = render(<AvisoSubstitutoNegocio aviso={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("reabre: diz que o negócio reabre até nova assinatura e que o substituto fica ligado", () => {
    render(<AvisoSubstitutoNegocio aviso="reabre" />);
    const texto = screen.getByRole("alert").textContent ?? "";
    expect(texto).toContain("reabre");
    expect(texto).toContain("nova assinatura");
    expect(texto).toContain("fica ligado");
  });

  it("perdido: diz que o substituto não fica ligado ao negócio", () => {
    render(<AvisoSubstitutoNegocio aviso="perdido" />);
    expect(screen.getByRole("alert")).toHaveTextContent("O negócio está perdido: o substituto não fica ligado a ele.");
  });

  it("a verificar e indisponível: dizem o que se passa em texto visível", () => {
    render(<AvisoSubstitutoNegocio aviso="a_verificar" />);
    expect(screen.getByRole("alert").textContent ?? "").toContain("A verificar");
    cleanup();
    render(<AvisoSubstitutoNegocio aviso="indisponivel" />);
    expect(screen.getByRole("alert").textContent ?? "").toContain("Não foi possível verificar");
  });

  it("sem permissão: diz porque não se gera o substituto daqui", () => {
    render(<AvisoSubstitutoNegocio aviso="sem_permissao" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Sem permissão para editar este negócio");
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OtpCooldownNotice } from "./otp-cooldown-notice";

const TEXTO_PT = "Aguarde 1 minuto antes de pedir um novo código.";

describe("OtpCooldownNotice", () => {
  it("sem texto, mostra o aviso em português de sempre (CRM e contratos não mudam)", () => {
    render(<OtpCooldownNotice activo />);
    expect(screen.getByText(TEXTO_PT)).toBeTruthy();
  });

  it("não mostra nada quando a contagem não está activa", () => {
    const { container } = render(<OtpCooldownNotice activo={false} texto="Please wait" />);
    expect(container.innerHTML).toBe("");
  });

  it("com texto, mostra esse texto no lugar do português", () => {
    render(<OtpCooldownNotice activo texto="Please wait 1 minute before requesting a new code." />);
    expect(screen.getByText("Please wait 1 minute before requesting a new code.")).toBeTruthy();
    expect(screen.queryByText(TEXTO_PT)).toBeNull();
  });

  it("um texto vazio volta ao português, para não ficar um parágrafo em branco", () => {
    render(<OtpCooldownNotice activo texto="" />);
    expect(screen.getByText(TEXTO_PT)).toBeTruthy();
  });

  it("mantém a className recebida", () => {
    render(<OtpCooldownNotice activo className="mt-2" />);
    expect(screen.getByText(TEXTO_PT).className).toContain("mt-2");
  });
});

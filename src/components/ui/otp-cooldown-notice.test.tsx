// OtpCooldownNotice: o texto é o português de sempre (o CRM não muda); o portal pode passar o seu, noutro idioma.
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OtpCooldownNotice } from "./otp-cooldown-notice";

const OMISSAO = "Aguarde 1 minuto antes de pedir um novo código.";

describe("OtpCooldownNotice", () => {
  it("sem a prop `texto` mostra o aviso em português, com as mesmas classes", () => {
    const { container } = render(<OtpCooldownNotice activo />);
    expect(container.innerHTML).toBe(`<p class="text-xs text-muted-foreground">${OMISSAO}</p>`);
  });

  it("com `texto` mostra o texto dado", () => {
    const { container } = render(<OtpCooldownNotice activo texto="Please wait 1 minute before requesting a new code." />);
    expect(container.textContent).toBe("Please wait 1 minute before requesting a new code.");
  });

  it("um `texto` vazio cai no português", () => {
    const { container } = render(<OtpCooldownNotice activo texto="" />);
    expect(container.textContent).toBe(OMISSAO);
  });

  it("inactivo não mostra nada, com ou sem texto", () => {
    expect(render(<OtpCooldownNotice activo={false} />).container.innerHTML).toBe("");
    expect(render(<OtpCooldownNotice activo={false} texto="x" />).container.innerHTML).toBe("");
  });

  it("a className do chamador junta-se às de sempre", () => {
    const { container } = render(<OtpCooldownNotice activo className="mt-2" texto="x" />);
    expect(container.querySelector("p")?.className).toBe("text-xs text-muted-foreground mt-2");
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LinhaContacto } from "./LinhaContacto";

describe("LinhaContacto", () => {
  it.each(["painel", "ficha"] as const)("na variante %s não tem botão de copiar e mantém as ligações", (variante) => {
    render(
      <dl>
        <LinhaContacto
          variante={variante} rotulo="Email" valor="a@b.pt" href="mailto:a@b.pt"
          whatsapp={{ href: "https://wa.me/351900000000", rotulo: "WhatsApp", avisoNovoSeparador: " (abre noutro separador)" }}
        />
        <LinhaContacto variante={variante} rotulo="Distrito" valor="Coimbra" />
      </dl>,
    );
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByRole("link", { name: "a@b.pt" })).toHaveAttribute("href", "mailto:a@b.pt");
    expect(screen.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute("href", "https://wa.me/351900000000");
    expect(screen.getByText("Coimbra")).toBeInTheDocument();
  });
});

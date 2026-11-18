import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VersaoDoContrato } from "../VersaoDoContrato";

describe("VersaoDoContrato", () => {
  it("uma secção com lang e o corpo sanitizado; com etiqueta mostra o nome nativo do idioma", () => {
    const { container } = render(
      <VersaoDoContrato codigo="en" bodyHtml={`<p>Hello</p><script>alert(1)</script><img src=x onerror="alert(1)">`} mostrarEtiqueta />,
    );
    const seccao = container.querySelector("section")!;
    expect(seccao.getAttribute("lang")).toBe("en");
    expect(seccao.querySelector("h3")?.textContent).toBe("English");
    expect(seccao.textContent).toContain("Hello");
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain("onerror");
  });

  it("sem etiqueta: não há título (uma só versão não se rotula)", () => {
    const { container } = render(<VersaoDoContrato codigo="pt" bodyHtml="<p>Olá</p>" />);
    expect(container.querySelector("h3")).toBeNull();
    expect(container.querySelector("section")?.getAttribute("lang")).toBe("pt");
  });

  it("idioma fora do registo: etiqueta com o próprio código, sem rebentar", () => {
    const { container } = render(<VersaoDoContrato codigo="zz" bodyHtml="<p>x</p>" mostrarEtiqueta />);
    expect(container.querySelector("h3")?.textContent).toBe("zz");
  });

  it("antes e depois entram à volta do corpo, pela ordem", () => {
    const { container } = render(
      <VersaoDoContrato codigo="pt" bodyHtml="<p>CORPO</p>" antes={<i>ANTES</i>} depois={<b>DEPOIS</b>} />,
    );
    const texto = container.textContent ?? "";
    expect(texto.indexOf("ANTES")).toBeLessThan(texto.indexOf("CORPO"));
    expect(texto.indexOf("CORPO")).toBeLessThan(texto.indexOf("DEPOIS"));
  });

  it("repete a classe do corpo e mantém o html das tabelas e dos estilos do contrato", () => {
    const { container } = render(
      <VersaoDoContrato codigo="pt" bodyHtml={`<table><tr><td style="color:red">1,50 €</td></tr></table>`} classeCorpo="prose" />,
    );
    expect(container.querySelector("div.prose td")?.getAttribute("style")).toContain("color");
    expect(container.textContent).toContain("1,50 €");
  });
});

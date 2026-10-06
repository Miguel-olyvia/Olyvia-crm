/**
 * O "(obrigatorio)" que o leitor de ecra ouve junto de um campo obrigatorio
 * vem da lingua de QUEM O ESTA A USAR, nao do portugues escrito a mao: o ecra
 * publico do convite escolhe a sua lingua pelo navegador e quem usa um leitor
 * de ecra em es, fr, de ou en ouvia "obrigatorio" em portugues em cada campo.
 *
 * O texto chega pelo `CamposTocadosProvider` (`rotuloObrigatorio`), ja
 * traduzido por quem monta o formulario. Sem ele nao se inventa uma lingua: o
 * controlo continua com `aria-required`, que o leitor de ecra anuncia na
 * lingua do proprio leitor.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { CampoTexto, CamposTocadosProvider } from "@/components/hr/form/Campos";

function campo() {
  return <CampoTexto id="nif" label="NIF" obrigatorio valor="" onChange={() => undefined} />;
}

describe("Campos: o rotulo de obrigatorio e traduzido por quem monta o formulario", () => {
  it("usa o texto recebido do provider (francês), nunca o portugues fixo", () => {
    render(
      <CamposTocadosProvider onTocar={() => undefined} rotuloObrigatorio="obligatoire">
        {campo()}
      </CamposTocadosProvider>,
    );

    const etiqueta = screen.getByText("NIF").closest("label") as HTMLElement;
    expect(etiqueta).toHaveTextContent("(obligatoire)");
    expect(etiqueta).not.toHaveTextContent(/obrigatorio/i);
  });

  it("sem rotulo nao inventa uma lingua, mas o controlo continua marcado como obrigatorio", () => {
    render(
      <CamposTocadosProvider onTocar={() => undefined}>{campo()}</CamposTocadosProvider>,
    );

    const etiqueta = screen.getByText("NIF").closest("label") as HTMLElement;
    expect(etiqueta).not.toHaveTextContent(/obrigatorio/i);
    const controlo = screen.getByRole("textbox");
    expect(controlo).toHaveAttribute("aria-required", "true");
    expect(controlo).toBeRequired();
  });

  it("fora de um provider (campo isolado) tambem nao rebenta", () => {
    render(campo());
    expect(screen.getByRole("textbox")).toHaveAttribute("aria-required", "true");
  });

  it("'recomendado' tem so o asterisco visual: nao anuncia obrigatorio num campo que se pode deixar vazio", () => {
    render(
      <CamposTocadosProvider onTocar={() => undefined} rotuloObrigatorio="obligatoire">
        <CampoTexto id="cargo" label="Cargo" recomendado valor="" onChange={() => undefined} />
      </CamposTocadosProvider>,
    );

    const etiqueta = screen.getByText("Cargo").closest("label") as HTMLElement;
    expect(etiqueta).not.toHaveTextContent(/obligatoire/);
    expect(screen.getByText("*")).toHaveAttribute("aria-hidden", "true");
    const controlo = screen.getByRole("textbox");
    expect(controlo).not.toHaveAttribute("aria-required");
    expect(controlo).not.toBeRequired();
  });

  it("o asterisco visual continua escondido do leitor de ecra", () => {
    render(
      <CamposTocadosProvider onTocar={() => undefined} rotuloObrigatorio="Pflichtfeld">
        {campo()}
      </CamposTocadosProvider>,
    );
    expect(screen.getByText("*")).toHaveAttribute("aria-hidden", "true");
  });
});

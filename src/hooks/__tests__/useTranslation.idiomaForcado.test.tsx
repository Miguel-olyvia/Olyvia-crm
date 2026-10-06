/**
 * `useTranslation` com o hook REAL e o `LanguageProvider` real (sem visitante
 * com lingua guardada, arranca em ingles). O ecra publico do convite de
 * admissao envolve a sua arvore em `IdiomaForcadoProvider`: qualquer filho que
 * chame `useTranslation()` sem argumento passa a usar a lingua do navegador,
 * sem mexer na lingua da aplicacao nem no armazenamento do visitante.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { IdiomaForcadoProvider } from "@/contexts/IdiomaForcadoContext";
import { useTranslation } from "@/hooks/useTranslation";

function Filho({ idioma }: { idioma?: "pt" | "es" | "fr" | "de" | "en" }) {
  const { t, language } = useTranslation(idioma);
  return (
    <p data-testid="filho">
      {language}|{t("hr.campos.obrigatorio")}
    </p>
  );
}

describe("useTranslation e a lingua forcada do ecra publico", () => {
  beforeEach(() => localStorage.clear());

  it("fora do ecra publico usa a lingua do contexto (ingles por omissao)", () => {
    render(
      <LanguageProvider>
        <Filho />
      </LanguageProvider>,
    );
    expect(screen.getByTestId("filho").textContent).toBe("en|Required");
  });

  it("dentro do provider, um filho sem argumento recebe a lingua forcada", () => {
    render(
      <LanguageProvider>
        <IdiomaForcadoProvider idioma="es">
          <Filho />
        </IdiomaForcadoProvider>
      </LanguageProvider>,
    );
    expect(screen.getByTestId("filho").textContent).toBe("es|Obligatorio");
  });

  it("um argumento explicito continua a ganhar ao provider", () => {
    render(
      <LanguageProvider>
        <IdiomaForcadoProvider idioma="es">
          <Filho idioma="pt" />
        </IdiomaForcadoProvider>
      </LanguageProvider>,
    );
    expect(screen.getByTestId("filho").textContent).toBe("pt|Obrigatorio");
  });

  it("nao grava a lingua forcada no armazenamento do visitante", () => {
    render(
      <LanguageProvider>
        <IdiomaForcadoProvider idioma="pt">
          <Filho />
        </IdiomaForcadoProvider>
      </LanguageProvider>,
    );
    // So a propria lingua do contexto (en) fica gravada; a do provider nao.
    expect(localStorage.getItem("language")).toBe("en");
  });

  it("um irmao fora do provider continua na lingua do contexto", () => {
    render(
      <LanguageProvider>
        <IdiomaForcadoProvider idioma="pt">
          <Filho />
        </IdiomaForcadoProvider>
        <p data-testid="irmao">
          <Filho />
        </p>
      </LanguageProvider>,
    );
    expect(screen.getByTestId("irmao").textContent).toBe("en|Required");
  });
});

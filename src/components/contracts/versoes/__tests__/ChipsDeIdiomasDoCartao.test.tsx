import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ChipsDeIdiomasDoCartao } from "../ChipsDeIdiomasDoCartao";

const CORPO = "<h2>CONTRATO</h2><p>Texto.</p>";

function montar(template: object, lingua: "pt" | "en" = "pt") {
  localStorage.setItem("language", lingua);
  return render(<LanguageProvider><ChipsDeIdiomasDoCartao template={template as never} /></LanguageProvider>);
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("ChipsDeIdiomasDoCartao", () => {
  it("template sem versões: não renderiza nada (o cartão fica como hoje)", () => {
    expect(montar({ body_html: CORPO, doc_settings: null }).container.textContent).toBe("");
    cleanup();
    expect(montar({ body_html: CORPO, doc_settings: { primary_color: "#000" } }).container.textContent).toBe("");
    cleanup();
    expect(montar({ body_html: CORPO, doc_settings: { versions: {} } }).container.textContent).toBe("");
  });

  it("versão completa: só o chip «PT · EN»", () => {
    montar({ body_html: CORPO, doc_settings: { versions: { en: { body_html: "<h2>CONTRACT</h2><p>Text.</p>" } } } });
    expect(screen.getByLabelText("Idiomas: Português, English").textContent).toBe("PT · EN");
    expect(screen.queryByText(/incompleto/)).toBeNull();
  });

  it("versão incompleta: acrescenta «EN incompleto»", () => {
    montar({ body_html: CORPO, doc_settings: { versions: { en: { body_html: CORPO } } } });
    expect(screen.getByLabelText("Idiomas: Português, English").textContent).toBe("PT · EN");
    expect(screen.getByText("EN incompleto")).toBeInTheDocument();
  });

  it("uma versão sem texto também conta e aparece como incompleta", () => {
    montar({ body_html: CORPO, doc_settings: { versions: { en: { body_html: "" } } } });
    expect(screen.getByText("EN incompleto")).toBeInTheDocument();
  });

  it("vários idiomas pela ordem do registo", () => {
    montar({ body_html: CORPO, doc_settings: { versions: { fr: { body_html: "<p>F</p>" }, en: { body_html: "<p>E</p>" } } } });
    expect(screen.getByLabelText("Idiomas: Português, English, Français").textContent).toBe("PT · EN · FR");
  });

  it("em inglês", () => {
    montar({ body_html: CORPO, doc_settings: { versions: { en: { body_html: CORPO } } } }, "en");
    expect(screen.getByText("EN incomplete")).toBeInTheDocument();
    expect(screen.getByLabelText("Languages: Português, English")).toBeInTheDocument();
  });
});

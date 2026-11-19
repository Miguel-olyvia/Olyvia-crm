// Trocar de idioma com o editor rico REAL (sem mock): o corpo do email tem de mostrar o texto do idioma ativo.
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "pt" }) }));

import { ConteudoPorIdioma } from "../ConteudoPorIdioma";

const BASE = { email_body: "<p>Olá</p>", email_subject: "Assunto", accept_enabled: true, accept_verification_method: "none" };

function Estado({ aoEscrever }: { aoEscrever: (campo: string, valor: string) => void }) {
  const [codigo, setCodigo] = useState("en");
  const [valores, setValores] = useState<Record<string, Record<string, string>>>({
    en: {},
    es: { email_body: "<p>Hola</p>" },
  });
  return (
    <>
      <button type="button" onClick={() => setCodigo((c) => (c === "en" ? "es" : "en"))}>trocar</button>
      <ConteudoPorIdioma
        codigo={codigo}
        base={BASE}
        valorDoTexto={(campo) => valores[codigo][campo] ?? ""}
        onEscrever={(campo, valor) => {
          aoEscrever(campo, valor);
          setValores((anterior) => ({ ...anterior, [codigo]: { ...anterior[codigo], [campo]: valor } }));
        }}
      />
    </>
  );
}

const editavel = () => document.querySelector<HTMLElement>('[contenteditable="true"]')!;

describe("ConteudoPorIdioma — trocar de idioma com o editor rico real", () => {
  it("um campo que ficou vazio (<br>) grava «» e não deixa o texto antigo no idioma seguinte", () => {
    const aoEscrever = vi.fn();
    render(<Estado aoEscrever={aoEscrever} />);
    expect(editavel().innerHTML).toBe("");

    // o utilizador carrega em Enter num campo vazio: o editor fica com um <br>, que conta como vazio
    editavel().innerHTML = "<div><br></div>";
    fireEvent.input(editavel());
    expect(aoEscrever).toHaveBeenLastCalledWith("email_body", "");

    fireEvent.click(screen.getByRole("button", { name: "trocar" }));
    expect(editavel().innerHTML).toContain("Hola");
    expect(editavel().innerHTML).not.toContain("<br>");
  });

  it("ida e volta: cada idioma mostra o seu texto", () => {
    render(<Estado aoEscrever={vi.fn()} />);
    editavel().innerHTML = "<p>Hello</p>";
    fireEvent.input(editavel());
    fireEvent.click(screen.getByRole("button", { name: "trocar" }));
    expect(editavel().innerHTML).toBe("<p>Hola</p>");
    fireEvent.click(screen.getByRole("button", { name: "trocar" }));
    expect(editavel().innerHTML).toBe("<p>Hello</p>");
  });

  it("um <br> sozinho também conta como vazio", () => {
    const aoEscrever = vi.fn();
    render(<Estado aoEscrever={aoEscrever} />);
    editavel().innerHTML = "<br>";
    fireEvent.input(editavel());
    expect(aoEscrever).toHaveBeenLastCalledWith("email_body", "");
  });
});

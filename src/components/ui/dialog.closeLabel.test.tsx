// O botão X do DialogContent diz «Close» por omissão (o CRM não muda); os diálogos do portal passam `closeLabel`
// no idioma do portal.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./dialog";

function montar(props: { closeLabel?: string; hideClose?: boolean } = {}) {
  render(
    <Dialog open>
      <DialogContent {...props}>
        <DialogHeader>
          <DialogTitle>Título</DialogTitle>
          <DialogDescription>Descrição</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>,
  );
}

describe("DialogContent: closeLabel", () => {
  it("por omissão o botão de fechar chama-se «Close» (comportamento do CRM)", () => {
    montar();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  });

  it("com closeLabel usa o texto dado", () => {
    montar({ closeLabel: "Fechar" });
    expect(screen.getByRole("button", { name: "Fechar" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
  });

  it("um closeLabel vazio cai no «Close»", () => {
    montar({ closeLabel: "" });
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();
  });

  it("com hideClose não há botão, com ou sem closeLabel", () => {
    montar({ hideClose: true, closeLabel: "Fechar" });
    expect(screen.queryByRole("button")).toBeNull();
  });
});

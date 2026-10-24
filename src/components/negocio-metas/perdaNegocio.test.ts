// O motivo de perder um negócio: um da lista do Workflow (os `motivosPerda` que já existem) ou «Outro» com texto livre.
import { describe, expect, it } from "vitest";
import { erroDoMotivoPerda, MAX_MOTIVO_OUTRO, motivoDaPerda, MOTIVO_OUTRO, opcoesMotivoPerda } from "./perdaNegocio";

describe("opcoesMotivoPerda", () => {
  it("reutiliza os motivos da lista e acaba sempre em «Outro» (o texto «Outro» da lista dá lugar ao do texto livre)", () => {
    expect(opcoesMotivoPerda(["Preço", "Concorrência", "Outro"])).toEqual(["Preço", "Concorrência", MOTIVO_OUTRO]);
    expect(opcoesMotivoPerda(["Preço", "outro "])).toEqual(["Preço", MOTIVO_OUTRO]);
  });

  it("sem motivos na lista, só há «Outro»; motivos vazios ou repetidos não entram", () => {
    expect(opcoesMotivoPerda([])).toEqual([MOTIVO_OUTRO]);
    expect(opcoesMotivoPerda(["", "  ", "Preço", "preço"])).toEqual(["Preço", MOTIVO_OUTRO]);
  });
});

describe("motivoDaPerda e erroDoMotivoPerda", () => {
  it("um motivo da lista vale tal e qual (aparado)", () => {
    expect(motivoDaPerda(" Preço ", "ignorado")).toBe("Preço");
    expect(erroDoMotivoPerda("Preço", "")).toBeNull();
  });

  it("«Outro» vale o texto escrito, aparado; sem texto é um erro", () => {
    expect(motivoDaPerda(MOTIVO_OUTRO, "  Mudou de casa ")).toBe("Mudou de casa");
    expect(erroDoMotivoPerda(MOTIVO_OUTRO, "   ")).toBe("outroVazio");
    expect(motivoDaPerda(MOTIVO_OUTRO, "")).toBeNull();
  });

  it("sem nada escolhido não há motivo", () => {
    expect(erroDoMotivoPerda("", "texto")).toBe("motivoVazio");
    expect(motivoDaPerda("", "texto")).toBeNull();
  });

  it("o texto livre é cortado ao máximo", () => {
    expect(motivoDaPerda(MOTIVO_OUTRO, "x".repeat(MAX_MOTIVO_OUTRO + 20))).toHaveLength(MAX_MOTIVO_OUTRO);
  });
});

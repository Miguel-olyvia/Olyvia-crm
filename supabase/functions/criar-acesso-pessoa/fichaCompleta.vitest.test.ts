/**
 * @vitest-environment node
 *
 * A guarda "ficha completa" de criar-acesso-pessoa. O sufixo `.vitest.` e o que
 * faz o vitest apanha-lo.
 */
import { describe, expect, it } from "vitest";
import { avaliarFichaCompleta } from "./fichaCompleta.ts";

describe("avaliarFichaCompleta", () => {
  it("sem pendencias -> deixa passar", () => {
    expect(avaliarFichaCompleta({ data: [], error: null })).toBeNull();
  });

  it("com pendencias -> 409 ficha_incompleta com os codigos ordenados e sem repeticoes", () => {
    const r = avaliarFichaCompleta({
      data: [
        { codigo: "tipo_contrato" },
        { codigo: "cargo" },
        { codigo: "data_admissao" },
        { codigo: "cargo" },
      ],
      error: null,
    });
    expect(r).toEqual({
      status: 409,
      body: { error: "ficha_incompleta", campos: ["cargo", "data_admissao", "tipo_contrato"] },
    });
  });

  it("erro da consulta -> fecha com 500 erro_inesperado", () => {
    expect(avaliarFichaCompleta({ data: null, error: { message: "boom" } })).toEqual({
      status: 500,
      body: { error: "erro_inesperado" },
    });
  });

  it("sem dados e sem erro -> tambem fecha", () => {
    expect(avaliarFichaCompleta({ data: null, error: null })?.status).toBe(500);
  });

  it("linhas sem codigo legivel continuam a travar", () => {
    const r = avaliarFichaCompleta({ data: [{}], error: null });
    expect(r?.status).toBe(409);
  });
});

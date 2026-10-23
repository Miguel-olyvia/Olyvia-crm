import { describe, expect, it } from "vitest";
import { filtrarPorComercial, ordenarPorGanho, totalEquipa } from "./comparativoComerciais";
import type { NegocioMes, TotaisComercial } from "./negocioMetas";

const t = (comercial: string, atual: number, meta: number): TotaisComercial => ({
  comercial, atual, meta, percentagem: Math.round((atual / meta) * 100),
});
const TOTAIS = [t("Bia", 10, 20), t("Ana", 30, 40), t("Cris", 20, 20), t("Dani", 20, 50)];

describe("ordenarPorGanho", () => {
  it("do maior para o menor ganho, desempatando pelo nome", () => {
    expect(ordenarPorGanho(TOTAIS, "desc").map((c) => c.comercial)).toEqual(["Ana", "Cris", "Dani", "Bia"]);
  });

  it("do menor para o maior ganho", () => {
    expect(ordenarPorGanho(TOTAIS, "asc").map((c) => c.comercial)).toEqual(["Bia", "Cris", "Dani", "Ana"]);
  });

  it("não altera a lista recebida", () => {
    const copia = [...TOTAIS];
    ordenarPorGanho(TOTAIS, "desc");
    expect(TOTAIS).toEqual(copia);
  });
});

describe("totalEquipa", () => {
  it("soma ganhos e metas e calcula a percentagem do conjunto", () => {
    expect(totalEquipa(TOTAIS)).toEqual({ atual: 80, meta: 130, percentagem: 62 });
  });

  it("sem comerciais é tudo 0", () => {
    expect(totalEquipa([])).toEqual({ atual: 0, meta: 0, percentagem: 0 });
  });
});

describe("filtrarPorComercial", () => {
  const negocios = [{ id: "a", comercial: "Ana" }, { id: "b", comercial: "Bia" }] as NegocioMes[];
  it("sem comercial devolve todos; com comercial só os dele", () => {
    expect(filtrarPorComercial(negocios, null)).toHaveLength(2);
    expect(filtrarPorComercial(negocios, "Bia").map((n) => n.id)).toEqual(["b"]);
  });
});

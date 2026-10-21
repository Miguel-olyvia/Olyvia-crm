// A «Próxima visita» do Resumo da ficha e o contador da aba Visitas: funções puras.
import { describe, expect, it } from "vitest";
import { visitaPessoaBase } from "./fabricaTestes";
import { contarVisitasAtivas, proximaVisitaDaPessoa, visitasPorFechar } from "./proximaVisita";

const HOJE = "2026-10-13";

describe("proximaVisitaDaPessoa", () => {
  it("sem visitas não há próxima", () => {
    expect(proximaVisitaDaPessoa([], HOJE)).toBeUndefined();
  });

  it("é a primeira Por fazer, por ordem cronológica, a partir de hoje (hoje conta)", () => {
    const visitas = [
      visitaPessoaBase("tarde", { data: "2026-10-25" }),
      visitaPessoaBase("hoje", { data: HOJE, hora: "16:00" }),
      visitaPessoaBase("cedo", { data: HOJE, hora: "09:00" }),
    ];
    expect(proximaVisitaDaPessoa(visitas, HOJE)?.id).toBe("cedo");
  });

  it("ignora as canceladas, as feitas e as que já passaram", () => {
    const visitas = [
      visitaPessoaBase("passou", { data: "2026-10-01" }),
      visitaPessoaBase("cancelada", { data: "2026-10-14", estado: "cancelada" }),
      visitaPessoaBase("feita", { data: "2026-10-15", estado: "feita" }),
      visitaPessoaBase("certa", { data: "2026-10-30" }),
    ];
    expect(proximaVisitaDaPessoa(visitas, HOJE)?.id).toBe("certa");
  });

  it("sem nenhuma a partir de hoje não há próxima (uma por fazer sem data também não conta)", () => {
    const visitas = [visitaPessoaBase("passou", { data: "2026-10-12" }), visitaPessoaBase("semData", { data: "" }), visitaPessoaBase("feita", { data: "2026-11-01", estado: "feita" })];
    expect(proximaVisitaDaPessoa(visitas, HOJE)).toBeUndefined();
  });
});

describe("contarVisitasAtivas", () => {
  it("conta as visitas que não estão canceladas", () => {
    const visitas = [visitaPessoaBase("a"), visitaPessoaBase("b", { estado: "feita" }), visitaPessoaBase("c", { estado: "cancelada" })];
    expect(contarVisitasAtivas(visitas)).toBe(2);
    expect(contarVisitasAtivas([])).toBe(0);
  });
});

describe("visitasPorFechar", () => {
  it("sem visitas não há nada por fechar", () => {
    expect(visitasPorFechar([], HOJE)).toEqual([]);
  });

  it("são as Por fazer cujo dia já passou (hoje ainda não), da mais antiga para a mais recente", () => {
    const visitas = [
      visitaPessoaBase("recente", { data: "2026-10-12", hora: "10:00" }),
      visitaPessoaBase("hoje", { data: HOJE }),
      visitaPessoaBase("antiga", { data: "2026-09-30", hora: "15:00" }),
      visitaPessoaBase("futura", { data: "2026-10-30" }),
    ];
    expect(visitasPorFechar(visitas, HOJE).map((v) => v.id)).toEqual(["antiga", "recente"]);
  });

  it("ignora as feitas, as canceladas e as sem dia", () => {
    const visitas = [
      visitaPessoaBase("feita", { data: "2026-10-01", estado: "feita" }),
      visitaPessoaBase("cancelada", { data: "2026-10-02", estado: "cancelada" }),
      visitaPessoaBase("semDia", { data: "" }),
    ];
    expect(visitasPorFechar(visitas, HOJE)).toEqual([]);
  });

  it("uma visita nunca é ao mesmo tempo a próxima e por fechar", () => {
    const visitas = [visitaPessoaBase("passou", { data: "2026-10-12" }), visitaPessoaBase("vem", { data: "2026-10-20" })];
    expect(visitasPorFechar(visitas, HOJE).map((v) => v.id)).toEqual(["passou"]);
    expect(proximaVisitaDaPessoa(visitas, HOJE)?.id).toBe("vem");
  });
});

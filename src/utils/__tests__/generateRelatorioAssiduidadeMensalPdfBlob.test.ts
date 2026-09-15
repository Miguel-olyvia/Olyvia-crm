/**
 * So a orquestracao: devolve um Blob PDF e um nome de ficheiro com a
 * extensao certa. O conteudo real desenhado pelo react-pdf nao se testa
 * aqui -- so a integracao com `RelatorioAssiduidadeMensalPDFDocument`.
 */
import { describe, it, expect } from "vitest";
import { generateRelatorioAssiduidadeMensalPdfBlob } from "@/utils/generateRelatorioAssiduidadeMensalPdfBlob";
import type { DiaRelatorioMensal, TotaisRelatorioMensal } from "@/hooks/useRelatorioAssiduidadeMensal";

const dia: DiaRelatorioMensal = {
  iso: "2026-09-01",
  diaSemana: 2,
  estado: "normal",
  categoriaAusencia: null,
  planeadoMinutos: 480,
  realizadoMinutos: 480,
  planeadoIntervalos: [{ hora_inicio: "09:00", hora_fim: "17:00" }],
  realizadoIntervalos: [{ hora_inicio: "09:00", hora_fim: "17:00" }],
  obraHoras: 0,
  temFalta: false,
  minutosEmFalta: 0,
  horasExtraMinutos: 0,
};

const totais: TotaisRelatorioMensal = {
  diasTrabalhados: 1,
  planeadoMinutos: 480,
  realizadoMinutos: 480,
  obraHoras: 0,
  diasFeriadoTrabalhados: 0,
  diasComFaltaCompleta: 0,
  diasComFaltaIncompleta: 0,
  horasExtraMinutos: 0,
};

describe("generateRelatorioAssiduidadeMensalPdfBlob", () => {
  it("devolve um Blob PDF e um nome de ficheiro .pdf com o ano e o mes", async () => {
    const { blob, fileName } = await generateRelatorioAssiduidadeMensalPdfBlob({
      organizacaoNome: "Nike",
      pessoaNome: "Maria Silva",
      cargo: "Técnica de manutenção",
      dataAdmissao: "2020-01-01",
      ano: 2026,
      mes: 8, // Setembro, 0-indexado
      dias: [dia],
      totais,
      obras: [],
    });

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/pdf");
    expect(fileName.endsWith(".pdf")).toBe(true);
    expect(fileName).toContain("2026-09");
    expect(fileName).toContain("maria-silva");
  });
});

/**
 * O agregado da organizacao: junta o PDF de cada pessoa num so ficheiro, na
 * ordem dada. Quando uma pessoa falha a gerar o seu PDF individual, o
 * agregado continua a ser produzido com as restantes -- mas reporta essa
 * falha em `falhas`, para quem chama poder avisar o utilizador em vez de
 * fingir que o relatorio ficou completo.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateRelatorioAssiduidadeMensalOrganizacaoPdfBlob } from "@/utils/generateRelatorioAssiduidadeMensalOrganizacaoPdfBlob";
import { generateRelatorioAssiduidadeMensalPdfBlob } from "@/utils/generateRelatorioAssiduidadeMensalPdfBlob";
import type { DiaRelatorioMensal, TotaisRelatorioMensal } from "@/hooks/useRelatorioAssiduidadeMensal";

vi.mock("@/utils/generateRelatorioAssiduidadeMensalPdfBlob", () => ({
  generateRelatorioAssiduidadeMensalPdfBlob: vi.fn(),
}));

vi.mock("@/lib/observability/captureFlowError", () => ({
  captureFlowError: vi.fn(),
}));

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
  horasExtraNoturnasMinutos: 0,
};

const totais: TotaisRelatorioMensal = {
  diasTrabalhados: 1,
  planeadoMinutos: 480,
  realizadoMinutos: 480,
  obraHoras: 0,
  diasFeriadoTrabalhados: 0,
  diasComFaltaCompleta: 0,
  diasComFaltaIncompleta: 0,
  diasSemRegisto: 0,
  horasExtraMinutos: 0,
  horasExtraNoturnasMinutos: 0,
};

async function pdfDeUmaPagina(): Promise<Blob> {
  const { PDFDocument } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  doc.addPage();
  const bytes = await doc.save();
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Blob([ab], { type: "application/pdf" });
}

describe("generateRelatorioAssiduidadeMensalOrganizacaoPdfBlob", () => {
  beforeEach(() => {
    vi.mocked(generateRelatorioAssiduidadeMensalPdfBlob).mockReset();
  });

  it("quando uma pessoa falha e outra nao, devolve o blob com as paginas de quem resultou e reporta quem falhou em `falhas`", async () => {
    vi.mocked(generateRelatorioAssiduidadeMensalPdfBlob).mockImplementation(async ({ pessoaNome }) => {
      if (pessoaNome === "Joao Costa") {
        throw new Error("falhou a gerar o PDF desta pessoa");
      }
      return { blob: await pdfDeUmaPagina(), fileName: "irrelevante.pdf" };
    });

    const { blob, fileName, falhas } = await generateRelatorioAssiduidadeMensalOrganizacaoPdfBlob(
      [
        { pessoaId: "pessoa-1", pessoaNome: "Maria Silva", dias: [dia], totais, obras: [] },
        { pessoaId: "pessoa-2", pessoaNome: "Joao Costa", dias: [dia], totais, obras: [] },
      ],
      2026,
      8,
      "Nike",
    );

    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/pdf");
    expect(fileName).toBe("assiduidade-organizacao-2026-09.pdf");
    expect(falhas).toEqual(["pessoa-2"]);
  });

  it("quando nenhuma pessoa falha, devolve `falhas` vazio", async () => {
    vi.mocked(generateRelatorioAssiduidadeMensalPdfBlob).mockResolvedValue({
      blob: await pdfDeUmaPagina(),
      fileName: "irrelevante.pdf",
    });

    const { falhas } = await generateRelatorioAssiduidadeMensalOrganizacaoPdfBlob(
      [{ pessoaId: "pessoa-1", pessoaNome: "Maria Silva", dias: [dia], totais, obras: [] }],
      2026,
      8,
      "Nike",
    );

    expect(falhas).toEqual([]);
  });
});

/**
 * Gating da permissao de registar obra, e a seccao de obras do mes sempre
 * visivel logo a seguir a grelha diaria (nao um ecra separado).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const registarObra = vi.fn().mockResolvedValue(null);
const anularObra = vi.fn().mockResolvedValue(null);

let relatorioMock: any;

vi.mock("@/hooks/useRelatorioAssiduidadeMensal", () => ({
  useRelatorioAssiduidadeMensal: () => relatorioMock,
}));

const generateRelatorioAssiduidadeMensalPdfBlob = vi.fn();
vi.mock("@/utils/generateRelatorioAssiduidadeMensalPdfBlob", () => ({
  generateRelatorioAssiduidadeMensalPdfBlob: (...args: unknown[]) =>
    generateRelatorioAssiduidadeMensalPdfBlob(...args),
}));

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (chave: string, valores?: Record<string, string>) => {
      const chaves: Record<string, string> = {
        "hr.relatorioMensal.titulo": "Relatorio mensal de assiduidade",
        "hr.relatorioMensal.obras.titulo": "Obras do mes",
        "hr.relatorioMensal.obras.registar": "Registar obra",
        "hr.relatorioMensal.obras.vazio": "Sem obras registadas este mes.",
        "hr.relatorioMensal.obras.anular": "Anular",
        "hr.relatorioMensal.obras.anuladaEtiqueta": "Anulada",
        "hr.relatorioMensal.coluna.data": "Data",
        "hr.relatorioMensal.coluna.dia": "Dia",
        "hr.relatorioMensal.coluna.planeado": "Planeado",
        "hr.relatorioMensal.coluna.realizado": "Realizado",
        "hr.relatorioMensal.coluna.obra": "Obra",
        "hr.relatorioMensal.coluna.estado": "Estado",
        "hr.relatorioMensal.estado.normal": "Normal",
        "hr.relatorioMensal.estado.descanso": "Descanso",
        "hr.relatorioMensal.estado.feriado": "Feriado",
        "hr.relatorioMensal.semCargo": "Sem cargo registado",
        "hr.relatorioMensal.exportar": "Exportar",
        "hr.relatorioMensal.exportarErro": "Nao foi possivel gerar o PDF. Tente novamente.",
        "hr.assiduidade.mesAnterior": "Mes anterior",
        "hr.assiduidade.mesSeguinte": "Mes seguinte",
        "hr.assiduidade.dia.faltaDe": `Falta de ${valores?.duracao ?? ""}`,
      };
      return chaves[chave] ?? chave;
    },
    language: "pt-PT",
  }),
}));

vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: "org-1", name: "Nike" }, companies: [] }),
}));

vi.mock("@/lib/toast", () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

import { PessoaRelatorioAssiduidadeMensal } from "@/components/hr/PessoaRelatorioAssiduidadeMensal";
import type { PermissoesAssiduidade } from "@/types/hrAssiduidade";
import { toast } from "@/lib/toast";

function permissoes(overrides: Partial<PermissoesAssiduidade> = {}): PermissoesAssiduidade {
  return {
    view: true,
    viewOwn: false,
    equipaView: false,
    picar: false,
    picarOutros: false,
    gerir: false,
    corrigir: false,
    faltasView: false,
    faltasEdit: false,
    justificacaoView: false,
    justificacaoEdit: false,
    validarRealizado: false,
    obrasRegistar: false,
    ...overrides,
  };
}

beforeEach(() => {
  registarObra.mockClear();
  anularObra.mockClear();
  vi.mocked(toast.error).mockReset();
  generateRelatorioAssiduidadeMensalPdfBlob.mockReset();
  generateRelatorioAssiduidadeMensalPdfBlob.mockResolvedValue({
    blob: new Blob(["pdf"], { type: "application/pdf" }),
    fileName: "assiduidade-maria-silva-2026-09.pdf",
  });
  relatorioMock = {
    dias: [
      {
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
      },
    ],
    totais: {
      diasTrabalhados: 1,
      planeadoMinutos: 480,
      realizadoMinutos: 480,
      obraHoras: 0,
      diasFeriadoTrabalhados: 0,
      diasComFaltaCompleta: 0,
      diasComFaltaIncompleta: 0,
      horasExtraMinutos: 0,
      horasExtraNoturnasMinutos: 0,
    },
    obras: [
      {
        id: "obra-1",
        pessoa_id: "pessoa-1",
        organization_id: "org-1",
        data: "2026-09-01",
        horas: 3,
        descricao: "Obra do cliente X",
        registado_por: null,
        anulado_em: null,
        anulado_por: null,
        anulado_motivo: null,
        created_at: "2026-09-01T20:00:00Z",
      },
    ],
    obrasRecusadas: false,
    realizadoRecusado: false,
    faltasRecusadas: false,
    planeadoRecusado: false,
    loading: false,
    saving: false,
    recarregar: vi.fn(),
    registarObra,
    anularObra,
  };
});

describe("PessoaRelatorioAssiduidadeMensal", () => {
  it("mostra sempre a seccao de obras do mes, logo a seguir a grelha diaria", () => {
    render(
      <PessoaRelatorioAssiduidadeMensal
        aberto
        onFechar={vi.fn()}
        pessoaId="pessoa-1"
        pessoaNome="Maria Silva"
        cargo="Tecnica de manutencao"
        dataAdmissao="2020-01-01"
        permissoes={permissoes()}
      />,
    );

    expect(screen.getByText("Obras do mes")).toBeInTheDocument();
    expect(screen.getByText(/Obra do cliente X/)).toBeInTheDocument();
  });

  it("sem hr.assiduidade.obras.registar, nao mostra o botao de registar nem o de anular", () => {
    render(
      <PessoaRelatorioAssiduidadeMensal
        aberto
        onFechar={vi.fn()}
        pessoaId="pessoa-1"
        pessoaNome="Maria Silva"
        permissoes={permissoes({ obrasRegistar: false })}
      />,
    );

    expect(screen.queryByText("Registar obra")).not.toBeInTheDocument();
    expect(screen.queryByText("Anular")).not.toBeInTheDocument();
  });

  it("com hr.assiduidade.obras.registar, mostra o botao de registar e o de anular numa obra activa", () => {
    render(
      <PessoaRelatorioAssiduidadeMensal
        aberto
        onFechar={vi.fn()}
        pessoaId="pessoa-1"
        pessoaNome="Maria Silva"
        permissoes={permissoes({ obrasRegistar: true })}
      />,
    );

    expect(screen.getByText("Registar obra")).toBeInTheDocument();
    expect(screen.getByText("Anular")).toBeInTheDocument();
  });

  it("uma obra anulada mostra a etiqueta de anulada e nao o botao de anular", () => {
    relatorioMock.obras = [
      {
        ...relatorioMock.obras[0],
        anulado_em: "2026-09-02T00:00:00Z",
        anulado_motivo: "Enganei-me",
      },
    ];

    render(
      <PessoaRelatorioAssiduidadeMensal
        aberto
        onFechar={vi.fn()}
        pessoaId="pessoa-1"
        pessoaNome="Maria Silva"
        permissoes={permissoes({ obrasRegistar: true })}
      />,
    );

    expect(screen.getByText("Anulada")).toBeInTheDocument();
    expect(screen.queryByText("Anular")).not.toBeInTheDocument();
  });

  it("ao clicar em exportar, gera o PDF com os dados da pessoa e descarrega-o em vez de imprimir", async () => {
    const criadoUrl = "blob:mock-url";
    const createObjectURL = vi.fn().mockReturnValue(criadoUrl);
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const cliqueSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(
      <PessoaRelatorioAssiduidadeMensal
        aberto
        onFechar={vi.fn()}
        pessoaId="pessoa-1"
        pessoaNome="Maria Silva"
        cargo="Tecnica de manutencao"
        dataAdmissao="2020-01-01"
        permissoes={permissoes()}
      />,
    );

    fireEvent.click(screen.getByText("Exportar"));

    await waitFor(() => {
      expect(generateRelatorioAssiduidadeMensalPdfBlob).toHaveBeenCalledTimes(1);
    });
    const chamada = generateRelatorioAssiduidadeMensalPdfBlob.mock.calls[0][0];
    expect(chamada.pessoaNome).toBe("Maria Silva");
    expect(chamada.dias).toEqual(relatorioMock.dias);
    expect(chamada.totais).toEqual(relatorioMock.totais);
    expect(chamada.obras).toEqual(relatorioMock.obras);
    expect(createObjectURL).toHaveBeenCalled();
    expect(cliqueSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith(criadoUrl);

    cliqueSpy.mockRestore();
  });

  it("um erro a gerar o PDF mostra um toast em vez de rebentar", async () => {
    generateRelatorioAssiduidadeMensalPdfBlob.mockRejectedValueOnce(new Error("falhou"));

    render(
      <PessoaRelatorioAssiduidadeMensal
        aberto
        onFechar={vi.fn()}
        pessoaId="pessoa-1"
        pessoaNome="Maria Silva"
        permissoes={permissoes()}
      />,
    );

    fireEvent.click(screen.getByText("Exportar"));

    await waitFor(() => {
      expect(generateRelatorioAssiduidadeMensalPdfBlob).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Nao foi possivel gerar o PDF. Tente novamente.");
    });
  });
});

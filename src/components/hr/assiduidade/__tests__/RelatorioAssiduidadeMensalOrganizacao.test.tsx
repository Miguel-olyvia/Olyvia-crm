/**
 * O relatorio em massa: uma seccao por pessoa da lista dada, com quebra de
 * pagina entre elas, e sem imprimir a meio do carregamento.
 *
 * O hook real e mockado por pessoa (por `pessoaId`), como
 * `useRelatorioAssiduidadeMensal.test.ts` ja simula Supabase -- aqui simula-se
 * o proprio hook, porque o que se testa e a orquestracao de varias pessoas,
 * nao a leitura dos dados.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const relatorioPorPessoa: Record<string, any> = {};

vi.mock("@/hooks/useRelatorioAssiduidadeMensal", () => ({
  useRelatorioAssiduidadeMensal: (pessoaId: string) => relatorioPorPessoa[pessoaId],
}));

const generateRelatorioAssiduidadeMensalOrganizacaoPdfBlob = vi.fn();
vi.mock("@/utils/generateRelatorioAssiduidadeMensalOrganizacaoPdfBlob", () => ({
  generateRelatorioAssiduidadeMensalOrganizacaoPdfBlob: (...args: unknown[]) =>
    generateRelatorioAssiduidadeMensalOrganizacaoPdfBlob(...args),
}));

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (chave: string, valores?: Record<string, string>) => {
      const chaves: Record<string, string> = {
        "hr.relatorioMensal.organizacao.titulo": "Relatorio de assiduidade da organizacao",
        "hr.relatorioMensal.organizacao.aPreparar": `A preparar ${valores?.prontas ?? ""} de ${valores?.total ?? ""}`,
        "hr.relatorioMensal.exportar": "Exportar",
        "hr.relatorioMensal.exportarErro": "Nao foi possivel gerar o PDF. Tente novamente.",
        "hr.relatorioMensal.exportarParcial": `Gerado sem ${valores?.falhas ?? ""} de ${valores?.total ?? ""} pessoas`,
        "hr.relatorioMensal.obras.titulo": "Obras do mes",
        "hr.relatorioMensal.obras.vazio": "Sem obras registadas este mes.",
        "hr.relatorioMensal.coluna.data": "Data",
        "hr.relatorioMensal.coluna.dia": "Dia",
        "hr.relatorioMensal.coluna.planeado": "Planeado",
        "hr.relatorioMensal.coluna.realizado": "Realizado",
        "hr.relatorioMensal.coluna.obra": "Obra",
        "hr.relatorioMensal.coluna.estado": "Estado",
        "hr.relatorioMensal.estado.normal": "Normal",
        "hr.relatorioMensal.semCargo": "Sem cargo registado",
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

import { RelatorioAssiduidadeMensalOrganizacao } from "@/components/hr/assiduidade/RelatorioAssiduidadeMensalOrganizacao";
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

function relatorioDe(loading: boolean) {
  return {
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
    },
    obras: [],
    obrasRecusadas: false,
    realizadoRecusado: false,
    faltasRecusadas: false,
    planeadoRecusado: false,
    loading,
    saving: false,
    recarregar: vi.fn(),
    registarObra: vi.fn(),
    anularObra: vi.fn(),
  };
}

beforeEach(() => {
  generateRelatorioAssiduidadeMensalOrganizacaoPdfBlob.mockReset();
  generateRelatorioAssiduidadeMensalOrganizacaoPdfBlob.mockResolvedValue({
    blob: new Blob(["pdf"], { type: "application/pdf" }),
    fileName: "assiduidade-organizacao-2026-09.pdf",
    falhas: [],
  });
  relatorioPorPessoa["pessoa-1"] = relatorioDe(false);
  relatorioPorPessoa["pessoa-2"] = relatorioDe(false);
  vi.mocked(toast.error).mockReset();
  vi.mocked(toast.warning).mockReset();
});

describe("RelatorioAssiduidadeMensalOrganizacao", () => {
  it("renderiza uma seccao por pessoa da lista dada, com quebra de pagina entre elas", async () => {
    render(
      <RelatorioAssiduidadeMensalOrganizacao
        aberto
        onFechar={vi.fn()}
        ano={2026}
        mes={8}
        pessoas={[
          { id: "pessoa-1", nome: "Maria Silva" },
          { id: "pessoa-2", nome: "Joao Costa" },
        ]}
        permissoes={permissoes()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Maria Silva")).toBeInTheDocument();
      expect(screen.getByText("Joao Costa")).toBeInTheDocument();
    });

    const seccoes = document.querySelectorAll(".hr-relatorio-organizacao-pessoa");
    expect(seccoes).toHaveLength(2);
  });

  it("o botao de exportar fica desactivado enquanto nem todas as pessoas terminaram de carregar", async () => {
    relatorioPorPessoa["pessoa-2"] = relatorioDe(true);

    render(
      <RelatorioAssiduidadeMensalOrganizacao
        aberto
        onFechar={vi.fn()}
        ano={2026}
        mes={8}
        pessoas={[
          { id: "pessoa-1", nome: "Maria Silva" },
          { id: "pessoa-2", nome: "Joao Costa" },
        ]}
        permissoes={permissoes()}
      />,
    );

    expect(screen.getByText(/A preparar/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /exportar/i })).toBeDisabled();
    expect(generateRelatorioAssiduidadeMensalOrganizacaoPdfBlob).not.toHaveBeenCalled();
  });

  it("so gera o PDF agregado quando a pessoa clica no botao, depois de todas terminarem de carregar", async () => {
    const criadoUrl = "blob:mock-url";
    const createObjectURL = vi.fn().mockReturnValue(criadoUrl);
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const cliqueSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(
      <RelatorioAssiduidadeMensalOrganizacao
        aberto
        onFechar={vi.fn()}
        ano={2026}
        mes={8}
        pessoas={[
          { id: "pessoa-1", nome: "Maria Silva" },
          { id: "pessoa-2", nome: "Joao Costa" },
        ]}
        permissoes={permissoes()}
      />,
    );

    const botao = screen.getByRole("button", { name: /exportar/i });
    await waitFor(() => expect(botao).not.toBeDisabled());
    expect(generateRelatorioAssiduidadeMensalOrganizacaoPdfBlob).not.toHaveBeenCalled();

    fireEvent.click(botao);

    await waitFor(() => {
      expect(generateRelatorioAssiduidadeMensalOrganizacaoPdfBlob).toHaveBeenCalledTimes(1);
    });
    const [pessoasChamada] = generateRelatorioAssiduidadeMensalOrganizacaoPdfBlob.mock.calls[0];
    expect(pessoasChamada).toHaveLength(2);
    expect(pessoasChamada.map((p: any) => p.pessoaNome)).toEqual(["Maria Silva", "Joao Costa"]);
    expect(createObjectURL).toHaveBeenCalled();
    expect(cliqueSpy).toHaveBeenCalled();

    cliqueSpy.mockRestore();
  });

  it("um erro a gerar o PDF agregado mostra um toast em vez de rebentar", async () => {
    generateRelatorioAssiduidadeMensalOrganizacaoPdfBlob.mockRejectedValueOnce(new Error("falhou"));

    render(
      <RelatorioAssiduidadeMensalOrganizacao
        aberto
        onFechar={vi.fn()}
        ano={2026}
        mes={8}
        pessoas={[
          { id: "pessoa-1", nome: "Maria Silva" },
          { id: "pessoa-2", nome: "Joao Costa" },
        ]}
        permissoes={permissoes()}
      />,
    );

    const botao = screen.getByRole("button", { name: /exportar/i });
    await waitFor(() => expect(botao).not.toBeDisabled());

    fireEvent.click(botao);

    await waitFor(() => {
      expect(generateRelatorioAssiduidadeMensalOrganizacaoPdfBlob).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Nao foi possivel gerar o PDF. Tente novamente.");
    });
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("quando o PDF agregado e gerado sem todas as pessoas, mostra um toast de aviso parcial (nao o de erro) e mesmo assim descarrega", async () => {
    generateRelatorioAssiduidadeMensalOrganizacaoPdfBlob.mockResolvedValueOnce({
      blob: new Blob(["pdf"], { type: "application/pdf" }),
      fileName: "assiduidade-organizacao-2026-09.pdf",
      falhas: ["pessoa-2"],
    });
    const createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    const cliqueSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(
      <RelatorioAssiduidadeMensalOrganizacao
        aberto
        onFechar={vi.fn()}
        ano={2026}
        mes={8}
        pessoas={[
          { id: "pessoa-1", nome: "Maria Silva" },
          { id: "pessoa-2", nome: "Joao Costa" },
        ]}
        permissoes={permissoes()}
      />,
    );

    const botao = screen.getByRole("button", { name: /exportar/i });
    await waitFor(() => expect(botao).not.toBeDisabled());

    fireEvent.click(botao);

    await waitFor(() => {
      expect(createObjectURL).toHaveBeenCalled();
      expect(cliqueSpy).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith("Gerado sem 1 de 2 pessoas");
    });
    expect(toast.error).not.toHaveBeenCalled();

    cliqueSpy.mockRestore();
  });
});

/**
 * O relatorio em massa: uma seccao por pessoa da lista dada, com quebra de
 * pagina entre elas, e sem imprimir a meio do carregamento.
 *
 * O hook real e mockado por pessoa (por `pessoaId`), como
 * `useRelatorioAssiduidadeMensal.test.ts` ja simula Supabase -- aqui simula-se
 * o proprio hook, porque o que se testa e a orquestracao de varias pessoas,
 * nao a leitura dos dados.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const relatorioPorPessoa: Record<string, any> = {};

vi.mock("@/hooks/useRelatorioAssiduidadeMensal", () => ({
  useRelatorioAssiduidadeMensal: (pessoaId: string) => relatorioPorPessoa[pessoaId],
}));

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (chave: string, valores?: Record<string, string>) => {
      const chaves: Record<string, string> = {
        "hr.relatorioMensal.organizacao.titulo": "Relatorio de assiduidade da organizacao",
        "hr.relatorioMensal.organizacao.aPreparar": `A preparar ${valores?.prontas ?? ""} de ${valores?.total ?? ""}`,
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

import { RelatorioAssiduidadeMensalOrganizacao } from "@/components/hr/assiduidade/RelatorioAssiduidadeMensalOrganizacao";
import type { PermissoesAssiduidade } from "@/types/hrAssiduidade";

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
        obraHoras: 0,
        temFalta: false,
        minutosEmFalta: 0,
      },
    ],
    totais: {
      diasTrabalhados: 1,
      planeadoMinutos: 480,
      realizadoMinutos: 480,
      obraHoras: 0,
      diasComFalta: 0,
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

let printSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
  relatorioPorPessoa["pessoa-1"] = relatorioDe(false);
  relatorioPorPessoa["pessoa-2"] = relatorioDe(false);
});

afterEach(() => {
  printSpy.mockRestore();
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
    expect(screen.getByRole("button", { name: /imprimir/i })).toBeDisabled();
    expect(window.print).not.toHaveBeenCalled();
  });

  it("so chama window.print quando a pessoa clica no botao, depois de todas terminarem de carregar", async () => {
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

    const botao = screen.getByRole("button", { name: /imprimir/i });
    await waitFor(() => expect(botao).not.toBeDisabled());
    expect(window.print).not.toHaveBeenCalled();

    fireEvent.click(botao);
    expect(window.print).toHaveBeenCalledTimes(1);
  });
});

/**
 * O corpo extraido de `PessoaRelatorioAssiduidadeMensal`: grelha diaria,
 * totais, seccao de obras, e o cabecalho impresso (empresa/pessoa/cargo).
 * `PessoaRelatorioAssiduidadeMensal.test.tsx` cobre o gating da permissao de
 * obras atraves deste mesmo componente -- aqui cobre-se so o que e novo com a
 * extraccao: o cabecalho, e o aviso de fim de carregamento.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const registarObra = vi.fn().mockResolvedValue(null);
const anularObra = vi.fn().mockResolvedValue(null);

let relatorioMock: any;

vi.mock("@/hooks/useRelatorioAssiduidadeMensal", () => ({
  useRelatorioAssiduidadeMensal: () => relatorioMock,
}));

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (chave: string, valores?: Record<string, string>) => {
      const chaves: Record<string, string> = {
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
        "hr.relatorioMensal.admissao": `Admissao em ${valores?.data ?? ""}`,
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

import { RelatorioAssiduidadeMensalConteudo } from "@/components/hr/RelatorioAssiduidadeMensalConteudo";
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

beforeEach(() => {
  registarObra.mockClear();
  anularObra.mockClear();
  relatorioMock = {
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
    loading: false,
    saving: false,
    recarregar: vi.fn(),
    registarObra,
    anularObra,
  };
});

describe("RelatorioAssiduidadeMensalConteudo", () => {
  it("mostra o cabecalho impresso: empresa, pessoa, cargo e admissao", () => {
    render(
      <RelatorioAssiduidadeMensalConteudo
        pessoaId="pessoa-1"
        ano={2026}
        mes={8}
        pessoaNome="Maria Silva"
        cargo="Tecnica de manutencao"
        dataAdmissao="2020-01-01"
        permissoes={permissoes()}
      />,
    );

    expect(screen.getByText("Nike")).toBeInTheDocument();
    expect(screen.getByText("Maria Silva")).toBeInTheDocument();
    expect(screen.getByText(/Tecnica de manutencao/)).toBeInTheDocument();
    expect(screen.getByText(/Admissao em 2020-01-01/)).toBeInTheDocument();
  });

  it("sem cargo, mostra o texto de 'sem cargo registado'", () => {
    render(
      <RelatorioAssiduidadeMensalConteudo
        pessoaId="pessoa-1"
        ano={2026}
        mes={8}
        pessoaNome="Maria Silva"
        permissoes={permissoes()}
      />,
    );

    expect(screen.getByText(/Sem cargo registado/)).toBeInTheDocument();
  });

  it("insere os controlos do dono do ecra entre o cabecalho e a grelha", () => {
    render(
      <RelatorioAssiduidadeMensalConteudo
        pessoaId="pessoa-1"
        ano={2026}
        mes={8}
        pessoaNome="Maria Silva"
        permissoes={permissoes()}
        controlos={<button>Controlo do dono</button>}
      />,
    );

    expect(screen.getByRole("button", { name: "Controlo do dono" })).toBeInTheDocument();
  });

  it("avisa aoTerminarCarregamento uma vez quando o relatorio ja nao esta a carregar", () => {
    const aoTerminarCarregamento = vi.fn();
    render(
      <RelatorioAssiduidadeMensalConteudo
        pessoaId="pessoa-1"
        ano={2026}
        mes={8}
        pessoaNome="Maria Silva"
        permissoes={permissoes()}
        aoTerminarCarregamento={aoTerminarCarregamento}
      />,
    );

    expect(aoTerminarCarregamento).toHaveBeenCalledTimes(1);
  });

  it("enquanto carrega, nao avisa aoTerminarCarregamento", () => {
    relatorioMock = { ...relatorioMock, loading: true };
    const aoTerminarCarregamento = vi.fn();
    render(
      <RelatorioAssiduidadeMensalConteudo
        pessoaId="pessoa-1"
        ano={2026}
        mes={8}
        pessoaNome="Maria Silva"
        permissoes={permissoes()}
        aoTerminarCarregamento={aoTerminarCarregamento}
      />,
    );

    expect(aoTerminarCarregamento).not.toHaveBeenCalled();
  });
});

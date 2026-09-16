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
        "hr.relatorioMensal.coluna.horasExtra": "Horas extra",
        "hr.relatorioMensal.coluna.obra": "Obra",
        "hr.relatorioMensal.coluna.estado": "Estado",
        "hr.relatorioMensal.estado.normal": "Normal",
        "hr.relatorioMensal.estado.descanso": "Descanso",
        "hr.relatorioMensal.estado.feriado": "Feriado",
        "hr.relatorioMensal.estado.sem_registo": "Sem registo",
        "hr.relatorioMensal.feriadoTrabalhado": "Feriado trabalhado",
        "hr.relatorioMensal.descansoTrabalhado": "Descanso trabalhado",
        "hr.relatorioMensal.semCargo": "Sem cargo registado",
        "hr.relatorioMensal.admissao": `Admissao em ${valores?.data ?? ""}`,
        "hr.assiduidade.dia.faltaDe": `Falta de ${valores?.duracao ?? ""}`,
        "hr.relatorioMensal.totais.horasExtra": `Horas extra: ${valores?.duracao ?? ""}`,
        "hr.relatorioMensal.totais.horasExtraNoturnas": `Horas extra noturnas: ${valores?.duracao ?? ""}`,
        "hr.relatorioMensal.horasExtraNoturnasNota": `(${valores?.duracao ?? ""} noturnas)`,
        "hr.relatorioMensal.totais.diasFeriadoTrabalhados": `${valores?.dias ?? ""} dias de feriado trabalhados`,
        "hr.relatorioMensal.totais.faltaCompleta": `${valores?.dias ?? ""} faltas completas`,
        "hr.relatorioMensal.totais.faltaIncompleta": `${valores?.dias ?? ""} faltas incompletas`,
        "hr.relatorioMensal.totais.diasSemRegisto": `${valores?.dias ?? ""} dias sem registo`,
        "hr.relatorioMensal.totais.faltasTitulo": "Faltas e dias por esclarecer",
        "hr.relatorioMensal.totais.faltasResumo": `De ${valores?.total ?? ""} dias com falha no trabalho, ${
          valores?.registadas ?? ""
        } já foram registados como falta pelo RH; os restantes ${
          valores?.porEsclarecer ?? ""
        } ainda não têm falta associada.`,
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
      diasSemRegisto: 0,
      horasExtraMinutos: 0,
      horasExtraNoturnasMinutos: 0,
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

  it("mostra o planeado e o realizado como intervalos, com o almoco a partir os dois em dois", () => {
    relatorioMock.dias = [
      {
        iso: "2026-09-01",
        diaSemana: 2,
        estado: "normal",
        categoriaAusencia: null,
        planeadoMinutos: 480,
        realizadoMinutos: 480,
        planeadoIntervalos: [
          { hora_inicio: "09:00:00", hora_fim: "12:00:00" },
          { hora_inicio: "13:00:00", hora_fim: "18:00:00" },
        ],
        realizadoIntervalos: [
          { hora_inicio: "09:00:00", hora_fim: "13:00:00" },
          { hora_inicio: "14:00:00", hora_fim: "18:00:00" },
        ],
        obraHoras: 0,
        temFalta: false,
        minutosEmFalta: 0,
        horasExtraMinutos: 0,
      },
    ];

    render(
      <RelatorioAssiduidadeMensalConteudo
        pessoaId="pessoa-1"
        ano={2026}
        mes={8}
        pessoaNome="Maria Silva"
        permissoes={permissoes()}
      />,
    );

    expect(screen.getByText("09:00-12:00 | 13:00-18:00")).toBeInTheDocument();
    expect(screen.getByText("09:00-13:00 14:00-18:00")).toBeInTheDocument();
  });

  it("sem planeado nem realizado nesse dia, mostra um travessao", () => {
    relatorioMock.dias = [
      {
        iso: "2026-09-01",
        diaSemana: 2,
        estado: "normal",
        categoriaAusencia: null,
        planeadoMinutos: 0,
        realizadoMinutos: 0,
        planeadoIntervalos: [],
        realizadoIntervalos: [],
        obraHoras: 0,
        temFalta: false,
        minutosEmFalta: 0,
        horasExtraMinutos: 0,
      },
    ];

    render(
      <RelatorioAssiduidadeMensalConteudo
        pessoaId="pessoa-1"
        ano={2026}
        mes={8}
        pessoaNome="Maria Silva"
        permissoes={permissoes()}
      />,
    );

    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });

  it("a coluna de horas extra so mostra o excedente quando ha excedente, nunca negativo", () => {
    relatorioMock.dias = [
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
      {
        iso: "2026-09-02",
        diaSemana: 3,
        estado: "normal",
        categoriaAusencia: null,
        planeadoMinutos: 480,
        realizadoMinutos: 540,
        planeadoIntervalos: [{ hora_inicio: "09:00", hora_fim: "17:00" }],
        realizadoIntervalos: [{ hora_inicio: "09:00", hora_fim: "18:00" }],
        obraHoras: 0,
        temFalta: false,
        minutosEmFalta: 0,
        horasExtraMinutos: 60,
      },
    ];

    render(
      <RelatorioAssiduidadeMensalConteudo
        pessoaId="pessoa-1"
        ano={2026}
        mes={8}
        pessoaNome="Maria Silva"
        permissoes={permissoes()}
      />,
    );

    expect(screen.getByText("+1h00")).toBeInTheDocument();
  });

  it("mostra a nota de horas extra noturnas quando ha parte nocturna", () => {
    relatorioMock.dias = [
      {
        iso: "2026-09-01",
        diaSemana: 2,
        estado: "normal",
        categoriaAusencia: null,
        planeadoMinutos: 480,
        realizadoMinutos: 540,
        planeadoIntervalos: [{ hora_inicio: "09:00", hora_fim: "17:00" }],
        realizadoIntervalos: [{ hora_inicio: "09:00", hora_fim: "18:00" }],
        obraHoras: 0,
        temFalta: false,
        minutosEmFalta: 0,
        horasExtraMinutos: 60,
        horasExtraNoturnasMinutos: 10,
      },
    ];

    render(
      <RelatorioAssiduidadeMensalConteudo
        pessoaId="pessoa-1"
        ano={2026}
        mes={8}
        pessoaNome="Maria Silva"
        permissoes={permissoes()}
      />,
    );

    expect(screen.getByText("+1h00")).toBeInTheDocument();
    expect(screen.getByText("(0h10 noturnas)")).toBeInTheDocument();
  });

  it("sem parte nocturna nas horas extra, nao mostra nenhuma nota adicional", () => {
    relatorioMock.dias = [
      {
        iso: "2026-09-01",
        diaSemana: 2,
        estado: "normal",
        categoriaAusencia: null,
        planeadoMinutos: 480,
        realizadoMinutos: 540,
        planeadoIntervalos: [{ hora_inicio: "09:00", hora_fim: "17:00" }],
        realizadoIntervalos: [{ hora_inicio: "09:00", hora_fim: "18:00" }],
        obraHoras: 0,
        temFalta: false,
        minutosEmFalta: 0,
        horasExtraMinutos: 60,
        horasExtraNoturnasMinutos: 0,
      },
    ];

    render(
      <RelatorioAssiduidadeMensalConteudo
        pessoaId="pessoa-1"
        ano={2026}
        mes={8}
        pessoaNome="Maria Silva"
        permissoes={permissoes()}
      />,
    );

    expect(screen.getByText("+1h00")).toBeInTheDocument();
    expect(screen.queryByText(/noturnas/)).not.toBeInTheDocument();
  });

  it("o rodape mostra o total de horas extra noturnas quando maior que zero", () => {
    relatorioMock.totais = {
      ...relatorioMock.totais,
      horasExtraMinutos: 90,
      horasExtraNoturnasMinutos: 30,
    };

    render(
      <RelatorioAssiduidadeMensalConteudo
        pessoaId="pessoa-1"
        ano={2026}
        mes={8}
        pessoaNome="Maria Silva"
        permissoes={permissoes()}
      />,
    );

    expect(screen.getByText("Horas extra noturnas: 0h30")).toBeInTheDocument();
  });

  it("o rodape nao mostra o total de horas extra noturnas quando e zero", () => {
    render(
      <RelatorioAssiduidadeMensalConteudo
        pessoaId="pessoa-1"
        ano={2026}
        mes={8}
        pessoaNome="Maria Silva"
        permissoes={permissoes()}
      />,
    );

    expect(screen.queryByText(/Horas extra noturnas/)).not.toBeInTheDocument();
  });

  it("um feriado trabalhado deixa de ficar escondido: mostra planeado/realizado e fica destacado", () => {
    relatorioMock.dias = [
      {
        iso: "2026-09-01",
        diaSemana: 2,
        estado: "feriado",
        categoriaAusencia: null,
        planeadoMinutos: 0,
        realizadoMinutos: 240,
        planeadoIntervalos: [],
        realizadoIntervalos: [{ hora_inicio: "09:00", hora_fim: "13:00" }],
        obraHoras: 0,
        temFalta: false,
        minutosEmFalta: 0,
        horasExtraMinutos: 240,
      },
    ];

    render(
      <RelatorioAssiduidadeMensalConteudo
        pessoaId="pessoa-1"
        ano={2026}
        mes={8}
        pessoaNome="Maria Silva"
        permissoes={permissoes()}
      />,
    );

    expect(screen.getByText("09:00-13:00")).toBeInTheDocument();
    expect(screen.getByText("Feriado trabalhado")).toBeInTheDocument();
    const linha = screen.getByText("2026-09-01").closest("tr");
    expect(linha?.className).toMatch(/bg-amber/);
  });

  it("um descanso trabalhado fica destacado com uma cor diferente da do feriado trabalhado", () => {
    relatorioMock.dias = [
      {
        iso: "2026-09-01",
        diaSemana: 2,
        estado: "descanso",
        categoriaAusencia: null,
        planeadoMinutos: 0,
        realizadoMinutos: 120,
        planeadoIntervalos: [],
        realizadoIntervalos: [{ hora_inicio: "10:00", hora_fim: "12:00" }],
        obraHoras: 0,
        temFalta: false,
        minutosEmFalta: 0,
        horasExtraMinutos: 120,
      },
    ];

    render(
      <RelatorioAssiduidadeMensalConteudo
        pessoaId="pessoa-1"
        ano={2026}
        mes={8}
        pessoaNome="Maria Silva"
        permissoes={permissoes()}
      />,
    );

    expect(screen.getByText("Descanso trabalhado")).toBeInTheDocument();
    const linha = screen.getByText("2026-09-01").closest("tr");
    expect(linha?.className).toMatch(/bg-blue/);
    expect(linha?.className).not.toMatch(/bg-amber/);
  });

  it("um dia 'sem_registo' mostra o planeado, o badge proprio e fica destacado", () => {
    relatorioMock.dias = [
      {
        iso: "2026-09-01",
        diaSemana: 2,
        estado: "sem_registo",
        categoriaAusencia: null,
        planeadoMinutos: 480,
        realizadoMinutos: 0,
        planeadoIntervalos: [{ hora_inicio: "09:00", hora_fim: "17:00" }],
        realizadoIntervalos: [],
        obraHoras: 0,
        temFalta: false,
        minutosEmFalta: 0,
        horasExtraMinutos: 0,
        horasExtraNoturnasMinutos: 0,
      },
    ];

    render(
      <RelatorioAssiduidadeMensalConteudo
        pessoaId="pessoa-1"
        ano={2026}
        mes={8}
        pessoaNome="Maria Silva"
        permissoes={permissoes()}
      />,
    );

    expect(screen.getByText("09:00-17:00")).toBeInTheDocument();
    expect(screen.getByText("Sem registo")).toBeInTheDocument();
    const linha = screen.getByText("2026-09-01").closest("tr");
    expect(linha?.className).toMatch(/bg-rose/);
  });

  it("o rodape mostra o total de dias sem registo", () => {
    relatorioMock.totais = {
      ...relatorioMock.totais,
      diasSemRegisto: 4,
    };

    render(
      <RelatorioAssiduidadeMensalConteudo
        pessoaId="pessoa-1"
        ano={2026}
        mes={8}
        pessoaNome="Maria Silva"
        permissoes={permissoes()}
      />,
    );

    expect(screen.getByText("4 dias sem registo")).toBeInTheDocument();
  });

  it("um dia 'normal' com horas extra fica destacado a verde", () => {
    relatorioMock.dias = [
      {
        iso: "2026-09-01",
        diaSemana: 2,
        estado: "normal",
        categoriaAusencia: null,
        planeadoMinutos: 480,
        realizadoMinutos: 720,
        planeadoIntervalos: [{ hora_inicio: "09:00", hora_fim: "13:00" }],
        realizadoIntervalos: [{ hora_inicio: "09:00", hora_fim: "17:00" }],
        obraHoras: 0,
        temFalta: false,
        minutosEmFalta: 0,
        horasExtraMinutos: 240,
        horasExtraNoturnasMinutos: 0,
      },
    ];

    render(
      <RelatorioAssiduidadeMensalConteudo
        pessoaId="pessoa-1"
        ano={2026}
        mes={8}
        pessoaNome="Maria Silva"
        permissoes={permissoes()}
      />,
    );

    const linha = screen.getByText("2026-09-01").closest("tr");
    expect(linha?.className).toMatch(/bg-green/);
  });

  it("um feriado trabalhado com horas extra mantem o destaque ambar, nunca verde", () => {
    relatorioMock.dias = [
      {
        iso: "2026-09-01",
        diaSemana: 2,
        estado: "feriado",
        categoriaAusencia: null,
        planeadoMinutos: 0,
        realizadoMinutos: 240,
        planeadoIntervalos: [],
        realizadoIntervalos: [{ hora_inicio: "09:00", hora_fim: "13:00" }],
        obraHoras: 0,
        temFalta: false,
        minutosEmFalta: 0,
        horasExtraMinutos: 240,
        horasExtraNoturnasMinutos: 0,
      },
    ];

    render(
      <RelatorioAssiduidadeMensalConteudo
        pessoaId="pessoa-1"
        ano={2026}
        mes={8}
        pessoaNome="Maria Silva"
        permissoes={permissoes()}
      />,
    );

    const linha = screen.getByText("2026-09-01").closest("tr");
    expect(linha?.className).toMatch(/bg-amber/);
    expect(linha?.className).not.toMatch(/bg-green/);
  });

  it("sem horas extra, um dia 'normal' nao fica destacado", () => {
    render(
      <RelatorioAssiduidadeMensalConteudo
        pessoaId="pessoa-1"
        ano={2026}
        mes={8}
        pessoaNome="Maria Silva"
        permissoes={permissoes()}
      />,
    );

    const linha = screen.getByText("2026-09-01").closest("tr");
    expect(linha?.className ?? "").not.toMatch(/bg-green/);
  });

  it("com dias sem registo, o rodape mostra a legenda a explicar a relacao com faltas", () => {
    relatorioMock.totais = {
      ...relatorioMock.totais,
      diasSemRegisto: 6,
    };

    render(
      <RelatorioAssiduidadeMensalConteudo
        pessoaId="pessoa-1"
        ano={2026}
        mes={8}
        pessoaNome="Maria Silva"
        permissoes={permissoes()}
      />,
    );

    expect(screen.getByText("6 dias sem registo")).toBeInTheDocument();
    expect(screen.getByText("Faltas e dias por esclarecer")).toBeInTheDocument();
    expect(
      screen.getByText(
        "De 6 dias com falha no trabalho, 0 já foram registados como falta pelo RH; os restantes 6 ainda não têm falta associada.",
      ),
    ).toBeInTheDocument();
  });

  it("sem dias sem registo nem faltas registadas, a frase de ligacao nao aparece", () => {
    render(
      <RelatorioAssiduidadeMensalConteudo
        pessoaId="pessoa-1"
        ano={2026}
        mes={8}
        pessoaNome="Maria Silva"
        permissoes={permissoes()}
      />,
    );

    expect(screen.getByText("Faltas e dias por esclarecer")).toBeInTheDocument();
    expect(
      screen.queryByText(
        /De \d+ dias com falha no trabalho/,
      ),
    ).not.toBeInTheDocument();
  });

  it("um feriado ou descanso sem trabalho nenhum continua escondido, sem destaque", () => {
    relatorioMock.dias = [
      {
        iso: "2026-09-01",
        diaSemana: 2,
        estado: "feriado",
        categoriaAusencia: null,
        planeadoMinutos: 0,
        realizadoMinutos: 0,
        planeadoIntervalos: [],
        realizadoIntervalos: [],
        obraHoras: 0,
        temFalta: false,
        minutosEmFalta: 0,
        horasExtraMinutos: 0,
      },
    ];

    render(
      <RelatorioAssiduidadeMensalConteudo
        pessoaId="pessoa-1"
        ano={2026}
        mes={8}
        pessoaNome="Maria Silva"
        permissoes={permissoes()}
      />,
    );

    expect(screen.queryByText("Feriado trabalhado")).not.toBeInTheDocument();
    const linha = screen.getByText("2026-09-01").closest("tr");
    expect(linha?.className ?? "").not.toMatch(/bg-amber|bg-blue/);
  });
});

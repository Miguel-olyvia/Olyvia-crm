/**
 * As abas de tempo da ficha entregam aos componentes REAIS (os de sempre, já ligados à base) tudo o que eles pedem.
 * Nada aqui é decidido pelo painel: só se passa o que vem da ficha, das permissões e do contexto.
 *
 * Caso a fechar: o separador Planeamento (horário) perdeu, ao vir do protótipo, as props da aba Assiduidade
 * (pessoa, nome, se é a própria, permissões, cargo e admissão). Sem elas a aba Assiduidade desaparecia em silêncio.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({ useTranslation: () => ({ language: "pt", t: (chave: string) => chave }) }));

let propsHorario: Record<string, unknown> | null = null;
vi.mock("@/components/hr/PessoaHorarioTab", () => ({
  PessoaHorarioTab: (props: Record<string, unknown>) => {
    propsHorario = props;
    return <div data-testid="horario" />;
  },
}));
let propsAusencias: Record<string, unknown> | null = null;
vi.mock("@/components/hr/PessoaAusenciasTab", () => ({
  PessoaAusenciasTab: (props: Record<string, unknown>) => {
    propsAusencias = props;
    return <div data-testid="ausencias" />;
  },
}));
vi.mock("@/components/hr/PessoaContratoTab", () => ({ PessoaContratoTab: () => <div data-testid="contrato" /> }));
vi.mock("@/components/hr/PessoaAnexosCard", () => ({ PessoaAnexosCard: () => <div data-testid="anexos" /> }));
vi.mock("@/components/hr/PessoaDocumentosTab", () => ({ PessoaDocumentosTab: () => <div data-testid="documentos" /> }));
vi.mock("./AbasPessoa", () => ({ SemAcesso: () => <p>sem-acesso</p> }));

import type { AbaProps } from "./AbasPessoa";
import { AbaAusencias, AbaContratos, AbaDocumentos, AbaPlaneamento } from "./AbasTempo";

const PERMISSOES_ASSIDUIDADE = { view: true, equipaView: false, viewOwn: true };

function props(sobre: { minhaPessoaId?: string | null; podeVerVinculos?: boolean } = {}): AbaProps {
  const pessoa = { id: "p1", organization_id: "org-1", nome_completo: "Rui Amaral", cargo: "Gerente", data_admissao: "2024-05-01", cargo_id: null };
  const ficha = {
    horarioPlaneado: [{ id: "h1" }], horarioRealizado: [{ id: "r1" }], saving: false, vinculos: [], retribuicao: null,
    savePlaneado: vi.fn(), corrigirPlaneado: vi.fn(), saveVinculo: vi.fn(), refresh: vi.fn(),
  };
  const ctx = {
    trabalho: {
      podeVerHorario: true, podeEditarHorario: true, podeCorrigirHorario: false, podeVerRealizado: true,
      podeVerVinculos: sobre.podeVerVinculos ?? true, podeEditarVinculos: false, podeVerRetribuicao: true,
      podeEditarRetribuicao: false, podeCorrigirRetribuicao: false, podeCorrigirHorasVinculo: false,
    },
    locais: [{ id: "l1" }], locaisALoad: false, horasContratadasSemanais: 40, permissoesAssiduidade: PERMISSOES_ASSIDUIDADE,
    minhaPessoaId: sobre.minhaPessoaId === undefined ? "p1" : sobre.minhaPessoaId,
    reportaANome: "Marta", nomePorPessoaId: new Map(), permissoesAusencias: { view: true },
    cargos: [], periodosDosCargos: [], cargosPorChegar: false, periodosError: null, permissoesDocumentos: { emitir: false },
    vinculosOpcoesDocumento: [], hasPermission: () => true, permissoesAnexos: {}, permissoesEscritaAnexos: {},
  };
  // O contexto e a ficha são só o que estes componentes leem; os tipos completos vivem nos seus hooks.
  return { ficha, pessoa, ctx } as unknown as AbaProps;
}

beforeEach(() => {
  propsHorario = null;
  propsAusencias = null;
});

describe("AbaPlaneamento: o horário recebe o que a aba Assiduidade pede", () => {
  it("passa a pessoa, o nome, as permissões de assiduidade, o cargo e a admissão", () => {
    render(<AbaPlaneamento {...props()} />);
    expect(propsHorario).toMatchObject({
      pessoaId: "p1",
      pessoaNome: "Rui Amaral",
      souAPessoa: true,
      permissoesAssiduidade: PERMISSOES_ASSIDUIDADE,
      cargo: "Gerente",
      dataAdmissao: "2024-05-01",
      horasContratadasSemanais: 40,
    });
  });

  it("passa o horário planeado e realizado da ficha real e as permissões do trabalho", () => {
    render(<AbaPlaneamento {...props()} />);
    expect(propsHorario).toMatchObject({
      planeado: [{ id: "h1" }],
      realizado: [{ id: "r1" }],
      podeVerPlaneado: true,
      podeEditarPlaneado: true,
      podeCorrigirPlaneado: false,
      podeVerRealizado: true,
    });
    expect(typeof propsHorario?.onGuardarPlaneado).toBe("function");
    expect(typeof propsHorario?.onCorrigirPlaneado).toBe("function");
  });

  it("só é «a própria pessoa» quando a ficha aberta é a da pessoa com sessão", () => {
    render(<AbaPlaneamento {...props({ minhaPessoaId: "outra" })} />);
    expect(propsHorario?.souAPessoa).toBe(false);
  });

  it("sem pessoa ligada à sessão (null), nunca é «a própria»", () => {
    render(<AbaPlaneamento {...props({ minhaPessoaId: null })} />);
    expect(propsHorario?.souAPessoa).toBe(false);
  });
});

describe("AbaAusencias e AbaContratos e AbaDocumentos", () => {
  it("as ausências recebem a pessoa, a chefia e as permissões", () => {
    render(<AbaAusencias {...props()} />);
    expect(propsAusencias).toMatchObject({ pessoaId: "p1", pessoaNome: "Rui Amaral", souAPessoa: true, aprovadorChefiaNome: "Marta" });
  });

  it("os contratos sem hr.pessoas.vinculos.view mostram «sem acesso», não o separador", () => {
    render(<AbaContratos {...props({ podeVerVinculos: false })} />);
    expect(screen.getByText("sem-acesso")).toBeInTheDocument();
    expect(screen.queryByTestId("contrato")).not.toBeInTheDocument();
  });

  it("os documentos mostram os anexos e os documentos, sem o portal do colaborador (entra noutra etapa)", () => {
    render(<AbaDocumentos {...props()} />);
    expect(screen.getByTestId("anexos")).toBeInTheDocument();
    expect(screen.getByTestId("documentos")).toBeInTheDocument();
  });
});

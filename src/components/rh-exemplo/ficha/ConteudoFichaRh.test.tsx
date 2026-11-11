/**
 * O painel da ficha de RH de /rh-exemplo, ligado ao hook REAL `usePessoa` (simulado aqui, sem base).
 *
 * O que estes testes fecham:
 *  1. enquanto a ficha carrega o painel mostra o carregamento e NUNCA «não encontrada»;
 *  2. uma falha de leitura diz-se (em português, com «Tentar de novo») e não é «não encontrada»;
 *  3. carregada sem a pessoa, diz que não existe;
 *  4. gravar (a ficha recarrega) manda reler as pendências e o resumo do convite;
 *  5. quando o painel mostra algo definitivo avisa quem o abriu (`aoPronta`), para o foco regressar ao título.
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { reporRhTeste, rhTeste } from "@/test/rhExemploProviders";

// Os filhos do painel lêem a organização e as permissões: contextos em memória, e Supabase simulado e vazio.
vi.mock("@/contexts/CompanyContext", async () => (await import("@/test/rhExemploProviders")).moduloCompanyFalso());
vi.mock("@/contexts/PermissionsContext", async () => (await import("@/test/rhExemploProviders")).moduloPermissoesFalso());
vi.mock("@/integrations/supabase/client", async () => (await import("@/test/rhExemploProviders")).moduloSupabaseFalso());

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ language: "pt", t: (chave: string, p?: Record<string, unknown>) => (p ? `${chave}|${JSON.stringify(p)}` : chave) }),
}));

interface EstadoFicha {
  loading: boolean;
  notFound: boolean;
  error?: string | null;
  pessoa: Record<string, unknown> | null;
  conta: unknown;
  vinculos: Array<{ id: string }>;
  refresh: () => Promise<void>;
}
let estadoFicha: EstadoFicha;
vi.mock("@/components/rh-exemplo/hooks/usePessoa", () => ({ usePessoa: () => estadoFicha }));

const { usarContexto, recarregarConvite, recarregarPendencias } = vi.hoisted(() => ({
  usarContexto: vi.fn(),
  recarregarConvite: vi.fn(),
  recarregarPendencias: vi.fn(),
}));
vi.mock("./useContextoFicha", () => ({ useContextoFicha: usarContexto }));
vi.mock("@/components/rh-exemplo/hooks/useConviteAdmissaoResumo", () => ({
  useConviteAdmissaoResumo: () => ({ resumo: null, recarregar: recarregarConvite }),
}));
vi.mock("@/components/rh-exemplo/hooks/usePessoaFotografia", () => ({ usePessoaFotografia: () => null }));
// A filial do cabeçalho vem da COLOCAÇÃO NO ORGANOGRAMA da pessoa (não do centro de trabalho): os dois hooks são simulados aqui.
const { filiaisFalsas, colocacoesFalsas } = vi.hoisted(() => ({
  filiaisFalsas: { lista: [] as Array<{ id: string; name: string }> },
  colocacoesFalsas: {
    lista: [] as Array<{ id: string; organograma_node_id: string | null; valido_ate: string | null }>,
    loading: false,
    recusado: false,
  },
}));
vi.mock("@/components/rh-exemplo/hooks/useFiliaisDaArvore", () => ({ useFiliaisDaArvore: () => ({ filiais: filiaisFalsas.lista, loading: false }) }));
vi.mock("@/components/rh-exemplo/hooks/usePessoaColocacaoOrganograma", () => ({
  usePessoaColocacaoOrganograma: () => ({ colocacoes: colocacoesFalsas.lista, loading: colocacoesFalsas.loading, recusado: colocacoesFalsas.recusado }),
}));

// O conteúdo das abas e os cartões têm os seus próprios testes: aqui interessa só o painel.
vi.mock("./AbasPessoa", () => ({
  AbaVisaoGeral: () => <div data-testid="aba-visao-geral" />,
  AbaLaborais: () => <div />,
  AbaPessoais: () => <div />,
}));
vi.mock("./AbasTempo", () => ({
  AbaContratos: () => <div />,
  AbaPlaneamento: () => <div />,
  AbaAusencias: () => <div />,
  AbaDocumentos: () => <div />,
}));
vi.mock("@/components/rh-exemplo/custo/AbaCusto", () => ({ AbaCusto: () => <div /> }));
vi.mock("@/components/rh-exemplo/hooks/FaixaProgressoAdmissaoDaFicha", () => ({ FaixaProgressoAdmissaoDaFicha: () => null }));
vi.mock("@/components/rh-exemplo/CriarAcessoDialog", () => ({ CriarAcessoDialog: () => null }));
vi.mock("@/components/rh-exemplo/EnviarConviteDialog", () => ({ EnviarConviteDialog: () => null }));
vi.mock("@/components/rh-exemplo/PessoaAdmissaoPendencias", () => ({ PessoaAdmissaoPendencias: () => null }));
vi.mock("@/components/rh-exemplo/PessoaConviteAdmissaoEstado", () => ({ PessoaConviteAdmissaoEstado: () => null }));
vi.mock("@/components/PermissionGate", () => ({ PermissionGate: ({ children }: { children: ReactNode }) => <>{children}</> }));

import { ConteudoFichaRh } from "./ConteudoFichaRh";

const VIZINHAS = { anterior: null, seguinte: "p2", posicao: 1, total: 2 };

function arvore(aoPronta?: () => void) {
  return (
    <Sheet open>
      <SheetContent>
        <ConteudoFichaRh id="p1" vizinhas={VIZINHAS} aoIr={vi.fn()} aba="visaoGeral" aoMudarAba={vi.fn()} aoPronta={aoPronta} />
      </SheetContent>
    </Sheet>
  );
}

const PESSOA = {
  id: "p1", organization_id: "org-1", nome_completo: "Rui Amaral", cargo: "Gerente", cargo_id: null,
  local_id: null, estado_registo: "activo", fotografia_anexo_id: null, email_pessoal: null,
};

beforeEach(() => {
  reporRhTeste();
  rhTeste.permissoes = new Set(["hr.pessoas.view"]);
  recarregarConvite.mockReset();
  recarregarPendencias.mockReset();
  estadoFicha = { loading: false, notFound: false, pessoa: PESSOA, conta: null, vinculos: [], refresh: vi.fn().mockResolvedValue(undefined) };
  filiaisFalsas.lista = [];
  colocacoesFalsas.lista = [];
  colocacoesFalsas.loading = false;
  colocacoesFalsas.recusado = false;
  usarContexto.mockReset();
  usarContexto.mockReturnValue({
    hasPermission: () => true,
    pendencias: { pendencias: [], carregando: false, semAcesso: false, erro: false, recarregar: recarregarPendencias },
    estadoContratoDerivado: "em_curso",
    locais: [],
    cargos: [],
  });
});

describe("ConteudoFichaRh (rh-exemplo): carregar, falhar, não existir e existir", () => {
  it("enquanto carrega mostra o carregamento e não diz «não encontrada»", () => {
    estadoFicha = { ...estadoFicha, loading: true, pessoa: null };
    render(arvore());
    expect(within(screen.getByRole("dialog")).getByRole("status")).toHaveTextContent("rhForm.ficha.aCarregar");
    expect(screen.queryByText("hr.pessoa.notFound")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });

  it("carregada e sem a pessoa (notFound), diz que não existe, com o botão de fechar", () => {
    estadoFicha = { ...estadoFicha, notFound: true, pessoa: null };
    render(arvore());
    expect(screen.getByText("hr.pessoa.notFound")).toBeInTheDocument();
    expect(screen.getByText("rhForm.ficha.naoEncontrada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "rhForm.ficha.fecharAviso" })).toBeInTheDocument();
  });

  it("uma falha de leitura NÃO diz «não encontrada»: diz o erro e oferece tentar de novo", () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    estadoFicha = { ...estadoFicha, pessoa: null, notFound: false, error: "falhou a rede", refresh };
    render(arvore());
    expect(screen.queryByText("hr.pessoa.notFound")).not.toBeInTheDocument();
    expect(screen.getByText("rhForm.ficha.erroCarregar")).toBeInTheDocument();
    expect(screen.queryByText("falhou a rede")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "rhForm.ficha.tentarDeNovo" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("se já há pessoa e o recarregamento falha, a ficha continua à vista", () => {
    estadoFicha = { ...estadoFicha, error: "falhou a rede" };
    render(arvore());
    expect(screen.queryByText("rhForm.ficha.erroCarregar")).not.toBeInTheDocument();
    expect(screen.getByTestId("aba-visao-geral")).toBeInTheDocument();
  });
});

describe("ConteudoFichaRh (rh-exemplo): foco e releitura", () => {
  it("avisa que o painel está pronto só quando a ficha chega, e outra vez nos ramos definitivos", () => {
    const aoPronta = vi.fn();
    estadoFicha = { ...estadoFicha, loading: true, pessoa: null };
    const { rerender } = render(arvore(aoPronta));
    expect(aoPronta).not.toHaveBeenCalled();
    estadoFicha = { ...estadoFicha, loading: false, pessoa: PESSOA };
    rerender(arvore(aoPronta));
    expect(aoPronta).toHaveBeenCalledTimes(1);
  });

  it("avisa também quando o painel mostra «não encontrada» e quando mostra o erro de leitura", () => {
    const naoEncontrada = vi.fn();
    estadoFicha = { ...estadoFicha, notFound: true, pessoa: null };
    render(arvore(naoEncontrada));
    expect(naoEncontrada).toHaveBeenCalledTimes(1);

    const erro = vi.fn();
    estadoFicha = { ...estadoFicha, notFound: false, error: "falhou", pessoa: null };
    render(arvore(erro));
    expect(erro).toHaveBeenCalledTimes(1);
  });

  it("a primeira carga não relê nada; gravar (loading sobe e desce) relê as pendências e o resumo do convite", () => {
    const { rerender } = render(arvore());
    expect(recarregarPendencias).not.toHaveBeenCalled();
    expect(recarregarConvite).not.toHaveBeenCalled();

    estadoFicha = { ...estadoFicha, loading: true };
    rerender(arvore());
    expect(recarregarPendencias).not.toHaveBeenCalled();

    estadoFicha = { ...estadoFicha, loading: false };
    rerender(arvore());
    expect(recarregarPendencias).toHaveBeenCalledTimes(1);
    expect(recarregarConvite).toHaveBeenCalledTimes(1);
  });
});

describe("ConteudoFichaRh (rh-exemplo): a linha por baixo do nome é «Cargo · Filial do organograma»", () => {
  const LOCAIS = [{ id: "l1", nome: "Loja do Porto", organograma_node_id: "no-centro" }];

  it("a filial é a da colocação no organograma e NÃO a do centro de trabalho", () => {
    filiaisFalsas.lista = [{ id: "no-organograma", name: "Filial Lisboa" }, { id: "no-centro", name: "Filial do centro" }];
    colocacoesFalsas.lista = [{ id: "c1", organograma_node_id: "no-organograma", valido_ate: null }];
    estadoFicha = { ...estadoFicha, pessoa: { ...PESSOA, local_id: "l1" } };
    usarContexto.mockReturnValue({ ...usarContexto(), locais: LOCAIS });
    render(arvore());
    const linha = screen.getByRole("heading", { level: 1 }).parentElement as HTMLElement;
    expect(linha).toHaveTextContent("Gerente · Filial Lisboa");
    expect(linha).not.toHaveTextContent("Filial do centro");
  });

  it("usa só a colocação em vigor (sem data de fim), não uma já fechada", () => {
    filiaisFalsas.lista = [{ id: "antiga", name: "Filial Antiga" }, { id: "actual", name: "Filial Actual" }];
    colocacoesFalsas.lista = [
      { id: "c0", organograma_node_id: "antiga", valido_ate: "2026-01-31" },
      { id: "c1", organograma_node_id: "actual", valido_ate: null },
    ];
    render(arvore());
    expect(screen.getByRole("heading", { level: 1 }).parentElement).toHaveTextContent("Gerente · Filial Actual");
  });

  it("enquanto a colocação carrega mostra só o cargo: nem «sem filial» nem filial inventada", () => {
    filiaisFalsas.lista = [{ id: "no-centro", name: "Filial do centro" }];
    colocacoesFalsas.loading = true;
    render(arvore());
    const linha = screen.getByRole("heading", { level: 1 }).parentElement as HTMLElement;
    expect(linha).toHaveTextContent("Gerente");
    expect(linha).not.toHaveTextContent("·");
    expect(linha).not.toHaveTextContent("rhForm.ficha.semFilial");
  });

  it("se a leitura da colocação foi recusada mostra só o cargo, não afirma «sem filial»", () => {
    filiaisFalsas.lista = [{ id: "actual", name: "Filial Actual" }];
    colocacoesFalsas.recusado = true;
    colocacoesFalsas.lista = [];
    render(arvore());
    const linha = screen.getByRole("heading", { level: 1 }).parentElement as HTMLElement;
    expect(linha).toHaveTextContent("Gerente");
    expect(linha).not.toHaveTextContent("·");
    expect(linha).not.toHaveTextContent("rhForm.ficha.semFilial");
  });

  it("sem colocação em vigor diz «sem filial», mesmo que o centro de trabalho tenha filial", () => {
    filiaisFalsas.lista = [{ id: "no-centro", name: "Filial do centro" }];
    colocacoesFalsas.lista = [];
    estadoFicha = { ...estadoFicha, pessoa: { ...PESSOA, local_id: "l1" } };
    usarContexto.mockReturnValue({ ...usarContexto(), locais: LOCAIS });
    render(arvore());
    const linha = screen.getByRole("heading", { level: 1 }).parentElement as HTMLElement;
    expect(linha).toHaveTextContent("Gerente · rhForm.ficha.semFilial");
    expect(linha).not.toHaveTextContent("Filial do centro");
  });
});

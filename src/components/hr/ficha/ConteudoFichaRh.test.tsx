/**
 * O painel da ficha de RH ligado ao hook REAL `usePessoa` (simulado aqui).
 *
 * O que estes testes fecham:
 *  1. enquanto a ficha carrega (`loading`), o painel mostra o carregamento e NUNCA «não encontrada»: com os dados de
 *     exemplo a ficha chegava sempre à primeira, com a base real chega depois e o aviso piscava;
 *  2. só depois de carregar sem encontrar (`notFound`, ou sem pessoa) é que diz que não existe;
 *  3. com a ficha carregada mostra o nome, as sete abas (o Custo não existe nesta etapa) e o contador de contratos
 *     vindo dos vínculos REAIS da ficha;
 *  4. o conteúdo das abas recebe a ficha real e as permissões, sem o painel as recalcular.
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { Sheet, SheetContent } from "@/components/ui/sheet";

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
vi.mock("@/hooks/usePessoa", () => ({ usePessoa: () => estadoFicha }));

const { usarContexto } = vi.hoisted(() => ({ usarContexto: vi.fn() }));
vi.mock("./useContextoFicha", () => ({ useContextoFicha: usarContexto }));
vi.mock("@/hooks/useConviteAdmissaoResumo", () => ({
  useConviteAdmissaoResumo: () => ({ resumo: null, recarregar: vi.fn() }),
}));
vi.mock("@/hooks/usePessoaFotografia", () => ({ usePessoaFotografia: () => null }));
vi.mock("@/hooks/useFiliaisDaArvore", () => ({ useFiliaisDaArvore: () => ({ filiais: [] }) }));

// O conteúdo das abas tem os seus próprios testes: aqui interessa só o painel.
vi.mock("./AbasPessoa", () => ({
  AbaVisaoGeral: ({ ficha }: { ficha: EstadoFicha }) => <div data-testid="aba-visao-geral">{ficha.pessoa?.nome_completo as string}</div>,
  AbaLaborais: () => <div />,
  AbaPessoais: () => <div />,
  SemAcesso: () => <div />,
}));
vi.mock("./AbasTempo", () => ({
  AbaContratos: () => <div />,
  AbaPlaneamento: () => <div />,
  AbaAusencias: () => <div />,
  AbaDocumentos: () => <div />,
}));
vi.mock("@/components/hr/CriarAcessoDialog", () => ({ CriarAcessoDialog: () => null }));
vi.mock("@/components/hr/EnviarConviteDialog", () => ({ EnviarConviteDialog: () => null }));
vi.mock("@/components/hr/PessoaAdmissaoPendencias", () => ({ PessoaAdmissaoPendencias: () => null }));
vi.mock("@/components/hr/PessoaConviteAdmissaoEstado", () => ({ PessoaConviteAdmissaoEstado: () => null }));
vi.mock("@/components/PermissionGate", () => ({ PermissionGate: ({ children }: { children: ReactNode }) => <>{children}</> }));

import { ConteudoFichaRh } from "./ConteudoFichaRh";

const VIZINHAS = { anterior: null, seguinte: "p2", posicao: 1, total: 2 };

const COLEGAS = [{ id: "p2", nome_completo: "Marta Figueiredo" }];

function montar() {
  return render(
    <Sheet open>
      <SheetContent>
        <ConteudoFichaRh id="p1" vizinhas={VIZINHAS} aoIr={vi.fn()} aba="visaoGeral" aoMudarAba={vi.fn()} colegas={COLEGAS} />
      </SheetContent>
    </Sheet>,
  );
}

const PESSOA = {
  id: "p1", organization_id: "org-1", nome_completo: "Rui Amaral", cargo: "Gerente", cargo_id: null,
  local_id: null, estado_registo: "activo", fotografia_anexo_id: null, email_pessoal: null,
};

beforeEach(() => {
  estadoFicha = { loading: false, notFound: false, pessoa: PESSOA, conta: null, vinculos: [], refresh: vi.fn().mockResolvedValue(undefined) };
  usarContexto.mockReset();
  usarContexto.mockReturnValue({
    hasPermission: () => true,
    pendencias: { pendencias: [], carregando: false, semAcesso: false, erro: false, recarregar: vi.fn() },
    estadoContratoDerivado: "em_curso",
    locais: [],
    cargos: [],
  });
});

describe("ConteudoFichaRh: carregar, não existir e existir", () => {
  it("enquanto carrega mostra o carregamento e não diz «não encontrada»", () => {
    estadoFicha = { ...estadoFicha, loading: true, pessoa: null };
    montar();
    expect(within(screen.getByRole("dialog")).getByRole("status")).toHaveTextContent("rhForm.ficha.aCarregar");
    expect(screen.queryByText("hr.pessoa.notFound")).not.toBeInTheDocument();
    expect(screen.queryByText("rhForm.ficha.naoEncontrada")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });

  it("o carregamento tem um título acessível (o painel é um diálogo)", () => {
    estadoFicha = { ...estadoFicha, loading: true, pessoa: null };
    montar();
    expect(screen.getByRole("dialog")).toHaveAccessibleName("rhForm.ficha.aCarregar");
  });

  it("carregada e sem a pessoa (notFound), diz que não existe, com o botão de fechar", () => {
    estadoFicha = { ...estadoFicha, notFound: true, pessoa: null };
    montar();
    expect(screen.getByText("hr.pessoa.notFound")).toBeInTheDocument();
    expect(screen.getByText("rhForm.ficha.naoEncontrada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "rhForm.ficha.fecharAviso" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("carregada sem pessoa e sem notFound (resposta vazia) também diz que não existe, e não fica a carregar", () => {
    estadoFicha = { ...estadoFicha, notFound: false, pessoa: null };
    montar();
    expect(screen.getByText("hr.pessoa.notFound")).toBeInTheDocument();
  });

  it("a ficha não traz um segundo h1: o título da página é o único (o do painel é h2)", () => {
    montar();
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
  });

  it("o cabeçalho (onde [ e ] valem) contém o título e os botões de navegação, e o título aceita foco", () => {
    montar();
    const cabecalho = document.querySelector("[data-cabecalho-ficha]") as HTMLElement;
    expect(cabecalho).not.toBeNull();
    const titulo = cabecalho.querySelector("[data-titulo-ficha]") as HTMLElement;
    expect(titulo).toHaveAttribute("tabindex", "-1");
    expect(cabecalho.querySelectorAll("[data-seta]")).toHaveLength(2);
  });

  it("uma falha de leitura NÃO diz «não encontrada»: diz o erro em português e oferece tentar de novo", () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    estadoFicha = { ...estadoFicha, pessoa: null, notFound: false, error: "falhou a rede", refresh };
    montar();
    expect(screen.queryByText("hr.pessoa.notFound")).not.toBeInTheDocument();
    expect(screen.queryByText("rhForm.ficha.naoEncontrada")).not.toBeInTheDocument();
    expect(screen.getByText("rhForm.ficha.erroCarregar")).toBeInTheDocument();
    expect(screen.queryByText("falhou a rede")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "rhForm.ficha.tentarDeNovo" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("a falha de leitura também tem botão de fechar e um título para o painel", () => {
    estadoFicha = { ...estadoFicha, pessoa: null, error: "falhou a rede" };
    montar();
    expect(screen.getByRole("dialog")).toHaveAccessibleName();
    expect(screen.getByRole("button", { name: "rhForm.ficha.fecharAviso" })).toBeInTheDocument();
  });

  it("se já há pessoa e o recarregamento falha, a ficha continua à vista (o erro não a esconde)", () => {
    estadoFicha = { ...estadoFicha, error: "falhou a rede" };
    montar();
    expect(screen.getByRole("heading", { level: 2, name: "Rui Amaral" })).toBeInTheDocument();
  });

  it("avisa que a ficha chegou (para o foco regressar ao título e aos botões), e só então", () => {
    const aoPronta = vi.fn();
    const arvore = () => (
      <Sheet open>
        <SheetContent>
          <ConteudoFichaRh id="p1" vizinhas={VIZINHAS} aoIr={vi.fn()} aba="visaoGeral" aoMudarAba={vi.fn()} colegas={COLEGAS} aoPronta={aoPronta} />
        </SheetContent>
      </Sheet>
    );
    estadoFicha = { ...estadoFicha, loading: true, pessoa: null };
    const { rerender } = render(arvore());
    expect(aoPronta).not.toHaveBeenCalled();
    estadoFicha = { ...estadoFicha, loading: false, pessoa: PESSOA };
    rerender(arvore());
    expect(aoPronta).toHaveBeenCalledTimes(1);
  });

  it("com a ficha carregada mostra o nome e as sete abas, sem a aba Custo", () => {
    montar();
    expect(screen.getByRole("heading", { level: 2, name: "Rui Amaral" })).toBeInTheDocument();
    const abas = screen.getAllByRole("tab").map((a) => a.getAttribute("id")?.split("trigger-")[1]);
    expect(abas).toEqual(["visaoGeral", "laborais", "pessoais", "contratos", "planeamento", "ausencias", "documentos"]);
    expect(screen.queryByRole("tab", { name: /custo/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("aba-visao-geral")).toHaveTextContent("Rui Amaral");
  });

  it("o contador da aba Contratos é o número de vínculos da ficha real", () => {
    estadoFicha = { ...estadoFicha, vinculos: [{ id: "v1" }, { id: "v2" }] };
    montar();
    const aba = screen.getAllByRole("tab").find((a) => a.id.endsWith("trigger-contratos")) as HTMLElement;
    expect(within(aba).getByText("2")).toBeInTheDocument();
  });

  it("não há contadores de documentos nem de ausências (ainda sem fonte real)", () => {
    estadoFicha = { ...estadoFicha, vinculos: [{ id: "v1" }] };
    montar();
    const abas = screen.getAllByRole("tab");
    for (const aba of abas.filter((a) => !a.id.endsWith("trigger-contratos"))) {
      expect(within(aba).queryByText(/^\d+$/)).not.toBeInTheDocument();
    }
  });

  it("sem selo «dados de exemplo» no cabeçalho", () => {
    montar();
    expect(screen.queryByText("rhExemplo.selo")).not.toBeInTheDocument();
  });

  it("gravar recarrega a ficha (loading volta a true) sem desmontar o painel: a pessoa continua à vista", () => {
    estadoFicha = { ...estadoFicha, loading: true };
    montar();
    expect(screen.getByRole("heading", { level: 2, name: "Rui Amaral" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(7);
  });

  it("entrega ao contexto da ficha os colegas da lista (não recarrega a organização inteira por pessoa aberta)", () => {
    montar();
    expect(usarContexto).toHaveBeenCalled();
    const [ficha, pessoa, colegas] = usarContexto.mock.calls[0];
    expect(ficha).toBe(estadoFicha);
    expect(pessoa).toBe(PESSOA);
    expect(colegas).toBe(COLEGAS);
  });
});

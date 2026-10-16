/**
 * A página «Pessoas» (lista de RH + ficha em painel) ligada aos hooks REAIS, simulados aqui.
 *
 * O que estes testes fecham:
 *  1. a lista mostra as pessoas de `usePessoas`, com o estado do acesso e (só com `hr.pessoas.vinculos.view`) o do
 *     contrato; o chip «Convidado» não existe;
 *  2. o carregamento, o erro e os dois vazios (organização sem pessoas / filtro sem resultados) dizem-se;
 *  3. o URL continua a mandar: `?tab=funcoes` abre o separador de funções, `?tab=organograma` mantém o organograma
 *     antigo (não redireciona para uma página que ainda não existe) e `?tab=contratos` só existe com a permissão;
 *  4. abrir uma pessoa abre a ficha em painel; «Nova pessoa» só com `hr.pessoas.create`; os dois botões de
 *     configuração só com a respetiva permissão;
 *  5. sem organização ativa, ou com as permissões a carregar, não se mostra a lista.
 */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ language: "pt", t: (chave: string, p?: Record<string, unknown>) => (p ? `${chave}|${JSON.stringify(p)}` : chave) }),
}));

let empresa: { activeCompany: { id: string; name: string } | null; isLoading: boolean };
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => empresa }));

let permissoes: Set<string>;
let permissoesALoad = false;
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: (p: string) => permissoes.has(p), loading: permissoesALoad }),
}));

const criarPessoa = vi.fn();
let listaPessoas: ReturnType<typeof criarPessoas>;
vi.mock("@/hooks/usePessoas", () => ({ usePessoas: () => listaPessoas }));
vi.mock("@/hooks/useLocaisTrabalho", () => ({
  useLocaisTrabalho: () => ({ locais: [{ id: "l1", nome: "Loja do Chiado" }], loading: false }),
}));

// Os filhos pesados têm os seus próprios testes: aqui interessa o que a página lhes entrega.
vi.mock("@/components/NoOrganizationState", () => ({ NoOrganizationState: () => <p>sem-organizacao</p> }));
vi.mock("@/components/hr/ficha/FichaPessoaRh", () => ({
  FichaPessoaRh: (p: { id: string | null; aberta: boolean; aoFechar: () => void; idsVisiveis: string[]; aoIrPara: (id: string) => void; aba?: string; aoMudarAba: (aba: string) => void; colegas: Array<{ id: string }> }) => (
    <div data-testid="ficha" data-id={p.id ?? ""} data-aberta={String(p.aberta)} data-aba={p.aba ?? ""} data-ids={p.idsVisiveis.join(",")} data-colegas={p.colegas.map((c) => c.id).join(",")}>
      <button type="button" onClick={p.aoFechar}>fechar-ficha</button>
      <button type="button" onClick={() => p.aoIrPara("p3")}>ir-p3</button>
      <button type="button" onClick={() => p.aoMudarAba("laborais")}>aba-laborais</button>
    </div>
  ),
}));
vi.mock("@/components/hr/NovaPessoaDialogo", () => ({
  NovaPessoaDialogo: (p: { open: boolean; onCriada: (id: string) => void; onCriar: unknown; colegas: Array<{ id: string }> }) =>
    p.open ? (
      <div data-testid="nova" data-colegas={p.colegas.map((c) => c.id).join(",")} data-onCriar={String(p.onCriar === criarPessoa)}>
        <button type="button" onClick={() => p.onCriada("p2")}>criada-p2</button>
      </div>
    ) : null,
}));
vi.mock("@/components/hr/admissao/PipelineAdmissoes", () => ({
  PipelineAdmissoes: ({ aoAbrirFicha }: { aoAbrirFicha: (id: string) => void }) => (
    <div>
      <p>conteudo-pipeline</p>
      <button type="button" onClick={() => aoAbrirFicha("p2")}>pipeline-abrir-p2</button>
    </div>
  ),
}));
vi.mock("@/components/hr/PessoasFuncoesTab", () => ({ PessoasFuncoesTab: () => <p>conteudo-funcoes</p> }));
vi.mock("@/components/hr/PessoasOrganogramaTab", () => ({ PessoasOrganogramaTab: () => <p>conteudo-organograma</p> }));
vi.mock("@/components/hr/fimContrato/ContratosATerminarTab", () => ({
  ContratosATerminarTab: ({ organizationId }: { organizationId: string }) => <p>conteudo-contratos:{organizationId}</p>,
}));

import Pessoas from "../Pessoas";
import PessoaDetail from "../PessoaDetail";

function criarPessoas(sobre: Partial<{ loading: boolean; error: string | null; pessoas: unknown[] }> = {}) {
  const pessoas = sobre.pessoas ?? [
    { id: "p1", nome_completo: "Marta Figueiredo", cargo: "Diretora de RH", numero_interno: "RH-1", email_trabalho: "marta@x.pt", local_id: "l1", local_trabalho: null, data_admissao: "2020-01-01", estadoAcesso: "ativo", estado_contrato_derivado: "em_curso", estado_registo: "activo" },
    { id: "p2", nome_completo: "Rui Amaral", cargo: "Operador", numero_interno: null, email_trabalho: null, local_id: null, local_trabalho: "Armazém", data_admissao: "2024-05-01", estadoAcesso: "semConta", estado_contrato_derivado: "sem_contrato", estado_registo: "activo" },
    { id: "p3", nome_completo: "Beatriz Lopes", cargo: null, numero_interno: null, email_trabalho: null, local_id: null, local_trabalho: null, data_admissao: null, estadoAcesso: "semConta", estado_contrato_derivado: null, estado_registo: "activo" },
  ];
  return { pessoas, stats: { activos: 3, entradas90d: 1, saidas90d: 0 }, loading: sobre.loading ?? false, error: sobre.error ?? null, criarPessoa };
}

function Sonda() {
  const l = useLocation();
  return <output data-testid="url">{`${l.pathname}${l.search}`}</output>;
}

function renderEm(endereco: string, Pagina: () => ReactNode = () => <Pessoas />) {
  return render(
    <MemoryRouter initialEntries={[endereco]}>
      <Routes>
        <Route path="/rh/pessoas" element={<Pagina />} />
        <Route path="/rh/pessoas/:id" element={<Pagina />} />
        <Route path="/rh/admissao/configuracao" element={<p>pagina-admissao-config</p>} />
        <Route path="/rh/contratos/configuracao" element={<p>pagina-regras-fim</p>} />
      </Routes>
      <Sonda />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  empresa = { activeCompany: { id: "org-1", name: "Nike" }, isLoading: false };
  permissoes = new Set(["hr.pessoas.create", "hr.pessoas.vinculos.view"]);
  permissoesALoad = false;
  listaPessoas = criarPessoas();
  criarPessoa.mockReset();
});

describe("Pessoas: a lista", () => {
  it("mostra o título, o resumo e uma linha por pessoa, sem o selo de dados de exemplo", () => {
    renderEm("/rh/pessoas");
    expect(screen.getByRole("heading", { level: 1, name: "hr.pessoas.title" })).toBeInTheDocument();
    expect(screen.queryByText("rhExemplo.selo")).not.toBeInTheDocument();
    const tabela = screen.getByRole("table");
    expect(within(tabela).getAllByRole("row")).toHaveLength(1 + 3);
    expect(within(tabela).getByText("Marta Figueiredo")).toBeInTheDocument();
    expect(screen.getByText(/rhForm\.lista\.resumo/)).toHaveTextContent('"activos":3');
  });

  it("o estado do acesso vem do hook e o do contrato só aparece com hr.pessoas.vinculos.view", () => {
    renderEm("/rh/pessoas");
    const tabela = screen.getByRole("table");
    expect(within(tabela).getAllByText("hr.estadoAcesso.ativo")).toHaveLength(1);
    expect(within(tabela).getAllByText("hr.estadoAcesso.semConta")).toHaveLength(2);
    expect(within(tabela).getByText("hr.estadoContrato.em_curso")).toBeInTheDocument();
    expect(within(tabela).getByText("hr.columns.estadoContrato")).toBeInTheDocument();
  });

  it("sem hr.pessoas.vinculos.view, o cabeçalho e a célula do contrato desaparecem juntos", () => {
    permissoes = new Set(["hr.pessoas.create"]);
    renderEm("/rh/pessoas");
    const tabela = screen.getByRole("table");
    expect(within(tabela).queryByText("hr.columns.estadoContrato")).not.toBeInTheDocument();
    expect(within(tabela).queryByText("hr.estadoContrato.em_curso")).not.toBeInTheDocument();
  });

  it("os chips são «todas», «com acesso» e «sem conta»: o «convidado» saiu", () => {
    renderEm("/rh/pessoas");
    const chips = within(screen.getByRole("group", { name: "rhForm.lista.filtros" })).getAllByRole("button");
    expect(chips.map((c) => c.textContent?.replace(/\s*\d+$/, ""))).toEqual([
      "rhForm.lista.filtro.todas", "rhForm.lista.filtro.ativo", "rhForm.lista.filtro.semConta",
    ]);
    expect(screen.queryByText(/filtro\.convidado/)).not.toBeInTheDocument();
  });

  it("o chip e a pesquisa filtram a lista, e dão os ids visíveis à ficha (para o anterior/seguinte)", () => {
    renderEm("/rh/pessoas");
    fireEvent.click(screen.getByRole("button", { name: /rhForm\.lista\.filtro\.semConta/ }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(1 + 2);
    expect(screen.getByTestId("ficha")).toHaveAttribute("data-ids", "p2,p3");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "beatriz" } });
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(1 + 1);
  });

  it("organização sem pessoas: diz que está vazia; filtro sem resultados: diz e oferece limpar", () => {
    listaPessoas = criarPessoas({ pessoas: [] });
    const { unmount } = renderEm("/rh/pessoas");
    expect(screen.getByText("rhForm.lista.vazia")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "rhForm.lista.limpar" })).not.toBeInTheDocument();
    unmount();

    listaPessoas = criarPessoas();
    renderEm("/rh/pessoas");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zzz" } });
    expect(screen.getByText("hr.pessoas.emptyFiltered")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "rhForm.lista.limpar" }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(1 + 3);
  });

  it("a carregar mostra o carregamento (não a tabela) e um erro de leitura aparece em texto", () => {
    listaPessoas = criarPessoas({ loading: true, pessoas: [] });
    const { unmount } = renderEm("/rh/pessoas");
    expect(screen.getByText("A carregar...")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    unmount();

    listaPessoas = criarPessoas({ error: "falhou a leitura" });
    renderEm("/rh/pessoas");
    expect(screen.getByRole("alert")).toHaveTextContent("falhou a leitura");
  });
});

describe("Pessoas: os separadores vivem no URL", () => {
  it("por omissão abre «Pessoas»; os separadores são Pessoas, Organograma, Funções e (com a permissão) Contratos", () => {
    renderEm("/rh/pessoas");
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "hr.subtabs.pessoas", "hr.subtabs.organograma", "hr.subtabs.funcoes", "hr.subtabs.contratos",
    ]);
    expect(screen.getByRole("tab", { name: "hr.subtabs.pessoas" })).toHaveAttribute("aria-selected", "true");
  });

  it("?tab=funcoes abre as funções (o redirect de /rh/cargos depende disto)", () => {
    renderEm("/rh/pessoas?tab=funcoes");
    expect(screen.getByText("conteudo-funcoes")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "hr.subtabs.funcoes" })).toHaveAttribute("aria-selected", "true");
  });

  it("?tab=organograma mantém o organograma desta página (sem redirecionar)", () => {
    renderEm("/rh/pessoas?tab=organograma");
    expect(screen.getByText("conteudo-organograma")).toBeInTheDocument();
    expect(screen.getByTestId("url")).toHaveTextContent("/rh/pessoas?tab=organograma");
  });

  it("?tab=contratos mostra os contratos a terminar da organização ativa, e só com hr.pessoas.vinculos.view", () => {
    const { unmount } = renderEm("/rh/pessoas?tab=contratos");
    expect(screen.getByText("conteudo-contratos:org-1")).toBeInTheDocument();
    unmount();
    permissoes = new Set(["hr.pessoas.create"]);
    renderEm("/rh/pessoas?tab=contratos");
    expect(screen.queryByText(/conteudo-contratos/)).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "hr.subtabs.contratos" })).not.toBeInTheDocument();
  });

  it("mudar de separador atualiza o URL", () => {
    renderEm("/rh/pessoas");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "hr.subtabs.funcoes" }), { button: 0 });
    expect(screen.getByTestId("url")).toHaveTextContent("/rh/pessoas?tab=funcoes");
  });

  it("sem hr.pessoas.convite.enviar nem hr.onboarding.approve não há separador «Pipeline de admissões»", () => {
    renderEm("/rh/pessoas");
    expect(screen.queryByRole("tab", { name: "rhAdm.tab" })).not.toBeInTheDocument();
  });

  it("?tab=admissoes sem nenhuma das duas permissões cai em «Pessoas» (a base recusaria a lista)", () => {
    renderEm("/rh/pessoas?tab=admissoes");
    expect(screen.queryByText("conteudo-pipeline")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "hr.subtabs.pessoas" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("Pessoas: o separador «Pipeline de admissões»", () => {
  it.each([["hr.pessoas.convite.enviar"], ["hr.onboarding.approve"]])(
    "com %s aparece, logo a seguir a «Pessoas»",
    (permissao) => {
      permissoes = new Set([permissao, "hr.pessoas.vinculos.view"]);
      renderEm("/rh/pessoas");
      expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
        "hr.subtabs.pessoas", "rhAdm.tab", "hr.subtabs.organograma", "hr.subtabs.funcoes", "hr.subtabs.contratos",
      ]);
    },
  );

  it("?tab=admissoes mostra o pipeline, e abrir uma pessoa dele abre a ficha por cima", () => {
    permissoes = new Set(["hr.onboarding.approve"]);
    renderEm("/rh/pessoas?tab=admissoes");
    expect(screen.getByText("conteudo-pipeline")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "rhAdm.tab" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("ficha")).toHaveAttribute("data-aberta", "false");
    fireEvent.click(screen.getByRole("button", { name: "pipeline-abrir-p2" }));
    expect(screen.getByTestId("ficha")).toHaveAttribute("data-aberta", "true");
    expect(screen.getByTestId("ficha")).toHaveAttribute("data-id", "p2");
    expect(screen.getByTestId("url")).toHaveTextContent("/rh/pessoas/p2?tab=admissoes");
  });

  it("mudar para o separador atualiza o URL e o pipeline so existe nesse separador", () => {
    permissoes = new Set(["hr.pessoas.convite.enviar"]);
    renderEm("/rh/pessoas");
    expect(screen.queryByText("conteudo-pipeline")).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "rhAdm.tab" }), { button: 0 });
    expect(screen.getByTestId("url")).toHaveTextContent("/rh/pessoas?tab=admissoes");
    expect(screen.getByText("conteudo-pipeline")).toBeInTheDocument();
  });

  it("continua a haver um so título de nível 1 (o do ecrã) com o separador aberto", () => {
    permissoes = new Set(["hr.onboarding.approve"]);
    renderEm("/rh/pessoas?tab=admissoes");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});

describe("Pessoas: a ficha e «Nova pessoa»", () => {
  it("um clique numa linha abre a ficha dessa pessoa", () => {
    renderEm("/rh/pessoas");
    expect(screen.getByTestId("ficha")).toHaveAttribute("data-aberta", "false");
    fireEvent.click(within(screen.getByRole("table")).getByText("Rui Amaral"));
    expect(screen.getByTestId("ficha")).toHaveAttribute("data-aberta", "true");
    expect(screen.getByTestId("ficha")).toHaveAttribute("data-id", "p2");
  });

  it("a ficha recebe as pessoas da lista (não recarrega a organização inteira a cada pessoa aberta)", () => {
    renderEm("/rh/pessoas");
    expect(screen.getByTestId("ficha")).toHaveAttribute("data-colegas", "p1,p2,p3");
  });

  it("a ligação direta /rh/pessoas/:id abre a lista com a ficha aberta", () => {
    renderEm("/rh/pessoas/p3", () => <PessoaDetail />);
    expect(screen.getByTestId("ficha")).toHaveAttribute("data-aberta", "true");
    expect(screen.getByTestId("ficha")).toHaveAttribute("data-id", "p3");
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("passar a outra pessoa pela ficha troca o id, e fechar fecha o painel", () => {
    renderEm("/rh/pessoas/p1", () => <PessoaDetail />);
    fireEvent.click(screen.getByRole("button", { name: "ir-p3" }));
    expect(screen.getByTestId("ficha")).toHaveAttribute("data-id", "p3");
    fireEvent.click(screen.getByRole("button", { name: "fechar-ficha" }));
    expect(screen.getByTestId("ficha")).toHaveAttribute("data-aberta", "false");
  });

  it("«Nova pessoa» só existe com hr.pessoas.create, abre o painel e entrega o criarPessoa REAL", () => {
    const { unmount } = renderEm("/rh/pessoas");
    expect(screen.queryByTestId("nova")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "hr.pessoas.new" }));
    const nova = screen.getByTestId("nova");
    expect(nova).toHaveAttribute("data-onCriar", "true");
    expect(nova).toHaveAttribute("data-colegas", "p1,p2,p3");
    unmount();

    permissoes = new Set();
    renderEm("/rh/pessoas");
    expect(screen.queryByRole("button", { name: "hr.pessoas.new" })).not.toBeInTheDocument();
  });

  it("depois de criar, abre a ficha da pessoa nova", () => {
    renderEm("/rh/pessoas");
    fireEvent.click(screen.getByRole("button", { name: "hr.pessoas.new" }));
    fireEvent.click(screen.getByRole("button", { name: "criada-p2" }));
    expect(screen.getByTestId("ficha")).toHaveAttribute("data-id", "p2");
    expect(screen.getByTestId("ficha")).toHaveAttribute("data-aberta", "true");
  });

  it("os botões de configuração só aparecem com a permissão e levam às páginas de sempre", () => {
    renderEm("/rh/pessoas");
    expect(screen.queryByRole("button", { name: "sidebar.hrAdmissaoConfig" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "hr.fimContrato.config.botao" })).not.toBeInTheDocument();
  });

  it("com as permissões de gerir, os dois botões navegam para /rh/admissao/configuracao e /rh/contratos/configuracao", () => {
    permissoes = new Set(["hr.pessoas.create", "hr.admissao.obrigatorios.gerir", "hr.contratos.regras.gerir"]);
    const { unmount } = renderEm("/rh/pessoas");
    fireEvent.click(screen.getByRole("button", { name: "sidebar.hrAdmissaoConfig" }));
    expect(screen.getByText("pagina-admissao-config")).toBeInTheDocument();
    unmount();
    renderEm("/rh/pessoas");
    fireEvent.click(screen.getByRole("button", { name: "hr.fimContrato.config.botao" }));
    expect(screen.getByText("pagina-regras-fim")).toBeInTheDocument();
  });
});

describe("Pessoas: sem organização e a carregar", () => {
  it("sem organização ativa mostra o estado de sem organização", () => {
    empresa = { activeCompany: null, isLoading: false };
    renderEm("/rh/pessoas");
    expect(screen.getByText("sem-organizacao")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("com a organização ou as permissões a carregar mostra o carregamento", () => {
    empresa = { activeCompany: null, isLoading: true };
    const { unmount } = renderEm("/rh/pessoas");
    expect(screen.getByText("A carregar...")).toBeInTheDocument();
    expect(screen.queryByText("sem-organizacao")).not.toBeInTheDocument();
    unmount();
    empresa = { activeCompany: { id: "org-1", name: "Nike" }, isLoading: false };
    permissoesALoad = true;
    renderEm("/rh/pessoas");
    expect(screen.getByText("A carregar...")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("PessoaDetail: as ligações antigas com ?tab= continuam a funcionar", () => {
  it("/rh/pessoas/:id?tab=contratos abre a ficha logo no separador de contratos (e a lista fica em «Pessoas»)", () => {
    renderEm("/rh/pessoas/p1?tab=contratos", () => <PessoaDetail />);
    expect(screen.getByTestId("ficha")).toHaveAttribute("data-aba", "contratos");
    expect(screen.getByRole("tab", { name: "hr.subtabs.pessoas" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("conteudo-contratos:org-1")).not.toBeInTheDocument();
    // O ?tab= já foi gasto: ao fechar a ficha não fica a pedir o separador de contratos da lista. A aba passou para ?aba=.
    expect(screen.getByTestId("url")).toHaveTextContent(/^\/rh\/pessoas\/p1\?aba=contratos$/);
  });

  it("um ?tab= que não é aba da ficha (ex.: funcoes) não a muda: abre a Visão geral", () => {
    renderEm("/rh/pessoas/p1?tab=funcoes", () => <PessoaDetail />);
    expect(screen.getByTestId("ficha")).toHaveAttribute("data-aba", "");
  });
});

describe("Pessoas: um ?tab= inválido ou sem permissão cai em «Pessoas»", () => {
  it("?tab= desconhecido mostra a lista e o separador Pessoas selecionado", () => {
    renderEm("/rh/pessoas?tab=nao-existe");
    expect(screen.getByRole("tab", { name: "hr.subtabs.pessoas" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("table")).toBeInTheDocument();
  });

  it("?tab=contratos sem hr.pessoas.vinculos.view cai em «Pessoas» (não fica um ecrã sem separador nem conteúdo)", () => {
    permissoes = new Set(["hr.pessoas.create"]);
    renderEm("/rh/pessoas?tab=contratos");
    expect(screen.getByRole("tab", { name: "hr.subtabs.pessoas" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("table")).toBeInTheDocument();
  });
});

describe("Pessoas: a organização ativa mudou", () => {
  const arvore = () => (
    <MemoryRouter initialEntries={["/rh/pessoas"]}>
      <Routes><Route path="/rh/pessoas" element={<Pessoas />} /><Route path="/rh/pessoas/:id" element={<Pessoas />} /></Routes>
      <Sonda />
    </MemoryRouter>
  );

  it("fecha a ficha e o painel «Nova pessoa» (uma ficha de outra organização não fica aberta)", () => {
    const { rerender } = render(arvore());
    fireEvent.click(within(screen.getByRole("table")).getByText("Rui Amaral"));
    fireEvent.click(screen.getByRole("button", { name: "hr.pessoas.new" }));
    expect(screen.getByTestId("ficha")).toHaveAttribute("data-aberta", "true");
    expect(screen.getByTestId("nova")).toBeInTheDocument();

    empresa = { activeCompany: { id: "org-2", name: "Outra" }, isLoading: false };
    rerender(arvore());
    expect(screen.getByTestId("ficha")).toHaveAttribute("data-aberta", "false");
    expect(screen.queryByTestId("nova")).not.toBeInTheDocument();
    expect(screen.getByTestId("url")).toHaveTextContent(/^\/rh\/pessoas$/);
  });

  it("sem mudança de organização, nada se fecha", () => {
    const { rerender } = render(arvore());
    fireEvent.click(within(screen.getByRole("table")).getByText("Rui Amaral"));
    rerender(arvore());
    expect(screen.getByTestId("ficha")).toHaveAttribute("data-aberta", "true");
  });
});

describe("Pessoas: a aba da ficha vive no URL, pelo router", () => {
  it("abrir e fechar a ficha atualiza o endereço pelo router (sem history.replaceState)", () => {
    const direto = vi.spyOn(window.history, "replaceState");
    renderEm("/rh/pessoas");
    fireEvent.click(within(screen.getByRole("table")).getByText("Rui Amaral"));
    expect(screen.getByTestId("url")).toHaveTextContent(/^\/rh\/pessoas\/p2$/);
    fireEvent.click(screen.getByRole("button", { name: "fechar-ficha" }));
    expect(screen.getByTestId("url")).toHaveTextContent(/^\/rh\/pessoas$/);
    expect(direto).not.toHaveBeenCalled();
    direto.mockRestore();
  });

  it("mudar de aba na ficha escreve ?aba= no URL, e fechar a ficha tira-o", () => {
    renderEm("/rh/pessoas");
    fireEvent.click(within(screen.getByRole("table")).getByText("Rui Amaral"));
    fireEvent.click(screen.getByRole("button", { name: "aba-laborais" }));
    expect(screen.getByTestId("url")).toHaveTextContent(/^\/rh\/pessoas\/p2\?aba=laborais$/);
    expect(screen.getByTestId("ficha")).toHaveAttribute("data-aba", "laborais");
    fireEvent.click(screen.getByRole("button", { name: "fechar-ficha" }));
    expect(screen.getByTestId("url")).toHaveTextContent(/^\/rh\/pessoas$/);
  });

  it("recarregar (abrir o endereço com ?aba=) mantém a aba", () => {
    renderEm("/rh/pessoas/p1?aba=documentos", () => <PessoaDetail />);
    expect(screen.getByTestId("ficha")).toHaveAttribute("data-aba", "documentos");
    expect(screen.getByTestId("url")).toHaveTextContent(/^\/rh\/pessoas\/p1\?aba=documentos$/);
  });

  it("um ?aba= que não é aba da ficha é ignorado", () => {
    renderEm("/rh/pessoas/p1?aba=xyz", () => <PessoaDetail />);
    expect(screen.getByTestId("ficha")).toHaveAttribute("data-aba", "");
  });

  it("a ligação antiga ?tab=laborais continua a abrir a ficha nessa aba (e passa a ?aba=)", () => {
    renderEm("/rh/pessoas/p1?tab=laborais", () => <PessoaDetail />);
    expect(screen.getByTestId("ficha")).toHaveAttribute("data-aba", "laborais");
    expect(screen.getByTestId("url")).toHaveTextContent(/^\/rh\/pessoas\/p1\?aba=laborais$/);
  });

  it("depois de gasto o ?tab= antigo, escolher o separador «Contratos» da lista não muda a aba da ficha", () => {
    renderEm("/rh/pessoas/p1", () => <PessoaDetail />);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "hr.subtabs.contratos" }), { button: 0 });
    expect(screen.getByText("conteudo-contratos:org-1")).toBeInTheDocument();
    expect(screen.getByTestId("ficha")).toHaveAttribute("data-aba", "");
    expect(screen.getByTestId("url")).toHaveTextContent(/^\/rh\/pessoas\/p1\?tab=contratos$/);
  });

  it("mudar de separador com a ficha aberta não perde a ficha do endereço", () => {
    renderEm("/rh/pessoas");
    fireEvent.click(within(screen.getByRole("table")).getByText("Rui Amaral"));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "hr.subtabs.funcoes" }), { button: 0 });
    expect(screen.getByTestId("url")).toHaveTextContent(/^\/rh\/pessoas\/p2\?tab=funcoes$/);
  });
});

/**
 * `PessoaFormDialog`, o que toca na admissao. Nao ha modos: o formulario mostra
 * sempre tudo e o convite e uma ACCAO (interruptor "enviar convite"):
 *
 *  - com convite, sem poder abri-lo (sem a permissao de enviar) NAO segue em
 *    silencio: avisa que o convite nao foi aberto;
 *  - com a permissao, abre o envio e so segue para a ficha quando ele fecha;
 *  - com convite so se exige nome, apelido (e cargo) e o e-mail pessoal;
 *  - sem convite (o RH preenche) os obrigatorios da configuracao (posicao
 *    `convite`) bloqueiam; `ficha` e `opcional` nunca; o que fica por preencher
 *    aparece como pendencia na ficha;
 *  - sem a permissao de enviar convites o interruptor fica desactivado, com a
 *    explicacao, e o formulario segue o regime sem convite;
 *  - o botao Criar desactivado diz porque (frase visivel, ligada por aria-describedby);
 *  - o resumo de problemas e anunciado (role=alert) e o atalho de cada problema
 *    abre o bloco recolhido e foca o campo quando ele ja existe;
 *  - sem a permissao dos dados bancarios, a seccao do banco nao se exige nem
 *    bloqueia, e fica como pendencia;
 *  - sem convite e sem a configuracao da admissao: espera enquanto carrega e,
 *    se a leitura falhou, diz que a configuracao nao chegou (nao trata o `null`
 *    como "sem configuracao");
 *  - o cargo e obrigatorio (fluxo 2): sem ele nao se cria a ficha e o resumo
 *    de problemas di-lo; o payload leva cargo_id e o nome do cargo escolhido.
 *
 * As seccoes do assistente sao simuladas com campos minimos: aqui testa-se o
 * assistente, nao os campos.
 */
import { useEffect, useState, type ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ language: "pt", t: (chave: string) => chave }),
}));

vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: "org-teste", name: "Org de teste" } }),
}));

let permissoes = new Set<string>();
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission: (p: string) => permissoes.has(p) }),
}));

vi.mock("@/hooks/useLocaisTrabalho", () => ({
  useLocaisTrabalho: () => ({ locais: [], loading: false, semPermissao: false, criarLocal: vi.fn() }),
}));
vi.mock("@/hooks/useCargos", () => ({
  useCargos: () => ({
    cargos: [
      { id: "c1", nome: "Operador", activo: true },
      { id: "c2", nome: "Antigo", activo: false },
    ],
    periodos: [],
    isLoading: false,
  }),
}));
vi.mock("@/hooks/usePapeisDaOrganizacao", () => ({
  usePapeisDaOrganizacao: () => ({ papeis: [], loading: false }),
}));
vi.mock("@/hooks/useContasLigaveis", () => ({
  useContasLigaveis: () => ({ contas: [], loading: false }),
}));

const verificarDuplicados = vi.fn();
const limparDuplicados = vi.fn();
let duplicados: { travoes: unknown[]; sinais: unknown[] } = { travoes: [], sinais: [] };
vi.mock("@/hooks/usePessoaDuplicados", () => ({
  usePessoaDuplicados: () => ({
    travoes: duplicados.travoes,
    sinais: duplicados.sinais,
    semAcesso: false,
    demasiadasTentativas: false,
    verificar: verificarDuplicados,
    limpar: limparDuplicados,
  }),
}));

let configuracao = { campos: [] as unknown[] | null, carregando: false, erro: false, semAcesso: false };
vi.mock("@/hooks/useAdmissaoPosicoesCampos", () => ({
  useAdmissaoPosicoesCampos: () => configuracao,
}));

vi.mock("@/lib/toast", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

// O ScrollArea do Radix precisa de ResizeObserver, que o jsdom nao tem.
vi.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/hr/EnviarConviteDialog", () => ({
  EnviarConviteDialog: ({
    open,
    onOpenChange,
  }: {
    open: boolean;
    onOpenChange: (aberto: boolean) => void;
  }) =>
    open ? (
      <button type="button" onClick={() => onOpenChange(false)}>
        fechar-convite
      </button>
    ) : null,
}));

vi.mock("@/components/hr/form/SeccaoInformacoesGerais", () => ({
  SeccaoInformacoesGerais: ({
    valor,
    onPatch,
  }: {
    valor: { primeiro_nome: string; apelido: string };
    onPatch: (patch: Record<string, string>) => void;
  }) => (
    <div>
      <input
        aria-label="primeiro"
        value={valor.primeiro_nome}
        onChange={(e) => onPatch({ primeiro_nome: e.target.value })}
      />
      <input
        aria-label="apelido"
        value={valor.apelido}
        onChange={(e) => onPatch({ apelido: e.target.value })}
      />
    </div>
  ),
}));
/** O campo que o mock da seccao deve mostrar desactivado (simula um campo sem permissao). */
let idDesactivado = "";
/** Simula um bloco recolhido: o campo a focar so aparece DEPOIS do pedido (render tardio). */
function CampoDeBlocoRecolhido({ campoId }: { campoId: string }) {
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setAberto(true), 30);
    return () => clearTimeout(id);
  }, [campoId]);
  return aberto ? <input id={campoId} aria-label={campoId} disabled={campoId === idDesactivado} /> : null;
}
vi.mock("@/components/hr/form/SeccaoDetalhesPessoais", () => ({
  SeccaoDetalhesPessoais: ({
    valor,
    onPatch,
    obrigatorios,
    podeEditarBancarios,
    podeEditarFardamento,
    podeEditarIdentificacao,
    focoPedido,
  }: {
    valor: { email_pessoal: string };
    onPatch: (patch: Record<string, string>) => void;
    obrigatorios?: ReadonlySet<string>;
    podeEditarBancarios?: boolean;
    podeEditarFardamento?: boolean;
    podeEditarIdentificacao?: boolean;
    focoPedido?: { campoId: string; n: number } | null;
  }) => (
    <div>
      <span data-testid="pode-fardamento">{String(podeEditarFardamento)}</span>
      <span data-testid="pode-identificacao">{String(podeEditarIdentificacao)}</span>
      <span data-testid="foco-pedido">{focoPedido ? `${focoPedido.campoId}#${focoPedido.n}` : ""}</span>
      {focoPedido && <CampoDeBlocoRecolhido key={focoPedido.n} campoId={focoPedido.campoId} />}
      <input
        aria-label="email-pessoal"
        value={valor.email_pessoal}
        onChange={(e) => onPatch({ email_pessoal: e.target.value })}
      />
      <span data-testid="obrigatorios">{[...(obrigatorios ?? [])].sort().join(",")}</span>
      <span data-testid="pode-bancarios">{String(podeEditarBancarios)}</span>
    </div>
  ),
}));
vi.mock("@/components/hr/form/SeccaoInformacoesLaborais", () => ({
  SeccaoInformacoesLaborais: ({
    onPatch,
    cargos,
  }: {
    onPatch: (patch: Record<string, string>) => void;
    cargos: Array<{ id: string; nome: string }>;
  }) => (
    <div>
      <span data-testid="cargos-oferecidos">{cargos.map((c) => c.nome).join(",")}</span>
      <button type="button" onClick={() => onPatch({ cargo_id: "c1" })}>
        escolher-cargo
      </button>
    </div>
  ),
}));
vi.mock("@/components/hr/form/SeccaoContrato", () => ({ SeccaoContrato: () => null }));
vi.mock("@/components/hr/form/SeccaoConfiguracoesGerais", () => ({ SeccaoConfiguracoesGerais: () => null }));

import { toast } from "@/lib/toast";
import { PessoaFormDialog } from "@/components/hr/PessoaFormDialog";

function montar() {
  const onCriar = vi.fn().mockResolvedValue({ id: "p-nova", falhas: [] });
  const onCriada = vi.fn();
  const utilizador = render(
    <MemoryRouter>
      <PessoaFormDialog
        open
        onOpenChange={vi.fn()}
        colegas={[]}
        onCriar={onCriar}
        onCriada={onCriada}
      />
    </MemoryRouter>,
  );
  return { onCriar, onCriada, ...utilizador };
}

function escreverNomes() {
  fireEvent.change(screen.getByLabelText("primeiro"), { target: { value: "Ana" } });
  fireEvent.change(screen.getByLabelText("apelido"), { target: { value: "Silva" } });
}

function escreverEmailPessoal() {
  fireEvent.click(screen.getByRole("tab", { name: /hr\.form\.seccoes\.pessoais/ }));
  fireEvent.change(screen.getByLabelText("email-pessoal"), { target: { value: "ana@exemplo.pt" } });
}

function escolherCargo() {
  fireEvent.click(screen.getByRole("tab", { name: /hr\.form\.seccoes\.laborais/ }));
  fireEvent.click(screen.getByRole("button", { name: "escolher-cargo" }));
}

const botaoCriar = () =>
  screen.getByRole("button", { name: /^hr\.form\.(criarFicha|criarEEnviarConvite)$/ });

/** O convite e uma accao: liga-se o interruptor, e o botao passa a "Criar e enviar convite". */
function ligarConvite() {
  fireEvent.click(screen.getByRole("switch", { name: "hr.form.enviarConvite" }));
}

function campoDaConfiguracao(codigo: string, posicao: "convite" | "ficha" | "opcional" = "convite") {
  return { codigo, origem: "pessoa", condicional: false, posicao, configuravel: true };
}

function irParaPasso(passo: string) {
  fireEvent.click(screen.getByRole("tab", { name: new RegExp(`hr\\.form\\.seccoes\\.${passo}`) }));
}

describe("PessoaFormDialog: admissao", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissoes = new Set();
    duplicados = { travoes: [], sinais: [] };
    idDesactivado = "";
    configuracao = { campos: [], carregando: false, erro: false, semAcesso: false };
  });

  describe("com convite", () => {
    it("sem permissao para enviar convites o interruptor fica desactivado, com a explicacao, e o formulario segue sem convite", async () => {
      configuracao = {
        campos: [campoDaConfiguracao("telefone_pessoal")],
        carregando: false,
        erro: false,
        semAcesso: false,
      };
      const { onCriar } = montar();
      const interruptor = screen.getByRole("switch", { name: "hr.form.enviarConvite" });
      expect(interruptor).toBeDisabled();
      expect(screen.getByText("hr.form.conviteSemPermissao")).toBeInTheDocument();

      fireEvent.click(interruptor);
      expect(interruptor).not.toBeChecked();
      expect(botaoCriar()).toHaveTextContent("hr.form.criarFicha");

      // Regime sem convite: o obrigatorio da configuracao continua a bloquear.
      escreverNomes();
      escolherCargo();
      irParaPasso("pessoais");
      expect(screen.getByTestId("obrigatorios")).toHaveTextContent("telefone_pessoal");
      fireEvent.click(botaoCriar());
      expect(onCriar).not.toHaveBeenCalled();
    });

    it("com permissao para enviar convites o interruptor esta activo e sem explicacao", () => {
      permissoes = new Set(["hr.pessoas.convite.enviar"]);
      montar();
      expect(screen.getByRole("switch", { name: "hr.form.enviarConvite" })).toBeEnabled();
      expect(screen.queryByText("hr.form.conviteSemPermissao")).not.toBeInTheDocument();
    });

    it("com convite o e-mail pessoal passa a obrigatorio (asterisco) e deixa de o ser sem convite", () => {
      permissoes = new Set(["hr.pessoas.convite.enviar"]);
      montar();
      irParaPasso("pessoais");
      expect(screen.getByTestId("obrigatorios")).toBeEmptyDOMElement();
      ligarConvite();
      expect(screen.getByTestId("obrigatorios")).toHaveTextContent("email_pessoal");
      ligarConvite();
      expect(screen.getByTestId("obrigatorios")).toBeEmptyDOMElement();
    });

    it("com permissao abre o envio do convite, sem aviso, e so segue para a ficha quando ele fecha", async () => {
      permissoes = new Set(["hr.pessoas.convite.enviar"]);
      const { onCriada } = montar();
      ligarConvite();
      escreverNomes();
      escreverEmailPessoal();
      escolherCargo();

      fireEvent.click(botaoCriar());

      // `hidden`: o teste mantem o assistente aberto (`open` fixo), por isso o Radix
      // marca o resto da arvore como aria-hidden; o botao simulado la esta.
      const fechar = await screen.findByRole("button", { name: "fechar-convite", hidden: true });
      expect(toast.warning).not.toHaveBeenCalled();
      expect(onCriada).not.toHaveBeenCalled();

      fireEvent.click(fechar);
      expect(onCriada).toHaveBeenCalledWith("p-nova");
    });
  });

  describe("o cargo e obrigatorio", () => {
    it("sem cargo, Criar ficha nao grava: mostra o resumo de problemas", async () => {
      const { onCriar } = montar();
      escreverNomes();
      escreverEmailPessoal();

      fireEvent.click(botaoCriar());

      expect(onCriar).not.toHaveBeenCalled();
      // O resumo aponta o cargo (o texto do erro vive no proprio campo).
      expect(await screen.findByText(/hr.form.seccoes.laborais → hr.columns.cargo/)).toBeInTheDocument();
    });

    it("so oferece cargos activos ao assistente", () => {
      montar();
      fireEvent.click(screen.getByRole("tab", { name: /hr\.form\.seccoes\.laborais/ }));
      expect(screen.getByTestId("cargos-oferecidos")).toHaveTextContent("Operador");
      expect(screen.getByTestId("cargos-oferecidos")).not.toHaveTextContent("Antigo");
    });

    it("com cargo, o payload leva cargo_id e o nome do cargo como texto", async () => {
      const { onCriar } = montar();
      escreverNomes();
      escreverEmailPessoal();
      escolherCargo();

      fireEvent.click(botaoCriar());

      await waitFor(() => expect(onCriar).toHaveBeenCalledTimes(1));
      expect(onCriar.mock.calls[0][0].nucleo).toMatchObject({ cargo_id: "c1", cargo: "Operador" });
      expect(JSON.stringify(onCriar.mock.calls[0][0])).not.toContain("valor_base");
    });
  });

  describe("sem convite (o RH preenche) e a configuracao da admissao", () => {
    it("enquanto a configuracao carrega, Criar ficha espera", () => {
      configuracao = { campos: null, carregando: true, erro: false, semAcesso: false };
      montar();
      escreverNomes();

      expect(botaoCriar()).toBeDisabled();
    });

    it("se a leitura falhou, diz que a configuracao nao chegou (nao a trata como 'sem configuracao')", () => {
      configuracao = { campos: null, carregando: false, erro: true, semAcesso: false };
      montar();
      escreverNomes();

      expect(screen.getByRole("alert")).toHaveTextContent("hr.form.configuracaoNaoCarregada");
    });

    it("sem configuracao, sem erro, sem carga e sem recusa de acesso (a leitura nunca correu), avisa na mesma", () => {
      configuracao = { campos: null, carregando: false, erro: false, semAcesso: false };
      montar();
      escreverNomes();

      expect(screen.getByRole("alert")).toHaveTextContent("hr.form.configuracaoNaoCarregada");
    });

    it("se a base recusou a leitura por permissao, nao se avisa de uma falha que nao ha", () => {
      configuracao = { campos: null, carregando: false, erro: false, semAcesso: true };
      montar();
      escreverNomes();

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("com a configuracao lida, nao ha aviso e Criar ficha esta activo", () => {
      montar();
      escreverNomes();

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(botaoCriar()).toBeEnabled();
    });

    it("com convite, a configuracao em falta nao assusta: o convite nao depende dela aqui", () => {
      permissoes = new Set(["hr.pessoas.convite.enviar"]);
      configuracao = { campos: null, carregando: false, erro: true, semAcesso: false };
      montar();
      ligarConvite();
      escreverNomes();

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
  describe("o que bloqueia, conforme a accao", () => {
    function configurar(...campos: Array<ReturnType<typeof campoDaConfiguracao>>) {
      configuracao = { campos, carregando: false, erro: false, semAcesso: false };
    }

    it("sem convite, um obrigatorio da configuracao em falta recusa a criacao e o resumo di-lo", async () => {
      configurar(campoDaConfiguracao("telefone_pessoal"));
      const { onCriar } = montar();
      escreverNomes();
      escolherCargo();

      fireEvent.click(botaoCriar());

      expect(onCriar).not.toHaveBeenCalled();
      expect(
        await screen.findByText(/hr.form.seccoes.pessoais → hr.campos.telefonePessoal/),
      ).toBeInTheDocument();
    });

    it("sem convite, os asteriscos seguem a configuracao; com convite desaparecem", () => {
      permissoes = new Set(["hr.pessoas.convite.enviar"]);
      configurar(
        campoDaConfiguracao("telefone_pessoal"),
        campoDaConfiguracao("genero", "ficha"),
        campoDaConfiguracao("nif", "opcional"),
      );
      montar();
      irParaPasso("pessoais");
      expect(screen.getByTestId("obrigatorios")).toHaveTextContent("telefone_pessoal");
      expect(screen.getByTestId("obrigatorios")).not.toHaveTextContent("genero");

      ligarConvite();
      // So o e-mail pessoal (o destino do convite): os da configuracao ficam para a pessoa.
      expect(screen.getByTestId("obrigatorios")).toHaveTextContent(/^email_pessoal$/);
    });

    it("sem convite, ficha e opcional nunca bloqueiam", async () => {
      configurar(campoDaConfiguracao("telefone_pessoal", "ficha"), campoDaConfiguracao("genero", "opcional"));
      const { onCriar } = montar();
      escreverNomes();
      escolherCargo();

      fireEvent.click(botaoCriar());

      await waitFor(() => expect(onCriar).toHaveBeenCalledTimes(1));
    });

    it("com convite so se exige o e-mail pessoal: os obrigatorios da configuracao ficam para a pessoa", async () => {
      configurar(campoDaConfiguracao("telefone_pessoal"), campoDaConfiguracao("nif"));
      permissoes = new Set(["hr.pessoas.convite.enviar"]);
      const { onCriar } = montar();
      ligarConvite();
      escreverNomes();
      escolherCargo();

      // Sem e-mail pessoal: recusa.
      fireEvent.click(botaoCriar());
      expect(onCriar).not.toHaveBeenCalled();
      expect(
        await screen.findByText(/hr.form.seccoes.pessoais → hr.campos.emailPessoal/),
      ).toBeInTheDocument();

      // Com e-mail pessoal: cria, mesmo com o telefone e o NIF por preencher.
      escreverEmailPessoal();
      fireEvent.click(botaoCriar());
      await waitFor(() => expect(onCriar).toHaveBeenCalledTimes(1));
    });

    it("o botao diz o que vai acontecer: Criar ficha, ou Criar e enviar convite", () => {
      permissoes = new Set(["hr.pessoas.convite.enviar"]);
      montar();
      expect(botaoCriar()).toHaveTextContent("hr.form.criarFicha");
      ligarConvite();
      expect(botaoCriar()).toHaveTextContent("hr.form.criarEEnviarConvite");
    });
  });

  describe("pendencias da ficha", () => {
    it("o que a configuracao pede em posicao ficha e esta vazio fica listado como pendencia", () => {
      configuracao = {
        campos: [campoDaConfiguracao("data_nascimento", "ficha"), campoDaConfiguracao("genero", "opcional")],
        carregando: false,
        erro: false,
        semAcesso: false,
      };
      montar();
      escreverNomes();
      irParaPasso("acesso");

      const nota = screen.getByRole("note");
      expect(nota).toHaveTextContent("hr.form.camposFicamPendencia");
      // O duplo de traducao devolve a chave, e o rotulo cai no generico: o que
      // conta aqui e QUANTOS campos se listam (so o da ficha, nao o opcional).
      expect(within(nota).getAllByRole("listitem")).toHaveLength(1);
    });

    it("sem nada por preencher, nao ha aviso", () => {
      montar();
      irParaPasso("acesso");
      expect(screen.queryByRole("note")).not.toBeInTheDocument();
    });
  });

  describe("sem permissao para editar dados bancarios", () => {
    it("o ecra recebe a seccao do banco desactivada e a permissao nao bloqueia a criacao", async () => {
      configuracao = {
        campos: [campoDaConfiguracao("conta_numero"), campoDaConfiguracao("conta_banco", "ficha")],
        carregando: false,
        erro: false,
        semAcesso: false,
      };
      const { onCriar } = montar();
      escreverNomes();
      escolherCargo();
      irParaPasso("pessoais");
      expect(screen.getByTestId("pode-bancarios")).toHaveTextContent("false");
      expect(screen.getByTestId("obrigatorios")).not.toHaveTextContent("conta_numero");

      fireEvent.click(botaoCriar());
      await waitFor(() => expect(onCriar).toHaveBeenCalledTimes(1));
      irParaPasso("acesso");
    });

    it("com a permissao, o obrigatorio do banco volta a bloquear", async () => {
      permissoes = new Set(["hr.pessoas.bancarios.edit"]);
      configuracao = {
        campos: [campoDaConfiguracao("conta_numero")],
        carregando: false,
        erro: false,
        semAcesso: false,
      };
      const { onCriar } = montar();
      escreverNomes();
      escolherCargo();
      irParaPasso("pessoais");
      expect(screen.getByTestId("pode-bancarios")).toHaveTextContent("true");
      expect(screen.getByTestId("obrigatorios")).toHaveTextContent("conta_numero");

      fireEvent.click(botaoCriar());
      expect(onCriar).not.toHaveBeenCalled();
      expect(
        await screen.findByText(/hr.form.seccoes.pessoais → hr.campos.numeroConta/),
      ).toBeInTheDocument();
    });

    it("a pendencia do banco aparece no aviso", () => {
      configuracao = {
        campos: [campoDaConfiguracao("conta_numero")],
        carregando: false,
        erro: false,
        semAcesso: false,
      };
      montar();
      irParaPasso("acesso");
      expect(within(screen.getByRole("note")).getAllByRole("listitem")).toHaveLength(1);
    });
  });
});

describe("PessoaFormDialog: o botao Criar desactivado diz porque", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissoes = new Set();
    duplicados = { travoes: [], sinais: [] };
    configuracao = { campos: [], carregando: false, erro: false, semAcesso: false };
  });

  /** A frase visivel que o botao aponta por `aria-describedby`. */
  function motivoDoBotao(): HTMLElement | null {
    const id = botaoCriar().getAttribute("aria-describedby");
    return id ? document.getElementById(id) : null;
  }

  it("sem nome e apelido: frase visivel, ligada ao botao", () => {
    montar();
    expect(botaoCriar()).toBeDisabled();
    expect(screen.getByText("hr.form.criarMotivo.nomes")).toBeVisible();
    expect(motivoDoBotao()).toHaveTextContent("hr.form.criarMotivo.nomes");
  });

  it("com os nomes escritos, a frase desaparece e o botao deixa de apontar para ela", () => {
    montar();
    escreverNomes();
    expect(botaoCriar()).toBeEnabled();
    expect(screen.queryByText("hr.form.criarMotivo.nomes")).not.toBeInTheDocument();
    expect(botaoCriar()).not.toHaveAttribute("aria-describedby");
  });

  it("a configuracao a carregar: o botao espera e di-lo", () => {
    configuracao = { campos: null, carregando: true, erro: false, semAcesso: false };
    montar();
    escreverNomes();
    expect(botaoCriar()).toBeDisabled();
    expect(motivoDoBotao()).toHaveTextContent("hr.form.criarMotivo.configuracao");
  });

  it("um duplicado que trava di-lo", () => {
    duplicados = {
      travoes: [{ pessoaId: "p1", campoCoincidente: "nif", estado: "activa" }],
      sinais: [],
    };
    montar();
    escreverNomes();
    expect(botaoCriar()).toBeDisabled();
    expect(motivoDoBotao()).toHaveTextContent("hr.form.criarMotivo.duplicado");
  });

  it("um sinal de duplicado por confirmar di-lo, e confirmar activa o botao", () => {
    duplicados = {
      travoes: [],
      sinais: [{ pessoaId: "p1", campoCoincidente: "nome_data_nascimento", estado: "activa" }],
    };
    montar();
    escreverNomes();
    expect(botaoCriar()).toBeDisabled();
    expect(motivoDoBotao()).toHaveTextContent("hr.form.criarMotivo.sinal");

    fireEvent.click(screen.getByRole("checkbox"));
    expect(botaoCriar()).toBeEnabled();
    expect(screen.queryByText("hr.form.criarMotivo.sinal")).not.toBeInTheDocument();
  });
});

describe("PessoaFormDialog: configuracao sem acesso", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissoes = new Set();
    configuracao = { campos: null, carregando: false, erro: false, semAcesso: true };
  });

  it("sem convite aparece o aviso visivel de que os obrigatorios nao se aplicam (e nao e um alerta de falha)", () => {
    montar();
    escreverNomes();
    expect(screen.getByText("hr.form.configuracaoSemAcesso")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("com convite o aviso nao aparece (so se exige o e-mail pessoal, com ou sem configuracao)", () => {
    permissoes = new Set(["hr.pessoas.convite.enviar"]);
    montar();
    ligarConvite();
    expect(screen.queryByText("hr.form.configuracaoSemAcesso")).not.toBeInTheDocument();
  });

  it("com a configuracao lida o aviso nao aparece", () => {
    configuracao = { campos: [], carregando: false, erro: false, semAcesso: false };
    montar();
    expect(screen.queryByText("hr.form.configuracaoSemAcesso")).not.toBeInTheDocument();
  });
});

describe("PessoaFormDialog: o resumo de problemas e o atalho de cada problema", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissoes = new Set();
    duplicados = { travoes: [], sinais: [] };
    idDesactivado = "";
    configuracao = {
      campos: [campoDaConfiguracao("linha1"), campoDaConfiguracao("telefone_pessoal")],
      carregando: false,
      erro: false,
      semAcesso: false,
    };
  });

  function criarComProblemas() {
    montar();
    escreverNomes();
    escolherCargo();
    fireEvent.click(botaoCriar());
  }

  it("ao carregar em Criar com problemas, o resumo e anunciado (role=alert)", async () => {
    criarComProblemas();
    const alerta = await screen.findByRole("alert");
    expect(alerta).toHaveTextContent("hr.form.resumoProblemas");
    expect(alerta).toHaveTextContent("hr.campos.telefonePessoal");
  });

  it("clicar num problema muda de passo, pede o foco e foca o campo quando ele ja existe no DOM", async () => {
    criarComProblemas();
    fireEvent.click(await screen.findByRole("button", { name: /hr\.form\.seccoes\.pessoais → hr\.campos\.enderecoRua/ }));

    expect(screen.getByTestId("foco-pedido")).toHaveTextContent(/^hr-novo-morada-linha1#\d+$/);
    // O campo so existe depois do render do bloco: o foco espera por ele.
    await waitFor(() => expect(document.activeElement?.id).toBe("hr-novo-morada-linha1"));
  });

  it("dois cliques no mesmo problema voltam a pedir o foco (pedidos distintos)", async () => {
    criarComProblemas();
    const problema = await screen.findByRole("button", { name: /hr\.form\.seccoes\.pessoais → hr\.campos\.enderecoRua/ });
    fireEvent.click(problema);
    const primeiro = screen.getByTestId("foco-pedido").textContent;
    fireEvent.click(screen.getByRole("button", { name: /hr\.form\.seccoes\.pessoais → hr\.campos\.enderecoRua/ }));
    expect(screen.getByTestId("foco-pedido").textContent).not.toBe(primeiro);
  });

  it("um campo desactivado nao fica com foco silencioso: o foco vai para o painel do passo", async () => {
    idDesactivado = "hr-novo-morada-linha1";
    criarComProblemas();
    fireEvent.click(await screen.findByRole("button", { name: /hr\.form\.seccoes\.pessoais → hr\.campos\.enderecoRua/ }));
    await waitFor(() => expect(document.activeElement?.id).toBe("hr-novo-painel-pessoais"));
  });
});

describe("PessoaFormDialog: permissoes de escrita que mudam o que se exige", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configuracao = { campos: [], carregando: false, erro: false, semAcesso: false };
  });

  it("sem hr.pessoas.laborais.edit os tamanhos ficam desactivados e nao se exigem", async () => {
    permissoes = new Set();
    configuracao = {
      campos: [campoDaConfiguracao("tamanho_cima")],
      carregando: false,
      erro: false,
      semAcesso: false,
    };
    const { onCriar } = montar();
    escreverNomes();
    escolherCargo();
    irParaPasso("pessoais");
    expect(screen.getByTestId("pode-fardamento")).toHaveTextContent("false");
    expect(screen.getByTestId("obrigatorios")).not.toHaveTextContent("tamanho_cima");

    fireEvent.click(botaoCriar());
    await waitFor(() => expect(onCriar).toHaveBeenCalledTimes(1));
  });

  it("com hr.pessoas.laborais.edit o tamanho obrigatorio volta a bloquear", async () => {
    permissoes = new Set(["hr.pessoas.laborais.edit"]);
    configuracao = {
      campos: [campoDaConfiguracao("tamanho_cima")],
      carregando: false,
      erro: false,
      semAcesso: false,
    };
    const { onCriar } = montar();
    escreverNomes();
    escolherCargo();
    irParaPasso("pessoais");
    expect(screen.getByTestId("pode-fardamento")).toHaveTextContent("true");
    expect(screen.getByTestId("obrigatorios")).toHaveTextContent("tamanho_cima");

    fireEvent.click(botaoCriar());
    expect(onCriar).not.toHaveBeenCalled();
  });

  it("a carta de conducao segue hr.pessoas.identificacao.edit", () => {
    permissoes = new Set();
    montar();
    irParaPasso("pessoais");
    expect(screen.getByTestId("pode-identificacao")).toHaveTextContent("false");
  });

  it("com hr.pessoas.identificacao.edit a carta fica activa", () => {
    permissoes = new Set(["hr.pessoas.identificacao.edit"]);
    montar();
    irParaPasso("pessoais");
    expect(screen.getByTestId("pode-identificacao")).toHaveTextContent("true");
  });
});

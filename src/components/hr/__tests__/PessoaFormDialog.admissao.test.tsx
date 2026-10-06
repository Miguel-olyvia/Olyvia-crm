/**
 * `PessoaFormDialog`, o que toca na admissao:
 *
 *  - "A pessoa, por convite" sem poder abrir o convite (sem a permissao de
 *    enviar) NAO segue em silencio: avisa que o convite nao foi aberto;
 *  - com a permissao, abre o envio e so segue para a ficha quando ele fecha;
 *  - "RH, agora" sem a configuracao da admissao: espera enquanto carrega e,
 *    se a leitura falhou, diz que a configuracao nao chegou (nao trata o `null`
 *    como "sem configuracao");
 *  - o cargo e obrigatorio (fluxo 2): sem ele nao se cria a ficha e o resumo
 *    de problemas di-lo; o payload leva cargo_id e o nome do cargo escolhido.
 *
 * As seccoes do assistente sao simuladas com campos minimos: aqui testa-se o
 * assistente, nao os campos.
 */
import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
vi.mock("@/hooks/usePessoaDuplicados", () => ({
  usePessoaDuplicados: () => ({
    travoes: [],
    sinais: [],
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
      <button type="button" onClick={() => onPatch({ quem_preenche: "rh" })}>
        modo-rh
      </button>
    </div>
  ),
}));
vi.mock("@/components/hr/form/SeccaoDetalhesPessoais", () => ({
  SeccaoDetalhesPessoais: ({
    valor,
    onPatch,
  }: {
    valor: { email_pessoal: string };
    onPatch: (patch: Record<string, string>) => void;
  }) => (
    <input
      aria-label="email-pessoal"
      value={valor.email_pessoal}
      onChange={(e) => onPatch({ email_pessoal: e.target.value })}
    />
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

const botaoCriar = () => screen.getByRole("button", { name: "hr.form.criarFicha" });

describe("PessoaFormDialog: admissao", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    permissoes = new Set();
    configuracao = { campos: [], carregando: false, erro: false, semAcesso: false };
  });

  describe("por convite", () => {
    it("sem permissao para enviar convites avisa que o convite NAO foi aberto e segue para a ficha", async () => {
      const { onCriada } = montar();
      escreverNomes();
      escreverEmailPessoal();
      escolherCargo();

      fireEvent.click(botaoCriar());

      await waitFor(() => expect(onCriada).toHaveBeenCalledWith("p-nova"));
      expect(toast.warning).toHaveBeenCalledWith("hr.form.conviteNaoAberto.semPermissao");
      expect(screen.queryByRole("button", { name: "fechar-convite" })).not.toBeInTheDocument();
    });

    it("com permissao abre o envio do convite, sem aviso, e so segue para a ficha quando ele fecha", async () => {
      permissoes = new Set(["hr.pessoas.convite.enviar"]);
      const { onCriada } = montar();
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

  describe("RH, agora, e a configuracao da admissao", () => {
    it("enquanto a configuracao carrega, Criar ficha espera", () => {
      configuracao = { campos: null, carregando: true, erro: false, semAcesso: false };
      montar();
      escreverNomes();
      fireEvent.click(screen.getByRole("button", { name: "modo-rh" }));

      expect(botaoCriar()).toBeDisabled();
    });

    it("se a leitura falhou, diz que a configuracao nao chegou (nao a trata como 'sem configuracao')", () => {
      configuracao = { campos: null, carregando: false, erro: true, semAcesso: false };
      montar();
      escreverNomes();
      fireEvent.click(screen.getByRole("button", { name: "modo-rh" }));

      expect(screen.getByRole("alert")).toHaveTextContent("hr.form.configuracaoNaoCarregada");
    });

    it("sem configuracao, sem erro, sem carga e sem recusa de acesso (a leitura nunca correu), avisa na mesma", () => {
      configuracao = { campos: null, carregando: false, erro: false, semAcesso: false };
      montar();
      escreverNomes();
      fireEvent.click(screen.getByRole("button", { name: "modo-rh" }));

      expect(screen.getByRole("alert")).toHaveTextContent("hr.form.configuracaoNaoCarregada");
    });

    it("se a base recusou a leitura por permissao, nao se avisa de uma falha que nao ha", () => {
      configuracao = { campos: null, carregando: false, erro: false, semAcesso: true };
      montar();
      escreverNomes();
      fireEvent.click(screen.getByRole("button", { name: "modo-rh" }));

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("com a configuracao lida, nao ha aviso e Criar ficha esta activo", () => {
      montar();
      escreverNomes();
      fireEvent.click(screen.getByRole("button", { name: "modo-rh" }));

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(botaoCriar()).toBeEnabled();
    });

    it("por convite, a configuracao em falta nao assusta: o convite nao depende dela aqui", () => {
      configuracao = { campos: null, carregando: false, erro: true, semAcesso: false };
      montar();
      escreverNomes();

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});

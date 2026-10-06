/**
 * `ConfiguracaoAdmissao`: gating por `hr.admissao.obrigatorios.gerir`, controlo
 * de tres posicoes por campo da pessoa, e separador do RH so de leitura.
 * `useConfiguracaoObrigatoriosAdmissao` e mockado aqui -- este teste cobre so a
 * renderizacao e a chamada a `definirPosicao`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: "org-nike" }, isLoading: false }),
}));

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "pt" }),
}));

const hasPermission = vi.fn((_perm: string) => false);
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ hasPermission, loading: false }),
}));

vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

type Linha = {
  codigo: string;
  origem: "pessoa" | "rh";
  condicional: boolean;
  posicao: "convite" | "ficha" | "opcional" | "rh";
  configuravel: boolean;
};

// Propositadamente fora da ordem da lista fixa e fora da ordem alfabetica.
const CAMPOS: Linha[] = [
  { codigo: "niss", origem: "pessoa", condicional: true, posicao: "ficha", configuravel: true },
  { codigo: "genero", origem: "pessoa", condicional: false, posicao: "opcional", configuravel: true },
  { codigo: "data_nascimento", origem: "pessoa", condicional: false, posicao: "convite", configuravel: true },
  { codigo: "nif", origem: "pessoa", condicional: true, posicao: "convite", configuravel: true },
  { codigo: "data_admissao", origem: "rh", condicional: false, posicao: "rh", configuravel: false },
  { codigo: "cargo", origem: "rh", condicional: false, posicao: "rh", configuravel: false },
];

let campos: Linha[] = [];
let erro: string | null = null;
let isSaving = false;
const definirPosicao = vi.fn(async (_codigo: string, _posicao: string) => {});
vi.mock("@/hooks/useConfiguracaoObrigatoriosAdmissao", () => ({
  useConfiguracaoObrigatoriosAdmissao: () => ({
    campos,
    isLoading: false,
    isSaving,
    definirPosicao,
    erro,
  }),
}));

import { toast } from "@/lib/toast";
import ConfiguracaoAdmissao from "../ConfiguracaoAdmissao";

function renderPagina() {
  return render(<ConfiguracaoAdmissao />);
}

function abrirSeparadorRh() {
  fireEvent.mouseDown(screen.getAllByRole("tab")[1], { button: 0, ctrlKey: false });
}

describe("ConfiguracaoAdmissao", () => {
  beforeEach(() => {
    hasPermission.mockReset();
    hasPermission.mockImplementation((perm: string) => perm === "hr.admissao.obrigatorios.gerir");
    definirPosicao.mockReset();
    definirPosicao.mockResolvedValue(undefined);
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    campos = CAMPOS;
    erro = null;
    isSaving = false;
  });

  it("sem hr.admissao.obrigatorios.gerir mostra o cartao de sem acesso", () => {
    hasPermission.mockReturnValue(false);
    renderPagina();

    expect(screen.getByText("Não tem permissão para ver esta informação")).toBeTruthy();
    expect(screen.queryByText("NIF")).toBeNull();
  });

  it("um erro ao carregar fica visivel, em vez de so mostrar a lista vazia, e e o texto traduzido do hook", () => {
    campos = [];
    // O hook devolve ja a mensagem traduzida (nunca o `message` cru da base).
    erro = "Não foi possível carregar a configuração. Tente novamente.";
    renderPagina();

    expect(screen.getByText("Não foi possível carregar a configuração. Tente novamente.")).toBeTruthy();
  });

  it("cada campo da pessoa tem um grupo de 3 posicoes, com a posicao actual escolhida", () => {
    renderPagina();

    const grupoNiss = screen.getByRole("radiogroup", { name: "NISS" });
    expect(grupoNiss.querySelectorAll('[role="radio"]')).toHaveLength(3);
    expect(
      grupoNiss.querySelector("#admissao-posicao-niss-ficha")?.getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      grupoNiss.querySelector("#admissao-posicao-niss-convite")?.getAttribute("aria-checked"),
    ).toBe("false");
    // 4 campos da pessoa x 3 posicoes; nenhum campo do RH entra aqui.
    expect(screen.getAllByRole("radio")).toHaveLength(12);
  });

  it("os campos do RH nao aparecem no separador da pessoa", () => {
    renderPagina();

    expect(screen.queryByRole("radiogroup", { name: "Data de admissão" })).toBeNull();
    expect(screen.queryByText("Data de admissão")).toBeNull();
  });

  it("segue a ordem da lista fixa (nao a alfabetica nem a da resposta)", () => {
    renderPagina();

    const nomes = screen.getAllByRole("radiogroup").map((g) => g.getAttribute("aria-label"));
    expect(nomes).toEqual(["Data de nascimento", "Género", "NIF", "NISS"]);
  });

  it("mudar a posicao chama definirPosicao com o codigo e a posicao nova", async () => {
    const { container } = renderPagina();

    fireEvent.click(container.querySelector("#admissao-posicao-nif-ficha") as HTMLElement);

    await waitFor(() => expect(definirPosicao).toHaveBeenCalledWith("nif", "ficha"));
    expect(definirPosicao).toHaveBeenCalledTimes(1);
  });

  it("clicar na posicao ja escolhida nao grava nada", () => {
    const { container } = renderPagina();

    fireEvent.click(container.querySelector("#admissao-posicao-nif-convite") as HTMLElement);

    expect(definirPosicao).not.toHaveBeenCalled();
  });

  describe("durante a gravacao", () => {
    it("nao desactiva os grupos nem os radios: marca-os so como ocupados (o foco nao se perde)", () => {
      isSaving = true;
      renderPagina();

      for (const grupo of screen.getAllByRole("radiogroup")) {
        expect(grupo.getAttribute("aria-busy")).toBe("true");
        expect(grupo.hasAttribute("data-disabled")).toBe(false);
      }
      for (const radio of screen.getAllByRole("radio")) {
        expect(radio).not.toBeDisabled();
      }
    });

    it("o radio focado continua com o foco depois do clique", async () => {
      definirPosicao.mockImplementation(() => new Promise<void>(() => undefined));
      const { container } = renderPagina();
      const radio = container.querySelector("#admissao-posicao-nif-ficha") as HTMLElement;

      radio.focus();
      fireEvent.click(radio);

      await waitFor(() => expect(definirPosicao).toHaveBeenCalledTimes(1));
      expect(radio).not.toBeDisabled();
      expect(document.activeElement).toBe(radio);
    });

    it("a escolha aparece logo, sem esperar pela base", async () => {
      definirPosicao.mockImplementation(() => new Promise<void>(() => undefined));
      const { container } = renderPagina();

      fireEvent.click(container.querySelector("#admissao-posicao-nif-ficha") as HTMLElement);

      await waitFor(() =>
        expect(
          container.querySelector("#admissao-posicao-nif-ficha")?.getAttribute("aria-checked"),
        ).toBe("true"),
      );
      expect(
        container.querySelector("#admissao-posicao-nif-convite")?.getAttribute("aria-checked"),
      ).toBe("false");
    });

    it("se a gravacao falhar, volta a posicao anterior e di-lo (toast e regiao anunciada)", async () => {
      definirPosicao.mockRejectedValue(new Error("posicao_invalida"));
      const { container } = renderPagina();

      fireEvent.click(container.querySelector("#admissao-posicao-nif-ficha") as HTMLElement);

      await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
      const mensagem = vi.mocked(toast.error).mock.calls[0][0] as string;
      expect(
        container.querySelector("#admissao-posicao-nif-convite")?.getAttribute("aria-checked"),
      ).toBe("true");
      expect(screen.getByRole("status")).toHaveTextContent(mensagem);
    });

    it("gravar com sucesso anuncia o resultado numa regiao aria-live (o toast sozinho nao basta)", async () => {
      const { container } = renderPagina();

      fireEvent.click(container.querySelector("#admissao-posicao-nif-ficha") as HTMLElement);

      await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));
      const regiao = screen.getByRole("status");
      expect(regiao.getAttribute("aria-live")).toBe("polite");
      expect(regiao).toHaveTextContent("NIF");
      expect(regiao).toHaveTextContent(vi.mocked(toast.success).mock.calls[0][0] as string);
    });

    it("um clique enquanto ja se grava outra posicao e ignorado", () => {
      isSaving = true;
      const { container } = renderPagina();

      fireEvent.click(container.querySelector("#admissao-posicao-nif-ficha") as HTMLElement);

      expect(definirPosicao).not.toHaveBeenCalled();
    });
  });

  it("o separador do RH e so de leitura: lista os campos e nao tem controlos", () => {
    renderPagina();
    abrirSeparadorRh();

    expect(screen.getByText("Data de admissão")).toBeTruthy();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.queryAllByRole("radiogroup")).toHaveLength(0);
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});

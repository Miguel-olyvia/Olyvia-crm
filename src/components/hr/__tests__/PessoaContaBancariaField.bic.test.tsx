/**
 * O BIC na ficha do RH: validacao no ecra, leitura em claro e correccao
 * isolada por `rpc_hr_definir_bic` (sem repor o IBAN).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ t: (chave: string) => chave, language: "pt" }),
}));

const toastErro = vi.fn();
const toastSucesso = vi.fn();
vi.mock("@/lib/toast", () => ({
  toast: {
    error: (...a: unknown[]) => toastErro(...a),
    success: (...a: unknown[]) => toastSucesso(...a),
  },
}));

import { PessoaContaBancariaField } from "@/components/hr/PessoaContaBancariaField";
import type { PessoaDadosBancarios } from "@/types/hr";

const IBAN_BOM = "PT50000201231234567890154";

function bancarios(extra: Partial<PessoaDadosBancarios> = {}): PessoaDadosBancarios {
  return {
    formato_conta: "iban",
    conta_ultimos4: "0154",
    conta_pais: "PT",
    titular: null,
    banco: null,
    agencia: null,
    swift: null,
    ...extra,
  } as PessoaDadosBancarios;
}

function abrirEdicaoCompleta() {
  fireEvent.click(screen.getByRole("button", { name: "employees.form.update" }));
}

function campo(id: string): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}

describe("PessoaContaBancariaField: BIC", () => {
  beforeEach(() => {
    toastErro.mockReset();
    toastSucesso.mockReset();
  });

  it("um BIC malformado mostra o erro e desactiva Guardar", () => {
    render(
      <PessoaContaBancariaField
        bancarios={bancarios()}
        podeEditar
        saving={false}
        onDefinir={vi.fn()}
      />,
    );
    abrirEdicaoCompleta();
    fireEvent.change(campo("hr-conta-numero"), { target: { value: IBAN_BOM } });
    fireEvent.change(campo("hr-conta-swift"), { target: { value: "ABCD1234" } });

    expect(screen.getByText("hr.form.erroBic")).toBeInTheDocument();
    expect(campo("hr-conta-swift").getAttribute("aria-invalid")).toBe("true");
    expect(
      (screen.getByRole("button", { name: "employees.form.update" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("um BIC valido segue em onDefinir como swift maiusculo e sem espacos", async () => {
    const onDefinir = vi.fn().mockResolvedValue(null);
    render(
      <PessoaContaBancariaField
        bancarios={bancarios()}
        podeEditar
        saving={false}
        onDefinir={onDefinir}
      />,
    );
    abrirEdicaoCompleta();
    fireEvent.change(campo("hr-conta-numero"), { target: { value: IBAN_BOM } });
    fireEvent.change(campo("hr-conta-swift"), { target: { value: "cgdi ptpl" } });

    expect(campo("hr-conta-swift").value).toBe("CGDIPTPL");
    fireEvent.click(screen.getByRole("button", { name: "employees.form.update" }));

    await waitFor(() => expect(onDefinir).toHaveBeenCalledTimes(1));
    expect(onDefinir.mock.calls[0][0]).toMatchObject({ conta: IBAN_BOM, swift: "CGDIPTPL" });
  });

  it("sem BIC, swift vai a null", async () => {
    const onDefinir = vi.fn().mockResolvedValue(null);
    render(
      <PessoaContaBancariaField
        bancarios={bancarios()}
        podeEditar
        saving={false}
        onDefinir={onDefinir}
      />,
    );
    abrirEdicaoCompleta();
    fireEvent.change(campo("hr-conta-numero"), { target: { value: IBAN_BOM } });
    fireEvent.click(screen.getByRole("button", { name: "employees.form.update" }));

    await waitFor(() => expect(onDefinir).toHaveBeenCalledTimes(1));
    expect(onDefinir.mock.calls[0][0].swift).toBeNull();
  });

  it("a vista de leitura mostra o BIC em claro", () => {
    render(
      <PessoaContaBancariaField
        bancarios={bancarios({ swift: "CGDIPTPL" })}
        podeEditar={false}
        saving={false}
        onDefinir={vi.fn()}
      />,
    );

    expect(screen.getByText("hr.campos.swift")).toBeInTheDocument();
    expect(screen.getByText("CGDIPTPL")).toBeInTheDocument();
  });

  it("sem BIC gravado e sem permissao nao mostra a linha do BIC", () => {
    render(
      <PessoaContaBancariaField
        bancarios={bancarios()}
        podeEditar={false}
        saving={false}
        onDefinir={vi.fn()}
      />,
    );

    expect(screen.queryByText("hr.campos.swift")).not.toBeInTheDocument();
  });

  describe("correccao so do BIC", () => {
    function renderComBic(onDefinirBic: (bic: string | null) => Promise<string | null>) {
      const onDefinir = vi.fn();
      render(
        <PessoaContaBancariaField
          bancarios={bancarios({ swift: "CGDIPTPL" })}
          podeEditar
          saving={false}
          onDefinir={onDefinir}
          onDefinirBic={onDefinirBic}
        />,
      );
      fireEvent.click(
        screen.getByRole("button", { name: "employees.form.update hr.campos.swift" }),
      );
      return onDefinir;
    }

    it("chama so onDefinirBic, normalizado, sem tocar na conta", async () => {
      const onDefinirBic = vi.fn().mockResolvedValue(null);
      const onDefinir = renderComBic(onDefinirBic);

      fireEvent.change(campo("hr-conta-bic-sozinho"), { target: { value: "bcpt ptpl" } });
      fireEvent.click(screen.getAllByRole("button", { name: "employees.form.update" })[1]);

      await waitFor(() => expect(onDefinirBic).toHaveBeenCalledWith("BCPTPTPL"));
      expect(onDefinir).not.toHaveBeenCalled();
    });

    it("um BIC malformado mostra o erro e nao deixa gravar", () => {
      const onDefinirBic = vi.fn();
      renderComBic(onDefinirBic);

      fireEvent.change(campo("hr-conta-bic-sozinho"), { target: { value: "ABCD1234" } });

      expect(screen.getByText("hr.form.erroBic")).toBeInTheDocument();
      expect(
        (screen.getAllByRole("button", { name: "employees.form.update" })[1] as HTMLButtonElement)
          .disabled,
      ).toBe(true);
      expect(onDefinirBic).not.toHaveBeenCalled();
    });

    it("limpar o campo envia null", async () => {
      const onDefinirBic = vi.fn().mockResolvedValue(null);
      renderComBic(onDefinirBic);

      fireEvent.change(campo("hr-conta-bic-sozinho"), { target: { value: "" } });
      fireEvent.click(screen.getAllByRole("button", { name: "employees.form.update" })[1]);

      await waitFor(() => expect(onDefinirBic).toHaveBeenCalledWith(null));
    });

    it("uma recusa do servidor aparece como erro e o editor fica aberto", async () => {
      const onDefinirBic = vi.fn().mockResolvedValue("sem permissao");
      renderComBic(onDefinirBic);

      fireEvent.click(screen.getAllByRole("button", { name: "employees.form.update" })[1]);

      await waitFor(() => expect(toastErro).toHaveBeenCalledWith("sem permissao"));
      expect(campo("hr-conta-bic-sozinho")).not.toBeNull();
    });

    it("ao abrir a edicao do BIC o campo recebe o foco", () => {
      renderComBic(vi.fn());
      expect(campo("hr-conta-bic-sozinho")).toHaveFocus();
    });

    it("gravar com sucesso mostra o toast e devolve o foco ao botao de abrir o BIC", async () => {
      const onDefinirBic = vi.fn().mockResolvedValue(null);
      renderComBic(onDefinirBic);

      fireEvent.change(campo("hr-conta-bic-sozinho"), { target: { value: "BCPTPTPL" } });
      fireEvent.click(screen.getAllByRole("button", { name: "employees.form.update" })[1]);

      await waitFor(() => expect(toastSucesso).toHaveBeenCalledTimes(1));
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "employees.form.update hr.campos.swift" }),
        ).toHaveFocus(),
      );
    });

    it("cancelar devolve o foco ao botao de abrir o BIC", async () => {
      renderComBic(vi.fn());

      fireEvent.click(screen.getByRole("button", { name: "employees.form.cancel" }));

      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: "employees.form.update hr.campos.swift" }),
        ).toHaveFocus(),
      );
    });

    it("com a edicao do BIC aberta, o botao de editar a conta fica desactivado", () => {
      renderComBic(vi.fn());
      expect(
        (screen.getAllByRole("button", { name: "employees.form.update" })[0] as HTMLButtonElement)
          .disabled,
      ).toBe(true);
    });

    it("BIC vazio numa ficha SEM dados bancarios nao chama o servidor nem diz que guardou", async () => {
      // `rpc_hr_definir_bic` nao faz nada neste caso: dizer "guardado" era falso.
      const onDefinirBic = vi.fn().mockResolvedValue(null);
      render(
        <PessoaContaBancariaField
          bancarios={null}
          podeEditar
          saving={false}
          onDefinir={vi.fn()}
          onDefinirBic={onDefinirBic}
        />,
      );
      fireEvent.click(
        screen.getByRole("button", { name: "employees.form.update hr.campos.swift" }),
      );
      fireEvent.click(screen.getAllByRole("button", { name: "employees.form.update" })[1]);

      await waitFor(() => expect(campo("hr-conta-bic-sozinho")).toBeNull());
      expect(onDefinirBic).not.toHaveBeenCalled();
      expect(toastSucesso).not.toHaveBeenCalled();
    });

    it("BIC vazio numa ficha COM dados bancarios continua a limpar o BIC", async () => {
      const onDefinirBic = vi.fn().mockResolvedValue(null);
      renderComBic(onDefinirBic);
      fireEvent.change(campo("hr-conta-bic-sozinho"), { target: { value: "" } });
      fireEvent.click(screen.getAllByRole("button", { name: "employees.form.update" })[1]);

      await waitFor(() => expect(onDefinirBic).toHaveBeenCalledWith(null));
      await waitFor(() => expect(toastSucesso).toHaveBeenCalledTimes(1));
    });

    it("sem onDefinirBic nao ha edicao isolada", () => {
      render(
        <PessoaContaBancariaField
          bancarios={bancarios({ swift: "CGDIPTPL" })}
          podeEditar
          saving={false}
          onDefinir={vi.fn()}
        />,
      );

      expect(
        screen.queryByRole("button", { name: "employees.form.update hr.campos.swift" }),
      ).not.toBeInTheDocument();
    });
  });
});

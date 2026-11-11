// @vitest-environment jsdom
// F9: sem suppliers.edit o separador Dados da ficha do fornecedor fica só de leitura. Campos readOnly (não disabled, para
// continuarem focáveis e lidos pelo leitor de ecrã), com um aviso que os descreve; nada se submete.
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const procura = vi.hoisted(() => ({ ativo: vi.fn() }));
vi.mock("@/hooks/useMoradaPorCodigoPostal", () => ({
  seVazio: (a: string, b: string) => a || b,
  useMoradaPorCodigoPostal: (_cp: string, _cb: unknown, ativo?: boolean) => { procura.ativo(ativo); },
}));
vi.mock("@/components/OrganizationFormSection", () => ({
  OrganizationFormSection: () => <div data-testid="org-section" />,
}));

import { SupplierDataForm, type SupplierFormData } from "../SupplierDataForm";
import { tabelaFundida } from "@/translations/tabelaFundida";

// O Switch do Radix mede-se com ResizeObserver, que o jsdom não traz.
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });

const DADOS: SupplierFormData = {
  name: "Forn Lda", contact_person: "Ana", email: "a@f.pt", phone: "912", address: "Rua 1", city: "Porto", postal_code: "4000-001",
  country: "Portugal", tax_id: "501964843", delivery_sla_days: 5, website: "https://f.pt", notes: "nota", is_active: true,
};
const t = (k: string) => (k === "suppliers.form.readOnlyNote" ? "NOTA-SO-LEITURA" : k);

function Wrapper({ readOnly, onSubmit }: { readOnly?: boolean; onSubmit: () => void }) {
  const [formData, setFormData] = useState(DADOS);
  return (
    <SupplierDataForm
      formId="f" formData={formData} setFormData={setFormData} fieldErrors={{}}
      organizationSelection={{ tenantId: "", companyId: "o", businessUnitId: "", departmentId: "", secondaryCompanyIds: [] }}
      onOrganizationChange={() => undefined} onSubmit={onSubmit} t={t} readOnly={readOnly}
    />
  );
}

describe("SupplierDataForm só de leitura (F9)", () => {
  it("campos readOnly mas não disabled, e o valor mantém-se ao escrever", () => {
    render(<Wrapper readOnly onSubmit={vi.fn()} />);
    const nome = screen.getByLabelText("suppliers.form.name *") as HTMLInputElement;
    expect(nome.readOnly).toBe(true);
    expect(nome.disabled).toBe(false);
    fireEvent.change(nome, { target: { value: "Outro" } });
    expect(nome.value).toBe("Forn Lda");
    const notas = screen.getByLabelText("suppliers.form.notes") as HTMLTextAreaElement;
    expect(notas.readOnly).toBe(true);
    expect(notas.disabled).toBe(false);
    fireEvent.change(notas, { target: { value: "x" } });
    expect(notas.value).toBe("nota");
  });

  it("o estado Ativo mostra-se em texto, sem interruptor que pareça ligável", () => {
    render(<Wrapper readOnly onSubmit={vi.fn()} />);
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByText("suppliers.form.active: Sim")).toBeTruthy();
  });

  it("não procura a morada pelo código postal em modo de leitura", () => {
    procura.ativo.mockClear();
    render(<Wrapper readOnly onSubmit={vi.fn()} />);
    expect(procura.ativo).toHaveBeenCalled();
    expect(procura.ativo.mock.calls.every(([a]) => a === false)).toBe(true);
  });

  it("com permissão de editar, a procura por código postal continua ativa (Portugal)", () => {
    procura.ativo.mockClear();
    render(<Wrapper onSubmit={vi.fn()} />);
    expect(procura.ativo.mock.calls.every(([a]) => a === true)).toBe(true);
  });

  it("mostra o aviso e liga os campos a ele (aria-describedby)", () => {
    render(<Wrapper readOnly onSubmit={vi.fn()} />);
    const aviso = screen.getByRole("note");
    expect(aviso.textContent).toContain("NOTA-SO-LEITURA");
    const nome = screen.getByLabelText("suppliers.form.name *");
    expect(nome.getAttribute("aria-describedby") ?? "").toContain(aviso.id);
  });

  it("submeter o formulário (Enter) não chama onSubmit", () => {
    const onSubmit = vi.fn();
    const { container } = render(<Wrapper readOnly onSubmit={onSubmit} />);
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("com permissão de editar: igual a hoje (editável, sem aviso, submete)", () => {
    const onSubmit = vi.fn((e?: unknown) => e);
    const { container } = render(<Wrapper onSubmit={onSubmit} />);
    const nome = screen.getByLabelText("suppliers.form.name *") as HTMLInputElement;
    expect(nome.readOnly).toBe(false);
    expect(screen.getByRole("switch")).toBeTruthy();
    fireEvent.change(nome, { target: { value: "Outro" } });
    expect(nome.value).toBe("Outro");
    expect(screen.queryByText("NOTA-SO-LEITURA")).toBeNull();
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe("tradução do aviso (tabela fundida)", () => {
  it("existe em português e em inglês, e nomeia a permissão", () => {
    expect(tabelaFundida.pt["suppliers.form.readOnlyNote"]).toMatch(/Editar fornecedores/);
    expect(tabelaFundida.en["suppliers.form.readOnlyNote"]).toMatch(/Edit suppliers/);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// O ecrã "Fichas e campos": mostra os campos de sistema da ficha do local,
// deixa acrescentar um campo da empresa e grava a ficha inteira pela RPC.

const rpc = vi.fn((..._args: unknown[]) => Promise.resolve({ data: 1, error: null }));

function consulta(dados: unknown[]) {
  const q: any = {
    select: () => q,
    eq: () => q,
    order: () => Promise.resolve({ data: dados, error: null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  return q;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => consulta([]),
    rpc: (...args: unknown[]) => rpc(...args),
  },
}));

vi.mock("@/contexts/CompanyContext", () => ({
  useCompany: () => ({ activeCompany: { id: "org-1", name: "Org" } }),
}));

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

const montar = async () => {
  const { default: CamposConfig } = await import("../CamposConfig");
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <CamposConfig />
    </QueryClientProvider>,
  );
  await screen.findByTestId("campo-acesso");
};

describe("Fichas e campos", () => {
  beforeEach(() => {
    rpc.mockClear();
    toast.mockClear();
  });

  it("mostra os campos de sistema da ficha do local com o papel", async () => {
    await montar();
    const acesso = screen.getByTestId("campo-acesso");
    expect(within(acesso).getByText("Sistema")).toBeTruthy();
    expect(within(acesso).getByText(/Usado no planeamento/)).toBeTruthy();
    expect(within(acesso).queryByRole("button", { name: /Apagar/ })).toBeNull();
    expect(screen.getByTestId("campo-habitada_durante_obra")).toBeTruthy();
  });

  it("acrescenta um campo da empresa e grava a ficha pela RPC", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: /^Campo$/ }));
    fireEvent.change(await screen.findByLabelText("Rótulo"), { target: { value: "Horário de acesso" } });
    expect((screen.getByLabelText("Chave") as HTMLInputElement).value).toBe("horario_de_acesso");
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "texto" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));

    const novo = await screen.findByTestId("campo-horario_de_acesso");
    expect(within(novo).getByText("Da empresa")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /^Gravar$/ }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("rpc_cfg_gravar_ficha", expect.anything()));
    const [, args] = rpc.mock.calls.find((c) => c[0] === "rpc_cfg_gravar_ficha")! as [string, any];
    expect(args.p_org).toBe("org-1");
    expect(args.p_ficha).toBe("local");
    const linha = args.p_campos.find((l: any) => l.chave === "horario_de_acesso");
    expect(linha).toMatchObject({ sistema: false, tipo: "texto", rotulo: "Horário de acesso" });
    expect(args.p_campos.filter((l: any) => l.sistema)).toHaveLength(22);
  });

  it("não aceita uma chave reservada pelo sistema", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: /^Campo$/ }));
    fireEvent.change(await screen.findByLabelText("Rótulo"), { target: { value: "Piso" } });
    fireEvent.change(screen.getByLabelText("Tipo"), { target: { value: "texto" } });
    fireEvent.click(screen.getByRole("button", { name: "Adicionar" }));
    expect(await screen.findByText(/já é usada pelo sistema/)).toBeTruthy();
  });
});

/**
 * DocumentosOcultadosDialog: ao abrir mostra o loader (nunca «nao ha ocultados» por um instante) e uma resposta que chega fora de
 * ordem nao sobrepoe a mais recente.
 */
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({
    t: (chave: string, params?: Record<string, string | number>) => (params ? `${chave} ${JSON.stringify(params)}` : chave),
    language: "pt",
  }),
}));
vi.mock("@/lib/toast", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { DocumentosOcultadosDialog } from "@/components/rh-exemplo/DocumentosOcultadosDialog";

function ocultado(titulo: string) {
  return {
    documento_id: titulo, tipo: "contrato", titulo, estado: "assinado", emitido_em: null, assinado_em: null,
    entregue_em: null, anulado_em: null, tem_ficheiro: false, ocultado_em: "2026-11-01T10:00:00Z", ocultado_por: "u9",
    ocultado_por_nome: "Ana Rita", ocultado_motivo: "Arquivo antigo",
  };
}

type Resposta = { documentos: ReturnType<typeof ocultado>[]; erro: string | null };

function adiada() {
  let resolver: (r: Resposta) => void = () => undefined;
  const promessa = new Promise<Resposta>((r) => { resolver = r; });
  return { promessa, resolver };
}

function props(listarOcultados: () => Promise<Resposta>, sobre: { aberto?: boolean } = {}) {
  return { aberto: true, onFechar: vi.fn(), listarOcultados, repor: vi.fn().mockResolvedValue(null), onAlterado: vi.fn(), ...sobre };
}

describe("DocumentosOcultadosDialog", () => {
  it("ao abrir mostra o loader e nao a mensagem de lista vazia enquanto a lista nao chega", async () => {
    const a = adiada();
    render(<DocumentosOcultadosDialog {...props(() => a.promessa)} />);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByText("hr.documentos.ocultadosVazio")).toBeNull();
    await act(async () => a.resolver({ documentos: [], erro: null }));
    expect(await screen.findByText("hr.documentos.ocultadosVazio")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("uma resposta antiga que chega depois da mais recente e ignorada", async () => {
    const antiga = adiada();
    const recente = adiada();
    const { rerender } = render(<DocumentosOcultadosDialog {...props(() => antiga.promessa)} />);
    // Uma nova funcao de leitura dispara nova leitura enquanto a primeira ainda nao respondeu.
    rerender(<DocumentosOcultadosDialog {...props(() => recente.promessa)} />);
    await act(async () => recente.resolver({ documentos: [ocultado("Recente")], erro: null }));
    expect(await screen.findByText("Recente")).toBeTruthy();
    await act(async () => antiga.resolver({ documentos: [ocultado("Antiga")], erro: null }));
    expect(screen.getByText("Recente")).toBeTruthy();
    expect(screen.queryByText("Antiga")).toBeNull();
  });

  it("uma resposta que chega depois de fechar nao deixa dados em estado", async () => {
    const a = adiada();
    const { rerender } = render(<DocumentosOcultadosDialog {...props(() => a.promessa)} />);
    const listar = () => a.promessa;
    rerender(<DocumentosOcultadosDialog {...props(listar, { aberto: false })} />);
    await act(async () => a.resolver({ documentos: [ocultado("Tarde")], erro: null }));
    rerender(<DocumentosOcultadosDialog {...props(() => adiada().promessa)} />);
    expect(screen.queryByText("Tarde")).toBeNull();
    expect(screen.getByRole("status")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("Tarde")).toBeNull());
    fireEvent.keyDown(document.body, { key: "Escape" });
  });
});

// A conversa do negócio no portal do cliente, nos dois idiomas. As mensagens e os erros do servidor ficam como vêm.
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { definirIdioma, reporIdiomaEmMemoria } from "@/portal-i18n/armazemIdioma";
import { ConversaDoNegocio } from "./ConversaDoNegocio";

function mostrar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ConversaDoNegocio negocioId="n1" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  reporIdiomaEmMemoria();
  rpc.mockReset();
});
afterEach(() => reporIdiomaEmMemoria());

describe("ConversaDoNegocio", () => {
  it("em português: título, a carregar e conversa vazia como sempre", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    mostrar();
    expect(screen.getByText("Conversa com a equipa")).toBeInTheDocument();
    expect(screen.getByText("A carregar a conversa…")).toBeInTheDocument();
    expect(
      await screen.findByText("Ainda sem mensagens. Escreva à equipa: respondemos por aqui. Se houver um problema na obra, junte fotografias."),
    ).toBeInTheDocument();
  });

  it("em inglês: título, a carregar e conversa vazia", async () => {
    definirIdioma("en");
    rpc.mockResolvedValue({ data: [], error: null });
    mostrar();
    expect(screen.getByText("Conversation with the team")).toBeInTheDocument();
    expect(screen.getByText("Loading the conversation…")).toBeInTheDocument();
    expect(await screen.findByText(/^No messages yet\./)).toBeInTheDocument();
  });

  it("falha a ler: o aviso segue o idioma", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    mostrar();
    expect(await screen.findByText("Não foi possível ler a conversa. Tente de novo daqui a pouco.")).toBeInTheDocument();
  });

  it("falha a ler, em inglês", async () => {
    definirIdioma("en");
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    mostrar();
    expect(await screen.findByText("We could not load the conversation. Please try again in a moment.")).toBeInTheDocument();
  });

  it("as mensagens escritas por pessoas ficam como vêm, em qualquer idioma", async () => {
    definirIdioma("en");
    rpc.mockResolvedValue({
      data: [{ id: "m1", de: "empresa", quem: "Equipa", t: "Olá, amanhã passamos aí.", em: "2026-11-01T10:00:00Z", lida: true }],
      error: null,
    });
    mostrar();
    await waitFor(() => expect(screen.getByText("Olá, amanhã passamos aí.")).toBeInTheDocument());
  });
});

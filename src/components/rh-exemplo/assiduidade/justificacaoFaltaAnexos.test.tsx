// Os anexos no ecrã da falta: a lista lê-se pelo id da FALTA (pessoas_faltas.id), mas o envio vai para o PAPEL da falta
// (pessoas_faltas_justificacoes.id), que o ecrã vai buscar à tabela. Sem papel legível não se oferece «Anexar».
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";

const m = vi.hoisted(() => ({ invoke: vi.fn(), upload: vi.fn(), rpc: vi.fn(), papel: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: m.invoke }, storage: { from: () => ({ uploadToSignedUrl: m.upload }) } },
}));
vi.mock("@/lib/hr/hrDb", () => ({ hrRpc: m.rpc, hrFrom: () => ({ select: () => ({ eq: () => ({ is: () => ({ limit: m.papel }) }) }) }) }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

import { renderRh } from "@/test/rhExemploProviders";
import { JustificacaoFalta } from "./JustificacaoFalta";

const base = {
  faltaId: "falta-1", estado: "pendente_documento" as const, decididaEm: null, decididaPorNome: null, motivoDaDecisao: null,
  podeVerDocumento: true, podeDecidir: true, aGravar: false, onRevelar: vi.fn(), onDecidir: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.setItem("language", "pt");
  m.rpc.mockResolvedValue({ data: [], error: null });
  m.papel.mockResolvedValue({ data: [{ id: "papel-1" }], error: null });
});
afterEach(() => cleanup());

describe("JustificacaoFalta e os anexos", () => {
  it("lê os anexos pelo id da falta e envia para o id do papel", async () => {
    m.invoke
      .mockResolvedValueOnce({ data: { ok: true, anexo_id: "a-1", bucket: "hr-documentos-quarantine", caminho: "justificacoes/a.pdf", upload_token: "t" }, error: null })
      .mockResolvedValueOnce({ data: { ok: true }, error: null });
    m.upload.mockResolvedValue({ data: {}, error: null });
    renderRh(<JustificacaoFalta {...base} />);
    await waitFor(() => expect(m.rpc).toHaveBeenCalledWith("rpc_hr_justificacao_anexos_listar", { _justificacao_dia_id: null, _falta_id: "falta-1" }));
    const campo = await screen.findByLabelText("Anexar ficheiros");
    fireEvent.change(campo, { target: { files: [new File(["x"], "atestado.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(m.invoke).toHaveBeenCalledTimes(2));
    expect(m.invoke.mock.calls[0][1].body).toMatchObject({ accao: "url", falta_justificacao_id: "papel-1", nome: "atestado.pdf" });
    expect(m.invoke.mock.calls[0][1].body).not.toHaveProperty("falta_id");
  });

  it("sem papel legível (sem permissão) não oferece «Anexar», mas continua a mostrar os anexos", async () => {
    m.papel.mockResolvedValue({ data: [], error: null });
    m.rpc.mockResolvedValue({
      data: [{ id: "a-1", estado: "verificado", nome: null, tamanho_bytes: 2048, pode_abrir: false, pode_remover: false }], error: null,
    });
    renderRh(<JustificacaoFalta {...base} podeVerDocumento={false} />);
    expect(await screen.findByTestId("rhjd-anexos-contagem")).toHaveTextContent("1 anexo");
    expect(screen.queryByLabelText("Anexar ficheiros")).not.toBeInTheDocument();
  });

  it("sem justificação não lê anexos; decidida não oferece anexar nem procura o papel", async () => {
    renderRh(<JustificacaoFalta {...base} estado="sem_justificacao" />);
    expect(m.rpc).not.toHaveBeenCalled();
    cleanup();
    renderRh(<JustificacaoFalta {...base} estado="justificada" />);
    await waitFor(() => expect(m.rpc).toHaveBeenCalled());
    expect(m.papel).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Anexar ficheiros")).not.toBeInTheDocument();
  });
});

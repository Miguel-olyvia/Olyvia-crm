// A fila de envios de formulário («negócio desde o início»): o nome vem de anew_entities, três ações (ligar, criar negócio, ignorar como duplicado),
// o diálogo «Já existe um negócio aberto» que volta a chamar a RPC com p_confirmar_negocio_aberto, mudou=false como sucesso e os erros traduzidos.
// Nada chama a base: o Supabase está simulado.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const SUBMISSAO = {
  id: "sub-1", organization_id: "org-nike", entity_id: "ent-1", target_type: "lead", target_id: "ent-1", campaign_id: null, form_id: null,
  field_values: { nome: "Ana (corrigida)", email: "ana@exemplo.pt" }, status: "pending", created_at: "2026-09-01T10:00:00Z", conflicting_entity_id: null,
};
const CONFLITO = { ...SUBMISSAO, id: "sub-2", conflicting_entity_id: "ent-2" };

const estado = vi.hoisted(() => ({
  submissoes: [] as Record<string, unknown>[],
  tabelasLidas: [] as string[],
  rpc: vi.fn(),
}));

function construtor(tabela: string, linhas: unknown[]) {
  estado.tabelasLidas.push(tabela);
  const q: Record<string, unknown> = {
    select: () => q, eq: () => q, is: () => q, in: () => q, or: () => q, order: () => q,
    limit: () => Promise.resolve({ data: linhas, error: null }),
    then: (r: (v: unknown) => unknown) => Promise.resolve({ data: linhas, error: null }).then(r),
  };
  return q;
}
const ENTIDADES = [
  { id: "ent-1", display_name: "Ana Ribeiro" },
  { id: "ent-2", display_name: "Beatriz Campos" },
];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabela: string) => construtor(tabela, tabela === "form_submissions" ? estado.submissoes : tabela === "anew_entities" ? ENTIDADES : []),
    rpc: (...a: unknown[]) => estado.rpc(...a),
  },
}));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: { id: "org-nike" }, isLoading: false }) }));
const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/lib/leads/fieldDefinitions", () => ({
  resolveLeadDialogFieldDefinitions: () => Promise.resolve([]),
  createSupabaseLeadDialogFieldDefinitionResolverClient: () => ({}),
}));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());

import PendingFormSubmissions from "../PendingFormSubmissions";

const botao = (nome: RegExp) => screen.getByRole("button", { name: nome });
async function desenhar(linhas: Record<string, unknown>[] = [SUBMISSAO]) {
  estado.submissoes = linhas;
  render(<PendingFormSubmissions />);
  await screen.findAllByRole("button", { name: /Criar negócio/ });
}
const confirmar = () => fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Confirmar" }));
const rpcCalls = () => estado.rpc.mock.calls.map((c) => [c[0], c[1]] as const);

beforeEach(() => {
  estado.tabelasLidas.length = 0;
  estado.rpc.mockReset().mockResolvedValue({ data: { acao: "ligar", mudou: true }, error: null });
  toast.mockClear();
});

describe("Envios de formulário: o que se vê", () => {
  it("o nome da pessoa vem de anew_entities e já não se lê anew_leads, anew_clients nem anew_contacts", async () => {
    await desenhar();
    expect(screen.getByText("Ana Ribeiro")).toBeInTheDocument();
    expect(estado.tabelasLidas).toContain("anew_entities");
    for (const antiga of ["anew_leads", "anew_clients", "anew_contacts"]) expect(estado.tabelasLidas).not.toContain(antiga);
  });

  it("avisa que os dados enviados não estão verificados", async () => {
    await desenhar();
    expect(screen.getByText(/não estão verificados/i)).toBeInTheDocument();
  });

  it("lista as submissões por resolver e conta-as", async () => {
    await desenhar([SUBMISSAO, { ...SUBMISSAO, id: "sub-9" }]);
    expect(screen.getAllByRole("button", { name: /Criar negócio/ })).toHaveLength(2);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("sem submissões diz que não há nada por resolver", async () => {
    estado.submissoes = [];
    render(<PendingFormSubmissions />);
    expect(await screen.findByText(/Sem envios por resolver/)).toBeInTheDocument();
  });

  it("oferece as três ações e nenhuma das antigas (registar como nota, nova lead)", async () => {
    await desenhar();
    expect(botao(/^Ligar à pessoa/)).toBeInTheDocument();
    expect(botao(/^Criar negócio/)).toBeInTheDocument();
    expect(botao(/^Ignorar como duplicado/)).toBeInTheDocument();
    expect(screen.queryByText(/Registar na ficha como nota/)).toBeNull();
    expect(screen.queryByText(/lead nova/i)).toBeNull();
  });

  it("não pede nenhuma permissão de leads nem mostra o tipo antigo (Lead, Contacto, Cliente)", async () => {
    await desenhar();
    expect(screen.queryByText("Lead")).toBeNull();
    expect(screen.queryByText("Contacto")).toBeNull();
  });
});

describe("Envios de formulário: ligar e ignorar", () => {
  it("ligar pede confirmação e depois chama a RPC só com a submissão e a ação; tira a linha e avisa", async () => {
    await desenhar();
    fireEvent.click(botao(/^Ligar à pessoa/));
    expect(estado.rpc).not.toHaveBeenCalled();
    confirmar();
    await waitFor(() => expect(estado.rpc).toHaveBeenCalledTimes(1));
    expect(rpcCalls()[0][0]).toBe("rpc_resolve_form_submission");
    expect(rpcCalls()[0][1]).toEqual({ p_submission_id: "sub-1", p_action: "ligar" });
    await waitFor(() => expect(screen.queryByText("Ana Ribeiro")).toBeNull());
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/ligado/i) }));
  });

  it("ignorar como duplicado pede confirmação e chama a RPC sem p_entity_id", async () => {
    await desenhar();
    fireEvent.click(botao(/^Ignorar como duplicado/));
    confirmar();
    await waitFor(() => expect(estado.rpc).toHaveBeenCalledTimes(1));
    const args = rpcCalls()[0][1] as Record<string, unknown>;
    expect(args).toMatchObject({ p_submission_id: "sub-1", p_action: "ignorar" });
    expect(args.p_entity_id).toBeUndefined();
    await waitFor(() => expect(screen.queryByText("Ana Ribeiro")).toBeNull());
  });

  it("cancelar a confirmação não chama a base", async () => {
    await desenhar();
    fireEvent.click(botao(/^Ligar à pessoa/));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancelar" }));
    expect(estado.rpc).not.toHaveBeenCalled();
    expect(screen.getByText("Ana Ribeiro")).toBeInTheDocument();
  });

  it("mudou=false (já estava resolvida) conta como sucesso: a linha sai e o aviso não é de erro", async () => {
    estado.rpc.mockResolvedValue({ data: { mudou: false, resolution: "ligada", entity_id: "ent-1", negocio_id: null }, error: null });
    await desenhar();
    fireEvent.click(botao(/^Ligar à pessoa/));
    confirmar();
    await waitFor(() => expect(screen.queryByText("Ana Ribeiro")).toBeNull());
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast.mock.calls[0][0].variant).toBeUndefined();
    expect(toast.mock.calls[0][0].title).toMatch(/já estava resolvido/i);
  });
});

describe("Envios de formulário: criar negócio", () => {
  it("sem negócio aberto chama a RPC uma vez, sem p_confirmar_negocio_aberto, e tira a linha", async () => {
    estado.rpc.mockResolvedValue({ data: { acao: "criar_negocio", mudou: true, negocio_id: "n1" }, error: null });
    await desenhar();
    fireEvent.click(botao(/^Criar negócio/));
    await waitFor(() => expect(estado.rpc).toHaveBeenCalledTimes(1));
    expect(rpcCalls()[0][1]).toEqual({ p_submission_id: "sub-1", p_action: "criar_negocio" });
    await waitFor(() => expect(screen.queryByText("Ana Ribeiro")).toBeNull());
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/negócio criado/i) }));
  });

  it("com negócio aberto a RPC pede confirmação: mostra «Já existe um negócio aberto» e a linha fica", async () => {
    estado.rpc.mockResolvedValueOnce({ data: { acao: "confirmar", motivo: "negocio_aberto", negocio_aberto_id: "n0", mudou: false }, error: null });
    await desenhar();
    fireEvent.click(botao(/^Criar negócio/));
    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText("Já existe um negócio aberto")).toBeInTheDocument();
    expect(screen.getByText("Ana Ribeiro")).toBeInTheDocument();
    expect(toast).not.toHaveBeenCalled();
  });

  it("confirmar o diálogo volta a chamar a RPC com p_confirmar_negocio_aberto=true", async () => {
    estado.rpc
      .mockResolvedValueOnce({ data: { acao: "confirmar", motivo: "negocio_aberto", negocio_aberto_id: "n0", mudou: false }, error: null })
      .mockResolvedValueOnce({ data: { acao: "criar_negocio", mudou: true, negocio_id: "n2" }, error: null });
    await desenhar();
    fireEvent.click(botao(/^Criar negócio/));
    await screen.findByRole("alertdialog");
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Criar negócio novo" }));
    await waitFor(() => expect(estado.rpc).toHaveBeenCalledTimes(2));
    expect(rpcCalls()[1][1]).toEqual({ p_submission_id: "sub-1", p_action: "criar_negocio", p_confirmar_negocio_aberto: true });
    await waitFor(() => expect(screen.queryByText("Ana Ribeiro")).toBeNull());
  });

  it("cancelar o diálogo do negócio aberto não volta a chamar a RPC", async () => {
    estado.rpc.mockResolvedValueOnce({ data: { acao: "confirmar", motivo: "negocio_aberto", negocio_aberto_id: "n0", mudou: false }, error: null });
    await desenhar();
    fireEvent.click(botao(/^Criar negócio/));
    await screen.findByRole("alertdialog");
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(estado.rpc).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Ana Ribeiro")).toBeInTheDocument();
  });
});

describe("Envios de formulário: erros traduzidos", () => {
  it.each([
    ["NG002", /reabra a abordagem.*Pessoas/i],
    ["NG029", /já não está disponível/i],
    ["NG003", /pessoa já não está disponível/i],
    ["42501", /não tem permissão/i],
    ["XX000", /não foi possível/i],
  ])("%s mostra a mensagem traduzida e a linha fica", async (code, texto) => {
    estado.rpc.mockResolvedValue({ data: null, error: { code, message: "mensagem crua da base" } });
    await desenhar();
    fireEvent.click(botao(/^Criar negócio/));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    const aviso = toast.mock.calls[0][0];
    expect(aviso.variant).toBe("destructive");
    expect(`${aviso.title} ${aviso.description ?? ""}`).toMatch(texto);
    expect(`${aviso.title} ${aviso.description ?? ""}`).not.toMatch(/mensagem crua/);
    expect(screen.getByText("Ana Ribeiro")).toBeInTheDocument();
  });

  it("NG029 volta a ler a fila (a submissão já não existe para quem a viu)", async () => {
    estado.rpc.mockResolvedValue({ data: null, error: { code: "NG029", message: "Submissão indisponível." } });
    await desenhar();
    const antes = estado.tabelasLidas.filter((t) => t === "form_submissions").length;
    fireEvent.click(botao(/^Criar negócio/));
    await waitFor(() => expect(toast).toHaveBeenCalled());
    await waitFor(() => expect(estado.tabelasLidas.filter((t) => t === "form_submissions").length).toBeGreaterThan(antes));
  });
});

describe("Envios de formulário: conflito entre duas pessoas", () => {
  it("mostra as duas candidatas; ligar à segunda envia p_entity_id dela; a da submissão não envia p_entity_id", async () => {
    await desenhar([CONFLITO]);
    expect(screen.getByText("Beatriz Campos")).toBeInTheDocument();
    fireEvent.click(botao(/Ligar a Beatriz Campos/));
    confirmar();
    await waitFor(() => expect(estado.rpc).toHaveBeenCalledTimes(1));
    expect(rpcCalls()[0][1]).toEqual({ p_submission_id: "sub-2", p_action: "ligar", p_entity_id: "ent-2" });
  });

  it("criar negócio para a candidata da submissão não envia p_entity_id", async () => {
    estado.rpc.mockResolvedValue({ data: { mudou: true }, error: null });
    await desenhar([CONFLITO]);
    fireEvent.click(botao(/Criar negócio para Ana Ribeiro/));
    await waitFor(() => expect(estado.rpc).toHaveBeenCalledTimes(1));
    expect(rpcCalls()[0][1]).toEqual({ p_submission_id: "sub-2", p_action: "criar_negocio" });
  });

  it("ignorar como duplicado continua disponível no conflito e nunca leva p_entity_id", async () => {
    await desenhar([CONFLITO]);
    fireEvent.click(botao(/^Ignorar como duplicado/));
    confirmar();
    await waitFor(() => expect(estado.rpc).toHaveBeenCalledTimes(1));
    expect(rpcCalls()[0][1]).toEqual({ p_submission_id: "sub-2", p_action: "ignorar" });
  });

  it("sem conflicting_entity_id (gravação falhou) lê o fallback _meta.dedup.conflito e mostra as duas candidatas", async () => {
    const semColuna = {
      ...SUBMISSAO, id: "sub-3", conflicting_entity_id: null,
      field_values: { ...SUBMISSAO.field_values, _meta: { dedup: { por: "conflito", conflito: "ent-2" } } },
    };
    await desenhar([semColuna]);
    expect(screen.getByText("Beatriz Campos")).toBeInTheDocument();
    fireEvent.click(botao(/Ligar a Beatriz Campos/));
    confirmar();
    await waitFor(() => expect(estado.rpc).toHaveBeenCalledTimes(1));
    expect(rpcCalls()[0][1]).toEqual({ p_submission_id: "sub-3", p_action: "ligar", p_entity_id: "ent-2" });
  });
});

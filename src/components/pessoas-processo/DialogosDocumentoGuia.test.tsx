// Os quatro diálogos dos passos de documento do guia: enviar a proposta, a resposta do cliente, criar o contrato e a assinatura. Os ecrãs que a app já
// tem (envio, motivos, contrato) e as gravações estão simulados; vê-se que cada diálogo os chama com o que o negócio tem e que fecha só quando grava.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { mutacoesFalsas } from "@/components/negocio-metas/costuraTestUtil";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";

const PERM = ["proposals.edit", "client_contracts.create", "client_contracts.edit"];
const h = vi.hoisted(() => ({
  aceitar: vi.fn(), recusar: vi.fn(), criarContrato: vi.fn(), finalizar: vi.fn(), toastOk: vi.fn(), toastErro: vi.fn(),
  contratoProps: { valor: null as null | Record<string, unknown> },
  linhas: {} as Record<string, unknown>,
  estado: { propostaErro: false, minutasErro: false },
  refazer: vi.fn(),
}));

vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/lib/toast", () => ({ toast: { success: (...a: unknown[]) => h.toastOk(...a), error: (...a: unknown[]) => h.toastErro(...a), info: vi.fn() } }));
vi.mock("@/utils/friendlyError", () => ({ getFriendlyErrorMessage: () => Promise.resolve("erro amigável") }));
vi.mock("@/lib/proposals/responderProposta", () => ({ aceitarProposta: (...a: unknown[]) => h.aceitar(...a), recusarProposta: (...a: unknown[]) => h.recusar(...a) }));
vi.mock("@/lib/contracts/criarContratoDaProposta", () => ({ criarContratoDaProposta: (...a: unknown[]) => h.criarContrato(...a) }));
vi.mock("@/hooks/pessoas/useAssinarContrato", () => ({ useAssinarContrato: () => (id: string, permissoes?: readonly string[]) => h.finalizar(id, permissoes) }));
vi.mock("@/hooks/pessoas/useDadosDoContrato", () => ({
  usePropostaParaContrato: () => ({ data: h.linhas.proposta, isSuccess: !h.estado.propostaErro, isError: h.estado.propostaErro, refetch: h.refazer }),
  useMinutasAtivas: () => ({ data: h.linhas.minutas, isError: h.estado.minutasErro, refetch: h.refazer }),
}));
vi.mock("@/components/proposals/SendProposalDialog", () => ({
  SendProposalDialog: ({ open, proposal, onSent, onOpenChange }: { open: boolean; proposal: { id: string; title: string; proposal_number: string | null; organization_id: string }; onSent: () => void; onOpenChange: (o: boolean) => void }) => (
    open ? <div role="dialog" aria-label="envio">{proposal.id}|{proposal.title}|{proposal.proposal_number}|{proposal.organization_id}<button type="button" onClick={onSent}>enviei</button><button type="button" onClick={() => onOpenChange(false)}>x</button></div> : null
  ),
}));
vi.mock("@/components/proposals/ProposalRejectReasonDialog", () => ({
  ProposalRejectReasonDialog: ({ open, organizationId, onConfirm }: { open: boolean; organizationId: string; onConfirm: (d: unknown) => Promise<void> }) => (
    open ? <div role="dialog" aria-label="motivos" data-org={organizationId}><button type="button" onClick={() => void onConfirm({ reasonId: "r1", code: "preco", label: "Preço", notes: null })}>confirmar motivo</button></div> : null
  ),
}));
vi.mock("@/components/contracts/ContractDetailDialog", () => ({
  ContractDetailDialog: (props: Record<string, unknown>) => {
    h.contratoProps.valor = props;
    const guardar = props.onSave as (d: unknown) => void;
    return (
      <div role="dialog" aria-label="contrato">
        <span>{(props.proposals as unknown[]).length} propostas, {(props.templates as unknown[]).length} minutas</span>
        <button type="button" onClick={() => guardar({ proposal_id: "p1", template_id: "t1", start_date: "2026-11-01", end_date: "2027-11-01", notes: "n", payment_terms: "30", prompt_values: { a: "b" } })}>guardar contrato</button>
        <button type="button" onClick={() => guardar({ proposal_id: "p1", template_id: "t1", start_date: "2026-11-01", end_date: "2026-10-01", notes: "", payment_terms: "" })}>guardar datas erradas</button>
      </div>
    );
  },
}));

import { AssinarContratoNoGuia, CriarContratoNoGuia, EnviarPropostaNoGuia, RespostaPropostaNoGuia } from "./DialogosDocumentoGuia";

beforeAll(prepararRadixNoJsdom);
beforeEach(() => {
  h.aceitar.mockReset().mockResolvedValue({ workflowFailed: false });
  h.recusar.mockReset().mockResolvedValue({ workflowFailed: false });
  h.criarContrato.mockReset().mockResolvedValue({ id: "c-novo", ligadoAoNegocio: true });
  h.finalizar.mockReset().mockResolvedValue(true);
  h.toastOk.mockReset();
  h.toastErro.mockReset();
  h.refazer.mockReset();
  h.estado.propostaErro = false;
  h.estado.minutasErro = false;
  h.linhas = { proposta: { id: "p1", title: "WC", _clientName: "Pedro", quotes: [{ total: 100 }] }, minutas: [{ id: "t1", name: "Minuta", body_html: "x" }] };
});
afterEach(cleanup);

describe("enviar a proposta", () => {
  it("abre o diálogo de envio da proposta e atualiza a ficha depois de enviar", () => {
    const mutacoes = mutacoesFalsas();
    const aoFechar = vi.fn();
    render(<EnviarPropostaNoGuia plano={{ passo: "enviarProposta", propostaId: "p1", titulo: "WC", numero: "P-1" }} organizationId="org-1" mutacoes={mutacoes} aoFechar={aoFechar} permissoes={PERM} />);
    expect(screen.getByRole("dialog", { name: "envio" })).toHaveTextContent("p1|WC|P-1|org-1");
    fireEvent.click(screen.getByRole("button", { name: "enviei" }));
    expect(mutacoes.refrescar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "x" }));
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });
});

describe("enviar a proposta sem proposals.edit", () => {
  it.each([[undefined], [["pessoas.edit"]]])("com as permissões %j não mostra o envio e fecha (a lista por conhecer também recusa)", (permissoes) => {
    const aoFechar = vi.fn();
    render(<EnviarPropostaNoGuia plano={{ passo: "enviarProposta", propostaId: "p1", titulo: "WC", numero: "P-1" }} organizationId="org-1" mutacoes={mutacoesFalsas()} aoFechar={aoFechar} permissoes={permissoes} />);
    expect(screen.queryByRole("dialog", { name: "envio" })).toBeNull();
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });
});

describe("a resposta do cliente", () => {
  const montar = () => {
    const mutacoes = mutacoesFalsas();
    const aoFechar = vi.fn();
    render(<RespostaPropostaNoGuia plano={{ passo: "registarRespostaCliente", propostaId: "p1", titulo: "WC", numero: "P-1" }} organizationId="org-1" mutacoes={mutacoes} aoFechar={aoFechar} permissoes={PERM} />);
    return { mutacoes, aoFechar };
  };

  it("«O cliente aceitou» aceita a proposta da organização, atualiza a ficha e fecha", async () => {
    const { mutacoes, aoFechar } = montar();
    expect(screen.getByRole("dialog", { name: "Resposta do cliente" })).toHaveTextContent("P-1");
    fireEvent.click(screen.getByRole("button", { name: "O cliente aceitou" }));
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
    expect(h.aceitar).toHaveBeenCalledWith({ propostaId: "p1", organizationId: "org-1", permissoes: PERM });
    expect(mutacoes.refrescar).toHaveBeenCalledTimes(1);
    expect(h.toastOk).toHaveBeenCalledWith("Proposta aceite.");
    expect(h.toastErro).not.toHaveBeenCalled();
  });

  it("«O cliente recusou» pede o motivo e só então recusa, com esse motivo", async () => {
    const { aoFechar } = montar();
    fireEvent.click(screen.getByRole("button", { name: "O cliente recusou" }));
    expect(h.recusar).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "motivos" })).toHaveAttribute("data-org", "org-1");
    fireEvent.click(screen.getByRole("button", { name: "confirmar motivo" }));
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
    expect(h.recusar).toHaveBeenCalledWith({ propostaId: "p1", organizationId: "org-1", motivo: { reasonId: "r1", code: "preco", label: "Preço", notes: null }, permissoes: PERM });
    expect(h.toastOk).toHaveBeenCalledWith("Proposta recusada.");
  });

  it("se a automação da etapa falhar diz-se, mas a resposta fica gravada e o diálogo fecha", async () => {
    h.aceitar.mockResolvedValue({ workflowFailed: true });
    const { aoFechar } = montar();
    fireEvent.click(screen.getByRole("button", { name: "O cliente aceitou" }));
    await waitFor(() => expect(aoFechar).toHaveBeenCalled());
    expect(h.toastErro).toHaveBeenCalledWith("A resposta ficou guardada, mas a automação da etapa falhou.");
  });

  it("um erro ao gravar diz-se com a causa, não atualiza a ficha e deixa o diálogo aberto para tentar de novo", async () => {
    h.aceitar.mockRejectedValue(new Error("Estágio 'Aceite' não encontrado"));
    const { mutacoes, aoFechar } = montar();
    fireEvent.click(screen.getByRole("button", { name: "O cliente aceitou" }));
    await waitFor(() => expect(h.toastErro).toHaveBeenCalled());
    expect(h.toastErro.mock.calls[0][0]).toContain("Estágio 'Aceite' não encontrado");
    expect(mutacoes.refrescar).not.toHaveBeenCalled();
    expect(aoFechar).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "O cliente aceitou" })).not.toBeDisabled();
  });
});

describe("a recusa que falha", () => {
  it("o diálogo do motivo fica aberto (o motivo escrito não se perde) e nada se fecha nem se atualiza", async () => {
    h.recusar.mockRejectedValue(new Error("A proposta não foi alterada"));
    const mutacoes = mutacoesFalsas();
    const aoFechar = vi.fn();
    render(<RespostaPropostaNoGuia plano={{ passo: "registarRespostaCliente", propostaId: "p1", titulo: "WC", numero: "P-1" }} organizationId="org-1" mutacoes={mutacoes} aoFechar={aoFechar} permissoes={PERM} />);
    fireEvent.click(screen.getByRole("button", { name: "O cliente recusou" }));
    fireEvent.click(screen.getByRole("button", { name: "confirmar motivo" }));
    await waitFor(() => expect(h.toastErro).toHaveBeenCalled());
    expect(screen.getByRole("dialog", { name: "motivos" })).toBeInTheDocument();
    expect(aoFechar).not.toHaveBeenCalled();
    expect(mutacoes.refrescar).not.toHaveBeenCalled();
  });
});

describe("criar o contrato", () => {
  const montar = (negocioId: string | null) => {
    const mutacoes = mutacoesFalsas();
    const aoFechar = vi.fn();
    render(<CriarContratoNoGuia plano={{ passo: "criarContrato", propostaId: "p1", negocioId }} negocioId="n1" organizationId="org-1" mutacoes={mutacoes} aoFechar={aoFechar} permissoes={PERM} />);
    return { mutacoes, aoFechar };
  };

  it("abre o diálogo de contratos com a proposta aceite e as minutas ativas, sem navegar", async () => {
    montar("n1");
    expect(await screen.findByText("1 propostas, 1 minutas")).toBeInTheDocument();
    expect(h.contratoProps.valor).toMatchObject({ isNew: true, presetProposalId: "p1", negocioLigado: { titulo: null }, contract: null });
    const props = h.contratoProps.valor as { getProposalName: (p: unknown) => string; getProposalTotal: (p: unknown) => number };
    const proposta = { id: "p1", title: "WC", _clientName: "Pedro", quotes: [{ total: 100 }, { total: 20 }] };
    expect(props.getProposalName(proposta)).toBe("WC - Pedro");
    expect(props.getProposalTotal(proposta)).toBe(120);
  });

  it("com o fecho v4 grava ligado ao negócio e não liga outra vez; atualiza a ficha e fecha", async () => {
    const { mutacoes, aoFechar } = montar("n1");
    fireEvent.click(await screen.findByRole("button", { name: "guardar contrato" }));
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
    expect(h.criarContrato).toHaveBeenCalledWith({
      propostaId: "p1", organizationId: "org-1", negocioId: "n1", templateId: "t1", startDate: "2026-11-01", endDate: "2027-11-01", notes: "n", paymentTerms: "30", promptValues: { a: "b" }, permissoes: PERM,
    });
    expect(mutacoes.ligar).not.toHaveBeenCalled();
    expect(mutacoes.refrescar).toHaveBeenCalledTimes(1);
    expect(h.toastOk).toHaveBeenCalledWith("Contrato criado.");
  });

  it("sem o fecho v4 o contrato nasce solto e liga-se ao negócio depois, na ficha", async () => {
    h.criarContrato.mockResolvedValue({ id: "c-novo", ligadoAoNegocio: false });
    const { mutacoes, aoFechar } = montar(null);
    fireEvent.click(await screen.findByRole("button", { name: "guardar contrato" }));
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
    expect(h.criarContrato).toHaveBeenCalledWith(expect.objectContaining({ negocioId: null }));
    expect(mutacoes.ligar).toHaveBeenCalledWith("n1", { tipo: "contrato", id: "c-novo" });
  });

  it("se a ligação falhar o contrato fica criado e diz-se que não ficou ligado", async () => {
    h.criarContrato.mockResolvedValue({ id: "c-novo", ligadoAoNegocio: false });
    const mutacoes = mutacoesFalsas({ ligar: vi.fn(async () => { throw new Error("falhou"); }) });
    const aoFechar = vi.fn();
    render(<CriarContratoNoGuia plano={{ passo: "criarContrato", propostaId: "p1", negocioId: null }} negocioId="n1" organizationId="org-1" mutacoes={mutacoes} aoFechar={aoFechar} permissoes={PERM} />);
    fireEvent.click(await screen.findByRole("button", { name: "guardar contrato" }));
    await waitFor(() => expect(aoFechar).toHaveBeenCalled());
    expect(h.toastErro.mock.calls[0][0]).toContain("O contrato foi criado, mas não ficou ligado ao negócio.");
    expect(mutacoes.refrescar).toHaveBeenCalled();
  });

  it("se a leitura da proposta falha mostra o erro (não um formulário vazio), deixa tentar de novo e fechar", () => {
    h.estado.propostaErro = true;
    const { aoFechar } = montar("n1");
    expect(screen.queryByRole("dialog", { name: "contrato" })).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível ler os dados para o contrato.");
    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(h.refazer).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it("se a leitura das minutas falha mostra o erro e não o formulário sem minutas", () => {
    h.estado.minutasErro = true;
    montar("n1");
    expect(screen.queryByRole("dialog", { name: "contrato" })).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível ler os dados para o contrato.");
  });

  it("uma proposta que já não existe na organização diz-se, em vez de abrir o formulário vazio", () => {
    h.linhas.proposta = null;
    montar("n1");
    expect(screen.queryByRole("dialog", { name: "contrato" })).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("A proposta já não está disponível.");
  });

  it("uma data de fim antes da de início não grava nada", async () => {
    const { aoFechar } = montar("n1");
    fireEvent.click(await screen.findByRole("button", { name: "guardar datas erradas" }));
    expect(h.criarContrato).not.toHaveBeenCalled();
    expect(h.toastErro).toHaveBeenCalledTimes(1);
    expect(aoFechar).not.toHaveBeenCalled();
  });

  it("um erro ao criar diz-se (traduzido) e o diálogo fica aberto", async () => {
    h.criarContrato.mockRejectedValue(new Error("boom"));
    const { mutacoes, aoFechar } = montar("n1");
    fireEvent.click(await screen.findByRole("button", { name: "guardar contrato" }));
    await waitFor(() => expect(h.toastErro).toHaveBeenCalled());
    expect(h.toastErro).toHaveBeenCalledWith("Não foi possível criar o contrato.", { description: "erro amigável" });
    expect(mutacoes.refrescar).not.toHaveBeenCalled();
    expect(aoFechar).not.toHaveBeenCalled();
  });
});

describe("a assinatura", () => {
  const montar = () => {
    const mutacoes = mutacoesFalsas();
    const aoFechar = vi.fn();
    render(<AssinarContratoNoGuia plano={{ passo: "registarAssinatura", contratoId: "c1", numero: "C-1" }} organizationId="org-1" mutacoes={mutacoes} aoFechar={aoFechar} permissoes={PERM} />);
    return { mutacoes, aoFechar };
  };

  it("avisa que o contacto passa a cliente e não assina até confirmar", () => {
    montar();
    expect(screen.getByRole("alertdialog")).toHaveTextContent("C-1");
    expect(screen.getByRole("alertdialog")).toHaveTextContent("passa a cliente");
    expect(h.finalizar).not.toHaveBeenCalled();
  });

  it("confirmar finaliza o contrato, atualiza a ficha e fecha", async () => {
    const { mutacoes, aoFechar } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar a assinatura" }));
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(1));
    expect(h.finalizar).toHaveBeenCalledWith("c1", PERM);
    expect(mutacoes.refrescar).toHaveBeenCalledTimes(1);
    expect(h.toastOk).toHaveBeenCalledWith("Contrato assinado.");
  });

  it("se a automação recusar (devolve false, já avisou) o diálogo fica aberto e nada se atualiza", async () => {
    h.finalizar.mockResolvedValue(false);
    const { mutacoes, aoFechar } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar a assinatura" }));
    await waitFor(() => expect(h.finalizar).toHaveBeenCalled());
    expect(aoFechar).not.toHaveBeenCalled();
    expect(mutacoes.refrescar).not.toHaveBeenCalled();
    expect(h.toastOk).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar a assinatura" })).not.toBeDisabled());
  });

  it("cancelar fecha sem assinar", () => {
    const { aoFechar } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(aoFechar).toHaveBeenCalledTimes(1);
    expect(h.finalizar).not.toHaveBeenCalled();
  });
});

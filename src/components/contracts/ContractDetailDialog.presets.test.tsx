// O `ContractDetailDialog` é partilhado com a Mudelar. A propriedade `presetProposalId` (a ficha da pessoa, P3) só muda o que um contrato NOVO
// traz escolhido: sem ela a proposta fica vazia e o botão de criar desativado, como sempre; com ela vem preenchida e um novo render não a repõe.
// Se a proposta pedida não está na lista (o filtro da página não a deixa passar), diz-se em vez de deixar o seletor vazio sem explicação.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { prepararRadixNoJsdom } from "@/test/radixJsdomTeste";

const estaveis = vi.hoisted(() => ({ empresa: { activeCompany: { id: "org-1" } } }));
vi.mock("@/hooks/useTranslation", async () => (await import("@/components/pessoas-lista/traducaoTeste")).moduloTraducao());
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => estaveis.empresa }));
vi.mock("@/lib/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => {
  const q: Record<string, unknown> = {};
  for (const f of ["select", "eq", "in", "is", "order", "neq"]) q[f] = () => q;
  q.maybeSingle = async () => ({ data: null, error: null });
  q.then = (ok: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
  return { supabase: { from: () => q } };
});
vi.mock("@/components/billing/PlanLimitWarning", () => ({ PlanLimitWarning: () => null }));
vi.mock("@/components/pipeline/PipelineBreadcrumb", () => ({ PipelineBreadcrumb: () => null }));
vi.mock("@/components/contracts/ContractBodyTab", () => ({ ContractBodyTab: () => null }));
vi.mock("@/components/shared/DocumentsTab", () => ({ DocumentsTab: () => null }));
vi.mock("@/components/common/MissingTemplateDialog", () => ({ MissingTemplateDialog: () => null }));

import { ContractDetailDialog } from "./ContractDetailDialog";

beforeAll(prepararRadixNoJsdom);
afterEach(cleanup);

type Proposta = { id: string; title: string };
const PROPOSTAS: Proposta[] = [{ id: "p1", title: "Proposta Um" }, { id: "p2", title: "Proposta Dois" }];

function Caso(p: { preset?: string | null; propostas?: Proposta[]; carregadas?: boolean; contrato?: object | null }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <ContractDetailDialog
        open onOpenChange={vi.fn()} contract={(p.contrato ?? null) as never} proposals={p.propostas ?? [...PROPOSTAS]} templates={[]} onSave={vi.fn()} saving={false}
        isNew={p.contrato === undefined || p.contrato === null} presetProposalId={p.preset} proposalsLoaded={p.carregadas}
        getProposalName={(x: Proposta) => x.title} getProposalTotal={() => 100} formatCurrency={(v) => String(v)} getTranslatedStatus={(s) => s}
      />
    </QueryClientProvider>
  );
}
const criar = () => screen.getByRole("button", { name: "Criar" });
const proposta = () => (document.querySelector("select") as HTMLSelectElement | null)?.value ?? "";

describe("ContractDetailDialog: contrato novo", () => {
  it("sem presetProposalId a proposta fica vazia e o botão de criar desativado (como sempre)", () => {
    render(<Caso />);
    expect(proposta()).toBe("");
    expect(criar()).toBeDisabled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("com presetProposalId a proposta vem preenchida e o botão de criar ativo", () => {
    render(<Caso preset="p2" />);
    expect(proposta()).toBe("p2");
    expect(criar()).toBeEnabled();
  });

  it("um novo render com os mesmos valores não repõe o que a pessoa escreveu nem a proposta", () => {
    const r = render(<Caso preset="p2" />);
    const pagamento = screen.getByPlaceholderText("Ex: 30 dias, transferência bancária");
    fireEvent.change(pagamento, { target: { value: "60 dias" } });
    r.rerender(<Caso preset="p2" propostas={[...PROPOSTAS]} />);
    expect(screen.getByPlaceholderText("Ex: 30 dias, transferência bancária")).toHaveValue("60 dias");
    expect(proposta()).toBe("p2");
  });
});

describe("ContractDetailDialog: a proposta pedida não está na lista", () => {
  it("diz-o, em texto visível, e o botão continua desativado", () => {
    render(<Caso preset="p9" />);
    expect(screen.getByRole("alert")).toHaveTextContent("A proposta do negócio não está disponível para criar contrato");
    expect(criar()).toBeDisabled();
  });

  it("enquanto a lista ainda carrega não se diz nada (seria um falso alarme)", () => {
    render(<Caso preset="p9" propostas={[]} carregadas={false} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("sem presetProposalId nunca se diz, mesmo com a lista vazia (a Mudelar não vê nada novo)", () => {
    render(<Caso propostas={[]} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("um contrato que já existe (edição) nunca diz isto", () => {
    render(<Caso preset="p9" contrato={{ id: "k1", proposal_id: "p1", contract_number: "C-1", status: "draft" }} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

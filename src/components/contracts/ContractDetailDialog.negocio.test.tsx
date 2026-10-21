// O `ContractDetailDialog` é partilhado com a Mudelar. A propriedade opcional `negocioLigado` (a ficha da pessoa, fecho v4) só acrescenta, a um
// contrato NOVO, uma linha a dizer a que negócio fica ligado; sem ela, ou ao editar um contrato que já existe, o diálogo é o de sempre.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
const PROPOSTAS: Proposta[] = [{ id: "p1", title: "Proposta Um" }];

function Caso(p: { negocioLigado?: { titulo: string | null } | null; contrato?: object | null }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <ContractDetailDialog
        open onOpenChange={vi.fn()} contract={(p.contrato ?? null) as never} proposals={PROPOSTAS} templates={[]} onSave={vi.fn()} saving={false}
        isNew={p.contrato === undefined || p.contrato === null} presetProposalId="p1" negocioLigado={p.negocioLigado}
        getProposalName={(x: Proposta) => x.title} getProposalTotal={() => 100} formatCurrency={(v) => String(v)} getTranslatedStatus={(s) => s}
      />
    </QueryClientProvider>
  );
}

describe("ContractDetailDialog: contrato novo dentro de um negócio", () => {
  it("diz a que negócio o contrato fica ligado", () => {
    render(<Caso negocioLigado={{ titulo: "Cozinha da Ana" }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Este contrato fica ligado ao negócio «Cozinha da Ana».");
  });

  it("sem título do negócio diz-o sem o nome", () => {
    render(<Caso negocioLigado={{ titulo: null }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Este contrato fica ligado ao negócio.");
  });

  it("sem negócio (a Mudelar e o resto da app) não aparece nada de novo", () => {
    render(<Caso />);
    expect(screen.queryByRole("status")).toBeNull();
    cleanup();
    render(<Caso negocioLigado={null} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("um contrato que já existe (edição) nunca o diz", () => {
    render(<Caso negocioLigado={{ titulo: "Cozinha da Ana" }} contrato={{ id: "k1", proposal_id: "p1", contract_number: "C-1", status: "draft" }} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

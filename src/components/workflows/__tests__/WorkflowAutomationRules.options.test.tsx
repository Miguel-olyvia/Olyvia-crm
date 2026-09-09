import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";

/**
 * Estes testes atravessam a UI a sério: abrem o formulário e abrem cada
 * <Select>, lendo as opções que o Radix renderiza no DOM. Não afirmam nada
 * sobre a constante em si — se alguém voltar a acrescentar `create`, `update`,
 * `update_field` ou `send_notification` à lista sem implementar o ramo
 * correspondente em `supabase/functions/execute-workflow`, estes testes falham.
 */

const { rpcMock, toastMock } = vi.hoisted(() => ({
  rpcMock: vi.fn(async () => ({ data: null, error: null })),
  toastMock: vi.fn(),
}));

const TABLE_ROWS: Record<string, unknown[]> = {
  workflow_automation_rules: [],
  lead_workflow_stages: [
    { id: "lead-lost", name: "lost", label: "Lead Perdida", color: "#ef4444" },
  ],
  proposal_workflow_stages: [
    {
      id: "prop-lost",
      name: "lost",
      label: "Proposta Perdida",
      color: "#ef4444",
      is_final: true,
      is_won: false,
      is_lost: true,
    },
  ],
};

vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.or = () => chain;
    chain.eq = () => chain;
    chain.order = () =>
      Promise.resolve({ data: TABLE_ROWS[table] ?? [], error: null });
    return chain;
  };
  return { supabase: { from, rpc: rpcMock } };
});

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: toastMock }) }));

import { WorkflowAutomationRules } from "../WorkflowAutomationRules";

const WORKFLOW_STAGES = [
  {
    id: "prop-lost",
    name: "lost",
    label: "Proposta Perdida",
    color: "#ef4444",
    is_final: true,
    is_won: false,
    is_lost: true,
  },
];

beforeAll(() => {
  // Radix Select assume APIs de layout/pointer que o jsdom não implementa.
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

beforeEach(() => {
  rpcMock.mockClear();
  toastMock.mockClear();
});

// Índices dos comboboxes por ordem no DOM, com o formulário aberto e o
// trigger_type no valor por omissão (stage_change).
const COMBOBOX = {
  triggerType: 0,
  triggerStage: 1,
  targetEntity: 2,
  actionType: 3,
  actionStage: 4,
} as const;

const MAX_OPTION_STEPS = 20;

function combobox(index: number): HTMLElement {
  return screen.getAllByRole("combobox")[index];
}

async function openSelect(index: number): Promise<HTMLElement> {
  fireEvent.keyDown(combobox(index), { key: "Enter" });
  return await screen.findByRole("listbox");
}

/** Abre o combobox pedido, devolve os textos das opções e volta a fechá-lo. */
async function readOptions(index: number): Promise<string[]> {
  const listbox = await openSelect(index);
  const labels = within(listbox)
    .getAllByRole("option")
    .map((option) => option.textContent?.trim() ?? "");
  fireEvent.keyDown(listbox, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  return labels;
}

/** Abre o combobox e escolhe a opção com o texto dado, via teclado. */
async function selectOption(index: number, label: string): Promise<void> {
  await openSelect(index);

  for (let step = 0; step < MAX_OPTION_STEPS; step += 1) {
    const active = document.activeElement;
    const isTargetOption =
      active?.getAttribute("role") === "option" &&
      active.textContent?.trim() === label;
    if (isTargetOption) break;
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" });
  }

  const active = document.activeElement as Element;
  expect(active.textContent?.trim()).toBe(label);
  fireEvent.keyDown(active, { key: "Enter" });
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
}

async function renderAndOpenForm(): Promise<void> {
  render(
    <WorkflowAutomationRules
      companyId="org-1"
      sourceEntity="proposal"
      workflowStages={WORKFLOW_STAGES}
    />
  );

  await waitFor(() =>
    expect(
      screen.getByText("Nenhuma regra de automação configurada")
    ).toBeInTheDocument()
  );

  fireEvent.click(screen.getAllByRole("button", { name: /Nova Regra/i })[0]);
  await screen.findByText("Nome da Regra *");
}

describe("WorkflowAutomationRules — opções oferecidas", () => {
  it("oferece apenas o trigger que o motor executa (stage_change)", async () => {
    await renderAndOpenForm();

    expect(await readOptions(COMBOBOX.triggerType)).toEqual([
      "Mudança de Fase",
    ]);
  });

  it("oferece apenas a acção que o motor executa (change_stage)", async () => {
    await renderAndOpenForm();

    expect(await readOptions(COMBOBOX.actionType)).toEqual(["Mudar Fase"]);
  });

  it("não oferece nenhuma das opções mortas em nenhum dos selects", async () => {
    await renderAndOpenForm();

    const opcoesMortas = [
      "Quando Criado",
      "Quando Atualizado",
      "Atualizar Campo",
      "Enviar Notificação",
    ];

    const oferecidas = [
      ...(await readOptions(COMBOBOX.triggerType)),
      ...(await readOptions(COMBOBOX.actionType)),
    ];

    for (const morta of opcoesMortas) {
      expect(oferecidas).not.toContain(morta);
    }
  });
});

describe("WorkflowAutomationRules — criar regra", () => {
  it("continua a guardar uma regra normal com stage_change → change_stage", async () => {
    await renderAndOpenForm();

    fireEvent.change(
      screen.getByPlaceholderText("Ex: Proposta Perdida → Lead Perdida"),
      { target: { value: "Proposta Perdida para Lead Perdida" } }
    );

    await selectOption(COMBOBOX.triggerStage, "Proposta Perdida");
    await selectOption(COMBOBOX.targetEntity, "Lead");

    // A fase de destino só aparece com action_type=change_stage.
    await waitFor(() =>
      expect(screen.getAllByRole("combobox").length).toBeGreaterThan(
        COMBOBOX.actionStage
      )
    );
    await selectOption(COMBOBOX.actionStage, "Lead Perdida");

    fireEvent.click(screen.getByRole("button", { name: "Criar Regra" }));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledTimes(1));

    const [fn, params] = rpcMock.mock.calls[0] as unknown as [
      string,
      Record<string, unknown>,
    ];
    expect(fn).toBe("rpc_save_lead_workflow_automation");
    expect(params).toMatchObject({
      p_id: null,
      p_name: "Proposta Perdida para Lead Perdida",
      p_source_entity: "proposal",
      p_trigger_type: "stage_change",
      p_trigger_stage_id: "prop-lost",
      p_target_entity: "lead",
      p_action_type: "change_stage",
      p_action_stage_id: "lead-lost",
      p_relationship_field: "lead_id",
    });
  });
});

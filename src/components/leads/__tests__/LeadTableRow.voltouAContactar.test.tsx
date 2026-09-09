/**
 * "Voltou a contactar" na linha da lista de Leads.
 *
 * Quando alguem que JA e lead volta a preencher o formulario publico, nao
 * nasce ficha nenhuma: a Edge Function create-lead carimba `last_activity_at`
 * na ficha que ja ca estava. A linha da lista tem de dizer isso ao comercial.
 *
 * O aviso significa exactamente "este cliente procurou-nos e ainda ninguem
 * respondeu", por isso CADUCA sozinho: so aparece enquanto o regresso for mais
 * recente do que o ultimo contacto registado.
 *
 * O que este teste fixa e o COMPORTAMENTO VISIVEL:
 *  1. lead com regresso e sem contacto nenhum -> o aviso aparece na celula do nome;
 *  2. lead sem `last_activity_at` -> nao aparece aviso nenhum;
 *  3. o aviso nunca contem a palavra "nova" — nao pode ser lido como ficha nova;
 *  4. contacto ANTERIOR ao regresso -> o aviso continua la;
 *  5. contacto POSTERIOR ao regresso -> o aviso desapareceu.
 *
 * `t` resolve as traducoes PORTUGUESAS REAIS (src/translations/index.ts). O
 * teste 3 so prova alguma coisa se comparar o texto que o utilizador ve; com
 * `(k) => k` estaria a comparar a chave 'leads.returnedContact', que nunca
 * contem "nova" e faria o teste passar sempre.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/components/PermissionGate", () => ({
  PermissionGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import React from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Table, TableBody } from "@/components/ui/table";
import { translations } from "@/translations";
import { LeadTableRow } from "../LeadTableRow";

const PT = translations.pt as unknown as Record<string, string>;

/** O texto que o comercial ve mesmo no ecra, em portugues. */
const AVISO_PT = PT["leads.returnedContact"];

/** Traducao real, para o teste falhar se a cadeia portuguesa mudar de sentido. */
const t = (key: string): string => PT[key] ?? key;

/** Casa contra o texto visivel do distintivo, sem depender da chave. */
const isAviso = (content: string): boolean => content.includes(AVISO_PT);

const NAME_COLUMN = {
  id: "name",
  key: "name",
  label: "Nome",
  visible: true,
  order: 3,
  isSystem: true,
};

function renderRow(lead: Record<string, unknown>) {
  const noop = () => {};
  return render(
    <TooltipProvider>
      <Table>
        <TableBody>
          <LeadTableRow
            lead={lead}
            isSelected={false}
            name="Maria Silva"
            phone={null}
            email=""
            campaignFilter="all"
            displayColumns={[]}
            visibleColumns={[NAME_COLUMN]}
            getStatusColor={() => ({})}
            getStatusLabel={() => "Novo"}
            getEffectiveStatus={() => "new"}
            getContactResultInfo={() => null}
            resolveFieldValue={() => ""}
            onSelect={noop}
            onViewDetails={noop}
            onContact={noop}
            onEdit={noop}
            onCreateDeal={noop}
            onConvertToClient={noop}
            onDuplicate={noop}
            onDelete={noop}
            onEmail={noop}
            onWhatsApp={noop}
            onReassignVisit={noop}
            t={t}
          />
        </TableBody>
      </Table>
    </TooltipProvider>,
  );
}

const BASE_LEAD = {
  id: "lead-1",
  created_at: "2026-09-01T10:00:00.000Z",
  field_values: {},
  status: "new",
};

const REGRESSO = "2026-09-03T10:00:00.000Z";

describe("LeadTableRow — aviso 'Voltou a contactar'", () => {
  it("a cadeia portuguesa esta mesmo definida (senao os testes seguintes nao provam nada)", () => {
    expect(typeof AVISO_PT).toBe("string");
    expect(AVISO_PT.length).toBeGreaterThan(0);
    expect(AVISO_PT).not.toBe("leads.returnedContact");
  });

  it("mostra o aviso quando a pessoa voltou a preencher o formulario", () => {
    renderRow({ ...BASE_LEAD, last_activity_at: REGRESSO });

    expect(screen.getByText(isAviso)).toBeTruthy();
    // Continua a ser a MESMA ficha: o nome esta la, uma so vez.
    expect(screen.getAllByText("Maria Silva")).toHaveLength(1);
  });

  it("nao mostra aviso nenhum quando a pessoa nunca voltou a contactar", () => {
    renderRow({ ...BASE_LEAD, last_activity_at: null });

    expect(screen.queryByText(isAviso)).toBeNull();
  });

  it("o aviso nao pode ser lido como ficha nova", () => {
    const { container } = renderRow({ ...BASE_LEAD, last_activity_at: REGRESSO });

    const aviso = screen.getByText(isAviso).textContent ?? "";
    expect(aviso.toLowerCase()).toContain(AVISO_PT.toLowerCase());
    expect(aviso.toLowerCase()).not.toMatch(/nov[ao]/);
    // e a linha continua a ser uma so.
    expect(container.querySelectorAll("tr")).toHaveLength(1);
  });
});

describe("LeadTableRow — o aviso caduca quando alguem atende", () => {
  it("mostra o aviso quando ainda ninguem contactou a pessoa", () => {
    renderRow({ ...BASE_LEAD, last_activity_at: REGRESSO, last_contact_at: null });

    expect(screen.getByText(isAviso)).toBeTruthy();
  });

  it("mostra o aviso quando o ultimo contacto e ANTERIOR ao regresso", () => {
    renderRow({
      ...BASE_LEAD,
      last_activity_at: REGRESSO,
      last_contact_at: "2026-09-02T09:00:00.000Z",
    });

    expect(screen.getByText(isAviso)).toBeTruthy();
  });

  it("NAO mostra o aviso quando o ultimo contacto e POSTERIOR ao regresso", () => {
    renderRow({
      ...BASE_LEAD,
      last_activity_at: REGRESSO,
      last_contact_at: "2026-09-04T09:00:00.000Z",
    });

    expect(screen.queryByText(isAviso)).toBeNull();
  });

  it("NAO mostra o aviso quando o contacto e no mesmo instante do regresso", () => {
    renderRow({ ...BASE_LEAD, last_activity_at: REGRESSO, last_contact_at: REGRESSO });

    expect(screen.queryByText(isAviso)).toBeNull();
  });

  it("compara instantes e nao textos: mesmo instante escrito noutro fuso nao reacende o aviso", () => {
    renderRow({
      ...BASE_LEAD,
      last_activity_at: REGRESSO, // 10:00 UTC
      last_contact_at: "2026-09-03T11:00:00+01:00", // o MESMO instante, outra cadeia
    });

    expect(screen.queryByText(isAviso)).toBeNull();
  });
});

// Os atalhos visíveis já não levam aos ecrãs antigos de Leads e Clientes: vão para /pessoas (ou /pipeline).
import { describe, expect, it } from "vitest";
import quickLinks from "@/components/home/QuickLinks.tsx?raw";
import welcome from "@/pages/WelcomeGuide.tsx?raw";
import agendaLabels from "@/components/atividades/agendaLabels.ts?raw";
import clientContracts from "@/pages/ClientContracts.tsx?raw";
import moradaFiscal from "@/components/quote/QuoteMoradaFiscal.tsx?raw";
import breadcrumb from "@/components/pipeline/PipelineBreadcrumb.tsx?raw";
import { getEntityHref } from "@/components/atividades/agendaLabels";

const FICHEIROS: Record<string, string> = { quickLinks, welcome, agendaLabels, clientContracts, moradaFiscal, breadcrumb };

describe("atalhos visíveis", () => {
  it.each(Object.entries(FICHEIROS))("%s não aponta para /leads nem /clients", (_nome, fonte) => {
    expect(fonte).not.toMatch(/["'`]\/(leads|clients)(["'`?/])/);
  });

  it("a ficha de uma lead ou de um cliente na agenda abre em /pessoas?open=", () => {
    const base = { id: "a", title: "t", status: "scheduled", start_datetime: "", end_datetime: "", itemType: null };
    expect(getEntityHref({ ...base, entity: { kind: "lead", id: "L 1", name: "x" } } as never)).toBe("/pessoas?open=L%201");
    expect(getEntityHref({ ...base, entity: { kind: "client", id: "C1", name: "x" } } as never)).toBe("/pessoas?open=C1");
  });
});

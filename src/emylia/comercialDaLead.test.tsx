// leads.assign no comercial da lead (/negocios, passo Chamada): neg_atribuir_pessoa só a pede quando a pessoa ainda não é cliente.
// A página real (NegociosEmylia) põe a resposta de usePodeAtribuirComercial com definirPodeAtribuirLead.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ComercialDaLead, definirGuardarDadosLead, definirPodeAtribuirLead } from "./DadosDaLead";
import type { Negocio } from "./motor";
import type { Ctx } from "./pecas";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

let desligar: (() => void) | null = null;
beforeEach(() => {
  definirPodeAtribuirLead({ pode: true, aLer: false });
  desligar = definirGuardarDadosLead(async () => "Inês Lopes", { fontes: [], comerciais: [{ id: "u1", name: "Catarina" }, { id: "u2", name: "Rui" }] });
});
afterEach(() => { cleanup(); desligar?.(); desligar = null; definirPodeAtribuirLead(null); });

const ctx = { run: (fn: () => void) => fn() } as unknown as Ctx;
const negocio = (cliente: boolean) => ({
  id: "n1", dadosLead: { entityId: "p1", primeiro: "Inês", apelido: "Lopes", empresa: "", notas: "", fonteId: "", fonte: "", campanha: "",
    comercialId: "u1", comercial: "Catarina", cliente, respostas: [], extra: {} },
}) as unknown as Negocio;
const seletor = () => screen.getByLabelText("Comercial");
const MOTIVO = "Mudar o comercial pede a permissão «Atribuir leads».";

describe("ComercialDaLead: leads.assign", () => {
  it("sem a permissão e a pessoa ainda não é cliente: fica fixo no atual e diz porquê", () => {
    definirPodeAtribuirLead({ pode: false, aLer: false });
    render(<ComercialDaLead ctx={ctx} d={negocio(false)} />);
    expect(seletor()).toBeDisabled();
    expect(seletor()).toHaveValue("u1");
    expect(screen.getByText(MOTIVO)).toBeInTheDocument();
  });

  it("sem a permissão mas a pessoa já é cliente: fica como estava (a função não a pede)", () => {
    definirPodeAtribuirLead({ pode: false, aLer: false });
    render(<ComercialDaLead ctx={ctx} d={negocio(true)} />);
    expect(seletor()).toBeEnabled();
    expect(screen.queryByText(MOTIVO)).toBeNull();
  });

  it("enquanto as permissões carregam fica desativado, sem o motivo", () => {
    definirPodeAtribuirLead({ pode: false, aLer: true });
    render(<ComercialDaLead ctx={ctx} d={negocio(false)} />);
    expect(seletor()).toBeDisabled();
    expect(screen.queryByText(MOTIVO)).toBeNull();
  });

  it("com a permissão fica tudo igual", () => {
    render(<ComercialDaLead ctx={ctx} d={negocio(false)} />);
    expect(seletor()).toBeEnabled();
    expect(screen.queryByText(MOTIVO)).toBeNull();
  });
});

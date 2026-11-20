import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveContractDocument } from "../contractDocument";
import { estadoFalso, reporEstadoFalso } from "./fakeSupabase";

vi.mock("@/integrations/supabase/client", async () => {
  const { makeFakeSupabase } = await import("./fakeSupabase");
  return { supabase: makeFakeSupabase() };
});

const ASSINADO = {
  id: "c-1",
  contract_number: "CC-1",
  total_value: 100,
  created_at: "2026-03-13T12:00:00.000Z",
  status: "signed",
  signature_date: "2026-08-06T20:15:00.000Z",
  signed_by_name: "Cliente Teste",
  contract_body_html: "<p>Corpo {{cliente_nome}}</p>",
};

const REMOTO = {
  anew_organizations: { name: "Org", entity_id: null, metadata: {}, phone: null },
  organization_document_settings: { organization_id: "o-1" },
};

beforeEach(() => reporEstadoFalso(REMOTO));

describe("resolveContractDocument: congelar ao ler só quando é pedido (por omissão, como sempre)", () => {
  it("por omissão, um contrato em vigor sem cópia congelada é congelado na primeira leitura", async () => {
    await resolveContractDocument({ ...ASSINADO }, "o-1", "Empresa");
    await Promise.resolve();
    await Promise.resolve();
    expect(estadoFalso.updates).toHaveLength(1);
    expect(estadoFalso.updates[0].table).toBe("client_contracts");
  });

  it("com naoCongelar (ecrãs só de leitura: pré-visualização e portal) não grava nada", async () => {
    const r = await resolveContractDocument({ ...ASSINADO }, "o-1", "Empresa", { naoCongelar: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(r?.bodyHtml).toContain("Corpo");
    expect(estadoFalso.updates).toHaveLength(0);
  });

  it("naoCongelar não muda o documento devolvido", async () => {
    const a = await resolveContractDocument({ ...ASSINADO }, "o-1", "Empresa");
    reporEstadoFalso(REMOTO);
    const b = await resolveContractDocument({ ...ASSINADO }, "o-1", "Empresa", { naoCongelar: true });
    expect(b?.bodyHtml).toBe(a?.bodyHtml);
    expect(b?.versoes).toEqual(a?.versoes);
  });
});

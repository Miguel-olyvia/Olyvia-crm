/**
 * Teste de paridade FE ↔ edge para os 6 aliases obrigatórios.
 * Replica a lógica do adapter Deno e compara com o resolver do frontend
 * usando o mesmo input fixture. Se algum alias divergir, a build falha.
 */

import { describe, it, expect } from "vitest";
import { replaceTemplateVariables as feReplace, type RenderContext } from "../index";

// Réplica mínima do adapter edge (não importável do supabase/functions em vitest).
const EDGE_RESOLVERS: Record<string, (c: RenderContext) => string> = {
  "client.name":        (c) => c.client.display_name,
  "client.email":       (c) => c.client.email,
  "company.name":       (c) => c.company.name,
  "commercial.name":    (c) => c.commercial.name,
  "proposal.title":     (c) => c.proposal?.title || "",
  "proposal.value":     (c) => c.proposal?.value || "",
  "proposal.publicUrl": (c) => c.proposal?.publicUrl || "",
};

const EDGE_ALIASES: Record<string, string> = {
  nome_cliente:    "client.name",
  nome_utilizador: "commercial.name",
  nome_empresa:    "company.name",
  titulo_proposta: "proposal.title",
  valor_proposta:  "proposal.value",
  link_proposta:   "proposal.publicUrl",
};

function edgeReplace(text: string, ctx: RenderContext): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (m, raw: string) => {
    const canonical = EDGE_ALIASES[raw] || raw;
    const fn = EDGE_RESOLVERS[canonical];
    return fn ? fn(ctx) : m;
  });
}

const ctx: RenderContext = {
  client:     { display_name: "Rui Bernardo", email: "rui@example.com", phone: "+351 912 000 000", vat: "509123456", address: "Rua A, 1, 1000-000 Lisboa" },
  company:    { name: "Olyvia Lda", vat: "PT500000000", email: "geral@olyvia.pt", phone: "+351 211 000 000", logo_url: null, address: "Rua B, 2, 2000-000 Porto" },
  commercial: { name: "João Silva", email: "joao@olyvia.pt", phone: "+351 933 000 000" },
  authUser:   { name: "Maria",      email: "maria@olyvia.pt", phone: "+351 944 000 000" },
  proposal:   { title: "Proposta Demo", value: "€3.590", publicUrl: "https://olyvia.lovable.app/p/abc" },
};

describe("Email aliases — paridade FE ↔ edge", () => {
  const aliases = ["nome_cliente", "nome_utilizador", "nome_empresa", "titulo_proposta", "valor_proposta", "link_proposta"];
  for (const alias of aliases) {
    it(`{{${alias}}} resolve igual em FE e edge`, () => {
      const text = `Olá {{${alias}}}!`;
      expect(feReplace(text, ctx)).toBe(edgeReplace(text, ctx));
      expect(feReplace(text, ctx)).not.toContain(`{{${alias}}}`);
    });
  }

  it("mantém placeholder desconhecido intacto em ambos", () => {
    const text = "Olá {{xpto_desconhecido}}";
    expect(feReplace(text, ctx)).toBe(edgeReplace(text, ctx));
    expect(feReplace(text, ctx)).toContain("{{xpto_desconhecido}}");
  });
});

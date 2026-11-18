// loadProposalPortalData devolve também os idiomas do documento, já decididos: a escolha passada por parâmetro;
// sem ela, o idioma do botão do portal se o template tiver essa versão; senão português. Supabase simulado.
import { beforeEach, describe, expect, it, vi } from "vitest";

const tabelas: Record<string, any> = {};

vi.mock("@/integrations/supabase/client", () => {
  const construtor = (tabela: string) => {
    const b: any = {};
    for (const m of ["select", "eq", "in", "not", "order"]) b[m] = () => b;
    b.maybeSingle = () => Promise.resolve({ data: tabelas[tabela] ?? null, error: null });
    b.then = (ok: any, err: any) => Promise.resolve({ data: tabelas[tabela] ?? [], error: null }).then(ok, err);
    return b;
  };
  return { supabase: { from: (t: string) => construtor(t), rpc: () => Promise.resolve({ data: null, error: null }) } };
});
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));

import { loadProposalPortalData } from "../proposalPortalData";

const COM_EN = { id: "t1", design_settings: { versions: { en: { terms_conditions: "Terms" } } } };

function proposta(template: unknown, extra: Record<string, unknown> = {}) {
  tabelas.proposals = { id: "p1", organization_id: null, template_snapshot: template, ...extra };
}

beforeEach(() => {
  for (const k of Object.keys(tabelas)) delete tabelas[k];
});

describe("loadProposalPortalData: idiomasDoDocumento", () => {
  it("sem opções: português, como sempre", async () => {
    proposta(COM_EN);
    const dados = await loadProposalPortalData("p1");
    expect(dados?.idiomasDoDocumento).toEqual(["pt"]);
    expect(dados?.template).toBe(COM_EN); // o template continua a ser o snapshot, tal e qual
  });

  it("idioma do portal com versão no template: esse idioma", async () => {
    proposta(COM_EN);
    expect((await loadProposalPortalData("p1", { idiomaDoPortal: "en" }))?.idiomasDoDocumento).toEqual(["en"]);
  });

  it("idioma do portal sem versão no template: português", async () => {
    proposta({ id: "t2", design_settings: {} });
    expect((await loadProposalPortalData("p1", { idiomaDoPortal: "en" }))?.idiomasDoDocumento).toEqual(["pt"]);
  });

  it("a escolha passada por parâmetro manda sobre o idioma do portal", async () => {
    proposta(COM_EN);
    const dados = await loadProposalPortalData("p1", { idiomas: ["pt", "en"], idiomaDoPortal: "pt" });
    expect(dados?.idiomasDoDocumento).toEqual(["pt", "en"]);
  });

  it("a escolha gravada na proposta (prompt_values.__idiomas) é lida pela porta única", async () => {
    proposta(COM_EN, { prompt_values: { __idiomas: "pt+en" } });
    expect((await loadProposalPortalData("p1", { idiomaDoPortal: "pt" }))?.idiomasDoDocumento).toEqual(["pt", "en"]);
  });

  it("proposta sem template: português", async () => {
    proposta(null);
    expect((await loadProposalPortalData("p1", { idiomaDoPortal: "en" }))?.idiomasDoDocumento).toEqual(["pt"]);
  });

  it("proposta que não existe: null, como sempre", async () => {
    expect(await loadProposalPortalData("p1")).toBeNull();
  });
});

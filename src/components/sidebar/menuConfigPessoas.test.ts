import { describe, expect, it } from "vitest";
import appSource from "@/App.tsx?raw";
import { translations } from "@/translations";
import { menuSections } from "./menuConfig";

const crm = menuSections.find((s) => s.id === "crm")!;
const item = (to: string) => crm.items.find((i) => i.to === to)!;

describe("menuConfig: o grupo CRM (Pessoas e Pipeline)", () => {
  it("tem Pessoas, Pipeline e a fila de submissões, e já não tem Leads nem Clientes", () => {
    expect(crm.items.map((i) => i.to)).toEqual(["/pessoas", "/pipeline", "/leads/pending-submissions"]);
  });

  it("Pessoas e Pipeline pedem pessoas.view e o interruptor da organização", () => {
    expect(item("/pessoas")).toMatchObject({ permission: "pessoas.view", requiresNegociosAtivos: true });
    expect(item("/pipeline")).toMatchObject({ permission: "pessoas.view", requiresNegociosAtivos: true, labelKey: "sidebar.pipeline" });
  });

  it("a fila de submissões fica como estava, sem o interruptor", () => {
    expect(item("/leads/pending-submissions")).toMatchObject({ permission: "platform.pending_submissions.view" });
    expect(item("/leads/pending-submissions").requiresNegociosAtivos).toBeUndefined();
  });

  it("os caminhos e as permissões do grupo seguem os itens", () => {
    expect(crm.paths).toEqual(expect.arrayContaining(["/pessoas", "/pipeline", "/leads/pending-submissions"]));
    expect(crm.paths).not.toContain("/leads");
    expect(crm.paths).not.toContain("/clients");
    expect(crm.permissions).toEqual(expect.arrayContaining(["pessoas.view", "platform.pending_submissions.view"]));
    expect(crm.permissions).not.toContain("leads.view");
    expect(crm.permissions).not.toContain("clients.view");
  });

  it("nenhum item fora do CRM usa o interruptor", () => {
    const outros = menuSections.filter((s) => s.id !== "crm")
      .flatMap((s) => [...s.items, ...(s.subSections?.flatMap((x) => x.items) ?? [])]);
    expect(outros.filter((i) => i.requiresNegociosAtivos)).toEqual([]);
  });

  it("sidebar.pipeline existe nas 5 línguas", () => {
    const linguas = Object.keys(translations);
    expect(linguas.length).toBe(5);
    for (const l of linguas) {
      expect((translations as Record<string, Record<string, string>>)[l]["sidebar.pipeline"], l).toBeTruthy();
    }
  });
});

describe("App.tsx: as rotas /pessoas e /pipeline", () => {
  const linhaDe = (p: string) => appSource.split(/\r?\n/).find((l) => l.includes(`path="${p}"`)) ?? "";
  const pessoas = linhaDe("/pessoas");
  const pipeline = linhaDe("/pipeline");

  it("/pessoas exige pessoas.view e passa pela guarda PessoasRota", () => {
    expect(pessoas).toMatch(/<ProtectedRoute permission="pessoas\.view"><PessoasRota><PessoasCrm \/><\/PessoasRota><\/ProtectedRoute>/);
  });

  it("/pipeline exige pessoas.view, passa pela PessoasRota e é lazy", () => {
    expect(pipeline).toMatch(/<ProtectedRoute permission="pessoas\.view"><PessoasRota><PessoasPipeline \/><\/PessoasRota><\/ProtectedRoute>/);
    expect(appSource).toMatch(/const PessoasPipeline = lazy\(/);
  });

  it("importa a PessoasRota", () => {
    expect(appSource).toMatch(/import\s+\{\s*PessoasRota\s*\}\s+from\s+["']@?[./a-z-]*pessoas-lista\/PessoasRota["']/);
  });

  it("já não importa os ecrãs antigos de Leads e Clientes", () => {
    expect(appSource).not.toMatch(/AnewLeads/);
    expect(appSource).not.toMatch(/AnewClients/);
  });

  it.each(["/leads", "/clients", "/anew-leads", "/anew-clients", "/anew-contacts", "/contacts"])("%s redireciona para /pessoas", (p) => {
    expect(linhaDe(p)).toContain("<RedirectPreservandoPesquisa />");
  });

  it("a fila de submissões pendentes continua com a sua permissão", () => {
    expect(linhaDe("/leads/pending-submissions")).toContain("platform.pending_submissions.view");
  });
});

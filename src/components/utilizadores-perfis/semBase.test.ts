// GUARDA: a página "Utilizadores e perfis" só fala com a base através dos wrappers em components/utilizadores-perfis/hooks/.
// Este teste lê o código fonte e falha se, fora desses wrappers, aparecer uma importação do Supabase ou do react-query,
// uma chamada a fetch, .rpc(, .from("tabela") ou functions.invoke, ou uma importação dos contextos e hooks reais.
//
// ALTERADO DE PROPÓSITO (27/10, ligar a página à base RH): até aqui a página era uma maquete com dados em memória e este
// teste proibia qualquer acesso à base. O pedido passou a ser uma página só, com a lógica das antigas /users e /roles
// ligada à base. A fronteira passou a ser «só os ficheiros dentro de utilizadores-perfis/hooks/ podem importar a base»
// (mesmo padrão de rh-exemplo/semBase.test.ts). As regras marcadas com `permitidoNosWrappers` deixam de se aplicar aí;
// fora de hooks/, a pasta, a página e as traduções continuam sem poder tocar na base. Acrescentou-se functions.invoke
// (as Edge Functions create-user, delete-user, etc.) à lista, que antes não estava.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(process.cwd(), "src");
const PASTAS = ["components/utilizadores-perfis"];
const FICHEIROS = ["pages/UtilizadoresPerfis.tsx", "translations/utilizadoresPerfis.ts", "translations/utilizadoresPerfisForm.ts"];

const proibido: { nome: string; padrao: RegExp; permitidoNosWrappers?: boolean }[] = [
  { nome: "importação de @/integrations/supabase", padrao: /from\s+["']@\/integrations\/supabase/, permitidoNosWrappers: true },
  { nome: "importação de @supabase/supabase-js", padrao: /from\s+["']@supabase\/supabase-js/ },
  { nome: "importação de @tanstack/react-query", padrao: /from\s+["']@tanstack\/react-query/, permitidoNosWrappers: true },
  { nome: "chamada a fetch(", padrao: /\bfetch\s*\(/ },
  { nome: "chamada a .rpc(", padrao: /\.rpc\s*\(/, permitidoNosWrappers: true },
  { nome: "chamada a .from(\"tabela\") do Supabase", padrao: /\.from\s*\(\s*["'`]/, permitidoNosWrappers: true },
  { nome: "chamada a functions.invoke", padrao: /functions\s*\.\s*invoke\s*\(/, permitidoNosWrappers: true },
  { nome: "importação de @/lib/nif ou @/lib/identity", padrao: /from\s+["']@\/lib\/(?:nif|identity)\//, permitidoNosWrappers: true },
  {
    nome: "importação dos contextos e hooks reais de permissões, organização e identidade",
    padrao: /from\s+["']@\/(?:hooks\/(?:usePermissions|usePermissionScope|useEntityIdentity)|contexts\/(?:CompanyContext|PermissionsContext))["']/,
    permitidoNosWrappers: true,
  },
];

/** Os wrappers: ficheiros dentro de components/utilizadores-perfis/hooks/. */
const ehWrapper = (f: string): boolean => relative(SRC, f).replace(/\\/g, "/").startsWith("components/utilizadores-perfis/hooks/");

const ehCodigo = (f: string): boolean => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f);

function ficheirosDe(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    return statSync(caminho).isDirectory() ? ficheirosDe(caminho) : ehCodigo(caminho) ? [caminho] : [];
  });
}

const analisados = [...PASTAS.flatMap((p) => ficheirosDe(join(SRC, p))), ...FICHEIROS.map((f) => join(SRC, f))];

describe("Utilizadores e perfis: só os wrappers de hooks/ falam com a base", () => {
  it("encontra os ficheiros a vigiar (o teste não passa por estar vazio)", () => {
    expect(analisados.length).toBeGreaterThan(15);
    expect(analisados.some((f) => f.endsWith("UtilizadoresPerfis.tsx"))).toBe(true);
  });

  it("existem wrappers em hooks/ e o teste distingue-os do resto", () => {
    const wrappers = analisados.filter(ehWrapper);
    expect(wrappers.length).toBeGreaterThan(0);
    expect(analisados.some((f) => !ehWrapper(f))).toBe(true);
    expect(ehWrapper(join(SRC, "pages/UtilizadoresPerfis.tsx"))).toBe(false);
  });

  it.each(proibido)("nenhum ficheiro fora dos wrappers tem $nome", ({ padrao, permitidoNosWrappers }) => {
    const culpados = analisados
      .filter((f) => !(permitidoNosWrappers && ehWrapper(f)))
      .filter((f) => padrao.test(readFileSync(f, "utf8")))
      .map((f) => relative(SRC, f).replace(/\\/g, "/"));
    expect(culpados).toEqual([]);
  });
});

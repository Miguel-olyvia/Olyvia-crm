// O exemplo de ligar a visita e o levantamento ao negócio vive só em memória: nenhum dos módulos tocados por esta peça importa o cliente da base
// (o diálogo da ficha real carrega-se à parte, por import dinâmico, e não conta). Falha se alguém o importar por engano.
import { describe, expect, it } from "vitest";

const FONTES = import.meta.glob(
  [
    "./usePessoasEstado.ts", "./RegistosLigadosNegocio.tsx", "./LinhaVisitaPessoa.tsx", "./SeccaoVisitas.tsx", "./AbaVisitasFicha.tsx",
    "./MarcarVisita.tsx", "./marcarVisitaContexto.ts", "./processo/ProcessoProvider.tsx",
    "../negocio-metas/registosPessoa.ts", "../negocio-metas/acoesRegistos.ts",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

/** Os módulos que um ficheiro importa ESTATICAMENTE (`import ... from "x"` e `export ... from "x"`), sem os `import("x")` dinâmicos. */
const importadosEstaticos = (codigo: string): string[] =>
  [...codigo.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/gms)].map((m) => m[1]);

const CLIENTE_DA_BASE = /(^|\/)integrations\/supabase\/client$|^@supabase\//;

describe("a ligação de visita e levantamento ao negócio não toca na base", () => {
  it("lê os ficheiros que devia ler", () => {
    expect(Object.keys(FONTES)).toHaveLength(10);
  });

  it.each(Object.entries(FONTES))("%s não importa o cliente da base", (ficheiro, codigo) => {
    expect(importadosEstaticos(codigo).filter((m) => CLIENTE_DA_BASE.test(m)), ficheiro).toEqual([]);
  });

  it("o detetor encontra um import estático, e ignora o dinâmico", () => {
    expect(importadosEstaticos('import { supabase } from "@/integrations/supabase/client";').some((m) => CLIENTE_DA_BASE.test(m))).toBe(true);
    expect(importadosEstaticos('const f = () => import("@/integrations/supabase/client");')).toEqual([]);
  });
});

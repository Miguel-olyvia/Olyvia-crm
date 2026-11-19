// Todas as chaves pc.* / sp.* / pt.* escritas no código dos portais existem nos dicionários, nas duas línguas.
// Tolerante: se ainda não há nenhuma chave no código, passa. Chaves construídas com template (`pc.estado.${x}`)
// não se veem por texto: quem as usa deve listá-las num teste da sua área.
import { describe, expect, it } from "vitest";
import { dicionarios } from "./dicionarios";

// Os ficheiros lidos como texto (sem node:fs): ClientPortal*.tsx, components/portal/*, SupplierPortal*.tsx,
// components/supplier-portal/*, os estados de contrato, lib/supplierPortal/*, ProposalPortal*.tsx e o modelo de
// catálogo do fornecedor, sem testes. Se um padrão não apanha nada, o objeto vem vazio e o teste passa.
const ficheiros = import.meta.glob(
  [
    "/src/pages/ClientPortal*.{ts,tsx}",
    "/src/components/portal/**/*.{ts,tsx}",
    "/src/pages/SupplierPortal*.{ts,tsx}",
    "/src/components/supplier-portal/**/*.{ts,tsx}",
    "/src/constants/contractStatus.ts",
    "/src/lib/supplierPortal/*.ts",
    "/src/components/proposals/ProposalPortal*.tsx",
    "/src/utils/supplierPortalCatalogTemplate.ts",
    "!/src/**/*.test.*",
    "!/src/**/*.spec.*",
    "!/src/**/__tests__/**",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

/** Literais de texto inteiros que são uma chave do portal: "pc.x.y", 'sp.x', `pt.sair`. */
function extrairChaves(codigo: string): string[] {
  return Array.from(codigo.matchAll(/(["'`])((?:pc|sp|pt)\.[A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)*)\1/g), (m) => m[2]);
}

describe("extrairChaves (o próprio detetor)", () => {
  it("apanha chamadas a t() e a tn() e chaves guardadas em objetos", () => {
    const codigo = `
      t("pc.inicio.titulo"); t('sp.pedidos.vazio', { n: 2 }); tn("pc.a.um", "pc.a.varios", n);
      const mapa = { draft: "pc.estado.draft" }; const x = t(\`pt.sair\`);
    `;
    expect(extrairChaves(codigo).sort()).toEqual(
      ["pc.a.um", "pc.a.varios", "pc.estado.draft", "pc.inicio.titulo", "pt.sair", "sp.pedidos.vazio"].sort(),
    );
  });

  it("ignora o que não é uma chave: identificadores, caminhos, templates e prefixos parciais", () => {
    const codigo = `
      import { pt } from "date-fns/locale"; format(d, "x", { locale: pt });
      const a = "application/pt.json"; const b = "pc."; const c = \`pc.estado.\${s}\`; const d = "sp";
      const e = "espt.x"; const f = "pc.com espaço";
    `;
    expect(extrairChaves(codigo)).toEqual([]);
  });
});

describe("o varrimento cobre os ficheiros fora das pastas dos portais", () => {
  const caminhos = Object.keys(ficheiros);

  it("estados de contrato, lib/supplierPortal, ProposalPortal*.tsx e o modelo de catálogo", () => {
    expect(caminhos).toEqual(
      expect.arrayContaining([
        "/src/constants/contractStatus.ts",
        "/src/lib/supplierPortal/spRpc.ts",
        "/src/lib/supplierPortal/supplierDataForm.ts",
        "/src/components/proposals/ProposalPortalDocument.tsx",
        "/src/utils/supplierPortalCatalogTemplate.ts",
      ]),
    );
  });

  it("R5: o detalhe do contrato usa o prefixo pc.contratoDet.* para assinado/anulado em (não pc.contratos.*)", () => {
    const chaves = extrairChaves(ficheiros["/src/pages/ClientPortalContractDetail.tsx"] ?? "");
    expect(chaves.filter((k) => k.startsWith("pc.contratos."))).toEqual([]);
    expect(chaves).toEqual(expect.arrayContaining(["pc.contratoDet.assinadoEm", "pc.contratoDet.anuladoEm"]));
    for (const k of ["pc.contratos.assinadoEm", "pc.contratos.anuladoEm"]) {
      expect(k in dicionarios.pt).toBe(false);
      expect(k in dicionarios.en).toBe(false);
    }
  });

  it("e apanha chaves lá dentro (os estados de contrato têm chaves pc.estado.contrato.*)", () => {
    const chaves = extrairChaves(ficheiros["/src/constants/contractStatus.ts"] ?? "");
    expect(chaves).toContain("pc.estado.contrato.aguardaDecisao");
  });
});

describe("chaves usadas no código dos portais", () => {
  const codigo = Object.values(ficheiros).join("\n");
  const usadas = Array.from(new Set(extrairChaves(codigo)));

  it("todas existem em pt e em en", () => {
    const faltam = usadas.filter((k) => !(k in dicionarios.pt) || !(k in dicionarios.en));
    expect(faltam).toEqual([]);
  });
});

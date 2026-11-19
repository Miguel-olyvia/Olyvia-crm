// Junta os dicionários do portal. Cada área tem o seu prefixo e os seus ficheiros (pt e en), para quem trabalha
// em paralelo não tocar nos mesmos ficheiros: comum `pt.*`, cliente `pc.*`, fornecedor `sp.*`.
// O teste `dicionarios.test.ts` garante paridade pt/en, marcadores iguais, prefixos respeitados e nenhuma chave repetida.
import { clienteEn } from "./clienteEn";
import { clientePt } from "./clientePt";
import { comumEn } from "./comumEn";
import { comumPt } from "./comumPt";
import { fornecedorEn } from "./fornecedorEn";
import { fornecedorPt } from "./fornecedorPt";
import type { PortalIdioma } from "../tipos";

export type Dicionario = Record<string, string>;

export interface AreaDeDicionario {
  prefixo: string;
  pt: Dicionario;
  en: Dicionario;
}

export const AREAS: Record<"comum" | "cliente" | "fornecedor", AreaDeDicionario> = {
  comum: { prefixo: "pt.", pt: comumPt, en: comumEn },
  cliente: { prefixo: "pc.", pt: clientePt, en: clienteEn },
  fornecedor: { prefixo: "sp.", pt: fornecedorPt, en: fornecedorEn },
};

export const dicionarios: Record<PortalIdioma, Dicionario> = {
  pt: { ...comumPt, ...clientePt, ...fornecedorPt },
  en: { ...comumEn, ...clienteEn, ...fornecedorEn },
};

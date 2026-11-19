// Joins the supplier portal texts that cover the catalogue, the company details and the contract: catalogue and
// item dialog (`sp.catalogo.*`), import and Excel file (`sp.importar.*`), "My details" and the form (`sp.perfil.*`,
// `sp.dados.*`), first access (`sp.primeiroAcesso.*`) and the contract (`sp.contrato.*`).
// The index fornecedorEn.ts only spreads this one.
import { fornecedorEnCatalogo } from "./fornecedorEn.catalogo";
import { fornecedorEnCatalogoArtigo } from "./fornecedorEn.catalogoArtigo";
import { fornecedorEnImportar } from "./fornecedorEn.importar";
import { fornecedorEnDados } from "./fornecedorEn.dados";
import { fornecedorEnPrimeiroAcesso } from "./fornecedorEn.primeiroAcesso";
import { fornecedorEnContrato } from "./fornecedorEn.contrato";

export const fornecedorEnCatalogoPerfilContrato: Record<string, string> = {
  ...fornecedorEnCatalogo,
  ...fornecedorEnCatalogoArtigo,
  ...fornecedorEnImportar,
  ...fornecedorEnDados,
  ...fornecedorEnPrimeiroAcesso,
  ...fornecedorEnContrato,
};

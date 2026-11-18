// Gathers the supplier portal texts for the catalogue and company details: catalogue and item dialog
// (`sp.catalogo.*`), import and Excel file (`sp.importar.*`), "My details" and the form (`sp.perfil.*`,
// `sp.dados.*`) and first access (`sp.primeiroAcesso.*`). The index fornecedorEn.ts only spreads this one.
import { fornecedorEnCatalogo } from "./fornecedorEn.catalogo";
import { fornecedorEnImportar } from "./fornecedorEn.importar";
import { fornecedorEnDados } from "./fornecedorEn.dados";
import { fornecedorEnPrimeiroAcesso } from "./fornecedorEn.primeiroAcesso";

export const fornecedorEnCatalogoEPerfil: Record<string, string> = {
  ...fornecedorEnCatalogo,
  ...fornecedorEnImportar,
  ...fornecedorEnDados,
  ...fornecedorEnPrimeiroAcesso,
};

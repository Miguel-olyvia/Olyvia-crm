// Supplier portal texts, in English (`sp.*` keys, one part per page: `sp.encomendas.*`, `sp.catalogo.*`...).
// Keep this file under 400 lines: put each new page/area in its own `fornecedorEn.<theme>.ts` exporting a
// `Record<string, string>` and spread it here. Every key must also exist in `fornecedorPt.ts` (and vice versa).
import { fornecedorEnLayout } from "./fornecedorEn.layout";
import { fornecedorEnInicio } from "./fornecedorEn.inicio";
import { fornecedorEnEncomendas } from "./fornecedorEn.encomendas";
import { fornecedorEnEncomendaDet } from "./fornecedorEn.encomendaDet";
import { fornecedorEnErro } from "./fornecedorEn.erro"; import { fornecedorEnCatalogoEPerfil } from "./fornecedorEn.catalogoEPerfil";

export const fornecedorEn: Record<string, string> = {
  ...fornecedorEnLayout, ...fornecedorEnInicio, ...fornecedorEnEncomendas, ...fornecedorEnEncomendaDet, ...fornecedorEnErro, ...fornecedorEnCatalogoEPerfil,

  // Layout
  "sp.layout.titulo": "Supplier Portal",
  "sp.layout.menu.inicio": "Home",
  "sp.layout.menu.encomendas": "Orders",
  "sp.layout.menu.catalogo": "Catalogue",
  "sp.layout.menu.perfil": "Profile",

  // Orders: supplier response status
  "sp.encomendas.estado.nova": "New",
  "sp.encomendas.estado.vista": "Viewed",
  "sp.encomendas.estado.confirmada": "Confirmed",

  // Plurals (use with tn)
  "sp.encomendas.porConfirmar.um": "{n} order to confirm",
  "sp.encomendas.porConfirmar.varios": "{n} orders to confirm",

  // Profile
  "sp.perfil.titulo": "Profile",

  // Catalogue
  "sp.catalogo.desde": "Since {data}",
};

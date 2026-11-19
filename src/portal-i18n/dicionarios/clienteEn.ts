// Customer portal texts, in English (`pc.*` keys, one part per page: `pc.inicio.*`, `pc.propostas.*`...).
// Keep this file under 400 lines: put each new page/area in its own `clienteEn.<theme>.ts` exporting a
// `Record<string, string>` and spread it here. Every key must also exist in `clientePt.ts` (and vice versa).
import { clienteEnNegocios } from "./clienteEn.negocios";
import { clienteEnInicio } from "./clienteEn.inicio";
import { clienteEnPropostaDet } from "./clienteEn.propostaDet";
import { clienteEnContratoDet } from "./clienteEn.contratoDet";
import { clienteEnDocProposta } from "./clienteEn.docProposta";
import { clienteEnDocObra } from "./clienteEn.docObra";
import { clienteEnDocNegocio } from "./clienteEn.docNegocio";
import { clienteEnNegocioPagina } from "./clienteEn.negocioPagina";
import { clienteEnLayout } from "./clienteEn.layout";
import { clienteEnEmpresas } from "./clienteEn.empresas";
import { clienteEnLogin } from "./clienteEn.login";
import { clienteEnDocumentos } from "./clienteEn.documentos";
import { clienteEnEstado } from "./clienteEn.estado";
export const clienteEn: Record<string, string> = {
  ...clienteEnLayout,
  ...clienteEnEmpresas,
  ...clienteEnLogin,
  ...clienteEnDocumentos,
  ...clienteEnEstado,
  ...clienteEnNegocios,
  ...clienteEnInicio,
  ...clienteEnPropostaDet,
  ...clienteEnContratoDet,
  ...clienteEnDocProposta,
  ...clienteEnDocObra,
  ...clienteEnDocNegocio,
  ...clienteEnNegocioPagina,
  // Layout
  "pc.layout.titulo": "Customer Portal",
  "pc.layout.menu.inicio": "Home",
  "pc.layout.menu.propostas": "Proposals",
  "pc.layout.menu.contratos": "Contracts",
  "pc.layout.menu.documentos": "Documents",

  // Documents
  "pc.documentos.titulo": "Documents",

  // Home
  "pc.inicio.saudacao": "Hello, {nome}!",
  "pc.inicio.validaAte": "Valid until {data}",

  // Plurals (use with tn)
  "pc.propostas.pendentes.um": "{n} pending proposal",
  "pc.propostas.pendentes.varios": "{n} pending proposals",
};

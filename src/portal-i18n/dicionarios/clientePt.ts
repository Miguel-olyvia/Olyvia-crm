// Textos do portal de CLIENTE, em português (chaves `pc.*`, uma parte por página: `pc.inicio.*`, `pc.propostas.*`...).
// Mantém este ficheiro abaixo das 400 linhas: cada página/área nova vai para o seu ficheiro,
// `clientePt.<tema>.ts` com `export const clientePtTema: Record<string, string> = {...}`, e junta-se aqui com
// `...clientePtTema`. Faz o mesmo em `clienteEn.ts` com `clienteEn.<tema>.ts` (o teste de paridade apanha o que faltar).
import { clientePtDocProposta } from "./clientePt.docProposta";

import { clientePtInicio } from "./clientePt.inicio";
import { clientePtPropostaDet } from "./clientePt.propostaDet";
import { clientePtContratoDet } from "./clientePt.contratoDet";
import { clientePtLayout } from "./clientePt.layout";
import { clientePtEmpresas } from "./clientePt.empresas";
import { clientePtLogin } from "./clientePt.login";
import { clientePtPropostas } from "./clientePt.propostas";
import { clientePtContratos } from "./clientePt.contratos";
import { clientePtDocumentos } from "./clientePt.documentos";
import { clientePtEstado } from "./clientePt.estado";
export const clientePt: Record<string, string> = {
  ...clientePtLayout,
  ...clientePtEmpresas,
  ...clientePtLogin,
  ...clientePtPropostas,
  ...clientePtContratos,
  ...clientePtDocumentos,
  ...clientePtEstado,
  ...clientePtInicio,
  ...clientePtPropostaDet,
  ...clientePtContratoDet,
  ...clientePtDocProposta,

  // Moldura
  "pc.layout.titulo": "Portal do Cliente",
  "pc.layout.menu.inicio": "Início",
  "pc.layout.menu.propostas": "Propostas",
  "pc.layout.menu.contratos": "Contratos",
  "pc.layout.menu.documentos": "Documentos",

  // Documentos
  "pc.documentos.titulo": "Documentos",

  // Início
  "pc.inicio.saudacao": "Olá, {nome}!",
  "pc.inicio.validaAte": "Válida até {data}",

  // Plurais (usar com tn)
  "pc.propostas.pendentes.um": "{n} proposta pendente",
  "pc.propostas.pendentes.varios": "{n} propostas pendentes",
};

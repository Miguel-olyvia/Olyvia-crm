// Textos do portal de FORNECEDOR, em português (chaves `sp.*`, uma parte por página: `sp.encomendas.*`, `sp.catalogo.*`...).
// Mantém este ficheiro abaixo das 400 linhas: cada página/área nova vai para o seu ficheiro,
// `fornecedorPt.<tema>.ts` com `export const fornecedorPtTema: Record<string, string> = {...}`, e junta-se aqui com
// `...fornecedorPtTema`. Faz o mesmo em `fornecedorEn.ts` (o teste de paridade apanha o que faltar).
import { fornecedorPtLayout } from "./fornecedorPt.layout";
import { fornecedorPtInicio } from "./fornecedorPt.inicio";
import { fornecedorPtEncomendas } from "./fornecedorPt.encomendas";
import { fornecedorPtEncomendaDet } from "./fornecedorPt.encomendaDet";
import { fornecedorPtErro } from "./fornecedorPt.erro"; import { fornecedorPtCatalogoEPerfil } from "./fornecedorPt.catalogoEPerfil";

export const fornecedorPt: Record<string, string> = {
  ...fornecedorPtLayout, ...fornecedorPtInicio, ...fornecedorPtEncomendas, ...fornecedorPtEncomendaDet, ...fornecedorPtErro, ...fornecedorPtCatalogoEPerfil,

  // Moldura
  "sp.layout.titulo": "Portal do Fornecedor",
  "sp.layout.menu.inicio": "Início",
  "sp.layout.menu.encomendas": "Encomendas",
  "sp.layout.menu.catalogo": "Catálogo",
  "sp.layout.menu.perfil": "Perfil",

  // Encomendas: estado da resposta do fornecedor
  "sp.encomendas.estado.nova": "Nova",
  "sp.encomendas.estado.vista": "Vista",
  "sp.encomendas.estado.confirmada": "Confirmada",

  // Plurais (usar com tn)
  "sp.encomendas.porConfirmar.um": "{n} encomenda por confirmar",
  "sp.encomendas.porConfirmar.varios": "{n} encomendas por confirmar",

  // Perfil
  "sp.perfil.titulo": "Perfil",

  // Catálogo
  "sp.catalogo.desde": "Desde {data}",
};

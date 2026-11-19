// Junta os textos do portal do fornecedor que cobrem o catálogo, os dados da empresa e o contrato: catálogo e
// diálogo de artigo (`sp.catalogo.*`), importação e ficheiro Excel (`sp.importar.*`), «Os meus dados» e o formulário
// (`sp.perfil.*`, `sp.dados.*`), o primeiro acesso (`sp.primeiroAcesso.*`) e o contrato (`sp.contrato.*`).
// O índice fornecedorPt.ts só faz spread deste.
import { fornecedorPtCatalogo } from "./fornecedorPt.catalogo";
import { fornecedorPtCatalogoArtigo } from "./fornecedorPt.catalogoArtigo";
import { fornecedorPtImportar } from "./fornecedorPt.importar";
import { fornecedorPtDados } from "./fornecedorPt.dados";
import { fornecedorPtPrimeiroAcesso } from "./fornecedorPt.primeiroAcesso";
import { fornecedorPtContrato } from "./fornecedorPt.contrato";

export const fornecedorPtCatalogoPerfilContrato: Record<string, string> = {
  ...fornecedorPtCatalogo,
  ...fornecedorPtCatalogoArtigo,
  ...fornecedorPtImportar,
  ...fornecedorPtDados,
  ...fornecedorPtPrimeiroAcesso,
  ...fornecedorPtContrato,
};

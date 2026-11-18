// Junta os textos do portal do fornecedor que cobrem o catálogo e os dados da empresa: catálogo e diálogo de artigo
// (`sp.catalogo.*`), importação e ficheiro Excel (`sp.importar.*`), «Os meus dados» e o formulário (`sp.perfil.*`,
// `sp.dados.*`) e o primeiro acesso (`sp.primeiroAcesso.*`). O índice fornecedorPt.ts só faz spread deste.
import { fornecedorPtCatalogo } from "./fornecedorPt.catalogo";
import { fornecedorPtImportar } from "./fornecedorPt.importar";
import { fornecedorPtDados } from "./fornecedorPt.dados";
import { fornecedorPtPrimeiroAcesso } from "./fornecedorPt.primeiroAcesso";

export const fornecedorPtCatalogoEPerfil: Record<string, string> = {
  ...fornecedorPtCatalogo,
  ...fornecedorPtImportar,
  ...fornecedorPtDados,
  ...fornecedorPtPrimeiroAcesso,
};

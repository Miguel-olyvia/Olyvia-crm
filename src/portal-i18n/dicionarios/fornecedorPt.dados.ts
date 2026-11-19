// Portal do fornecedor, português: «Os meus dados» (página SupplierPortalProfile), o formulário dos dados da empresa
// (SupplierDataForm) e as mensagens de validação (lib/supplierPortal/supplierDataForm.ts). Chaves `sp.perfil.*` e `sp.dados.*`.
// `sp.perfil.titulo` (o item de menu) vive em fornecedorPt.ts.
export const fornecedorPtDados: Record<string, string> = {
  // Página «Os meus dados»
  "sp.perfil.paginaTitulo": "Os meus dados",
  "sp.perfil.descricao": "Dados da sua empresa usados pelas empresas com que trabalha (encomendas, contactos e faturação).",
  "sp.perfil.cartaoTitulo": "Dados da empresa",
  "sp.perfil.confirmadoEm": "Dados confirmados em {data}",
  "sp.perfil.aCarregar": "A carregar os dados…",
  "sp.perfil.indisponivel": "Esta funcionalidade ainda não está disponível. Tente mais tarde.",
  "sp.perfil.tentarNovamente": "Tentar de novo",
  "sp.perfil.guardar": "Guardar",
  "sp.perfil.guardado": "Dados guardados",
  "sp.perfil.guardadoUma": "Os dados da sua empresa estão atualizados.",
  "sp.perfil.guardadoVarias": "Atualizados em {n} empresas.",

  // Formulário
  "sp.dados.form.empresaContacto": "Empresa e contacto",
  "sp.dados.form.nome": "Nome da empresa",
  "sp.dados.form.nif": "NIF",
  "sp.dados.form.nifNota": "Para alterar o NIF contacte a empresa.",
  "sp.dados.form.pessoaContacto": "Pessoa de contacto",
  "sp.dados.form.email": "Email",
  "sp.dados.form.emailExemplo": "geral@empresa.pt",
  "sp.dados.form.telefone": "Telefone",
  "sp.dados.form.telefoneCampo": "Número de telefone",
  "sp.dados.form.indicativo": "Indicativo do país",
  "sp.dados.form.pesquisarPais": "Pesquisar país...",
  "sp.dados.form.numeroCompleto": "Número completo",
  "sp.dados.form.moradaGrupo": "Morada",
  "sp.dados.form.morada": "Morada",
  "sp.dados.form.codigoPostal": "Código postal",
  "sp.dados.form.codigoPostalExemplo": "0000-000",
  "sp.dados.form.cidade": "Cidade",
  "sp.dados.form.pais": "País",
  "sp.dados.form.paisExemplo": "Portugal",
  "sp.dados.form.website": "Website",
  "sp.dados.form.websiteExemplo": "www.empresa.pt",
  "sp.dados.form.soLeitura": "Só o utilizador principal da conta pode alterar estes dados.",
  "sp.dados.form.varias": "Estes dados ficam atualizados em todas as empresas com que trabalha: {empresas}",
  "sp.dados.form.aGuardar": "A guardar…",

  // Avisos (toasts)
  "sp.dados.aviso.verifique": "Verifique os dados",
  "sp.dados.aviso.camposInvalidos": "Há campos inválidos.",
  "sp.dados.aviso.naoGuardou": "Não foi possível guardar",

  // Validação (uma por campo; o «Máximo» recebe o limite)
  "sp.dados.erro.nomeObrigatorio": "O nome da empresa é obrigatório.",
  "sp.dados.erro.emailInvalido": "Formato de email inválido.",
  "sp.dados.erro.telefoneInvalido": "O telefone só pode ter números, espaços e os sinais + ( ) - . /",
  "sp.dados.erro.codigoPostalInvalido": "Código postal inválido (formato 0000-000).",
  "sp.dados.erro.websiteInvalido": "Endereço do website inválido (ex.: www.empresa.pt).",
  "sp.dados.erro.demasiadoLongo": "Máximo de {max} caracteres.",
};

// Supplier portal, English: "My details" (SupplierPortalProfile page), the company details form (SupplierDataForm)
// and the validation messages (lib/supplierPortal/supplierDataForm.ts). Keys `sp.perfil.*` and `sp.dados.*`.
// `sp.perfil.titulo` (the menu item) lives in fornecedorEn.ts.
export const fornecedorEnDados: Record<string, string> = {
  // "My details" page
  "sp.perfil.paginaTitulo": "My details",
  "sp.perfil.descricao": "Your company details, used by the companies you work with (orders, contacts and invoicing).",
  "sp.perfil.cartaoTitulo": "Company details",
  "sp.perfil.confirmadoEm": "Details confirmed on {data}",
  "sp.perfil.aCarregar": "Loading your details…",
  "sp.perfil.indisponivel": "This feature is not available yet. Please try again later.",
  "sp.perfil.tentarNovamente": "Try again",
  "sp.perfil.guardar": "Save",
  "sp.perfil.guardado": "Details saved",
  "sp.perfil.guardadoUma": "Your company details are up to date.",
  "sp.perfil.guardadoVarias": "Updated for {n} companies.",

  // Form
  "sp.dados.form.empresaContacto": "Company and contact",
  "sp.dados.form.nome": "Company name",
  "sp.dados.form.nif": "Tax ID (NIF)",
  "sp.dados.form.nifNota": "To change your tax ID (NIF), contact the company you work with.",
  "sp.dados.form.pessoaContacto": "Contact person",
  "sp.dados.form.email": "Email",
  "sp.dados.form.emailExemplo": "info@company.com",
  "sp.dados.form.telefone": "Phone",
  "sp.dados.form.telefoneCampo": "Phone number",
  "sp.dados.form.indicativo": "Country code",
  "sp.dados.form.pesquisarPais": "Search country...",
  "sp.dados.form.numeroCompleto": "Full number",
  "sp.dados.form.moradaGrupo": "Address",
  "sp.dados.form.morada": "Address",
  "sp.dados.form.codigoPostal": "Postal code",
  "sp.dados.form.codigoPostalExemplo": "0000-000",
  "sp.dados.form.cidade": "City",
  "sp.dados.form.pais": "Country",
  "sp.dados.form.paisExemplo": "Portugal",
  "sp.dados.form.website": "Website",
  "sp.dados.form.websiteExemplo": "www.company.com",
  "sp.dados.form.soLeitura": "Only the account's main user can change this information.",
  "sp.dados.form.varias": "This information will be updated for every company you work with: {empresas}",
  "sp.dados.form.aGuardar": "Saving…",

  // Notices (toasts)
  "sp.dados.aviso.verifique": "Please check your details",
  "sp.dados.aviso.camposInvalidos": "Some fields are invalid.",
  "sp.dados.aviso.naoGuardou": "Could not save",

  // Validation (one per field; "Maximum" receives the limit)
  "sp.dados.erro.nomeObrigatorio": "The company name is required.",
  "sp.dados.erro.emailInvalido": "Invalid email format.",
  "sp.dados.erro.telefoneInvalido": "The phone number can only contain digits, spaces and the characters + ( ) - . /",
  "sp.dados.erro.codigoPostalInvalido": "Invalid postal code (format 0000-000).",
  "sp.dados.erro.websiteInvalido": "Invalid website address (e.g. www.company.com).",
  "sp.dados.erro.demasiadoLongo": "Maximum {max} characters.",
};

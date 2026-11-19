// Supplier portal, English: first access, i.e. setting the password (SupplierFirstLoginModal) and the
// "Confirm your details" step (SupplierConfirmDataModal). Keys `sp.primeiroAcesso.*`.
export const fornecedorEnPrimeiroAcesso: Record<string, string> = {
  // Set the password
  "sp.primeiroAcesso.password.titulo": "Set your password",
  "sp.primeiroAcesso.password.descricao": "For your security, set a personal password before continuing to the Supplier Portal.",
  "sp.primeiroAcesso.password.nova": "New password",
  "sp.primeiroAcesso.password.novaDica": "At least 8 characters",
  "sp.primeiroAcesso.password.confirmar": "Confirm password",
  "sp.primeiroAcesso.password.confirmarDica": "Repeat the password",
  "sp.primeiroAcesso.password.mostrar": "Show password",
  "sp.primeiroAcesso.password.esconder": "Hide password",
  "sp.primeiroAcesso.password.definir": "Set password and sign in",
  "sp.primeiroAcesso.password.aGuardar": "Saving...",
  "sp.primeiroAcesso.password.sair": "Sign out",

  // Local validation (same rules and same order as the schema shared with the CRM)
  "sp.primeiroAcesso.erro.titulo": "Error",
  "sp.primeiroAcesso.erro.minimo": "The password must be at least 8 characters long.",
  "sp.primeiroAcesso.erro.confirmar": "Please confirm the password.",
  "sp.primeiroAcesso.erro.diferentes": "The passwords do not match.",

  // Outcome
  "sp.primeiroAcesso.aviso.definida": "Password set",
  "sp.primeiroAcesso.aviso.definidaDescricao": "Your password is now active.",
  "sp.primeiroAcesso.aviso.falhou": "Could not set the password",
  "sp.primeiroAcesso.aviso.falhouDescricao": "Please try again in a moment.",

  // Confirm the company details
  "sp.primeiroAcesso.confirmar.titulo": "Confirm your details",
  "sp.primeiroAcesso.confirmar.descricao": "Review your company details and correct anything that is wrong. The companies you work with will use these details on their orders.",
  "sp.primeiroAcesso.confirmar.aCarregar": "Loading your details…",
  "sp.primeiroAcesso.confirmar.tentarNovamente": "Try again",
  "sp.primeiroAcesso.confirmar.botao": "Confirm details",
  "sp.primeiroAcesso.confirmar.confirmados": "Details confirmed",
  "sp.primeiroAcesso.confirmar.confirmadosDescricao": "Thank you. Your company details are up to date.",
  "sp.primeiroAcesso.confirmar.sair": "Sign out",
  "sp.primeiroAcesso.confirmar.telemovel": "Your mobile phone",
  "sp.primeiroAcesso.confirmar.telemovelDica": "It identifies you on your account. This is the number we send the SMS code to when you sign a contract.",
};

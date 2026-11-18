// Portal do fornecedor, português: primeiro acesso, ou seja, definir a password (SupplierFirstLoginModal) e o passo
// «Confirme os seus dados» (SupplierConfirmDataModal). Chaves `sp.primeiroAcesso.*`.
export const fornecedorPtPrimeiroAcesso: Record<string, string> = {
  // Definir a password
  "sp.primeiroAcesso.password.titulo": "Defina a sua password",
  "sp.primeiroAcesso.password.descricao": "Por segurança, defina uma password pessoal antes de continuar no Portal do Fornecedor.",
  "sp.primeiroAcesso.password.nova": "Nova password",
  "sp.primeiroAcesso.password.novaDica": "Mínimo 8 caracteres",
  "sp.primeiroAcesso.password.confirmar": "Confirmar password",
  "sp.primeiroAcesso.password.confirmarDica": "Repita a password",
  "sp.primeiroAcesso.password.mostrar": "Mostrar password",
  "sp.primeiroAcesso.password.esconder": "Esconder password",
  "sp.primeiroAcesso.password.definir": "Definir password e entrar",
  "sp.primeiroAcesso.password.aGuardar": "A guardar...",
  "sp.primeiroAcesso.password.sair": "Sair",

  // Validação local (as mesmas regras e a mesma ordem do esquema partilhado com o CRM)
  "sp.primeiroAcesso.erro.titulo": "Erro",
  "sp.primeiroAcesso.erro.minimo": "A password deve ter no mínimo 8 caracteres.",
  "sp.primeiroAcesso.erro.confirmar": "Confirme a password.",
  "sp.primeiroAcesso.erro.diferentes": "As passwords não coincidem.",

  // Resultado
  "sp.primeiroAcesso.aviso.definida": "Password definida",
  "sp.primeiroAcesso.aviso.definidaDescricao": "A sua password está ativa.",
  "sp.primeiroAcesso.aviso.falhou": "Não foi possível definir a password",
  "sp.primeiroAcesso.aviso.falhouDescricao": "Tente novamente dentro de instantes.",

  // Confirmar os dados da empresa
  "sp.primeiroAcesso.confirmar.titulo": "Confirme os seus dados",
  "sp.primeiroAcesso.confirmar.descricao": "Reveja os dados da sua empresa e corrija o que for preciso. As empresas com que trabalha passam a usar estes dados nas encomendas.",
  "sp.primeiroAcesso.confirmar.aCarregar": "A carregar os dados…",
  "sp.primeiroAcesso.confirmar.tentarNovamente": "Tentar de novo",
  "sp.primeiroAcesso.confirmar.botao": "Confirmar dados",
  "sp.primeiroAcesso.confirmar.confirmados": "Dados confirmados",
  "sp.primeiroAcesso.confirmar.confirmadosDescricao": "Obrigado. Os dados da sua empresa estão atualizados.",
  "sp.primeiroAcesso.confirmar.sair": "Sair",
};

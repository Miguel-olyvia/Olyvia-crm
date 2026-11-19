// Modal de primeiro acesso (mudança da palavra-passe temporária), em português: chaves `pc.login.*`.
// As três mensagens `pc.login.erro.minimo|confirmar|naoCoincidem` correspondem às do passwordResetSchema
// (src/lib/validations.ts, partilhado com o CRM), que não se altera: o modal mapeia-as por chave.
export const clientePtLogin: Record<string, string> = {
  "pc.login.titulo": "Bem-vindo ao Portal!",
  "pc.login.descricao": "Por segurança, altere a sua password temporária antes de continuar.",
  "pc.login.novaPassword": "Nova password",
  "pc.login.novaPlaceholder": "Mínimo 8 caracteres",
  "pc.login.mostrarPassword": "Mostrar password",
  "pc.login.esconderPassword": "Esconder password",
  "pc.login.confirmarPassword": "Confirmar password",
  "pc.login.confirmarPlaceholder": "Repita a password",
  "pc.login.submeter": "Alterar password e entrar",
  "pc.login.aAlterar": "A alterar...",
  "pc.login.sucesso.titulo": "Password alterada com sucesso",
  "pc.login.sucesso.descricao": "A sua nova password está ativa.",
  "pc.login.erro.titulo": "Erro",
  "pc.login.erro.alterar": "Erro ao alterar password",
  "pc.login.erro.minimo": "A password deve ter no mínimo 8 caracteres.",
  "pc.login.erro.confirmar": "Confirme a password.",
  "pc.login.erro.naoCoincidem": "As passwords não coincidem.",
  "pc.login.erro.invalido": "Dados inválidos.",
};

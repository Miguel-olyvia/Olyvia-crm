// Textos das ações da ficha de utilizadores e de roles que mudam dados em memória (pt e en): eliminar uma role e pedir a
// reposição da palavra-passe. Juntam-se aos de `utilizadoresPerfis.ts`.
export const acoesPt: Record<string, string> = {
  'usersProfiles.roles.inUseNote': 'Esta role tem utilizadores. Passe-os para outra role antes de a eliminar.',
  'usersProfiles.roles.deleteConfirm.title': 'Eliminar a role {name}?',
  'usersProfiles.roles.deleteConfirm.text': 'A role deixa de existir. Só exemplo: a mudança fica em memória e perde-se ao recarregar a página.',
  'usersProfiles.roles.deleteConfirm.yes': 'Eliminar',
  'usersProfiles.roles.deleteConfirm.done': '{name} eliminada (exemplo)',
  'usersProfiles.form.confirm.resetPassword.title': 'Repor a palavra-passe de {name}?',
  'usersProfiles.form.confirm.resetPassword.text': 'O pedido fica registado na atividade do utilizador. Só exemplo: não é enviado nenhum email.',
  'usersProfiles.form.confirm.resetPassword.yes': 'Pedir reposição',
  'usersProfiles.form.toast.resetPassword': 'Reposição pedida para {name} (exemplo, nenhum email enviado)',
  'usersProfiles.form.announce.resetPassword': 'Foi registado o pedido de reposição da palavra-passe de {name}.',
};

export const acoesEn: Record<string, string> = {
  'usersProfiles.roles.inUseNote': 'This role has users. Move them to another role before deleting it.',
  'usersProfiles.roles.deleteConfirm.title': 'Delete the role {name}?',
  'usersProfiles.roles.deleteConfirm.text': 'The role stops existing. Sample only: the change is kept in memory and lost when the page reloads.',
  'usersProfiles.roles.deleteConfirm.yes': 'Delete',
  'usersProfiles.roles.deleteConfirm.done': '{name} deleted (sample)',
  'usersProfiles.form.confirm.resetPassword.title': 'Reset the password of {name}?',
  'usersProfiles.form.confirm.resetPassword.text': 'The request is logged in the user activity. Sample only: no email is sent.',
  'usersProfiles.form.confirm.resetPassword.yes': 'Request reset',
  'usersProfiles.form.toast.resetPassword': 'Reset requested for {name} (sample, no email sent)',
  'usersProfiles.form.announce.resetPassword': 'The password reset request for {name} was logged.',
};

// Textos do separador Utilizadores (e do Portal) depois de ligado à base: o que já não é «exemplo», a atividade real, e os
// estados de carga, erro e sem organização. Juntado em `utilizadoresPerfis.ts` DEPOIS dos outros módulos, por isso as chaves
// repetidas aqui substituem as antigas (que diziam «exemplo» e «só em memória»).
const F = "usersProfiles.form.";
const A = "usersProfiles.activity.";

export const utilizadoresReaisEn: Record<string, string> = {
  [`${F}user.created`]: 'User created',
  [`${F}user.saved`]: 'User saved',
  [`${F}user.announce.created`]: 'User {name} created. The list was updated.',
  [`${F}confirm.deactivate.text`]: 'The user loses access (the login is revoked) and becomes inactive. You can reactivate them later.',
  [`${F}confirm.reactivate.text`]: 'The login is restored and the user becomes active again.',
  [`${F}toast.deactivated`]: '{name} deactivated',
  [`${F}toast.reactivated`]: '{name} reactivated',
  [`${F}toast.roleChanged`]: '{name} is now {role} in {org}',
  [`${F}announce.roleChanged`]: '{name} is now {role} in {org}.',
  [`${F}links.scopeAfterCreate`]: 'Scopes are set after the user is created.',
  [`${F}user.saving`]: 'Saving...',
  [`${F}user.saveError`]: 'Could not save: {message}',
  [`${A}created`]: 'Created',
  [`${A}statusChanged`]: 'Status changed from {from} to {to}',
  [`${A}updated`]: 'Changed {field}: {from} to {to}',
  [`${A}other`]: 'Changed',
  [`${A}empty`]: 'empty',
  [`${A}loading`]: 'Loading the activity...',
  [`${A}noPermission`]: 'You do not have permission to see the activity of this user.',
  [`${A}error`]: 'Could not load the activity: {message}',
  'usersProfiles.loading': 'Loading users...',
  'usersProfiles.loadError': 'Could not load the users: {message}',
  'usersProfiles.retry': 'Try again',
  'usersProfiles.noOrganization': 'Choose an active organization to see its users.',
};

export const utilizadoresReaisPt: Record<string, string> = {
  [`${F}user.created`]: 'Utilizador criado',
  [`${F}user.saved`]: 'Utilizador guardado',
  [`${F}user.announce.created`]: 'Utilizador {name} criado. A lista foi atualizada.',
  [`${F}confirm.deactivate.text`]: 'O utilizador perde o acesso (o login é revogado) e fica inativo. Pode reativá-lo mais tarde.',
  [`${F}confirm.reactivate.text`]: 'O login é reposto e o utilizador volta a ficar ativo.',
  [`${F}toast.deactivated`]: '{name} desativado',
  [`${F}toast.reactivated`]: '{name} reativado',
  [`${F}toast.roleChanged`]: '{name} passou a {role} em {org}',
  [`${F}announce.roleChanged`]: '{name} passou a {role} em {org}.',
  [`${F}links.scopeAfterCreate`]: 'Os âmbitos definem-se depois de o utilizador ser criado.',
  [`${F}user.saving`]: 'A guardar...',
  [`${F}user.saveError`]: 'Não foi possível guardar: {message}',
  [`${A}created`]: 'Criado',
  [`${A}statusChanged`]: 'Estado mudou de {from} para {to}',
  [`${A}updated`]: 'Alterou {field}: {from} para {to}',
  [`${A}other`]: 'Alteração',
  [`${A}empty`]: 'vazio',
  [`${A}loading`]: 'A carregar a atividade...',
  [`${A}noPermission`]: 'Não tem permissão para ver a atividade deste utilizador.',
  [`${A}error`]: 'Não foi possível carregar a atividade: {message}',
  'usersProfiles.loading': 'A carregar utilizadores...',
  'usersProfiles.loadError': 'Não foi possível carregar os utilizadores: {message}',
  'usersProfiles.retry': 'Tentar de novo',
  'usersProfiles.noOrganization': 'Escolha uma organização ativa para ver os utilizadores.',
};

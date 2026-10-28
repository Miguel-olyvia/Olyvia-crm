import type { Ambito } from "./tipos";

export function textoAmbito(t: (k: string) => string, a: Ambito): string {
  return t(`usersProfiles.scope.${a}`);
}
// O «último acesso» saiu: a base não o guarda por utilizador (anew_users não tem essa coluna), e mostrar «nunca entrou» seria dizer o que não se sabe.

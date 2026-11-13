// A Edge create-user, quando a pessoa já existia (outra organização), só associa à organização e responde com
// `existing_auth_user: true`, `ficha_alterada: false` e uma `message` para o ecrã. Devolve essa mensagem, ou
// undefined se foi uma criação normal.
export function avisoContaExistente(dados: unknown): string | undefined {
  if (!dados || typeof dados !== "object") return undefined;
  const d = dados as { existing_auth_user?: unknown; ficha_alterada?: unknown; message?: unknown };
  if (d.existing_auth_user !== true || d.ficha_alterada !== false) return undefined;
  return typeof d.message === "string" && d.message ? d.message : undefined;
}

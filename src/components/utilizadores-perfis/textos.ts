import { diasDesde } from "./logica";
import type { Ambito } from "./tipos";
import { HOJE_EXEMPLO } from "./utilizadoresExemplo";

export function textoAmbito(t: (k: string) => string, a: Ambito): string {
  return t(`usersProfiles.scope.${a}`);
}

/** "hoje", "ontem", "há N dias" ou "nunca entrou". */
export function textoAcesso(t: (k: string, p?: Record<string, number>) => string, iso: string | null): string {
  const dias = diasDesde(iso, HOJE_EXEMPLO);
  if (dias === null) return t("usersProfiles.access.never");
  if (dias === 0) return t("usersProfiles.access.today");
  if (dias === 1) return t("usersProfiles.access.yesterday");
  return t("usersProfiles.access.days", { n: dias });
}

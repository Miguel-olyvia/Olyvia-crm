// A função perm() do mockup: um botão sem a permissão fica desativado e diz porquê (as props a espalhar no botão).
import { can, porqueNao } from "./perfil";

export const perm = (p: string): { disabled?: boolean; title?: string } => (can(p) ? {} : { disabled: true, title: porqueNao(p) });
export const PM = "suppliers.manage";

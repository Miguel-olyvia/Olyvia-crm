// 12/11 (Rúben: «falta ter mais links na plataforma»): um negócio na lista ou no Hoje é uma ligação a sério (/negocios?negocio=1026).
// Um clique normal abre-o na mesma página, sem recarregar; Ctrl ou Cmd + clique, o botão do meio e «Abrir num separador novo» do
// botão direito abrem-no noutro separador, como em qualquer site.
import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { urlDoNegocio } from "./urlNegocio";

type Props = { negocio: number; abrir: () => void; children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick">;

/** É um clique que o browser deve tratar (separador ou janela novos, descarregar)? */
export const cliqueDoBrowser = (e: Pick<MouseEvent, "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "defaultPrevented">): boolean =>
  e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;

export function LigacaoNegocio({ negocio, abrir, children, ...resto }: Props) {
  return (
    <a {...resto} href={urlDoNegocio(negocio)} onClick={(e) => { if (cliqueDoBrowser(e)) return; e.preventDefault(); abrir(); }}>
      {children}
    </a>
  );
}

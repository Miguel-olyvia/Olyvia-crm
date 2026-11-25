// A camada do novo Inventário à frente da app (fatia 5). Como o NaFrente do Estúdio (vai para o body, por cima do cabeçalho
// da app, z 600), mas SEM as classes .pn .calma .pg-root: o .calma redefine os tokens para a paleta clara (e só quando
// prototipo.css já foi carregado por outra página), o que forçava o claro no modo escuro e deixava a moldura incoerente
// com os diálogos e popovers dos ecrãs embebidos (que o Radix põe no body, fora dela, com o tema da app). Aqui a moldura
// e os ecrãs clássicos embebidos ficam com os tokens da app (:root / .dark), tal como nas rotas clássicas.
// O NaFrente fica como está: é o do Estúdio da obra e das outras janelas da Emylia.
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

export function NaFrenteInventario({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return <>{children}</>;
  return createPortal(<div data-camada-inventario="" className="relative z-[600] text-foreground">{children}</div>, document.body);
}

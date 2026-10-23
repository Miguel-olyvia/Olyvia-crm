// Peças da tabela de fornecedores: o selo do portal e a coluna de ações (Abrir e o menu "Mais ações").
import { portalTexto, portalTom } from "./fornecedores";
import { MenuMais, type ItemMenu } from "./mockPecas";
import { Peq, Selo } from "./pecasInv";
import type { Fornecedor } from "./tipos";

export const PortalSelo = ({ s }: { s: Fornecedor }) => <Selo tom={portalTom(s)}>{portalTexto(s)}</Selo>;

/** A coluna de ações: "Abrir" e o menu "Mais ações". */
export const AcoesLinha = ({ s, abrir, menu }: { s: Fornecedor; abrir: () => void; menu: (s: Fornecedor) => readonly (ItemMenu | "-")[] }) => <><Peq onClick={abrir}>Abrir</Peq><MenuMais itens={menu(s)} /></>;

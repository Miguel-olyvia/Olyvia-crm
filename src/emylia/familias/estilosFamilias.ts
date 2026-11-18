// Famílias (interface): as constantes e funções de formato partilhadas pelos passos (separadas das peças para o fast refresh).
import type { CSSProperties } from "react";
import { eur } from "../motor";

/** As classes de um botão de linha do assistente: alvo de 44 px. */
export const BTN = "min-h-11 text-[15px]";
/** Para os botões com aria-disabled (continuam focáveis e dizem porquê): o aspeto de desativado vem do atributo. */
export const BTN_DESATIVAVEL = `${BTN} aria-disabled:cursor-not-allowed aria-disabled:opacity-50`;
export const preco = (n: number): string => `${eur(n)} €`;
export const plural = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`;
/** «3 produtos geram 3 variantes» (um produto gera uma variante). */
export const geram = (produtos: number, variantes: number): string => `${plural(produtos, "produto", "produtos")} ${produtos === 1 ? "gera" : "geram"} ${plural(variantes, "variante", "variantes")}`;

/** O fundo de uma bolinha com UM hex (a cor dupla desenha-se em metades: ver MetadesDaCor). Sem hex, sem fundo: não se inventa cor. */
export const estiloDaCor = (hex: readonly string[]): CSSProperties | undefined => (hex.length === 1 ? { backgroundColor: hex[0] } : undefined);

/** Os ids dos botões Editar e Apagar de cada família (a página devolve o foco a eles). */
export const idEditarFamilia = (id: string): string => `editar-${id}`;
export const idApagarFamilia = (id: string): string => `apagar-${id}`;

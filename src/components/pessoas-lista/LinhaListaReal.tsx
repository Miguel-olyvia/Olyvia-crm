import { memo, useMemo } from "react";
import type { ContactoDaLista, PessoaDaLista } from "@/hooks/pessoas/listaPessoasTipos";
import { LinhaPessoaVista } from "@/components/pessoas/LinhaPessoaVista";
import type { IdColuna } from "@/components/pessoas/vistaLinhaPessoa";
import { CelulaNegocios, CelulaVisita } from "./CelulasListaReal";
import { COLUNAS_POR_OMISSAO } from "./colunasPessoas";
import { vistaDaLista } from "./vistaDaLista";

/** Abre a ficha de uma pessoa; `origem` é o botão clicado (a ficha devolve-lhe o foco ao fechar). */
export type AoAbrirPessoa = (pessoaId: string, origem?: HTMLElement, negocioId?: string) => void;

interface LinhaListaRealProps {
  pessoa: PessoaDaLista;
  /** Sem isto o nome é texto simples e a linha não é clicável. */
  aoAbrir?: AoAbrirPessoa;
  /** As colunas a desenhar, por ordem (a escolha da pessoa). Deve ser estável: a linha está em memória. */
  colunas?: readonly IdColuna[];
  /** O nome do comercial resolvido a partir de `pessoa.responsavelId`; ausente enquanto não se sabe. */
  comercial?: string;
  /** O telefone e o email lidos para esta página; ausente enquanto não se sabe. */
  contacto?: ContactoDaLista;
}

/**
 * Uma linha da Lista real: só leitura. É a linha do protótipo (`LinhaPessoaVista`) alimentada pelo que a base devolve.
 * O nome é o cabeçalho da linha e, com `aoAbrir` (a ficha ligada), um botão que abre a ficha; a linha toda também abre.
 */
export const LinhaListaReal = memo(function LinhaListaReal(
  { pessoa, aoAbrir, colunas = COLUNAS_POR_OMISSAO, comercial, contacto }: LinhaListaRealProps,
) {
  const vista = useMemo(() => vistaDaLista(pessoa, { comercial, contacto }), [pessoa, comercial, contacto]);
  const celulas = useMemo(
    () => ({ nextVisit: <CelulaVisita iso={pessoa.proximaVisitaEm} />, deals: <CelulaNegocios pessoa={pessoa} /> }),
    [pessoa],
  );
  return (
    <LinhaPessoaVista
      vista={vista} colunas={colunas} celulas={celulas} cabecalhoDeLinha nomeAlto
      aoAbrir={aoAbrir ? (origem) => aoAbrir(pessoa.id, origem ?? undefined) : undefined}
    />
  );
});

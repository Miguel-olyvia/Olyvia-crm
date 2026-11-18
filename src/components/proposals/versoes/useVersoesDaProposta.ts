// Estado das versões por idioma do editor de templates de proposta.
//
// O hook é dono do mapa `versoes` e do idioma que se está a editar; o editor continua dono do `config`
// (o português). Nada aqui grava: o editor lê `versoes` para o isDirty e para o design_settings.

import { useCallback, useMemo, useState } from "react";
import { IDIOMA_BASE, normalizarCodigo } from "@/lib/idiomaDocumento";
import {
  adicionarVersao,
  configNoIdioma,
  definirCampoDeSeccao,
  definirTexto,
  idiomasQueFaltaAdicionar,
  listarCampos,
  marcarComoAtualizada,
  removerVersao,
  resumoDeIdiomas,
  type CampoDeSeccao,
  type ConfigComTextos,
  type Versoes,
} from "./modeloVersoes";

export type VersoesDaProposta = ReturnType<typeof useVersoesDaProposta>;

function textoDe(valor: unknown): string {
  return typeof valor === "string" ? valor : "";
}

function objetoDe(valor: unknown): Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {};
}

export function useVersoesDaProposta<C extends ConfigComTextos>(config: C) {
  const [versoes, setVersoes] = useState<Versoes>({});
  const [escolhido, setEscolhido] = useState<string>(IDIOMA_BASE);

  // Se a versão aberta deixar de existir (remover, recarregar), cai para o português.
  const idiomaAtivo = escolhido !== IDIOMA_BASE && typeof versoes[escolhido] === "object" && versoes[escolhido] !== null ? escolhido : IDIOMA_BASE;
  const ehBase = idiomaAtivo === IDIOMA_BASE;

  const resumo = useMemo(() => resumoDeIdiomas(config, versoes), [config, versoes]);
  const resumoAtivo = resumo.find((r) => r.codigo === idiomaAtivo);
  const campos = useMemo(() => listarCampos(config, versoes, idiomaAtivo), [config, versoes, idiomaAtivo]);
  const configVisivel = useMemo(() => configNoIdioma(config, versoes, idiomaAtivo), [config, versoes, idiomaAtivo]);
  const livres = useMemo(() => idiomasQueFaltaAdicionar(versoes), [versoes]);

  const carregar = useCallback((novas: Versoes) => {
    setVersoes(novas);
    setEscolhido(IDIOMA_BASE);
  }, []);

  const escolher = useCallback((codigo: string) => setEscolhido(normalizarCodigo(codigo) ?? IDIOMA_BASE), []);

  const adicionar = useCallback(
    (codigo: string, copiarPortugues: boolean) => {
      const c = normalizarCodigo(codigo);
      if (!c) return;
      setVersoes((prev) => adicionarVersao(prev, c, config, { copiarPortugues }));
      setEscolhido(c);
    },
    [config],
  );

  const remover = useCallback((codigo: string) => setVersoes((prev) => removerVersao(prev, codigo)), []);

  const escreverTexto = useCallback(
    (campo: string, valor: string) => {
      if (idiomaAtivo === IDIOMA_BASE) return;
      setVersoes((prev) => definirTexto(prev, idiomaAtivo, campo, valor));
    },
    [idiomaAtivo],
  );

  const escreverSeccao = useCallback(
    (seccaoId: string, campo: CampoDeSeccao, valor: string) => {
      if (idiomaAtivo === IDIOMA_BASE) return;
      setVersoes((prev) => definirCampoDeSeccao(prev, idiomaAtivo, seccaoId, campo, valor));
    },
    [idiomaAtivo],
  );

  const marcarAtualizada = useCallback(() => {
    if (idiomaAtivo === IDIOMA_BASE) return;
    setVersoes((prev) => marcarComoAtualizada(prev, idiomaAtivo, config));
  }, [config, idiomaAtivo]);

  const valorDoTexto = useCallback((campo: string) => textoDe(objetoDe(versoes[idiomaAtivo])[campo]), [versoes, idiomaAtivo]);

  const valorDaSeccao = useCallback(
    (seccaoId: string, campo: CampoDeSeccao) =>
      textoDe(objetoDe(objetoDe(objetoDe(versoes[idiomaAtivo]).sections)[seccaoId])[campo]),
    [versoes, idiomaAtivo],
  );

  return {
    versoes,
    idiomaAtivo,
    ehBase,
    /** A barra de idiomas só aparece depois de haver uma 2.ª versão. */
    mostrarBarra: resumo.length > 0,
    resumo,
    resumoAtivo,
    campos,
    configVisivel,
    livres,
    carregar,
    escolher,
    adicionar,
    remover,
    escreverTexto,
    escreverSeccao,
    marcarAtualizada,
    valorDoTexto,
    valorDaSeccao,
  };
}

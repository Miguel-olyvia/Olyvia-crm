import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { aplicarVersaoContrato, calcularCompletude, idiomaBaseDoTemplate, normalizarCodigo } from "@/lib/idiomaDocumento";
import { useIrParaCampo } from "@/components/templates/versoes/irParaCampo";
import { ID_CAMPO_MINUTA } from "./idsDeIdioma";
import {
  adicionarVersao,
  alvoDaLinha,
  camposDoIdioma,
  codigosDasVersoes,
  escreverCorpo,
  escreverSettings,
  idiomasPorAdicionar,
  linhasDeVerificacao,
  marcarRevisto,
  removerVersao,
  type ChaveDeVerificacao,
  type EstadoMinuta,
  type LinhaDeVerificacao,
} from "./versoesDoTemplate";

/** O que o hook precisa do formulário da minuta (o resto do formulário passa intacto). */
export interface FormularioComVersoes {
  language?: string | null;
  body_html: string;
  doc_settings: object | null;
}

/** Os separadores do editor de minutas onde vivem os campos da lista de verificação. */
export type SeparadorDaMinuta = "editor" | "template_layout";

export interface OpcoesDoHook {
  /** Muda para o separador onde o campo vive («Editor» para o corpo, «Layout da Minuta» para o resto). */
  abrirSeparador?: (separador: SeparadorDaMinuta) => void;
}

export interface ResumoDaVersao {
  porTraduzir: number;
  completo: boolean;
  /** O texto base mudou desde que a versão foi escrita ou revista. */
  desatualizado: boolean;
}

/**
 * As versões por idioma de uma minuta, sobre o formulário do editor.
 *
 * Sem versões nada muda: o idioma ativo é o base, `corpo` e `settings` são os próprios dados do formulário e a
 * chave `versions` nunca é escrita. Com versões, o idioma ativo decide o que o editor de texto, o painel de
 * layout e a pré-visualização mostram e para onde vai o que se escreve.
 */
export function useVersoesDoTemplate<T extends FormularioComVersoes>(formData: T, setFormData: Dispatch<SetStateAction<T>>, opcoes: OpcoesDoHook = {}) {
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [adicionando, setAdicionando] = useState(false);

  // Só estes três campos do formulário contam: mudar o nome, o signatário… não recalcula nada daqui.
  const { language, body_html, doc_settings } = formData;
  const estado = useMemo<EstadoMinuta>(
    () => ({ language, body_html, doc_settings: doc_settings as EstadoMinuta["doc_settings"] }),
    [language, body_html, doc_settings],
  );
  const base = idiomaBaseDoTemplate(estado);
  const versoes = useMemo(() => codigosDasVersoes(estado), [estado]);
  const ativo = escolhido && versoes.includes(escolhido) ? escolhido : base;
  const ehBase = ativo === base;

  // Sempre sobre o estado mais recente (duas edições no mesmo ciclo não se pisam); sem mudança, a mesma referência.
  const aplicar = useCallback(
    (alterar: (fd: EstadoMinuta) => Partial<EstadoMinuta>) => {
      setFormData((fd) => {
        const atual = fd as unknown as EstadoMinuta;
        const resultado = alterar(atual);
        return (resultado === atual ? fd : { ...fd, ...resultado }) as T;
      });
    },
    [setFormData],
  );

  const campos = useMemo(() => camposDoIdioma(estado, ativo), [estado, ativo]);

  const preview = useMemo(() => {
    if (ehBase) return { body_html, doc_settings: doc_settings as T["doc_settings"] };
    const resolvida = aplicarVersaoContrato(estado, ativo);
    if (resolvida !== estado) return { body_html: resolvida.body_html, doc_settings: resolvida.doc_settings as T["doc_settings"] };
    // Versão ainda sem texto: mostra-se vazia (e não o português), com o layout que se está a editar.
    return { body_html: campos.body_html, doc_settings: campos.settings as T["doc_settings"] };
  }, [ehBase, estado, ativo, campos, body_html, doc_settings]);

  const completudes = useMemo(() => {
    const out: Record<string, ResumoDaVersao> = {};
    for (const c of versoes) {
      const r = calcularCompletude(estado, c);
      out[c] = { porTraduzir: r.faltam.length, completo: r.completo, desatualizado: r.desatualizado };
    }
    return out;
  }, [estado, versoes]);

  const linhas = useMemo<LinhaDeVerificacao[]>(() => linhasDeVerificacao(estado, ativo), [estado, ativo]);

  // «Ir para o campo»: os campos do layout vivem noutros componentes e encontram-se por id estável.
  const campo = useIrParaCampo<string>({
    abrirSeparador: (alvo) => opcoes.abrirSeparador?.(alvo === "corpo" ? "editor" : "template_layout"),
    localizar: (alvo) => {
      const id = ID_CAMPO_MINUTA[alvo];
      return id ? document.getElementById(id) : null;
    },
  });
  // Se o campo não está no ecrã, volta-se à lista (separador Editor), onde o aviso se lê.
  const campoNaoAchado = campo.naoEncontrado !== null;
  const abrirSeparadorAtual = useRef(opcoes.abrirSeparador);
  abrirSeparadorAtual.current = opcoes.abrirSeparador;
  useEffect(() => {
    if (campoNaoAchado) abrirSeparadorAtual.current?.("editor");
  }, [campoNaoAchado]);
  const irParaCampo = useCallback(
    (linha: ChaveDeVerificacao) => {
      if (ehBase) return;
      campo.irPara(alvoDaLinha(estado, ativo, linha));
    },
    [campo, ehBase, estado, ativo],
  );

  const definirAtivo = useCallback(
    (codigo: string) => {
      const c = normalizarCodigo(codigo);
      if (c && (c === base || versoes.includes(c))) setEscolhido(c);
    },
    [base, versoes],
  );

  const setCorpo = useCallback((html: string) => aplicar((fd) => escreverCorpo(fd, ativo, html)), [aplicar, ativo]);

  const setSettings = useCallback(
    (next: object | null) => aplicar((fd) => escreverSettings(fd, ativo, next as Record<string, unknown> | null)),
    [aplicar, ativo],
  );

  const adicionar = useCallback(
    (codigo: string, copiar: boolean) => {
      aplicar((fd) => adicionarVersao(fd, codigo, copiar));
      setEscolhido(normalizarCodigo(codigo));
      setAdicionando(false);
    },
    [aplicar],
  );

  const remover = useCallback(
    (codigo: string) => {
      aplicar((fd) => removerVersao(fd, codigo));
      setEscolhido((atual) => (atual === normalizarCodigo(codigo) ? null : atual));
    },
    [aplicar],
  );

  const marcarComoRevisto = useCallback((codigo: string) => aplicar((fd) => marcarRevisto(fd, codigo)), [aplicar]);

  const reiniciar = useCallback(() => {
    setEscolhido(null);
    setAdicionando(false);
  }, []);
  const abrirAdicionar = useCallback(() => setAdicionando(true), []);
  const fecharAdicionar = useCallback(() => setAdicionando(false), []);
  const faltamAdicionar = useMemo(() => idiomasPorAdicionar(estado), [estado]);

  return {
    base,
    ativo,
    ehBase,
    versoes,
    faltamAdicionar,
    mostrarBarra: versoes.length > 0 || adicionando,
    adicionando,
    abrirAdicionar,
    fecharAdicionar,
    /** O corpo do idioma ativo (o do formulário, no base). */
    corpo: campos.body_html,
    /** O doc_settings como o painel de layout o deve ver no idioma ativo (o do formulário, no base). */
    settings: campos.settings as T["doc_settings"],
    preview,
    completudes,
    linhas,
    irParaCampo,
    /** O último «ir para o campo» não achou o campo no ecrã (a opção que o mostra está desligada no layout). */
    campoNaoEncontrado: campoNaoAchado,
    definirAtivo,
    setCorpo,
    setSettings,
    adicionar,
    remover,
    marcarRevisto: marcarComoRevisto,
    reiniciar,
  };
}

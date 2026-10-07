/**
 * Os ficheiros que o RH escolhe no dialogo "Nova pessoa", guardados EM MEMORIA
 * (fora do rascunho do formulario) e enviados um a um DEPOIS de a ficha ser
 * criada: so entao ha `pessoa_id` para o servidor.
 *
 * Uma falha de anexos nunca desfaz a ficha nem para os restantes ficheiros: o
 * que falhou fica na lista com o codigo do erro, e `enviar` devolve UMA
 * `FalhaAnexos` (seccao `anexos`) a dizer quantos falharam. Nunca lanca.
 */
import { useCallback, useRef, useState } from "react";
import { useAnexarAnexoRh } from "@/hooks/useAnexarAnexoRh";
import {
  CODIGO_FALHA_ENVIO_RH,
  validarFicheiroLocal,
  verificarLimitesDeContagem,
  type TipoAnexoRh,
} from "@/lib/hr/anexosRh";
import { TIPOS_ANEXO_CONVITE } from "@/lib/hr/conviteAnexos";

/**
 * Compativel com `SeccaoFalhada` de `usePessoas` (que NAO muda: `seccao` e
 * `mensagem`), com campos estruturados para o ecra traduzir. `mensagem` e so
 * uma chave estavel, sem contagens; o ecra usa `falhados`, `total` e `codigos`.
 */
export interface FalhaAnexos {
  seccao: "anexos";
  mensagem: string;
  /** Quantos ficheiros falharam. */
  falhados: number;
  /** Quantos se tentaram enviar. */
  total: number;
  /** O codigo de cada ficheiro que falhou, pela ordem do envio. */
  codigos: string[];
}

export interface ItemAnexoNovo {
  id: string;
  file: File;
  /** Preenchido se o envio deste ficheiro falhou depois de a ficha ser criada. */
  codigoErro: string | null;
}

export type FicheirosPorTipo = Record<TipoAnexoRh, ItemAnexoNovo[]>;

export interface ErroEscolha {
  tipo: TipoAnexoRh;
  codigo: string;
}

const VAZIO: FicheirosPorTipo = { cartao_cidadao: [], comprovativo_iban: [], fotografia: [] };

function contar(ficheiros: FicheirosPorTipo): Partial<Record<TipoAnexoRh, number>> {
  return {
    cartao_cidadao: ficheiros.cartao_cidadao.length,
    comprovativo_iban: ficheiros.comprovativo_iban.length,
    fotografia: ficheiros.fotografia.length,
  };
}

export function useAnexosNovaPessoa() {
  const [ficheiros, setFicheiros] = useState<FicheirosPorTipo>(VAZIO);
  const [erroEscolha, setErroEscolha] = useState<ErroEscolha | null>(null);
  const [aEnviar, setAEnviar] = useState(false);
  const { envios, enviar: enviarUm } = useAnexarAnexoRh();

  // Espelho sincrono: duas escolhas seguidas vem a contagem uma da outra.
  const ref = useRef<FicheirosPorTipo>(VAZIO);
  const contador = useRef(0);

  const guardar = useCallback((proximos: FicheirosPorTipo) => {
    ref.current = proximos;
    setFicheiros(proximos);
  }, []);

  /** Devolve o codigo da recusa, ou `null` se o ficheiro foi aceite. */
  const escolher = useCallback(
    (tipo: TipoAnexoRh, file: File): string | null => {
      const recusa = validarFicheiroLocal(tipo, file) ?? verificarLimitesDeContagem(tipo, contar(ref.current));
      if (recusa) {
        setErroEscolha({ tipo, codigo: recusa });
        return recusa;
      }
      setErroEscolha(null);
      contador.current += 1;
      guardar({
        ...ref.current,
        [tipo]: [...ref.current[tipo], { id: `novo-${contador.current}`, file, codigoErro: null }],
      });
      return null;
    },
    [guardar],
  );

  const retirar = useCallback(
    (tipo: TipoAnexoRh, indice: number): void => {
      const lista = ref.current[tipo];
      if (!Number.isInteger(indice) || indice < 0 || indice >= lista.length) return;
      setErroEscolha(null);
      guardar({ ...ref.current, [tipo]: lista.filter((_, i) => i !== indice) });
    },
    [guardar],
  );

  const limpar = useCallback((): void => {
    setErroEscolha(null);
    guardar(VAZIO);
  }, [guardar]);

  const marcarErro = useCallback(
    (tipo: TipoAnexoRh, id: string, codigoErro: string) => {
      guardar({
        ...ref.current,
        [tipo]: ref.current[tipo].map((i) => (i.id === id ? { ...i, codigoErro } : i)),
      });
    },
    [guardar],
  );

  const tirarEnviado = useCallback(
    (tipo: TipoAnexoRh, id: string) => {
      guardar({ ...ref.current, [tipo]: ref.current[tipo].filter((i) => i.id !== id) });
    },
    [guardar],
  );

  /** Sequencial; uma falha nao para os restantes. Nunca lanca. */
  const enviar = useCallback(
    async (pessoaId: string): Promise<FalhaAnexos[]> => {
      const pendentes = TIPOS_ANEXO_CONVITE.flatMap((tipo) =>
        ref.current[tipo].map((item) => ({ tipo, item })),
      );
      if (pendentes.length === 0) return [];

      setAEnviar(true);
      const codigosFalhados: string[] = [];
      try {
        for (const { tipo, item } of pendentes) {
          let codigo: string | null = null;
          try {
            const resultado = await enviarUm(pessoaId, tipo, item.file);
            if (!resultado.ok) codigo = resultado.codigo ?? CODIGO_FALHA_ENVIO_RH;
          } catch {
            codigo = CODIGO_FALHA_ENVIO_RH;
          }
          if (codigo) {
            codigosFalhados.push(codigo);
            marcarErro(tipo, item.id, codigo);
          } else {
            tirarEnviado(tipo, item.id);
          }
        }
      } finally {
        setAEnviar(false);
      }
      return codigosFalhados.length === 0
        ? []
        : [
            {
              seccao: "anexos",
              mensagem: "anexos_nao_enviados",
              falhados: codigosFalhados.length,
              total: pendentes.length,
              codigos: codigosFalhados,
            },
          ];
    },
    [enviarUm, marcarErro, tirarEnviado],
  );

  const temFicheiros = TIPOS_ANEXO_CONVITE.some((tipo) => ficheiros[tipo].length > 0);

  return { ficheiros, temFicheiros, erroEscolha, aEnviar, envios, escolher, retirar, limpar, enviar };
}

export type ResultadoAnexosNovaPessoa = ReturnType<typeof useAnexosNovaPessoa>;

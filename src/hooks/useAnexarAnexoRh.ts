/**
 * Um envio de ficheiro pelo RH para a ficha de uma pessoa: pede o URL assinado,
 * sobe o ficheiro para a quarentena e pede ao servidor que o confirme (e ele
 * le a assinatura REAL antes de o promover).
 *
 * ESTE HOOK NUNCA LANCA. O erro fica em `envios[id].codigoErro` e no resultado
 * de `enviar`; quem mostra e o ecra, na lingua dele. Uma recusa de negocio nao
 * e defeito; so o inesperado vai para o registo (em `anexoRhEdge`).
 *
 * Um `confirmar` que perde a resposta NAO se desfaz com `remover`: o servidor
 * pode ja ter promovido o ficheiro (e apagado o substituido), e remover tiraria
 * o novo. Quem chama recarrega a lista, que e a fonte de verdade.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import {
  anexoRhPromovido,
  confirmarAnexoRh,
  pedirUploadAnexoRh,
  removerAnexoRh,
  type AnexoRhAceite,
} from "@/lib/hr/anexoRhEdge";
import { enviarParaQuarentenaComMotivo } from "@/lib/hr/envioQuarentena";
import {
  CODIGO_FALHA_ENVIO_RH,
  CODIGO_FALHA_ENVIO_TEMPO_RH,
  validarFicheiroLocal,
  type TipoAnexoRh,
} from "@/lib/hr/anexosRh";

/**
 * Melhor esforco: depois de um PUT falhado liberta o lugar reservado. Se nao
 * conseguir, regista so o tipo da falha (nunca o id nem o caminho); a limpeza
 * do servidor apanha o resto. Nunca lanca nem espera.
 */
function libertarReserva(anexoId: string): void {
  removerAnexoRh(anexoId)
    .then((r) => {
      if (!r.ok) {
        captureFlowError(
          new Error(`hr-anexo-rh: libertar_reserva: ${r.codigo ?? "falha_de_rede"}`),
          "hr-anexo-rh",
        );
      }
    })
    .catch(() => {
      captureFlowError(new Error("hr-anexo-rh: libertar_reserva: excepcao"), "hr-anexo-rh");
    });
}

export type FaseEnvioRh = "a_enviar" | "a_verificar" | "erro";

/** Um envio local, por id local: o que ainda nao e (ou ja nao e) um anexo aceite. */
export interface EnvioAnexoRh {
  tipo: TipoAnexoRh;
  nome: string;
  fase: FaseEnvioRh;
  /** 0 a 100; durante `a_verificar` fica em 100. */
  progresso: number;
  codigoErro: string | null;
}

export interface ResultadoEnvioRh {
  ok: boolean;
  codigo: string | null;
  anexo: AnexoRhAceite | null;
}

export interface ResultadoAnexarAnexoRh {
  envios: Record<string, EnvioAnexoRh>;
  enviar: (
    pessoaId: string,
    tipo: TipoAnexoRh,
    file: File,
    substituiAnexoId?: string,
  ) => Promise<ResultadoEnvioRh>;
  /** Tira um envio da lista (tipicamente um erro ja visto). */
  descartarEnvio: (id: string) => void;
}

export function useAnexarAnexoRh(): ResultadoAnexarAnexoRh {
  const [envios, setEnvios] = useState<Record<string, EnvioAnexoRh>>({});
  const enviosRef = useRef<Record<string, EnvioAnexoRh>>({});
  const contador = useRef(0);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const guardar = useCallback((proximos: Record<string, EnvioAnexoRh>) => {
    enviosRef.current = proximos;
    if (montado.current) setEnvios(proximos);
  }, []);

  const actualizar = useCallback(
    (id: string, mudancas: Partial<EnvioAnexoRh>) => {
      const actual = enviosRef.current[id];
      if (!actual) return;
      guardar({ ...enviosRef.current, [id]: { ...actual, ...mudancas } });
    },
    [guardar],
  );

  const descartarEnvio = useCallback(
    (id: string) => {
      const { [id]: _tirado, ...resto } = enviosRef.current;
      guardar(resto);
    },
    [guardar],
  );

  const enviar = useCallback(
    async (
      pessoaId: string,
      tipo: TipoAnexoRh,
      file: File,
      substituiAnexoId?: string,
    ): Promise<ResultadoEnvioRh> => {
      const id = `envio-rh-${++contador.current}`;
      const nome = file.name;
      const falhar = (codigo: string | null): ResultadoEnvioRh => {
        const codigoFinal = codigo ?? CODIGO_FALHA_ENVIO_RH;
        guardar({
          ...enviosRef.current,
          [id]: { tipo, nome, fase: "erro", progresso: 0, codigoErro: codigoFinal },
        });
        return { ok: false, codigo: codigoFinal, anexo: null };
      };

      try {
        // Um novo envio deste tipo substitui o erro anterior desse tipo.
        guardar(
          Object.fromEntries(
            Object.entries(enviosRef.current).filter(([, e]) => !(e.tipo === tipo && e.fase === "erro")),
          ),
        );

        const recusaLocal = validarFicheiroLocal(tipo, file);
        if (recusaLocal) return falhar(recusaLocal);

        guardar({
          ...enviosRef.current,
          [id]: { tipo, nome, fase: "a_enviar", progresso: 0, codigoErro: null },
        });

        const url = await pedirUploadAnexoRh({
          pessoaId,
          tipo,
          nome,
          tamanho: file.size,
          mime: file.type,
          substituiAnexoId,
        });
        if (!url.ok || !url.data) return falhar(url.codigo);

        const { anexoId, caminho, uploadToken } = url.data;
        const enviado = await enviarParaQuarentenaComMotivo(caminho, uploadToken, file, (progresso) =>
          actualizar(id, { progresso }),
        );
        if (!enviado.ok) {
          const tempo = enviado.motivo === "tempo_esgotado";
          captureFlowError(
            new Error(`hr-anexo-rh: enviar: ${tempo ? "tempo_esgotado" : "falha_do_put"}`),
            "hr-anexo-rh",
          );
          libertarReserva(anexoId);
          return falhar(tempo ? CODIGO_FALHA_ENVIO_TEMPO_RH : null);
        }

        actualizar(id, { fase: "a_verificar", progresso: 100 });
        const confirmacao = await confirmarAnexoRh({ anexoId, substituiAnexoId });
        if (!confirmacao.ok || !confirmacao.data) {
          // Confirmar repetido ou com resposta perdida: se o anexo ja esta na lista, correu bem.
          if (confirmacao.codigo === "anexo_estado_invalido") {
            const jaAceite = await anexoRhPromovido(anexoId);
            if (jaAceite) {
              descartarEnvio(id);
              return { ok: true, codigo: null, anexo: jaAceite };
            }
          }
          return falhar(confirmacao.codigo);
        }

        descartarEnvio(id);
        return { ok: true, codigo: null, anexo: confirmacao.data.anexo };
      } catch {
        captureFlowError(new Error("hr-anexo-rh: enviar: excepcao"), "hr-anexo-rh");
        return falhar(null);
      }
    },
    [guardar, actualizar, descartarEnvio],
  );

  return { envios, enviar, descartarEnvio };
}

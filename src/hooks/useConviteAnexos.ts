/**
 * Os ficheiros do convite de admissao publico: cartao de cidadao, comprovativo
 * de IBAN e fotografia. Sem sessao -- tudo passa pela Edge Function
 * `convite-admissao` (accoes `anexo_url`, `anexo_confirmar`, `anexo_remover`),
 * e o ficheiro em si sobe por um URL assinado para a QUARENTENA: so depois de o
 * servidor lhe ler a assinatura real e que ele passa a ficar ligado ao convite.
 *
 * ESTE HOOK NUNCA LANCA
 * ---------------------
 * Todo o erro vai para `envios[id].codigoErro`; quem mostra e o cartao, na
 * lingua do ecra. Uma recusa de negocio (formato, tamanho, limites) nao e um
 * defeito e nao vai para o registo de erros; so o inesperado (rede, resposta
 * sem corpo, falha do PUT), e sem token, sem nome de ficheiro e sem corpo.
 *
 * Um motivo `convite_*` devolvido por qualquer accao fica em `erroConvite`: o
 * link ja nao serve e a pagina leva a pessoa ao cartao de link invalido, tal
 * como na submissao.
 *
 * O token vive so na URL e neste hook -- nunca em localStorage/sessionStorage.
 * Os ficheiros NAO entram no rascunho nem nos `dados` da submissao.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { codigoDeErroEdge } from "@/lib/hr/errosAdmissao";
import { enviarParaQuarentena } from "@/lib/hr/envioQuarentena";
import {
  contarPorTipo,
  validarFicheiroLocal,
  verificarLimitesDeContagem,
  type AnexoConvite,
  type ContagemPorTipo,
  type TipoAnexoConvite,
} from "@/lib/hr/conviteAnexos";

const FUNCAO = "convite-admissao";
const ORIGEM_REGISTO = "hr-convite-anexos";
const CODIGO_FALHA_ENVIO = "anexo_falha_envio";

export type FaseEnvio = "a_enviar" | "a_verificar" | "erro";

/** Um envio local, por id local: o que ainda nao e (ou ja nao e) um anexo aceite. */
export interface EnvioAnexo {
  tipo: TipoAnexoConvite;
  nome: string;
  fase: FaseEnvio;
  /** 0 a 100; durante `a_verificar` fica em 100. */
  progresso: number;
  codigoErro: string | null;
}

export interface ContagemAnexos {
  /** Aceites mais os que estao a enviar: e o que ocupa lugar. */
  total: number;
  porTipo: ContagemPorTipo;
}

export interface ResultadoConviteAnexos {
  anexos: AnexoConvite[];
  envios: Record<string, EnvioAnexo>;
  /** Ha envios a correr OU remocoes pendentes: a submissao espera. */
  emCurso: boolean;
  /** Os ids dos anexos cujo `anexo_remover` ainda nao respondeu (o cartao mostra "a remover"). */
  removendo: ReadonlySet<string>;
  contagem: ContagemAnexos;
  erroConvite: string | null;
  adicionar: (tipo: TipoAnexoConvite, file: File) => Promise<void>;
  remover: (id: string) => Promise<void>;
}

// Sem uniao discriminada: o projecto nao tem strictNullChecks e `!r.ok` nao estreitaria.
type RespostaEdge = { ok: boolean; data: Record<string, unknown>; codigo: string | null };

/** O registo de erros recebe so o tipo de falha: nunca token, nome nem corpo. */
function erroSemDados(origem: string, codigo: string | null): Error {
  return new Error(`${origem}: ${codigo ?? "falha_de_rede"}`);
}

function eDefeito(codigo: string | null): boolean {
  return codigo === null || codigo === "erro_inesperado";
}

async function chamarEdge(body: Record<string, unknown>): Promise<RespostaEdge> {
  try {
    const { data, error } = await supabase.functions.invoke(FUNCAO, { body });
    if (error || data?.error) {
      return { ok: false, data: {}, codigo: await codigoDeErroEdge(error, data) };
    }
    return { ok: true, data: (data ?? {}) as Record<string, unknown>, codigo: null };
  } catch {
    return { ok: false, data: {}, codigo: null };
  }
}

/**
 * @param token    o token do convite (da URL).
 * @param iniciais os anexos que o servidor ja tem ligados ao convite; chegam de
 *                 forma assincrona (com o estado) e adoptam-se UMA vez.
 */
export function useConviteAnexos(
  token: string | undefined,
  iniciais?: AnexoConvite[],
): ResultadoConviteAnexos {
  const [anexos, setAnexos] = useState<AnexoConvite[]>(() => (iniciais ? [...iniciais] : []));
  const [envios, setEnvios] = useState<Record<string, EnvioAnexo>>({});
  const [erroConvite, setErroConvite] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<ReadonlySet<string>>(() => new Set());

  // Espelhos sincronos: duas chamadas seguidas de `adicionar` tem de ver as
  // contagens uma da outra, sem esperar pelo proximo render.
  const anexosRef = useRef<AnexoConvite[]>(anexos);
  const enviosRef = useRef<Record<string, EnvioAnexo>>({});
  const contadorLocal = useRef(0);
  const adoptouIniciais = useRef(Boolean(iniciais));
  const aRemover = useRef<Set<string>>(new Set());

  const guardarAnexos = useCallback((proximos: AnexoConvite[]) => {
    anexosRef.current = proximos;
    setAnexos(proximos);
  }, []);

  const guardarEnvios = useCallback((proximos: Record<string, EnvioAnexo>) => {
    enviosRef.current = proximos;
    setEnvios(proximos);
  }, []);

  const actualizarEnvio = useCallback(
    (id: string, mudancas: Partial<EnvioAnexo>) => {
      const actual = enviosRef.current[id];
      if (!actual) return;
      guardarEnvios({ ...enviosRef.current, [id]: { ...actual, ...mudancas } });
    },
    [guardarEnvios],
  );

  const retirarEnvio = useCallback(
    (id: string) => {
      const { [id]: _removido, ...resto } = enviosRef.current;
      guardarEnvios(resto);
    },
    [guardarEnvios],
  );

  useEffect(() => {
    if (adoptouIniciais.current || !iniciais) return;
    adoptouIniciais.current = true;
    guardarAnexos([...iniciais]);
  }, [iniciais, guardarAnexos]);

  const contagemActual = useCallback((): ContagemAnexos => {
    const emVoo = Object.values(enviosRef.current).filter((e) => e.fase !== "erro");
    const porTipo = contarPorTipo([...anexosRef.current, ...emVoo]);
    return { total: anexosRef.current.length + emVoo.length, porTipo };
  }, []);

  /** Regista o erro de um envio (novo ou ja existente) e, se for de convite, avisa a pagina. */
  const falhar = useCallback(
    (
      id: string,
      tipo: TipoAnexoConvite,
      nome: string,
      codigo: string | null,
      origem: string,
    ) => {
      const codigoFinal = codigo ?? CODIGO_FALHA_ENVIO;
      if (eDefeito(codigo)) captureFlowError(erroSemDados(origem, codigo), ORIGEM_REGISTO);
      if (codigo?.startsWith("convite_")) setErroConvite(codigo);
      guardarEnvios({
        ...enviosRef.current,
        [id]: { tipo, nome, fase: "erro", progresso: 0, codigoErro: codigoFinal },
      });
    },
    [guardarEnvios],
  );

  /**
   * O `anexo_confirmar` perdeu a resposta: o servidor pode ter ligado o
   * ficheiro. Primeiro tenta-se tira-lo (`anexo_remover`, idempotente para o
   * que ja nao existe); se nem isso chega, a lista do servidor e a fonte de
   * verdade e o ecra passa a mostrar o que la esta. Nunca lanca.
   */
  const desfazerConfirmacaoIncerta = useCallback(
    async (anexoId: string): Promise<void> => {
      if (!token) return;
      const remocao = await chamarEdge({ action: "anexo_remover", token, anexo_id: anexoId });
      if (remocao.ok) return;
      const estado = await chamarEdge({ action: "estado", token });
      if (!estado.ok) return;
      const convite = estado.data.convite as { anexos?: unknown } | null | undefined;
      const lista = convite?.anexos;
      if (!Array.isArray(lista)) return;
      guardarAnexos(
        lista.filter(
          (a): a is AnexoConvite =>
            typeof a === "object" && a !== null && typeof (a as { id?: unknown }).id === "string",
        ),
      );
    },
    [token, guardarAnexos],
  );

  const adicionar = useCallback(
    async (tipo: TipoAnexoConvite, file: File): Promise<void> => {
      if (!token) return;

      // Um novo pedido deste tipo substitui o erro anterior desse tipo.
      const semErrosDoTipo = Object.fromEntries(
        Object.entries(enviosRef.current).filter(
          ([, e]) => !(e.tipo === tipo && e.fase === "erro"),
        ),
      );
      guardarEnvios(semErrosDoTipo);

      contadorLocal.current += 1;
      const id = `envio-${contadorLocal.current}`;
      const nome = file.name;

      const recusaLocal =
        validarFicheiroLocal(tipo, file) ?? verificarLimitesDeContagem(tipo, contagemActual().porTipo);
      if (recusaLocal) {
        falhar(id, tipo, nome, recusaLocal, "anexo_local");
        return;
      }

      guardarEnvios({
        ...enviosRef.current,
        [id]: { tipo, nome, fase: "a_enviar", progresso: 0, codigoErro: null },
      });

      const url = await chamarEdge({
        action: "anexo_url",
        token,
        tipo,
        nome,
        tamanho: file.size,
        mime: file.type,
      });
      if (!url.ok) {
        falhar(id, tipo, nome, url.codigo, "anexo_url");
        return;
      }
      const anexoId = typeof url.data.anexo_id === "string" ? url.data.anexo_id : null;
      const caminho = typeof url.data.caminho === "string" ? url.data.caminho : null;
      const uploadToken = typeof url.data.upload_token === "string" ? url.data.upload_token : null;
      if (!anexoId || !caminho || !uploadToken) {
        falhar(id, tipo, nome, null, "anexo_url");
        return;
      }

      const enviado = await enviarParaQuarentena(caminho, uploadToken, file, (progresso) =>
        actualizarEnvio(id, { progresso }),
      );
      if (!enviado) {
        falhar(id, tipo, nome, null, "anexo_enviar");
        // Melhor esforco: liberta o lugar reservado, que de outro modo
        // ficava ocupado ate a limpeza do servidor.
        void chamarEdge({ action: "anexo_remover", token, anexo_id: anexoId });
        return;
      }

      actualizarEnvio(id, { fase: "a_verificar", progresso: 100 });
      const confirmacao = await chamarEdge({ action: "anexo_confirmar", token, anexo_id: anexoId });
      if (!confirmacao.ok) {
        falhar(id, tipo, nome, confirmacao.codigo, "anexo_confirmar");
        // Uma recusa de negocio e o servidor a dizer que descartou o ficheiro.
        // Qualquer outra falha (rede, timeout, 5xx) deixa o estado do servidor
        // desconhecido: pode ja o ter ligado. Desfaz-se, ou refaz-se a lista.
        if (eDefeito(confirmacao.codigo)) await desfazerConfirmacaoIncerta(anexoId);
        return;
      }
      const aceite = confirmacao.data.anexo as AnexoConvite | undefined;
      if (!aceite || typeof aceite.id !== "string") {
        falhar(id, tipo, nome, null, "anexo_confirmar");
        return;
      }
      guardarAnexos([...anexosRef.current, aceite]);
      retirarEnvio(id);
    },
    [
      token,
      guardarEnvios,
      guardarAnexos,
      falhar,
      actualizarEnvio,
      retirarEnvio,
      contagemActual,
      desfazerConfirmacaoIncerta,
    ],
  );

  const remover = useCallback(
    async (id: string): Promise<void> => {
      if (!token || aRemover.current.has(id)) return;
      const anexo = anexosRef.current.find((a) => a.id === id);
      if (!anexo) return;
      aRemover.current.add(id);
      setRemovendo(new Set(aRemover.current));
      try {
        const resposta = await chamarEdge({ action: "anexo_remover", token, anexo_id: id });
        if (!resposta.ok) {
          contadorLocal.current += 1;
          falhar(`envio-${contadorLocal.current}`, anexo.tipo, anexo.nome_original, resposta.codigo, "anexo_remover");
          return;
        }
        guardarAnexos(anexosRef.current.filter((a) => a.id !== id));
      } finally {
        aRemover.current.delete(id);
        setRemovendo(new Set(aRemover.current));
      }
    },
    [token, guardarAnexos, falhar],
  );

  // Uma remocao pendente tambem trava a submissao: sem isto, a pessoa tira um
  // ficheiro e submete antes de o servidor o descartar, e ele seria promovido.
  const emCurso = useMemo(
    () => removendo.size > 0 || Object.values(envios).some((e) => e.fase !== "erro"),
    [envios, removendo],
  );

  const contagem = useMemo<ContagemAnexos>(() => {
    const emVoo = Object.values(envios).filter((e) => e.fase !== "erro");
    return { total: anexos.length + emVoo.length, porTipo: contarPorTipo([...anexos, ...emVoo]) };
  }, [anexos, envios]);

  return { anexos, envios, emCurso, removendo, contagem, erroConvite, adicionar, remover };
}

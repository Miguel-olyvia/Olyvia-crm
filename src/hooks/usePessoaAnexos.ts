/**
 * Os anexos da admissao de UMA pessoa (cartao de cidadao, comprovativo de IBAN,
 * fotografia): os que o convite trouxe e a submissao aceitou, e os que o RH
 * anexa, substitui e remove pela ficha.
 *
 * SO METADADOS AQUI DENTRO
 * ------------------------
 * `pessoas_anexos` so deixa `authenticated` ler as colunas listadas em
 * `COLUNAS_ANEXO` (GRANT por coluna): o caminho no Storage, o hash, o IP e o
 * convite ficam fechados. A RLS so mostra os `promovido` a quem tem
 * `hr.pessoas.view` (ou `view.own` na propria ficha) -- por isso a lista e
 * visivel a quem ve a ficha, mas o CONTEUDO continua gated no servidor: abre-se
 * um ficheiro de cada vez por `obterUrl` (`hr-anexo-url`), que decide por tipo
 * e audita. O URL nunca se guarda nem se reaproveita.
 *
 * ESCRITA
 * -------
 * `anexar`, `substituir` e `remover` passam pela Edge `hr-anexo-rh`, que decide
 * a permissao por tipo; o ecra so esconde o que o servidor ia recusar. Nenhuma
 * lanca: devolvem `{ ok, codigo }` e o erro tambem fica no estado (`envios`,
 * `erroLimite`, `errosRemocao`) para o ecra o traduzir. No fim de cada
 * tentativa a lista recarrega: e a fonte de verdade, e e ela que desfaz a
 * duvida quando um `confirmar` perdeu a resposta.
 *
 * Uma recusa de permissao (`isPermissionError`) na leitura e a resposta CORRECTA
 * e fica silenciosa para o registo; qualquer outra falha vai por `captureFlowError`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { hrFrom, isPermissionError } from "@/lib/hr/hrDb";
import { pedirUrlAnexo, type UrlAnexo } from "@/lib/hr/anexoUrl";
import { removerAnexoRh } from "@/lib/hr/anexoRhEdge";
import {
  CODIGO_FALHA_ENVIO_RH,
  validarFicheiroLocal,
  verificarLimitesDeContagem,
  type TipoAnexoRh,
} from "@/lib/hr/anexosRh";
import { contarPorTipo } from "@/lib/hr/conviteAnexos";
import { useAnexarAnexoRh, type EnvioAnexoRh } from "@/hooks/useAnexarAnexoRh";
import type { PessoaAnexo } from "@/types/hr";

/** Exactamente as colunas concedidas a `authenticated`; nunca `*`. */
const COLUNAS_ANEXO =
  "id, organization_id, pessoa_id, tipo, estado, nome_original, mime_type, " +
  "tamanho_bytes, promovido_em, criado_em";

export interface ResultadoAccaoAnexo {
  ok: boolean;
  codigo: string | null;
}

/** Recusa local por limite de contagem (tipo cheio, 4 ficheiros), antes de chamar o servidor. */
export interface ErroLimiteAnexo {
  tipo: TipoAnexoRh;
  codigo: string;
}

export interface UsePessoaAnexosResult {
  anexos: PessoaAnexo[];
  loading: boolean;
  /** Distingue "sem anexos" de "sem permissao de os ver". */
  recusado: boolean;
  /** A ultima leitura da lista falhou (nao por permissao): `anexos` e a lista anterior, nao "sem anexos". */
  erroCarregar: boolean;
  /** Pede um URL novo; lanca em erro -- quem chama mostra a mensagem. */
  obterUrl: (anexoId: string) => Promise<UrlAnexo>;
  /** Volta a ler a lista (sem mostrar "a carregar" por cima do que ja la esta). */
  recarregar: () => void;
  /** Anexa um ficheiro novo ao tipo. Nunca lanca. */
  anexar: (tipo: TipoAnexoRh, file: File) => Promise<ResultadoAccaoAnexo>;
  /** Troca um anexo por um ficheiro novo do mesmo tipo (o servidor apaga o antigo). Nunca lanca. */
  substituir: (anexoId: string, tipo: TipoAnexoRh, file: File) => Promise<ResultadoAccaoAnexo>;
  /** Apaga um anexo de vez. Nunca lanca. */
  remover: (anexoId: string) => Promise<ResultadoAccaoAnexo>;
  /** Envios a correr ou falhados, por id local (progresso e codigo do erro). */
  envios: Record<string, EnvioAnexoRh>;
  /** Tira um envio falhado da lista. */
  descartarEnvio: (id: string) => void;
  /** Os ids com `remover` ainda sem resposta. */
  aRemover: ReadonlySet<string>;
  /** O codigo da ultima remocao falhada, por id de anexo. */
  errosRemocao: Record<string, string>;
  limparErroRemocao: (anexoId: string) => void;
  /** A ultima recusa local por limite; limpa no proximo `anexar`. */
  erroLimite: ErroLimiteAnexo | null;
}

export function usePessoaAnexos(
  pessoaId: string | undefined,
  organizationId: string | undefined,
): UsePessoaAnexosResult {
  const [anexos, setAnexos] = useState<PessoaAnexo[]>([]);
  const [loading, setLoading] = useState(true);
  const [recusado, setRecusado] = useState(false);
  const [erroCarregar, setErroCarregar] = useState(false);
  const [versao, setVersao] = useState(0);
  const [aRemover, setARemover] = useState<ReadonlySet<string>>(() => new Set());
  const [errosRemocao, setErrosRemocao] = useState<Record<string, string>>({});
  const [erroLimite, setErroLimite] = useState<ErroLimiteAnexo | null>(null);
  const { envios, enviar, descartarEnvio } = useAnexarAnexoRh();

  const chaveCarregada = useRef<string | null>(null);
  const anexosRef = useRef<PessoaAnexo[]>(anexos);
  const aRemoverRef = useRef<Set<string>>(new Set());
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelado = false;
    if (!pessoaId || !organizationId) {
      chaveCarregada.current = null;
      anexosRef.current = [];
      setAnexos([]);
      setRecusado(false);
      setErroCarregar(false);
      setLoading(false);
      return;
    }
    // Uma recarga da mesma pessoa nao volta a mostrar "a carregar".
    const chave = `${pessoaId}|${organizationId}`;
    if (chaveCarregada.current !== chave) setLoading(true);
    (async () => {
      try {
        const { data, error } = await hrFrom("pessoas_anexos")
          .select(COLUNAS_ANEXO)
          .eq("pessoa_id", pessoaId)
          .eq("organization_id", organizationId)
          .eq("estado", "promovido")
          .order("criado_em", { ascending: true });
        if (cancelado) return;
        if (error) {
          if (isPermissionError(error)) {
            // A recusa e a resposta correcta: nao ha lista para mostrar.
            anexosRef.current = [];
            setAnexos([]);
            setErroCarregar(false);
            setRecusado(true);
          } else {
            // Falha de leitura: mantem a lista anterior (nao diz "sem anexos").
            setRecusado(false);
            setErroCarregar(true);
            captureFlowError(error, "hr-pessoa-anexos-carregar");
          }
          return;
        }
        setRecusado(false);
        setErroCarregar(false);
        const lista = (data ?? []) as PessoaAnexo[];
        anexosRef.current = lista;
        setAnexos(lista);
      } catch (error) {
        if (cancelado) return;
        setErroCarregar(true);
        captureFlowError(error, "hr-pessoa-anexos-carregar");
      } finally {
        if (!cancelado) {
          chaveCarregada.current = chave;
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [pessoaId, organizationId, versao]);

  const obterUrl = useCallback((anexoId: string) => pedirUrlAnexo(anexoId), []);

  const recarregar = useCallback(() => {
    if (montado.current) setVersao((v) => v + 1);
  }, []);

  const executarEnvio = useCallback(
    async (
      tipo: TipoAnexoRh,
      file: File,
      substituiAnexoId?: string,
    ): Promise<ResultadoAccaoAnexo> => {
      if (!pessoaId) return { ok: false, codigo: "pessoa_nao_encontrada" };
      try {
        const resultado = await enviar(pessoaId, tipo, file, substituiAnexoId);
        return { ok: resultado.ok, codigo: resultado.codigo };
      } finally {
        // Mesmo a falhar: um `confirmar` sem resposta pode ter promovido o ficheiro.
        recarregar();
      }
    },
    [pessoaId, enviar, recarregar],
  );

  const anexar = useCallback(
    async (tipo: TipoAnexoRh, file: File): Promise<ResultadoAccaoAnexo> => {
      setErroLimite(null);
      const recusa =
        validarFicheiroLocal(tipo, file) ??
        verificarLimitesDeContagem(tipo, contarPorTipo(anexosRef.current));
      if (recusa) {
        setErroLimite({ tipo, codigo: recusa });
        return { ok: false, codigo: recusa };
      }
      return executarEnvio(tipo, file);
    },
    [executarEnvio],
  );

  // O limite de contagem nao se verifica aqui: o substituto sai no mesmo passo,
  // e quem decide e o servidor (`anexo_substituto_invalido`).
  const substituir = useCallback(
    async (anexoId: string, tipo: TipoAnexoRh, file: File): Promise<ResultadoAccaoAnexo> => {
      setErroLimite(null);
      return executarEnvio(tipo, file, anexoId);
    },
    [executarEnvio],
  );

  const remover = useCallback(
    async (anexoId: string): Promise<ResultadoAccaoAnexo> => {
      if (aRemoverRef.current.has(anexoId)) return { ok: false, codigo: null };
      aRemoverRef.current.add(anexoId);
      setARemover(new Set(aRemoverRef.current));
      setErrosRemocao((actuais) => {
        const { [anexoId]: _antigo, ...resto } = actuais;
        return resto;
      });
      try {
        const resposta = await removerAnexoRh(anexoId);
        if (!resposta.ok) {
          const codigo = resposta.codigo ?? CODIGO_FALHA_ENVIO_RH;
          if (montado.current) setErrosRemocao((actuais) => ({ ...actuais, [anexoId]: codigo }));
          return { ok: false, codigo };
        }
        return { ok: true, codigo: null };
      } finally {
        // Sucesso ou falha: a lista e a fonte de verdade (uma resposta perdida pode ter apagado).
        recarregar();
        aRemoverRef.current.delete(anexoId);
        if (montado.current) setARemover(new Set(aRemoverRef.current));
      }
    },
    [recarregar],
  );

  const limparErroRemocao = useCallback((anexoId: string) => {
    setErrosRemocao((actuais) => {
      const { [anexoId]: _tirado, ...resto } = actuais;
      return resto;
    });
  }, []);

  return {
    anexos,
    loading,
    recusado,
    erroCarregar,
    obterUrl,
    recarregar,
    anexar,
    substituir,
    remover,
    envios,
    descartarEnvio,
    aRemover,
    errosRemocao,
    limparErroRemocao,
    erroLimite,
  };
}

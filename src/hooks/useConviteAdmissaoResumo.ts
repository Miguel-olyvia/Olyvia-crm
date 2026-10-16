/**
 * O estado do convite de admissao mais recente de uma pessoa, para a ficha.
 *
 * Chama `rpc_hr_convite_admissao_resumo(uuid)` (V2, 20261210420000): e a UNICA
 * leitura do convite, porque `authenticated` ja nao le a tabela. Exige
 * `hr.pessoas.view` na organizacao da ficha. A funcao devolve so metadados --
 * NUNCA o token, o rascunho nem o IP -- e dois estados: o da ADMISSAO (os 11
 * estados, ou `terminado` mascarado para quem nao tem `hr.onboarding.restrito`)
 * e o do PORTAL (ativo, expirado, revogado, encerrado).
 *
 * Quando a ultima tentativa de submissao foi recusada por NIF ou NISS ja
 * registados noutra ficha, le tambem `rpc_hr_convite_admissao_conflitos`, que
 * diz QUE ficha os tem (so o nome e o id da ficha -- nunca o numero).
 *
 * Quem nao pode ver (42501) recebe `semAcesso`: o cartao nao aparece. Nao se
 * finge que nao ha convite.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { estadoAdmissaoDe, estadoPortalDe } from "@/lib/hr/estadoAdmissao";
import type { EstadoAdmissao, EstadoPortalConvite } from "@/types/hr";

export interface RecusaConvite {
  codigo: string;
  em: string | null;
  campos: string[];
}

export interface ResumoConvite {
  conviteId: string | null;
  /** O estado da admissao. */
  estado: EstadoAdmissao;
  /** O estado do portal (o link): derivado na base. */
  estadoPortal: EstadoPortalConvite;
  emailDestino: string | null;
  criadoEm: string | null;
  validUntil: string | null;
  portalEncerradoEm: string | null;
  /** `null` = o convite e anterior ao registo do envio: nao se sabe. */
  emailEnviado: boolean | null;
  emailErro: string | null;
  /** 10 ou mais aberturas falhadas do link. */
  bloqueado: boolean;
  ultimaRecusa: RecusaConvite | null;
}

export interface ConflitoConvite {
  pessoaId: string;
  nome: string;
  campo: "nif" | "niss";
  estado: "activa" | "apagada";
}

export interface EstadoConviteResumo {
  /** SO a primeira carga desta pessoa: nas recargas os dados anteriores mantem-se. */
  carregando: boolean;
  /** Uma recarga em curso (depois de uma gravacao): `resumo` ainda e o anterior. */
  recarregando: boolean;
  /** A base recusou por permissao: o cartao nao aparece. */
  semAcesso: boolean;
  erro: boolean;
  /** `null` quando a pessoa nunca teve convite. */
  resumo: ResumoConvite | null;
  /**
   * Foi preciso ler a ficha em conflito (recusa por NIF/NISS duplicado) e essa
   * leitura falhou: `conflitos` esta vazio por FALHA e nao por nao haver ficha.
   * O cartao diz "nao foi possivel identificar a ficha".
   */
  conflitosIndisponiveis: boolean;
  /** As fichas que ja tem o NIF/NISS da ultima tentativa recusada. */
  conflitos: ConflitoConvite[];
  recarregar: () => void;
}

function textoOuNull(valor: unknown): string | null {
  return typeof valor === "string" && valor !== "" ? valor : null;
}

function recusaDe(bruto: unknown): RecusaConvite | null {
  if (!bruto || typeof bruto !== "object") return null;
  const linha = bruto as { codigo?: unknown; em?: unknown; campos?: unknown };
  const codigo = textoOuNull(linha.codigo);
  if (!codigo) return null;
  return {
    codigo,
    em: textoOuNull(linha.em),
    campos: Array.isArray(linha.campos)
      ? linha.campos.filter((c): c is string => typeof c === "string")
      : [],
  };
}

/** Exportada para os testes: a forma da RPC -> a forma do ecra. */
export function resumoDaRpc(bruto: unknown): ResumoConvite | null {
  if (!bruto || typeof bruto !== "object") return null;
  const linha = bruto as Record<string, unknown>;
  if (linha.existe === false) return null;
  return {
    conviteId: textoOuNull(linha.convite_id),
    // Um valor que a V2 nao devolve (ou ausente) NAO e um estado aberto:
    // mostra-se como desconhecido, sem accoes, e regista-se (ver `carregar`).
    estado: estadoAdmissaoDe(linha.estado),
    estadoPortal: estadoPortalDe(linha.estado_portal),
    emailDestino: textoOuNull(linha.email_destino),
    criadoEm: textoOuNull(linha.criado_em),
    validUntil: textoOuNull(linha.valid_until),
    portalEncerradoEm: textoOuNull(linha.portal_encerrado_em),
    emailEnviado: typeof linha.email_enviado === "boolean" ? linha.email_enviado : null,
    emailErro: textoOuNull(linha.email_erro),
    bloqueado: linha.bloqueado === true,
    ultimaRecusa: recusaDe(linha.ultima_recusa),
  };
}

function conflitoDe(bruto: unknown): ConflitoConvite | null {
  if (!bruto || typeof bruto !== "object") return null;
  const linha = bruto as Record<string, unknown>;
  const pessoaId = textoOuNull(linha.pessoa_id);
  if (!pessoaId) return null;
  return {
    pessoaId,
    nome: textoOuNull(linha.nome_completo) ?? "",
    campo: linha.campo === "niss" ? "niss" : "nif",
    estado: linha.estado === "apagada" ? "apagada" : "activa",
  };
}

const RECUSAS_POR_DUPLICADO = new Set(["nif_ja_existe", "niss_ja_existe"]);

export function useConviteAdmissaoResumo(pessoaId: string | null): EstadoConviteResumo {
  const [carregando, setCarregando] = useState(true);
  const [recarregando, setRecarregando] = useState(false);
  const [semAcesso, setSemAcesso] = useState(false);
  const [erro, setErro] = useState(false);
  const [resumo, setResumo] = useState<ResumoConvite | null>(null);
  const [conflitos, setConflitos] = useState<ConflitoConvite[]>([]);
  const [conflitosIndisponiveis, setConflitosIndisponiveis] = useState(false);
  // So a resposta do pedido MAIS RECENTE conta (a ficha muda de pessoa sem
  // desmontar; duas gravacoes seguidas disparam duas recargas).
  const pedidoAtual = useRef(0);

  const carregar = useCallback(
    async (primeira: boolean) => {
      const pedido = ++pedidoAtual.current;
      const limpar = () => {
        setResumo(null);
        setConflitos([]);
        setConflitosIndisponiveis(false);
      };
      if (!pessoaId) {
        limpar();
        setSemAcesso(false);
        setErro(false);
        setCarregando(false);
        setRecarregando(false);
        return;
      }
      if (primeira) {
        // Outra pessoa: nada do que estava na memoria lhe pertence.
        limpar();
        setCarregando(true);
      }
      setRecarregando(true);
      setSemAcesso(false);
      setErro(false);
      try {
        const { data, error } = await hrRpc("rpc_hr_convite_admissao_resumo", {
          p_pessoa_id: pessoaId,
        });
        if (pedido !== pedidoAtual.current) return;
        if (error) {
          if (isPermissionError(error)) {
            setSemAcesso(true);
          } else {
            captureFlowError(error, "hr-convite-admissao-resumo");
            setErro(true);
          }
          limpar();
          return;
        }
        const lido = resumoDaRpc(data);
        if (lido?.estado === "desconhecido") {
          // O valor em si nao vai para o registo; o tipo da falha chega.
          captureFlowError(new Error("hr-convite-admissao-resumo: estado desconhecido"), "hr-convite-admissao-resumo");
        }

        // So se vai buscar a ficha em conflito quando a ultima recusa foi por
        // um numero duplicado: nos outros casos nao ha nada a abrir.
        let lidosConflitos: ConflitoConvite[] = [];
        let conflitosFalharam = false;
        if (lido?.ultimaRecusa && RECUSAS_POR_DUPLICADO.has(lido.ultimaRecusa.codigo)) {
          const { data: linhas, error: erroConflitos } = await hrRpc(
            "rpc_hr_convite_admissao_conflitos",
            { p_pessoa_id: pessoaId },
          );
          if (pedido !== pedidoAtual.current) return;
          if (erroConflitos) {
            // Sem a ficha em conflito o cartao continua a dizer que houve recusa,
            // e diz que nao conseguiu identificar a ficha.
            conflitosFalharam = true;
            if (!isPermissionError(erroConflitos)) {
              captureFlowError(erroConflitos, "hr-convite-admissao-conflitos");
            }
          } else {
            lidosConflitos = (Array.isArray(linhas) ? linhas : [])
              .map(conflitoDe)
              .filter((c): c is ConflitoConvite => c !== null);
          }
        }
        setResumo(lido);
        setConflitos(lidosConflitos);
        setConflitosIndisponiveis(conflitosFalharam);
      } catch (e) {
        if (pedido !== pedidoAtual.current) return;
        captureFlowError(e, "hr-convite-admissao-resumo");
        setErro(true);
        limpar();
      } finally {
        if (pedido === pedidoAtual.current) {
          setCarregando(false);
          setRecarregando(false);
        }
      }
    },
    [pessoaId],
  );

  useEffect(() => {
    void carregar(true);
    return () => {
      // Desmontar ou mudar de pessoa invalida o que ainda vem a caminho.
      pedidoAtual.current += 1;
    };
  }, [carregar]);

  // Estavel entre renders, para poder entrar em dependencias de efeitos.
  // Recarregar NAO limpa os dados nem poe `carregando`.
  const recarregar = useCallback(() => void carregar(false), [carregar]);

  return {
    carregando,
    recarregando,
    semAcesso,
    erro,
    resumo,
    conflitos,
    conflitosIndisponiveis,
    recarregar,
  };
}

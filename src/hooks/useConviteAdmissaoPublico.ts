/**
 * O lado PUBLICO do portal temporario da admissao: abrir o link em modo de consulta, pedir e
 * confirmar o codigo enviado por e-mail (OTP), ler o que a sessao permite, gravar o rascunho (com
 * NISS e IBAN a seguir com o formulario), submeter e terminar a sessao. Tudo pela Edge Function
 * `convite-admissao`, nunca directamente com a base (as RPCs sao so `service_role`). Os contratos
 * exactos estao em `supabase/functions/convite-admissao/accoesPortal.ts` e `handler.ts`.
 *
 * ESCREVER EXIGE SESSAO. O link sozinho nao escreve: `gravarRascunho` e `submeter` sem sessao nem
 * chegam a Edge. Os anexos continuam desactivados (a Edge responde 410 `portal_em_atualizacao`).
 *
 * A SESSAO
 *  - nasce em `otp_verificar` (o segredo vem no corpo da resposta, uma so vez) e volta nos
 *    pedidos seguintes no cabecalho `x-portal-sessao`; nunca no corpo, nunca no URL;
 *  - guarda-se SO em memoria (ver `portalSessao.ts`): nem localStorage nem sessionStorage;
 *    acaba ao fechar ou recarregar o separador, ao sair do ecra, ao terminar, ou quando a Edge a recusa;
 *  - acaba no cliente apos 30 min sem actividade (4 h no maximo), sem esperar pela Edge; os
 *    5 min antes disso `sessaoAExpirar` fica verdadeiro, para o ecra avisar e oferecer
 *    `manterSessao`. A base e quem decide de facto.
 *
 * O QUE NUNCA SAI DAQUI
 *  - o token do link vive so nesta chamada e no endereco; nao se copia para armazenamento;
 *  - nada com token, sessao ou corpo de resposta vai para o registo de erros (so
 *    `operacao: codigo`); nunca `error.details`;
 *  - o codigo OTP nao fica em nenhum estado: passa por `verificarCodigo` e acaba;
 *  - NISS e IBAN completos nao ficam em nenhum estado do hook: so os 4 ultimos digitos que a Edge
 *    devolve. Seguem no pedido de gravacao (e na submissao) apenas quando passam a validacao de
 *    formato e mudaram desde o ultimo envio; nunca dentro do rascunho, nunca em armazenamento, nunca
 *    no registo de erros, e nunca no pedido de `gravarRascunhoAoFechar` (ninguem o confirma).
 *
 * Os motivos de recusa chegam em `error.context` (supabase-js devolve `data = null` em
 * 401/409/429): `corpoDeErroEdge` le os dois sitios.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { camposDeAdmissaoIncompleta, corpoDeErroEdge, type CorpoErroEdge } from "@/lib/hr/errosAdmissao";
import { contaValida } from "@/lib/hr/conta";
import { nissValido } from "@/lib/hr/identificadoresPt";
import {
  AVISO_EXPIRAR_MS,
  CODIGOS_DE_SESSAO_PERDIDA,
  ESPERA_REENVIO_MS,
  INATIVIDADE_MS,
  TETO_SESSAO_MS,
  estadoPermiteEditar,
  mascararEmail,
  normalizarConvite,
  normalizarPortalLer,
  type ConvitePublico,
  type PortalLer,
} from "@/lib/hr/portalAdmissao";
import { guardarSessao, lerSessao, limparSessao } from "@/lib/hr/portalSessao";

export const CABECALHO_SESSAO = "x-portal-sessao";
const ORIGEM_REGISTO = "hr-convite-admissao-publico";
/** De quanto em quanto tempo se confere o relogio da sessao. */
const CONFERIR_SESSAO_MS = 2000;
const FORMATO_SESSAO = /^[A-Za-z0-9_-]{43}$/;
const FORMATO_CODIGO = /^[0-9]{6}$/;

export type AvisoPortal = "terminada" | "expirada" | "substituida";

export interface EstadoOtp {
  /** Ja ha um codigo enviado (ou pedido ha pouco): pode escrever-se. */
  pedido: boolean;
  aPedir: boolean;
  aVerificar: boolean;
  /** So se a Edge o mandar, e sempre mascarado. */
  emailMascarado: string | null;
  /** Instante (ms) a partir do qual se pode pedir outro codigo. */
  reenviarApos: number | null;
  /** Tentativas que restam depois de um codigo errado. */
  restantes: number | null;
  bloqueado: boolean;
  /** O ultimo erro, como codigo do catalogo (o ecra traduz). */
  erro: string | null;
}

const OTP_INICIAL: EstadoOtp = {
  pedido: false,
  aPedir: false,
  aVerificar: false,
  emailMascarado: null,
  reenviarApos: null,
  restantes: null,
  bloqueado: false,
  erro: null,
};

/** O que o ecra entrega a par do rascunho: o valor tal como esta no campo; o hook valida e decide o que segue. */
export interface SensiveisParaGravar {
  niss?: string;
  iban?: string;
}

/** `codigo` so existe quando `ok` e falso (o tsconfig nao tem `strictNullChecks`: sem uniao discriminada). */
export interface ResultadoRascunho {
  ok: boolean;
  codigo?: string;
  /** A hora que a Edge devolveu (ISO); nunca a do relogio do browser. */
  guardadoEm?: string;
  /** A base recusou o NISS ou o IBAN (`niss_invalido`, `iban_invalido`, `campo_bloqueado`); o rascunho ficou gravado. */
  sensivelRecusado?: string;
  /** O NISS (IBAN) esta no cofre: o ecra ja pode limpar o campo e mostrar so os 4 ultimos digitos. */
  nissGuardado?: boolean;
  ibanGuardado?: boolean;
}

export interface ResultadoSubmissao {
  ok: boolean;
  codigo?: string;
  /** Em `admissao_incompleta`: os codigos dos campos em falta. */
  campos?: string[];
}

/** O que o formulario do portal precisa do hook para escrever (as paginas passam-no tal como o hook o devolve). */
export interface EscritaPortal {
  gravarRascunho: (rascunho: Record<string, unknown>, sensiveis?: SensiveisParaGravar) => Promise<ResultadoRascunho>;
  gravarRascunhoAoFechar: (rascunho: Record<string, unknown>) => void;
  submeter: (dados: Record<string, unknown>, assinaturaNome: string) => Promise<ResultadoSubmissao>;
  rascunhoGuardadoEm: string | null;
  aGravar: boolean;
  erroRascunho: string | null;
}

/** O que nunca viaja dentro do rascunho: vive no cofre (NISS, IBAN) ou nunca se grava (a declaracao). */
const FORA_DO_RASCUNHO: readonly string[] = ["niss", "iban", "conta_numero", "aceite"];

function semSensiveis(rascunho: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(rascunho).filter(([chave]) => !FORA_DO_RASCUNHO.includes(chave)));
}

interface UltimosEnviados {
  niss: string | null;
  iban: string | null;
}

interface SensiveisPreparados {
  /** So o que e valido e diferente do ultimo envio. */
  aEnviar: { niss?: string; iban?: string };
  /** Valido e igual ao ultimo envio: ja esta no cofre. */
  nissJaGuardado: boolean;
  ibanJaGuardado: boolean;
}

/** O NISS sem espacos; o IBAN sem espacos e em maiusculas (como o convite antigo). */
function prepararSensiveis(entrada: SensiveisParaGravar | undefined, enviados: UltimosEnviados): SensiveisPreparados {
  const preparados: SensiveisPreparados = { aEnviar: {}, nissJaGuardado: false, ibanJaGuardado: false };
  const niss = (entrada?.niss ?? "").replace(/\s+/g, "");
  if (niss !== "" && nissValido(niss)) {
    if (niss === enviados.niss) preparados.nissJaGuardado = true;
    else preparados.aEnviar.niss = niss;
  }
  const iban = (entrada?.iban ?? "").replace(/\s+/g, "").toUpperCase();
  if (iban !== "" && contaValida("iban", iban)) {
    if (iban === enviados.iban) preparados.ibanJaGuardado = true;
    else preparados.aEnviar.iban = iban;
  }
  return preparados;
}

interface PedidoRascunho {
  rascunho: Record<string, unknown>;
  sensiveis: SensiveisParaGravar | undefined;
  resolvers: Array<(r: ResultadoRascunho) => void>;
}

interface RespostaOk {
  ok: true;
  data: Record<string, unknown>;
}
interface RespostaErro {
  ok: false;
  codigo: string;
  corpo: CorpoErroEdge | null;
}
type Resposta = RespostaOk | RespostaErro;

/** Sem `strictNullChecks` o `if (r.ok)` nao estreita a uniao: este guarda de tipo sim. */
function deuErro(r: Resposta): r is RespostaErro {
  return r.ok === false;
}

function eObjecto(valor: unknown): valor is Record<string, unknown> {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor);
}

/** O registo recebe so a operacao e o codigo, nunca o objecto original (traz o corpo e o token). */
function erroSemDados(operacao: string, codigo: string | null): Error {
  return new Error(`${operacao}: ${codigo ?? "falha_de_rede"}`);
}

export function useConviteAdmissaoPublico(token: string | undefined) {
  const [carregando, setCarregando] = useState(true);
  const [erroInicial, setErroInicial] = useState<string | null>(null);
  const [convite, setConvite] = useState<ConvitePublico | null>(null);
  const [sessaoAtiva, setSessaoAtiva] = useState(false);
  const [dados, setDados] = useState<PortalLer | null>(null);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [aviso, setAviso] = useState<AvisoPortal | null>(null);
  const [otp, setOtp] = useState<EstadoOtp>(OTP_INICIAL);
  const [sessaoAExpirar, setSessaoAExpirar] = useState(false);
  const [rascunhoGuardadoEm, setRascunhoGuardadoEm] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const [erroRascunho, setErroRascunho] = useState<string | null>(null);
  const [concluido, setConcluido] = useState(false);

  // Fila de uma gravacao de cada vez: a que esta em curso, e a ultima que ficou a espera.
  const emCursoRef = useRef(false);
  const pendenteRef = useRef<PedidoRascunho | null>(null);
  const submetendoRef = useRef(false);
  const concluidoRef = useRef(false);
  // O ultimo NISS/IBAN que a Edge aceitou, so em memoria (para nao os reenviar sem mudarem).
  const enviadosRef = useRef<UltimosEnviados>({ niss: null, iban: null });

  const inicioRef = useRef(0);
  const atividadeRef = useRef(0);
  const montadoRef = useRef(true);
  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
    };
  }, []);

  /** Uma chamada a Edge; a sessao so vai quando se pede e existe. Nunca lanca. */
  const chamar = useCallback(
    async (accao: string, extra: Record<string, unknown> = {}, comSessao = false): Promise<Resposta> => {
      const opcoes: { body: Record<string, unknown>; headers?: Record<string, string> } = {
        body: { action: accao, token, ...extra },
      };
      const sessao = comSessao ? lerSessao() : null;
      if (sessao) opcoes.headers = { [CABECALHO_SESSAO]: sessao };
      try {
        const { data, error } = await supabase.functions.invoke("convite-admissao", opcoes);
        if (error || data?.error) {
          const corpo = await corpoDeErroEdge(error, data);
          const codigo = corpo?.error ?? null;
          // Recusas de negocio nao sao defeitos: so o inesperado ou sem corpo vai para o registo.
          if (codigo === null || codigo === "erro_inesperado") captureFlowError(erroSemDados(accao, codigo), ORIGEM_REGISTO);
          return { ok: false, codigo: codigo ?? "erro_inesperado", corpo };
        }
        return { ok: true, data: eObjecto(data) ? data : {} };
      } catch {
        captureFlowError(erroSemDados(accao, null), ORIGEM_REGISTO);
        return { ok: false, codigo: "erro_inesperado", corpo: null };
      }
    },
    [token],
  );

  const carregarEstado = useCallback(
    async (comSessao: boolean): Promise<ConvitePublico | null> => {
      const r = await chamar("estado", {}, comSessao);
      if (!montadoRef.current) return null;
      if (deuErro(r)) {
        // Sem corpo (rede, 5xx): o mesmo que um link que nao serve, em texto.
        setErroInicial(r.corpo ? r.codigo : "convite_invalido");
        setConvite(null);
        return null;
      }
      const c = normalizarConvite(r.data.convite);
      setErroInicial(null);
      setConvite(c);
      return c;
    },
    [chamar],
  );

  /** Acaba a sessao so no cliente: apaga o segredo, os dados e o estado do codigo. */
  const encerrarLocalmente = useCallback(
    async (motivo: AvisoPortal) => {
      limparSessao();
      if (!montadoRef.current) return;
      setSessaoAtiva(false);
      setSessaoAExpirar(false);
      setDados(null);
      setErroLeitura(null);
      setOtp(OTP_INICIAL);
      setErroRascunho(null);
      setRascunhoGuardadoEm(null);
      setAviso(motivo);
      // O estado volta a pedir-se SEM a sessao morta: `precisa_otp` passa a verdadeiro.
      await carregarEstado(false);
    },
    [carregarEstado],
  );

  /** Le o que a sessao permite. `true` se a sessao continua de pe. */
  const lerComSessao = useCallback(async (): Promise<boolean> => {
    const r = await chamar("ler", {}, true);
    if (!montadoRef.current) return false;
    if (!deuErro(r)) {
      atividadeRef.current = Date.now();
      setDados(normalizarPortalLer(r.data));
      setErroLeitura(null);
      setSessaoAExpirar(false);
      return true;
    }
    if (CODIGOS_DE_SESSAO_PERDIDA.includes(r.codigo)) {
      await encerrarLocalmente(r.codigo === "sessao_substituida" ? "substituida" : "expirada");
      return false;
    }
    setErroLeitura(r.codigo);
    return true;
  }, [chamar, encerrarLocalmente]);

  const abrirSessao = useCallback(
    async (sessao: string): Promise<boolean> => {
      guardarSessao(sessao);
      const agora = Date.now();
      inicioRef.current = agora;
      atividadeRef.current = agora;
      setSessaoAtiva(true);
      setAviso(null);
      const continua = await lerComSessao();
      return continua && lerSessao() !== null;
    },
    [lerComSessao],
  );

  // Ao abrir (ou ao mudar de link): SEM sessao, so o estado. Uma sessao nunca sobrevive a um ecra nem a
  // um link: recarregar ou abrir noutro separador obriga a confirmar o codigo de novo.
  useEffect(() => {
    let cancelado = false;
    limparSessao();
    setSessaoAtiva(false);
    setSessaoAExpirar(false);
    setDados(null);
    setErroLeitura(null);
    setAviso(null);
    setOtp(OTP_INICIAL);
    setRascunhoGuardadoEm(null);
    setErroRascunho(null);
    setAGravar(false);
    setConcluido(false);
    concluidoRef.current = false;
    submetendoRef.current = false;
    pendenteRef.current = null;
    enviadosRef.current = { niss: null, iban: null };
    (async () => {
      if (!token) {
        setErroInicial("convite_invalido");
        setCarregando(false);
        return;
      }
      setCarregando(true);
      await carregarEstado(false);
      if (!cancelado) setCarregando(false);
    })();
    return () => {
      cancelado = true;
      limparSessao();
    };
    // `carregarEstado` so muda com o token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // O relogio da sessao: aviso 5 min antes do fim e fim local sem esperar pela Edge.
  useEffect(() => {
    if (!sessaoAtiva) return;
    const id = setInterval(() => {
      const agora = Date.now();
      const restoInatividade = INATIVIDADE_MS - (agora - atividadeRef.current);
      const restoTeto = TETO_SESSAO_MS - (agora - inicioRef.current);
      const resto = Math.min(restoInatividade, restoTeto);
      if (resto <= 0) void encerrarLocalmente("expirada");
      else setSessaoAExpirar(resto <= AVISO_EXPIRAR_MS);
    }, CONFERIR_SESSAO_MS);
    return () => clearInterval(id);
  }, [sessaoAtiva, encerrarLocalmente]);

  const pedirCodigo = useCallback(async (): Promise<void> => {
    setOtp((o) => ({ ...o, aPedir: true, erro: null }));
    const r = await chamar("otp_pedir");
    if (!montadoRef.current) return;
    if (!deuErro(r)) {
      setOtp({
        ...OTP_INICIAL,
        pedido: true,
        emailMascarado: mascararEmail(r.data.email_mascarado),
        reenviarApos: Date.now() + ESPERA_REENVIO_MS,
      });
      return;
    }
    if (r.codigo.startsWith("convite_")) {
      setErroInicial(r.codigo);
      setOtp(OTP_INICIAL);
      return;
    }
    // `otp_espera`: ja ha um codigo a caminho, escreve-se esse; so se espera para pedir outro.
    const jaEnviado = r.codigo === "otp_espera";
    setOtp((o) => ({
      ...o,
      aPedir: false,
      pedido: o.pedido || jaEnviado,
      reenviarApos: jaEnviado ? Date.now() + ESPERA_REENVIO_MS : o.reenviarApos,
      erro: r.codigo,
    }));
  }, [chamar]);

  const verificarCodigo = useCallback(
    async (codigoBruto: string): Promise<boolean> => {
      const codigo = codigoBruto.replace(/[\s-]/g, "");
      if (!FORMATO_CODIGO.test(codigo)) {
        setOtp((o) => ({ ...o, erro: "pedido_invalido" }));
        return false;
      }
      setOtp((o) => ({ ...o, aVerificar: true, erro: null }));
      const r = await chamar("otp_verificar", { codigo });
      if (!montadoRef.current) return false;
      if (!deuErro(r)) {
        const sessao = r.data.sessao;
        if (typeof sessao !== "string" || !FORMATO_SESSAO.test(sessao)) {
          captureFlowError(erroSemDados("otp_verificar", "sessao_invalida"), ORIGEM_REGISTO);
          setOtp((o) => ({ ...o, aVerificar: false, erro: "erro_inesperado" }));
          return false;
        }
        guardarSessao(sessao);
        setOtp(OTP_INICIAL);
        return abrirSessao(sessao);
      }
      if (r.codigo.startsWith("convite_")) {
        setErroInicial(r.codigo);
        setOtp(OTP_INICIAL);
        return false;
      }
      const restantes = typeof r.corpo?.restantes === "number" ? r.corpo.restantes : null;
      setOtp((o) => ({
        ...o,
        aVerificar: false,
        erro: r.codigo,
        restantes: r.codigo === "otp_invalido" ? restantes : o.restantes,
        // A 6.a tentativa da bloqueado mesmo com o codigo certo: sem tentativas, so um codigo novo serve.
        bloqueado: r.codigo === "otp_bloqueado" || (r.codigo === "otp_invalido" && restantes === 0),
      }));
      return false;
    },
    [chamar, abrirSessao],
  );

  const terminarSessao = useCallback(async (): Promise<void> => {
    // Mesmo que a Edge falhe, a sessao local acaba: o que importa e deixar de mostrar os dados.
    if (lerSessao()) await chamar("sair", {}, true);
    await encerrarLocalmente("terminada");
  }, [chamar, encerrarLocalmente]);

  const manterSessao = useCallback(async (): Promise<void> => {
    if (!lerSessao()) return;
    await lerComSessao();
  }, [lerComSessao]);

  /** Uma recusa que acaba a sessao: limpa tudo no cliente e volta a consulta. */
  const tratarSessaoPerdida = useCallback(
    async (codigo: string): Promise<boolean> => {
      if (!CODIGOS_DE_SESSAO_PERDIDA.includes(codigo)) return false;
      await encerrarLocalmente(codigo === "sessao_substituida" ? "substituida" : "expirada");
      return true;
    },
    [encerrarLocalmente],
  );

  /** Um pedido `rascunho` (o rascunho e, se for caso disso, o NISS e o IBAN). Nunca lanca. */
  const enviarRascunho = useCallback(
    async (rascunho: Record<string, unknown>, sensiveis: SensiveisParaGravar | undefined): Promise<ResultadoRascunho> => {
      const preparados = prepararSensiveis(sensiveis, enviadosRef.current);
      const r = await chamar("rascunho", { rascunho: semSensiveis(rascunho), ...preparados.aEnviar }, true);
      if (!montadoRef.current) return { ok: false, codigo: "erro_inesperado" };
      if (deuErro(r)) {
        if (await tratarSessaoPerdida(r.codigo)) return { ok: false, codigo: r.codigo };
        setErroRascunho(r.codigo);
        return { ok: false, codigo: r.codigo };
      }
      atividadeRef.current = Date.now();
      setSessaoAExpirar(false);
      const guardadoEm =
        typeof r.data.guardado_em === "string" && !Number.isNaN(Date.parse(r.data.guardado_em)) ? r.data.guardado_em : undefined;
      const sensivelRecusado = typeof r.data.sensivel_recusado === "string" ? r.data.sensivel_recusado : undefined;
      const nissUltimos4 = typeof r.data.niss_ultimos4 === "string" ? r.data.niss_ultimos4 : null;
      const ibanUltimos4 = typeof r.data.iban_ultimos4 === "string" ? r.data.iban_ultimos4 : null;
      const nissGuardado =
        preparados.nissJaGuardado || (preparados.aEnviar.niss !== undefined && !sensivelRecusado && nissUltimos4 !== null);
      const ibanGuardado =
        preparados.ibanJaGuardado || (preparados.aEnviar.iban !== undefined && !sensivelRecusado && ibanUltimos4 !== null);
      if (nissGuardado && preparados.aEnviar.niss !== undefined) enviadosRef.current.niss = preparados.aEnviar.niss;
      if (ibanGuardado && preparados.aEnviar.iban !== undefined) enviadosRef.current.iban = preparados.aEnviar.iban;
      if (guardadoEm) setRascunhoGuardadoEm(guardadoEm);
      // O rascunho ficou gravado mesmo que o NISS/IBAN tenha sido recusado: o erro dele aparece, nao se engole.
      setErroRascunho(sensivelRecusado ?? null);
      setDados((d) =>
        d ? { ...d, niss_ultimos4: nissUltimos4 ?? d.niss_ultimos4, iban_ultimos4: ibanUltimos4 ?? d.iban_ultimos4 } : d,
      );
      return { ok: true, guardadoEm, sensivelRecusado, nissGuardado, ibanGuardado };
    },
    [chamar, tratarSessaoPerdida],
  );

  /** Despacha a fila: corre o pedido e, enquanto houver um a esperar, o ultimo que ficou. */
  const correrFila = useCallback(
    async (primeiro: PedidoRascunho): Promise<void> => {
      emCursoRef.current = true;
      setAGravar(true);
      try {
        let atual: PedidoRascunho | null = primeiro;
        while (atual) {
          const resultado = await enviarRascunho(atual.rascunho, atual.sensiveis);
          atual.resolvers.forEach((resolver) => resolver(resultado));
          const seguinte: PedidoRascunho | null = pendenteRef.current;
          pendenteRef.current = null;
          if (seguinte && (concluidoRef.current || !lerSessao() || !montadoRef.current)) {
            seguinte.resolvers.forEach((resolver) => resolver({ ok: false, codigo: "sessao_ausente" }));
            atual = null;
          } else {
            atual = seguinte;
          }
        }
      } finally {
        emCursoRef.current = false;
        if (montadoRef.current) setAGravar(false);
      }
    },
    [enviarRascunho],
  );

  /**
   * Grava o rascunho (e o NISS e o IBAN que tenham passado a validacao). Uma de cada vez: se ja ha uma em
   * curso, esta espera e, havendo varias, so a ultima vai (o NISS/IBAN das ultrapassadas junta-se-lhe).
   */
  const gravarRascunho = useCallback(
    (rascunho: Record<string, unknown>, sensiveis?: SensiveisParaGravar): Promise<ResultadoRascunho> => {
      if (!lerSessao()) return Promise.resolve({ ok: false, codigo: "sessao_ausente" });
      if (concluidoRef.current) return Promise.resolve({ ok: false, codigo: "convite_ja_usado" });
      return new Promise<ResultadoRascunho>((resolve) => {
        if (emCursoRef.current) {
          const anterior = pendenteRef.current;
          pendenteRef.current = {
            rascunho,
            sensiveis: anterior?.sensiveis || sensiveis ? { ...anterior?.sensiveis, ...sensiveis } : undefined,
            resolvers: [...(anterior?.resolvers ?? []), resolve],
          };
          return;
        }
        void correrFila({ rascunho, sensiveis, resolvers: [resolve] });
      });
    },
    [correrFila],
  );

  /**
   * Ao fechar o separador: um pedido com `keepalive`, que sobrevive a pagina. Sem NISS nem IBAN (ninguem
   * confirma este pedido) e sem fila. Se falhar nao ha ninguem para o ver: o proximo rascunho volta a tentar.
   * A sessao vai no cabecalho `x-portal-sessao`, nunca no corpo nem no URL.
   */
  const gravarRascunhoAoFechar = useCallback(
    (rascunho: Record<string, unknown>): void => {
      const sessao = lerSessao();
      const base = import.meta.env.VITE_SUPABASE_URL;
      const chave = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (!sessao || !token || !base || !chave || concluidoRef.current) return;
      void fetch(`${base}/functions/v1/convite-admissao`, {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json", apikey: chave, Authorization: `Bearer ${chave}`, [CABECALHO_SESSAO]: sessao },
        body: JSON.stringify({ action: "rascunho", token, rascunho: semSensiveis(rascunho) }),
      }).catch(() => undefined);
    },
    [token],
  );

  /**
   * Submete a admissao. `dados` e o payload do contrato; o NISS e o IBAN que la venham so seguem se forem
   * validos e novos (os que ja estao no cofre nao se reenviam). Sucesso: a base fechou o portal, por isso a
   * sessao acaba aqui sem chamar `sair` (daria `convite_ja_usado`).
   */
  const submeter = useCallback(
    async (dados: Record<string, unknown>, assinaturaNome: string): Promise<ResultadoSubmissao> => {
      if (!lerSessao()) return { ok: false, codigo: "sessao_ausente" };
      if (submetendoRef.current || concluidoRef.current) return { ok: false, codigo: "pedido_invalido" };
      const assinatura = assinaturaNome.trim();
      if (assinatura === "") return { ok: false, codigo: "assinatura_obrigatoria" };
      submetendoRef.current = true;
      try {
        const { niss, iban, ...resto } = dados;
        const preparados = prepararSensiveis(
          { niss: typeof niss === "string" ? niss : undefined, iban: typeof iban === "string" ? iban : undefined },
          enviadosRef.current,
        );
        const r = await chamar(
          "submeter",
          { dados: { ...resto, ...preparados.aEnviar }, assinatura_nome: assinatura, declaracao: true },
          true,
        );
        if (!montadoRef.current) return { ok: false, codigo: "erro_inesperado" };
        if (deuErro(r)) {
          if (await tratarSessaoPerdida(r.codigo)) return { ok: false, codigo: r.codigo };
          const campos = r.codigo === "admissao_incompleta" ? camposDeAdmissaoIncompleta(r.corpo ?? {}) : undefined;
          return campos ? { ok: false, codigo: r.codigo, campos } : { ok: false, codigo: r.codigo };
        }
        concluidoRef.current = true;
        const esperando = pendenteRef.current;
        pendenteRef.current = null;
        esperando?.resolvers.forEach((resolver) => resolver({ ok: false, codigo: "convite_ja_usado" }));
        limparSessao();
        setConcluido(true);
        setSessaoAtiva(false);
        setSessaoAExpirar(false);
        setDados(null);
        setErroLeitura(null);
        setErroRascunho(null);
        setOtp(OTP_INICIAL);
        return { ok: true };
      } finally {
        submetendoRef.current = false;
      }
    },
    [chamar, tratarSessaoPerdida],
  );

  const limparAviso = useCallback(() => setAviso(null), []);

  return {
    carregando,
    erroInicial,
    convite,
    sessaoAtiva,
    dados,
    erroLeitura,
    aviso,
    otp,
    sessaoAExpirar,
    pedirCodigo,
    verificarCodigo,
    terminarSessao,
    manterSessao,
    rascunhoGuardadoEm,
    aGravar,
    erroRascunho,
    concluido,
    gravarRascunho,
    gravarRascunhoAoFechar,
    submeter,
    limparAviso,
  };
}

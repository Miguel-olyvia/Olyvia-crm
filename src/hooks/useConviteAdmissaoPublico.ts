/**
 * O lado PUBLICO do portal temporario da admissao (V3a): abrir o link em modo de consulta,
 * pedir e confirmar o codigo enviado por e-mail (OTP), ler o que a sessao permite, gravar
 * NISS e IBAN e terminar a sessao. Tudo pela Edge Function `convite-admissao`, nunca
 * directamente com a base (as RPCs sao so `service_role`). Os contratos exactos estao em
 * `supabase/functions/convite-admissao/accoesPortal.ts` e `handler.ts`.
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
 *  - NISS e IBAN completos nao ficam em nenhum estado: so os 4 ultimos digitos que a Edge devolve.
 *
 * Os motivos de recusa chegam em `error.context` (supabase-js devolve `data = null` em
 * 401/409/429): `corpoDeErroEdge` le os dois sitios.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { corpoDeErroEdge, type CorpoErroEdge } from "@/lib/hr/errosAdmissao";
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

/** `codigo` so existe quando `ok` e falso (o tsconfig nao tem `strictNullChecks`: sem uniao discriminada). */
export interface ResultadoSensiveis {
  ok: boolean;
  codigo?: string;
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

  const gravarSensiveis = useCallback(
    async (valores: { niss?: string; iban?: string }): Promise<ResultadoSensiveis> => {
      if (!lerSessao()) return { ok: false, codigo: "sessao_ausente" };
      const niss = valores.niss?.trim() ?? "";
      const iban = valores.iban?.trim() ?? "";
      if (niss === "" && iban === "") return { ok: false, codigo: "pedido_invalido" };
      const extra: Record<string, unknown> = {};
      if (niss !== "") extra.niss = niss;
      if (iban !== "") extra.iban = iban;

      const r = await chamar("sensiveis", extra, true);
      if (!montadoRef.current) return { ok: false, codigo: "erro_inesperado" };
      if (deuErro(r)) {
        if (CODIGOS_DE_SESSAO_PERDIDA.includes(r.codigo)) {
          await encerrarLocalmente(r.codigo === "sessao_substituida" ? "substituida" : "expirada");
        }
        return { ok: false, codigo: r.codigo };
      }
      atividadeRef.current = Date.now();
      setSessaoAExpirar(false);
      const nissUltimos4 = typeof r.data.niss_ultimos4 === "string" ? r.data.niss_ultimos4 : null;
      const ibanUltimos4 = typeof r.data.iban_ultimos4 === "string" ? r.data.iban_ultimos4 : null;
      setDados((d) =>
        d ? { ...d, niss_ultimos4: nissUltimos4 ?? d.niss_ultimos4, iban_ultimos4: ibanUltimos4 ?? d.iban_ultimos4 } : d,
      );
      return { ok: true };
    },
    [chamar, encerrarLocalmente],
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
    gravarSensiveis,
    limparAviso,
  };
}

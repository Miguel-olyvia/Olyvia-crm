// A fonte em memória: a loja de exemplo (`loja.ts`) a cumprir o contrato `FonteDenuncias`. É o que vale quando nenhum
// fornecedor está montado, e é o que os testes usam. NUNCA é montada na aplicação real (ver `App.tsx`).
import { useMemo } from "react";
import type { ResultadoAcao } from "../lib/acoes";
import { acederComCodigo } from "../lib/codigos";
import { HOJE_EXEMPLO } from "../lib/datas";
import { denunciasDaPessoa, porConfirmar } from "../lib/organizacao";
import type { Denuncia } from "../lib/tipos";
import type { FonteDenuncias, Leitura, ResultadoEntrada, ResultadoIdentidade, ResultadoSimples, ResultadoSubmissao } from "./fonte";
import { RESPONSAVEIS } from "./exemplo";
import {
  arquivarDenuncia, atribuirA, concluirDenuncia, confirmarRececaoDe, declararConflitoDe, denunciasDaOrganizacao, enviarMensagemA,
  lerDenuncias, marcarVisadoDe, mudarGravidade, notaEm, pedirInformacaoEm, reabrirDenuncia, responderComoDenunciante, submeter,
  useDenuncia as useDenunciaLoja, useDenunciasDaOrganizacao, verIdentidade as verIdentidadeLoja,
} from "./loja";
import { organizacaoPublica } from "./organizacoes";

const SEM_FUNCAO = (): void => undefined;
const MIN_MOTIVO_IDENTIDADE = 3;

const lida = <T,>(dados: T): Leitura<T> => ({ dados, estado: "ok", recarregar: SEM_FUNCAO });
const assincrona = <A extends unknown[]>(f: (...a: A) => ResultadoAcao) => (...a: A): Promise<ResultadoAcao> => Promise.resolve(f(...a));

const RESPONSAVEIS_DE_EXEMPLO = { lista: [...RESPONSAVEIS], euId: null };

export const fonteMemoria: FonteDenuncias = {
  modo: "memoria",
  anexosReais: true,
  hoje: () => HOJE_EXEMPLO,

  useDenuncias: (organizationId) => {
    const dados = useDenunciasDaOrganizacao(organizationId);
    return useMemo(() => lida(dados), [dados]);
  },
  useMinhas: (organizationId, pessoaId) => {
    const todas = useDenunciasDaOrganizacao(organizationId);
    return useMemo(() => lida(denunciasDaPessoa(todas, organizationId, pessoaId)), [todas, organizationId, pessoaId]);
  },
  useDenuncia: (id) => {
    const dados: Denuncia | undefined = useDenunciaLoja(id);
    return useMemo(() => lida(dados), [dados]);
  },
  usePorConfirmar: (organizationId) => porConfirmar(useDenunciasDaOrganizacao(organizationId)),
  useResponsaveis: () => useMemo(() => lida(RESPONSAVEIS_DE_EXEMPLO), []),
  useConfiguracao: () => useMemo(() => lida(null), []),
  useCanalPublico: (parametro) => {
    const o = organizacaoPublica(parametro);
    return { estado: "ok", id: o.id, nome: o.nome };
  },

  submeter: (f, origem) => {
    const { codigo, pin } = submeter(f, { organizationId: origem.organizationId, pessoaId: origem.pessoaId });
    return Promise.resolve<ResultadoSubmissao>({ ok: true, codigo, pin });
  },
  entrar: ({ codigo, pin, organizacaoId }) => {
    const d = acederComCodigo(organizacaoId ? denunciasDaOrganizacao(organizacaoId) : lerDenuncias(), codigo, pin);
    return Promise.resolve<ResultadoEntrada>(d ? { ok: true, id: d.id } : { ok: false, erro: "invalido" });
  },
  sair: SEM_FUNCAO,
  responderComoDenunciante: (id, texto, anexos) => Promise.resolve(responderComoDenunciante(id, texto, anexos)),

  confirmarRececaoDe: assincrona(confirmarRececaoDe),
  atribuirA: assincrona(atribuirA),
  declararConflitoDe: assincrona(declararConflitoDe),
  marcarVisadoDe: assincrona(marcarVisadoDe),
  enviarMensagemA: assincrona(enviarMensagemA),
  pedirInformacaoEm: assincrona(pedirInformacaoEm),
  mudarGravidade: assincrona(mudarGravidade),
  notaEm: assincrona(notaEm),
  concluirDenuncia: assincrona(concluirDenuncia),
  arquivarDenuncia: assincrona(arquivarDenuncia),
  reabrirDenuncia: assincrona(reabrirDenuncia),
  verIdentidade: (id, motivo): Promise<ResultadoIdentidade> => {
    if (motivo.trim().length < MIN_MOTIVO_IDENTIDADE) return Promise.resolve<ResultadoIdentidade>({ ok: false, erro: "motivo_identidade" });
    const identidade = verIdentidadeLoja(id);
    return Promise.resolve<ResultadoIdentidade>(identidade ? { ok: true, identidade } : { ok: false, erro: "anonima" });
  },

  guardarCanal: () => Promise.resolve<ResultadoSimples>({ ok: false, erro: "sem_permissao" }),
  designarResponsavel: () => Promise.resolve<ResultadoSimples>({ ok: false, erro: "sem_permissao" }),
  removerResponsavel: () => Promise.resolve<ResultadoSimples>({ ok: false, erro: "sem_permissao" }),
};

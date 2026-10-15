// A loja em memória do canal de denúncias de exemplo (useSyncExternalStore). Nada aqui fala com lado nenhum: recarregar
// a página, ou chamar `repor()`, volta aos dados de exemplo. O rascunho do formulário vive no módulo `rascunho.ts`.
import { useMemo, useSyncExternalStore } from "react";
import {
  adicionarNota, alterarGravidade, arquivar, atribuirResponsavel, concluir, confirmarRececao, declararConflito,
  enviarMensagem, pedirInformacao, reabrir, responderDenunciante,
  type ContextoAcao, type DadosDecisao, type ResultadoAcao,
} from "../lib/acoes";
import { registarVerIdentidade } from "../lib/anonimizacao";
import { gerarPin, proximoCodigo, type Aleatorio } from "../lib/codigos";
import { HOJE_EXEMPLO } from "../lib/datas";
import { construirDenuncia, type DadosFormulario } from "../lib/formulario";
import { filtrarPorOrganizacao } from "../lib/organizacao";
import type { Anexo, Denuncia, Gravidade, Identidade } from "../lib/tipos";
import { esquecerCodigos } from "./codigosGuardados";
import { denunciasDeExemplo, RESPONSAVEIS, RESPONSAVEL_ATUAL } from "./exemplo";
import { ORG_ATIVA } from "./organizacoes";
import { limparRascunho } from "./rascunho";

let denuncias: Denuncia[] = denunciasDeExemplo();
let contadorId = 0;
let minutos = 9 * 60 + 30;
const ouvintes = new Set<() => void>();

const emitir = (): void => ouvintes.forEach((o) => o());
const novoId = (): string => `x${++contadorId}`;

function agora(): string {
  const m = minutos++;
  const hh = String(Math.floor(m / 60) % 24).padStart(2, "0");
  return `${HOJE_EXEMPLO}T${hh}:${String(m % 60).padStart(2, "0")}`;
}

const contexto = (quem: string): ContextoAcao => ({ quem, em: agora(), hoje: HOJE_EXEMPLO, novoId });

export const lerDenuncias = (): Denuncia[] => denuncias;

/** O seletor por organização: só as denúncias da organização dada, nunca as de outra. */
export const denunciasDaOrganizacao = (organizationId: string): Denuncia[] => filtrarPorOrganizacao(denuncias, organizationId);

export function subscrever(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

export const useDenuncias = (): Denuncia[] => useSyncExternalStore(subscrever, lerDenuncias, lerDenuncias);

/** As denúncias da organização dada (a ativa), para a gestão e para «As minhas denúncias». */
export function useDenunciasDaOrganizacao(organizationId: string): Denuncia[] {
  const todas = useDenuncias();
  return useMemo(() => filtrarPorOrganizacao(todas, organizationId), [todas, organizationId]);
}

export function useDenuncia(id: string | null): Denuncia | undefined {
  const todas = useDenuncias();
  return id === null ? undefined : todas.find((d) => d.id === id);
}

/** Volta aos dados de exemplo (usado nos testes e para recomeçar a apresentação). */
export function repor(): void {
  denuncias = denunciasDeExemplo();
  contadorId = 0;
  minutos = 9 * 60 + 30;
  limparRascunho();
  esquecerCodigos();
  emitir();
}

function atualizar(id: string, fazer: (d: Denuncia) => ResultadoAcao): ResultadoAcao {
  const atual = denuncias.find((d) => d.id === id);
  if (!atual) return { ok: false, erro: "transicao_invalida" };
  const r = fazer(atual);
  if (r.ok && r.denuncia !== atual) {
    denuncias = denuncias.map((d) => (d.id === id ? r.denuncia : d));
    emitir();
  }
  return r;
}

const eu = (): string => RESPONSAVEL_ATUAL.nome;
const responsavelPorId = (rid: string) => RESPONSAVEIS.find((r) => r.id === rid);

/** De onde vem a denúncia: a organização (a ativa, ou a da página pública) e, dentro da app, a pessoa que a faz. */
export interface OrigemDenuncia {
  organizationId: string;
  pessoaId?: string | null;
}

/** Cria a denúncia e devolve o código e o PIN, que só aparecem uma vez, no ecrã de confirmação. */
export function submeter(
  f: DadosFormulario,
  origem: OrigemDenuncia = { organizationId: ORG_ATIVA.id },
  aleatorio: Aleatorio = Math.random,
): { codigo: string; pin: string } {
  const codigo = proximoCodigo(denuncias.map((d) => d.codigo), Number(HOJE_EXEMPLO.slice(0, 4)));
  const pin = gerarPin(aleatorio);
  const c = contexto(eu());
  const nova = construirDenuncia(f, { id: `d${codigo.slice(-4)}`, codigo, pin, hoje: HOJE_EXEMPLO, em: c.em, idEvento: novoId(), ...origem });
  denuncias = [nova, ...denuncias];
  limparRascunho();
  emitir();
  return { codigo, pin };
}

export const confirmarRececaoDe = (id: string): ResultadoAcao => atualizar(id, (d) => confirmarRececao(d, contexto(eu())));

export function atribuirA(id: string, responsavelId: string): ResultadoAcao {
  const r = responsavelPorId(responsavelId);
  return r ? atualizar(id, (d) => atribuirResponsavel(d, r, contexto(eu()))) : { ok: false, erro: "transicao_invalida" };
}

export function declararConflitoDe(id: string, responsavelId: string): ResultadoAcao {
  const r = responsavelPorId(responsavelId);
  return r ? atualizar(id, (d) => declararConflito(d, r, contexto(eu()))) : { ok: false, erro: "transicao_invalida" };
}

export const enviarMensagemA = (id: string, texto: string): ResultadoAcao =>
  atualizar(id, (d) => enviarMensagem(d, texto, contexto(eu())));

export const pedirInformacaoEm = (id: string, texto: string): ResultadoAcao =>
  atualizar(id, (d) => pedirInformacao(d, texto, contexto(eu())));

export const responderComoDenunciante = (id: string, texto: string, anexos: Anexo[]): ResultadoAcao =>
  atualizar(id, (d) => responderDenunciante(d, texto, anexos, contexto(eu())));

export const mudarGravidade = (id: string, g: Gravidade): ResultadoAcao =>
  atualizar(id, (d) => alterarGravidade(d, g, contexto(eu())));

export const notaEm = (id: string, texto: string): ResultadoAcao =>
  atualizar(id, (d) => adicionarNota(d, texto, contexto(eu())));

export const concluirDenuncia = (id: string, dados: DadosDecisao): ResultadoAcao =>
  atualizar(id, (d) => concluir(d, dados, contexto(eu())));

export const arquivarDenuncia = (id: string, motivo: string): ResultadoAcao =>
  atualizar(id, (d) => arquivar(d, motivo, contexto(eu())));

export const reabrirDenuncia = (id: string): ResultadoAcao => atualizar(id, (d) => reabrir(d, contexto(eu())));

/** «Ver identidade»: regista quem viu e quando, e devolve a identidade. Em denúncias anónimas devolve null e não regista. */
export function verIdentidade(id: string): Identidade | null {
  const atual = denuncias.find((d) => d.id === id);
  if (!atual || atual.anonima || !atual.identidade) return null;
  const c = contexto(eu());
  denuncias = denuncias.map((d) => (d.id === id ? registarVerIdentidade(d, c.quem, c.em, novoId()) : d));
  emitir();
  return atual.identidade;
}

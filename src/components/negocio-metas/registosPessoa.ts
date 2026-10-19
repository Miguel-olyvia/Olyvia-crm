// O store dos registos das pessoas (contactos, visitas e levantamentos): vive só em memória, neste módulo, e perde-se ao recarregar.
// Mesmo padrão de `negociosNovos.ts` (useSyncExternalStore, e `repor()` para os testes e para voltar ao exemplo). As regras (ligar
// a um só negócio, desfazer) estão em `acoesRegistos.ts`; aqui só se guarda o resultado.
import { useSyncExternalStore } from "react";
import { desligarDoNegocio, ligarAoNegocio } from "./acoesRegistos";
import { useDadosNegocio } from "./costuraNegocio";
import { guardarRegistosDaPessoa, type DadosGuardarRegistos, type ResultadoGuardar } from "./guardarRegistos";
import { ligarRegistosDaPessoa, type LigarRegistos } from "./ligarNegocio";
import {
  REGISTOS_VAZIOS, type ContactoPessoa, type EstadoRegistos, type LevantamentoPessoa, type RefRegisto, type TipoRegisto, type VisitaPessoa,
} from "./registosTipos";

const PREFIXO: Record<TipoRegisto, string> = { contacto: "rc", visita: "rv", levantamento: "rl" };

let estado: EstadoRegistos = REGISTOS_VAZIOS;
let iniciado = false;
const sequencia: Record<TipoRegisto, number> = { contacto: 0, visita: 0, levantamento: 0 };
const ouvintes = new Set<() => void>();

const avisar = (): void => ouvintes.forEach((ouvinte) => ouvinte());

function subscrever(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => { ouvintes.delete(ouvinte); };
}

function mudar(seguinte: EstadoRegistos): void {
  if (seguinte === estado) return;
  estado = seguinte;
  avisar();
}

/** O maior número dos ids `<prefixo>-<n>` de uma lista; ids de outro formato não contam. */
const maiorNumero = (ids: readonly string[], prefixo: string): number =>
  ids.reduce((m, id) => Math.max(m, Number(new RegExp(`^${prefixo}-(\\d+)$`).exec(id)?.[1] ?? 0)), 0);

function proximoId(tipo: TipoRegisto): string {
  sequencia[tipo] += 1;
  return `${PREFIXO[tipo]}-${sequencia[tipo]}`;
}

/** O que está guardado agora (o mesmo objeto até haver uma mudança). */
export const registosAtuais = (): EstadoRegistos => estado;

/**
 * Semeia o store com os registos de exemplo, UMA vez: a seguinte chamada (e as seguintes renders) não faz nada. Não avisa os
 * ouvintes (corre antes da primeira leitura). A numeração dos registos novos segue depois do maior id da semente.
 */
export function iniciarRegistos(semente: EstadoRegistos): void {
  if (iniciado) return;
  iniciado = true;
  estado = semente;
  sequencia.contacto = maiorNumero(semente.contactos.map((r) => r.id), PREFIXO.contacto);
  sequencia.visita = maiorNumero(semente.visitas.map((r) => r.id), PREFIXO.visita);
  sequencia.levantamento = maiorNumero(semente.levantamentos.map((r) => r.id), PREFIXO.levantamento);
}

/** Regista um contacto novo, por ligar. */
export function registarContacto(dados: Omit<ContactoPessoa, "id" | "negocioId">): ContactoPessoa {
  const novo: ContactoPessoa = { ...dados, id: proximoId("contacto"), negocioId: null };
  mudar({ ...estado, contactos: [...estado.contactos, novo] });
  return novo;
}

/** Regista uma visita nova, por ligar. */
export function registarVisita(dados: Omit<VisitaPessoa, "id" | "negocioId">): VisitaPessoa {
  const nova: VisitaPessoa = { ...dados, id: proximoId("visita"), negocioId: null };
  mudar({ ...estado, visitas: [...estado.visitas, nova] });
  return nova;
}

/** Regista um levantamento novo, por ligar. */
export function registarLevantamento(dados: Omit<LevantamentoPessoa, "id" | "negocioId">): LevantamentoPessoa {
  const novo: LevantamentoPessoa = { ...dados, id: proximoId("levantamento"), negocioId: null };
  mudar({ ...estado, levantamentos: [...estado.levantamentos, novo] });
  return novo;
}

/** Liga um registo a um negócio; `false` se foi recusado (já está ligado a outro negócio, ou não existe). */
export function ligarRegisto(ref: RefRegisto, negocioId: string): boolean {
  const seguinte = ligarAoNegocio(estado, ref, negocioId);
  const pronto = seguinte !== estado;
  mudar(seguinte);
  return pronto || ligadoA(ref, negocioId);
}

/**
 * Liga ao negócio os registos que se escolheram ao criá-lo (contactos, visitas e o levantamento existente), só os da pessoa e que ainda
 * estão livres; devolve os recusados. Nada se copia: os registos ganham o `negocioId`.
 */
export function ligarRegistosEscolhidos(negocioId: string, pessoaId: string, ligar: LigarRegistos): RefRegisto[] {
  const { estado: seguinte, recusados } = ligarRegistosDaPessoa(estado, negocioId, pessoaId, ligar);
  mudar(seguinte);
  return recusados;
}

/** Desfaz a ligação, só com o negócio aberto; `false` se não se aplicava. */
export function desligarRegisto(ref: RefRegisto, negocioId: string, negocioAberto: boolean): boolean {
  const seguinte = desligarDoNegocio(estado, ref, negocioId, negocioAberto);
  const pronto = seguinte !== estado;
  mudar(seguinte);
  return pronto;
}

/** Muda uma visita (por exemplo, escrever-lhe o resultado); `false` se não existe. */
export function atualizarVisita(id: string, f: (v: VisitaPessoa) => VisitaPessoa): boolean {
  if (!estado.visitas.some((v) => v.id === id)) return false;
  mudar({ ...estado, visitas: estado.visitas.map((v) => (v.id === id ? f(v) : v)) });
  return true;
}

/** Guarda as visitas e o levantamento de uma pessoa numa só gravação (ver `guardarRegistosDaPessoa`). */
export function guardarVisitasELevantamento(pessoaId: string, dados: DadosGuardarRegistos): Omit<ResultadoGuardar, "estado"> {
  const { estado: seguinte, ...resto } = guardarRegistosDaPessoa(estado, pessoaId, dados, proximoId);
  mudar(seguinte);
  return resto;
}

const ligadoA = (ref: RefRegisto, negocioId: string): boolean =>
  (estado[ref.tipo === "contacto" ? "contactos" : ref.tipo === "visita" ? "visitas" : "levantamentos"] as readonly { id: string; negocioId: string | null }[])
    .some((r) => r.id === ref.id && r.negocioId === negocioId);

/** Esquece tudo e recomeça a numeração (para os testes e para repor o exemplo). */
export function repor(): void {
  iniciado = false;
  sequencia.contacto = 0;
  sequencia.visita = 0;
  sequencia.levantamento = 0;
  estado = REGISTOS_VAZIOS;
  avisar();
}

/** Os registos, atualizados sempre que se muda um. Com `semente`, semeia o store na primeira chamada (ver `iniciarRegistos`). */
export function useRegistosPessoa(semente?: EstadoRegistos): EstadoRegistos {
  // Na ficha real (com `DadosNegocio`) os registos são os da base: a semente de exemplo não se usa nem polui o store.
  const dados = useDadosNegocio();
  if (semente && !dados) iniciarRegistos(semente);
  const doStore = useSyncExternalStore(subscrever, registosAtuais, registosAtuais);
  return dados?.registos ?? doStore;
}

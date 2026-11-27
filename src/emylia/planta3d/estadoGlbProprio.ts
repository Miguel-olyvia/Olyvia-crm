// 27/11: o que aconteceu a cada GLB próprio que o 3D tentou mostrar («ok», «aviso» ou «falhou», com a nota em português). O 3D desenha-se dentro de um canvas e a nota tem de
// aparecer FORA dele (a pré-visualização do produto): um pequeno armazém por URL, lido com useSyncExternalStore. Quem desenha (ModeloProprio, a reserva do Visualizador3D)
// escreve; quem mostra a nota lê. Sem three.
import { useEffect, useSyncExternalStore } from "react";
import { notaDeFalha } from "./modelo3dProprio";

export type EstadoGlb = { tipo: "ok" } | { tipo: "aviso" | "falhou"; texto: string };

const estados = new Map<string, EstadoGlb>();
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());

/** Regista o estado de um GLB (substitui o anterior). Um estado igual não acorda ninguém. */
export function registarEstadoGlb(url: string, e: EstadoGlb): void {
  const antes = estados.get(url);
  if (antes && antes.tipo === e.tipo && (antes.tipo === "ok" || (e.tipo !== "ok" && antes.texto === e.texto))) return;
  estados.set(url, e);
  avisar();
}
/** O GLB não abriu (rede, ficheiro, Draco, limite de triângulos): regista a nota em português, que diz também que se mostra o modelo genérico. */
export function registarFalhaGlb(url: string, erro: unknown): void {
  registarEstadoGlb(url, { tipo: "falhou", texto: notaDeFalha(erro) });
}
export function limparEstadoGlb(url: string): void {
  if (estados.delete(url)) avisar();
}
export const lerEstadoGlb = (url: string | null | undefined): EstadoGlb | null => (url ? estados.get(url) ?? null : null);

const subscrever = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };

/**
 * O estado do GLB deste URL (null: sem GLB próprio, ou ainda sem resposta). Quem o lê limpa-o ao sair, para uma falha antiga não aparecer da próxima vez que a
 * pré-visualização abre (o ModeloProprio volta a registar o que acontecer).
 */
export function useEstadoGlb(url: string | null | undefined): EstadoGlb | null {
  const e = useSyncExternalStore(subscrever, () => lerEstadoGlb(url), () => null);
  useEffect(() => { if (url) return () => limparEstadoGlb(url); return undefined; }, [url]);
  return e;
}

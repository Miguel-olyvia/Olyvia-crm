// 25/11 (Rúben: «o 3D às vezes não carrega os modelos: só caixas»). O código do visualizador com modelos (three.js) é um ficheiro à parte,
// pedido só quando se abre o 3D. Com o separador aberto durante um deploy (cada push para o ramo publica o testarh), esse ficheiro do deploy
// antigo já não existe no servidor (404): o `lazy` falhava, o ecrã caía no 3D simples (caixas, sem modelos) e ficava assim até recarregar,
// porque o React guarda a falha do `lazy` para sempre. Aqui, um só carregador para os três sítios que usam o visualizador:
//  - tenta outra vez uma falha de rede passageira;
//  - não guarda a falha (a próxima abertura volta a tentar) e um `lazy` novo pode pedi-lo de novo (`novoVisualizador3D`);
//  - `preCarregarVisualizador3D` pede-o logo que a obra abre, para estar em memória antes de um deploy o tirar do servidor.
import { lazy } from "react";
import { isModuleLoadError } from "@/lib/sentry/scrub";

type Modulo = typeof import("./Visualizador3D");

/** O import em si (à parte, para os testes o trocarem). */
export const importacao = { importar: (): Promise<Modulo> => import("./Visualizador3D") };

let emCurso: Promise<Modulo> | null = null;
let carregado: Modulo | null = null;

/** O módulo do visualizador: o mesmo pedido para quem o pede ao mesmo tempo; uma falha tenta mais `tentativas - 1` vezes e não fica guardada. */
export function carregarVisualizador3D(tentativas = 2, esperaMs = 700): Promise<Modulo> {
  if (carregado) return Promise.resolve(carregado);
  if (!emCurso) {
    const tentar = (n: number): Promise<Modulo> =>
      importacao.importar().catch((e: unknown) => (n > 1 ? new Promise<void>((r) => setTimeout(r, esperaMs)).then(() => tentar(n - 1)) : Promise.reject(e)));
    emCurso = tentar(tentativas).then(
      (m) => { carregado = m; return m; },
      (e: unknown) => { emCurso = null; throw e; },
    );
  }
  return emCurso;
}

let webgl: boolean | null = null;
/** Se o browser desenha 3D (WebGL). Pergunta-se uma vez. */
export function temWebGL(): boolean {
  if (webgl !== null) return webgl;
  try {
    const c = document.createElement("canvas");
    const g = window.WebGLRenderingContext ? c.getContext("webgl2") ?? c.getContext("webgl") : null;
    webgl = !!g;
    // a pergunta não fica com um contexto ocupado (o browser só dá uns poucos; o mais antigo perde-se, às vezes o do 3D aberto)
    g?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch { webgl = false; }
  return webgl;
}

/** Pede o visualizador em segundo plano (quando o browser estiver livre; só com WebGL); uma falha aqui não se mostra (a abertura do 3D volta a tentar). */
export function preCarregarVisualizador3D(): void {
  if (carregado || emCurso || agendado || typeof window === "undefined" || !temWebGL()) return;
  const pedir = () => { agendado = null; carregarVisualizador3D().catch(() => { /* a abertura do 3D tenta outra vez e mostra o porquê */ }); };
  const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (w.requestIdleCallback && w.cancelIdleCallback) { const id = w.requestIdleCallback(pedir, { timeout: 4000 }); agendado = () => w.cancelIdleCallback!(id); }
  else { const id = setTimeout(pedir, 1500); agendado = () => clearTimeout(id); }
}
let agendado: (() => void) | null = null;

/** Um `lazy` novo do visualizador: o React guarda a falha de cada `lazy`, por isso tentar de novo é pedir um novo. */
export const novoVisualizador3D = () => lazy(() => carregarVisualizador3D());

/** O 3D com modelos não abriu porque a aplicação mudou de versão (o ficheiro do 3D desta versão já não está no servidor). */
export const faltaVersaoNova = (e: unknown): boolean => isModuleLoadError(e);

/** Para os testes: como se a página tivesse acabado de abrir. */
export function reporVisualizador3D(): void { agendado?.(); agendado = null; emCurso = null; carregado = null; webgl = null; }

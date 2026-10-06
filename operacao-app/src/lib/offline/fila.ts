/**
 * A fila do que se fez sem rede.
 *
 * Regras (são as que os testes provam):
 *  · ORDEM — envia-se pela ordem em que se fez. "Iniciar" antes de "Terminar".
 *  · UMA VEZ — cada ação tem um id gerado no telemóvel; a base reconhece-o e
 *    não aplica a mesma ação duas vezes (db/offline.sql). Do lado de cá, só
 *    um envio corre de cada vez.
 *  · SEM REDE, PÁRA — um erro de rede deixa a ação na fila, tal como estava,
 *    e não se tenta o resto (voltará a tentar quando a rede voltar).
 *  · RECUSA, NÃO SE PERDE — se a base recusar (o estado mudou entretanto, a
 *    justificação é obrigatória…), a ação fica marcada "com problema", com a
 *    mensagem da base, e as seguintes DA MESMA TAREFA ficam à espera: enviar
 *    "Terminar" depois de um "Iniciar" recusado não faz sentido. As de outras
 *    tarefas seguem. A pessoa decide: tentar outra vez ou descartar.
 */
import type { Armazem } from "./armazem";

export type TipoAcao =
  | "obra_iniciar"
  | "obra_pausar"
  | "obra_concluir"
  | "obra_foto"
  | "ordem_responder"
  | "ordem_medicao";

export interface AcaoOffline {
  id: string;
  tipo: TipoAcao;
  /** O que tem de seguir a ordem (a tarefa). */
  chave: string;
  args: Record<string, unknown>;
  /** Para a pessoa: "Iniciar «Assentar base»". */
  rotulo: string;
  /** Hora do telemóvel quando se fez. */
  criadaEm: string;
  /** Desempate estável entre ações feitas no mesmo milissegundo. */
  seq: number;
  estado: "pendente" | "conflito";
  erro?: string;
  tentativas: number;
  /** Uma foto (Blob/File) guarda-se com a ação. */
  ficheiro?: Blob;
}

export type NovaAcao = Pick<AcaoOffline, "tipo" | "chave" | "args" | "rotulo" | "ficheiro"> & {
  id?: string;
  criadaEm?: string;
};

export interface ResultadoEnvio {
  enviadas: number;
  conflitos: number;
  porEnviar: number;
  semRede: boolean;
}

export type Executor = (a: AcaoOffline) => Promise<unknown>;

export function novoId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  // Sem randomUUID (browsers antigos): um v4 a partir de getRandomValues/Math.random.
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function mensagemDeErro(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "object" && e && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

/** Erro de rede (não chegou à base), e não uma recusa da base. */
export function ehErroDeRede(e: unknown, online = typeof navigator === "undefined" ? true : navigator.onLine): boolean {
  if (!online) return true;
  const m = mensagemDeErro(e);
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet|err_network|sem rede|timeout|timed out/i.test(m);
}

export class Fila {
  private ouvintes = new Set<() => void>();
  private emCurso: Promise<ResultadoEnvio> | null = null;
  private contador = 0;

  constructor(
    private readonly armazem: Armazem,
    private readonly executor: Executor,
    private readonly rede: (e: unknown) => boolean = (e) => ehErroDeRede(e)
  ) {}

  subscrever(fn: () => void): () => void {
    this.ouvintes.add(fn);
    return () => this.ouvintes.delete(fn);
  }

  private avisar() {
    for (const fn of this.ouvintes) fn();
  }

  async listar(): Promise<AcaoOffline[]> {
    const todas = await this.armazem.todos<AcaoOffline>("fila");
    return todas.sort((a, b) => a.criadaEm.localeCompare(b.criadaEm) || a.seq - b.seq);
  }

  async acrescentar(n: NovaAcao): Promise<AcaoOffline> {
    const a: AcaoOffline = {
      id: n.id ?? novoId(),
      tipo: n.tipo,
      chave: n.chave,
      args: n.args,
      rotulo: n.rotulo,
      criadaEm: n.criadaEm ?? new Date().toISOString(),
      seq: Date.now() * 1000 + (this.contador++ % 1000),
      estado: "pendente",
      tentativas: 0,
      ...(n.ficheiro ? { ficheiro: n.ficheiro } : {}),
    };
    await this.armazem.gravar("fila", a.id, a);
    this.avisar();
    return a;
  }

  /** Há alguma coisa desta tarefa por enviar? (então o que vier a seguir vai para a fila, atrás) */
  async temPendentes(chave: string): Promise<boolean> {
    return (await this.listar()).some((a) => a.chave === chave);
  }

  /**
   * Com rede e nada desta tarefa na fila: envia já, e um erro da base volta
   * para quem chamou (o ecrã mostra-o, como sempre). Sem rede, ou com coisas
   * desta tarefa ainda por enviar: guarda na fila, atrás delas.
   */
  async executarOuGuardar(n: NovaAcao): Promise<{ guardada: boolean; valor?: unknown }> {
    const online = typeof navigator === "undefined" ? true : navigator.onLine;
    if (!online || (await this.temPendentes(n.chave))) {
      await this.acrescentar(n);
      return { guardada: true };
    }
    const a: AcaoOffline = {
      id: n.id ?? novoId(),
      tipo: n.tipo,
      chave: n.chave,
      args: n.args,
      rotulo: n.rotulo,
      criadaEm: n.criadaEm ?? new Date().toISOString(),
      seq: 0,
      estado: "pendente",
      tentativas: 0,
      ...(n.ficheiro ? { ficheiro: n.ficheiro } : {}),
    };
    try {
      return { guardada: false, valor: await this.executor(a) };
    } catch (e) {
      if (!this.rede(e)) throw e;
      // A rede falhou a meio: guarda-se com o MESMO id — se tiver chegado à
      // base, o reenvio devolve o resultado sem aplicar outra vez.
      await this.acrescentar({ ...n, id: a.id, criadaEm: a.criadaEm });
      return { guardada: true };
    }
  }

  async descartar(id: string): Promise<void> {
    await this.armazem.apagar("fila", id);
    this.avisar();
  }

  async tentarOutraVez(id: string): Promise<void> {
    const a = await this.armazem.ler<AcaoOffline>("fila", id);
    if (!a) return;
    await this.armazem.gravar("fila", id, { ...a, estado: "pendente", erro: undefined });
    this.avisar();
  }

  /** Envia o que houver, pela ordem. Um envio de cada vez. */
  processar(): Promise<ResultadoEnvio> {
    if (this.emCurso) return this.emCurso;
    this.emCurso = this.processarAgora().finally(() => {
      this.emCurso = null;
    });
    return this.emCurso;
  }

  private async processarAgora(): Promise<ResultadoEnvio> {
    let enviadas = 0;
    let conflitos = 0;
    let semRede = false;
    const presas = new Set<string>();

    for (const a of await this.listar()) {
      if (a.estado === "conflito") {
        presas.add(a.chave);
        continue;
      }
      if (presas.has(a.chave)) continue;
      try {
        await this.executor(a);
        await this.armazem.apagar("fila", a.id);
        enviadas++;
        this.avisar();
      } catch (e) {
        if (this.rede(e)) {
          semRede = true;
          break;
        }
        await this.armazem.gravar("fila", a.id, {
          ...a,
          estado: "conflito",
          erro: mensagemDeErro(e),
          tentativas: a.tentativas + 1,
        });
        conflitos++;
        presas.add(a.chave);
        this.avisar();
      }
    }
    const porEnviar = (await this.listar()).length;
    return { enviadas, conflitos, porEnviar, semRede };
  }
}

// 16/11: a cache das páginas do separador Produtos. Chave = organização + filtros + pesquisa + limite + página. Quem mostra a página N pede
// `precarregar` das duas seguintes (sem passar da última); um pedido já em voo não se repete; só se guardam leituras bem sucedidas; o que chega
// depois de a cache ser limpa é ignorado; guarda no máximo 20 páginas (descarta as mais antigas).
import type { Res } from "../fichaProdutoDados";
import { POR_PAGINA_SERVIDOR, type FiltroServidor, type PaginaProdutos } from "./produtosPaginados";

export const MAX_PAGINAS_EM_CACHE = 20;
export const PAGINAS_A_PRECARREGAR = 2;

type Ler = (org: string, f: FiltroServidor, pagina: number) => Promise<Res<PaginaProdutos>>;

export class CachePaginas {
  private guardadas = new Map<string, PaginaProdutos>();
  private emVoo = new Map<string, Promise<Res<PaginaProdutos>>>();
  private geracao = 0;
  private ctx: string | null = null;
  private versao: unknown = undefined;

  constructor(private readonly ler: Ler, private readonly max = MAX_PAGINAS_EM_CACHE) {}

  private static base(org: string, f: FiltroServidor): string {
    return JSON.stringify([org, f.q.trim(), f.categoria, f.subcategoria, f.modelo, f.marca, f.semCategoria, POR_PAGINA_SERVIDOR]);
  }
  private chave(org: string, f: FiltroServidor, pagina: number): string { return `${CachePaginas.base(org, f)}#${pagina}`; }

  /** Diz em que contexto se está; se a organização, os filtros ou a `versao` (ex.: o Catálogo depois de gravar) mudaram, a cache recomeça. */
  contexto(org: string, f: FiltroServidor, versao: unknown): void {
    const b = CachePaginas.base(org, f);
    if (this.ctx !== null && (this.ctx !== b || this.versao !== versao)) this.limpar();
    this.ctx = b;
    this.versao = versao;
  }

  limpar(): void {
    this.geracao += 1;
    this.guardadas.clear();
    this.emVoo.clear();
  }

  ver(org: string, f: FiltroServidor, pagina: number): PaginaProdutos | undefined {
    return this.guardadas.get(this.chave(org, f, pagina));
  }

  obter(org: string, f: FiltroServidor, pagina: number): Promise<Res<PaginaProdutos>> {
    const k = this.chave(org, f, pagina);
    const feita = this.guardadas.get(k);
    if (feita) return Promise.resolve({ ok: true, v: feita });
    const voo = this.emVoo.get(k);
    if (voo) return voo;
    const g = this.geracao;
    const p = this.ler(org, f, pagina).then((r) => {
      if (g === this.geracao) {
        this.emVoo.delete(k);
        if (r.ok) this.guardar(k, r.v);
      }
      return r;
    }, (e: unknown) => {
      if (g === this.geracao) this.emVoo.delete(k);
      throw e;
    });
    this.emVoo.set(k, p);
    return p;
  }

  /** Em segundo plano, as `quantas` páginas a seguir a `aPartirDe` (até `paginas`). Nunca falha nem mostra erro. */
  precarregar(org: string, f: FiltroServidor, aPartirDe: number, paginas: number, quantas = PAGINAS_A_PRECARREGAR): void {
    for (let p = aPartirDe + 1; p <= Math.min(aPartirDe + quantas, paginas); p++) {
      const k = this.chave(org, f, p);
      if (this.guardadas.has(k) || this.emVoo.has(k)) continue;
      this.obter(org, f, p).catch(() => undefined);
    }
  }

  private guardar(k: string, v: PaginaProdutos): void {
    this.guardadas.delete(k);
    this.guardadas.set(k, v);
    while (this.guardadas.size > this.max) this.guardadas.delete(this.guardadas.keys().next().value as string);
  }
}

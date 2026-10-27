// O separador Hoje da V2 funcional de Pessoas: a lista de trabalho em quatro listas recolhíveis (Contactar hoje, Visitas esta semana,
// À espera de resposta, Contratos e faturação), cada pessoa uma só vez, com a razão em texto e as ações rápidas. A linha abre a ficha.
import type { RefObject } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { filtrarLeads, localDe } from "./leadsDocs";
import { AvatarPessoa, BORDA_CTRL } from "./PessoaLinha";
import { Etiqueta, MarcaExemplo } from "./SelosPessoa";
import { AcoesLinha } from "./FuncAcoes";
import { DicaAtalhos, GrupoRecolhivel } from "./FuncGrupo";
import { totalHoje, type GrupoHoje, type IdGrupo, type ItemHoje } from "./funcHoje";

const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

export interface HojeProps {
  grupos: readonly GrupoHoje[];
  q: string;
  setQ: (v: string) => void;
  fechados: ReadonlySet<IdGrupo>;
  alternar: (g: IdGrupo) => void;
  abrir: (nome: string) => void;
  avisar: (msg: string) => void;
  ajuda: () => void;
  leitura: boolean;
  pesquisa: RefObject<HTMLInputElement>;
}

/** As listas com a pesquisa aplicada (nome, telefone, serviço e localidade). */
export function filtrarHoje(grupos: readonly GrupoHoje[], q: string): GrupoHoje[] {
  return grupos.map((g) => ({ ...g, itens: q.trim() ? g.itens.filter((i) => filtrarLeads([i.p], "todas", false, q).length > 0) : g.itens }));
}

function LinhaHoje({ i, abrir, avisar, leitura }: { i: ItemHoje; abrir: (nome: string) => void; avisar: (msg: string) => void; leitura: boolean }) {
  const { p } = i, local = localDe(p.principal);
  return (
    <li className="group flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-1 py-1.5 hover:bg-muted/60 focus-within:bg-muted/60" onClick={() => abrir(p.nome)}>
      <button type="button" data-pessoa={p.nome} data-linha-func="" aria-haspopup="dialog" className={cn("flex min-h-11 min-w-0 flex-1 basis-72 cursor-pointer items-center gap-3 rounded-md text-left", FOCO)}>
        <AvatarPessoa nome={p.nome} className="h-10 w-10" />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 font-semibold leading-5">{p.nome}{p.empresa && <Etiqueta>Empresa</Etiqueta>}{p.exemplo && <MarcaExemplo className="font-normal" />}</span>
          <span className="block text-[15px] text-muted-foreground">{p.papel === "lead" ? "Lead" : "Cliente"} · {p.principal.servico}{local ? ` · ${local}` : ""}</span>
          <span className="block text-[15px] font-medium text-foreground">{i.razao}</span>
        </span>
      </button>
      <AcoesLinha nome={p.nome} f={i.f} avisar={avisar} leitura={leitura} />
    </li>
  );
}

export function HojePessoas({ grupos, q, setQ, fechados, alternar, abrir, avisar, ajuda, leitura, pesquisa }: HojeProps) {
  const vistos = filtrarHoje(grupos, q), total = totalHoje(vistos);
  return (
    <div className="grid gap-3 px-4 pb-24 pt-3 lg:pb-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="relative block min-w-0 basis-full sm:basis-80">
          <span className="sr-only">Procurar no Hoje</span>
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input ref={pesquisa} type="search" placeholder="Procurar nome, telefone ou serviço" value={q} onChange={(e) => setQ(e.target.value)}
            className={cn("h-11 w-full rounded-lg border bg-card pl-10 pr-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25", BORDA_CTRL)} />
        </label>
        <DicaAtalhos abrir={ajuda} />
      </div>
      <p role="status" aria-live="polite" aria-atomic="true" className="text-[15px] text-muted-foreground">
        {total === 0 ? "Nada para hoje" : total === 1 ? "1 pessoa para hoje" : `${total} pessoas para hoje`} · hoje é 10/10
      </p>
      {vistos.map((g) => (
        <GrupoRecolhivel key={g.id} titulo={g.nome} n={g.itens.length} vazio={q.trim() ? "Ninguém com esta pesquisa." : g.vazio} aberto={!fechados.has(g.id)} alternar={() => alternar(g.id)}>
          <ul className="grid gap-0.5" aria-label={g.nome}>
            {g.itens.map((i) => <LinhaHoje key={i.p.nome} i={i} abrir={abrir} avisar={avisar} leitura={leitura} />)}
          </ul>
        </GrupoRecolhivel>
      ))}
    </div>
  );
}

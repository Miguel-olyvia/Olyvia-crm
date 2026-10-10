// A lista de Pessoas: ocupa a largura toda. O cabeçalho (ListaTopo) fica fixo e as linhas rolam; ao escolher uma pessoa abre-se a ficha num painel.
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { Estado } from "./motor";
import {
  SEM_FILTROS, SEPARADORES_LISTA, filtrosEfetivos, listaVisivel, pessoasDoSeparador,
  type FiltrosPessoa, type Ordem, type SeparadorLista,
} from "./pessoasDocs";
import { BORDA_CTRL } from "./PessoaLinha";
import { ListaTopo } from "./ListaTopo";
import { PessoaTabela } from "./PessoaTabela";

export interface ListaProps {
  S: Estado;
  aba: SeparadorLista;
  setAba: (v: SeparadorLista) => void;
  f: FiltrosPessoa;
  setF: (v: Partial<FiltrosPessoa>) => void;
  ordem: Ordem;
  setOrdem: (v: Ordem) => void;
  abrir: (nome: string) => void;
  novaLead: () => void;
  /** Leitura fácil ativa: o painel dos filtros, que abre num portal, também a aplica. */
  leitura: boolean;
}

const PLURAL: Record<SeparadorLista, string> = { leads: "leads", clientes: "clientes", todos: "pessoas" };

/** O separador está mesmo vazio (sem pessoas nesse papel): não há filtros para limpar. */
function SeparadorVazio({ aba }: { aba: SeparadorLista }) {
  return (
    <div className="m-4 grid gap-2 border-t border-border pt-4">
      <p className="text-base font-medium">Ainda não há {PLURAL[aba]}.</p>
      <p className="text-[15px] text-muted-foreground">Quando houver, aparecem aqui.</p>
    </div>
  );
}

/** Há pessoas, mas nenhuma passa os filtros ou a pesquisa. */
function SemResultados({ limpar, pesquisa }: { limpar: () => void; pesquisa: boolean }) {
  return (
    <div className="m-4 grid gap-2 border-t border-border pt-4">
      <p className="text-base font-medium">Nenhuma pessoa com este filtro.</p>
      <p className="text-[15px] text-muted-foreground">{pesquisa ? "Experimenta só o nome ou a localidade, sem acentos." : "Experimenta tirar um filtro ou mudar de separador."}</p>
      <div><Button type="button" variant="outline" className={cn("min-h-11 cursor-pointer text-[15px]", BORDA_CTRL)} onClick={limpar}>Limpar filtros</Button></div>
    </div>
  );
}

/** O que se anuncia a quem usa leitor de ecrã quando a pesquisa ou os filtros mudam o número de resultados. */
export const contagemTexto = (n: number): string => (n === 0 ? "Nenhuma pessoa" : n === 1 ? "1 pessoa" : `${n} pessoas`);

export function PessoaLista({ S, aba, setAba, f, setF, ordem, setOrdem, abrir, novaLead, leitura }: ListaProps) {
  const pesquisa = useRef<HTMLInputElement>(null);
  const ef = filtrosEfetivos(aba, f);
  const todas = pessoasDoSeparador(S, aba);
  const visiveis = listaVisivel(S, aba, f, ordem);
  // "Limpar filtros" desaparece com o estado vazio: o foco passa para a pesquisa em vez de se perder.
  const limpar = () => { setF({ ...SEM_FILTROS }); pesquisa.current?.focus(); };
  const titulo = SEPARADORES_LISTA.find((s) => s.id === aba)!.nome;
  return (
    <Tabs value={aba} onValueChange={(v) => setAba(v as SeparadorLista)} className="min-w-0">
      <ListaTopo S={S} aba={aba} f={ef} setF={setF} ordem={ordem} setOrdem={setOrdem} todas={todas} novaLead={novaLead} leitura={leitura} pesquisa={pesquisa} />
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{contagemTexto(visiveis.length)}</p>
      <TabsContent value={aba} className="mt-0 pb-24 lg:pb-6">
        {todas.length === 0 ? <SeparadorVazio aba={aba} /> : visiveis.length === 0 ? <SemResultados limpar={limpar} pesquisa={f.q.trim() !== ""} /> : (
          <>
            <PessoaTabela S={S} pessoas={visiveis} titulo={titulo} abrir={abrir} />
            <p className="px-4 pt-3 text-[15px] text-muted-foreground">Exemplo: o negócio novo juntado a clientes, a saúde, as notas e os pagamentos são inventados para a demonstração.</p>
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}

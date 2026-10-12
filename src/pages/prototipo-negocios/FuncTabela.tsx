// A tabela da Lista funcional de Pessoas: caixas para escolher, cabeçalhos que ordenam (botão no cabeçalho, com aria-sort), colunas escolhíveis
// e as ações rápidas em cada linha. Abaixo de lg, cartões (com a caixa e as ações sempre à vista). A linha toda abre a ficha.
import { ArrowDown, ArrowUp, ArrowUpDown, Clock } from "lucide-react";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { eur, type Estado } from "./motor";
import { localDe } from "./leadsDocs";
import { proximoTexto } from "./perfilDocs";
import { contactoTexto, etapaPessoa, etapaTexto, valorColuna } from "./listaDocs";
import { AvatarPessoa, IconeEtapa, LinhaPapel } from "./PessoaLinha";
import { IconePerdida, ResultadoSelo } from "./SelosPessoa";
import { AcoesLinha } from "./FuncAcoes";
import { useDesktop } from "./useDesktop";
import { ariaSort, type ColunaOrdem, type OrdemLista } from "./funcOrdenar";
import { COLUNAS_OPCIONAIS, type ColunaOpcional, type LinhaFunc } from "./funcLista";
import { HOJE_FUNC, diasAte } from "./funcHoje";

const FOCO = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
const CELULA = "px-2 py-1 align-middle text-[15px]";
const ORDENAVEL: Partial<Record<ColunaOpcional | "pessoa", ColunaOrdem>> = { pessoa: "pessoa", contacto: "contacto", proximo: "proximo", valor: "valor" };

export interface TabelaFuncProps {
  S: Estado;
  linhas: readonly LinhaFunc[];
  titulo: string;
  colunas: readonly ColunaOpcional[];
  ordem: OrdemLista | null;
  ordenar: (c: ColunaOrdem) => void;
  selecionadas: ReadonlySet<string>;
  escolher: (nome: string, sim: boolean) => void;
  escolherTodas: (sim: boolean) => void;
  abrir: (nome: string) => void;
  avisar: (msg: string) => void;
  leitura: boolean;
}

const localidade = (l: LinhaFunc): string => { const x = localDe(l.p.principal); return l.p.principal.servico + (x ? " · " + x : ""); };

/** O próximo passo; quando foi adiado, diz para quando. */
function proximo(S: Estado, l: LinhaFunc): string {
  if (l.p.perdida !== null) return "—";
  const d = diasAte(l.f.prazo.data);
  return proximoTexto(l.p, S) + (d !== null && d > 0 && l.hoje === null && l.p.papel === "lead" ? ` · contactar a ${l.f.prazo.data}` : "");
}

function Caixa({ rotulo, marcada, mudar, mista }: { rotulo: string; marcada: boolean; mudar: (v: boolean) => void; mista?: boolean }) {
  return (
    <label className="grid min-h-11 min-w-11 cursor-pointer place-items-center" onClick={(e) => e.stopPropagation()}>
      <span className="sr-only">{rotulo}</span>
      <input type="checkbox" checked={marcada} onChange={(e) => mudar(e.target.checked)} ref={(el) => { if (el) el.indeterminate = !!mista; }}
        className={cn("h-5 w-5 cursor-pointer accent-foreground", FOCO)} />
    </label>
  );
}

function Cabecalho({ id, nome, ordem, ordenar, direita }: { id: ColunaOpcional | "pessoa"; nome: string; ordem: OrdemLista | null; ordenar: (c: ColunaOrdem) => void; direita?: boolean }) {
  const c = ORDENAVEL[id];
  const sort = c ? ariaSort(ordem, c) : undefined;
  const I = sort === "ascending" ? ArrowUp : sort === "descending" ? ArrowDown : ArrowUpDown;
  return (
    <TableHead scope="col" aria-sort={sort} className={cn("h-11 px-2 text-[15px] font-medium", direita && "text-right")}>
      {c ? (
        <button type="button" onClick={() => ordenar(c)} className={cn("inline-flex min-h-11 items-center gap-1 rounded-md px-1", FOCO)}>
          {nome}<I className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">{sort === "none" ? ", ordenar" : sort === "ascending" ? ", por ordem crescente" : ", por ordem decrescente"}</span>
        </button>
      ) : nome}
    </TableHead>
  );
}

function Celula({ S, l, c }: { S: Estado; l: LinhaFunc; c: ColunaOpcional }) {
  const ct = contactoTexto(l.f), v = valorColuna(S, l.p);
  if (c === "formulario") return <TableCell className={CELULA}>{l.formulario}</TableCell>;
  if (c === "origem") return <TableCell className={CELULA}>{l.origem}</TableCell>;
  if (c === "etapa") return <TableCell className={CELULA}><span className="flex items-center gap-2">{l.p.perdida !== null ? <IconePerdida /> : <IconeEtapa etapa={etapaPessoa(l.p)} tam="sm" />}<span>{etapaTexto(l.p)}</span></span></TableCell>;
  if (c === "contacto") {
    return (
      <TableCell className={CELULA}>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Clock className={cn("h-4 w-4 shrink-0", ct.sem && "text-destructive")} aria-hidden="true" />{ct.texto}</span>
          <ResultadoSelo resultado={l.resultado} className="py-0 leading-5" />
        </span>
      </TableCell>
    );
  }
  if (c === "proximo") return <TableCell className={cn(CELULA, "font-medium")}><span className="line-clamp-2">{proximo(S, l)}</span></TableCell>;
  return <TableCell className={cn(CELULA, "whitespace-nowrap text-right tabular-nums")}>{v === null ? <><span aria-hidden="true">—</span><span className="sr-only">Sem valor</span></> : `${eur(v)} €`}</TableCell>;
}

function Linha(props: TabelaFuncProps & { l: LinhaFunc }) {
  const { S, l, colunas, selecionadas, escolher, abrir, avisar, leitura } = props;
  const nome = l.p.nome;
  return (
    <TableRow onClick={() => abrir(nome)} className="group cursor-pointer hover:bg-muted/60 focus-within:bg-muted/60">
      <TableCell className="w-12 px-0 py-1"><Caixa rotulo={`Escolher ${nome}`} marcada={selecionadas.has(nome)} mudar={(v) => escolher(nome, v)} /></TableCell>
      <TableCell className={CELULA}>
        <button type="button" data-pessoa={nome} data-linha-func="" aria-haspopup="dialog" className={cn("flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-md text-left", FOCO)}>
          <AvatarPessoa nome={nome} className="h-9 w-9" />
          <span className="min-w-0 flex-1"><span className="block truncate font-semibold leading-5" title={nome}>{nome}</span><LinhaPapel p={l.p} voltou={l.voltou} /></span>
        </button>
      </TableCell>
      <TableCell className={CELULA}>{localidade(l)}</TableCell>
      {colunas.map((c) => <Celula key={c} S={S} l={l} c={c} />)}
      <TableCell className="px-1 py-1"><AcoesLinha nome={nome} f={l.f} avisar={avisar} leitura={leitura} /></TableCell>
    </TableRow>
  );
}

function Cartao(props: TabelaFuncProps & { l: LinhaFunc }) {
  const { S, l, selecionadas, escolher, abrir, avisar, leitura } = props;
  const nome = l.p.nome, ct = contactoTexto(l.f);
  return (
    <li className="flex flex-wrap items-start gap-x-1 px-2 py-2" onClick={() => abrir(nome)}>
      <Caixa rotulo={`Escolher ${nome}`} marcada={selecionadas.has(nome)} mudar={(v) => escolher(nome, v)} />
      <button type="button" data-pessoa={nome} data-linha-func="" aria-haspopup="dialog" className={cn("flex min-h-11 min-w-0 flex-1 gap-3 rounded-md px-1 py-1 text-left", FOCO)}>
        <AvatarPessoa nome={nome} className="h-10 w-10" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{nome}</span>
          <LinhaPapel p={l.p} voltou={l.voltou} />
          <span className="block text-[15px] text-muted-foreground">{localidade(l)} · {l.formulario}</span>
          <span className="block text-[15px]"><span className="font-medium">{proximo(S, l)}</span><span className="text-muted-foreground"> · {ct.texto}</span> <ResultadoSelo resultado={l.resultado} /></span>
        </span>
      </button>
      <AcoesLinha nome={nome} f={l.f} avisar={avisar} leitura={leitura} className="basis-full justify-end" />
    </li>
  );
}

export function TabelaFunc(props: TabelaFuncProps) {
  const { linhas, titulo, colunas, ordem, ordenar, selecionadas, escolherTodas } = props;
  const desktop = useDesktop();
  const todas = linhas.length > 0 && linhas.every((l) => selecionadas.has(l.p.nome)), algumas = !todas && linhas.some((l) => selecionadas.has(l.p.nome));
  if (!desktop) return <ul className="divide-y divide-border border-y border-border" aria-label={titulo}>{linhas.map((l) => <Cartao key={l.p.nome} {...props} l={l} />)}</ul>;
  return (
    <Table className="table-fixed text-[15px]" containerClassName="overflow-visible">
      <TableCaption className="sr-only">{titulo}: uma pessoa por linha, hoje {HOJE_FUNC}. Os cabeçalhos com botão ordenam a lista.</TableCaption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead scope="col" className="w-12 px-0"><Caixa rotulo="Escolher todas as pessoas da lista" marcada={todas} mista={algumas} mudar={escolherTodas} /></TableHead>
          <Cabecalho id="pessoa" nome="Pessoa" ordem={ordem} ordenar={ordenar} />
          <TableHead scope="col" className="h-11 px-2 text-[15px] font-medium">Serviço · localidade</TableHead>
          {colunas.map((c) => <Cabecalho key={c} id={c} nome={COLUNAS_OPCIONAIS.find((x) => x.id === c)!.nome} ordem={ordem} ordenar={ordenar} direita={c === "valor"} />)}
          <TableHead scope="col" className="w-[13.5rem] px-2 text-[15px] font-medium">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>{linhas.map((l) => <Linha key={l.p.nome} {...props} l={l} />)}</TableBody>
    </Table>
  );
}

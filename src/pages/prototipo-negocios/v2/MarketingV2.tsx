// Marketing da V2: a lista de campanhas com resultados (leads, ganhos, receita, investimento e custos), ordenável, com pesquisa,
// "Nova campanha" na própria página (sem modal) e uma página única por campanha (CampanhaV2). As campanhas vivem em memória (campanhasStore.ts).
import { useRef, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Chip, type Ctx } from "../pecas";
import type { Canal } from "../toquesDocs";
import {
  CANAIS, MODELOS_FORM, ORDEM_INICIAL, listaCampanhas, metricas, negociosComToque, proximaOrdem, semCampanha,
  type ColunaCampanha, type ModeloForm, type Ordem,
} from "./campanhas";
import { criarCampanha, useCampanhas } from "./campanhasStore";
import { CampanhaV2 } from "./CampanhaV2";
import { Chips, FOCO, ICONE_CANAL, euros } from "./pecasMarketing";

const ouTraco = (x: number | null): string => (x === null ? "—" : euros(x));

const COLUNAS: { col: ColunaCampanha; nome: string; direita?: boolean }[] = [
  { col: "nome", nome: "Campanha" }, { col: "leads", nome: "Leads", direita: true }, { col: "ganhos", nome: "Ganhos", direita: true },
  { col: "receita", nome: "Receita", direita: true }, { col: "investimento", nome: "Investimento", direita: true },
  { col: "custoLead", nome: "Custo por lead", direita: true }, { col: "custoGanho", nome: "Custo por ganho", direita: true },
];

function Cabecalho({ col, nome, direita, ordem, ordenar }: { col: ColunaCampanha; nome: string; direita?: boolean; ordem: Ordem; ordenar: (c: ColunaCampanha) => void }) {
  const sort = ordem.col === col ? (ordem.dir === "asc" ? "ascending" : "descending") : "none";
  const I = sort === "ascending" ? ArrowUp : sort === "descending" ? ArrowDown : ArrowUpDown;
  return (
    <th scope="col" aria-sort={sort} className={cn("h-11 whitespace-nowrap px-2 text-[15px] font-medium", direita ? "text-right" : "text-left")}>
      <button type="button" onClick={() => ordenar(col)} className={cn("inline-flex min-h-11 items-center gap-1 rounded-md px-1", FOCO)}>
        {nome}<I className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">{sort === "none" ? ", ordenar" : sort === "ascending" ? ", por ordem crescente" : ", por ordem decrescente"}</span>
      </button>
    </th>
  );
}

function NovaCampanha({ criada, fechar }: { criada: (id: string) => void; fechar: () => void }) {
  const [nome, setNome] = useState("");
  const [canal, setCanal] = useState<Canal | null>(null);
  const [modelo, setModelo] = useState<ModeloForm | null>("orcamento");
  const [erro, setErro] = useState("");
  const submeter = (e: FormEvent) => {
    e.preventDefault();
    if (!nome.trim() || !canal || !modelo) { setErro(!nome.trim() ? "Falta o nome da campanha." : !canal ? "Escolha o canal." : "Escolha o modelo do formulário."); return; }
    criada(criarCampanha(nome, canal, modelo).id);
  };
  return (
    <form onSubmit={submeter} aria-labelledby="nova-campanha-t" className="mt-6 grid gap-5 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-sm)] sm:p-5">
      <h2 id="nova-campanha-t" className="text-lg font-semibold">Nova campanha</h2>
      <label className="grid gap-1.5">
        <span className="text-[15px] font-medium">Nome</span>
        <input autoFocus value={nome} onChange={(e) => { setNome(e.target.value); setErro(""); }} placeholder="Por exemplo: Cozinhas novembro"
          className={cn("h-11 rounded-lg border border-input bg-background px-3 text-[15px]", FOCO)} />
      </label>
      <Chips rotulo="Canal" opcoes={CANAIS.map((c) => ({ id: c, nome: c }))} valor={canal} escolher={(c) => { setCanal(c); setErro(""); }} />
      <Chips rotulo="Modelo de formulário" opcoes={MODELOS_FORM} valor={modelo} escolher={(m) => { setModelo(m); setErro(""); }} />
      <p role="alert" className="min-h-6 text-[15px]">{erro}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="h-11 text-[15px]">Criar e abrir a campanha</Button>
        <Button type="button" variant="ghost" className="h-11 text-[15px]" onClick={fechar}>Cancelar</Button>
      </div>
    </form>
  );
}

export function MarketingV2({ S }: Ctx) {
  const campanhas = useCampanhas();
  const [aberta, setAberta] = useState<string | null>(null);
  const [nova, setNova] = useState(false);
  const [q, setQ] = useState("");
  const [ordem, setOrdem] = useState<Ordem>(ORDEM_INICIAL);
  const btnNova = useRef<HTMLButtonElement>(null);
  // Calcula-se a cada desenho: o Estado muda no sítio (um memo ficaria velho) e são poucas dezenas de negócios.
  const negocios = negociosComToque(S);
  const linhas = campanhas.map((c) => ({ c, m: metricas(c, negocios, S) }));
  const visiveis = listaCampanhas(linhas, q, ordem);
  const pendentes = campanhas.reduce((a, c) => a + c.pendentes.length, 0);
  const soltas = semCampanha(campanhas, negocios);

  const atual = aberta ? campanhas.find((c) => c.id === aberta) : undefined;
  if (atual) return <CampanhaV2 S={S} c={atual} negocios={negocios} voltar={() => setAberta(null)} />;

  const tot = linhas.reduce((a, { m }) => ({ leads: a.leads + m.leads, ganhos: a.ganhos + m.ganhos, receita: a.receita + m.receita }), { leads: 0, ganhos: 0, receita: 0 });

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Marketing</h1>
          <p className="mt-2 text-lg text-muted-foreground">
            {campanhas.length} campanhas · {tot.leads} leads · {tot.ganhos} ganhos · {euros(tot.receita)} de receita
          </p>
        </div>
        {!nova && (
          <Button ref={btnNova} className="h-11 text-[15px]" onClick={() => setNova(true)}>
            <Plus aria-hidden="true" />Nova campanha
          </Button>
        )}
      </header>
      <p className="mt-3 text-[15px] text-muted-foreground">
        A receita só vem dos negócios ganhos (contrato assinado ou proposta aceite). O canal é a categoria; os anúncios, com o investimento, vivem dentro de cada campanha.
        {pendentes > 0 && ` Há ${pendentes} ${pendentes === 1 ? "submissão" : "submissões"} por rever dentro das campanhas.`}
      </p>

      {nova && <NovaCampanha criada={(id) => { setNova(false); setAberta(id); }} fechar={() => { setNova(false); setTimeout(() => btnNova.current?.focus()); }} />}

      <label className="relative mt-6 block max-w-md">
        <span className="sr-only">Procurar campanha</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar por campanha, canal ou onde anuncia"
          className={cn("h-11 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-[15px]", FOCO)} />
      </label>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]">
        <table className="w-full min-w-[760px] border-collapse text-[15px]">
          <caption className="sr-only">Campanhas e resultados. Escolha uma campanha para a abrir.</caption>
          <thead className="border-b border-border">
            <tr>{COLUNAS.map((c) => <Cabecalho key={c.col} {...c} ordem={ordem} ordenar={(col) => setOrdem((o) => proximaOrdem(o, col))} />)}</tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visiveis.map(({ c, m }) => {
              const ic = ICONE_CANAL[c.canal];
              return (
                <tr key={c.id} onClick={() => setAberta(c.id)} className="cursor-pointer hover:bg-muted/50">
                  <td className="px-3 py-2">
                    <button type="button" onClick={(e) => { e.stopPropagation(); setAberta(c.id); }} className={cn("flex min-h-11 items-center gap-3 rounded-md text-left", FOCO)}>
                      <Chip icone={ic.i} cor={ic.cor} />
                      <span>
                        <span className="block font-medium">{c.nome}</span>
                        <span className="block text-muted-foreground">
                          {c.canal}{c.pendentes.length > 0 && ` · ${c.pendentes.length} por rever`}
                        </span>
                      </span>
                    </button>
                  </td>
                  <td className="px-3 text-right tabular-nums">{m.leads}</td>
                  <td className="px-3 text-right tabular-nums">{m.ganhos}</td>
                  <td className="px-3 text-right tabular-nums">{euros(m.receita)}</td>
                  <td className="px-3 text-right tabular-nums">{m.investimento ? euros(m.investimento) : "—"}</td>
                  <td className="px-3 text-right tabular-nums">{ouTraco(m.custoLead)}</td>
                  <td className="px-3 text-right tabular-nums">{ouTraco(m.custoGanho)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {visiveis.length === 0 && <p className="p-5 text-[15px] text-muted-foreground">Nenhuma campanha com "{q}".</p>}
      </div>
      <p className="mt-2 text-[15px] text-muted-foreground">"—": sem investimento, ou ainda sem leads ou ganhos para dividir.</p>
      {soltas.length > 0 && (
        <p className="mt-1 text-[15px] text-muted-foreground">
          Sem campanha: {soltas.join(", ")} ({soltas.length === 1 ? "chegou" : "chegaram"} com uma UTM que não corresponde a nenhuma campanha).
        </p>
      )}
    </div>
  );
}

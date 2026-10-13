import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { formatarPct } from "@/lib/custos";
import {
  custosApi, useCategoriasServico, useGravarCustos, useMargensLinha, useResumoCustos, useServicosOrg,
  type CategoriaServico, type MargemLinha,
} from "@/hooks/custos/useCustos";
import { CampoNumero, Seccao, Vazio } from "./pecas";
import { mensagemErro } from "./erros";

interface Linha { c: CategoriaServico; nivel: number }

/** As categorias em árvore (mãe antes das filhas), como em fn_margem_linha. */
function arvore(cats: CategoriaServico[]): Linha[] {
  const filhos = new Map<string | null, CategoriaServico[]>();
  const ids = new Set(cats.map((c) => c.id));
  for (const c of cats) {
    const p = c.parent_id && ids.has(c.parent_id) ? c.parent_id : null;
    filhos.set(p, [...(filhos.get(p) ?? []), c]);
  }
  const out: Linha[] = [];
  const andar = (p: string | null, nivel: number) => {
    for (const c of filhos.get(p) ?? []) {
      out.push({ c, nivel });
      if (nivel < 10) andar(c.id, nivel + 1);
    }
  };
  andar(null, 0);
  return out;
}

export function SeccaoMargens({ org, podeAprovar }: { org: string; podeAprovar: boolean }) {
  const { toast } = useToast();
  const cats = useCategoriasServico(org);
  const margens = useMargensLinha(org);
  const servicos = useServicosOrg(org);
  const resumo = useResumoCustos(org);
  const erro = (e: unknown) => toast({ title: "Não foi possível gravar", description: mensagemErro(e), variant: "destructive" });
  const gravar = useGravarCustos(org, (a: { cat: string; min: number; alvo: number }) => custosApi.guardarMargemLinha(org, a.cat, a.min, a.alvo));
  const herdar = useGravarCustos(org, (id: string) => custosApi.apagar("service_line_margins", id));

  const geral = {
    min: Number(resumo.data?.parametros?.margem_minima_padrao ?? 28),
    alvo: Number(resumo.data?.parametros?.margem_alvo_padrao ?? 35),
  };
  const porCat = useMemo(() => new Map((margens.data ?? []).map((m) => [m.service_category_id, m])), [margens.data]);
  const pai = useMemo(() => new Map((cats.data ?? []).map((c) => [c.id, c.parent_id])), [cats.data]);
  const nome = useMemo(() => new Map((cats.data ?? []).map((c) => [c.id, c.name])), [cats.data]);
  const svcPorCat = useMemo(() => {
    const m = new Map<string, { id: string; name: string }[]>();
    for (const s of servicos.data ?? []) if (s.service_category_id) m.set(s.service_category_id, [...(m.get(s.service_category_id) ?? []), s]);
    return m;
  }, [servicos.data]);

  /** A margem que vale para a categoria: a própria, a da mãe mais próxima, ou a geral. */
  const efetiva = (id: string): { m: { margem_minima: number; margem_alvo: number }; origem: string } => {
    let atual: string | null | undefined = id;
    for (let i = 0; atual && i <= 10; i++) {
      const m: MargemLinha | undefined = porCat.get(atual);
      if (m) return { m, origem: i === 0 ? "própria" : `de ${nome.get(atual)}` };
      atual = pai.get(atual);
    }
    return { m: { margem_minima: geral.min, margem_alvo: geral.alvo }, origem: "geral" };
  };

  const linhas = arvore(cats.data ?? []);
  const semCategoria = (servicos.data ?? []).filter((s) => !s.service_category_id);

  return (
    <Seccao
      id="margens"
      titulo="Margens por linha"
      descricao={
        <>
          A margem conta sobre o preço: (preço − custo) ÷ preço. Abaixo da mínima, a proposta espera pela aprovação da
          Direção; abaixo do custo, nunca se envia. Uma linha sem valor próprio herda da linha-mãe e, no fim, da geral
          ({formatarPct(geral.min)}% / {formatarPct(geral.alvo)}%).
          {!podeAprovar && " Só a Direção muda as margens."}
        </>
      }
    >
      {cats.isLoading || margens.isLoading ? (
        <Vazio>A carregar…</Vazio>
      ) : linhas.length === 0 ? (
        <Vazio>Não há categorias de serviço. Crie-as em Serviços › Categorias.</Vazio>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Linha de serviço</TableHead>
                <TableHead className="w-32">Mínima</TableHead>
                <TableHead className="w-32">Alvo</TableHead>
                <TableHead className="w-40">Vem de</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map(({ c, nivel }) => {
                const { m, origem } = efetiva(c.id);
                const propria = porCat.get(c.id);
                const svcs = svcPorCat.get(c.id) ?? [];
                const guardar = (min: number, alvo: number) => {
                  if (alvo < min) return erro(new Error("A margem alvo não pode ser menor do que a mínima."));
                  gravar.mutate({ cat: c.id, min, alvo }, { onError: erro });
                };
                return (
                  <TableRow key={c.id}>
                    <TableCell style={{ paddingLeft: `${0.75 + nivel * 1.25}rem` }}>
                      <div className="font-medium">{c.name}</div>
                      {svcs.length > 0 && (
                        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                          Receitas:
                          {svcs.map((s) => (
                            <Link key={s.id} to={`/custos/servicos/${s.id}`} className="underline underline-offset-2 hover:text-foreground">
                              {s.name}
                            </Link>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <CampoNumero ariaLabel={`Margem mínima de ${c.name}`} valor={m.margem_minima} casas={1} sufixo="%"
                        disabled={!podeAprovar} onGravar={(v) => v != null && guardar(v, Math.max(v, Number(m.margem_alvo)))} />
                    </TableCell>
                    <TableCell>
                      <CampoNumero ariaLabel={`Margem alvo de ${c.name}`} valor={m.margem_alvo} casas={1} sufixo="%"
                        disabled={!podeAprovar} onGravar={(v) => v != null && guardar(Number(m.margem_minima), v)} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={propria ? "default" : "outline"}>{origem}</Badge>
                    </TableCell>
                    <TableCell>
                      {podeAprovar && propria && (
                        <Button variant="ghost" size="icon" aria-label="Voltar a herdar" title="Voltar a herdar"
                          onClick={() => herdar.mutate(propria.id, { onError: erro })}>
                          <Undo2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {semCategoria.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Serviços sem linha (usam a margem geral):{" "}
          {semCategoria.map((s, i) => (
            <span key={s.id}>
              {i > 0 && ", "}
              <Link to={`/custos/servicos/${s.id}`} className="underline underline-offset-2">{s.name}</Link>
            </span>
          ))}
        </p>
      )}
    </Seccao>
  );
}

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { CATEGORIAS_ESTRUTURA, estruturaHora, formatarEur, totalEstrutura } from "@/lib/custos";
import { custosApi, useEstrutura, useGravarCustos, useResumoCustos, type ItemEstruturaLinha } from "@/hooks/custos/useCustos";
import { CampoNumero, CampoTexto, Numero, Seccao, Vazio } from "./pecas";
import { mensagemErro } from "./erros";

const OPCOES = CATEGORIAS_ESTRUTURA.map((c) => ({ value: c.valor, label: c.nome }));

export function SeccaoEstrutura({ org, podeEditar }: { org: string; podeEditar: boolean }) {
  const { toast } = useToast();
  const lista = useEstrutura(org);
  const resumo = useResumoCustos(org);
  const [novo, setNovo] = useState("");
  const erro = (e: unknown) => toast({ title: "Não foi possível gravar", description: mensagemErro(e), variant: "destructive" });
  const mudar = useGravarCustos(org, ({ id, v }: { id: string; v: Partial<ItemEstruturaLinha> }) => custosApi.mudar("cost_structure_items", id, v));
  const juntar = useGravarCustos(org, (descricao: string) => custosApi.inserir("cost_structure_items", { organization_id: org, descricao }));
  const apagar = useGravarCustos(org, (id: string) => custosApi.apagar("cost_structure_items", id));

  const itens = lista.data ?? [];
  const horas = Number(resumo.data?.parametros?.horas_empresa_mes ?? 0);

  return (
    <Seccao
      id="estrutura"
      titulo="Estrutura"
      descricao="Os custos fixos do mês (renda, viaturas, pessoal que não está em obra…). A taxa por hora = total ativo ÷ horas produtivas da empresa (nos Parâmetros)."
    >
      {lista.isLoading ? (
        <Vazio>A carregar…</Vazio>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-52">Categoria</TableHead>
                <TableHead className="w-40">Valor mensal</TableHead>
                <TableHead className="w-20">Ativo</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map((i) => (
                <TableRow key={i.id} className={i.ativo ? "" : "opacity-60"}>
                  <TableCell>
                    <CampoTexto ariaLabel="Descrição" valor={i.descricao} disabled={!podeEditar}
                      onGravar={(descricao) => mudar.mutate({ id: i.id, v: { descricao } }, { onError: erro })} />
                  </TableCell>
                  <TableCell>
                    <NativeSelect className="h-8" options={OPCOES} value={i.categoria} disabled={!podeEditar} aria-label="Categoria"
                      onValueChange={(categoria) => mudar.mutate({ id: i.id, v: { categoria } }, { onError: erro })} />
                  </TableCell>
                  <TableCell>
                    <CampoNumero ariaLabel="Valor mensal" valor={i.valor_mensal} sufixo="€/mês" disabled={!podeEditar}
                      onGravar={(v) => v != null && mudar.mutate({ id: i.id, v: { valor_mensal: v } }, { onError: erro })} />
                  </TableCell>
                  <TableCell>
                    <Switch checked={i.ativo} disabled={!podeEditar} aria-label="Ativo"
                      onCheckedChange={(ativo) => mudar.mutate({ id: i.id, v: { ativo } }, { onError: erro })} />
                  </TableCell>
                  <TableCell>
                    {podeEditar && (
                      <Button variant="ghost" size="icon" aria-label="Apagar" onClick={() => apagar.mutate(i.id, { onError: erro })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {itens.length === 0 && (
                <TableRow><TableCell colSpan={5}><Vazio>Ainda não há custos de estrutura.</Vazio></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {podeEditar ? (
          <form className="flex gap-2 max-w-md flex-1" onSubmit={(ev) => {
            ev.preventDefault();
            if (!novo.trim()) return;
            juntar.mutate(novo.trim(), { onError: erro });
            setNovo("");
          }}>
            <Input value={novo} onChange={(ev) => setNovo(ev.target.value)} placeholder="Novo custo (ex.: Renda do armazém)" aria-label="Novo custo de estrutura" />
            <Button type="submit" variant="outline"><Plus className="mr-1 h-4 w-4" />Juntar</Button>
          </form>
        ) : <span />}
        <div className="text-sm rounded-md bg-muted/50 px-3 py-2">
          Total: <Numero className="font-medium">{formatarEur(totalEstrutura(itens))} €/mês</Numero>
          {" · "}
          {horas > 0 ? (
            <>÷ <Numero>{formatarEur(horas)}</Numero> h = <Numero className="font-semibold">{formatarEur(estruturaHora(itens, horas))} €/h</Numero></>
          ) : (
            <span className="text-muted-foreground">indique as horas produtivas da empresa nos Parâmetros</span>
          )}
        </div>
      </div>
    </Seccao>
  );
}

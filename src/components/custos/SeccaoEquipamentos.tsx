import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { custoHoraEquipamento, formatarEur } from "@/lib/custos";
import { custosApi, useEquipamentos, useGravarCustos, type Equipamento } from "@/hooks/custos/useCustos";
import { CampoNumero, CampoTexto, Numero, Seccao, Vazio } from "./pecas";
import { mensagemErro } from "./erros";

const COLUNAS: { k: keyof Equipamento; nome: string; sufixo: string }[] = [
  { k: "compra", nome: "Compra", sufixo: "€" },
  { k: "residual", nome: "Valor residual", sufixo: "€" },
  { k: "vida_util_horas", nome: "Vida útil", sufixo: "h" },
  { k: "manutencao_anual", nome: "Manutenção", sufixo: "€/ano" },
  { k: "uso_horas_ano", nome: "Uso", sufixo: "h/ano" },
];

export function SeccaoEquipamentos({ org, podeEditar }: { org: string; podeEditar: boolean }) {
  const { toast } = useToast();
  const lista = useEquipamentos(org);
  const [novo, setNovo] = useState("");
  const erro = (e: unknown) => toast({ title: "Não foi possível gravar", description: mensagemErro(e), variant: "destructive" });
  const mudar = useGravarCustos(org, ({ id, v }: { id: string; v: Partial<Equipamento> }) => custosApi.mudar("cost_equipment", id, v));
  const juntar = useGravarCustos(org, (nome: string) => custosApi.inserir("cost_equipment", { organization_id: org, nome }));
  const apagar = useGravarCustos(org, (id: string) => custosApi.apagar("cost_equipment", id));

  return (
    <Seccao
      id="equipamentos"
      titulo="Equipamentos"
      descricao="Custo por hora de uso = (compra − residual) ÷ vida útil + manutenção anual ÷ horas de uso por ano."
    >
      {lista.isLoading ? (
        <Vazio>A carregar…</Vazio>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Equipamento</TableHead>
                {COLUNAS.map((c) => <TableHead key={c.k} className="w-32">{c.nome}</TableHead>)}
                <TableHead className="w-24 text-right">€/h</TableHead>
                <TableHead className="w-20">Ativo</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(lista.data ?? []).map((e) => (
                <TableRow key={e.id} className={e.ativo ? "" : "opacity-60"}>
                  <TableCell>
                    <CampoTexto ariaLabel="Nome do equipamento" valor={e.nome} disabled={!podeEditar}
                      onGravar={(nome) => mudar.mutate({ id: e.id, v: { nome } }, { onError: erro })} />
                  </TableCell>
                  {COLUNAS.map((c) => (
                    <TableCell key={c.k}>
                      <CampoNumero ariaLabel={c.nome} valor={e[c.k] as number} sufixo={c.sufixo} disabled={!podeEditar}
                        onGravar={(v) => v != null && mudar.mutate({ id: e.id, v: { [c.k]: v } }, { onError: erro })} />
                    </TableCell>
                  ))}
                  <TableCell className="text-right">
                    <Numero className="font-medium">{formatarEur(custoHoraEquipamento(e))}</Numero>
                  </TableCell>
                  <TableCell>
                    <Switch checked={e.ativo} disabled={!podeEditar} aria-label="Ativo"
                      onCheckedChange={(ativo) => mudar.mutate({ id: e.id, v: { ativo } }, { onError: erro })} />
                  </TableCell>
                  <TableCell>
                    {podeEditar && (
                      <Button variant="ghost" size="icon" aria-label="Apagar equipamento"
                        onClick={() => apagar.mutate(e.id, { onError: (x) => erro(/foreign key|violates/i.test(String(x)) ? new Error("Está em uso numa receita: retire-o primeiro.") : x) })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {lista.data?.length === 0 && (
                <TableRow><TableCell colSpan={9}><Vazio>Ainda não há equipamentos.</Vazio></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
      {podeEditar && (
        <form className="flex gap-2 max-w-md" onSubmit={(ev) => {
          ev.preventDefault();
          if (!novo.trim()) return;
          juntar.mutate(novo.trim(), { onError: erro });
          setNovo("");
        }}>
          <Input value={novo} onChange={(ev) => setNovo(ev.target.value)} placeholder="Novo equipamento (ex.: Martelo demolidor)" aria-label="Novo equipamento" />
          <Button type="submit" variant="outline"><Plus className="mr-1 h-4 w-4" />Juntar</Button>
        </form>
      )}
    </Seccao>
  );
}

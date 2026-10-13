import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { formatarEur } from "@/lib/custos";
import { custosApi, useGravarCustos, usePerfis, type PerfilLinha } from "@/hooks/custos/useCustos";
import { CampoNumero, CampoTexto, Numero, Seccao, Vazio } from "./pecas";
import { mensagemErro } from "./erros";

type Mudanca = Partial<{ nome: string; salario: number | null; encargos_pct: number | null; custo_hora_manual: number | null; ativo: boolean }>;

export function SeccaoPerfis({ org, podeEditar, podeVerSalario }: { org: string; podeEditar: boolean; podeVerSalario: boolean }) {
  const { toast } = useToast();
  const perfis = usePerfis(org);
  const verSalario = podeVerSalario && (perfis.data?.[0]?.salario_visivel ?? true);
  const [novo, setNovo] = useState("");
  const erro = (e: unknown) => toast({ title: "Não foi possível gravar", description: mensagemErro(e), variant: "destructive" });

  const gravar = useGravarCustos(org, ({ p, m }: { p: PerfilLinha | null; m: Mudanca }) =>
    custosApi.guardarPerfil(org, {
      id: p?.id ?? null,
      nome: m.nome ?? p?.nome ?? "",
      salario: m.salario,
      mudarSalario: "salario" in m,
      encargos_pct: "encargos_pct" in m ? m.encargos_pct ?? null : p?.encargos_pct ?? null,
      custo_hora_manual: "custo_hora_manual" in m ? m.custo_hora_manual ?? null : p?.custo_hora_manual ?? null,
      ativo: m.ativo ?? p?.ativo ?? true,
    }),
  );
  const apagar = useGravarCustos(org, (id: string) => custosApi.apagarPerfil(id));
  const mudar = (p: PerfilLinha | null, m: Mudanca) => gravar.mutate({ p, m }, { onError: erro });

  return (
    <Seccao
      id="perfis"
      titulo="Perfis"
      descricao={
        <>
          As categorias de quem faz o trabalho. O custo/hora sai do salário e dos parâmetros, ou escreve-se à mão
          (ex.: subempreiteiro).{" "}
          {verSalario ? "Os salários só aparecem a quem tem permissão para os ver." : "Os salários estão escondidos: vê só o custo/hora."}
        </>
      }
    >
      {perfis.isLoading ? (
        <Vazio>A carregar…</Vazio>
      ) : perfis.error ? (
        <Vazio>{mensagemErro(perfis.error)}</Vazio>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Perfil</TableHead>
                {verSalario && <TableHead className="w-36">Salário base</TableHead>}
                <TableHead className="w-32">Encargos próprios</TableHead>
                <TableHead className="w-36">Custo/hora manual</TableHead>
                <TableHead className="w-28 text-right">Custo/hora</TableHead>
                <TableHead className="w-24">Ativo</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(perfis.data ?? []).map((p) => (
                <TableRow key={p.id} className={p.ativo ? "" : "opacity-60"}>
                  <TableCell>
                    <CampoTexto ariaLabel="Nome do perfil" valor={p.nome} disabled={!podeEditar} onGravar={(nome) => mudar(p, { nome })} />
                    {p.servicos_em_uso > 0 && (
                      <span className="text-xs text-muted-foreground">Em {p.servicos_em_uso} receita(s)</span>
                    )}
                  </TableCell>
                  {verSalario && (
                    <TableCell>
                      <CampoNumero ariaLabel="Salário base" valor={p.salario_base} vazioPermitido sufixo="€" disabled={!podeEditar}
                        onGravar={(salario) => mudar(p, { salario })} />
                    </TableCell>
                  )}
                  <TableCell>
                    <CampoNumero ariaLabel="Encargos próprios" valor={p.encargos_pct} vazioPermitido sufixo="%" disabled={!podeEditar}
                      onGravar={(encargos_pct) => mudar(p, { encargos_pct })} />
                  </TableCell>
                  <TableCell>
                    <CampoNumero ariaLabel="Custo/hora manual" valor={p.custo_hora_manual} vazioPermitido sufixo="€/h" disabled={!podeEditar}
                      onGravar={(custo_hora_manual) => mudar(p, { custo_hora_manual })} />
                  </TableCell>
                  <TableCell className="text-right">
                    {p.custo_hora == null ? (
                      <Badge variant="outline" className="text-amber-700 border-amber-300">Sem custo/hora</Badge>
                    ) : (
                      <Numero className="font-medium">{formatarEur(p.custo_hora)} €</Numero>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch checked={p.ativo} disabled={!podeEditar} aria-label="Ativo" onCheckedChange={(ativo) => mudar(p, { ativo })} />
                  </TableCell>
                  <TableCell>
                    {podeEditar && (
                      <Button variant="ghost" size="icon" aria-label="Apagar perfil" disabled={p.servicos_em_uso > 0}
                        title={p.servicos_em_uso > 0 ? "Está em uso numa receita" : "Apagar"}
                        onClick={() => apagar.mutate(p.id, { onError: erro })}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {perfis.data?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}><Vazio>Ainda não há perfis.</Vazio></TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
      {podeEditar && (
        <form
          className="flex gap-2 max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            if (!novo.trim()) return;
            mudar(null, { nome: novo.trim() });
            setNovo("");
          }}
        >
          <Input value={novo} onChange={(e) => setNovo(e.target.value)} placeholder="Novo perfil (ex.: Canalizador)" aria-label="Novo perfil" />
          <Button type="submit" variant="outline"><Plus className="mr-1 h-4 w-4" />Juntar</Button>
        </form>
      )}
    </Seccao>
  );
}

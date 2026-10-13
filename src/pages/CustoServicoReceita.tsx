// Receita de um serviço (/custos/servicos/:id): a medida e o que custa cada
// medida — mão de obra, equipamentos e consumíveis. O resumo vem de
// rpc_custo_servico (a mesma conta que a verificação de margem usa).
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/usePermissions";
import { custoHoraEquipamento, formatarEur, formatarPct } from "@/lib/custos";
import {
  custosApi, useCustoServico, useEquipamentos, useGravarReceita, usePerfis, useReceita, useServico,
} from "@/hooks/custos/useCustos";
import { CampoNumero, CampoTexto, Numero, Seccao, Vazio } from "@/components/custos/pecas";
import { mensagemErro } from "@/components/custos/erros";

const ORIGEM: Record<string, string> = { linha: "da linha", linha_mae: "da linha-mãe", geral: "geral" };

export default function CustoServicoReceita() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const podeEditar = hasPermission("costs.edit");
  const servico = useServico(id);
  const org = servico.data?.organization_id;
  const custo = useCustoServico(id);
  const rec = useReceita(id);
  const perfis = usePerfis(org);
  const equips = useEquipamentos(org);
  const [medidaNova, setMedidaNova] = useState("m²");
  const [consNovo, setConsNovo] = useState("");

  const erro = (e: unknown) => toast({ title: "Não foi possível gravar", description: mensagemErro(e), variant: "destructive" });
  const inserir = useGravarReceita(id, (a: { t: string; v: Record<string, unknown> }) => custosApi.inserir(a.t, a.v));
  const mudar = useGravarReceita(id, (a: { t: string; id: string; v: Record<string, unknown> }) => custosApi.mudar(a.t, a.id, a.v));
  const apagar = useGravarReceita(id, (a: { t: string; id: string }) => custosApi.apagar(a.t, a.id));

  const receita = rec.data?.receita ?? null;
  const filha = (t: string, v: Record<string, unknown>) =>
    receita && inserir.mutate({ t, v: { organization_id: receita.organization_id, recipe_id: receita.id, ...v } }, { onError: erro });
  const muda = (t: string, linha: string, v: Record<string, unknown>) => mudar.mutate({ t, id: linha, v }, { onError: erro });
  const tira = (t: string, linha: string) => apagar.mutate({ t, id: linha }, { onError: erro });

  const perfisAtivos = (perfis.data ?? []).filter((p) => p.ativo);
  const optPerfis = perfisAtivos.map((p) => ({ value: p.id, label: p.custo_hora == null ? `${p.nome} (sem custo/hora)` : `${p.nome} · ${formatarEur(p.custo_hora)} €/h` }));
  const optEquip = (equips.data ?? []).filter((e) => e.ativo).map((e) => ({ value: e.id, label: `${e.nome} · ${formatarEur(custoHoraEquipamento(e))} €/h` }));
  const c = custo.data;
  const medida = receita?.medida ?? "un";

  if (servico.isLoading) return <div className="container mx-auto p-6"><Vazio>A carregar…</Vazio></div>;
  if (!servico.data)
    return (
      <div className="container mx-auto p-6 space-y-4">
        <Link to="/custos" className="text-sm inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Custos</Link>
        <Vazio>Serviço não encontrado.</Vazio>
      </div>
    );

  const abaixoMin = c?.margem != null && c.margem < c.margem_minima;

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6">
      <div className="space-y-1">
        <Link to="/custos#margens" className="text-sm inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />Custos
        </Link>
        <h1 className="text-3xl font-bold">{servico.data.name}</h1>
        <p className="text-muted-foreground">Receita: o que custa fazer uma medida deste serviço.</p>
      </div>

      {/* Resumo */}
      <Card className="p-4 sm:p-6">
        {custo.isLoading ? (
          <Vazio>A calcular…</Vazio>
        ) : custo.error ? (
          <Vazio>{mensagemErro(custo.error)}</Vazio>
        ) : c ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Valor nome={`Custo por ${medida}`} valor={c.custo_por_medida == null ? "—" : `${formatarEur(c.custo_por_medida)} €`} destaque />
              <Valor nome="Preço de tabela" valor={c.preco_tabela == null ? "Sem preço" : `${formatarEur(c.preco_tabela)} €`} />
              <Valor
                nome="Margem"
                valor={c.margem == null ? "—" : `${formatarPct(c.margem)}%`}
                sub={`mínimo ${formatarPct(c.margem_minima)}% · alvo ${formatarPct(c.margem_alvo)}% (${ORIGEM[c.origem_margem] ?? c.origem_margem})`}
                aviso={abaixoMin}
              />
              <Valor nome="Preço para a margem alvo" valor={c.preco_sugerido == null ? "—" : `${formatarEur(c.preco_sugerido)} €`} />
            </div>
            {c.tem_receita && (
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
                <span>Mão de obra <Numero className="text-foreground">{formatarEur(c.mao_obra)} €</Numero></span>
                <span>Equipamentos <Numero className="text-foreground">{formatarEur(c.equipamentos)} €</Numero></span>
                <span>Consumíveis <Numero className="text-foreground">{formatarEur(c.consumiveis)} €</Numero></span>
                <span>
                  Estrutura <Numero className="text-foreground">{formatarEur(c.estrutura)} €</Numero>
                  {!c.somar_estrutura && " (não somada: paga-se com a margem)"}
                </span>
                <span>{formatarEur(c.horas)} h por {medida}</span>
              </div>
            )}
            {c.avisos.length > 0 && (
              <ul className="space-y-1">
                {c.avisos.map((a, i) => (
                  <li key={i} className="flex gap-2 text-sm text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />{a.mensagem}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </Card>

      {!rec.isLoading && !receita ? (
        <Card className="p-4 sm:p-6 space-y-3">
          <p>Este serviço ainda não tem receita. Sem ela, o custo é desconhecido e a proposta mostra o aviso "sem custo".</p>
          {podeEditar && (
            <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => {
              e.preventDefault();
              inserir.mutate({ t: "service_recipes", v: { organization_id: org, service_id: id, medida: medidaNova.trim() || "un" } }, { onError: erro });
            }}>
              <span className="text-sm">Medida:</span>
              <Input className="w-28" value={medidaNova} onChange={(e) => setMedidaNova(e.target.value)} aria-label="Medida" placeholder="m², pt, un…" />
              <Button type="submit"><Plus className="mr-1 h-4 w-4" />Criar receita</Button>
            </form>
          )}
        </Card>
      ) : receita && (
        <>
          <div className="flex items-center gap-2 max-w-xs">
            <span className="text-sm whitespace-nowrap">Medida:</span>
            <CampoTexto ariaLabel="Medida" valor={receita.medida} disabled={!podeEditar}
              onGravar={(m) => muda("service_recipes", receita.id, { medida: m })} />
          </div>

          <Seccao id="mao-obra" titulo="Mão de obra" descricao={`Horas de cada perfil por ${medida}.`}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-72">Perfil</TableHead>
                  <TableHead>Tarefa</TableHead>
                  <TableHead className="w-36">Horas/{medida}</TableHead>
                  <TableHead className="w-28 text-right">Custo</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rec.data?.maoObra ?? []).map((l) => {
                  const p = perfis.data?.find((x) => x.id === l.perfil_id);
                  const ch = p?.custo_hora ?? null;
                  return (
                    <TableRow key={l.id}>
                      <TableCell>
                        <NativeSelect className="h-8" aria-label="Perfil" disabled={!podeEditar}
                          options={p && !p.ativo ? [...optPerfis, { value: p.id, label: `${p.nome} (inativo)` }] : optPerfis}
                          value={l.perfil_id} onValueChange={(v) => muda("service_recipe_labor", l.id, { perfil_id: v })} />
                      </TableCell>
                      <TableCell>
                        <CampoTexto ariaLabel="Tarefa" valor={l.descricao} placeholder="Opcional" disabled={!podeEditar}
                          onGravar={(d) => muda("service_recipe_labor", l.id, { descricao: d })} />
                      </TableCell>
                      <TableCell>
                        <CampoNumero ariaLabel="Horas por medida" casas={4} valor={l.horas_por_medida} sufixo="h" disabled={!podeEditar}
                          onGravar={(v) => v != null && muda("service_recipe_labor", l.id, { horas_por_medida: v })} />
                      </TableCell>
                      <TableCell className="text-right">
                        {ch == null ? <span className="text-xs text-amber-700">usa a média</span>
                          : <Numero>{formatarEur(l.horas_por_medida * ch)} €</Numero>}
                      </TableCell>
                      <TableCell>
                        {podeEditar && <Button variant="ghost" size="icon" aria-label="Tirar" onClick={() => tira("service_recipe_labor", l.id)}><Trash2 className="h-4 w-4" /></Button>}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(rec.data?.maoObra ?? []).length === 0 && <TableRow><TableCell colSpan={5}><Vazio>Sem mão de obra.</Vazio></TableCell></TableRow>}
              </TableBody>
            </Table>
            {podeEditar && (
              optPerfis.length === 0 ? (
                <p className="text-sm text-muted-foreground">Crie primeiro os perfis em <Link to="/custos#perfis" className="underline">Custos › Perfis</Link>.</p>
              ) : (
                <NativeSelect className="max-w-sm" aria-label="Juntar perfil" placeholder="Juntar um perfil…" options={optPerfis} value=""
                  onValueChange={(v) => v && filha("service_recipe_labor", { perfil_id: v, horas_por_medida: 1, ordem: (rec.data?.maoObra.length ?? 0) })} />
              )
            )}
          </Seccao>

          <Seccao id="equip" titulo="Equipamentos" descricao={`Horas de uso de cada equipamento por ${medida}.`}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Equipamento</TableHead>
                  <TableHead className="w-36">Horas/{medida}</TableHead>
                  <TableHead className="w-28 text-right">Custo</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rec.data?.equipamentos ?? []).map((l) => {
                  const e = equips.data?.find((x) => x.id === l.equipamento_id);
                  return (
                    <TableRow key={l.id}>
                      <TableCell>{e?.nome ?? "—"}</TableCell>
                      <TableCell>
                        <CampoNumero ariaLabel="Horas por medida" casas={4} valor={l.horas_por_medida} sufixo="h" disabled={!podeEditar}
                          onGravar={(v) => v != null && muda("service_recipe_equipment", l.id, { horas_por_medida: v })} />
                      </TableCell>
                      <TableCell className="text-right"><Numero>{e ? `${formatarEur(l.horas_por_medida * custoHoraEquipamento(e))} €` : "—"}</Numero></TableCell>
                      <TableCell>
                        {podeEditar && <Button variant="ghost" size="icon" aria-label="Tirar" onClick={() => tira("service_recipe_equipment", l.id)}><Trash2 className="h-4 w-4" /></Button>}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(rec.data?.equipamentos ?? []).length === 0 && <TableRow><TableCell colSpan={4}><Vazio>Sem equipamentos.</Vazio></TableCell></TableRow>}
              </TableBody>
            </Table>
            {podeEditar && optEquip.length > 0 && (
              <NativeSelect className="max-w-sm" aria-label="Juntar equipamento" placeholder="Juntar um equipamento…" options={optEquip} value=""
                onValueChange={(v) => v && filha("service_recipe_equipment", { equipamento_id: v, horas_por_medida: 0.5, ordem: (rec.data?.equipamentos.length ?? 0) })} />
            )}
          </Seccao>

          <Seccao id="consumiveis" titulo="Consumíveis" descricao={`Quantidade e preço de cada consumível por ${medida}. A data do preço muda sozinha quando muda o preço.`}>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Consumível</TableHead>
                    <TableHead className="w-24">Unidade</TableHead>
                    <TableHead className="w-36">Qtd./{medida}</TableHead>
                    <TableHead className="w-36">Preço</TableHead>
                    <TableHead className="w-28">Data do preço</TableHead>
                    <TableHead className="w-28 text-right">Custo</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rec.data?.consumiveis ?? []).map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <CampoTexto ariaLabel="Consumível" valor={l.descricao} disabled={!podeEditar}
                          onGravar={(d) => muda("service_recipe_consumables", l.id, { descricao: d })} />
                      </TableCell>
                      <TableCell>
                        <CampoTexto ariaLabel="Unidade" valor={l.unidade} placeholder="kg, m…" disabled={!podeEditar}
                          onGravar={(u) => muda("service_recipe_consumables", l.id, { unidade: u })} />
                      </TableCell>
                      <TableCell>
                        <CampoNumero ariaLabel="Quantidade por medida" casas={4} valor={l.quantidade_por_medida} disabled={!podeEditar}
                          onGravar={(v) => v != null && muda("service_recipe_consumables", l.id, { quantidade_por_medida: v })} />
                      </TableCell>
                      <TableCell>
                        <CampoNumero ariaLabel="Preço unitário" casas={4} valor={l.preco_unitario} vazioPermitido sufixo="€" disabled={!podeEditar}
                          onGravar={(v) => muda("service_recipe_consumables", l.id, { preco_unitario: v })} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {l.preco_atualizado_em ? new Date(l.preco_atualizado_em).toLocaleDateString("pt-PT") : l.catalog_item_id ? "do catálogo" : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Numero>{l.preco_unitario == null ? "—" : `${formatarEur(l.quantidade_por_medida * l.preco_unitario)} €`}</Numero>
                      </TableCell>
                      <TableCell>
                        {podeEditar && <Button variant="ghost" size="icon" aria-label="Tirar" onClick={() => tira("service_recipe_consumables", l.id)}><Trash2 className="h-4 w-4" /></Button>}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(rec.data?.consumiveis ?? []).length === 0 && <TableRow><TableCell colSpan={7}><Vazio>Sem consumíveis.</Vazio></TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
            {podeEditar && (
              <form className="flex gap-2 max-w-md" onSubmit={(e) => {
                e.preventDefault();
                if (!consNovo.trim()) return;
                filha("service_recipe_consumables", { descricao: consNovo.trim(), quantidade_por_medida: 1, ordem: (rec.data?.consumiveis.length ?? 0) });
                setConsNovo("");
              }}>
                <Input value={consNovo} onChange={(e) => setConsNovo(e.target.value)} placeholder="Novo consumível (ex.: Cimento-cola)" aria-label="Novo consumível" />
                <Button type="submit" variant="outline"><Plus className="mr-1 h-4 w-4" />Juntar</Button>
              </form>
            )}
          </Seccao>
        </>
      )}
    </div>
  );
}

function Valor({ nome, valor, sub, destaque, aviso }: { nome: string; valor: string; sub?: string; destaque?: boolean; aviso?: boolean }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{nome}</div>
      <div className={`tabular-nums ${destaque ? "text-2xl font-bold" : "text-xl font-semibold"} ${aviso ? "text-amber-700 dark:text-amber-300" : ""}`}>{valor}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

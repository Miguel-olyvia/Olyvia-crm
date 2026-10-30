/**
 * Papéis no Negócio (30/10/2026, migration 20270101340000): o que esta pessoa
 * faz no circuito do negócio (o protótipo V1). É daqui que o /negocios tira
 * quem é o Financeiro, Compras e armazém, o Gestor de obra… e a base aceita as
 * ações pelo papel (registar a fatura, validar o pagamento, aprovar a encomenda
 * a fornecedor, gravar a obra). O Técnico não se escolhe: é quem tem cargo
 * técnico de obra (o cartão "Ofícios de obra").
 *
 * Lê e grava pelas RPCs rh_ler_papeis_pessoa e rh_guardar_papeis_pessoa
 * (hr.pessoas.laborais.view / .edit). Sem conta ligada, a pessoa não entra na
 * Olyvia: o cartão avisa.
 */
import { useCallback, useEffect, useState } from "react";
import { Briefcase, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/lib/toast";
import { hrRpc } from "@/lib/hr/hrDb";
import { FAZ_O_PAPEL, PAPEIS_RH, ROTULO_PAPEL } from "@/emylia/real/papeisReal";
import type { Papel } from "@/emylia/motor";

interface Lido { papeis: Papel[]; tecnica: boolean; conta: boolean }

interface Props {
  pessoaId: string;
  organizationId: string;
  /** `hr.pessoas.laborais.edit` na organização da pessoa. */
  podeEditar: boolean;
}

const igual = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every((x) => b.has(x));

export function PessoaPapeisNegocioCard({ pessoaId, organizationId, podeEditar }: Props) {
  const [lido, setLido] = useState<Lido | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await hrRpc("rh_ler_papeis_pessoa", { p_org: organizationId, p_pessoa: pessoaId });
    if (error) { setErro(error.message ?? ""); return; }
    const l: Lido = { papeis: [], tecnica: false, conta: false, ...(data as Partial<Lido> | null) };
    setErro(null);
    setLido(l);
    setEscolhidos(new Set(l.papeis));
  }, [organizationId, pessoaId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const antes = new Set<string>(lido?.papeis ?? []);
  const alterado = !igual(antes, escolhidos);

  const gravar = async () => {
    setSaving(true);
    const { error } = await hrRpc("rh_guardar_papeis_pessoa", { p_org: organizationId, p_pessoa: pessoaId, p_papeis: [...escolhidos] });
    setSaving(false);
    if (error) { toast.error(error.message || "Não foi possível gravar os papéis."); return; }
    toast.success("Papéis gravados.");
    await carregar();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Briefcase className="h-4 w-4 text-muted-foreground" />
          Papéis no Negócio
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          O que esta pessoa faz no circuito do negócio. Cada passo só pode ser feito por quem tem o papel.
        </p>
        {erro !== null && <p className="text-sm text-destructive">{erro || "Não foi possível ler os papéis."}</p>}
        {!lido && erro === null && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {lido && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              {PAPEIS_RH.map((p) => {
                const id = `hr-papel-${p}`;
                return (
                  <label key={p} htmlFor={id} className="flex items-start gap-2 text-sm">
                    <Checkbox id={id} className="mt-0.5" checked={escolhidos.has(p)} disabled={!podeEditar || saving}
                      onCheckedChange={(v) => { const n = new Set(escolhidos); if (v === true) n.add(p); else n.delete(p); setEscolhidos(n); }} />
                    <span>
                      <span className="font-medium">{ROTULO_PAPEL[p]}</span>
                      <span className="block text-muted-foreground">{FAZ_O_PAPEL[p]}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="text-sm">
              {lido.tecnica
                ? `Técnico de obra: tem cargo técnico de obra. ${FAZ_O_PAPEL.tecnico}`
                : "Técnico de obra: só com um cargo técnico de obra."}
            </p>
            {!lido.conta && (lido.tecnica || escolhidos.size > 0) && (
              <p className="text-sm text-warning">Esta pessoa ainda não tem conta na Olyvia: sem ela não entra para fazer o seu papel.</p>
            )}
          </>
        )}
        {podeEditar && alterado && (
          <div className="flex gap-2">
            <Button size="sm" onClick={gravar} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              Gravar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEscolhidos(new Set(antes))} disabled={saving}>Cancelar</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

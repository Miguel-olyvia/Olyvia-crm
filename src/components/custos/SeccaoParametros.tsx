import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { PARAMETROS_BMG, formatarEur, type ParametrosCusto } from "@/lib/custos";
import { custosApi, useGravarCustos, useResumoCustos } from "@/hooks/custos/useCustos";
import { CampoNumero, Numero, Seccao } from "./pecas";
import { mensagemErro } from "./erros";

type Campo = { k: keyof ParametrosCusto; nome: string; sufixo: string; ajuda?: string; direcao?: boolean };

const CAMPOS: Campo[] = [
  { k: "meses_salario", nome: "Meses de salário por ano", sufixo: "meses" },
  { k: "tsu_pct", nome: "TSU da empresa", sufixo: "%" },
  { k: "encargos_pct", nome: "Encargos sobre a mão de obra", sufixo: "%", ajuda: "Seguro de acidentes, formação…" },
  { k: "subsidio_alimentacao_dia", nome: "Subsídio de alimentação", sufixo: "€/dia" },
  { k: "dias_subsidio_mes", nome: "Dias com subsídio", sufixo: "dias/mês" },
  { k: "seguro_mes", nome: "Outros custos por pessoa", sufixo: "€/mês", ajuda: "Seguros, medicina no trabalho, fardamento" },
  { k: "horas_produtivas_mes", nome: "Horas produtivas de um técnico", sufixo: "h/mês" },
  { k: "horas_empresa_mes", nome: "Horas produtivas da empresa", sufixo: "h/mês", ajuda: "Todos os técnicos. Divide a estrutura." },
  { k: "meses_desatualizado", nome: "Preço desatualizado ao fim de", sufixo: "meses" },
  { k: "margem_minima_padrao", nome: "Margem mínima geral", sufixo: "%", direcao: true },
  { k: "margem_alvo_padrao", nome: "Margem alvo geral", sufixo: "%", direcao: true },
];

export function SeccaoParametros({ org, podeEditar, podeAprovar }: { org: string; podeEditar: boolean; podeAprovar: boolean }) {
  const { toast } = useToast();
  const resumo = useResumoCustos(org);
  const par = resumo.data?.parametros ?? { ...PARAMETROS_BMG, organization_id: org };
  // Manda sempre a linha toda (só as colunas editáveis): a 1.ª gravação cria-a.
  const atuais = () =>
    Object.fromEntries([...CAMPOS.map((c) => c.k), "somar_estrutura" as const].map((k) => [k, par[k]])) as Partial<ParametrosCusto>;
  const gravar = useGravarCustos(org, (v: Partial<ParametrosCusto>) => custosApi.guardarParametros(org, { ...atuais(), ...v }));
  const mudar = (v: Partial<ParametrosCusto>) =>
    gravar.mutate(v, {
      onError: (e) => toast({ title: "Não foi possível gravar", description: mensagemErro(e), variant: "destructive" }),
    });

  return (
    <Seccao
      id="parametros"
      titulo="Parâmetros"
      descricao="As regras de cálculo da empresa. Os valores de partida são os do método BMG: 14 meses, TSU 23,75%, encargos 7,5%, 173,33 h por mês, margem mínima 28% e alvo 35%."
    >
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        {CAMPOS.map((c) => (
          <div key={c.k} className="space-y-1">
            <Label className="text-sm">{c.nome}</Label>
            <CampoNumero
              ariaLabel={c.nome}
              valor={par[c.k] as number}
              casas={c.k === "meses_desatualizado" ? 0 : 2}
              sufixo={c.sufixo}
              disabled={!podeEditar || (c.direcao && !podeAprovar) || resumo.isLoading}
              onGravar={(v) => v != null && mudar({ [c.k]: v } as Partial<ParametrosCusto>)}
            />
            {c.ajuda && <p className="text-xs text-muted-foreground">{c.ajuda}</p>}
            {c.direcao && !podeAprovar && <p className="text-xs text-muted-foreground">Só a Direção muda.</p>}
          </div>
        ))}
        <div className="space-y-1">
          <Label className="text-sm" htmlFor="somar-estrutura">Somar a estrutura ao custo dos serviços</Label>
          <div className="flex items-center gap-2 h-8">
            <Switch
              id="somar-estrutura"
              checked={!!par.somar_estrutura}
              disabled={!podeEditar}
              onCheckedChange={(v) => mudar({ somar_estrutura: v })}
            />
            <span className="text-xs text-muted-foreground">
              {par.somar_estrutura ? "Sim: cada hora leva a estrutura." : "Não: a estrutura paga-se com a margem (BMG)."}
            </span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-6 rounded-md bg-muted/50 p-3 text-sm">
        <span>
          Estrutura: <Numero className="font-medium">{formatarEur(resumo.data?.estrutura_hora)} €/h</Numero>
        </span>
        <span>
          Custo/hora médio dos perfis: <Numero className="font-medium">{formatarEur(resumo.data?.custo_hora_medio)} €/h</Numero>
        </span>
      </div>
    </Seccao>
  );
}

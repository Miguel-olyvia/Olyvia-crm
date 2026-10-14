// As Ligações (pgLigacoes do protótipo): com que módulos a Frota fala e o que já existe na base de dados. Na app real,
// cada cartão tem o atalho para a página real (Agenda, Inventário, Fornecedores, Pessoas de RH de exemplo, Operações)
// quando o utilizador tem a permissão dessa página; nada daqui escreve nessas páginas.
import { Link } from "react-router-dom";
import {
  ArrowUpRight, Bell, CalendarDays, ClipboardList, FileText, HardHat, Package, PiggyBank, ShieldCheck, Sparkles, Store, Users, Workflow, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePermissionGate } from "@/components/frota-exemplo/inventarioUi";
import { useFrotaCtx } from "../contexto";
import { Cabecalho, Cartao, Seccao, Selo, Tabela } from "../pecas";
import { custoKmMedio, fEur, type Tom } from "../dados";
import { OBRAS_OPERACOES, PERMISSAO_AGENDA, PERMISSAO_OPERACOES } from "../dados/exemplo";

/** Um atalho para uma página real: rota do SPA, ou uma página servida por outra aplicação (carregamento a sério). */
interface Atalho { rotulo: string; para: string; permissao?: string; externo?: boolean }

const LIGACOES: readonly (readonly [string, LucideIcon, string, string, Tom, string, string, Atalho | null])[] = [
  ["Pessoas (RH)", Users, "Condutores, carta de condução, categorias e validade.", "pessoas_identificacao.carta_conducao_*", "warn", "Ramo RH, ainda não na main",
    "Os condutores do exemplo são os técnicos das obras (João Silva, Rui Alves, Marco Antunes, Sérgio Faria, Hugo Neves, Paulo Mota), o Rúben e a Sofia.",
    { rotulo: "Abrir Pessoas (RH de exemplo)", para: "/rh-exemplo/pessoas", permissao: "users.view" }],
  ["Agenda", CalendarDays, "A viatura é um recurso agendável, com deteção de conflitos.", "schedule_resources (resource_type='vehicle') · schedule_item_assignees", "ok", "Já existe",
    "Quando houver tabelas, as viaturas ativas passam a recursos Veículo da Agenda; as reservas e manutenções bloqueiam-nas.",
    { rotulo: "Abrir a Agenda", para: "/scheduling", permissao: PERMISSAO_AGENDA }],
  ["Operações · ordens de trabalho", ClipboardList, "Que viatura foi a cada ordem, km e deslocação como custo.", "ops_ordem + ligação ordem↔viatura · ops_custo", "info", "Ligação nova",
    "No exemplo, as ordens são as tarefas do plano das obras #1022 e #1050 (Demolição, Canalização…), com o técnico e a viatura dele.",
    { rotulo: "Abrir Operações", para: "/operacao", permissao: PERMISSAO_OPERACOES, externo: true }],
  ["Obras", HardHat, "Viatura afeta à obra. O custo por km real substitui os 0,40 € fixos.", "ops_obra · sugestaoFichaLocal.ts", "info", "Ligação nova",
    "As obras da Frota abrem nas Operações. As do exemplo (#1022, #1050) não existem lá, por isso abrem a lista de obras. ",
    { rotulo: "Abrir as obras nas Operações", para: OBRAS_OPERACOES, permissao: PERMISSAO_OPERACOES, externo: true }],
  ["Inventário", Package, "Stock na carrinha: cada viatura é um armazém móvel, reposto por transferência.", "warehouses (tipo viatura) · rpc_register_stock_transfer", "info", "Falta marcar o armazém como viatura",
    "No exemplo, o stock das carrinhas é inventado; a reposição será um pedido de transferência real do armazém central para a carrinha.",
    { rotulo: "Abrir Armazéns", para: "/warehouses", permissao: "warehouses.view" }],
  ["Fornecedores e compras", Store, "Oficinas, seguradoras, gasolineiras e locadoras. Peças por encomenda de compra.", "suppliers · purchase_orders", "ok", "Já existe", "",
    { rotulo: "Abrir Fornecedores", para: "/suppliers", permissao: "suppliers.view" }],
  ["Custos e centros de custo", PiggyBank, "Imputar cada despesa a um centro de custo ou obra; categoria “Viaturas” nos custos de estrutura.", "ops_centro_custo · custos V2", "ok", "Já existe", "", null],
  ["Documentos", FileText, "DUA, apólices, certificados de inspeção, fotos de danos.", "documents (entity_type='vehicle')", "ok", "Já existe", "", null],
  ["Notificações e alertas", Bell, "Avisos de vencimentos, revisões, multas e cartas a caducar.", "alert_settings · notifications · job diário novo", "info", "Job novo", "", null],
  ["Fluxos automáticos", Workflow, "Ex.: IPO a 30 dias cria tarefa para a gestora de frota.", "workflow_automation_rules", "ok", "Já existe", "", null],
  ["Olyvia AI", Sparkles, "“Que carrinha está livre amanhã?”, “Quanto gastou a 12-TT-90 este ano?”", "ai-assistant/tools/fleet.ts", "info", "Tool nova", "", null],
  ["Organizações e permissões", ShieldCheck, "Frota por organização; hoje a Frota de exemplo usa inventory.view (ver) e inventory.edit (registar); depois fleet.view, fleet.manage, fleet.costs.", "anew_permissions · anew_role_permissions", "info", "Permissões novas", "", null],
];
const TABELAS: readonly (readonly [string, string])[] = [
  ["fleet_vehicles", "Ficha da viatura, estado, km atuais, posse, ligação ao armazém e ao recurso de agenda"], ["fleet_assignments", "Quem tem a viatura, de quando a quando, km e fotos na entrega e na devolução"],
  ["fleet_odometer_readings", "Leituras de km com origem; recusa valores abaixo da última leitura"], ["fleet_maintenance_plans", "Regras de revisão por km ou meses"],
  ["fleet_maintenance_events", "Revisões, inspeções e reparações feitas ou agendadas"], ["fleet_expenses", "Combustível, energia, portagens, oficina, rendas, com centro de custo"],
  ["fleet_incidents", "Multas, sinistros e avarias; substitui a tabela órfã incidents"], ["fleet_documents_due", "Vencimentos de seguro, IPO, IUC e contratos"],
];

function BotaoAtalho({ a }: { a: Atalho }) {
  const gate = usePermissionGate();
  if (a.permissao && !gate(a.permissao).allowed) return null;
  const corpo = <>{a.rotulo}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></>;
  return (
    <Button asChild size="sm" variant="outline" className="gap-1.5 self-start">
      {a.externo ? <a href={a.para}>{corpo}</a> : <Link to={a.para}>{corpo}</Link>}
    </Button>
  );
}

export function LigacoesFrota() {
  const { F } = useFrotaCtx();
  const km = custoKmMedio(F);
  return (
    <div className="space-y-6">
      <Cabecalho titulo="Ligações" texto="Com que módulos a Frota fala e o que já existe na base de dados. Os atalhos abrem as páginas reais; os dados da Frota continuam a ser de exemplo." />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {LIGACOES.map(([t, I, d, c, tom, est, ex, a]) => (
          <Cartao key={t} className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <h3 className="flex items-center gap-2 font-semibold"><I className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{t}</h3>
              <Selo tom={tom}>{est}</Selo>
            </div>
            <p className="text-sm text-muted-foreground">{d}</p>
            <code className="break-words rounded bg-muted px-2 py-1 text-xs">{c}</code>
            {ex ? <p className="text-[13px]">{ex}{t === "Obras" && km != null ? `Custo por km real da frota de exemplo: ${fEur(km)}.` : ""}</p> : null}
            {a ? <BotaoAtalho a={a} /> : null}
          </Cartao>
        ))}
      </div>
      <Seccao titulo="Tabelas novas da Frota">
        <Tabela>
          <Table>
            <TableHeader><TableRow><TableHead>Tabela</TableHead><TableHead>Para quê</TableHead></TableRow></TableHeader>
            <TableBody>{TABELAS.map(([t, d]) => <TableRow key={t}><TableCell className="font-mono text-xs">{t}</TableCell><TableCell>{d}</TableCell></TableRow>)}</TableBody>
          </Table>
        </Tabela>
        <p className="text-sm text-muted-foreground">Todas com <span className="font-mono">organization_id</span> e RLS por organização. A migração vem depois, com aprovação; até lá, nada da Frota escreve na base de dados.</p>
      </Seccao>
    </div>
  );
}

// As Ligações (pgLigacoes do protótipo HTML): com que módulos a Frota fala e o que já existe na base de dados (fontes a laranja = tabelas novas,
// violeta = já existem). Cada cartão diz também o que já está ligado neste protótipo, com o atalho para lá.
import { Bell, Calendar, CalendarDays, ClipboardList, Database, FileText, HardHat, Package, PiggyBank, ShieldCheck, Sparkles, Store, Users, Workflow, type LucideIcon } from "lucide-react";
import { Selo } from "../inventario/pecasInv";
import { fEur } from "./base";
import { useCtxFrota } from "./ctxFrota";
import { Btn, Cab } from "./pecasFrota";
import { custoKmMedio } from "./regras";
import type { Tom } from "./tipos";

type Atalho = "agenda" | "obra" | "inventario" | null;
const LIGACOES: readonly (readonly [string, LucideIcon, string, string, Tom, string, string, Atalho])[] = [
  ["Pessoas (RH)", Users, "Condutores, carta de condução, categorias e validade.", "pessoas_identificacao.carta_conducao_*", "warn", "Ramo RH, ainda não na main",
    "No protótipo: os condutores são os técnicos das obras (João Silva, Rui Alves, Marco Antunes, Sérgio Faria, Hugo Neves, Paulo Mota) e o Rúben.", null],
  ["Agenda", CalendarDays, "A viatura é um recurso agendável, com deteção de conflitos.", "schedule_resources (resource_type='vehicle') · schedule_item_assignees", "ok", "Já existe",
    "No protótipo: as viaturas ativas são os recursos Veículo da Agenda (a AA-12-BC é a Carrinha Renault Master); reservas e manutenções bloqueiam-nas.", "agenda"],
  ["Operações · ordens de trabalho", ClipboardList, "Que viatura foi a cada ordem, km e deslocação como custo.", "ops_ordem + ligação ordem↔viatura · ops_custo", "info", "Ligação nova",
    "No protótipo: as ordens são as tarefas do plano das obras (Demolição, Canalização…), com o técnico e a viatura dele.", "obra"],
  ["Obras", HardHat, "Viatura afeta à obra. O custo por km real substitui os 0,40 € fixos.", "ops_obra · sugestaoFichaLocal.ts", "info", "Ligação nova",
    "No protótipo: as obras #1022 e #1050; a página da obra mostra as viaturas que lá foram.", "obra"],
  ["Inventário", Package, "Stock na carrinha: cada viatura é um armazém móvel, reposto por transferência.", "warehouses (tipo viatura) · rpc_register_stock_transfer", "info", "Falta marcar o armazém como viatura",
    "No protótipo: cada carrinha é um armazém do tipo viatura no Inventário; “Pedir reposição” cria pedidos de transferência.", "inventario"],
  ["Fornecedores e compras", Store, "Oficinas, seguradoras, gasolineiras e locadoras. Peças por encomenda de compra.", "suppliers · purchase_orders", "ok", "Já existe", "", null],
  ["Custos e centros de custo", PiggyBank, "Imputar cada despesa a um centro de custo ou obra; categoria “Viaturas” nos custos de estrutura.", "ops_centro_custo · custos V2", "ok", "Já existe", "", null],
  ["Documentos", FileText, "DUA, apólices, certificados de inspeção, fotos de danos.", "documents (entity_type='vehicle')", "ok", "Já existe", "", null],
  ["Notificações e alertas", Bell, "Avisos de vencimentos, revisões, multas e cartas a caducar.", "alert_settings · notifications · job diário novo", "info", "Job novo", "", null],
  ["Fluxos automáticos", Workflow, "Ex.: IPO a 30 dias cria tarefa para a gestora de frota.", "workflow_automation_rules", "ok", "Já existe", "", null],
  ["Olyvia AI", Sparkles, "“Que carrinha está livre amanhã?”, “Quanto gastou a 12-TT-90 este ano?”", "ai-assistant/tools/fleet.ts", "info", "Tool nova", "", null],
  ["Organizações e permissões", ShieldCheck, "Frota por organização; permissões fleet.view, fleet.manage, fleet.costs.", "anew_permissions · anew_role_permissions", "info", "Permissões novas", "", null],
];
const TABELAS: readonly (readonly [string, string])[] = [
  ["fleet_vehicles", "Ficha da viatura, estado, km atuais, posse, ligação ao armazém e ao recurso de agenda"], ["fleet_assignments", "Quem tem a viatura, de quando a quando, km e fotos na entrega e na devolução"],
  ["fleet_odometer_readings", "Leituras de km com origem; recusa valores abaixo da última leitura"], ["fleet_maintenance_plans", "Regras de revisão por km ou meses"],
  ["fleet_maintenance_events", "Revisões, inspeções e reparações feitas ou agendadas"], ["fleet_expenses", "Combustível, energia, portagens, oficina, rendas, com centro de custo"],
  ["fleet_incidents", "Multas, sinistros e avarias; substitui a tabela órfã incidents"], ["fleet_documents_due", "Vencimentos de seguro, IPO, IUC e contratos"],
];

export function LigacoesFrota() {
  const { F, fontes, mudarFontes, irAgenda, irObra, irInventario, obras } = useCtxFrota();
  const obra = obras.find((o) => o.estado !== "concluída") ?? obras[0];
  const atalho = (a: Atalho) => {
    if (a === "agenda" && irAgenda) return <Btn pequeno icone={Calendar} aoClicar={irAgenda}>Ver na Agenda</Btn>;
    if (a === "obra" && irObra && obra) return <Btn pequeno icone={HardHat} aoClicar={() => irObra(obra.id)}>Abrir a obra #{obra.id}</Btn>;
    if (a === "inventario" && irInventario) return <Btn pequeno icone={Package} aoClicar={irInventario}>Ver as carrinhas no Inventário</Btn>;
    return null;
  };
  const km = custoKmMedio(F);
  return (
    <>
      <Cab titulo="Ligações" texto="Com que módulos a Frota fala e o que já existe na base de dados. As fontes a laranja são tabelas novas; as violeta já existem."
        acoes={<Btn icone={Database} aoClicar={() => mudarFontes(!fontes)}>{fontes ? "Esconder fontes nos ecrãs" : "Mostrar fontes nos ecrãs"}</Btn>} />
      <div className="lig">
        {LIGACOES.map(([t, I, d, c, tom, est, proto, a]) => (
          <div key={t} className="card ligc">
            <div className="row between"><h3><I className="ic" aria-hidden="true" />{t}</h3><Selo tom={tom}>{est}</Selo></div>
            <p className="muted">{d}</p>
            <code>{c}</code>
            {proto ? <p style={{ fontSize: 13 }}>{proto}{t === "Obras" && km != null ? ` Custo por km real da frota: ${fEur(km)}.` : ""}</p> : null}
            {atalho(a)}
          </div>
        ))}
      </div>
      <section className="sec" aria-labelledby="fr-tabelas">
        <h2 id="fr-tabelas">Tabelas novas da Frota</h2>
        <div className="tw">
          <table className="min-560">
            <thead><tr><th>Tabela</th><th>Para quê</th></tr></thead>
            <tbody>{TABELAS.map(([t, d]) => <tr key={t}><td className="mono">{t}</td><td>{d}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="muted" style={{ marginTop: 10 }}>Todas com <span className="mono">organization_id</span> e RLS por organização. As tabelas antigas <span className="mono">routes</span> e <span className="mono">incidents</span> usam o âmbito antigo (company_id) e ficam por apagar.</p>
      </section>
    </>
  );
}

// As permissões que o editor de papéis (/utilizadores-perfis > Roles) mostra. Regra (decisão do utilizador, 02/11/2026): só se mostram
// as permissões realmente usadas daqui para a frente; as antigas ficam ESCONDIDAS, não se apagam da base, e os papéis que já as têm
// mantêm-nas (o FormRole junta ao gravar as que a role tinha e o editor não mostra — ver `fundirPermissoes` em matriz.ts).
//
// "Em uso" quer dizer: o código é verificado no frontend (hasPermission, hasAnyPermission, PermissionGate, ProtectedRoute, menuConfig,
// getPermissionScope, wrappers do RH/Frota/Negócios...) OU no servidor (has_anew_permission*, fn_cat_*, fn_neg_*, ops_pode,
// fn_fleet_assert, policies, checkUserPermission nas edge functions) OU está em neg_papeis_permissoes, mais as permissões novas de
// Negócios (negocios.*), pessoas.* e platform.support_access.view / platform.auth_audit_log.view.
// A primeira versão foi gerada por script contra anew_permissions da base do ramo (uetjghdkwbywbftedtth); daqui para a frente edita-se
// à mão. A chave é a categoria em anew_permissions.category. permissoesEmUso.test.ts falha se o código passar a verificar uma
// permissão que não esteja aqui, ou se uma daqui não couber em nenhum grupo do editor.
// Contagem na geração: 353 em uso, 109 escondidas, 462 no total de anew_permissions.
//
// 03/11/2026 (aprovado): as rotas /leads, /clients e /contacts só redirecionam para /pessoas (RedirectPreservandoPesquisa em App.tsx)
// e AnewLeads.tsx / AnewClients.tsx / LeadTableRow.tsx já não são importados por nada vivo. Esconderam-se as permissões que só essas
// páginas verificavam e nenhuma função/policy viva usa: leads.export, leads.export_sensitive, leads.contact, clients.export,
// clients.export_sensitive (a exportação de leads/clients da edge function export-data só era pedida por essas páginas; as páginas
// vivas exportam client_contracts/proposals/quotes). Ficaram as que o servidor ainda verifica — ver os comentários de cada categoria.
//
// 03/11/2026 (aprovado): o grupo Aquisição saiu do menu (o Negócios em /pessoas e /negocios substitui-o); /quotes, /proposals e
// /client-contracts continuam com rota (a ficha do /pessoas ainda as abre) e /direct-sales redireciona para /negocios. Esconderam-se
// as permissões que só essas páginas (FORA_DO_MENU em permissoesEmUso.test.ts) verificam: proposals.export, quotes.delete,
// quotes.export, quotes.export_sensitive, client_contracts.export (export-data só as pede para os pedidos dessas páginas) e
// direct_sales.create/edit/confirm/register_invoice/view_costs (as RPCs da venda direta só correm a partir de DirectSales.tsx).
// direct_sales.view fica (as RPCs das Encomendas de Cliente verificam-na). contacts.delete também se escondeu: só a verificam as
// policies de anew_contacts (tabela antiga) e as de anew_entity_*, que aceitam também pessoas.delete.
//
// 04/11/2026 (aprovado), sem ação na app viva: channels.view (o menu de Origens pede lead_sources.view), products.manage e brands.edit
// (as páginas de packs/marcas/atributos/unidades redirecionam para /catalogo-custos e nenhum ecrã vivo chama as RPCs/escritas que
// as exigem; desfaz só a visibilidade do Lote C), client_contracts.manage (só a policy client_templates_manage, que aceita também
// client_contracts.manage_templates; nenhum papel tinha uma sem a outra) e hr.denuncias.gerir (as RPCs da página não existem na
// base). Só saem do editor: os códigos ficam na base, os papéis que as têm mantêm-nas e as guardas não mudam — ver
// ESCONDIDAS_COM_GUARDA. operations.orders.view/view_all e operations.costs.view FICAM: o Frota (Ligações / ligar viatura a uma
// ordem) lê ops_ordem pela policy ops_ordem_select (orders.view + ops_pode_ver_ordem, onde entra view_all) e rpc_fleet_link_order
// só lança o custo da deslocação na ordem com operations.costs.view.
//
// 04/11/2026 (aprovado): a linha Contactos (contacts.view/create/edit/import) saiu do editor — ver PERMISSOES_ESCONDIDAS.contacts.
// A linha Clientes FICA: o campo Cliente da «Nova encomenda manual» em /client-orders (EntitySearchInput) filtra os clientes pelo
// âmbito de clients.view (getPermissionScope), e as policies/RPCs dos clientes continuam a verificá-las.
//
// 05/11/2026 (aprovado), sem ação na app viva: direct_sales.view, operations.orders.view, operations.orders.view_all,
// operations.costs.view, lists.view, clients.import e leads.import saem do editor. Só se esconde: os códigos ficam na base, os papéis
// que as têm mantêm-nas ao gravar (fundirPermissoes) e nenhuma guarda/policy/RPC muda — ver os comentários em PERMISSOES_ESCONDIDAS.
// Desfaz a decisão de 04/11 que mantinha as três de Operações por causa do Frota (Ligações).

export const PERMISSOES_EM_USO: Readonly<Record<string, readonly string[]>> = {
  api_keys: [
    "api_keys.copy", "api_keys.create", "api_keys.delete", "api_keys.toggle", "api_keys.view",
  ],
  client_contracts: [
    "client_contracts.cancel", "client_contracts.create", "client_contracts.delete", "client_contracts.edit",
    "client_contracts.manage_templates",
    "client_contracts.send_signature", "client_contracts.view",
  ],
  client_orders: [
    "client_orders.confirm_stock_exit", "client_orders.create", "client_orders.delete", "client_orders.edit",
    "client_orders.view",
  ],
  // Só verificadas no servidor (policies/RPCs/edge functions): clients.create (rpc_confirm_direct_sale, policies anew_clients/anew_entities),
  // clients.delete (policies anew_clients e anew_entity_*), clients.import (policies de INSERT/UPDATE de anew_entity_roles,
  // 20270102130000). clients.edit também em ClientDetailsDialog, que só AnewClients importa. clients.view tem ação na app viva: o âmbito
  // dela filtra os clientes do campo Cliente (EntitySearchInput) na «Nova encomenda manual» de /client-orders (e em /deals).
  // 05/11: clients.import passou para as escondidas (sem ação na app viva).
  clients: [
    "clients.create", "clients.delete", "clients.edit", "clients.view",
  ],
  dashboard: [
    "dashboard.view",
  ],
  deals: [
    "deals.create", "deals.delete", "deals.edit", "deals.view",
  ],
  // 05/11: direct_sales.view passou para as escondidas (sem ação na app viva); a categoria deixou de ter permissões no editor.
  email_templates: [
    "email_templates.create", "email_templates.delete", "email_templates.duplicate", "email_templates.edit",
    "email_templates.view",
  ],
  fleet: [
    "fleet.costs", "fleet.manage", "fleet.self", "fleet.view",
  ],
  flow_builder: [
    "flow_builder.create", "flow_builder.delete", "flow_builder.edit", "flow_builder.view",
  ],
  forms: [
    "forms.create", "forms.delete", "forms.edit", "forms.view",
  ],
  // Só verificadas no servidor (policies/RPCs): hr.ausencias.tipos.view. 04/11: hr.denuncias.gerir passou para as escondidas (sem ação
  // na app viva). Esconderam-se hr.ausencias.tipos.edit, hr.ausencias.direitos.edit, hr.pessoas.horario_realizado.edit,
  // hr.pessoas.duplicados.view e hr.pessoas.acessos_sensiveis.view: só policies/RPCs que nenhum ecrã vivo chama.
  // 05/11: hr.onboarding.restrito não precisa de guarda no ecrã: sem ela o servidor (rpc_hr_admissao_listar, convite_admissao_resumo,
  // rever_ler) mostra os processos cancelados ou rejeitados como «terminado», e o cartão explica-o (CartaoAdmissao.tsx, rhAdm.cartao.restrito).
  hr: [
    "hr.admissao.obrigatorios.gerir", "hr.assiduidade.corrigir", "hr.assiduidade.equipa.view", "hr.assiduidade.faltas.edit",
    "hr.assiduidade.faltas.view", "hr.assiduidade.gerir", "hr.assiduidade.justificacao.edit", "hr.assiduidade.justificacao.view",
    "hr.assiduidade.obras.registar", "hr.assiduidade.picar", "hr.assiduidade.picar.outros", "hr.assiduidade.view",
    "hr.assiduidade.view.own", "hr.ausencias.ajustar", "hr.ausencias.aprovar.chefia", "hr.ausencias.aprovar.rh",
    "hr.ausencias.direitos.view", "hr.ausencias.historico.editar", "hr.ausencias.justificacao.view", "hr.ausencias.pedir",
    "hr.ausencias.pedir.outros", "hr.ausencias.tipos.view", "hr.ausencias.view", "hr.ausencias.view.own",
    "hr.cargos.salario.alterar", "hr.contratos.regras.gerir", "hr.locais.edit", "hr.locais.view",
    "hr.onboarding.approve", "hr.onboarding.restrito", "hr.onboarding.sensitive", "hr.pessoas.afectacoes.corrigir",
    "hr.pessoas.afectacoes.edit", "hr.pessoas.afectacoes.view", "hr.pessoas.bancarios.edit", "hr.pessoas.bancarios.view",
    "hr.pessoas.colocacao.corrigir", "hr.pessoas.colocacao.edit", "hr.pessoas.colocacao.view", "hr.pessoas.conta.criar",
    "hr.pessoas.conta.link", "hr.pessoas.convite.enviar", "hr.pessoas.create", "hr.pessoas.documentos.anular",
    "hr.pessoas.documentos.conteudo.view", "hr.pessoas.documentos.edit", "hr.pessoas.documentos.emitir",
    "hr.pessoas.documentos.modelos.edit", "hr.pessoas.documentos.modelos.view", "hr.pessoas.documentos.view",
    "hr.pessoas.documentos.view.own", "hr.pessoas.edit", "hr.pessoas.emergencia.edit", "hr.pessoas.emergencia.view",
    "hr.pessoas.horario.corrigir", "hr.pessoas.horario.edit", "hr.pessoas.horario.view", "hr.pessoas.horario_realizado.validar",
    "hr.pessoas.horario_realizado.view", "hr.pessoas.identificacao.edit", "hr.pessoas.identificacao.reveal",
    "hr.pessoas.identificacao.view", "hr.pessoas.laborais.edit", "hr.pessoas.laborais.view", "hr.pessoas.morada.edit",
    "hr.pessoas.morada.view", "hr.pessoas.pessoais.edit", "hr.pessoas.pessoais.view", "hr.pessoas.retribuicao.corrigir",
    "hr.pessoas.retribuicao.edit", "hr.pessoas.retribuicao.view", "hr.pessoas.saude.edit", "hr.pessoas.saude.view",
    "hr.pessoas.sindicalizacao.edit", "hr.pessoas.sindicalizacao.view", "hr.pessoas.view", "hr.pessoas.view.own",
    "hr.pessoas.vinculos.edit", "hr.pessoas.vinculos.horas.corrigir", "hr.pessoas.vinculos.view",
    "hr.processamento.lancamentos.gerir", "hr.processamento.periodo.gerir", "hr.processamento.periodo.view",
    "hr.vencimento.codigos.gerir", "hr.vencimento.codigos.view", "hr.vencimento.subsidio.gerir", "hr.vencimento.subsidio.view",
  ],
  // 03/11: os stocks.* (sem catálogo) passaram a inventory.* em Stocks/Movimentos/Hoje — inventory.create/delete/export/import passam a
  // ter uso no ecrã; inventory.adjust escondeu-se (nada vivo a verifica).
  inventory: [
    "inventory.count", "inventory.create", "inventory.delete", "inventory.edit", "inventory.export", "inventory.import", "inventory.view",
  ],
  // 05/11: leads.assign (neg_atribuir_pessoa, quando a pessoa ainda não é cliente; gatilho trg_00_negocios_comercial_leads_assign em
  // negocios.assigned_to) já se pergunta no ecrã, por usePodeAtribuirComercial: o seletor do comercial em «Editar negócio»
  // (EditarNegocioDialogo), no passo Chamada de /negocios (ComercialDaLead, só se a pessoa não é cliente) e na «Nova lead» (ComercialNovaLead).
  // Só verificadas no servidor (policies/RPCs/edge functions): leads.config (policies das tabelas de
  // configuração de leads, incluindo lead_contact_results que a rota viva /lead-contact-results grava), leads.delete (policies anew_leads
  // e anew_entity_*), leads.edit (policies, ai-assistant, execute-workflow). 05/11: leads.import passou para as escondidas.
  // platform.pending_submissions.view está na categoria leads da base mas aparece em Marketing › Formulários (gruposPermissoes.ts).
  leads: [
    "leads.assign", "leads.config", "leads.convert", "leads.create", "leads.delete", "leads.edit", "leads.view",
    "platform.pending_submissions.view",
  ],
  // 03/11: trash.view guarda /trash (rota, menu e atalho); lead_sources.view guarda /lead-sources. 05/11: lists.view passou para as
  // escondidas (a linha Listas desaparece do editor).
  marketing: [
    "campaigns.create", "campaigns.delete", "campaigns.edit", "campaigns.view", "lead_sources.create",
    "lead_sources.delete", "lead_sources.edit", "lead_sources.view",
  ],
  // 05/11: operations.orders.view/view_all e operations.costs.view passaram para as escondidas; fica operations.view.
  operations: [
    "operations.view",
  ],
  organizations: [
    "organizations.create", "organizations.delete", "organizations.edit", "organizations.view",
  ],
  // 03/11/2026 (20270105200000): as seis por fase, exigidas no servidor (neg_guardar_negocio, obra_guardar_negocio, neg_perder_negocio,
  // neg_anular_perda, neg_guardar_visita, …): negocios.contacto.registar, negocios.visita.gerir, negocios.proposta.decidir,
  // negocios.obra.imprevistos, negocios.obra.fechar, negocios.perder.
  pessoas: [
    "negocios.contacto.registar", "negocios.contrato.editar", "negocios.margem.aprovar", "negocios.obra.executar",
    "negocios.obra.fechar", "negocios.obra.imprevistos", "negocios.obra.materiais", "negocios.obra.planear",
    "negocios.orcamento.editar", "negocios.perder", "negocios.proposta.decidir", "negocios.proposta.enviar",
    "negocios.registar_fatura", "negocios.validar_pagamento", "negocios.visita.gerir", "pessoas.config", "pessoas.create",
    "pessoas.delete", "pessoas.edit", "pessoas.reopen", "pessoas.view",
  ],
  // Só verificadas no servidor (policies/RPCs): platform.settings.manage
  platform: [
    "platform.auth_audit_log.view", "platform.support_access.view", "rgpd.erasure.manage",
  ],
  // 04/11/2026: portal.manage («Gerir acessos ao portal de clientes») verifica-se no servidor (create-client-portal-access,
  // republish_proposal_snapshot) e no ecrã (usePodeEnviarPropostaPortal: enviar/republicar a proposta e reenviar as credenciais).
  portal: [
    "portal.manage",
  ],
  // 04/11/2026: products.manage e brands.edit voltaram a sair do editor (sem ação na app viva) — ver PERMISSOES_ESCONDIDAS.products.
  products: [
    "brands.view", "product_attributes.view", "product_categories.view", "products.create", "products.edit",
    "products.manage_prices", "products.view", "products.view_cost",
  ],
  proposals: [
    "proposals.create", "proposals.delete", "proposals.delete_sent", "proposals.edit", "proposals.manage", "proposals.view",
  ],
  purchase_orders: [
    "purchase_orders.approve", "purchase_orders.create", "purchase_orders.delete", "purchase_orders.edit",
    "purchase_orders.export", "purchase_orders.import", "purchase_orders.receive", "purchase_orders.revert_receipt",
    "purchase_orders.view",
  ],
  quote_templates: [
    "quote_templates.create", "quote_templates.delete", "quote_templates.duplicate", "quote_templates.edit",
    "quote_templates.view",
  ],
  // 05/11: quotes.view_costs também no Negócio: fn_neg_ler_orcamento, neg_ler_negocios e fn_neg_ler_adendas devolvem os custos a null
  // sem fn_cat_pode(org, 'quotes.view_costs'), e o ecrã pergunta o mesmo (podeVerCustos em emylia/permissoes.ts: na ficha pela leitura de
  // permissoesPosContrato.ts, em /negocios por usePodeVerCustos) para esconder a margem e o custo (OrcamentoSimples, LinhasOrcamento,
  // PlanoObraOrcamento, DemolicaoOrcamento e os valores no texto dos bloqueios do motor).
  quotes: [
    "quotes.create", "quotes.edit", "quotes.manage", "quotes.view", "quotes.view_costs",
  ],
  receiving: [
    "receiving.download_proof", "receiving.learn_codes", "receiving.manage_delivery_notes", "receiving.receive",
    "receiving.view",
  ],
  roles: [
    "roles.create", "roles.delete", "roles.edit", "roles.view",
  ],
  // Só verificadas no servidor (policies/RPCs): scheduling.rules.view
  scheduling: [
    "scheduling.boards.create", "scheduling.boards.delete", "scheduling.boards.edit", "scheduling.boards.view",
    "scheduling.items.create", "scheduling.items.delete", "scheduling.items.edit", "scheduling.items.view",
    "scheduling.resources.create", "scheduling.resources.delete", "scheduling.resources.edit", "scheduling.resources.view",
    "scheduling.rules.create", "scheduling.rules.delete", "scheduling.rules.edit", "scheduling.rules.view",
    "scheduling.settings",
  ],
  security: [
    "exports.audit.view",
  ],
  // Só verificadas no servidor (policies/RPCs): service_fees.delete, service_fees.edit
  services: [
    "service_fees.view", "services.edit", "services.manage_prices", "services.view", "services.view_cost",
  ],
  settings: [
    "settings.update",
  ],
  smtp: [
    "smtp.edit", "smtp.view",
  ],
  // suppliers.contract_manage (contrato de fornecedor, 20270103300000): o servidor decide e o ecrã usa o que ele calcula, as flags
  // can_manage, can_countersign, can_accept_proposal e can_refuse_proposal de rpc_supplier_contracts_list/get (SupplierContractTab,
  // SupplierContractDetail); não é «só servidor».
  suppliers: [
    "suppliers.contract_manage", "suppliers.create", "suppliers.delete", "suppliers.edit", "suppliers.export",
    "suppliers.import", "suppliers.portal_manage", "suppliers.view", "suppliers.view_pricing", "suppliers.view_sla_report",
  ],
  // 03/11: trash.view guarda /trash (rota, menu e atalho); lead_sources.view guarda /lead-sources.
  trash: [
    "trash.view",
  ],
  users: [
    "users.create", "users.delete", "users.edit", "users.manage_roles", "users.view",
  ],
  warehouses: [
    "warehouses.create", "warehouses.delete", "warehouses.edit", "warehouses.export", "warehouses.import", "warehouses.view",
  ],
};

/** As que existem em anew_permissions mas nada verifica: não aparecem no editor (ficam na base e nos papéis que já as têm). */
export const PERMISSOES_ESCONDIDAS: Readonly<Record<string, readonly string[]>> = {
  activities: [
    "activities.create", "activities.delete", "activities.edit", "activities.view",
  ],
  api_keys: [
    "api_keys.edit",
  ],
  assets: [
    "assets.create", "assets.delete", "assets.edit", "assets.export", "assets.import", "assets.view",
  ],
  business_units: [
    "business_units.create", "business_units.delete", "business_units.edit", "business_units.export", "business_units.import",
    "business_units.view",
  ],
  // 04/11/2026 (reconfirmado na base do ramo e em src/): nenhuma função, policy, edge function nem ecrã vivo verifica calendar.*,
  // work_orders.*, scheduling.export, hr.pessoas.archive, hr.onboarding.sign_employer, hr.ausencias.tipos.edit e hr.assiduidade.importar
  // (só a página de documentação /docs/permissions as lista).
  calendar: [
    "calendar.create", "calendar.edit", "calendar.view_company",
  ],
  // 03/11: só as páginas antigas do catálogo (rotas redirecionam para /catalogo-custos) as verificavam.
  catalog_items: [
    "catalog_items.delete", "catalog_items.export", "catalog_items.import", "catalog_items.view",
  ],
  // Só AnewClients.tsx (rota /clients redireciona) as verificava; export-data só as pede para o módulo clients, que nada vivo exporta.
  // clients.import: sem ação na app viva, 05/11 (só as policies de anew_entity_roles, 20270102130000; nenhum ecrã vivo importa clientes).
  clients: [
    "clients.export", "clients.export_sensitive", "clients.import",
  ],
  call_center: [
    "call_center.handle_calls", "call_center.manage", "call_center.view",
  ],
  // Só ClientContracts.tsx (FORA_DO_MENU) e o pedido dela a export-data. client_contracts.manage: sem ação na app viva, 04/11 (só a
  // policy client_templates_manage, que aceita também client_contracts.manage_templates — essa fica no editor).
  client_contracts: [
    "client_contracts.export", "client_contracts.manage",
  ],
  companies: [
    "companies.create", "companies.delete", "companies.edit", "companies.upload_logo", "companies.view",
  ],
  company_groups: [
    "company_groups.create", "company_groups.delete", "company_groups.edit", "company_groups.view",
  ],
  // contacts.delete: só policies de anew_contacts (antiga) e de anew_entity_* (que aceitam também pessoas.delete).
  // 04/11/2026 (aprovado): a linha Contactos sai toda do editor — não há ecrã de Contactos na app viva (as pessoas vivem em Pessoas).
  // O assistente (ai-assistant) passou a pedir pessoas.view/create/edit em vez de contacts.view/create/edit, e as funções/policies dos
  // contactos aceitam o pessoas.* equivalente além do antigo (20270106710000). contacts.import só nas policies de anew_entity_roles,
  // que já aceitam pessoas.create/edit. Os códigos ficam na base e os papéis que os têm mantêm-nos.
  contacts: [
    "contacts.create", "contacts.delete", "contacts.edit", "contacts.export", "contacts.export_sensitive", "contacts.import",
    "contacts.view", "contacts.view_details",
  ],
  departments: [
    "departments.create", "departments.delete", "departments.edit", "departments.view",
  ],
  // Só DirectSales.tsx / DirectSaleEditor.tsx (FORA_DO_MENU; /direct-sales redireciona para /negocios) e as RPCs que só elas chamam.
  // direct_sales.view: sem ação na app viva, 05/11 (DirectSales.tsx é FORA_DO_MENU; as RPCs das Encomendas de Cliente continuam a
  // verificá-la para mostrar o número da venda direta de origem — a verificação não muda, só sai do editor).
  direct_sales: [
    "direct_sales.confirm", "direct_sales.create", "direct_sales.delete", "direct_sales.edit", "direct_sales.register_invoice",
    "direct_sales.view", "direct_sales.view_costs",
  ],
  drivers: [
    "drivers.create", "drivers.delete", "drivers.edit", "drivers.export", "drivers.import", "drivers.view",
  ],
  employees: [
    "employees.create", "employees.delete", "employees.edit", "employees.export", "employees.import", "employees.view",
  ],
  // 03/11: as cinco de cima (sem ecrã vivo que as use). hr.denuncias.gerir: sem ação na app viva, 04/11 (a rota e o menu de
  // /rh-exemplo/denuncias continuam a pedi-la, mas as RPCs da página não existem na base; ver ESCONDIDAS_COM_GUARDA).
  hr: [
    "hr.ausencias.direitos.edit", "hr.denuncias.gerir", "hr.ausencias.tipos.edit", "hr.pessoas.acessos_sensiveis.view", "hr.pessoas.duplicados.view",
    "hr.pessoas.horario_realizado.edit",
    "hr.assiduidade.importar", "hr.module.access", "hr.onboarding.sign_employer", "hr.pessoas.archive", "vacations.create",
    "vacations.manage", "vacations.view",
  ],
  // 03/11: inventory.adjust (nada vivo a verifica).
  inventory: [
    "inventory.adjust", "inventory.transfer",
  ],
  // leads.contact: só LeadTableRow.tsx; leads.export(_sensitive): só AnewLeads.tsx (rota /leads redireciona) e o módulo leads de export-data.
  // leads.import: sem ação na app viva, 05/11 (só AnewLeads.tsx e as policies de anew_entity_roles, 20270102130000).
  leads: [
    "leads.contact", "leads.export", "leads.export_sensitive", "leads.import", "leads.manage",
  ],
  // 03/11: só policies/RPCs que nenhum ecrã vivo chama (Operação vive no /negocios; listas/canais/definições de plataforma sem ecrã de escrita).
  // channels.view: sem ação na app viva, 04/11 (o menu e a rota de Origens pedem lead_sources.view; nenhuma função/policy a verifica).
  // lists.view: sem ação na app viva, 05/11 (só as policies das listas; não há ecrã de listas).
  marketing: [
    "channels.create", "channels.view", "channels.delete", "channels.edit", "lists.add_contacts", "lists.create", "lists.delete", "lists.edit",
    "lists.view",
  ],
  // 03/11: só policies/RPCs que nenhum ecrã vivo chama (Operação vive no /negocios; listas/canais/definições de plataforma sem ecrã de escrita).
  // operations.orders.view/view_all e operations.costs.view: sem ação na app viva, 05/11 (as policies/RPCs de ops_* e as do Frota
  // continuam a verificá-las; só saem do editor).
  operations: [
    "operations.checklists.manage", "operations.costs.view", "operations.orders.view", "operations.orders.view_all", "operations.locations.manage", "operations.locations.view", "operations.orders.approve",
    "operations.orders.cancel", "operations.orders.confirm", "operations.orders.create", "operations.orders.edit",
    "operations.orders.execute", "operations.plans.manage", "operations.settings.manage",
  ],
  // 03/11: só policies/RPCs que nenhum ecrã vivo chama (Operação vive no /negocios; listas/canais/definições de plataforma sem ecrã de escrita).
  platform: [
    "platform.dashboard.view", "platform.organizations.manage", "platform.organizations.view", "platform.security.audit",
    "platform.settings.manage", "platform.users.manage", "platform.users.view",
  ],
  // 03/11: só as páginas antigas do catálogo (rotas redirecionam para /catalogo-custos) as verificavam. products.manage e brands.edit:
  // sem ação na app viva, 04/11 — o servidor exige-as nas RPCs/policies de packs, atributos, unidades e marcas, mas só as páginas
  // antigas (Bundles, ProductAttributes, Brands, UnitsOfMeasure...) as chamavam; o Catálogo novo grava por cat_guardar_*.
  products: [
    "brands.create", "brands.delete", "brands.edit", "product_attributes.create", "product_attributes.delete",
    "product_attributes.edit", "product_categories.create", "product_categories.delete", "product_categories.edit",
    "product_subcategories.create", "product_subcategories.delete", "product_subcategories.edit", "product_subcategories.view",
    "products.delete", "products.export", "products.import", "products.manage",
    "products.manage_attributes", "products.manage_catalog", "products.view_price_history",
  ],
  // 03/11: nada vivo as verifica (as ações das encomendas de compra pedem as próprias: create/edit/delete/receive/approve...).
  purchase_orders: [
    "purchase_orders.manage", "purchase_orders.view_prices",
  ],
  // Só Proposals.tsx (FORA_DO_MENU) e o pedido dela a export-data.
  proposals: [
    "proposals.export",
  ],
  // quotes.delete/export/export_sensitive: só Quotes.tsx (FORA_DO_MENU) e o pedido dela a export-data.
  quotes: [
    "quotes.delete", "quotes.export", "quotes.export_sensitive", "quotes.generate_pdf",
  ],
  roles: [
    "roles.clone",
  ],
  scheduling: [
    "scheduling.export",
  ],
  // 03/11: só as páginas antigas do catálogo (rotas redirecionam para /catalogo-custos) as verificavam.
  service_catalog: [
    "service_catalog.delete", "service_catalog.view",
  ],
  // 03/11: só as páginas antigas do catálogo (rotas redirecionam para /catalogo-custos) as verificavam.
  service_categories: [
    "service_categories.create", "service_categories.delete", "service_categories.edit", "service_categories.view",
  ],
  service_requests: [
    "service_requests.create", "service_requests.delete", "service_requests.edit", "service_requests.view",
  ],
  // 03/11: só as páginas antigas do catálogo (rotas redirecionam para /catalogo-custos) as verificavam.
  services: [
    "service_catalog.export", "service_catalog.import", "service_fees.create", "service_fees.delete", "service_fees.edit",
    "service_subcategories.create", "service_subcategories.delete", "service_subcategories.edit", "service_subcategories.view",
    "services.create", "services.delete", "services.view_price_history",
  ],
  spare_parts: [
    "spare_parts.create", "spare_parts.delete", "spare_parts.edit", "spare_parts.view",
  ],
  technical_settings: [
    "technical_settings.edit", "technical_settings.view",
  ],
  tenants: [
    "tenants.create", "tenants.delete", "tenants.edit", "tenants.manage_companies", "tenants.view",
  ],
  trash: [
    "trash.delete", "trash.restore",
  ],
  users: [
    "users.change_password",
  ],
  vehicles: [
    "vehicles.create", "vehicles.delete", "vehicles.edit", "vehicles.export", "vehicles.import", "vehicles.view",
  ],
  work_orders: [
    "work_orders.create", "work_orders.delete", "work_orders.edit", "work_orders.view",
  ],
};

/**
 * Códigos que o código verifica mas que NÃO existem em anew_permissions: ninguém os pode dar pelo editor (só passam a administradores
 * de sistema). Ficam listados para o teste não os confundir com permissões novas; a limpeza (criar a permissão ou trocar o código)
 * é outra tarefa. Os de src/emylia e src/pages/prototipo-negocios são do protótipo.
 */
export const CODIGOS_SEM_CATALOGO: readonly string[] = [
  "contacto.registar", "contracts.cancel", "contracts.view", "contrato.editar", "equipa.edit", "finance.invoice", "finance.validate_payment",
  "inventory.manage", "inventory.receive", "margin.approve", "negocio.perder", "obra.encomendar", "obra.executar", "obra.fechar", "obra.imprevistos",
  "obra.materiais", "obra.planear", "orcamento.editar", "proposta.decidir", "proposta.enviar", "suppliers.manage", "visita.gerir",
];

/**
 * Escondidas do editor que uma guarda viva ainda pede (rota/menu). Esconder não muda a guarda: quem já tem o código (papéis antigos,
 * administradores de sistema e Super Admin) continua a passar; os outros deixam de o poder receber pelo editor. Lista fechada:
 * permissoesEmUso.test.ts só tolera estes códigos nestes ficheiros.
 */
export const ESCONDIDAS_COM_GUARDA: Readonly<Record<string, readonly string[]>> = {
  // 04/11: /rh-exemplo/denuncias (ProtectedRoute em App.tsx e PERMISSOES_RH.denuncias em menuConfig.ts); as RPCs da página não existem.
  "hr.denuncias.gerir": ["App.tsx", "components/sidebar/menuConfig.ts"],
};

const todas = (r: Readonly<Record<string, readonly string[]>>): string[] => Object.values(r).flat();

/** Os códigos das permissões em uso (o que o editor mostra). */
export const CODIGOS_EM_USO: ReadonlySet<string> = new Set(todas(PERMISSOES_EM_USO));

/** Os códigos escondidos do editor. */
export const CODIGOS_ESCONDIDOS: ReadonlySet<string> = new Set(todas(PERMISSOES_ESCONDIDAS));

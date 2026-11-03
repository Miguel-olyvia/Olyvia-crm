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

export const PERMISSOES_EM_USO: Readonly<Record<string, readonly string[]>> = {
  api_keys: [
    "api_keys.copy", "api_keys.create", "api_keys.delete", "api_keys.toggle", "api_keys.view",
  ],
  catalog_items: [
    "catalog_items.delete", "catalog_items.export", "catalog_items.import", "catalog_items.view",
  ],
  // Só verificadas no servidor (policies/RPCs): client_contracts.manage
  client_contracts: [
    "client_contracts.cancel", "client_contracts.create", "client_contracts.delete", "client_contracts.edit",
    "client_contracts.export", "client_contracts.manage", "client_contracts.manage_templates",
    "client_contracts.send_signature", "client_contracts.view",
  ],
  client_orders: [
    "client_orders.confirm_stock_exit", "client_orders.create", "client_orders.delete", "client_orders.edit",
    "client_orders.view",
  ],
  // Só verificadas no servidor (policies/RPCs/edge functions): clients.create (rpc_confirm_direct_sale, policies anew_clients/anew_entities),
  // clients.delete (policies anew_clients e anew_entity_*), clients.import (policies de INSERT/UPDATE de anew_entity_roles,
  // 20270102130000). clients.edit também em ClientDetailsDialog, que só AnewClients importa.
  clients: [
    "clients.create", "clients.delete", "clients.edit", "clients.import", "clients.view",
  ],
  // Só verificadas no servidor (policies/RPCs/edge function ai-assistant): todas. Não se escondem porque o assistente (AIAssistant, no
  // Layout) as exige (contacts.view/create/edit) e as policies de anew_contacts e anew_entity_roles/relationships as aceitam
  // (contacts.delete/import). São as únicas que sobram no grupo CRM do editor.
  contacts: [
    "contacts.create", "contacts.delete", "contacts.edit", "contacts.import", "contacts.view",
  ],
  dashboard: [
    "dashboard.view",
  ],
  deals: [
    "deals.create", "deals.delete", "deals.edit", "deals.view",
  ],
  direct_sales: [
    "direct_sales.confirm", "direct_sales.create", "direct_sales.edit", "direct_sales.register_invoice", "direct_sales.view",
    "direct_sales.view_costs",
  ],
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
  // Só verificadas no servidor (policies/RPCs): hr.ausencias.direitos.edit, hr.ausencias.tipos.edit, hr.ausencias.tipos.view, hr.pessoas.acessos_sensiveis.view, hr.pessoas.duplicados.view, hr.pessoas.horario_realizado.edit
  hr: [
    "hr.admissao.obrigatorios.gerir", "hr.assiduidade.corrigir", "hr.assiduidade.equipa.view", "hr.assiduidade.faltas.edit",
    "hr.assiduidade.faltas.view", "hr.assiduidade.gerir", "hr.assiduidade.justificacao.edit",
    "hr.assiduidade.justificacao.view", "hr.assiduidade.obras.registar", "hr.assiduidade.picar", "hr.assiduidade.picar.outros",
    "hr.assiduidade.view", "hr.assiduidade.view.own", "hr.ausencias.ajustar", "hr.ausencias.aprovar.chefia",
    "hr.ausencias.aprovar.rh", "hr.ausencias.direitos.edit", "hr.ausencias.direitos.view", "hr.ausencias.historico.editar",
    "hr.ausencias.justificacao.view", "hr.ausencias.pedir", "hr.ausencias.pedir.outros", "hr.ausencias.tipos.edit",
    "hr.ausencias.tipos.view", "hr.ausencias.view", "hr.ausencias.view.own", "hr.cargos.salario.alterar",
    "hr.contratos.regras.gerir", "hr.locais.edit", "hr.locais.view", "hr.onboarding.approve", "hr.onboarding.restrito",
    "hr.onboarding.sensitive", "hr.pessoas.acessos_sensiveis.view", "hr.pessoas.afectacoes.corrigir",
    "hr.pessoas.afectacoes.edit", "hr.pessoas.afectacoes.view", "hr.pessoas.bancarios.edit", "hr.pessoas.bancarios.view",
    "hr.pessoas.colocacao.corrigir", "hr.pessoas.colocacao.edit", "hr.pessoas.colocacao.view", "hr.pessoas.conta.criar",
    "hr.pessoas.conta.link", "hr.pessoas.convite.enviar", "hr.pessoas.create", "hr.pessoas.documentos.anular",
    "hr.pessoas.documentos.conteudo.view", "hr.pessoas.documentos.edit", "hr.pessoas.documentos.emitir",
    "hr.pessoas.documentos.modelos.edit", "hr.pessoas.documentos.modelos.view", "hr.pessoas.documentos.view",
    "hr.pessoas.documentos.view.own", "hr.pessoas.duplicados.view", "hr.pessoas.edit", "hr.pessoas.emergencia.edit",
    "hr.pessoas.emergencia.view", "hr.pessoas.horario_realizado.edit", "hr.pessoas.horario_realizado.validar",
    "hr.pessoas.horario_realizado.view", "hr.pessoas.horario.corrigir", "hr.pessoas.horario.edit", "hr.pessoas.horario.view",
    "hr.pessoas.identificacao.edit", "hr.pessoas.identificacao.reveal", "hr.pessoas.identificacao.view",
    "hr.pessoas.laborais.edit", "hr.pessoas.laborais.view", "hr.pessoas.morada.edit", "hr.pessoas.morada.view",
    "hr.pessoas.pessoais.edit", "hr.pessoas.pessoais.view", "hr.pessoas.retribuicao.corrigir", "hr.pessoas.retribuicao.edit",
    "hr.pessoas.retribuicao.view", "hr.pessoas.saude.edit", "hr.pessoas.saude.view", "hr.pessoas.sindicalizacao.edit",
    "hr.pessoas.sindicalizacao.view", "hr.pessoas.view", "hr.pessoas.view.own", "hr.pessoas.vinculos.edit",
    "hr.pessoas.vinculos.horas.corrigir", "hr.pessoas.vinculos.view", "hr.processamento.lancamentos.gerir",
    "hr.processamento.periodo.gerir", "hr.processamento.periodo.view", "hr.vencimento.codigos.gerir",
    "hr.vencimento.codigos.view", "hr.vencimento.subsidio.gerir", "hr.vencimento.subsidio.view",
  ],
  // Só verificadas no servidor (policies/RPCs): inventory.adjust, inventory.create, inventory.delete
  inventory: [
    "inventory.adjust", "inventory.count", "inventory.create", "inventory.delete", "inventory.edit", "inventory.view",
  ],
  // Só verificadas no servidor (policies/RPCs/edge functions): leads.assign (neg_atribuir_pessoa), leads.config (policies das tabelas de
  // configuração de leads, incluindo lead_contact_results que a rota viva /lead-contact-results grava), leads.delete (policies anew_leads
  // e anew_entity_*), leads.edit (policies, ai-assistant, execute-workflow), leads.import (policies de anew_entity_roles, 20270102130000).
  // platform.pending_submissions.view está na categoria leads da base mas aparece em Marketing › Formulários (gruposPermissoes.ts).
  leads: [
    "leads.assign", "leads.config", "leads.convert", "leads.create", "leads.delete", "leads.edit", "leads.import", "leads.view",
    "platform.pending_submissions.view",
  ],
  // Só verificadas no servidor (policies/RPCs): lists.create, lists.delete, lists.edit, lists.view
  marketing: [
    "campaigns.create", "campaigns.delete", "campaigns.edit", "campaigns.view", "channels.create", "channels.view",
    "lead_sources.create", "lead_sources.delete", "lead_sources.edit", "lists.create", "lists.delete", "lists.edit",
    "lists.view",
  ],
  // Só verificadas no servidor (policies/RPCs): operations.checklists.manage, operations.costs.view, operations.locations.manage, operations.locations.view, operations.orders.cancel, operations.orders.confirm, operations.orders.create, operations.orders.edit, operations.orders.execute, operations.orders.view, operations.orders.view_all, operations.plans.manage, operations.settings.manage
  operations: [
    "operations.checklists.manage", "operations.costs.view", "operations.locations.manage", "operations.locations.view",
    "operations.orders.cancel", "operations.orders.confirm", "operations.orders.create", "operations.orders.edit",
    "operations.orders.execute", "operations.orders.view", "operations.orders.view_all", "operations.plans.manage",
    "operations.settings.manage", "operations.view",
  ],
  organizations: [
    "organizations.create", "organizations.delete", "organizations.edit", "organizations.view",
  ],
  pessoas: [
    "negocios.contrato.editar", "negocios.margem.aprovar", "negocios.obra.executar", "negocios.obra.materiais",
    "negocios.obra.planear", "negocios.orcamento.editar", "negocios.proposta.enviar", "negocios.registar_fatura",
    "negocios.validar_pagamento", "pessoas.config", "pessoas.create", "pessoas.delete", "pessoas.edit", "pessoas.reopen",
    "pessoas.view",
  ],
  // Só verificadas no servidor (policies/RPCs): platform.settings.manage
  platform: [
    "platform.auth_audit_log.view", "platform.settings.manage", "platform.support_access.view", "rgpd.erasure.manage",
  ],
  // Só verificadas no servidor (policies/RPCs): portal.manage
  portal: [
    "portal.manage",
  ],
  // Só verificadas no servidor (policies/RPCs): products.manage_attributes
  products: [
    "brands.create", "brands.delete", "brands.edit", "brands.view", "product_attributes.create", "product_attributes.delete",
    "product_attributes.edit", "product_attributes.view", "product_categories.create", "product_categories.delete",
    "product_categories.edit", "product_categories.view", "product_subcategories.create", "product_subcategories.delete",
    "product_subcategories.edit", "product_subcategories.view", "products.create", "products.delete", "products.edit",
    "products.export", "products.import", "products.manage", "products.manage_attributes", "products.manage_prices",
    "products.view", "products.view_cost",
  ],
  proposals: [
    "proposals.create", "proposals.delete", "proposals.delete_sent", "proposals.edit", "proposals.export", "proposals.manage",
    "proposals.view",
  ],
  purchase_orders: [
    "purchase_orders.approve", "purchase_orders.create", "purchase_orders.delete", "purchase_orders.edit",
    "purchase_orders.export", "purchase_orders.import", "purchase_orders.manage", "purchase_orders.receive",
    "purchase_orders.revert_receipt", "purchase_orders.view", "purchase_orders.view_prices",
  ],
  quote_templates: [
    "quote_templates.create", "quote_templates.delete", "quote_templates.duplicate", "quote_templates.edit",
    "quote_templates.view",
  ],
  quotes: [
    "quotes.create", "quotes.delete", "quotes.edit", "quotes.export", "quotes.export_sensitive", "quotes.manage",
    "quotes.view", "quotes.view_costs",
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
  service_catalog: [
    "service_catalog.delete", "service_catalog.view",
  ],
  service_categories: [
    "service_categories.create", "service_categories.delete", "service_categories.edit", "service_categories.view",
  ],
  // Só verificadas no servidor (policies/RPCs): service_fees.delete, service_fees.edit
  services: [
    "service_catalog.export", "service_catalog.import", "service_fees.create", "service_fees.delete", "service_fees.edit",
    "service_fees.view", "service_subcategories.create", "service_subcategories.delete", "service_subcategories.edit",
    "service_subcategories.view", "services.create", "services.delete", "services.edit", "services.manage_prices",
    "services.view", "services.view_cost",
  ],
  settings: [
    "settings.update",
  ],
  smtp: [
    "smtp.edit", "smtp.view",
  ],
  // Só verificadas no servidor (policies/RPCs): suppliers.contract_manage (contrato de fornecedor, 20270103300000)
  suppliers: [
    "suppliers.contract_manage", "suppliers.create", "suppliers.delete", "suppliers.edit", "suppliers.export",
    "suppliers.import", "suppliers.portal_manage", "suppliers.view", "suppliers.view_pricing", "suppliers.view_sla_report",
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
  calendar: [
    "calendar.create", "calendar.edit", "calendar.view_company",
  ],
  // Só AnewClients.tsx (rota /clients redireciona) as verificava; export-data só as pede para o módulo clients, que nada vivo exporta.
  clients: [
    "clients.export", "clients.export_sensitive",
  ],
  call_center: [
    "call_center.handle_calls", "call_center.manage", "call_center.view",
  ],
  companies: [
    "companies.create", "companies.delete", "companies.edit", "companies.upload_logo", "companies.view",
  ],
  company_groups: [
    "company_groups.create", "company_groups.delete", "company_groups.edit", "company_groups.view",
  ],
  contacts: [
    "contacts.export", "contacts.export_sensitive", "contacts.view_details",
  ],
  departments: [
    "departments.create", "departments.delete", "departments.edit", "departments.view",
  ],
  direct_sales: [
    "direct_sales.delete",
  ],
  drivers: [
    "drivers.create", "drivers.delete", "drivers.edit", "drivers.export", "drivers.import", "drivers.view",
  ],
  employees: [
    "employees.create", "employees.delete", "employees.edit", "employees.export", "employees.import", "employees.view",
  ],
  hr: [
    "hr.assiduidade.importar", "hr.module.access", "hr.onboarding.sign_employer", "hr.pessoas.archive", "vacations.create",
    "vacations.manage", "vacations.view",
  ],
  inventory: [
    "inventory.export", "inventory.import", "inventory.transfer",
  ],
  // leads.contact: só LeadTableRow.tsx; leads.export(_sensitive): só AnewLeads.tsx (rota /leads redireciona) e o módulo leads de export-data.
  leads: [
    "leads.contact", "leads.export", "leads.export_sensitive", "leads.manage",
  ],
  marketing: [
    "channels.delete", "channels.edit", "lead_sources.view", "lists.add_contacts",
  ],
  operations: [
    "operations.orders.approve",
  ],
  platform: [
    "platform.dashboard.view", "platform.organizations.manage", "platform.organizations.view", "platform.security.audit",
    "platform.users.manage", "platform.users.view",
  ],
  products: [
    "products.manage_catalog", "products.view_price_history",
  ],
  quotes: [
    "quotes.generate_pdf",
  ],
  roles: [
    "roles.clone",
  ],
  scheduling: [
    "scheduling.export",
  ],
  service_requests: [
    "service_requests.create", "service_requests.delete", "service_requests.edit", "service_requests.view",
  ],
  services: [
    "services.view_price_history",
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
    "trash.delete", "trash.restore", "trash.view",
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
  "contract_templates.view", "contracts.cancel", "contracts.view", "countries.view", "equipa.edit", "finance.invoice",
  "finance.validate_payment", "inventory.manage", "inventory.receive", "margin.approve", "scheduling.items.manage",
  "scheduling.view", "settings.manage", "settings.view", "stocks.create", "stocks.delete", "stocks.edit", "stocks.export",
  "stocks.import", "suppliers.manage",
];

const todas = (r: Readonly<Record<string, readonly string[]>>): string[] => Object.values(r).flat();

/** Os códigos das permissões em uso (o que o editor mostra). */
export const CODIGOS_EM_USO: ReadonlySet<string> = new Set(todas(PERMISSOES_EM_USO));

/** Os códigos escondidos do editor. */
export const CODIGOS_ESCONDIDOS: ReadonlySet<string> = new Set(todas(PERMISSOES_ESCONDIDAS));

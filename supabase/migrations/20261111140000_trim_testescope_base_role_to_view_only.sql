-- Fix: testescope_base_role holds 135 non-view permissions despite its own
-- description ("Role base de teste com permissoes .view para verificacao de
-- scopes") saying it should be view-only.
--
-- Root cause of today's E2E finding: team_leader and team_member personas
-- (both on this role_id) could open "Configuracao de Workflow" with full
-- edit/delete rights because leads.config (and 134 other .create/.edit/
-- .delete/.manage/.configure/.export_sensitive codes) were granted on a role
-- meant to be view-only.
--
-- Role: testescope_base_role
-- role_id: cdbe453f-1732-4cec-aa0f-a5832324112f
-- org: Nike (b6ffce4f-f630-4933-833a-008649757a33)
--
-- Reference pattern: testescope_outofteam_role (8aad9a25-905d-4162-ade0-1fa2566b6b16)
-- holds exactly the same 34 .view-only codes kept below, confirming
-- in-team personas do not need any extra view-level codes beyond what
-- out-of-team already has.
--
-- Accounts currently on this role_id (all confirmed safe test artifacts,
-- no production data/activity):
--   - team_leader (teste-scope-team-leader@example.com)
--   - team_member (teste-scope-membro@example.com)
--   - retest-leader-newuser@example.com (dormant orphan)
--   - r9leader.newuser.test@example.com (dormant orphan)
--
-- This migration deletes the 135 non-view rows below, leaving only the 34
-- .view codes already present on the role.
--
-- Codes removed (135):
--   - brands.create
--   - brands.delete
--   - brands.edit
--   - campaigns.create
--   - campaigns.delete
--   - campaigns.edit
--   - channels.create
--   - channels.delete
--   - channels.edit
--   - client_contracts.create
--   - client_contracts.delete
--   - client_contracts.edit
--   - client_contracts.manage
--   - client_contracts.manage_templates
--   - client_contracts.send_signature
--   - clients.create
--   - clients.delete
--   - clients.edit
--   - clients.export
--   - clients.export_sensitive
--   - clients.import
--   - contacts.create
--   - contacts.delete
--   - contacts.edit
--   - contacts.export
--   - contacts.export_sensitive
--   - contacts.import
--   - contacts.view_details
--   - deals.create
--   - deals.delete
--   - deals.edit
--   - email_templates.create
--   - email_templates.delete
--   - email_templates.duplicate
--   - email_templates.edit
--   - flow_builder.create
--   - flow_builder.delete
--   - flow_builder.edit
--   - forms.create
--   - forms.delete
--   - forms.edit
--   - leads.assign
--   - leads.config                 <- confirmed root cause of the E2E bug
--   - leads.contact
--   - leads.convert
--   - leads.create
--   - leads.delete
--   - leads.edit
--   - leads.export
--   - leads.export_sensitive
--   - leads.import
--   - leads.manage
--   - lists.add_contacts
--   - lists.create
--   - lists.delete
--   - lists.edit
--   - product_attributes.create
--   - product_attributes.delete
--   - product_attributes.edit
--   - product_categories.create
--   - product_categories.delete
--   - product_categories.edit
--   - product_subcategories.create
--   - product_subcategories.delete
--   - product_subcategories.edit
--   - products.create
--   - products.delete
--   - products.edit
--   - products.export
--   - products.import
--   - products.manage
--   - products.manage_attributes
--   - products.manage_catalog
--   - products.manage_prices
--   - products.view_price_history
--   - proposals.create
--   - proposals.delete
--   - proposals.edit
--   - proposals.manage
--   - purchase_orders.create
--   - purchase_orders.delete
--   - purchase_orders.edit
--   - purchase_orders.export
--   - purchase_orders.import
--   - quote_templates.create
--   - quote_templates.delete
--   - quote_templates.duplicate
--   - quote_templates.edit
--   - quotes.create
--   - quotes.delete
--   - quotes.edit
--   - quotes.export
--   - quotes.export_sensitive
--   - quotes.generate_pdf
--   - quotes.manage
--   - scheduling.boards.create
--   - scheduling.boards.delete
--   - scheduling.boards.edit
--   - scheduling.export
--   - scheduling.items.create
--   - scheduling.items.delete
--   - scheduling.items.edit
--   - scheduling.resources.create
--   - scheduling.resources.delete
--   - scheduling.resources.edit
--   - scheduling.rules.create
--   - scheduling.rules.delete
--   - scheduling.rules.edit
--   - scheduling.settings
--   - service_catalog.export
--   - service_catalog.import
--   - service_categories.create
--   - service_categories.delete
--   - service_categories.edit
--   - service_fees.create
--   - service_fees.delete
--   - service_fees.edit
--   - service_subcategories.create
--   - service_subcategories.delete
--   - service_subcategories.edit
--   - services.create
--   - services.delete
--   - services.edit
--   - services.manage_prices
--   - services.view_price_history
--   - suppliers.create
--   - suppliers.delete
--   - suppliers.edit
--   - suppliers.export
--   - suppliers.import
--   - warehouses.create
--   - warehouses.delete
--   - warehouses.edit
--   - warehouses.export
--   - warehouses.import
--
-- Codes retained (34, all .view): brands.view, campaigns.view, channels.view,
-- client_contracts.view, clients.view, contacts.view, dashboard.view,
-- deals.view, email_templates.view, flow_builder.view, forms.view,
-- leads.view, lists.view, organizations.view, product_attributes.view,
-- product_categories.view, product_subcategories.view, products.view,
-- proposals.view, purchase_orders.view, quote_templates.view, quotes.view,
-- roles.view, scheduling.boards.view, scheduling.items.view,
-- scheduling.resources.view, scheduling.rules.view, service_categories.view,
-- service_fees.view, service_subcategories.view, services.view,
-- suppliers.view, users.view, warehouses.view

delete from public.anew_role_permissions
where role_id = 'cdbe453f-1732-4cec-aa0f-a5832324112f'
  and permission_code in (
  'brands.create',
  'brands.delete',
  'brands.edit',
  'campaigns.create',
  'campaigns.delete',
  'campaigns.edit',
  'channels.create',
  'channels.delete',
  'channels.edit',
  'client_contracts.create',
  'client_contracts.delete',
  'client_contracts.edit',
  'client_contracts.manage',
  'client_contracts.manage_templates',
  'client_contracts.send_signature',
  'clients.create',
  'clients.delete',
  'clients.edit',
  'clients.export',
  'clients.export_sensitive',
  'clients.import',
  'contacts.create',
  'contacts.delete',
  'contacts.edit',
  'contacts.export',
  'contacts.export_sensitive',
  'contacts.import',
  'contacts.view_details',
  'deals.create',
  'deals.delete',
  'deals.edit',
  'email_templates.create',
  'email_templates.delete',
  'email_templates.duplicate',
  'email_templates.edit',
  'flow_builder.create',
  'flow_builder.delete',
  'flow_builder.edit',
  'forms.create',
  'forms.delete',
  'forms.edit',
  'leads.assign',
  'leads.config',
  'leads.contact',
  'leads.convert',
  'leads.create',
  'leads.delete',
  'leads.edit',
  'leads.export',
  'leads.export_sensitive',
  'leads.import',
  'leads.manage',
  'lists.add_contacts',
  'lists.create',
  'lists.delete',
  'lists.edit',
  'product_attributes.create',
  'product_attributes.delete',
  'product_attributes.edit',
  'product_categories.create',
  'product_categories.delete',
  'product_categories.edit',
  'product_subcategories.create',
  'product_subcategories.delete',
  'product_subcategories.edit',
  'products.create',
  'products.delete',
  'products.edit',
  'products.export',
  'products.import',
  'products.manage',
  'products.manage_attributes',
  'products.manage_catalog',
  'products.manage_prices',
  'products.view_price_history',
  'proposals.create',
  'proposals.delete',
  'proposals.edit',
  'proposals.manage',
  'purchase_orders.create',
  'purchase_orders.delete',
  'purchase_orders.edit',
  'purchase_orders.export',
  'purchase_orders.import',
  'quote_templates.create',
  'quote_templates.delete',
  'quote_templates.duplicate',
  'quote_templates.edit',
  'quotes.create',
  'quotes.delete',
  'quotes.edit',
  'quotes.export',
  'quotes.export_sensitive',
  'quotes.generate_pdf',
  'quotes.manage',
  'scheduling.boards.create',
  'scheduling.boards.delete',
  'scheduling.boards.edit',
  'scheduling.export',
  'scheduling.items.create',
  'scheduling.items.delete',
  'scheduling.items.edit',
  'scheduling.resources.create',
  'scheduling.resources.delete',
  'scheduling.resources.edit',
  'scheduling.rules.create',
  'scheduling.rules.delete',
  'scheduling.rules.edit',
  'scheduling.settings',
  'service_catalog.export',
  'service_catalog.import',
  'service_categories.create',
  'service_categories.delete',
  'service_categories.edit',
  'service_fees.create',
  'service_fees.delete',
  'service_fees.edit',
  'service_subcategories.create',
  'service_subcategories.delete',
  'service_subcategories.edit',
  'services.create',
  'services.delete',
  'services.edit',
  'services.manage_prices',
  'services.view_price_history',
  'suppliers.create',
  'suppliers.delete',
  'suppliers.edit',
  'suppliers.export',
  'suppliers.import',
  'warehouses.create',
  'warehouses.delete',
  'warehouses.edit',
  'warehouses.export',
  'warehouses.import'
);

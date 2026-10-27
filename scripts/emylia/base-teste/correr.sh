#!/usr/bin/env bash
# A prova pela base do Negócio (o caso da Anabela, 26 passos) em PGlite, com a estrutura REAL da base RH.
# Correr da raiz do repo: bash scripts/emylia/base-teste/correr.sh
#   1. gerar_base.py lê a estrutura das tabelas na base ligada (só SELECT) e escreve-a num SQL (sem gatilhos nem funções do CRM);
#   2. o script idaEVoltaNegocio.ts vai em bundle (esbuild) com os stubs do browser;
#   3. corre-se com as migrations da Emylia por ordem. As 4 funções da encomenda de cliente vêm de funcoes-crm/: são a cópia da base RH
#      ANTES da 20261231980000 (a migration junta-lhes a condição; depois do db push, a base já as tem ajustadas).
# Precisa: a pasta ligada à base uetjgh… (supabase/.temp/project-ref) e o PGlite em D:/Olyvia2.0-Documentacao/docs/base-de-dados/testes.
set -euo pipefail
cd "$(dirname "$0")/../../.."
T="${TMPDIR:-/tmp}/emylia-base-teste"; mkdir -p "$T"
B=scripts/emylia/base-teste; M=supabase/migrations
P="D:/Olyvia2.0-Documentacao/docs/base-de-dados/testes/node_modules/@electric-sql/pglite/dist/index.js"
[ "$(cat supabase/.temp/project-ref)" = "uetjghdkwbywbftedtth" ] || { echo "A pasta não está ligada à base RH."; exit 1; }
if [ ! -s "$T/base.sql" ] || [ "${GERAR:-}" = 1 ]; then
  python -I $B/gerar_base.py "$T/base.sql" anew_organizations anew_users anew_memberships anew_entities anew_addresses negocios negocio_workflow_config \
    services service_prices products product_prices ops_skill ops_obra_servico_tarefa service_categories service_materials schedule_items schedule_boards \
    quotes quote_lines client_contracts proposals deals client_contract_parties catalog_items bundles bundle_components item_suppliers \
    supplier_catalog_items supplier_account_links suppliers uom organization_subscriptions plan_limits organization_usage_counters \
    organization_inventory_settings ops_utilizador_perfil ops_utilizador_skill
fi
npx esbuild scripts/emylia/idaEVoltaNegocio.ts --bundle --platform=node --format=esm --tsconfig=tsconfig.app.json --log-level=error \
  --inject:$B/stubs-browser.js '--define:import.meta.env={"VITE_SUPABASE_URL":"http://x","VITE_SUPABASE_PUBLISHABLE_KEY":"x","DEV":false}' --outfile="$T/neg.mjs"
node "$T/neg.mjs" "$P" "$T/base.sql" \
  $M/20261231910000_catalogo_e_custos.sql $M/20261231920000_catalogo_ajustes.sql $M/20261231930000_carga_catalogo_nike.sql \
  $M/20261231940000_negocio_base.sql $M/20261231950000_negocio_complementos.sql $M/20261231960000_negocio_ler_guardar.sql \
  $M/20261231970000_negocio_visitas_agenda.sql \
  $B/funcoes-crm/fn_client_order_line_reservations.sql $B/funcoes-crm/rpc_list_client_order_documents.sql \
  $B/funcoes-crm/rpc_client_order_list_readiness.sql $B/funcoes-crm/fn_client_order_request_missing.sql \
  $M/20261231980000_negocio_encomenda_cliente.sql $M/20261231990000_negocio_adendas.sql "$@"

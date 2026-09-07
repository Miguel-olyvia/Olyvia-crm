-- Da platform.pending_submissions.view aos roles de venda do Grupo BMLar e da
-- Mudelar -- quem trata de leads e clientes passa a poder ver a fila de
-- submissoes de formulario por rever.
--
-- CRITERIO (decidido com o dono do produto): recebe a permissao todo o role
-- destas duas organizacoes que
--    (a) pode VER leads e clientes  (leads.view E clients.view), E
--    (b) pode AGIR sobre eles       (pelo menos uma de: leads.edit, leads.create,
--        leads.convert, leads.assign, clients.edit, clients.create).
-- A condicao (b) deixa DE FORA os papeis so-de-leitura (ex.: "Org Viewer"):
-- despachar uma submissao e uma accao, nao uma visualizacao.
--
-- Porque nao lista os roles pelo codigo: os roles do Grupo e da Mudelar sao
-- dados de tenant (nao ha ficheiro de seed que os fixe) e a RLS nao deixa
-- le-los de fora. Em vez de fixar codigos a adivinhar, a migracao IDENTIFICA os
-- roles pelas permissoes que ja tem -- o mesmo criterio do pedido, resolvido
-- contra o estado real da base no momento em que aplica. Se um role nao cumprir
-- o criterio, simplesmente nao entra.
--
-- A Mudelar e filha do Grupo BMLar na hierarquia de organizacoes, mas os ROLES
-- nao se herdam entre tenants -- cada organizacao e dona dos seus. Por isso o
-- alcance esta limitado, pelo organization_id, a estas duas orgs e mais nenhuma.
-- Nota (fica para outra altura): ha utilizadores com o role sales_technician (do
-- Grupo) a operar na Mudelar; e um desalinhamento de tenant a corrigir depois e
-- nao muda o que esta migracao faz.
--
-- Sao roles de ORGANIZACAO (custom), nao de sistema -- nao precisam do
-- set_config('request.jwt.claims',...) que o protect_system_role_permissions
-- exige aos roles de sistema. E um INSERT normal.
-- Idempotente (NOT EXISTS) e aditiva: so acrescenta linhas de permissao.

INSERT INTO "public"."anew_role_permissions" ("role_id", "permission_code")
SELECT "r"."id", 'platform.pending_submissions.view'
FROM "public"."anew_roles" "r"
WHERE "r"."organization_id" IN (
        '4e5901c6-ed7d-45c3-a143-ea2bdd09f091',  -- Grupo BMLar
        '3242e925-da26-459a-8258-be04d904e355'   -- Mudelar (filha do Grupo)
      )
  AND "r"."is_system" IS NOT TRUE
  -- (a) ve leads E clientes
  AND EXISTS (SELECT 1 FROM "public"."anew_role_permissions" p
              WHERE p."role_id" = "r"."id" AND p."permission_code" = 'leads.view')
  AND EXISTS (SELECT 1 FROM "public"."anew_role_permissions" p
              WHERE p."role_id" = "r"."id" AND p."permission_code" = 'clients.view')
  -- (b) age sobre leads OU clientes (exclui papeis so-de-leitura)
  AND EXISTS (SELECT 1 FROM "public"."anew_role_permissions" p
              WHERE p."role_id" = "r"."id"
                AND p."permission_code" IN (
                  'leads.edit', 'leads.create', 'leads.convert', 'leads.assign',
                  'clients.edit', 'clients.create'))
  -- ainda nao a tem
  AND NOT EXISTS (SELECT 1 FROM "public"."anew_role_permissions" p
                  WHERE p."role_id" = "r"."id"
                    AND p."permission_code" = 'platform.pending_submissions.view');

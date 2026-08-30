/**
 * Stubs mínimos do núcleo do CRM, para correr o SQL de Operações contra um
 * Postgres limpo sem precisar da base real.
 *
 * As colunas foram copiadas do esquema verdadeiro
 * (`src/integrations/supabase/types.ts` do CRM), não inventadas. Duas que
 * custaram a descobrir e que importam:
 *
 *   · `anew_clients` NÃO tem coluna de nome — o nome vive em
 *     `anew_entities.display_name`, alcançável por `entity_id`.
 *   · `anew_users` usa `name`, não `full_name`.
 *
 * Se um stub divergir do real, o SQL passa aqui e falha em produção. Ao
 * mudar algo aqui, confirma contra o esquema real primeiro.
 */

export const STUBS_CRM = `
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text,
  email_confirmed_at timestamptz);
-- nullif() como no Supabase real: sem sessão devolve NULL em vez de rebentar
-- com "invalid input syntax for type uuid". A diferença importa — sem ela, um
-- teste que corre sem sessão falha com o erro errado, e manda-nos procurar o
-- problema no sítio errado.
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;

CREATE TABLE public.anew_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL);

CREATE TABLE public.anew_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid,
  entity_id uuid,
  name text NOT NULL DEFAULT 'Utilizador',
  email text NOT NULL,
  phone text,
  avatar_url text,
  status text NOT NULL DEFAULT 'active',
  deleted_at timestamptz);

CREATE TABLE public.anew_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  type text NOT NULL DEFAULT 'company',
  status text NOT NULL DEFAULT 'active');

CREATE TABLE public.anew_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  entity_id uuid NOT NULL,
  status text,
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz);

CREATE TABLE public.anew_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  name text NOT NULL,
  is_system boolean DEFAULT false,
  deleted_at timestamptz);

CREATE TABLE public.anew_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  role_id uuid NOT NULL,
  relationship_type text NOT NULL DEFAULT 'BELONGS_TO',
  status text NOT NULL DEFAULT 'active');

CREATE TABLE public.anew_role_permissions (
  role_id uuid,
  permission_code text,
  UNIQUE (role_id, permission_code));

CREATE TABLE public.anew_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  category text NOT NULL,
  scope text,
  supports_scope boolean NOT NULL DEFAULT false,
  is_dangerous boolean DEFAULT false,
  parent_code text,
  display_order integer,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now());

-- Orcamentos. So as colunas que db/orcamentos.sql le — se ele passar a ler
-- outra, o teste rebenta aqui e nao em producao, que e o ponto de ter stubs.
CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  cliente_id uuid,
  quote_number text,
  title text,
  obra_endereco text,
  obra_notas text,
  estado text DEFAULT 'rascunho',
  accepted_at timestamptz,
  total numeric(12,2) DEFAULT 0,
  moeda text DEFAULT 'EUR',
  deleted_at timestamptz);

CREATE TABLE public.quote_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid REFERENCES public.quotes(id) ON DELETE CASCADE,
  catalog_item_id uuid,
  ordem integer DEFAULT 0,
  categoria text,
  descricao_snapshot text,
  item_description text,
  unidade text,
  qt numeric(12,3) DEFAULT 1,
  custo_material_unit numeric(12,2) DEFAULT 0,
  custo_mao_obra_unit numeric(12,2) DEFAULT 0,
  total_sem_iva numeric(12,2) DEFAULT 0);

-- O catalogo, e as compras. So as colunas que db/custos.sql le.
CREATE TABLE public.catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  item_code text,
  descricao text,
  categoria text,
  subcategoria text,
  tipo text,
  custo_material numeric(12,2) DEFAULT 0,
  custo_mao_obra numeric(12,2) DEFAULT 0,
  ativo boolean DEFAULT true);

CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid,
  order_number text,
  order_date date,
  status text);

CREATE TABLE public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  description text,
  sku text,
  item_type text DEFAULT 'product',
  quantity numeric(10,2) DEFAULT 1,
  unit_price numeric(10,2) DEFAULT 0,
  total_price numeric(10,2) DEFAULT 0);

CREATE TABLE public.suppliers (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.client_portal_users (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.products (id uuid PRIMARY KEY DEFAULT gen_random_uuid());

CREATE FUNCTION public.get_user_visible_org_ids(_auth_uid uuid)
  RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS
  $$ SELECT id FROM public.anew_organizations $$;

CREATE FUNCTION public.has_anew_permission(_auth_uid uuid, _permission_code text)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT false $$;

CREATE FUNCTION public.is_system_admin_user(_user_id uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT false $$;

CREATE FUNCTION public.current_business_user_id()
  RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS
  $$ SELECT id FROM public.anew_users LIMIT 1 $$;
`;

/**
 * Uma organização, um cliente e um utilizador, como existiriam no CRM.
 *
 * O email e o nome do papel são os mesmos que estão no bloco CONFIGURAÇÃO do
 * `db/pos-instalacao.sql`, de propósito: assim o validador corre esse ficheiro
 * tal e qual, sem substituições. O que é testado aqui é exatamente o que vai
 * correr em produção.
 */
export const DADOS_CRM = `
INSERT INTO public.anew_organizations (id, name)
  VALUES ('11111111-1111-1111-1111-111111111111', 'Grupo de teste');

INSERT INTO public.anew_entities (id, display_name)
  VALUES ('77777777-7777-7777-7777-777777777777', 'Cliente de teste');

INSERT INTO public.anew_clients (id, organization_id, entity_id)
  VALUES ('22222222-2222-2222-2222-222222222222',
          '11111111-1111-1111-1111-111111111111',
          '77777777-7777-7777-7777-777777777777');

INSERT INTO public.anew_users (id, auth_user_id, name, email)
  VALUES ('55555555-5555-5555-5555-555555555555',
          '66666666-6666-6666-6666-666666666666',
          'Ruben Carvalho', '1999rubencmail@gmail.com');

INSERT INTO public.anew_roles (id, organization_id, name)
  VALUES ('88888888-8888-8888-8888-888888888888',
          '11111111-1111-1111-1111-111111111111', 'Admin');

INSERT INTO public.anew_memberships (user_id, organization_id, role_id, status)
  VALUES ('55555555-5555-5555-5555-555555555555',
          '11111111-1111-1111-1111-111111111111',
          '88888888-8888-8888-8888-888888888888', 'active');

-- O utilizador com perfil, tambem do lado da autenticacao.
INSERT INTO auth.users (id, email, email_confirmed_at)
  VALUES ('66666666-6666-6666-6666-666666666666',
          '1999rubencmail@gmail.com', now());

-- Uma conta de autenticacao SEM perfil de CRM. E o ponto de partida do
-- db/criar-utilizador.sql: alguem criou a conta no Studio e falta ligar-lhe
-- o perfil de negocio.
INSERT INTO auth.users (id, email, email_confirmed_at)
  VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          'olyvia-live-ui-check+11544965@example.invalid', now());
`;

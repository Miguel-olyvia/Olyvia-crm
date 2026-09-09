-- ==============================================================================
-- hr_locais_trabalho: o catalogo de locais onde se trabalha.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- O requisito central desta ronda, nas palavras do utilizador: "neste dia ela
-- fez das 9 as 14 naquela empresa e so das 15 as 19 naquilo". Para que um
-- intervalo de horario possa dizer ONDE foi trabalhado, tem de haver uma coisa
-- a que ele aponte.
--
-- Hoje nao ha. pessoas.local_trabalho e text livre (20261120030000 linha 162),
-- o que significa que "Porto", "porto" e "Porto " sao tres locais diferentes,
-- que nao ha como contar horas por local, e que um intervalo de horario nao
-- tem nada a que se referir a nao ser repetir a string.
--
--
-- -- PORQUE UMA TABELA NOVA, E NAO REAPROVEITAR --------------------------------
--
-- Consideraram-se, e rejeitaram-se, duas alternativas:
--
-- 1. anew_organizations. Uma organizacao e uma entidade legal e um no da
--    hierarquia (anew_hierarchy). Duas lojas da mesma empresa NAO sao duas
--    organizacoes: cria-las como tal poluiria o organograma de empresas, os
--    anew_memberships e os filtros de arvore do ecra de organograma. E um
--    local de trabalho pode ser a casa de um cliente ou uma obra, que nunca
--    sera organizacao nenhuma.
--
-- 2. public.locations (existe no baseline, linha 10448). Nao serve por tres
--    razoes independentes: esta scoped por company_id e nao por
--    organization_id; a unica FK que lhe aponta e product_stock.location_id,
--    portanto e uma tabela de armazens; e a sua unica politica RLS e
--    "is_system_admin OR has_permission(uid,'assets.manage')" -- a variante
--    LEGADA da funcao de permissoes, SEM filtro de organizacao. Reaproveita-la
--    obrigava a refazer-lhe a RLS de raiz numa base partilhada e a dar
--    assets.manage a quem gere Recursos Humanos.
--
-- Mas "naquela empresa" tem de ser expressavel, e e: a coluna
-- organizacao_ref_id, FK SIMPLES e OPCIONAL contra anew_organizations. "Das 9
-- as 14 na empresa X" e um local cuja organizacao_ref_id e X; "das 15 as 19 na
-- loja da Av. da Boavista" e um local sem referencia a organizacao nenhuma. Um
-- so conceito no horario, dois usos.
--
-- A FK e SIMPLES e nao composta de proposito: organizacao_ref_id aponta para
-- uma organizacao que NAO e necessariamente a organization_id deste local --
-- e precisamente o caso de uma empresa cliente onde se vai trabalhar. Uma FK
-- composta obrigaria as duas a coincidir e mataria o caso de uso.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Uma tabela org-scoped, no padrao do bloco de RH (soft delete, auditoria,
-- quatro politicas, trigger de updated_at), com a unique
-- hr_locais_trabalho_id_org_key (id, organization_id) como PECA CENTRAL: e ela
-- o alvo das FK COMPOSTAS de pessoas_horario_planeado.local_id,
-- pessoas_horario_realizado.local_id e pessoas.local_id. Sem ela, um horario
-- de uma organizacao poderia apontar para um local de outra.
--
-- Duas uniques parciais que o texto livre da ronda 1 nao tinha:
--   (organization_id, lower(btrim(nome)))  -- acaba com o "Porto"/"porto"
--   (organization_id, codigo)              -- codigo interno, quando existe
-- Ambas WHERE deleted_at IS NULL, para que apagar e recriar com o mesmo nome
-- continue a ser possivel.
--
-- Permissoes: SELECT hr.locais.view, INSERT/UPDATE hr.locais.edit.
-- DELETE restritivo (false): apaga-se por deleted_at, e um local que ja teve
-- horas registadas contra ele nunca deve desaparecer -- desactiva-se
-- (activo=false).
--
--
-- -- DECISAO DE PRODUTO POR TOMAR, DELIBERADAMENTE DEIXADA ABERTA --------------
--
-- A politica de SELECT NAO tem ramo de ficha-propria, e nao pode ter: esta
-- tabela nao tem coluna pessoa_id, nao ha "a minha propria linha" nenhuma.
--
-- Consequencia concreta, e nao e uma omissao: um trabalhador com
-- hr.pessoas.view.own PASSA A VER O SEU HORARIO (a politica de
-- pessoas_horario_planeado tem esse ramo) mas NAO VE O NOME DO LOCAL de cada
-- intervalo -- ve o local_id e mais nada. Na interface aparece um identificador
-- em vez de "Loja da Boavista".
--
-- Nao se resolve aqui por iniciativa propria. As opcoes sao dar hr.locais.view
-- a todo o pessoal, ou por um OR com hr.pessoas.view.own limitado aos locais
-- que aparecem no horario da propria pessoa, ou uma vista/RPC que devolva so o
-- nome. A escolha e do utilizador; fica registada no vault.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Nao se toca em public.locations, nao se reaproveita e nao se lhe refaz a
--   RLS.
-- - Nao se cria hierarquia de locais (parent_location_id). Se um dia for
--   preciso "loja dentro de centro comercial", acrescenta-se; hoje nao ha
--   requisito.
-- - Nada de geocercas, raio de tolerancia ou validacao de picagem por GPS. As
--   colunas latitude/longitude existem para mostrar num mapa, e nada as usa
--   como guarda -- as picagens nao se constroem nesta ronda.
-- - Nao se faz backfill a partir de pessoas.local_trabalho. Ver 20261120170000
--   e o motivo la escrito.
-- - Nao se atribui permissao nenhuma a papel nenhum.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao, e SO depois de
-- reverter 20261120150000/160000/170000, que lhe penduram FKs:
--   DROP TABLE IF EXISTS public.hr_locais_trabalho;
--
--
-- Prerequisitos:
--   20261120010000  has_anew_permission_in_org
--   20261120120000  hr.locais.view e hr.locais.edit no catalogo
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
-- NOTA: to_regclass e nao 'public.hr_locais_trabalho'::regclass. Um cast
-- literal de regclass e resolvido no PLANEAMENTO do bloco, antes de qualquer
-- linha correr, e lanca 42P01 quando a tabela ainda nao existe -- que e
-- exactamente o caso na primeira aplicacao desta migracao. Aconteceu nesta
-- ronda e nao se repete.
DO $guardas$
BEGIN
  IF to_regclass('public.anew_organizations') IS NULL THEN
    RAISE EXCEPTION 'public.anew_organizations nao existe. Estado da base inesperado.';
  END IF;

  IF to_regclass('public.anew_users') IS NULL THEN
    RAISE EXCEPTION 'public.anew_users nao existe. Estado da base inesperado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'has_anew_permission_in_org' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION
      'public.has_anew_permission_in_org(uuid,text,uuid) nao existe. Aplicar 20261120010000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column'
  ) THEN
    RAISE EXCEPTION 'public.update_updated_at_column() nao existe. Estado da base inesperado.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.locais.view') THEN
    RAISE EXCEPTION 'A permissao hr.locais.view nao esta no catalogo. Aplicar 20261120120000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.locais.edit') THEN
    RAISE EXCEPTION 'A permissao hr.locais.edit nao esta no catalogo. Aplicar 20261120120000 primeiro.';
  END IF;

  -- Colisao de nome: se a tabela ja existir mas sem a unique que a identifica
  -- como sendo a desta migracao, nao e a nossa e nao se mexe nela.
  IF to_regclass('public.hr_locais_trabalho') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'hr_locais_trabalho_id_org_key'
        AND conrelid = to_regclass('public.hr_locais_trabalho')
    ) THEN
      RAISE EXCEPTION
        'Ja existe public.hr_locais_trabalho mas sem a constraint hr_locais_trabalho_id_org_key. Nao e a tabela desta migracao -- ha uma colisao de nome. Investigar antes de aplicar.';
    END IF;
    RAISE NOTICE 'public.hr_locais_trabalho ja existe com a unique esperada; a migracao e idempotente daqui para a frente.';
  END IF;
END;
$guardas$;

-- ---- A tabela --------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_locais_trabalho (
  id                    uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id       uuid NOT NULL,

  nome                  text NOT NULL,
  codigo                text,
  tipo                  text NOT NULL DEFAULT 'outro',

  -- Opcional e FK SIMPLES de proposito. Ver o cabecalho: a organizacao aqui
  -- referida pode NAO ser a organization_id deste local (caso da empresa
  -- cliente onde se vai trabalhar), por isso nao pode ser composta.
  organizacao_ref_id    uuid,

  morada                text,
  cidade                text,
  codigo_postal         text,
  pais                  text DEFAULT 'PT',
  latitude              numeric(10,8),
  longitude             numeric(11,8),

  activo                boolean NOT NULL DEFAULT true,
  notas                 text,

  deleted_at            timestamptz,
  deleted_by            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid,
  updated_by            uuid,

  CONSTRAINT hr_locais_trabalho_pkey PRIMARY KEY (id),

  -- A PECA CENTRAL. Parece redundante (id ja e PK) e nao e: e o alvo das FK
  -- COMPOSTAS (local_id, organization_id) dos dois horarios e de pessoas.
  CONSTRAINT hr_locais_trabalho_id_org_key UNIQUE (id, organization_id),

  CONSTRAINT hr_locais_trabalho_organization_fkey
    FOREIGN KEY (organization_id) REFERENCES public.anew_organizations (id) ON DELETE RESTRICT,
  CONSTRAINT hr_locais_trabalho_organizacao_ref_fkey
    FOREIGN KEY (organizacao_ref_id) REFERENCES public.anew_organizations (id) ON DELETE SET NULL,
  CONSTRAINT hr_locais_trabalho_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT hr_locais_trabalho_updated_by_fkey
    FOREIGN KEY (updated_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,
  CONSTRAINT hr_locais_trabalho_deleted_by_fkey
    FOREIGN KEY (deleted_by) REFERENCES public.anew_users (id) ON DELETE SET NULL,

  CONSTRAINT hr_locais_trabalho_nome_nao_vazio CHECK (btrim(nome) <> ''),
  CONSTRAINT hr_locais_trabalho_codigo_nao_vazio
    CHECK (codigo IS NULL OR btrim(codigo) <> ''),
  CONSTRAINT hr_locais_trabalho_tipo_valido CHECK (
    tipo IN ('sede','escritorio','loja','armazem','obra','cliente','remoto','outro')
  ),
  CONSTRAINT hr_locais_trabalho_pais_iso
    CHECK (pais IS NULL OR pais ~ '^[A-Z]{2}$'),
  CONSTRAINT hr_locais_trabalho_latitude_valida
    CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  CONSTRAINT hr_locais_trabalho_longitude_valida
    CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180)),
  -- Coordenadas vem as duas ou nenhuma: meia coordenada nao aponta para sitio
  -- nenhum e passaria por dado valido.
  CONSTRAINT hr_locais_trabalho_coordenadas_completas
    CHECK ((latitude IS NULL) = (longitude IS NULL))
);

COMMENT ON TABLE public.hr_locais_trabalho IS
'Catalogo de locais onde se trabalha, por organizacao: sedes, escritorios, lojas, armazens, obras, casas de cliente e remoto. E a coisa a que cada intervalo de horario aponta para dizer ONDE foi trabalhado. NAO e public.locations (essa e scoped por company_id, serve armazens de stock e tem RLS sem filtro de organizacao) e NAO e anew_organizations (duas lojas da mesma empresa nao sao duas organizacoes).';

COMMENT ON CONSTRAINT hr_locais_trabalho_id_org_key ON public.hr_locais_trabalho IS
'Peca central: e o alvo das FK COMPOSTAS (local_id, organization_id) de pessoas_horario_planeado, pessoas_horario_realizado e pessoas.local_id. E ela que garante, ao nivel da base, que um horario nunca aponta para um local de outra organizacao.';

COMMENT ON COLUMN public.hr_locais_trabalho.organizacao_ref_id IS
'Quando o local E uma empresa (o "naquela empresa" do requisito), aponta para ela. Nula na maioria dos casos -- uma loja ou uma obra nao sao organizacoes. FK SIMPLES e nao composta de proposito: esta organizacao pode NAO ser a organization_id do local, que e precisamente o caso de uma empresa cliente onde se vai trabalhar.';

COMMENT ON COLUMN public.hr_locais_trabalho.activo IS
'Local desactivado deixa de aparecer para escolha nova, mas continua a existir e os horarios historicos continuam a apontar para ele. NAO usar deleted_at para desactivar um local com horas registadas.';

COMMENT ON COLUMN public.hr_locais_trabalho.latitude IS
'Existe para mostrar num mapa. NADA a usa como guarda: nao ha geocerca, nem raio de tolerancia, nem validacao de picagem por GPS -- as picagens nao existem. Nao confundir com um controlo de presenca.';

-- ---- Indices ---------------------------------------------------------------
-- Acaba com o "Porto" / "porto" / "Porto " que o text livre de
-- pessoas.local_trabalho deixava passar.
CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_locais_trabalho_nome_org
  ON public.hr_locais_trabalho (organization_id, lower(btrim(nome)))
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_locais_trabalho_codigo_org
  ON public.hr_locais_trabalho (organization_id, codigo)
  WHERE codigo IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hr_locais_trabalho_activos
  ON public.hr_locais_trabalho (organization_id)
  WHERE deleted_at IS NULL AND activo;

CREATE INDEX IF NOT EXISTS idx_hr_locais_trabalho_organizacao_ref
  ON public.hr_locais_trabalho (organizacao_ref_id)
  WHERE organizacao_ref_id IS NOT NULL;

-- ---- Triggers --------------------------------------------------------------
-- Sem trigger de ancora imutavel: hr_satelite_ancora_imutavel protege
-- (pessoa_id, organization_id) e esta tabela nao tem pessoa_id nenhum.
-- Mover um local de organizacao continuaria a ser possivel por UPDATE, mas
-- so por quem tem hr.locais.edit NA organizacao DE DESTINO tambem -- o
-- WITH CHECK da politica de UPDATE avalia a linha nova.
DROP TRIGGER IF EXISTS trg_hr_locais_trabalho_updated_at ON public.hr_locais_trabalho;
CREATE TRIGGER trg_hr_locais_trabalho_updated_at
  BEFORE UPDATE ON public.hr_locais_trabalho
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---- Grants ----------------------------------------------------------------
REVOKE ALL ON TABLE public.hr_locais_trabalho FROM anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.hr_locais_trabalho TO authenticated;
GRANT ALL ON TABLE public.hr_locais_trabalho TO service_role;

-- ---- RLS -------------------------------------------------------------------
ALTER TABLE public.hr_locais_trabalho ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_locais_trabalho_select ON public.hr_locais_trabalho;
CREATE POLICY hr_locais_trabalho_select ON public.hr_locais_trabalho
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.locais.view', organization_id))
  );

DROP POLICY IF EXISTS hr_locais_trabalho_insert ON public.hr_locais_trabalho;
CREATE POLICY hr_locais_trabalho_insert ON public.hr_locais_trabalho
  FOR INSERT TO authenticated
  WITH CHECK (
    deleted_at IS NULL
    AND (SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.locais.edit', organization_id))
  );

DROP POLICY IF EXISTS hr_locais_trabalho_update ON public.hr_locais_trabalho;
CREATE POLICY hr_locais_trabalho_update ON public.hr_locais_trabalho
  FOR UPDATE TO authenticated
  USING ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.locais.edit', organization_id)))
  WITH CHECK ((SELECT public.has_anew_permission_in_org((SELECT auth.uid()), 'hr.locais.edit', organization_id)));

DROP POLICY IF EXISTS hr_locais_trabalho_block_delete ON public.hr_locais_trabalho;
CREATE POLICY hr_locais_trabalho_block_delete ON public.hr_locais_trabalho
  AS RESTRICTIVE FOR DELETE TO authenticated USING (false);

COMMENT ON POLICY hr_locais_trabalho_select ON public.hr_locais_trabalho IS
'Ve o catalogo de locais quem tem hr.locais.view NAQUELA organizacao. NAO ha ramo de ficha-propria e nao pode haver: a tabela nao tem pessoa_id. Consequencia deliberada e por decidir: um trabalhador com hr.pessoas.view.own ve o seu horario mas nao ve o NOME do local de cada intervalo. Registado no vault como decisao de produto por tomar -- nao corrigir por iniciativa propria.';

COMMENT ON POLICY hr_locais_trabalho_update ON public.hr_locais_trabalho IS
'O USING nao exige deleted_at IS NULL de proposito: marcar e desmarcar o soft delete sao ambos UPDATE, e nao ter como reverter um apagamento acidental seria pior. Igual ao padrao de pessoas_vinculos.';

COMMENT ON POLICY hr_locais_trabalho_block_delete ON public.hr_locais_trabalho IS
'Nao se apaga um local: um local que ja teve horas registadas contra ele nunca deve desaparecer. Desactiva-se (activo=false) ou marca-se deleted_at, que fica registado.';

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_rls       boolean;
  v_politicas integer;
BEGIN
  IF to_regclass('public.hr_locais_trabalho') IS NULL THEN
    RAISE EXCEPTION 'public.hr_locais_trabalho nao ficou criada.';
  END IF;

  SELECT c.relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'hr_locais_trabalho';

  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'public.hr_locais_trabalho ficou sem RLS activo.';
  END IF;

  SELECT count(*) INTO v_politicas FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'hr_locais_trabalho';

  IF v_politicas <> 4 THEN
    RAISE EXCEPTION
      'Esperavam-se 4 politicas em public.hr_locais_trabalho, encontraram-se %.', v_politicas;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'hr_locais_trabalho'
       AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) LIKE '%get_user_visible_org_ids%'
  ) THEN
    RAISE EXCEPTION
      'Alguma politica de hr_locais_trabalho usa get_user_visible_org_ids. Em RH isso nunca acontece.';
  END IF;

  -- A politica de UPDATE tem de ter USING E WITH CHECK, os dois escritos. Um
  -- UPDATE com WITH CHECK vazio deixa mover a linha para uma organizacao onde
  -- quem escreve nao tem permissao nenhuma.
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'hr_locais_trabalho'
       AND policyname = 'hr_locais_trabalho_update'
       AND (qual IS NULL OR with_check IS NULL)
  ) THEN
    RAISE EXCEPTION
      'A politica de UPDATE de hr_locais_trabalho nao tem USING e WITH CHECK ambos escritos.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'hr_locais_trabalho_id_org_key'
       AND conrelid = to_regclass('public.hr_locais_trabalho')
  ) THEN
    RAISE EXCEPTION
      'A unique hr_locais_trabalho_id_org_key nao ficou criada; as FK compostas dos horarios e de pessoas.local_id dependem dela e 20261120150000 vai falhar.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND indexname = 'idx_hr_locais_trabalho_nome_org'
  ) THEN
    RAISE EXCEPTION
      'O indice unico do nome por organizacao nao ficou criado; sem ele voltam os "Porto" e "porto" duplicados.';
  END IF;

  RAISE NOTICE
    'OK: hr_locais_trabalho criada, RLS activo, 4 politicas, unique (id, organization_id) presente, nome unico por organizacao sem distincao de maiusculas.';
END;
$conferir$;

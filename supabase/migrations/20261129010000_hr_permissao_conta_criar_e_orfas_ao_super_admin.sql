-- ==============================================================================
-- A permissao que faltava para criar o acesso, e as tres permissoes orfas que
-- ninguem tinha -- todas entregues ao papel de super admin.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- Duas coisas, com a mesma raiz: um codigo no catalogo que nao esta em papel
-- nenhum, e um botao escondido atras de um codigo que nem existe.
--
-- 1. O ecra da ficha (src/pages/PessoaDetail.tsx) esconde o botao "Criar
--    acesso" atras de `hr.pessoas.conta.criar`, e esse codigo NAO EXISTE no
--    catalogo. Um PermissionGate sobre um codigo inexistente nunca abre: o
--    botao e invisivel para toda a gente, incluindo o super admin. O codigo
--    parecido que existe -- `hr.pessoas.conta.link` -- e outra coisa: LIGAR
--    uma conta que ja existe a uma ficha. Criar a conta de raiz, atribuir-lhe
--    papel e mandar as credenciais por e-mail e um acto diferente e mais
--    pesado, e merece codigo proprio.
--
-- 2. Tres codigos que existem no catalogo desde 24/11 nunca foram atribuidos a
--    papel nenhum -- nem ao super admin, que tem os outros 67 codigos hr.*:
--
--      hr.pessoas.convite.enviar        (20261124010000)
--      hr.pessoas.sindicalizacao.view   (20261124010000)
--      hr.pessoas.sindicalizacao.edit   (20261124010000)
--
--    Medido ao vivo contra o remoto: 70 codigos `hr.%` no catalogo, 67 no papel
--    de super admin da organizacao nike. O efeito pratico e o esperado -- uma
--    escrita em `pessoas_sindicalizacao` como super admin da nike e recusada
--    pela RLS, e o botao de enviar convite de admissao nunca aparece a ninguem.
--    20261124010000 criou os codigos e, ao contrario de 20261123060000 (que fez
--    o mesmo para os codigos de documentos), nao trouxe a migracao irma que os
--    atribui.
--
--
-- -- A FILIACAO SINDICAL E CATEGORIA ESPECIAL, E CONTINUA A SER ---------------
--
-- `hr.pessoas.sindicalizacao.view/edit` cobrem dado do art. 9.o do RGPD, e foram
-- deliberadamente separados (tabela propria, permissao propria, registo de quem
-- consulta em `pessoas_acessos_sensiveis`). Atribui-los ao super admin CORRIGE
-- UM ESQUECIMENTO -- nao alarga o acesso a mais ninguem. Esta migracao NAO os
-- da, e nao os deve dar migracao nenhuma, a papeis que nao sejam de super
-- admin: RH e chefias continuam a precisar de atribuicao explicita, feita a mao
-- no ecra de Papeis por quem responde pelos dados.
--
--
-- -- COMO SE IDENTIFICA UM PAPEL DE SUPER ADMIN (nao por nome) ----------------
--
-- Pela COLUNA `code` de `anew_roles`, valor `super_admin` -- e nao pelo `name`,
-- que e texto de interface e muda por organizacao.
--
-- Descoberto em `bootstrap_org_creator(uuid, text)`, a funcao que TODAS as RPCs
-- de criacao de organizacao chamam (baseline linha 873; chamada em
-- 20261026010000, 20261027010000, 20261111050000, 20261111060000). Ela faz,
-- por esta ordem:
--
--   SELECT id INTO v_creator_role_id FROM public.anew_roles
--    WHERE code = 'super_admin' AND organization_id IS NULL;   -- auto-registo
--
--   SELECT array_agg(code) INTO v_all_permissions FROM public.anew_permissions;
--   INSERT INTO public.anew_role_permissions (role_id, permission_code, created_by)
--   SELECT v_org_admin_role_id, unnest(v_all_permissions), v_anew_user_id;
--
-- Duas consequencias, e as duas importam a pergunta "e as organizacoes novas?":
--
--   a) o papel de super admin e UNICO e GLOBAL (`organization_id IS NULL`). Um
--      INSERT que case `code = 'super_admin'` apanha-o -- e e o mesmo criterio
--      que 20261123060000 ja usou para os codigos de documentos. Nao ha um
--      super admin por organizacao para manter em dia.
--
--   b) o papel `org_admin` de CADA organizacao nova recebe o catalogo INTEIRO,
--      lido dinamicamente de `anew_permissions` no momento da criacao. Nao ha
--      lista fixa a actualizar: basta o codigo estar no catalogo -- que e o que
--      esta migracao garante para `hr.pessoas.conta.criar` -- para que toda a
--      organizacao criada a partir de agora nasca com ele. O bloco CONFERIR no
--      fim deste ficheiro verifica que esse mecanismo dinamico continua la, e
--      aborta se alguem o tiver trocado por uma lista fixa.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- 1. `hr.pessoas.conta.criar` entra no catalogo: category 'hr', scope
--    'organization', supports_scope false (como todo o resto de hr.*),
--    is_dangerous TRUE -- cria credenciais de entrada na aplicacao e atribui
--    papel; parent_code `hr.pessoas.conta.link`, porque criar a conta implica
--    liga-la.
--
-- 2. Os quatro codigos -- o novo e os tres orfaos -- vao para os papeis com
--    `code = 'super_admin'`. Mais nenhum papel recebe nada.
--
-- `has_anew_permission_in_org` continua a exigir associacao ACTIVA na
-- organizacao: ter o papel nao basta.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito (uma reversao na pasta das
-- migrations e uma reversao aplicada). A mao:
--   ALTER TABLE public.anew_role_permissions DISABLE TRIGGER trg_protect_system_role_perms;
--   DELETE FROM public.anew_role_permissions
--    WHERE permission_code IN ('hr.pessoas.conta.criar','hr.pessoas.convite.enviar',
--                              'hr.pessoas.sindicalizacao.view','hr.pessoas.sindicalizacao.edit')
--      AND role_id IN (SELECT id FROM public.anew_roles WHERE code = 'super_admin');
--   ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;
--   DELETE FROM public.anew_permissions WHERE code = 'hr.pessoas.conta.criar';
--
--
-- Prerequisitos:
--   20261120020000  catalogo hr.* (hr.pessoas.conta.link)
--   20261124010000  catalogo hr.pessoas.convite.enviar e hr.pessoas.sindicalizacao.*
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_orfas   integer;
  v_papeis  integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'anew_permissions_code_unique'
       AND conrelid = to_regclass('public.anew_permissions')
  ) THEN
    RAISE EXCEPTION
      'anew_permissions nao tem a unique em code. O ON CONFLICT (code) desta migracao depende dela.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.conta.link') THEN
    RAISE EXCEPTION
      'hr.pessoas.conta.link nao esta no catalogo -- e o parent_code do codigo novo. Aplicar 20261120020000 primeiro.';
  END IF;

  SELECT count(*) INTO v_orfas
    FROM public.anew_permissions
   WHERE code IN ('hr.pessoas.convite.enviar',
                  'hr.pessoas.sindicalizacao.view',
                  'hr.pessoas.sindicalizacao.edit');

  IF v_orfas <> 3 THEN
    RAISE EXCEPTION
      'Esperavam-se os 3 codigos orfaos no catalogo, encontraram-se %. Aplicar 20261124010000 primeiro.', v_orfas;
  END IF;

  SELECT count(*) INTO v_papeis FROM public.anew_roles WHERE code = 'super_admin';
  IF v_papeis = 0 THEN
    RAISE EXCEPTION 'Nao existe papel nenhum com code = ''super_admin''. Investigar antes de aplicar.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_protect_system_role_perms'
       AND tgrelid = to_regclass('public.anew_role_permissions')
  ) THEN
    RAISE EXCEPTION
      'O trigger trg_protect_system_role_perms nao existe. Esta migracao desactiva-o e reactiva-o; sem ele o estado nao e o esperado.';
  END IF;

  RAISE NOTICE 'Guardas passadas: 3 codigos orfaos no catalogo, % papel(eis) super_admin.', v_papeis;
END;
$guardas$;

-- ---- 1. O codigo novo no catalogo ------------------------------------------
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('hr.pessoas.conta.criar', 'Criar conta de acesso a uma pessoa',
   'Criar de raiz a conta de entrada na aplicacao para uma pessoa, atribuir-lhe o papel escolhido e mandar-lhe as credenciais por e-mail. Diferente de "Ligar/desligar pessoa a conta de utilizador": essa liga uma conta que ja existe, esta cria-a e da acesso. A password nunca e mostrada a quem cria nem devolvida a aplicacao -- sai so no e-mail para a propria pessoa.',
   'hr', 'hr.pessoas.conta.link', 265, true, 'organization', false)
ON CONFLICT (code) DO UPDATE SET
  name           = EXCLUDED.name,
  description    = EXCLUDED.description,
  category       = EXCLUDED.category,
  parent_code    = EXCLUDED.parent_code,
  display_order  = EXCLUDED.display_order,
  is_dangerous   = EXCLUDED.is_dangerous,
  scope          = EXCLUDED.scope,
  supports_scope = EXCLUDED.supports_scope,
  updated_at     = now();

-- ---- 2. Os quatro codigos ao papel de super admin --------------------------
ALTER TABLE public.anew_role_permissions
  DISABLE TRIGGER trg_protect_system_role_perms;

INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, p.code
  FROM public.anew_roles r
 CROSS JOIN public.anew_permissions p
 WHERE r.code = 'super_admin'
   AND p.code IN ('hr.pessoas.conta.criar',
                  'hr.pessoas.convite.enviar',
                  'hr.pessoas.sindicalizacao.view',
                  'hr.pessoas.sindicalizacao.edit')
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions
  ENABLE TRIGGER trg_protect_system_role_perms;

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_codigos  text[] := ARRAY['hr.pessoas.conta.criar',
                             'hr.pessoas.convite.enviar',
                             'hr.pessoas.sindicalizacao.view',
                             'hr.pessoas.sindicalizacao.edit'];
  v_papeis     integer;
  v_falta      text;
  v_activo     boolean;
  v_fora       text;
  v_src        text;
  v_hr_total   integer;
  v_hr_no_sa   integer;
BEGIN
  -- 1. O codigo novo existe e esta pendurado onde devia.
  IF NOT EXISTS (
    SELECT 1 FROM public.anew_permissions
     WHERE code = 'hr.pessoas.conta.criar'
       AND parent_code = 'hr.pessoas.conta.link'
       AND category = 'hr'
       AND is_dangerous
       AND scope = 'organization'
       AND supports_scope = false
  ) THEN
    RAISE EXCEPTION 'hr.pessoas.conta.criar nao ficou no catalogo com a forma esperada.';
  END IF;

  -- 2. TODOS os papeis de super admin ficaram com os quatro codigos.
  SELECT count(*) INTO v_papeis FROM public.anew_roles WHERE code = 'super_admin';

  SELECT string_agg(format('%s@%s', x.code, x.role_id), ', ' ORDER BY x.code)
    INTO v_falta
    FROM (
      SELECT r.id AS role_id, c.code
        FROM public.anew_roles r
       CROSS JOIN unnest(v_codigos) AS c(code)
       WHERE r.code = 'super_admin'
         AND NOT EXISTS (
           SELECT 1 FROM public.anew_role_permissions rp
            WHERE rp.role_id = r.id AND rp.permission_code = c.code
         )
    ) x;

  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Papeis super_admin ficaram sem codigos. Em falta: %', v_falta;
  END IF;

  -- 3. Nenhum outro papel recebeu nada NESTA migracao. Se algum papel que nao e
  --    super admin ja tinha um destes codigos, foi atribuido a mao no ecra de
  --    Papeis -- legitimo, mas convem saber-se. Aviso, nao excepcao.
  SELECT string_agg(DISTINCT r.code, ', ')
    INTO v_fora
    FROM public.anew_role_permissions rp
    JOIN public.anew_roles r ON r.id = rp.role_id
   WHERE rp.permission_code = ANY (v_codigos)
     AND r.code <> 'super_admin';

  IF v_fora IS NOT NULL THEN
    RAISE NOTICE
      'Nota: os codigos desta migracao tambem aparecem nos papeis: %. Nao foram atribuidos aqui (esta migracao so toca em super_admin) -- sao atribuicoes feitas a mao. A filiacao sindical e categoria especial do RGPD: confirmar que sao intencionais.',
      v_fora;
  END IF;

  -- 4. Ja nao sobram codigos hr.* orfaos de super admin.
  SELECT count(*) INTO v_hr_total
    FROM public.anew_permissions WHERE code LIKE 'hr.%';

  SELECT count(*) INTO v_hr_no_sa
    FROM public.anew_permissions p
   WHERE p.code LIKE 'hr.%'
     AND NOT EXISTS (
       SELECT 1 FROM public.anew_role_permissions rp
         JOIN public.anew_roles r ON r.id = rp.role_id
        WHERE r.code = 'super_admin' AND rp.permission_code = p.code
     );

  IF v_hr_no_sa <> 0 THEN
    SELECT string_agg(p.code, ', ' ORDER BY p.code) INTO v_falta
      FROM public.anew_permissions p
     WHERE p.code LIKE 'hr.%'
       AND NOT EXISTS (
         SELECT 1 FROM public.anew_role_permissions rp
           JOIN public.anew_roles r ON r.id = rp.role_id
          WHERE r.code = 'super_admin' AND rp.permission_code = p.code
       );
    RAISE EXCEPTION
      'Ainda ha % codigo(s) hr.* que nenhum papel super_admin tem: %. A regra e que qualquer permissao criada chega ao super admin.',
      v_hr_no_sa, v_falta;
  END IF;

  -- 5. O trigger ficou ligado.
  SELECT tgenabled <> 'D' INTO v_activo
    FROM pg_trigger
   WHERE tgname = 'trg_protect_system_role_perms'
     AND tgrelid = to_regclass('public.anew_role_permissions');

  IF NOT coalesce(v_activo, false) THEN
    RAISE EXCEPTION
      'trg_protect_system_role_perms ficou DESACTIVADO. Reactivar imediatamente: ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;';
  END IF;

  -- 6. As organizacoes NOVAS: bootstrap_org_creator tem de continuar a ler o
  --    catalogo inteiro dinamicamente. Se alguem o trocar por uma lista fixa,
  --    as organizacoes futuras nascem sem os codigos novos -- em silencio.
  SELECT pg_get_functiondef(p.oid) INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'bootstrap_org_creator'
   LIMIT 1;

  IF v_src IS NULL THEN
    RAISE EXCEPTION 'bootstrap_org_creator nao existe -- e por ela que as organizacoes novas recebem as permissoes.';
  END IF;

  IF v_src NOT LIKE '%array_agg(code)%' OR v_src NOT LIKE '%public.anew_permissions%' THEN
    RAISE EXCEPTION
      'bootstrap_org_creator ja nao le o catalogo inteiro de anew_permissions. As organizacoes novas deixariam de nascer com os codigos novos -- corrigir antes de continuar.';
  END IF;

  IF v_src NOT LIKE '%code = ''super_admin''%' THEN
    RAISE EXCEPTION
      'bootstrap_org_creator ja nao identifica o papel de super admin por code = ''super_admin'' -- o criterio desta migracao deixou de valer.';
  END IF;

  RAISE NOTICE
    'OK: hr.pessoas.conta.criar no catalogo, 4 codigos entregues a % papel(eis) super_admin, 0 de % codigos hr.* orfaos, e bootstrap_org_creator continua a dar o catalogo inteiro as organizacoes novas.',
    v_papeis, v_hr_total;
END;
$conferir$;

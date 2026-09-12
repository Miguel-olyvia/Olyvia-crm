-- ==============================================================================
-- Catalogo: as 7 permissoes novas da fundacao do percurso do colaborador
-- (afectacoes, horas contratadas versionadas, colocacao no organograma), todas
-- entregues ao papel de super admin. No molde de 20261129010000.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- As migracoes seguintes desta ronda criam pessoas_afectacoes,
-- pessoas_vinculos_horas e pessoas_colocacao_organograma, e as suas politicas
-- RLS referem sete codigos que ainda nao existem no catalogo. Uma politica com
-- um codigo ausente do catalogo nao rebenta: devolve false para todos, sempre,
-- e a tabela fica invisivel para todo o mundo -- super_admin incluido -- sem
-- nenhum erro a dizer porque. Este catalogo tem de ir a frente das tabelas.
--
--
-- -- A REGRA NOVA: ALTERACAO != CORRECCAO, EM PERMISSOES SEPARADAS ------------
--
-- Cada uma das tres novas fronteiras versionadas ganha DUAS autoridades
-- distintas, nunca uma so:
--
--   .edit      ALTERACAO: fechar a versao em vigor e abrir outra "daqui para a
--              frente". E o caminho normal do dia-a-dia.
--   .corrigir  CORRECCAO: mexer num periodo JA DECORRIDO (valido_ate no
--              passado). PERIGOSA -- reescreve o que ficou registado sobre um
--              periodo que ja aconteceu, com efeito sobre assiduidade e sobre a
--              colocacao com que a pessoa foi vista num dado momento.
--
-- Sem esta separacao, quem so devia poder alterar "a partir de hoje" passa a
-- poder reescrever tambem o passado, porque e menos cliques -- e e exactamente
-- o erro que o pedido desta ronda pede para evitar.
--
-- pessoas_vinculos_horas REAPROVEITA hr.pessoas.vinculos.edit para a alteracao
-- (e a mesma autoridade que ja edita o vinculo em si) e ganha SO a permissao de
-- correccao nova -- nao se duplica a autoridade de alterar.
--
--
-- -- OS SETE CODIGOS ------------------------------------------------------------
--
--   hr.pessoas.afectacoes.view              (700)
--   hr.pessoas.afectacoes.edit               (710)  alteracao
--   hr.pessoas.afectacoes.corrigir            (720)  correccao, perigosa
--   hr.pessoas.vinculos.horas.corrigir        (730)  correccao, perigosa
--   hr.pessoas.colocacao.view                (740)
--   hr.pessoas.colocacao.edit                 (750)  alteracao
--   hr.pessoas.colocacao.corrigir             (760)  correccao, perigosa
--
-- Todos category='hr', scope='organization', supports_scope=false. Nenhum
-- atribuido a papel nenhum ALEM do super_admin.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao, e SO depois de
-- reverter as tabelas desta ronda:
--   ALTER TABLE public.anew_role_permissions DISABLE TRIGGER trg_protect_system_role_perms;
--   DELETE FROM public.anew_role_permissions
--    WHERE permission_code IN ('hr.pessoas.afectacoes.view','hr.pessoas.afectacoes.edit',
--                              'hr.pessoas.afectacoes.corrigir','hr.pessoas.vinculos.horas.corrigir',
--                              'hr.pessoas.colocacao.view','hr.pessoas.colocacao.edit',
--                              'hr.pessoas.colocacao.corrigir')
--      AND role_id IN (SELECT id FROM public.anew_roles WHERE code = 'super_admin');
--   ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;
--   DELETE FROM public.anew_permissions
--    WHERE code IN ('hr.pessoas.afectacoes.view','hr.pessoas.afectacoes.edit',
--                   'hr.pessoas.afectacoes.corrigir','hr.pessoas.vinculos.horas.corrigir',
--                   'hr.pessoas.colocacao.view','hr.pessoas.colocacao.edit',
--                   'hr.pessoas.colocacao.corrigir');
--
--
-- Prerequisitos:
--   20261120020000  catalogo hr.* (hr.pessoas.vinculos.view/.edit)
--   20261120120000  catalogo hr.locais.view/.edit
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_papeis integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'anew_permissions_code_unique'
       AND conrelid = to_regclass('public.anew_permissions')
  ) THEN
    RAISE EXCEPTION 'anew_permissions nao tem a unique em code. O ON CONFLICT (code) depende dela.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.vinculos.view') THEN
    RAISE EXCEPTION 'hr.pessoas.vinculos.view nao esta no catalogo. Aplicar 20261120020000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.vinculos.edit') THEN
    RAISE EXCEPTION
      'hr.pessoas.vinculos.edit nao esta no catalogo -- e reaproveitada como alteracao das horas contratadas versionadas.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.locais.view') THEN
    RAISE EXCEPTION 'hr.locais.view nao esta no catalogo. Aplicar 20261120120000 primeiro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'trg_protect_system_role_perms'
       AND tgrelid = to_regclass('public.anew_role_permissions')
  ) THEN
    RAISE EXCEPTION 'O trigger trg_protect_system_role_perms nao existe. Estado da base inesperado.';
  END IF;

  SELECT count(*) INTO v_papeis FROM public.anew_roles WHERE code = 'super_admin';
  IF v_papeis = 0 THEN
    RAISE EXCEPTION 'Nao existe papel nenhum com code = ''super_admin''. Investigar antes de aplicar.';
  END IF;

  RAISE NOTICE 'Guardas passadas: % papel(eis) super_admin.', v_papeis;
END;
$guardas$;

-- ---- Os sete codigos novos --------------------------------------------------
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('hr.pessoas.afectacoes.view', 'Ver onde a pessoa trabalha',
   'Ver o historico e o estado actual de a que centro(s) a pessoa esta afecta -- nao inclui horas, que se calculam do horario.',
   'hr', 'hr.pessoas.vinculos.view', 700, false, 'organization', false),

  ('hr.pessoas.afectacoes.edit', 'Alterar onde a pessoa trabalha',
   'ALTERACAO: fechar a afectacao em vigor a um centro e abrir outra, daqui para a frente. Nao permite mexer num periodo ja decorrido -- isso e hr.pessoas.afectacoes.corrigir.',
   'hr', 'hr.pessoas.afectacoes.view', 710, false, 'organization', false),

  ('hr.pessoas.afectacoes.corrigir', 'Corrigir onde a pessoa trabalhou',
   'PERIGOSA. CORRECCAO: mexer numa afectacao cujo periodo ja decorreu -- "o que registamos para Marco estava errado". Deixa rasto (quem, quando, o que la estava). Separada de afectacoes.edit porque alterar o futuro e reescrever o passado sao autoridades diferentes.',
   'hr', 'hr.pessoas.afectacoes.edit', 720, true, 'organization', false),

  ('hr.pessoas.vinculos.horas.corrigir', 'Corrigir horas contratadas passadas',
   'PERIGOSA. CORRECCAO: mexer numa versao de horas contratadas cujo periodo ja decorreu. A ALTERACAO (abrir uma versao nova a partir de hoje) continua a usar hr.pessoas.vinculos.edit -- nao se duplica essa autoridade aqui.',
   'hr', 'hr.pessoas.vinculos.edit', 730, true, 'organization', false),

  ('hr.pessoas.colocacao.view', 'Ver a filial/estrutura da pessoa',
   'Ver a que no do organograma a pessoa esta colocada, e o historico dessa colocacao.',
   'hr', 'hr.pessoas.vinculos.view', 740, false, 'organization', false),

  ('hr.pessoas.colocacao.edit', 'Alterar a filial/estrutura da pessoa',
   'ALTERACAO: fechar a colocacao em vigor e abrir outra, daqui para a frente. Nao permite mexer num periodo ja decorrido -- isso e hr.pessoas.colocacao.corrigir. A classificacao no organograma nunca limita a que centros a pessoa pode ser afecta.',
   'hr', 'hr.pessoas.colocacao.view', 750, false, 'organization', false),

  ('hr.pessoas.colocacao.corrigir', 'Corrigir a filial/estrutura passada da pessoa',
   'PERIGOSA. CORRECCAO: mexer numa colocacao no organograma cujo periodo ja decorreu.',
   'hr', 'hr.pessoas.colocacao.edit', 760, true, 'organization', false)

ON CONFLICT (code) DO NOTHING;

-- ---- Todos os sete, ao papel de super admin ---------------------------------
ALTER TABLE public.anew_role_permissions
  DISABLE TRIGGER trg_protect_system_role_perms;

INSERT INTO public.anew_role_permissions (role_id, permission_code)
SELECT r.id, p.code
  FROM public.anew_roles r
 CROSS JOIN public.anew_permissions p
 WHERE r.code = 'super_admin'
   AND p.code IN ('hr.pessoas.afectacoes.view',
                  'hr.pessoas.afectacoes.edit',
                  'hr.pessoas.afectacoes.corrigir',
                  'hr.pessoas.vinculos.horas.corrigir',
                  'hr.pessoas.colocacao.view',
                  'hr.pessoas.colocacao.edit',
                  'hr.pessoas.colocacao.corrigir')
ON CONFLICT (role_id, permission_code) DO NOTHING;

ALTER TABLE public.anew_role_permissions
  ENABLE TRIGGER trg_protect_system_role_perms;

-- ---- Conferir ----------------------------------------------------------------
DO $conferir$
DECLARE
  v_codigos text[] := ARRAY[
    'hr.pessoas.afectacoes.view','hr.pessoas.afectacoes.edit','hr.pessoas.afectacoes.corrigir',
    'hr.pessoas.vinculos.horas.corrigir',
    'hr.pessoas.colocacao.view','hr.pessoas.colocacao.edit','hr.pessoas.colocacao.corrigir'
  ];
  v_novas  integer;
  v_falta  text;
  v_perigo integer;
  v_papeis integer;
  v_ativo  boolean;
BEGIN
  SELECT count(DISTINCT code) INTO v_novas FROM public.anew_permissions WHERE code = ANY (v_codigos);
  IF v_novas <> 7 THEN
    SELECT string_agg(c, ', ' ORDER BY c) INTO v_falta
      FROM unnest(v_codigos) AS c WHERE NOT EXISTS (SELECT 1 FROM public.anew_permissions p WHERE p.code = c);
    RAISE EXCEPTION 'Esperavam-se 7 codigos novos, encontraram-se %. Em falta: %', v_novas, coalesce(v_falta, '(nenhum)');
  END IF;

  SELECT count(*) INTO v_perigo FROM public.anew_permissions WHERE code = ANY (v_codigos) AND is_dangerous;
  IF v_perigo <> 3 THEN
    RAISE EXCEPTION 'Esperavam-se 3 codigos perigosos (os tres .corrigir), encontraram-se %.', v_perigo;
  END IF;

  SELECT count(*) INTO v_papeis FROM public.anew_roles WHERE code = 'super_admin';

  SELECT string_agg(format('%s@%s', x.code, x.role_id), ', ' ORDER BY x.code) INTO v_falta
    FROM (
      SELECT r.id AS role_id, c.code
        FROM public.anew_roles r CROSS JOIN unnest(v_codigos) AS c(code)
       WHERE r.code = 'super_admin'
         AND NOT EXISTS (
           SELECT 1 FROM public.anew_role_permissions rp
            WHERE rp.role_id = r.id AND rp.permission_code = c.code
         )
    ) x;

  IF v_falta IS NOT NULL THEN
    RAISE EXCEPTION 'Papeis super_admin ficaram sem codigos. Em falta: %', v_falta;
  END IF;

  SELECT tgenabled <> 'D' INTO v_ativo
    FROM pg_trigger
   WHERE tgname = 'trg_protect_system_role_perms' AND tgrelid = to_regclass('public.anew_role_permissions');
  IF NOT coalesce(v_ativo, false) THEN
    RAISE EXCEPTION 'trg_protect_system_role_perms ficou DESACTIVADO. Reactivar imediatamente.';
  END IF;

  RAISE NOTICE 'OK: 7 codigos novos no catalogo (3 perigosos), entregues a % papel(eis) super_admin.', v_papeis;
END;
$conferir$;

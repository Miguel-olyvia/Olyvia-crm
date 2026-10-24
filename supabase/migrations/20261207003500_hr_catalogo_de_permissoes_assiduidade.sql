-- ==============================================================================
-- Catalogo: as 14 permissoes novas de assiduidade e picagens.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- A ronda 4 acrescenta picagens, faltas e justificacoes de falta, e as
-- politicas RLS dessas tabelas referem codigos que nao existem no catalogo.
-- Uma politica com um codigo ausente do catalogo nao rebenta: devolve false
-- para todos, sempre, e a tabela fica invisivel para todo o mundo -- super_admin
-- incluido -- sem nenhum erro a dizer porque.
--
-- E ha um problema anterior a esta ronda: hoje o UNICO caminho de escrita nas
-- horas exige hr.pessoas.horario_realizado.edit, que e permissao de RH e serve
-- para escrever as horas de QUALQUER pessoa. Dar isso a quem so precisa de
-- picar o proprio cartao e desproporcionado -- e e a razao de hr.assiduidade.picar
-- existir.
--
--
-- -- A REGRA NOVA --------------------------------------------------------------
--
-- Catorze codigos, category='hr', scope='organization', supports_scope=false,
-- display_order 480 a 610 (a seguir aos 470 da ronda de ausencias).
--
-- Tres notas de desenho:
--
-- 1. hr.assiduidade.corrigir e separada de hr.assiduidade.gerir. Marcar uma
--    falta e reescrever o passado com efeito legal a cinco anos sao autoridades
--    diferentes.
--
-- 2. hr.assiduidade.equipa.view existe porque a chefia precisa de ver a
--    assiduidade da equipa e nao a da organizacao. Sem ela, ou se dava
--    hr.assiduidade.view (a organizacao toda) ou nada.
--
-- 3. hr.pessoas.horario_realizado.validar, da ronda 2, e REAPROVEITADA e passa
--    finalmente a ser verificada (20261121240000). NAO se cria
--    hr.assiduidade.validar ao lado: era exactamente a duplicacao de autoridade
--    que este repositorio ja registou como erro.
--
--
-- -- O QUE FICA DE FORA --------------------------------------------------------
--
-- - Nao se atribui permissao nenhuma a papel nenhum.
-- - Nao se cria nem altera objecto de schema nenhum. So dados.
-- - ON CONFLICT (code) DO NOTHING, nao DO UPDATE.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao, e SO depois de
-- apagar as tabelas da ronda 4:
--   ALTER TABLE public.anew_role_permissions DISABLE TRIGGER trg_protect_system_role_perms;
--   DELETE FROM public.anew_role_permissions WHERE permission_code LIKE 'hr.assiduidade.%';
--   ALTER TABLE public.anew_role_permissions ENABLE TRIGGER trg_protect_system_role_perms;
--   DELETE FROM public.anew_permissions WHERE code LIKE 'hr.assiduidade.%';
--
--
-- Prerequisitos:
--   20261120010000  has_anew_permission_in_org(uuid, text, uuid)
--   20261120020000  hr.module.access no catalogo
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_hr integer;
BEGIN
  IF to_regclass('public.anew_permissions') IS NULL THEN
    RAISE EXCEPTION 'public.anew_permissions nao existe. Estado da base inesperado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'anew_permissions_code_unique'
       AND conrelid = to_regclass('public.anew_permissions')
  ) THEN
    RAISE EXCEPTION 'anew_permissions nao tem a unique em code; o ON CONFLICT depende dela.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.module.access') THEN
    RAISE EXCEPTION 'hr.module.access nao esta no catalogo. Aplicar 20261120020000 primeiro.';
  END IF;

  -- A permissao da ronda 2 que esta ronda REAPROVEITA em vez de duplicar.
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.horario_realizado.validar') THEN
    RAISE EXCEPTION
      'hr.pessoas.horario_realizado.validar nao esta no catalogo. Aplicar 20261120120000 primeiro: 20261121240000 passa a verifica-la, e nao se cria uma permissao de validar ao lado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'has_anew_permission_in_org' AND p.pronargs = 3
  ) THEN
    RAISE EXCEPTION 'has_anew_permission_in_org(uuid, text, uuid) nao existe. Aplicar 20261120010000.';
  END IF;

  SELECT count(DISTINCT code) INTO v_hr FROM public.anew_permissions WHERE code LIKE 'hr.%';
  RAISE NOTICE 'Guardas passadas: % codigos hr.* distintos antes desta migracao.', v_hr;
END;
$guardas$;

-- ---- Os catorze codigos novos ----------------------------------------------
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('hr.assiduidade.view', 'Ver assiduidade',
   'Ver as picagens, as horas realizadas e as faltas de toda a organizacao. Nao da acesso a justificacao de falta, que tem permissao propria.',
   'hr', 'hr.module.access', 480, false, 'organization', false),

  ('hr.assiduidade.view.own', 'Ver a sua assiduidade',
   'Ver as suas proprias picagens, horas e faltas. Nao mostra as de mais ninguem.',
   'hr', 'hr.module.access', 490, false, 'organization', false),

  ('hr.assiduidade.equipa.view', 'Ver a assiduidade da equipa',
   'Ver as picagens, horas e faltas de quem esta na sua cadeia de chefia -- toda a cadeia abaixo, nao so o salto directo. Nao da a organizacao toda.',
   'hr', 'hr.assiduidade.view', 500, false, 'organization', false),

  ('hr.assiduidade.picar', 'Picar o ponto',
   'Registar as suas proprias entradas e saidas. E a permissao que faltava: ate agora o unico caminho de escrita nas horas exigia hr.pessoas.horario_realizado.edit, que serve para escrever as horas de qualquer pessoa e e desproporcionado para quem so precisa de picar o proprio cartao.',
   'hr', 'hr.assiduidade.view.own', 510, false, 'organization', false),

  ('hr.assiduidade.picar.outros', 'Picar por outra pessoa',
   'Registar entradas e saidas na ficha de outra pessoa -- o caso do quiosque partilhado e do registo em papel transcrito.',
   'hr', 'hr.assiduidade.view', 520, false, 'organization', false),

  ('hr.assiduidade.gerir', 'Gerir assiduidade',
   'Consolidar dias, marcar faltas, e despachar a fila de desvios entre planeado e realizado. Nao permite reescrever o passado -- isso e hr.assiduidade.corrigir.',
   'hr', 'hr.assiduidade.view', 530, false, 'organization', false),

  ('hr.assiduidade.corrigir', 'Corrigir picagens e horas',
   'PERIGOSA. Corrigir picagens, horas realizadas e faltas ja registadas, por linha nova que substitui a errada. O registo de tempo de trabalho tem de ficar disponivel cinco anos: nada se apaga, e cada correccao fica com autor e motivo. Separada de gerir porque marcar uma falta e reescrever o passado com efeito legal sao autoridades diferentes.',
   'hr', 'hr.assiduidade.gerir', 540, true, 'organization', false),

  ('hr.assiduidade.faltas.view', 'Ver faltas',
   'Ver as faltas registadas, com o periodo em falta, o motivo e o estado de justificacao. NAO revela o documento justificativo.',
   'hr', 'hr.assiduidade.view', 550, false, 'organization', false),

  ('hr.assiduidade.faltas.edit', 'Marcar e alterar faltas',
   'Marcar faltas e alterar o seu motivo e regime. A falta e sempre MARCADA por decisao humana: a base propoe desvios entre planeado e realizado, e nunca os converte em faltas sozinha.',
   'hr', 'hr.assiduidade.faltas.view', 560, false, 'organization', false),

  ('hr.assiduidade.justificacao.view', 'Ler a justificacao da falta',
   'PERIGOSA. Revela o documento justificativo da falta e o seu texto -- atestados, declaracoes medicas, diagnosticos. Dado de saude: cada revelacao fica registada em pessoas_acessos_sensiveis, como no NISS e no IBAN. Quem ve a falta para a despachar NAO precisa disto e nao o ve.',
   'hr', 'hr.assiduidade.faltas.view', 570, true, 'organization', false),

  ('hr.assiduidade.justificacao.edit', 'Registar e decidir justificacoes',
   'Registar documentos justificativos e decidir se a falta fica justificada ou recusada. Recusar exige motivo escrito.',
   'hr', 'hr.assiduidade.faltas.edit', 580, false, 'organization', false),

  ('hr.assiduidade.dispositivos.view', 'Ver dispositivos de picagem',
   'Ver o catalogo de dispositivos de picagem da organizacao: quiosques, leitores, relogios de ponto.',
   'hr', 'hr.assiduidade.view', 590, false, 'organization', false),

  ('hr.assiduidade.dispositivos.edit', 'Editar dispositivos de picagem',
   'Registar, alterar e desactivar dispositivos de picagem, e rodar a chave de registo de cada um.',
   'hr', 'hr.assiduidade.dispositivos.view', 600, false, 'organization', false),

  ('hr.assiduidade.importar', 'Importar picagens',
   'PERIGOSA. Importar picagens de um relogio de ponto ou de um ficheiro em bloco. Escreve horas que sustentam pagamentos, sem que ninguem as tenha confirmado uma a uma; a idempotencia depende da referencia externa do dispositivo estar correcta.',
   'hr', 'hr.assiduidade.gerir', 610, true, 'organization', false)

ON CONFLICT (code) DO NOTHING;

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_novas  integer;
  v_falta  text;
  v_orfaos text;
  v_perigo integer;
  v_novos  text[] := ARRAY[
    'hr.assiduidade.view',
    'hr.assiduidade.view.own',
    'hr.assiduidade.equipa.view',
    'hr.assiduidade.picar',
    'hr.assiduidade.picar.outros',
    'hr.assiduidade.gerir',
    'hr.assiduidade.corrigir',
    'hr.assiduidade.faltas.view',
    'hr.assiduidade.faltas.edit',
    'hr.assiduidade.justificacao.view',
    'hr.assiduidade.justificacao.edit',
    'hr.assiduidade.dispositivos.view',
    'hr.assiduidade.dispositivos.edit',
    'hr.assiduidade.importar'
  ];
BEGIN
  -- CODIGOS DISTINTOS, nunca linhas.
  SELECT count(DISTINCT code) INTO v_novas
    FROM public.anew_permissions WHERE code = ANY (v_novos);

  IF v_novas <> 14 THEN
    SELECT string_agg(c, ', ' ORDER BY c) INTO v_falta
      FROM unnest(v_novos) AS c
     WHERE NOT EXISTS (SELECT 1 FROM public.anew_permissions p WHERE p.code = c);
    RAISE EXCEPTION 'Esperavam-se os 14 codigos novos, encontraram-se %. Em falta: %',
      v_novas, coalesce(v_falta, '(nenhum identificado)');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.anew_permissions
     WHERE code = ANY (v_novos)
       AND (coalesce(category,'') <> 'hr'
            OR coalesce(scope,'') <> 'organization'
            OR coalesce(supports_scope, true) <> false)
  ) THEN
    RAISE EXCEPTION
      'Algum dos 14 codigos novos nao esta em category=hr / scope=organization / supports_scope=false.';
  END IF;

  SELECT string_agg(p.code || ' -> ' || p.parent_code, ', ' ORDER BY p.code)
    INTO v_orfaos
    FROM public.anew_permissions p
   WHERE p.code = ANY (v_novos) AND p.parent_code IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.anew_permissions q WHERE q.code = p.parent_code);

  IF v_orfaos IS NOT NULL THEN
    RAISE EXCEPTION 'Codigos com parent_code inexistente: %', v_orfaos;
  END IF;

  SELECT count(DISTINCT code) INTO v_perigo
    FROM public.anew_permissions WHERE code = ANY (v_novos) AND is_dangerous = true;

  IF v_perigo <> 3 THEN
    RAISE EXCEPTION
      'Esperavam-se 3 perigosas (corrigir, justificacao.view, importar), encontraram-se %.', v_perigo;
  END IF;

  IF EXISTS (SELECT 1 FROM public.anew_role_permissions WHERE permission_code = ANY (v_novos)) THEN
    RAISE EXCEPTION
      'Algum dos 14 codigos novos ja esta atribuido a um papel. Esta migracao nao atribui permissoes.';
  END IF;

  -- E o codigo que NAO se devia ter criado: se aparecer, alguem duplicou a
  -- autoridade de validar em vez de reaproveitar a da ronda 2.
  IF EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.assiduidade.validar') THEN
    RAISE EXCEPTION
      'Existe hr.assiduidade.validar no catalogo. A autoridade de validar horas e hr.pessoas.horario_realizado.validar, da ronda 2, e e reaproveitada -- nao se cria uma segunda ao lado.';
  END IF;

  RAISE NOTICE 'Conferido: 14 codigos de assiduidade, 3 perigosos, nenhum atribuido a papel.';
END;
$conferir$;

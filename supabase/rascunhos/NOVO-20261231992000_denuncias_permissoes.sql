-- ==============================================================================
-- 20261231992000_denuncias_permissoes  (RASCUNHO -- nao aplicar sem decisao)
-- ==============================================================================
-- Base: RH (uetjghdkwbywbftedtth). Desenho: supabase/rascunhos/DESENHO-denuncias.md.
--
-- O que faz (so catalogo; nenhuma tabela, funcao nem papel e alterado)
--   Cria no catalogo anew_permissions as duas permissoes do canal de denuncias,
--   categoria 'denuncias', ambito de organizacao, sem ambito por centro:
--     denuncias.gerir      -- rota /rh-exemplo/denuncias, menu e contador; e a
--                             condicao NECESSARIA (nao suficiente) para tratar
--                             casos: tambem e preciso estar designado em
--                             denuncias_responsaveis (20261231993000).
--     denuncias.configurar -- designar e remover responsaveis, ligar o canal e
--                             escolher o endereco publico; retirar um
--                             impedimento 'visado' registado por um responsavel.
--   AMBAS is_dangerous = true (revisao de 28/10, achado HIGH de escalada de
--   privilegios): quem edita papeis e se da estas duas permissoes passa a poder
--   designar-se responsavel; o ecra de perfis tem de as mostrar como perigosas.
--   NAO se atribuem a nenhum papel, nem ao super_admin: dar acesso aos casos e
--   um acto consciente por organizacao (passo 5 do desenho, depois do push).
--   Nao ha permissao para ver a identidade nem para exportar: fa-lo o
--   responsavel do caso, com motivo e registo.
--
-- Codigo que tem de entrar com esta migration: nenhum (sem efeito visivel).
--   A troca da rota e do menu de users.view para denuncias.gerir entra com o
--   cliente (passo 4 do desenho), NUNCA antes de alguem ter a permissao.
--
-- Ordem de publicacao: 20261231992000 (esta) -> 20261231993000 (tabelas) ->
--   20261231994000 (RPCs) -> Edge canal-denuncias -> cliente.
--   A ultima aplicada no remoto e 20261231990000; 20261231991000 (prazo da
--   justificacao) e outro rascunho, independente deste.
--
-- Sem BEGIN/COMMIT proprio: corre dentro da transaccao do db push (e dentro do
--   BEGIN ... ROLLBACK do TESTE-denuncias.sql).
-- Idempotente: ON CONFLICT DO NOTHING; a guarda recusa uma definicao diferente.
-- Reversao (so como migration nova, e so sem papeis que as tenham):
--   DELETE FROM anew_permissions WHERE code IN ('denuncias.gerir','denuncias.configurar').
-- ==============================================================================

SET LOCAL lock_timeout = '3s';

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
DECLARE
  v_n integer;
BEGIN
  IF to_regclass('public.anew_permissions') IS NULL THEN
    RAISE EXCEPTION 'public.anew_permissions nao existe: estado da base inesperado.';
  END IF;

  SELECT count(*) INTO v_n FROM pg_attribute
   WHERE attrelid = to_regclass('public.anew_permissions')
     AND attname IN ('code', 'name', 'description', 'category', 'parent_code', 'display_order',
                     'is_dangerous', 'scope', 'supports_scope')
     AND NOT attisdropped;
  IF v_n <> 9 THEN
    RAISE EXCEPTION 'anew_permissions nao tem as 9 colunas esperadas (encontradas %).', v_n;
  END IF;

  -- Outra permissao de denuncias, com outro codigo, seria um desenho paralelo.
  SELECT count(*) INTO v_n FROM public.anew_permissions p
   WHERE p.code ILIKE '%denunc%' AND p.code NOT IN ('denuncias.gerir', 'denuncias.configurar');
  IF v_n > 0 THEN
    RAISE EXCEPTION 'Ja existem % permissao(oes) de denuncias com outro codigo. Investigar.', v_n;
  END IF;

  -- Se ja existem (reaplicacao), tem de ser estas e perigosas.
  IF EXISTS (SELECT 1 FROM public.anew_permissions p
              WHERE p.code IN ('denuncias.gerir', 'denuncias.configurar')
                AND (p.is_dangerous IS DISTINCT FROM true OR p.category IS DISTINCT FROM 'denuncias')) THEN
    RAISE EXCEPTION 'denuncias.gerir/configurar ja existem com outra definicao (categoria ou is_dangerous).';
  END IF;
END;
$guardas$;

-- ---- Catalogo --------------------------------------------------------------
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('denuncias.gerir',
   'Tratar denúncias',
   'Abre a gestão do canal de denúncias. Só dá acesso aos casos a quem também estiver designado como responsável do canal nesta organização; ter esta permissão sozinha não mostra nenhuma denúncia. Quem é visado ou declarou conflito num caso deixa de o ver.',
   'denuncias', NULL, 0, true, 'organization', false),
  ('denuncias.configurar',
   'Configurar o canal de denúncias',
   'Designar e remover os responsáveis do canal, ligar e desligar o canal e escolher o endereço público. Cada alteração fica registada e é visível a todos os responsáveis. Não dá acesso ao conteúdo das denúncias.',
   'denuncias', NULL, 1, true, 'organization', false)
ON CONFLICT (code) DO NOTHING;

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_n integer;
BEGIN
  SELECT count(*) INTO v_n FROM public.anew_permissions p
   WHERE p.code IN ('denuncias.gerir', 'denuncias.configurar')
     AND p.is_dangerous = true
     AND p.category = 'denuncias'
     AND p.scope = 'organization'
     AND p.supports_scope = false;
  IF v_n <> 2 THEN
    RAISE EXCEPTION 'CONFERIR: esperadas 2 permissoes de denuncias perigosas de organizacao, encontradas %.', v_n;
  END IF;

  -- Nenhum papel as recebeu (nem por outra migration no mesmo push).
  SELECT count(*) INTO v_n FROM public.anew_role_permissions rp
   WHERE rp.permission_code IN ('denuncias.gerir', 'denuncias.configurar');
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'CONFERIR: % papel(eis) ja tem permissoes de denuncias; a atribuicao e um passo a parte.', v_n;
  END IF;

  RAISE NOTICE 'Conferido: denuncias.gerir e denuncias.configurar no catalogo, perigosas, sem papeis.';
END;
$conferir$;

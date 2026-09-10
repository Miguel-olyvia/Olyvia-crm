-- ==============================================================================
-- Catalogo de permissoes de Documentos e Contratos (RH): 8 codigos novos.
--
-- POR APLICAR.
--
--
-- -- O PROBLEMA ----------------------------------------------------------------
--
-- As tabelas e RPCs de 20261123020000 em diante vao pedir codigos como
-- 'hr.pessoas.documentos.view' a has_anew_permission_in_org. Se o codigo nao
-- existir em anew_permissions primeiro, a interface de papeis nao o mostra e
-- ninguem o consegue atribuir -- as tabelas ficam invisiveis para toda a
-- gente, sem explicacao, tal como aconteceu com hr.pessoas.* antes de
-- 20261120100000.
--
--
-- -- OS OITO CODIGOS -------------------------------------------------------------
--
--   hr.pessoas.documentos.view          ver documentos de qualquer pessoa
--   hr.pessoas.documentos.view.own      ver os proprios documentos
--   hr.pessoas.documentos.edit          criar/anular documentos (nao editar conteudo assinado)
--   hr.pessoas.documentos.emitir        emitir documento a partir de um modelo
--   hr.pessoas.documentos.anular        anular um documento
--   hr.pessoas.documentos.conteudo.view ver o CORPO (corpo_html) de qualquer documento
--   hr.pessoas.documentos.modelos.view  ver modelos de documento
--   hr.pessoas.documentos.modelos.edit  criar/editar modelos de documento
--
-- is_dangerous=true em conteudo.view (da acesso ao corpo, que pode conter
-- salario e dados de saude) e em emitir/anular (accoes com efeito juridico).
-- view.own e o padrao ja usado em hr.pessoas.view.own: nao dangerous, porque
-- so da acesso ao proprio.
--
--
-- -- COMO SE REVERTE -----------------------------------------------------------
--
-- Sem ficheiro de reversao nesta pasta, de proposito. A mao:
--   DELETE FROM public.anew_permissions WHERE code LIKE 'hr.pessoas.documentos%';
-- So depois de confirmar que nenhuma tabela ou RPC ainda referencia estes
-- codigos (20261123030000 em diante).
--
--
-- Prerequisitos:
--   20261120020000  catalogo hr.* (parent_code 'hr.pessoas.view')
-- ==============================================================================

-- ---- Guardas ---------------------------------------------------------------
DO $guardas$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.view') THEN
    RAISE EXCEPTION 'hr.pessoas.view nao esta no catalogo. Aplicar 20261120020000 primeiro.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.anew_permissions WHERE code = 'hr.pessoas.vinculos.view') THEN
    RAISE EXCEPTION 'hr.pessoas.vinculos.view nao esta no catalogo. Aplicar 20261120020000 primeiro.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.anew_permissions WHERE code LIKE 'hr.pessoas.documentos%') THEN
    RAISE NOTICE 'Ja existem codigos hr.pessoas.documentos%%; esta migracao actualiza-os (ON CONFLICT DO UPDATE).';
  END IF;
END;
$guardas$;

-- ---- Os oito codigos --------------------------------------------------------
INSERT INTO public.anew_permissions
  (code, name, description, category, parent_code, display_order, is_dangerous, scope, supports_scope)
VALUES
  ('hr.pessoas.documentos.view', 'Ver documentos de RH',
   'Ver a lista e os metadados dos documentos (contratos, adendas, declaracoes) de qualquer pessoa da organizacao. Nao da acesso ao corpo do documento, que tem permissao propria.',
   'hr', 'hr.pessoas.view', 620, false, 'organization', false),

  ('hr.pessoas.documentos.view.own', 'Ver os proprios documentos',
   'Ver a lista, os metadados e assinar os proprios documentos, quando a conta esta ligada a uma pessoa. Nao da acesso aos documentos de terceiros.',
   'hr', 'hr.pessoas.view', 630, false, 'organization', false),

  ('hr.pessoas.documentos.edit', 'Editar documentos de RH',
   'Criar rascunhos de documento e alterar metadados antes de assinados. Uma vez assinado, um documento e imutavel.',
   'hr', 'hr.pessoas.documentos.view', 640, false, 'organization', false),

  ('hr.pessoas.documentos.emitir', 'Emitir documentos a partir de modelo',
   'Emitir um documento (contrato, adenda, declaracao) a uma ou a varias pessoas a partir de um modelo.',
   'hr', 'hr.pessoas.documentos.edit', 650, true, 'organization', false),

  ('hr.pessoas.documentos.anular', 'Anular documentos',
   'Marcar um documento emitido como anulado. Nao apaga o registo.',
   'hr', 'hr.pessoas.documentos.edit', 660, true, 'organization', false),

  ('hr.pessoas.documentos.conteudo.view', 'Ver o conteudo do documento',
   'Ver o corpo (texto) de qualquer documento -- pode conter retribuicao, dados de saude ou outros dados sensiveis. Distinta de hr.pessoas.documentos.view, que so mostra metadados. Cada leitura fica registada em pessoas_acessos_sensiveis.',
   'hr', 'hr.pessoas.documentos.view', 670, true, 'organization', false),

  ('hr.pessoas.documentos.modelos.view', 'Ver modelos de documento',
   'Ver os modelos de documento (corpo HTML e variaveis) disponiveis na organizacao.',
   'hr', 'hr.pessoas.documentos.view', 680, false, 'organization', false),

  ('hr.pessoas.documentos.modelos.edit', 'Editar modelos de documento',
   'Criar e alterar modelos de documento.',
   'hr', 'hr.pessoas.documentos.modelos.view', 690, false, 'organization', false)

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

-- ---- Conferir --------------------------------------------------------------
DO $conferir$
DECLARE
  v_total integer;
BEGIN
  SELECT count(*) INTO v_total
    FROM public.anew_permissions
   WHERE code LIKE 'hr.pessoas.documentos%';

  IF v_total <> 8 THEN
    RAISE EXCEPTION 'Esperavam-se 8 codigos hr.pessoas.documentos*, encontraram-se %.', v_total;
  END IF;

  RAISE NOTICE 'Guardas passadas: 8 codigos hr.pessoas.documentos.* no catalogo. Nenhum papel recebeu nada ainda -- ver 20261123060000.';
END;
$conferir$;

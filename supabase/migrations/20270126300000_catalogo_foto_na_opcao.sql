-- =============================================================================
-- Catálogo — FOTO NA OPÇÃO DE ATRIBUTO (Emylia): uma opção de um atributo de cor pode levar uma foto (amostra do
-- material/acabamento), e nesses atributos o hex deixa de ser obrigatório.
--
-- !!! SÓ PARA A BASE DE RH (uetjghdkwbywbftedtth) — NUNCA NA PRINCIPAL; confirmar o project-ref antes do push
-- !!! (supabase/.temp/project-ref tem de dizer uetjghdkwbywbftedtth). A base principal (tzbfgw…) é a de produção
-- !!! real da Mudelar e não foi lida nem medida para esta migration.
--
-- !!! PRECISA DE CÓDIGO NOVO NO BROWSER, que entra JUNTO (mesmo envio): o envio da foto para o bucket
-- !!! `catalogo-opcoes` (caminho `{org}/{uuid}.webp`, webp até 300 KB), a chamada a cat_foto_opcao e a
-- !!! cat_definir_foto_atributo, e a leitura de 'foto'/'tem_foto'. Sem esse código a migration não parte nada
-- !!! (as leituras só ganham chaves novas; os atributos ficam todos com has_photo = false), mas a funcionalidade
-- !!! não existe no ecrã.
-- =============================================================================
--
-- O QUE FAZ
--  1. attribute_option_group_values.foto_path text NULL, CHECK de formato `{uuid}/{uuid}.webp`. O caminho NÃO leva
--     o id da opção: «copiar a foto de outra opção» partilha o mesmo ficheiro.
--  2. product_attributes.has_photo boolean NOT NULL DEFAULT false, CHECK (NOT has_photo OR has_hex_color IS TRUE):
--     só um atributo de cor pode ter foto. É CHECK (e não só regra nas funções) porque há outros caminhos de
--     escrita na tabela (UPDATE directo com products.manage, rpc_update_product_attribute, cat_guardar_atributo);
--     ADD COLUMN com default constante não reescreve a tabela (PG 17; 17 atributos, 3 de cor, lidos a 24/11).
--  3. Bucket `catalogo-opcoes`: público (leitura pelo URL público), 307200 bytes, só image/webp. Políticas em
--     storage.objects para authenticated: INSERT (caminho `{uuid}/{uuid}.webp` e fn_cat_pode(org, 'products.edit'),
--     org = 1.º segmento), DELETE e SELECT com a mesma guarda de permissão. SEM UPDATE (trocar = ficheiro novo).
--     O SELECT existe porque o `remove()` da Storage API faz DELETE … RETURNING e o Postgres aplica a política de
--     SELECT às linhas devolvidas: sem ela o apagar não apaga nada. Limita-se a quem já pode escrever na pasta da
--     organização; a leitura pública continua a ser pelo URL público.
--     O ::uuid só se avalia depois de o regex aceitar o segmento (CASE garante a ordem; um AND não garante).
--  4. cat_foto_opcao(p_org, p_opcao, p_foto) → {foto, antiga, antiga_orfa}. NULL ou '' limpa.
--  5. cat_definir_foto_atributo(p_org, p_atributo, p_tem_foto) → liga/desliga has_photo (recusa desligar com fotos).
--  6. cat_guardar_opcao / cat_editar_opcao (mesma assinatura): com has_photo o hex passa a opcional; sem foto tudo
--     igual (mesmas mensagens). O formato #RRGGBB continua validado quando há hex.
--  7. cat_ler_atributos / cat_ler_atributos_gestao / cat_ler_atributos_definicoes (mesma assinatura): 'tem_foto' em
--     cada atributo e 'foto' em cada opção. Nada mais muda. cat_ler_atributos_produto não devolve hex e não se toca.
--
-- CORPOS DE PARTIDA (lidos no remoto a 24/11 com pg_get_functiondef; o corpo é igual ao da migration indicada):
--   cat_guardar_opcao            c53d2ed84ecd0730ad85cab90bb60e1f  (20270117500000)
--   cat_editar_opcao             be024ea25647a96fd0154806e336ebb0  (20270117600000)
--   cat_ler_atributos            0a9ed92898a85d96d9d6143cd5bc08b0  (20270118000000)
--   cat_ler_atributos_gestao     203b210c78c2d33d037770d7b30486c5  (20270118000000)
--   cat_ler_atributos_definicoes eff27e0847ca765c7e0c1c352c49e373  (20270118500000)
-- A guarda do início falha se algum md5 for outro (alguém mudou a função entretanto: rever antes de sobrepor).
--
-- O QUE NÃO MUDA: nenhum dado (sem UPDATE/INSERT/DELETE em tabelas; todos os atributos ficam com has_photo = false),
-- product_attribute_values, preços, SKUs. Sem DROP FUNCTION e sem sobrecargas novas. Privilégios das 5 funções
-- substituídas iguais (CREATE OR REPLACE conserva-os); as 2 novas ficam como as irmãs: EXECUTE a authenticated e
-- service_role, nada a PUBLIC nem a anon.
--
-- EFEITOS LATERAIS lidos no remoto: o ALTER não dispara triggers. Os triggers de auditoria das duas tabelas usam
-- to_jsonb(NEW/OLD), por isso as colunas novas entram sozinhas na auditoria. Nenhuma vista depende das tabelas.
-- rpc_manage_attribute_option_group, rpc_duplicate_product_attribute e rpc_create_product_attribute inserem com
-- lista de colunas explícita (as cópias ficam com has_photo = false e sem foto); os SELECT * INTO são para
-- variáveis record e adaptam-se.
--
-- O QUE FICA POR FAZER (fora deste contrato):
--  * Desligar a cor (has_hex_color = false) num atributo com has_photo = true, por cat_guardar_atributo ou
--    rpc_update_product_attribute, falha no CHECK product_attributes_has_photo_check com o erro em bruto (23514);
--    o ecrã deve traduzi-lo ou desligar primeiro a foto.
--  * A limpeza do ficheiro antigo é do browser (antiga_orfa). Corrida rara: limpar a foto de A enquanto B copia a
--    mesma foto ao mesmo tempo pode deixar B a apontar para um ficheiro apagado.
--  * Quem tem products.manage pode, por UPDATE directo, pôr em foto_path um caminho com formato válido de outra
--    organização (as imagens são públicas; não expõe nada que não seja já público).
--
-- ORDEM: depende só do que já está aplicado na RH (última aplicada lida: 20270126280000). ATENÇÃO antes do db push:
-- `supabase db push` aplica TUDO o que estiver pendente; listar com `supabase migration list --linked` imediatamente
-- antes (a 24/11 havia 55 ficheiros locais por aplicar na RH, entre eles 20270126050000…20270126290000).
-- =============================================================================

SET lock_timeout = '5s';
SET statement_timeout = '2min';

-- ---- Guarda: os corpos de partida são os que estão na base -----------------------------------------------------
DO $guarda$
DECLARE
  r record;
  v_md5 text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.cat_guardar_opcao(uuid,uuid,text,text)',                'c53d2ed84ecd0730ad85cab90bb60e1f'),
      ('public.cat_editar_opcao(uuid,uuid,text,text,boolean)',         'be024ea25647a96fd0154806e336ebb0'),
      ('public.cat_ler_atributos(uuid)',                               '0a9ed92898a85d96d9d6143cd5bc08b0'),
      ('public.cat_ler_atributos_gestao(uuid)',                        '203b210c78c2d33d037770d7b30486c5'),
      ('public.cat_ler_atributos_definicoes(uuid)',                    'eff27e0847ca765c7e0c1c352c49e373')
    ) AS t(assinatura, md5)
  LOOP
    IF to_regprocedure(r.assinatura) IS NULL THEN
      RAISE EXCEPTION '%', format('Guarda: a função %s não existe nesta base (é a base de RH?).', r.assinatura);
    END IF;
    SELECT md5(pg_get_functiondef(to_regprocedure(r.assinatura))) INTO v_md5;
    IF v_md5 IS DISTINCT FROM r.md5 THEN
      RAISE EXCEPTION '%', format('Guarda: %s mudou desde a leitura (md5 %s, esperado %s). Rever antes de sobrepor.',
                                  r.assinatura, v_md5, r.md5);
    END IF;
  END LOOP;

  IF to_regprocedure('public.fn_cat_pode(uuid,text)') IS NULL
     OR to_regprocedure('public.fn_cat_exigir(uuid,text)') IS NULL
     OR to_regprocedure('public.fn_cat_grupo_do_atributo(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'Guarda: faltam fn_cat_pode, fn_cat_exigir ou fn_cat_grupo_do_atributo com os argumentos esperados.';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
             AND p.proname IN ('cat_foto_opcao', 'cat_definir_foto_atributo')) THEN
    RAISE EXCEPTION 'Guarda: cat_foto_opcao ou cat_definir_foto_atributo já existem (ver o que está na base).';
  END IF;

  IF EXISTS (SELECT 1 FROM storage.buckets b WHERE b.id = 'catalogo-opcoes'
             AND NOT (b.public AND b.file_size_limit = 307200 AND b.allowed_mime_types = ARRAY['image/webp'])) THEN
    RAISE EXCEPTION 'Guarda: o bucket catalogo-opcoes já existe com outra configuração.';
  END IF;
END
$guarda$;

-- ---- 1 e 2. Colunas e regras ------------------------------------------------------------------------------------
ALTER TABLE public.attribute_option_group_values
  ADD COLUMN IF NOT EXISTS foto_path text NULL;

ALTER TABLE public.attribute_option_group_values
  DROP CONSTRAINT IF EXISTS attribute_option_group_values_foto_path_check;
ALTER TABLE public.attribute_option_group_values
  ADD CONSTRAINT attribute_option_group_values_foto_path_check
  CHECK (foto_path IS NULL OR foto_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$');

COMMENT ON COLUMN public.attribute_option_group_values.foto_path IS
  'Foto da opção no bucket catalogo-opcoes: {organização}/{uuid}.webp. Partilhável entre opções (copiar foto). Escreve-se por cat_foto_opcao.';

ALTER TABLE public.product_attributes
  ADD COLUMN IF NOT EXISTS has_photo boolean NOT NULL DEFAULT false;

ALTER TABLE public.product_attributes
  DROP CONSTRAINT IF EXISTS product_attributes_has_photo_check;
ALTER TABLE public.product_attributes
  ADD CONSTRAINT product_attributes_has_photo_check
  CHECK (NOT has_photo OR has_hex_color IS TRUE);

COMMENT ON COLUMN public.product_attributes.has_photo IS
  'As opções deste atributo de cor podem ter foto (e o hex passa a opcional). Só com has_hex_color. Muda-se por cat_definir_foto_atributo.';

-- ---- 3. Bucket e políticas --------------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('catalogo-opcoes', 'catalogo-opcoes', true, 307200, ARRAY['image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS cat_opcoes_criar ON storage.objects;
CREATE POLICY cat_opcoes_criar ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'catalogo-opcoes'
    AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
    AND CASE WHEN split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             THEN public.fn_cat_pode(split_part(name, '/', 1)::uuid, 'products.edit')
             ELSE false END
  );

DROP POLICY IF EXISTS cat_opcoes_apagar ON storage.objects;
CREATE POLICY cat_opcoes_apagar ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'catalogo-opcoes'
    AND CASE WHEN split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             THEN public.fn_cat_pode(split_part(name, '/', 1)::uuid, 'products.edit')
             ELSE false END
  );

-- só para o DELETE … RETURNING do remove() (ver cabeçalho); a leitura das imagens é pelo URL público
DROP POLICY IF EXISTS cat_opcoes_ler ON storage.objects;
CREATE POLICY cat_opcoes_ler ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'catalogo-opcoes'
    AND CASE WHEN split_part(name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             THEN public.fn_cat_pode(split_part(name, '/', 1)::uuid, 'products.edit')
             ELSE false END
  );

-- ---- 4. cat_foto_opcao ------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cat_foto_opcao(p_org uuid, p_opcao uuid, p_foto text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'products.edit');
  c_max_caminho constant integer := 200;
  a record; o record; v_grupo uuid; v_foto text; v_orfa boolean := false;
BEGIN
  IF length(p_foto) > c_max_caminho THEN
    RAISE EXCEPTION 'O caminho da foto não é válido.' USING ERRCODE = 'CT002';
  END IF;

  -- o atributo fica preso até ao fim (o mesmo que cat_editar_opcao e cat_definir_foto_atributo prendem)
  SELECT pa.id, pa.label, pa.is_measurement, pa.has_photo AS tem_foto, g.organization_id AS grupo_org INTO a
  FROM attribute_option_group_values ov
  JOIN attribute_option_groups g ON g.id = ov.group_id
  JOIN product_attributes pa ON pa.id = g.attribute_id
  WHERE ov.id = p_opcao AND pa.organization_id = p_org AND pa.deleted_at IS NULL
    AND (g.organization_id = p_org OR g.organization_id IS NULL)
  FOR NO KEY UPDATE OF pa;
  IF NOT FOUND THEN RAISE EXCEPTION 'Opção não encontrada.' USING ERRCODE = 'CT003'; END IF;
  IF a.grupo_org IS NULL THEN
    RAISE EXCEPTION 'Opção partilhada: não se pode alterar aqui.' USING ERRCODE = 'CT002';
  END IF;
  IF a.is_measurement THEN
    RAISE EXCEPTION 'A «%» não tem opções: as medidas escrevem-se em cada produto.', a.label USING ERRCODE = 'CT002';
  END IF;
  IF NOT a.tem_foto THEN
    RAISE EXCEPTION 'O atributo «%» não tem fotos nas opções.', a.label USING ERRCODE = 'CT002';
  END IF;

  -- só a opção do grupo em uso (o mesmo que ler e gravar usam)
  v_grupo := public.fn_cat_grupo_do_atributo(a.id, p_org);
  SELECT ov.id, ov.foto_path AS foto INTO o
  FROM attribute_option_group_values ov WHERE ov.id = p_opcao AND ov.group_id = v_grupo FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Opção não encontrada.' USING ERRCODE = 'CT003'; END IF;

  -- NULL ou '' limpa; senão {organização}/{uuid}.webp, da própria organização, já enviado para o bucket
  v_foto := nullif(btrim(coalesce(p_foto, '')), '');
  IF v_foto IS NOT NULL THEN
    IF v_foto !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$' THEN
      RAISE EXCEPTION 'O caminho da foto não é válido.' USING ERRCODE = 'CT002';
    END IF;
    IF split_part(v_foto, '/', 1) <> p_org::text THEN
      RAISE EXCEPTION 'A foto não pertence a esta organização.' USING ERRCODE = 'CT002';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM storage.objects so WHERE so.bucket_id = 'catalogo-opcoes' AND so.name = v_foto) THEN
      RAISE EXCEPTION 'A foto não foi encontrada: envie-a de novo.' USING ERRCODE = 'CT003';
    END IF;
  END IF;

  UPDATE attribute_option_group_values ov SET foto_path = v_foto
  WHERE ov.id = p_opcao AND ov.foto_path IS DISTINCT FROM v_foto;

  -- a antiga fica órfã só se nenhuma OUTRA opção a usa (a cópia de foto partilha o ficheiro)
  IF o.foto IS NOT NULL AND o.foto IS DISTINCT FROM v_foto THEN
    -- só as opções desta organização contam (um caminho alheio posto por UPDATE directo não segura o ficheiro)
    v_orfa := NOT EXISTS (SELECT 1 FROM attribute_option_group_values x
                          JOIN attribute_option_groups xg ON xg.id = x.group_id
                          WHERE x.foto_path = o.foto AND x.id <> p_opcao AND xg.organization_id = p_org);
  END IF;

  RETURN jsonb_build_object('foto', v_foto, 'antiga', o.foto, 'antiga_orfa', v_orfa);
END $function$;

REVOKE ALL ON FUNCTION public.cat_foto_opcao(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_foto_opcao(uuid,uuid,text) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_foto_opcao(uuid,uuid,text) IS
  'Põe ou tira (NULL/'''') a foto de uma opção de um atributo com has_photo. Devolve {foto, antiga, antiga_orfa}: o browser apaga a antiga do bucket só se antiga_orfa.';

-- ---- 5. cat_definir_foto_atributo -------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cat_definir_foto_atributo(p_org uuid, p_atributo uuid, p_tem_foto boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- a mesma permissão que cat_guardar_atributo exige
  v_user uuid := public.fn_cat_exigir(p_org, 'products.edit');
  a record; v_n integer;
BEGIN
  IF p_tem_foto IS NULL THEN
    RAISE EXCEPTION 'Indique se as opções deste atributo têm foto.' USING ERRCODE = 'CT002';
  END IF;

  SELECT pa.id, pa.label, coalesce(pa.has_hex_color, false) AS tem_hex, pa.has_photo AS tem_foto INTO a
  FROM product_attributes pa
  WHERE pa.id = p_atributo AND pa.organization_id = p_org AND pa.deleted_at IS NULL FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Atributo não encontrado.' USING ERRCODE = 'CT003'; END IF;

  IF p_tem_foto AND NOT a.tem_hex THEN
    RAISE EXCEPTION 'Só os atributos de cor podem ter foto nas opções.' USING ERRCODE = 'CT002';
  END IF;

  IF NOT p_tem_foto AND a.tem_foto THEN
    SELECT count(*)::integer INTO v_n
    FROM attribute_option_group_values o JOIN attribute_option_groups g ON g.id = o.group_id
    WHERE g.attribute_id = a.id AND o.foto_path IS NOT NULL;
    IF v_n > 0 THEN
      RAISE EXCEPTION 'Não se pode tirar a foto de «%»: há % opção(ões) com foto. Tire primeiro as fotos.', a.label, v_n
        USING ERRCODE = 'CT002';
    END IF;
  END IF;

  UPDATE product_attributes pa SET has_photo = p_tem_foto
  WHERE pa.id = a.id AND pa.has_photo IS DISTINCT FROM p_tem_foto;

  RETURN jsonb_build_object('atributo', jsonb_build_object('id', a.id, 'tem_hex', a.tem_hex, 'tem_foto', p_tem_foto));
END $function$;

REVOKE ALL ON FUNCTION public.cat_definir_foto_atributo(uuid,uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cat_definir_foto_atributo(uuid,uuid,boolean) TO authenticated, service_role;
COMMENT ON FUNCTION public.cat_definir_foto_atributo(uuid,uuid,boolean) IS
  'Liga/desliga a foto nas opções de um atributo de cor (has_photo). Recusa desligar enquanto alguma opção tiver foto.';

-- ---- 6. cat_guardar_opcao (de 20270117500000; só muda a regra do hex com foto) ---------------------------------
CREATE OR REPLACE FUNCTION public.cat_guardar_opcao(p_org uuid, p_atributo uuid, p_valor text, p_hex text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'products.edit');
  c_max_texto constant integer := 1000;
  c_max_nome constant integer := 255;
  c_max_opcoes constant integer := 500;
  a record; v_nome text; v_hex text; v_grupo uuid; v_ex record; v_n integer; v_ordem integer; v_id uuid;
BEGIN
  -- texto absurdo: recusado antes de qualquer trabalho
  IF length(p_valor) > c_max_texto THEN
    RAISE EXCEPTION 'O nome da opção é demasiado longo.' USING ERRCODE = 'CT002';
  END IF;

  -- o atributo fica preso até ao fim: duas opções iguais, ou a 501.ª, ao mesmo tempo não passam
  -- 20270126300000: "tem_foto"
  SELECT pa.id, pa.label, pa.is_measurement, coalesce(pa.has_hex_color, false) AS tem_hex, pa.has_photo AS tem_foto,
         pa.sort_order INTO a
  FROM product_attributes pa
  WHERE pa.id = p_atributo AND pa.organization_id = p_org AND pa.deleted_at IS NULL FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Atributo não encontrado.' USING ERRCODE = 'CT003'; END IF;
  IF a.is_measurement THEN
    RAISE EXCEPTION 'A «%» não tem opções: as medidas escrevem-se em cada produto.', a.label USING ERRCODE = 'CT002';
  END IF;

  v_nome := public.fn_cat_limpar_nome(p_valor);
  IF v_nome = '' THEN RAISE EXCEPTION 'Escreva o nome da opção.' USING ERRCODE = 'CT002'; END IF;
  IF length(v_nome) > c_max_nome THEN RAISE EXCEPTION 'O nome da opção tem no máximo 255 caracteres.' USING ERRCODE = 'CT002'; END IF;

  IF a.tem_hex THEN
    v_hex := upper(btrim(coalesce(p_hex, '')));
    IF v_hex = '' THEN
      -- 20270126300000: com foto nas opções, a cor é opcional
      IF NOT a.tem_foto THEN
        RAISE EXCEPTION 'Falta o código da cor (por exemplo #F5F5F0).' USING ERRCODE = 'CT002';
      END IF;
      v_hex := NULL;
    ELSIF v_hex !~ '^#[0-9A-F]{6}$' THEN
      RAISE EXCEPTION 'O código da cor tem de ser # e seis algarismos hexadecimais (por exemplo #F5F5F0).' USING ERRCODE = 'CT002';
    END IF;
  ELSE
    v_hex := NULL;  -- só a Cor tem hex
  END IF;

  -- escreve-se só no grupo da organização; se o atributo não o tem (nem que tenha um global), cria-se
  SELECT g.id INTO v_grupo FROM attribute_option_groups g
  WHERE g.attribute_id = a.id AND g.organization_id = p_org AND g.is_active
  ORDER BY coalesce(g.sort_order, 0), g.created_at, g.id LIMIT 1;
  IF v_grupo IS NULL THEN
    INSERT INTO attribute_option_groups (attribute_id, organization_id, name, sort_order, is_active, created_by)
    VALUES (a.id, p_org, left(a.label, 100), coalesce(a.sort_order, 0), true, (SELECT u.id FROM anew_users u WHERE u.id = v_user))
    RETURNING id INTO v_grupo;
  END IF;

  SELECT o.id, o.is_active INTO v_ex FROM attribute_option_group_values o
  WHERE o.group_id = v_grupo AND public.fn_cat_chave_opcao(o.value_text) = public.fn_cat_chave_opcao(v_nome)
  ORDER BY o.is_active DESC, o.sort_order, o.id LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION '%', CASE WHEN v_ex.is_active THEN 'Esta opção já existe.' ELSE 'Esta opção já existe (está desativada).' END
      USING ERRCODE = 'CT004', DETAIL = v_ex.id::text;
  END IF;

  SELECT count(*)::integer, coalesce(max(o.sort_order) + 1, 1) INTO v_n, v_ordem
  FROM attribute_option_group_values o WHERE o.group_id = v_grupo;
  IF v_n >= c_max_opcoes THEN
    RAISE EXCEPTION 'Este atributo já tem o máximo de opções.' USING ERRCODE = 'CT002';
  END IF;

  INSERT INTO attribute_option_group_values (group_id, value_text, display_name, hex_color, sort_order, is_active)
  VALUES (v_grupo, v_nome, v_nome, v_hex, v_ordem, true)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('opcao', jsonb_build_object('id', v_id, 'valor', v_nome, 'nome', v_nome, 'hex', v_hex, 'ordem', v_ordem));
END $function$;

-- ---- 6. cat_editar_opcao (de 20270117600000; só muda a regra do hex com foto) ----------------------------------
CREATE OR REPLACE FUNCTION public.cat_editar_opcao(p_org uuid, p_opcao uuid, p_nome text, p_hex text, p_ativo boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user uuid := public.fn_cat_exigir(p_org, 'products.edit');
  c_max_texto constant integer := 1000;
  c_max_nome constant integer := 255;
  c_max_reescrever constant integer := 5000;
  a record; o record; v_grupo uuid; v_nome text; v_disp text; v_hex text; v_ex record;
  v_n integer := 0; v_np integer := 0;
BEGIN
  IF length(p_nome) > c_max_texto THEN RAISE EXCEPTION 'O nome da opção é demasiado longo.' USING ERRCODE = 'CT002'; END IF;

  -- o atributo (da organização, não apagado) fica preso até ao fim, como em cat_guardar_opcao
  -- 20270126300000: "tem_foto"
  SELECT pa.id, pa.label, pa.is_measurement, coalesce(pa.has_hex_color, false) AS tem_hex, pa.has_photo AS tem_foto,
         g.organization_id AS grupo_org INTO a
  FROM attribute_option_group_values ov
  JOIN attribute_option_groups g ON g.id = ov.group_id
  JOIN product_attributes pa ON pa.id = g.attribute_id
  WHERE ov.id = p_opcao AND pa.organization_id = p_org AND pa.deleted_at IS NULL
    AND (g.organization_id = p_org OR g.organization_id IS NULL)
  FOR NO KEY UPDATE OF pa;
  IF NOT FOUND THEN RAISE EXCEPTION 'Opção não encontrada.' USING ERRCODE = 'CT003'; END IF;
  IF a.grupo_org IS NULL THEN
    RAISE EXCEPTION 'Opção partilhada: não se pode alterar aqui.' USING ERRCODE = 'CT002';
  END IF;
  IF a.is_measurement THEN
    RAISE EXCEPTION 'A «%» não tem opções: as medidas escrevem-se em cada produto.', a.label USING ERRCODE = 'CT002';
  END IF;

  -- só a opção do grupo em uso (o mesmo que ler e gravar usam)
  v_grupo := public.fn_cat_grupo_do_atributo(a.id, p_org);
  SELECT ov.id, ov.value_text::text AS valor, ov.display_name::text AS nome, ov.hex_color::text AS hex, ov.is_active,
         coalesce(ov.sort_order, 0) AS ordem INTO o
  FROM attribute_option_group_values ov WHERE ov.id = p_opcao AND ov.group_id = v_grupo FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Opção não encontrada.' USING ERRCODE = 'CT003'; END IF;

  -- nome (valor e nome mostrado = o texto escrito, limpo)
  v_nome := o.valor; v_disp := o.nome;
  IF p_nome IS NOT NULL THEN
    v_nome := public.fn_cat_limpar_nome(p_nome);
    IF v_nome = '' THEN RAISE EXCEPTION 'Escreva o nome da opção.' USING ERRCODE = 'CT002'; END IF;
    IF length(v_nome) > c_max_nome THEN RAISE EXCEPTION 'O nome da opção tem no máximo 255 caracteres.' USING ERRCODE = 'CT002'; END IF;
    SELECT x.id, x.is_active INTO v_ex FROM attribute_option_group_values x
    WHERE x.group_id = v_grupo AND x.id <> p_opcao AND public.fn_cat_chave_opcao(x.value_text) = public.fn_cat_chave_opcao(v_nome)
    ORDER BY x.is_active DESC, x.sort_order, x.id LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION '%', CASE WHEN v_ex.is_active THEN 'Esta opção já existe.' ELSE 'Esta opção já existe (está desativada).' END
        USING ERRCODE = 'CT004', DETAIL = v_ex.id::text;
    END IF;
    v_disp := v_nome;
  END IF;

  -- cor: NULL não mexe; '' limpa (só sem cor, ou com foto); senão #RRGGBB (só nos atributos com cor)
  v_hex := o.hex;
  IF p_hex IS NOT NULL THEN
    IF btrim(p_hex) = '' THEN
      -- 20270126300000: com foto nas opções, a cor é opcional
      IF a.tem_hex AND NOT a.tem_foto THEN
        RAISE EXCEPTION 'Neste atributo a cor é obrigatória (por exemplo #F5F5F0).' USING ERRCODE = 'CT002';
      END IF;
      v_hex := NULL;
    ELSIF NOT a.tem_hex THEN
      RAISE EXCEPTION 'O atributo «%» não tem cor (hex).', a.label USING ERRCODE = 'CT002';
    ELSE
      v_hex := upper(btrim(p_hex));
      IF v_hex !~ '^#[0-9A-F]{6}$' THEN
        RAISE EXCEPTION 'O código da cor tem de ser # e seis algarismos hexadecimais (por exemplo #F5F5F0).' USING ERRCODE = 'CT002';
      END IF;
    END IF;
  END IF;

  -- renomear: os valores dos produtos e os preços da organização passam ao texto novo (na mesma transacção)
  IF v_nome IS DISTINCT FROM o.valor THEN
    SELECT count(*)::integer INTO v_n FROM product_attribute_values v
    JOIN products p ON p.id = v.product_id AND p.organization_id = p_org
    WHERE v.attribute_id = a.id AND v.value_text = o.valor;
    SELECT count(*)::integer INTO v_np FROM product_attribute_value_prices pr
    WHERE pr.attribute_id = a.id AND pr.organization_id = p_org AND pr.value_option = o.valor;
    IF v_n + v_np > c_max_reescrever THEN
      RAISE EXCEPTION 'Esta opção é usada em demasiados produtos para renomear de uma vez.' USING ERRCODE = 'CT002';
    END IF;
    IF v_np > 0 AND EXISTS (SELECT 1 FROM product_attribute_value_prices pr
                            WHERE pr.attribute_id = a.id AND pr.organization_id = p_org AND pr.value_option = v_nome) THEN
      RAISE EXCEPTION 'Já há preços com o nome «%» neste atributo: não se pode renomear a opção para ele.', v_nome USING ERRCODE = 'CT002';
    END IF;

    UPDATE product_attribute_values v SET value_text = v_nome
    FROM products p
    WHERE p.id = v.product_id AND p.organization_id = p_org AND v.attribute_id = a.id AND v.value_text = o.valor;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    UPDATE product_attribute_value_prices pr SET value_option = v_nome
    WHERE pr.attribute_id = a.id AND pr.organization_id = p_org AND pr.value_option = o.valor;
    GET DIAGNOSTICS v_np = ROW_COUNT;
  END IF;

  UPDATE attribute_option_group_values ov
  SET value_text = v_nome, display_name = v_disp, hex_color = v_hex, is_active = coalesce(p_ativo, ov.is_active)
  WHERE ov.id = p_opcao
    AND (ov.value_text::text, ov.display_name::text, ov.hex_color::text, ov.is_active)
        IS DISTINCT FROM (v_nome, v_disp, v_hex, coalesce(p_ativo, ov.is_active));

  RETURN jsonb_build_object(
    'opcao', jsonb_build_object(
      'id', o.id, 'valor', v_nome, 'nome', coalesce(v_disp, v_nome),
      'hex', CASE WHEN a.tem_hex THEN v_hex END, 'ordem', o.ordem, 'ativo', coalesce(p_ativo, o.is_active),
      'usados', (SELECT count(*)::integer FROM product_attribute_values v
                 JOIN products p ON p.id = v.product_id AND p.organization_id = p_org AND NOT p.is_deleted
                 WHERE v.attribute_id = a.id AND v.value_text = v_nome)),
    'valores_atualizados', v_n,
    'precos_atualizados', v_np);
END $function$;

-- ---- 7. cat_ler_atributos (de 20270118000000; + 'tem_foto' e 'foto') -------------------------------------------
CREATE OR REPLACE FUNCTION public.cat_ler_atributos(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_tec boolean; v_val boolean;
BEGIN
  -- as mesmas permissões e o mesmo corte de cat_ler_produtos_tabelas (20270117100000)
  v_tec := public.fn_neg_so_execucao(p_org, 'services.view');
  IF NOT v_tec AND NOT public.fn_cat_pode(p_org, 'services.view') THEN
    v_tec := public.fn_cat_pode(p_org, 'pessoas.view')
      OR EXISTS (SELECT 1 FROM public.anew_permissions ap WHERE ap.code LIKE 'negocios.%' AND public.fn_cat_pode(p_org, ap.code));
  END IF;
  IF NOT v_tec THEN PERFORM public.fn_cat_exigir(p_org, 'services.view'); END IF;
  v_val := NOT v_tec OR public.fn_cat_pode(p_org, 'negocios.obra.materiais');
  RETURN (
    WITH atr AS (
      -- 20270126300000: "tem_foto"
      SELECT a.id, a.code, a.label, a.is_measurement, coalesce(a.has_hex_color, false) AS tem_hex,
             a.has_photo AS tem_foto, coalesce(a.sort_order, 0) AS ordem,
             CASE WHEN a.is_measurement THEN NULL ELSE public.fn_cat_grupo_do_atributo(a.id, p_org) END AS grupo
      FROM product_attributes a
      WHERE a.organization_id = p_org AND a.deleted_at IS NULL
    ),
    -- todas as opções dos grupos (activas e desativadas): os valores resolvem-se por aqui
    -- 20270118000000: "sigla"; 20270126300000: "foto"
    opc_todas AS (
      SELECT o.id, o.group_id, o.value_text::text AS valor, coalesce(o.display_name, o.value_text)::text AS nome,
             o.hex_color::text AS hex, coalesce(o.sort_order, 0) AS ordem, o.is_active, o.sigla, o.foto_path AS foto
      FROM attribute_option_group_values o
      WHERE o.group_id IN (SELECT grupo FROM atr WHERE grupo IS NOT NULL)
    ),
    val AS (
      SELECT v.product_id, v.attribute_id, v.value_text, v.value_json, v.unit, a.is_measurement, a.grupo, a.ordem, a.label
      FROM product_attribute_values v
      JOIN atr a ON a.id = v.attribute_id
      JOIN products p ON p.id = v.product_id AND p.organization_id = p_org AND NOT p.is_deleted AND p.tipo_catalogo = 'produto'
      WHERE v_val
    )
    SELECT jsonb_build_object(
      'atributos', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                 'id', a.id, 'codigo', a.code, 'nome', a.label,
                 'tipo', CASE WHEN a.is_measurement THEN 'medida' ELSE 'lista' END,
                 'tem_hex', a.tem_hex, 'tem_foto', a.tem_foto, 'ordem', a.ordem,
                 'opcoes', CASE WHEN a.is_measurement THEN '[]'::jsonb ELSE coalesce((
                   SELECT jsonb_agg(jsonb_build_object('id', o.id, 'valor', o.valor, 'nome', o.nome,
                                                       'hex', CASE WHEN a.tem_hex THEN o.hex END, 'ordem', o.ordem,
                                                       'sigla', o.sigla, 'foto', o.foto)
                                    ORDER BY o.ordem, o.valor, o.id)
                   FROM opc_todas o WHERE o.group_id = a.grupo AND o.is_active), '[]'::jsonb) END)
               ORDER BY a.ordem, a.label, a.id)
        FROM atr a), '[]'::jsonb),
      'produtos', coalesce((
        SELECT jsonb_agg(jsonb_build_object('id', x.product_id, 'valores', x.valores) ORDER BY x.product_id)
        FROM (
          SELECT v.product_id,
                 jsonb_agg(jsonb_build_object(
                   'atributo', v.attribute_id,
                   'opcao', CASE WHEN v.is_measurement THEN NULL ELSE o.id END,
                   'valor', v.value_text,
                   'medida', CASE WHEN v.is_measurement THEN public.fn_cat_medida_ler(v.value_json, v.unit) END,
                   'ativa', CASE WHEN v.is_measurement THEN true ELSE coalesce(o.is_active, false) END)
                   ORDER BY v.ordem, v.label, v.attribute_id) AS valores
          FROM val v
          LEFT JOIN opc_todas o ON NOT v.is_measurement AND o.group_id = v.grupo AND o.valor = v.value_text
          GROUP BY v.product_id
        ) x), '[]'::jsonb)
    ));
END $function$;

-- ---- 7. cat_ler_atributos_gestao (de 20270118000000; + 'tem_foto' e 'foto') ------------------------------------
CREATE OR REPLACE FUNCTION public.cat_ler_atributos_gestao(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- o ecrã de gestão: quem edita produtos ou quem vê o catálogo; o perfil reduzido de Negócios não entra
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view']);
  RETURN (
    WITH atr AS (
      -- 20270118000000: "sku_ordem" e "sku_entra"; 20270126300000: "tem_foto"
      SELECT a.id, a.code, a.label, a.is_measurement, coalesce(a.has_hex_color, false) AS tem_hex,
             a.has_photo AS tem_foto, coalesce(a.sort_order, 0) AS ordem, a.sku_ordem, a.sku_entra,
             CASE WHEN a.is_measurement THEN NULL ELSE public.fn_cat_grupo_do_atributo(a.id, p_org) END AS grupo
      FROM product_attributes a
      WHERE a.organization_id = p_org AND a.deleted_at IS NULL
    ),
    -- uma só passagem pelos valores: quantos produtos vivos por atributo e texto
    uso AS (
      SELECT v.attribute_id, v.value_text, count(*)::integer AS n
      FROM product_attribute_values v
      JOIN atr a ON a.id = v.attribute_id
      JOIN products p ON p.id = v.product_id AND p.organization_id = p_org AND NOT p.is_deleted
      GROUP BY v.attribute_id, v.value_text
    ),
    uso_atr AS (SELECT u.attribute_id, sum(u.n)::integer AS n FROM uso u GROUP BY u.attribute_id),
    opc AS (
      -- 20270118000000: "sigla"; 20270126300000: "foto"
      SELECT o.id, o.group_id, o.value_text::text AS valor, coalesce(o.display_name, o.value_text)::text AS nome,
             o.hex_color::text AS hex, coalesce(o.sort_order, 0) AS ordem, o.is_active AS ativo, o.sigla,
             o.foto_path AS foto
      FROM attribute_option_group_values o
      WHERE o.group_id IN (SELECT grupo FROM atr WHERE grupo IS NOT NULL)
    )
    SELECT jsonb_build_object('atributos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', a.id, 'codigo', a.code, 'nome', a.label,
               'tipo', CASE WHEN a.is_measurement THEN 'medida' ELSE 'lista' END,
               'tem_hex', a.tem_hex, 'tem_foto', a.tem_foto, 'ordem', a.ordem, 'ativo', true,
               'usados', coalesce(ua.n, 0), 'sku_ordem', a.sku_ordem, 'sku_entra', a.sku_entra,
               'opcoes', CASE WHEN a.is_measurement THEN '[]'::jsonb ELSE coalesce((
                 SELECT jsonb_agg(jsonb_build_object(
                          'id', o.id, 'valor', o.valor, 'nome', o.nome,
                          'hex', CASE WHEN a.tem_hex THEN o.hex END, 'ordem', o.ordem, 'ativo', o.ativo,
                          'usados', coalesce(u.n, 0), 'sigla', o.sigla, 'foto', o.foto)
                        ORDER BY o.ordem, o.valor, o.id)
                 FROM opc o
                 LEFT JOIN uso u ON u.attribute_id = a.id AND u.value_text = o.valor
                 WHERE o.group_id = a.grupo), '[]'::jsonb) END)
             ORDER BY a.ordem, a.label, a.id)
      FROM atr a LEFT JOIN uso_atr ua ON ua.attribute_id = a.id), '[]'::jsonb))
  );
END $function$;

-- ---- 7. cat_ler_atributos_definicoes (de 20270118500000; + 'tem_foto' e 'foto') -------------------------------
CREATE OR REPLACE FUNCTION public.cat_ler_atributos_definicoes(p_org uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM public.fn_cat_exigir_uma(p_org, ARRAY['products.edit', 'services.view']);
  RETURN (
    -- copiado de cat_ler_atributos (20270118000000, md5 conferido na guarda): o campo "atributos"
    -- 20270126300000: "tem_foto" e "foto"
    WITH atr AS (
      SELECT a.id, a.code, a.label, a.is_measurement, coalesce(a.has_hex_color, false) AS tem_hex,
             a.has_photo AS tem_foto, coalesce(a.sort_order, 0) AS ordem,
             CASE WHEN a.is_measurement THEN NULL ELSE public.fn_cat_grupo_do_atributo(a.id, p_org) END AS grupo
      FROM product_attributes a
      WHERE a.organization_id = p_org AND a.deleted_at IS NULL
    ),
    opc AS (
      SELECT o.id, o.group_id, o.value_text::text AS valor, coalesce(o.display_name, o.value_text)::text AS nome,
             o.hex_color::text AS hex, coalesce(o.sort_order, 0) AS ordem, o.sigla, o.foto_path AS foto
      FROM attribute_option_group_values o
      WHERE o.group_id IN (SELECT grupo FROM atr WHERE grupo IS NOT NULL) AND o.is_active
    )
    SELECT jsonb_build_object('atributos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', a.id, 'codigo', a.code, 'nome', a.label,
               'tipo', CASE WHEN a.is_measurement THEN 'medida' ELSE 'lista' END,
               'tem_hex', a.tem_hex, 'tem_foto', a.tem_foto, 'ordem', a.ordem,
               'opcoes', CASE WHEN a.is_measurement THEN '[]'::jsonb ELSE coalesce((
                 SELECT jsonb_agg(jsonb_build_object('id', o.id, 'valor', o.valor, 'nome', o.nome,
                                                     'hex', CASE WHEN a.tem_hex THEN o.hex END, 'ordem', o.ordem,
                                                     'sigla', o.sigla, 'foto', o.foto)
                                  ORDER BY o.ordem, o.valor, o.id)
                 FROM opc o WHERE o.group_id = a.grupo), '[]'::jsonb) END)
             ORDER BY a.ordem, a.label, a.id)
      FROM atr a), '[]'::jsonb))
  );
END $function$;

-- ---- 9. Conferir: falha a migration se alguma coisa não ficou como descrito -----------------------------------
DO $conferir$
DECLARE
  r record;
  v_oid oid;
  v_n integer;
  v_def text;
BEGIN
  -- colunas
  SELECT count(*)::integer INTO v_n FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'attribute_option_group_values' AND c.column_name = 'foto_path'
    AND c.data_type = 'text' AND c.is_nullable = 'YES';
  IF v_n <> 1 THEN RAISE EXCEPTION 'Conferir: falta attribute_option_group_values.foto_path text NULL.'; END IF;

  SELECT count(*)::integer INTO v_n FROM information_schema.columns c
  WHERE c.table_schema = 'public' AND c.table_name = 'product_attributes' AND c.column_name = 'has_photo'
    AND c.data_type = 'boolean' AND c.is_nullable = 'NO' AND c.column_default = 'false';
  IF v_n <> 1 THEN RAISE EXCEPTION 'Conferir: falta product_attributes.has_photo boolean NOT NULL DEFAULT false.'; END IF;

  -- CHECKs (::text em contype: é do tipo "char")
  SELECT pg_get_constraintdef(co.oid) INTO v_def FROM pg_constraint co
  WHERE co.conname = 'attribute_option_group_values_foto_path_check' AND co.contype::text = 'c'
    AND co.conrelid = to_regclass('public.attribute_option_group_values') AND co.convalidated;
  IF v_def IS NULL OR position('foto_path' IN v_def) = 0 OR position('webp' IN v_def) = 0 THEN
    RAISE EXCEPTION '%', format('Conferir: CHECK de foto_path em falta ou diferente (%s).', coalesce(v_def, 'nenhum'));
  END IF;
  v_def := NULL;
  SELECT pg_get_constraintdef(co.oid) INTO v_def FROM pg_constraint co
  WHERE co.conname = 'product_attributes_has_photo_check' AND co.contype::text = 'c'
    AND co.conrelid = to_regclass('public.product_attributes') AND co.convalidated;
  IF v_def IS NULL OR position('has_photo' IN v_def) = 0 OR position('has_hex_color' IN v_def) = 0 THEN
    RAISE EXCEPTION '%', format('Conferir: CHECK de has_photo em falta ou diferente (%s).', coalesce(v_def, 'nenhum'));
  END IF;

  -- nenhum atributo ficou com foto
  SELECT count(*)::integer INTO v_n FROM public.product_attributes pa WHERE pa.has_photo;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '%', format('Conferir: %s atributo(s) ficaram com has_photo = true (esperado 0).', v_n);
  END IF;

  -- bucket
  SELECT count(*)::integer INTO v_n FROM storage.buckets b
  WHERE b.id = 'catalogo-opcoes' AND b.name = 'catalogo-opcoes' AND b.public
    AND b.file_size_limit = 307200 AND b.allowed_mime_types = ARRAY['image/webp'];
  IF v_n <> 1 THEN RAISE EXCEPTION 'Conferir: o bucket catalogo-opcoes não ficou público, 307200 bytes, só image/webp.'; END IF;

  -- políticas: exactamente INSERT, DELETE e SELECT para authenticated; nenhuma de UPDATE/ALL a falar do bucket
  FOR r IN SELECT * FROM (VALUES ('cat_opcoes_criar', 'INSERT'), ('cat_opcoes_apagar', 'DELETE'), ('cat_opcoes_ler', 'SELECT')) AS t(nome, cmd)
  LOOP
    SELECT count(*)::integer INTO v_n FROM pg_policies p
    WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.policyname = r.nome AND p.cmd = r.cmd
      AND p.permissive = 'PERMISSIVE' AND p.roles = ARRAY['authenticated']::name[]
      AND position('fn_cat_pode' IN coalesce(p.qual, '') || coalesce(p.with_check, '')) > 0
      AND position('products.edit' IN coalesce(p.qual, '') || coalesce(p.with_check, '')) > 0;
    IF v_n <> 1 THEN
      RAISE EXCEPTION '%', format('Conferir: a política %s (%s) não ficou como descrito.', r.nome, r.cmd);
    END IF;
  END LOOP;
  SELECT count(*)::integer INTO v_n FROM pg_policies p
  WHERE p.schemaname = 'storage' AND p.tablename = 'objects' AND p.cmd IN ('UPDATE', 'ALL')
    AND position('catalogo-opcoes' IN coalesce(p.qual, '') || coalesce(p.with_check, '')) > 0;
  IF v_n <> 0 THEN
    RAISE EXCEPTION '%', format('Conferir: há %s política(s) de UPDATE/ALL no bucket catalogo-opcoes (esperado 0).', v_n);
  END IF;

  -- funções: uma só versão por nome, assinatura, SECURITY DEFINER, search_path, e privilégios
  FOR r IN SELECT * FROM (VALUES
      ('cat_foto_opcao',               'p_org uuid, p_opcao uuid, p_foto text'),
      ('cat_definir_foto_atributo',    'p_org uuid, p_atributo uuid, p_tem_foto boolean'),
      ('cat_guardar_opcao',            'p_org uuid, p_atributo uuid, p_valor text, p_hex text'),
      ('cat_editar_opcao',             'p_org uuid, p_opcao uuid, p_nome text, p_hex text, p_ativo boolean'),
      ('cat_ler_atributos',            'p_org uuid'),
      ('cat_ler_atributos_gestao',     'p_org uuid'),
      ('cat_ler_atributos_definicoes', 'p_org uuid')
    ) AS t(nome, args)
  LOOP
    SELECT count(*)::integer INTO v_n FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = r.nome;
    IF v_n <> 1 THEN
      RAISE EXCEPTION '%', format('Conferir: %s tem %s versões (esperado 1).', r.nome, v_n);
    END IF;
    SELECT p.oid INTO v_oid FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = r.nome
      AND pg_get_function_identity_arguments(p.oid) = r.args
      AND pg_get_function_result(p.oid) = 'jsonb'
      AND p.prosecdef
      AND p.proconfig::text = '{"search_path=public, pg_temp"}';
    IF v_oid IS NULL THEN
      RAISE EXCEPTION '%', format('Conferir: %s não tem a assinatura (%s) → jsonb, SECURITY DEFINER e search_path esperados.', r.nome, r.args);
    END IF;
    IF NOT has_function_privilege('authenticated', v_oid, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_oid, 'EXECUTE')
       OR has_function_privilege('anon', v_oid, 'EXECUTE')
       OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) x WHERE p.oid = v_oid AND x.grantee = 0) THEN
      RAISE EXCEPTION '%', format('Conferir: os privilégios de %s divergem (esperado EXECUTE só a authenticated e service_role, nada a anon/PUBLIC).', r.nome);
    END IF;
    v_oid := NULL;
  END LOOP;

  -- as alteradas levam mesmo a regra nova
  SELECT count(*)::integer INTO v_n FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname IN ('cat_guardar_opcao', 'cat_editar_opcao', 'cat_ler_atributos', 'cat_ler_atributos_gestao', 'cat_ler_atributos_definicoes')
    AND position('tem_foto' IN p.prosrc) > 0;
  IF v_n <> 5 THEN
    RAISE EXCEPTION '%', format('Conferir: só %s de 5 funções substituídas levam tem_foto.', v_n);
  END IF;

  -- o dono das funções (SECURITY DEFINER) consegue ler storage.objects (cat_foto_opcao confirma o ficheiro)
  SELECT p.proowner INTO v_oid FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'cat_foto_opcao';
  IF NOT has_table_privilege(v_oid, 'storage.objects', 'SELECT') THEN
    RAISE EXCEPTION 'Conferir: o dono de cat_foto_opcao não pode ler storage.objects.';
  END IF;
END
$conferir$;

RESET lock_timeout;
RESET statement_timeout;

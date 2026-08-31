-- ============================================================
--  Operações — documentos na ordem, e histórico do equipamento
-- ============================================================
--  Correr DEPOIS de: schema.sql, anexos.sql, campos-ordem.sql.
--
--  Duas coisas pequenas e independentes, num ficheiro só para poupar uma
--  passagem pelo editor de SQL a quem instala.
--
--  Escreve fora de `ops_*`? NÃO. A primeira parte mexe no bucket `operacoes`,
--  que o `anexos.sql` já tinha criado e que é só deste módulo.
-- ============================================================

BEGIN;

DO $requisitos$
BEGIN
  IF to_regclass('public.ops_anexo') IS NULL THEN
    RAISE EXCEPTION 'Falta db/schema.sql.';
  END IF;
  IF to_regclass('public.ops_ativo') IS NULL THEN
    RAISE EXCEPTION 'Falta db/schema.sql.';
  END IF;
END
$requisitos$;


-- ============================================================
-- 1. O que se pode anexar a uma ordem
-- ============================================================
-- Até aqui: fotografias, PDF e áudio. Faltava o que a operação usa todos os
-- dias — o auto de medição em Word, o mapa de quantidades em Excel, o CSV que
-- veio do contador.
--
-- Faz-se por UPDATE e não pelo INSERT do `anexos.sql`: aquele tem
-- `ON CONFLICT DO NOTHING`, e num bucket que já existe não mudava nada. Foi
-- por isso que este ficheiro teve de existir em vez de se editar o outro.
--
-- A lista é fechada de propósito. Um bucket que aceita tudo aceita também um
-- executável, e um anexo de ordem não é sítio para isso.

DO $mimes$
DECLARE
  v_novos text[] := ARRAY[
    -- Documentos
    'application/pdf',
    'application/msword',                                                       -- .doc
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  -- .docx
    'application/vnd.ms-excel',                                                 -- .xls
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',        -- .xlsx
    'application/vnd.oasis.opendocument.text',                                  -- .odt
    'application/vnd.oasis.opendocument.spreadsheet',                           -- .ods
    'text/csv',
    'text/plain'
  ];
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'Sem schema storage — a correr fora do Supabase. Nada a fazer.';
    RETURN;
  END IF;

  -- Junta aos que lá estão, sem tirar nenhum: quem já tinha alargado a lista à
  -- mão não a perde por correr isto.
  UPDATE storage.buckets
     SET allowed_mime_types = (
           SELECT array_agg(DISTINCT m ORDER BY m)
             FROM unnest(COALESCE(allowed_mime_types, ARRAY[]::text[]) || v_novos) AS m
         )
   WHERE id = 'operacoes';

  IF NOT FOUND THEN
    RAISE NOTICE 'O bucket operacoes não existe. Corre db/anexos.sql primeiro.';
  END IF;
END
$mimes$;


-- ============================================================
-- 2. O histórico do equipamento
-- ============================================================
-- Era a única entidade do módulo sem registo próprio. As intervenções nele
-- ficavam (pelas ordens), mas mudar-lhe a categoria, o número de série, o
-- centro de custo ou desativá-lo não deixava rasto nenhum.
--
-- Por gatilho, e não por RPC: os equipamentos gravam-se por UPDATE direto
-- desde o início (não são estado, e o estado é a única coisa trancada), e um
-- gatilho apanha todos os caminhos — o formulário, a duplicação de um local,
-- e o que vier a seguir.

CREATE OR REPLACE FUNCTION public.ops_historico_do_ativo()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user  uuid;
  v_mudou jsonb := '{}'::jsonb;
  v_antes jsonb := '{}'::jsonb;
BEGIN
  -- Pode não haver sessão: uma importação corre sem ninguém, e o histórico
  -- fica com autor nulo em vez de não existir.
  BEGIN
    v_user := public.current_business_user_id();
  EXCEPTION WHEN OTHERS THEN
    v_user := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.ops_evento
      (organization_id, entidade, entidade_id, tipo, descricao, autor_id, depois)
    VALUES
      (NEW.organization_id, 'ativo', NEW.id, 'criado',
       NEW.codigo || ' — ' || NEW.nome, v_user,
       jsonb_build_object('codigo', NEW.codigo, 'nome', NEW.nome,
                          'local_id', NEW.local_id));
    RETURN NULL;
  END IF;

  -- Só o que interessa a quem lê o histórico daqui a um ano. `atualizado_em`
  -- muda sempre e não conta nada.
  IF NEW.nome            IS DISTINCT FROM OLD.nome            THEN
    v_antes := v_antes || jsonb_build_object('nome', OLD.nome);
    v_mudou := v_mudou || jsonb_build_object('nome', NEW.nome);
  END IF;
  IF NEW.categoria_id    IS DISTINCT FROM OLD.categoria_id    THEN
    v_antes := v_antes || jsonb_build_object('categoria_id', OLD.categoria_id);
    v_mudou := v_mudou || jsonb_build_object('categoria_id', NEW.categoria_id);
  END IF;
  IF NEW.num_serie       IS DISTINCT FROM OLD.num_serie       THEN
    v_antes := v_antes || jsonb_build_object('num_serie', OLD.num_serie);
    v_mudou := v_mudou || jsonb_build_object('num_serie', NEW.num_serie);
  END IF;
  IF NEW.criticidade     IS DISTINCT FROM OLD.criticidade     THEN
    v_antes := v_antes || jsonb_build_object('criticidade', OLD.criticidade);
    v_mudou := v_mudou || jsonb_build_object('criticidade', NEW.criticidade);
  END IF;
  IF NEW.local_id        IS DISTINCT FROM OLD.local_id        THEN
    v_antes := v_antes || jsonb_build_object('local_id', OLD.local_id);
    v_mudou := v_mudou || jsonb_build_object('local_id', NEW.local_id);
  END IF;
  IF NEW.ativo           IS DISTINCT FROM OLD.ativo           THEN
    v_antes := v_antes || jsonb_build_object('ativo', OLD.ativo);
    v_mudou := v_mudou || jsonb_build_object('ativo', NEW.ativo);
  END IF;
  IF NEW.centro_custo_id IS DISTINCT FROM OLD.centro_custo_id THEN
    v_antes := v_antes || jsonb_build_object('centro_custo_id', OLD.centro_custo_id);
    v_mudou := v_mudou || jsonb_build_object('centro_custo_id', NEW.centro_custo_id);
  END IF;

  IF v_mudou = '{}'::jsonb THEN RETURN NULL; END IF;

  INSERT INTO public.ops_evento
    (organization_id, entidade, entidade_id, tipo, descricao, autor_id, antes, depois)
  VALUES
    (NEW.organization_id, 'ativo', NEW.id,
     CASE
       WHEN NEW.ativo IS DISTINCT FROM OLD.ativo
        THEN CASE WHEN NEW.ativo THEN 'reativado' ELSE 'desativado' END
       WHEN NEW.local_id IS DISTINCT FROM OLD.local_id THEN 'mudou_de_sitio'
       ELSE 'alterado'
     END,
     NEW.codigo || ' — ' || NEW.nome, v_user, v_antes, v_mudou);

  RETURN NULL;
END
$$;

DROP TRIGGER IF EXISTS ops_ativo_historico ON public.ops_ativo;
CREATE TRIGGER ops_ativo_historico
  AFTER INSERT OR UPDATE ON public.ops_ativo
  FOR EACH ROW
  EXECUTE FUNCTION public.ops_historico_do_ativo();


-- ============================================================
-- 3. Verificação
-- ============================================================

DO $verificar$
DECLARE
  v_n integer;
BEGIN
  IF to_regprocedure('public.ops_historico_do_ativo()') IS NULL THEN
    RAISE EXCEPTION 'A função do histórico do equipamento não ficou criada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'ops_ativo_historico' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'O gatilho ops_ativo_historico não ficou criado.';
  END IF;

  IF to_regclass('storage.buckets') IS NOT NULL THEN
    SELECT count(*) INTO v_n
      FROM storage.buckets b, unnest(b.allowed_mime_types) AS m
     WHERE b.id = 'operacoes'
       AND m IN ('application/pdf',
                 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    IF v_n < 3 THEN
      RAISE NOTICE 'Aviso: o bucket operacoes ainda não aceita Word/Excel/PDF (encontrados %).', v_n;
    END IF;
  END IF;

  RAISE NOTICE 'Operações: documentos na ordem, e histórico do equipamento.';
END
$verificar$;

COMMIT;

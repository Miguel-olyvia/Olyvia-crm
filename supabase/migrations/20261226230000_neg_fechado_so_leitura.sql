-- ============================================================
-- 20261226230000_neg_fechado_so_leitura
-- ============================================================
-- QUANDO E POR QUE ORDEM SE APLICA
--   Depois de 20261226210000 e de 20261226220000, no mesmo db push ou num
--   posterior. Esta migration só toca em coisas NOSSAS (a tabela negocios e
--   uma função nova): não precisa de janela horária própria. Mas a 210000 só
--   se aplica entre as 20h00 e as 7h59 de Lisboa (bloqueia quotes, partilhada
--   com a Mudelar) e o db push aplica por ordem e pára na primeira que falha:
--   num push de dia a 210000 recusa-se e esta fica pendente, sem efeito.
--   Não depende da 210000 nem da 220000 (pode aplicar-se sem elas, se um dia
--   forem retiradas da pasta). A 20261226240000 vem a seguir e é independente
--   desta.
--   Bloqueio: SHARE ROW EXCLUSIVE em negocios (o do CREATE TRIGGER), pedido
--   logo no início, com lock_timeout de 2 s. negocios não é partilhada: 0
--   linhas fora da nike (lido a 21/10); a nike tem hoje 0 negócios (a 220000
--   cria os primeiros).
--
-- Decisão do utilizador: um negócio ganho ou perdido já não se edita no ecrã
--   (título, notas e comercial deixam de ser oferecidos). Esta migration fecha
--   o mesmo na base, para quem chame o PostgREST directamente.
--
-- O que faz
--   1. fn_negocios_fechado_so_leitura(), NOVA, de gatilho, SECURITY DEFINER
--      (chama fn_negocios_ref_utilizador_apagado, que authenticated não pode
--      executar), search_path fixo, sem EXECUTE para ninguém além do dono.
--      Recusa com NG028 a mudança de titulo, notas ou assigned_to de um
--      negócio ganho ou perdido. Deixa passar:
--        - qualquer escrita com app.neg_via_funcao = 'on' (as funções neg_* e
--          os gatilhos de decisão do fecho põem-na à volta do seu UPDATE: é o
--          mesmo mecanismo de fn_negocios_guardar_alteracao, 20261224130000 e
--          20261226110000);
--        - assigned_to a nulo quando o utilizador foi apagado (ON DELETE SET
--          NULL de negocios_assigned_to_fkey): a mesma excepção que a guarda
--          já faz, pela mesma função. Sem isto, apagar um utilizador que é
--          comercial de um negócio fechado falharia.
--   2. Gatilho trg_01_negocios_fechado_so_leitura, BEFORE UPDATE OF titulo,
--      notas, assigned_to, por linha, com
--        WHEN (OLD.estado IN ('ganho', 'perdido')
--              AND (NEW.titulo IS DISTINCT FROM OLD.titulo
--                   OR NEW.notas IS DISTINCT FROM OLD.notas
--                   OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to))
--      Corre depois de trg_00_negocios_guardar_alteracao (ordem alfabética),
--      que continua a dar os seus erros primeiro (lixo, imutáveis, estado).
--
--   O que NÃO é bloqueado (não depende do estado, e nenhuma destas escritas
--   toca em titulo, notas ou assigned_to; lido no remoto a 21/10 em todas as
--   funções que fazem UPDATE public.negocios: fn_neg_anotar,
--   fn_neg_mudar_estado, neg_anular_perda, neg_dispensar_alerta,
--   neg_ganhar_negocio, neg_mudar_fecho, neg_perder_negocio,
--   neg_reabrir_ganho; nenhuma outra função, em nenhum esquema, escreve em
--   negocios):
--     mudar o estado, fase_perda e motivo_perda (corrigir a perda), reabrir
--     um ganho, anular a perda, mudar o tipo de fecho (neg_mudar_fecho já
--     recusa com NG022 num negócio fechado), converter, os alertas, o lixo e
--     o restauro (deleted_at). Nada disto passa pelo gatilho: o WHEN é falso.
--   Um negócio no lixo já era só de leitura (guarda, passo 2).
--
-- Erro: NG028 (novo; NG025 é da proposta, NG026 da organização ambígua da
--   20261226210000, NG027 de classificar a lead; NG028 lido livre no remoto e
--   em src/hooks/pessoas/errosNeg.ts a 21/10).
--   Mensagem da base (o ecrã traduz pelo código, não por ela):
--     'Este negócio está ganho|perdido: o título, as notas e o comercial já
--      não se alteram. Reabra-o primeiro.'
--
-- Desempenho: o WHEN é avaliado em memória, só nos UPDATE que incluam uma
--   das três colunas no SET; num negócio aberto pára no primeiro termo e a
--   função nunca é chamada. Quando é chamada: uma leitura de variável e três
--   comparações; só a mudança de assigned_to sem a variável lê anew_users
--   pela chave primária. Nenhuma leitura de catálogo no caminho quente.
--   Medido na nike a 21/10 (1000 negócios ganhos de teste, dentro de BEGIN
--   e acabado em erro forçado: nada ficou), 3 rondas com e 3 sem o gatilho,
--   ms por 1000 linhas: SET notas = notas (WHEN avaliado, falso) 127 a 165
--   com, 134 a 167 sem; SET titulo com a variável (função chamada) 137 a 165
--   com, 136 a 167 sem. Diferença abaixo do ruído da medição.
--   Provas (as mesmas transacções revertidas, como authenticated com
--   pessoas.edit de âmbito organização): mudar título, notas (também para
--   nulo) ou comercial (também para nulo) de um ganho ou perdido dá NG028;
--   sem esta migration o mesmo UPDATE passa. Passam: editar um aberto,
--   gravar os mesmos valores num ganho, lixo e restauro de um ganho,
--   neg_perder_negocio a corrigir a perda, neg_mudar_fecho, a escrita com a
--   variável, neg_anular_perda e editar o negócio reaberto.
--   NÃO provado ao vivo: o ON DELETE SET NULL de um utilizador apagado
--   (exigiria apagar um utilizador); a excepção é a mesma da guarda.
--
-- Antes do db push (revisão de 21/10)
--   - Os md5 das pré-condições (gatilhos de negocios, fn_negocios_guardar_
--     alteracao, fn_negocios_ref_utilizador_apagado) são de 21/10: recalcular
--     imediatamente antes do push. Se algo inofensivo mudou entretanto, a
--     pré-condição aborta sem fazer nada; o push fica parado até se rever o md5.
--   - O bypass app.neg_via_funcao = on só vale se for de TRANSACÇÃO. Lido no
--     remoto a 21/10: todas as chamadas set_config('app.neg_via_funcao', ...)
--     das funções que o põem (fn_neg_anotar, fn_neg_mudar_estado,
--     neg_anular_perda, neg_desligar_registo, neg_dispensar_alerta,
--     neg_ganhar_negocio, neg_ligar_registo, neg_mudar_fecho,
--     neg_perder_negocio, neg_reabrir_ganho) passam is_local = true; nenhuma
--     o põe ao nível da sessão (o pooler reutiliza ligações). Qualquer função
--     neg_* futura que ponha a variável herda a permissão de editar negócios
--     fechados: rever-lhe o set_config (true) em cada revisão.
--   - O ON DELETE SET NULL de um utilizador apagado é a única parte que só se
--     apanha a correr. Provar na nike, numa transacção revertida com erro
--     forçado e um utilizador de teste que seja comercial de um negócio ganho,
--     que o DELETE desse utilizador passa. Não feito aqui.
--   - Efeito de produto: uma reatribuição em massa do comercial por PostgREST
--     que inclua negócios fechados falha inteira com NG028 (nenhuma função da
--     base escreve assigned_to hoje). Um ecrã de reatribuição futuro tem de
--     filtrar os fechados.
--
-- Impacto na Mudelar: nenhum. A Mudelar não tem negócios; nenhuma tabela,
--   política ou função que ela use é tocada.
--
-- O que o ecrã tem de fazer junto (não parte nada sem isto: o ecrã já não
--   oferece a edição de um negócio fechado)
--   - Traduzir NG028: src/hooks/pessoas/errosNeg.ts (CHAVES_ERRO_NEG e a
--     expressão CODIGO_NO_TEXTO) e src/translations/pessoasErros.ts, pt e en:
--       pt «Este negócio está fechado (ganho ou perdido): o título, as notas e
--           o comercial já não se alteram. Reabra-o primeiro.»
--       en «This deal is closed (won or lost): its title, notes and sales rep
--           can no longer be changed. Reopen it first.»
--     Sem isto, quem tenha a ficha aberta com dados antigos (o negócio fechou
--     entretanto) vê a mensagem genérica.
--
-- Pré-condição (lida no remoto a 21/10): os gatilhos de negocios; a versão de
--   fn_negocios_guardar_alteracao e de fn_negocios_ref_utilizador_apagado; o
--   CHECK de estado; a função nova não existe; NG028 livre.
-- CONFERIR: sem bloco DO. Cada verificação junta os motivos de falha numa
--   lista; se a lista não estiver vazia, o texto é convertido em integer, o
--   que falha com a lista na mensagem e aborta a transacção.
-- Reversão: fora da pasta das migrations
--   (reversoes/R_20261226230000_neg_fechado_so_leitura.sql). Não depende da
--   ordem das outras reversões.
-- ============================================================

BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '60s';

-- O bloqueio que o CREATE TRIGGER pede, tomado antes da pré-condição: os
-- gatilhos lidos não mudam até ao COMMIT.
LOCK TABLE public.negocios IN SHARE ROW EXCLUSIVE MODE;

-- Pré-condição
SELECT CASE WHEN f.falhas IS NULL THEN 'PRE-CONDICAO: ok'
            ELSE ('PRE-CONDICAO falhou, nada feito: ' || f.falhas)::integer::text END AS pre_condicao
FROM (SELECT string_agg(e.motivo, '; ' ORDER BY e.motivo) AS falhas
      FROM (VALUES
        (CASE WHEN (SELECT md5(string_agg(t.tgname::text || ':' || md5(pg_catalog.pg_get_triggerdef(t.oid)), ','
                                         ORDER BY t.tgname::text))
                    FROM pg_catalog.pg_trigger t
                    WHERE t.tgrelid = 'public.negocios'::regclass AND NOT t.tgisinternal)
                   IS DISTINCT FROM '5ea823983bef3bd8ca35e0ee499804c0'
              THEN 'os gatilhos de negocios mudaram desde 21/10' END),
        (CASE WHEN pg_catalog.to_regprocedure('public.fn_negocios_guardar_alteracao()') IS NULL
                OR md5(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('public.fn_negocios_guardar_alteracao()')))
                   IS DISTINCT FROM '5995a31b68f65202c9e1ddc6fe17f913'
              THEN 'fn_negocios_guardar_alteracao mudou desde 21/10' END),
        (CASE WHEN pg_catalog.to_regprocedure('public.fn_negocios_ref_utilizador_apagado(uuid,uuid)') IS NULL
                OR md5(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('public.fn_negocios_ref_utilizador_apagado(uuid,uuid)')))
                   IS DISTINCT FROM '6e45bfff81ab95e812b44d126cc3d75a'
              THEN 'fn_negocios_ref_utilizador_apagado mudou desde 21/10' END),
        (CASE WHEN (SELECT pg_catalog.pg_get_constraintdef(c.oid) FROM pg_catalog.pg_constraint c
                    WHERE c.conrelid = 'public.negocios'::regclass AND c.conname::text = 'negocios_estado_check')
                   IS DISTINCT FROM 'CHECK ((estado = ANY (ARRAY[''aberto''::text, ''ganho''::text, ''perdido''::text])))'
              THEN 'o CHECK de estado de negocios mudou' END),
        (CASE WHEN (SELECT count(*) FROM pg_catalog.pg_attribute a
                    WHERE a.attrelid = 'public.negocios'::regclass AND a.attnum > 0 AND NOT a.attisdropped
                      AND ((a.attname::text IN ('titulo', 'notas', 'estado')
                            AND pg_catalog.format_type(a.atttypid, a.atttypmod) = 'text')
                        OR (a.attname::text = 'assigned_to'
                            AND pg_catalog.format_type(a.atttypid, a.atttypmod) = 'uuid'))) <> 4
              THEN 'faltam colunas em negocios (titulo, notas, estado, assigned_to)' END),
        (CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
                           WHERE p.pronamespace = 'public'::regnamespace
                             AND p.proname::text = 'fn_negocios_fechado_so_leitura')
              THEN 'fn_negocios_fechado_so_leitura já existe' END),
        (CASE WHEN EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
                           WHERE p.pronamespace = 'public'::regnamespace AND p.prosrc LIKE '%NG028%')
              THEN 'o código NG028 já está em uso' END)
      ) AS e(motivo)) AS f;

-- 1. A função do gatilho.
CREATE FUNCTION public.fn_negocios_fechado_so_leitura()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $function$
BEGIN
  -- As funções neg_* e os gatilhos de decisão do fecho escrevem com a variável.
  IF COALESCE(current_setting('app.neg_via_funcao', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  -- Só a limpeza do comercial de um utilizador apagado passa (ON DELETE SET NULL).
  IF NEW.titulo IS NOT DISTINCT FROM OLD.titulo
     AND NEW.notas IS NOT DISTINCT FROM OLD.notas
     AND (NEW.assigned_to IS NOT DISTINCT FROM OLD.assigned_to
          OR public.fn_negocios_ref_utilizador_apagado(OLD.assigned_to, NEW.assigned_to)) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Este negócio está %: o título, as notas e o comercial já não se alteram. Reabra-o primeiro.',
    OLD.estado
    USING ERRCODE = 'NG028';
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_negocios_fechado_so_leitura() FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.fn_negocios_fechado_so_leitura() IS
  'Pessoas: gatilho que recusa (NG028) mudar titulo, notas ou assigned_to de um negócio ganho ou perdido, salvo com app.neg_via_funcao = on (funções neg_* e gatilhos do fecho) ou a limpeza do comercial de um utilizador apagado. 20261226230000.';

-- 2. O gatilho.
CREATE TRIGGER trg_01_negocios_fechado_so_leitura
  BEFORE UPDATE OF titulo, notas, assigned_to ON public.negocios
  FOR EACH ROW
  WHEN (OLD.estado IN ('ganho', 'perdido')
        AND (NEW.titulo IS DISTINCT FROM OLD.titulo
             OR NEW.notas IS DISTINCT FROM OLD.notas
             OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to))
  EXECUTE FUNCTION public.fn_negocios_fechado_so_leitura();

COMMENT ON TRIGGER trg_01_negocios_fechado_so_leitura ON public.negocios IS
  'Negócio ganho ou perdido: título, notas e comercial só de leitura (NG028). 20261226230000.';

-- ============================================================
-- CONFERIR (sem DO: a lista de falhas convertida em integer aborta a transacção)
-- ============================================================
SELECT CASE WHEN f.falhas IS NULL THEN 'CONFERIR: ok'
            ELSE ('CONFERIR falhou: ' || f.falhas)::integer::text END AS conferir
FROM (SELECT string_agg(e.motivo, '; ' ORDER BY e.motivo) AS falhas
      FROM (VALUES
        -- A função: esta versão, DEFINER, volátil, dono postgres, search_path, só o dono executa.
        (CASE WHEN NOT EXISTS (
                SELECT 1 FROM pg_catalog.pg_proc p
                WHERE p.oid = pg_catalog.to_regprocedure('public.fn_negocios_fechado_so_leitura()')
                  AND p.prosecdef AND p.provolatile::text = 'v'
                  AND pg_catalog.pg_get_userbyid(p.proowner)::text = 'postgres'
                  AND array_to_string(p.proconfig, ',') = 'search_path=public, pg_temp'
                  AND p.proacl::text = '{postgres=X/postgres}'
                  AND md5(replace(p.prosrc, chr(13), '')) = '86df6ae71849fd0a71c9ccc9adc45066')
              THEN 'fn_negocios_fechado_so_leitura não ficou como desenhada' END),
        (CASE WHEN (SELECT count(*) FROM pg_catalog.pg_proc p
                    WHERE p.pronamespace = 'public'::regnamespace
                      AND p.proname::text = 'fn_negocios_fechado_so_leitura') <> 1
              THEN 'há mais do que uma fn_negocios_fechado_so_leitura' END),
        -- O gatilho: activo, com esta função, este WHEN e estas colunas.
        (CASE WHEN NOT EXISTS (
                SELECT 1 FROM pg_catalog.pg_trigger t
                WHERE t.tgrelid = 'public.negocios'::regclass AND NOT t.tgisinternal
                  AND t.tgname::text = 'trg_01_negocios_fechado_so_leitura'
                  AND t.tgfoid = pg_catalog.to_regprocedure('public.fn_negocios_fechado_so_leitura()')
                  AND t.tgenabled::text = 'O' AND t.tgqual IS NOT NULL
                  AND md5(pg_catalog.pg_get_triggerdef(t.oid)) = '51c494969de354faa77f0b5de0e724e8')
              THEN 'o gatilho trg_01_negocios_fechado_so_leitura não ficou como desenhado' END),
        -- Os outros gatilhos de negocios e a guarda ficaram intactos.
        (CASE WHEN (SELECT md5(string_agg(t.tgname::text || ':' || md5(pg_catalog.pg_get_triggerdef(t.oid)), ','
                                         ORDER BY t.tgname::text))
                    FROM pg_catalog.pg_trigger t
                    WHERE t.tgrelid = 'public.negocios'::regclass AND NOT t.tgisinternal
                      AND t.tgname::text <> 'trg_01_negocios_fechado_so_leitura')
                   IS DISTINCT FROM '5ea823983bef3bd8ca35e0ee499804c0'
              THEN 'os outros gatilhos de negocios mudaram' END),
        (CASE WHEN md5(pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure('public.fn_negocios_guardar_alteracao()')))
                   IS DISTINCT FROM '5995a31b68f65202c9e1ddc6fe17f913'
              THEN 'fn_negocios_guardar_alteracao mudou' END)
      ) AS e(motivo)) AS f;

COMMIT;

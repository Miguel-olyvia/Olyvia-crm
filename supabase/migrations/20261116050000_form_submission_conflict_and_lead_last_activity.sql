-- Deduplicação de leads vindas de formulários públicos: duas colunas aditivas.
--
-- Contexto medido (SELECT ao remoto, 2026-09-02): na organização Mudelar há 43
-- entidades com mais do que uma lead ACTIVA -- 87 leads, 44 excedentes. Delas,
-- 71 entraram sem autor (formulário público) contra 16 criadas ao ecrã, porque
-- a deteção de duplicados só existe no ecrã. (Uma medição anterior falava de
-- 146 entidades; esse número contava também leads apagadas.) A invariante que se quer garantir é: uma lead
-- só nasce quando a entidade NÃO tem nenhuma; caso contrário a submissão
-- acumula em form_submissions, ligada ao registo que já existe.
--
-- Nada aqui é destrutivo: ambas as colunas são NULLABLE, sem default, e
-- nenhum dado existente muda de significado.
--
-- ── 1. form_submissions.conflicting_entity_id ────────────────────────────────
-- A resolução de identidade compara email (igualdade exata) e telefone
-- (últimos 9 dígitos) lidos pelo mapeamento do formulário. Existe um caso em
-- que a resposta não é uma entidade mas duas: o CONFLITO — o email aponta para
-- a entidade A e o telefone para a entidade B. Hoje form_submissions.entity_id
-- é uma coluna só e NOT NULL, portanto não há onde guardar a segunda
-- candidata, e é precisamente esse caso que tem de ir para a fila de revisão
-- humana (PendingFormSubmissions, com as saídas 'merged' e 'new_lead').
-- entity_id continua a ser a candidata primária (a do email);
-- conflicting_entity_id guarda a segunda (a do telefone) e fica NULL em todos
-- os outros sete resultados. ON DELETE SET NULL: se a segunda candidata for
-- apagada, o conflito deixa de existir mas a submissão mantém-se — nunca se
-- perde a submissão por causa da entidade secundária.
--
-- ── 2. anew_leads.last_activity_at ───────────────────────────────────────────
-- Quando uma lead já existente recebe uma submissão nova, precisa de subir ao
-- topo da listagem mesmo sem comercial atribuído. Nenhuma coluna existente
-- serve: last_contact_at significa "alguém contactou a pessoa" (é registo de
-- contacto humano, não de atividade recebida) e pipeline_dirty_at é uma marca
-- interna de recálculo do motor de estágios — escrever em qualquer uma delas
-- corromperia o significado de outra funcionalidade. Daí uma coluna própria.
--
-- Auditoria: anew_leads tem o trigger trg_audit_anew_leads
-- (fn_generic_entity_audit). A lista de colunas de ruído dessa função já
-- inclui 'last_activity_at' — confirmado por leitura do remoto (pg_proc.prosrc:
-- ARRAY['updated_at','search_text','contact_attempts','last_activity_at']) —
-- por isso a coluna nova não gera linhas de auditoria e não é preciso alterar
-- a função. form_submissions não tem trigger de auditoria genérica (só
-- form_submissions_check_target e form_submissions_set_updated_at), portanto
-- conflicting_entity_id também não exige alteração nenhuma à auditoria.

ALTER TABLE "public"."form_submissions"
  ADD COLUMN IF NOT EXISTS "conflicting_entity_id" "uuid";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.form_submissions'::regclass
      AND conname = 'form_submissions_conflicting_entity_id_fkey'
  ) THEN
    ALTER TABLE "public"."form_submissions"
      ADD CONSTRAINT "form_submissions_conflicting_entity_id_fkey"
      FOREIGN KEY ("conflicting_entity_id")
      REFERENCES "public"."anew_entities"("id") ON DELETE SET NULL;
  END IF;
END
$$;

COMMENT ON COLUMN "public"."form_submissions"."conflicting_entity_id" IS
  'Segunda entidade candidata quando a resolução de identidade dá CONFLITO (email -> entidade A, guardada em entity_id; telefone -> entidade B, guardada aqui). NULL em todos os outros resultados. Só as submissões com esta coluna preenchida vão para a fila de revisão humana.';

CREATE INDEX IF NOT EXISTS "idx_form_submissions_conflicting_entity_id"
  ON "public"."form_submissions" USING "btree" ("conflicting_entity_id")
  WHERE "conflicting_entity_id" IS NOT NULL;

ALTER TABLE "public"."anew_leads"
  ADD COLUMN IF NOT EXISTS "last_activity_at" timestamp with time zone;

COMMENT ON COLUMN "public"."anew_leads"."last_activity_at" IS
  'Momento da última atividade recebida na lead (por exemplo, uma submissão de formulário público que casou com a entidade), para a lead subir na listagem mesmo sem comercial atribuído. NÃO confundir com last_contact_at (contacto feito por alguém à pessoa) nem com pipeline_dirty_at (marca de recálculo do motor de estágios). Ignorada pela auditoria: consta da lista de colunas de ruído de fn_generic_entity_audit().';

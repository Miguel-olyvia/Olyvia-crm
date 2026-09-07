-- Corrige o COMMENT ON COLUMN de anew_leads.last_activity_at.
--
-- So o comentario: nao ha ALTER, nem indice, nem dados. A coluna, o tipo e o
-- comportamento ficam exactamente como estao.
--
-- O comentario escrito em 20261116050000 descrevia a regra que existia nesse
-- dia: a lead so era carimbada quando estava SEM COMERCIAL ATRIBUIDO ("para a
-- lead subir na listagem mesmo sem comercial atribuido"). Deixou de ser
-- verdade: a create-lead passou a carimbar qualquer lead ACTIVA da entidade,
-- tenha ou nao comercial. Um comentario que descreve a regra antiga e pior do
-- que nenhum -- e o que a proxima pessoa le antes de mexer na coluna.
--
-- Aproveita-se para dizer as duas coisas que passaram a depender da coluna:
--   * a ordenacao da lista, via a coluna gerada list_sort_at
--     (20261119010000), que e GREATEST(created_at, last_activity_at);
--   * o distintivo "Voltou a contactar" na lista de Leads, que so aparece
--     enquanto last_activity_at for MAIS RECENTE do que last_contact_at (ou
--     enquanto last_contact_at for nulo). Assim que alguem regista um
--     contacto, o aviso apaga-se sozinho: ele significa exactamente "esta
--     pessoa procurou-nos e ainda ninguem respondeu".

COMMENT ON COLUMN "public"."anew_leads"."last_activity_at" IS
  'Momento da ultima actividade RECEBIDA na lead: uma submissao do formulario publico que casou com uma entidade que ja tinha lead activa (nesse caso nao nasce ficha nova -- carimba-se esta coluna na ficha existente). Carimbada em qualquer lead activa da entidade, tenha ou nao comercial atribuido. NAO confundir com last_contact_at (contacto feito por alguem A pessoa) nem com pipeline_dirty_at (marca de recalculo do motor de estagios). Alimenta a coluna gerada list_sort_at, por onde a lista de Leads ordena, e o distintivo "Voltou a contactar", que so se mostra enquanto esta data for mais recente do que last_contact_at. Ignorada pela auditoria: consta da lista de colunas de ruido de fn_generic_entity_audit().';

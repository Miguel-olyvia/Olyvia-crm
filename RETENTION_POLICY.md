# Política de Retenção de Dados

Referência: RGPD Art. 5(1)(e) — princípio da limitação da conservação.
Implementação técnica: `supabase/migrations/20261105010000_data_retention_policy.sql`.

Esta política cobre as tabelas com dados pessoais/técnicos identificadas como
candidatas a ter um período de retenção definido. Está dividida em três
grupos: (1) expurgo automático já implementado, (2) dados de negócio que
requerem revisão manual, nunca eliminação automática, e (3) trilhos de
auditoria/compliance para os quais a retenção precisa de decisão de produto
antes de qualquer automatismo.

## 1. Expurgo automático implementado

| Tabela | Retenção | Mecanismo | Justificação |
|---|---|---|---|
| `auth_login_attempts` | 30 dias | `purge_old_login_attempts()`, agendado via pg_cron (`0 3 * * *`) se a extensão estiver disponível | Log de tentativas de login para rate limiting (ver `portal-login` Edge Function). Sem valor de negócio após a janela de investigação de abuso; 30 dias cobre bloqueio de IP e resposta a incidentes. |
| `sms_otp_codes` | 7 dias após `expires_at` | `purge_old_otp_codes()`, agendado via pg_cron (`15 3 * * *`) se disponível | Códigos OTP expiram em 5 minutos (ver `supabase/functions/sms-otp/index.ts`); o valor do código não tem utilidade depois de expirado. Mantém-se 7 dias para suporte/depuração antes de expurgar. |

Ambas as funções são `SECURITY DEFINER`, com `search_path` fixo, e revogadas
de `anon`/`authenticated` — só correm via `service_role`/pg_cron, seguindo o
mesmo padrão já usado em `entity_audit_log`.

**Nota sobre pg_cron:** o agendamento está dentro de um bloco `DO $$ ... $$`
condicional à existência da extensão (`pg_extension WHERE extname =
'pg_cron'`), o mesmo padrão já usado em
`20260625010000_entity_audit_log.sql`. Se o projeto Supabase não tiver
pg_cron ativo, a migração aplica-se sem erro mas o expurgo fica apenas
definido como função, sem execução agendada — terá de ser chamado
manualmente ou agendado por outro mecanismo (ex.: `pg_net`/webhook externo,
Supabase Cron da consola).

## 2. Dados de negócio — nunca eliminação automática

| Tabela | Situação | Proposta | Estado |
|---|---|---|---|
| `anew_leads` não convertidos | Sem atividade (`updated_at`/`last_contact_at`/`created_at`) há 24+ meses | Vista de leitura `public.leads_pending_retention_review` lista os candidatos para revisão humana. **Não apaga nada automaticamente.** | Implementado (só o relatório) |
| `anew_leads`, `anew_contacts`, `anew_clients`, `deals`, `proposals`, `quotes` | Dados convertidos/negócio ativo | Sem política de expurgo — retenção indefinida enquanto a relação comercial ou obrigação contabilística/fiscal se mantiver | Sem alterações — decisão de produto/jurídica, não técnica |

Leads não convertidos podem ainda ter valor de remarketing ou histórico de
pipeline; apagar automaticamente arrisca perder dados que o negócio queira
reaproveitar. A vista `leads_pending_retention_review` dá visibilidade sem
comprometer essa decisão.

## 3. Trilhos de auditoria/compliance — precisam de decisão antes de automatizar

| Tabela | Propósito | Observação |
|---|---|---|
| `entity_audit_log` | Histórico genérico de INSERT/UPDATE/DELETE em entidades (leads, contactos, clientes, deals, propostas, etc.) | **Já existe um job pg_cron pré-existente (`audit-log-cleanup`, `20260625010000_entity_audit_log.sql`) que apaga registos com mais de 90 dias.** Isto não foi alterado nesta tarefa, mas é preciso confirmar se 90 dias é suficiente para efeitos de responsabilização (Art. 5(2) RGPD) e de investigação de incidentes — muitas políticas de auditoria empresarial exigem 1–2 anos. **Recomendo rever este prazo com o utilizador antes de o dar como definitivo.** |
| `support_access_log` | Log de acessos "break-glass" de suporte a dados de clientes (aprovação/negação, duração, motivo) | Prova de quem acedeu a dados de outra organização e porquê. Recomenda-se retenção longa (ex.: 2 anos) por ser evidência de controlo de acesso a PII. Sem expurgo automático nesta tarefa — precisa de decisão. |
| `data_export_audit` | Log imutável de exportações controladas de dados (clients/contacts/quotes) | Trilho de responsabilização RGPD (quem exportou o quê, quando, com que âmbito). Recomenda-se retenção longa (ex.: 2 anos ou conforme obrigação legal aplicável). Sem expurgo automático nesta tarefa — precisa de decisão. |
| `client_portal_access_log` | Log de visualizações/ações de clientes no portal sobre os seus próprios documentos | Valor de segurança/suporte a incidentes mais do que de auditoria formal. Proposta razoável: 12 meses. Sem expurgo automático nesta tarefa — precisa de confirmação. |

Estas quatro tabelas não têm expurgo automático implementado por esta
migração (exceto o job pré-existente em `entity_audit_log`, que já lá
estava). São trilhos de auditoria/segurança e o prazo de retenção correto
depende de requisitos legais/contabilísticos e de política interna que não
compete a esta tarefa decidir sozinha.

## Resumo por tipo de dado (para o slide `slide-10-d`)

- **Tentativas de login (`auth_login_attempts`)**: 30 dias, expurgo automático.
- **Códigos OTP (`sms_otp_codes`)**: 7 dias após expirar, expurgo automático.
- **Leads não convertidos sem atividade**: sem prazo fixo de eliminação;
  revisão manual assistida por relatório após 24 meses de inatividade.
- **Dados de clientes/negócio ativo**: retidos enquanto durar a relação
  comercial ou obrigação legal associada.
- **Logs de auditoria e compliance** (`entity_audit_log`,
  `support_access_log`, `data_export_audit`, `client_portal_access_log`):
  retenção por definir formalmente (proposta: 90 dias a 2 anos consoante a
  tabela); nenhum expurgo novo foi automatizado nesta tarefa para além do
  job pré-existente em `entity_audit_log`.

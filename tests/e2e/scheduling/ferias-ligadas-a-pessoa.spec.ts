import { test, expect, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Ferias criadas pelo ecra de agendamento (quadro "Ferias e Ausencias").
 *
 * Verifica ponta a ponta o que a migration 20261214100000 muda: criar ferias pelo
 * ecra liga o item ao recurso da pessoa de ferias, grava-o sempre pendente, e o
 * recurso dessa pessoa deixa de ter horas livres nesse dia (dia inteiro) ou so
 * nessa faixa (ferias com horas).
 *
 * Escreve APENAS na organizacao nike e apaga os itens que cria. Credenciais e URL
 * da base vem do ambiente; nada e escrito aqui.
 */
const NIKE_ORG_ID = process.env.E2E_ORG_ID || 'b6ffce4f-f630-4933-833a-008649757a33'
const DIA_INTEIRO = '2026-11-10'
const DIA_COM_HORAS = '2026-11-11'

test.describe.configure({ timeout: 180_000 })

let sb: SupabaseClient
let meuRecursoId: string
const itensCriados: string[] = []

function credenciais(): { email: string; password: string } {
  const email = process.env.TEST_EMAIL
  const password = process.env.TEST_PASSWORD
  if (!email || !password) throw new Error('Faltam TEST_EMAIL e TEST_PASSWORD no ambiente.')
  return { email, password }
}

async function horasLivres(dia: string): Promise<number> {
  const { data, error } = await sb.rpc('get_resource_available_slots', {
    p_resource_id: meuRecursoId, p_date: dia, p_duration_minutes: 60,
    p_organization_id: NIKE_ORG_ID, p_min_advance_hours: 0,
  })
  if (error) throw new Error(error.message)
  return (data as unknown[]).length
}

async function abrirNovoItemDeFerias(page: Page) {
  await page.goto('/scheduling', { waitUntil: 'domcontentloaded' })
  await page.evaluate((id) => localStorage.setItem('activeCompanyId', id), NIKE_ORG_ID)
  await page.goto('/scheduling', { waitUntil: 'networkidle' })
  // No primeiro carregamento depois do login a app pode redirecionar para o painel.
  if (!page.url().includes('/scheduling')) await page.goto('/scheduling', { waitUntil: 'networkidle' })
  const ativa = await page.evaluate(() => localStorage.getItem('activeCompanyId'))
  expect(ativa, 'a organizacao activa tem de ser a nike').toBe(NIKE_ORG_ID)
  const novo = page.getByRole('button', { name: /New Schedule|Novo Agendamento/i })
  await novo.waitFor({ timeout: 60_000 })
  await novo.click()
  const dlg = page.getByRole('dialog')
  await dlg.waitFor()
  await dlg.getByRole('combobox').first().click()
  await page.getByRole('option', { name: 'Time Off' }).click()
  await dlg.getByRole('combobox').nth(0).waitFor()
  await dlg.getByRole('combobox').nth(1).click()
  await page.getByRole('option').first().click()
  return dlg
}

test.beforeAll(async () => {
  const { email, password } = credenciais()
  sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_PUBLISHABLE_KEY!)
  const { data: login, error } = await sb.auth.signInWithPassword({ email, password })
  if (error) throw new Error(error.message)
  const { data: u } = await sb.from('anew_users').select('id').eq('auth_user_id', login.user.id).single()
  const { data: r } = await sb.from('schedule_resources').select('id')
    .eq('organization_id', NIKE_ORG_ID).eq('user_id', u!.id).eq('is_active', true).limit(1).single()
  meuRecursoId = r!.id
})

test.afterAll(async () => {
  if (itensCriados.length) {
    await sb.from('schedule_items').delete().in('id', itensCriados).eq('organization_id', NIKE_ORG_ID)
  }
})

test('ferias de dia inteiro criadas pelo ecra: ligadas a pessoa, pendentes, e sem horas livres nesse dia', async ({ page }) => {
  expect(await horasLivres(DIA_INTEIRO)).toBeGreaterThan(0)

  const dlg = await abrirNovoItemDeFerias(page)
  await dlg.getByLabel(/All day/i).check().catch(async () => { await dlg.getByText('All day').click() })
  const datas = dlg.locator('input[type="date"]')
  await datas.nth(0).fill(DIA_INTEIRO)
  await datas.nth(1).fill(DIA_INTEIRO)
  await dlg.getByRole('button', { name: 'Create' }).click()
  await dlg.waitFor({ state: 'hidden', timeout: 20000 })

  const { data: itens } = await sb.from('schedule_items')
    .select('id, approval_status, all_day, user_id')
    .eq('organization_id', NIKE_ORG_ID).ilike('title', '%Vacation%').gte('start_datetime', `${DIA_INTEIRO}T00:00:00Z`)
    .lte('start_datetime', `${DIA_INTEIRO}T23:59:59Z`)
  expect(itens?.length, 'o item de ferias foi criado').toBeGreaterThan(0)
  itens!.forEach(i => itensCriados.push(i.id))
  expect(itens![0].approval_status).toBe('pending')

  const { data: lig } = await sb.from('schedule_item_assignees').select('resource_id').eq('item_id', itens![0].id)
  expect((lig || []).map(l => l.resource_id)).toEqual([meuRecursoId])

  expect(await horasLivres(DIA_INTEIRO)).toBe(0)
})

test('ferias com horas criadas pelo ecra: so essa faixa fica indisponivel', async ({ page }) => {
  const antes = await horasLivres(DIA_COM_HORAS)
  expect(antes).toBeGreaterThan(0)

  const dlg = await abrirNovoItemDeFerias(page)
  const horas = dlg.locator('input[type="datetime-local"]')
  await horas.nth(0).fill(`${DIA_COM_HORAS}T09:00`)
  await horas.nth(1).fill(`${DIA_COM_HORAS}T10:00`)
  await dlg.getByRole('button', { name: 'Create' }).click()
  await dlg.waitFor({ state: 'hidden', timeout: 20000 })

  const { data: itens } = await sb.from('schedule_items')
    .select('id').eq('organization_id', NIKE_ORG_ID).ilike('title', '%Vacation%')
    .gte('start_datetime', `${DIA_COM_HORAS}T00:00:00Z`).lte('start_datetime', `${DIA_COM_HORAS}T23:59:59Z`)
  itens?.forEach(i => itensCriados.push(i.id))

  const depois = await horasLivres(DIA_COM_HORAS)
  expect(depois).toBeLessThan(antes)
  expect(depois).toBeGreaterThan(0)
})

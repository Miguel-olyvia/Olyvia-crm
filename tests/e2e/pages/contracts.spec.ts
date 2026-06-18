import { test, expect } from '@playwright/test'
import { ContractsPage } from '../../fixtures/pages'

test.describe('Contratos', () => {
  let page: ContractsPage

  test.beforeEach(async ({ page: p }) => {
    page = new ContractsPage(p)
    await page.goto()
    await page.waitForContent()
  })

  test('página carrega sem erros', async ({ page: p }) => {
    await expect(p).not.toHaveTitle(/not found|404/i)
    await expect(p.locator('body')).not.toContainText('Error')
  })

  test('tabela está sempre visível mesmo sem dados', async () => {
    await expect(page.table()).toBeVisible()
  })

  test('cabeçalhos da tabela existem', async () => {
    const headers = page.tableHeaders()
    await expect(headers.first()).toBeVisible()
    const count = await headers.count()
    expect(count).toBeGreaterThan(3)
  })

  test('estado vazio ou linhas de dados são mostrados', async ({ page: p }) => {
    const emptyState = page.emptyState()
    const rows = p.locator('table tbody tr')
    const emptyVisible = await emptyState.isVisible().catch(() => false)
    const rowCount = await rows.count()
    expect(emptyVisible || rowCount > 0).toBe(true)
  })

  test('botão Novo Contrato existe', async () => {
    await expect(page.newButton()).toBeVisible()
  })

  test('tab Lista está visível por defeito', async () => {
    await expect(page.tabLista()).toBeVisible()
  })

  test('tab Dashboard existe e é clicável', async ({ page: p }) => {
    await expect(page.tabDashboard()).toBeVisible()
    await page.tabDashboard().click()
    await p.waitForLoadState('networkidle')
  })

  test('tab Renovações existe e é clicável', async ({ page: p }) => {
    await expect(page.tabRenovacoes()).toBeVisible()
    await page.tabRenovacoes().click()
    await p.waitForLoadState('networkidle')
  })

  test('tab Assinaturas existe e é clicável', async ({ page: p }) => {
    await expect(page.tabAssinaturas()).toBeVisible()
    await page.tabAssinaturas().click()
    await p.waitForLoadState('networkidle')
  })

  test('tab Documentos existe e é clicável', async ({ page: p }) => {
    await expect(page.tabDocumentos()).toBeVisible()
    await page.tabDocumentos().click()
    await p.waitForLoadState('networkidle')
  })

  test('tab Minutas existe e é clicável', async ({ page: p }) => {
    await expect(page.tabMinutas()).toBeVisible()
    await page.tabMinutas().click()
    await p.waitForLoadState('networkidle')
  })
})

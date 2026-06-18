import { test, expect } from '@playwright/test'
import { ProposalsPage } from '../../fixtures/pages'

test.describe('Propostas', () => {
  let page: ProposalsPage

  test.beforeEach(async ({ page: p }) => {
    page = new ProposalsPage(p)
    await page.goto()
    await page.waitForContent()
  })

  test('página carrega sem erros', async ({ page: p }) => {
    await expect(p).not.toHaveTitle(/not found|404/i)
  })

  test('botão Nova Proposta existe', async () => {
    await expect(page.newButton()).toBeVisible()
  })

  test('tab Lista existe', async () => {
    await expect(page.tabLista()).toBeVisible()
  })

  test('tab Kanban existe e é clicável', async ({ page: p }) => {
    await expect(page.tabKanban()).toBeVisible()
    await page.tabKanban().click()
    await p.waitForLoadState('networkidle')
    await expect(p.locator('body')).not.toContainText('Error')
  })

  test('tab Dashboard existe e é clicável', async ({ page: p }) => {
    await expect(page.tabDashboard()).toBeVisible()
    await page.tabDashboard().click()
    await p.waitForLoadState('networkidle')
  })

  test('estado vazio ou conteúdo são mostrados', async ({ page: p }) => {
    const emptyVisible = await page.emptyState().isVisible().catch(() => false)
    const hasCards = await p.locator('[class*="card"], table tr').count()
    expect(emptyVisible || hasCards > 0).toBe(true)
  })
})

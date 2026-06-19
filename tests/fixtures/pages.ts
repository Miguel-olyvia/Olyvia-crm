import { Page } from '@playwright/test'

export class AppPage {
  constructor(readonly page: Page) {}

  async goto(path: string) {
    await this.page.goto(path)
    await this.page.waitForLoadState('networkidle')
  }

  async waitForContent() {
    await this.page.waitForLoadState('networkidle')
    await this.page.locator('[class*="animate-spin"]').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {})
  }

  sidebar()      { return this.page.locator('[data-app-sidebar="true"]') }
  toastSuccess() { return this.page.locator('[data-sonner-toast][data-type="success"], [role="status"]').first() }
}

export class DashboardPage extends AppPage {
  async goto() { await super.goto('/dashboard') }
  heading()    { return this.page.locator('h1, h2').first() }
}

export class ContractsPage extends AppPage {
  async goto() { await super.goto('/client-contracts') }

  table()          { return this.page.locator('table') }
  tableHeaders()   { return this.page.locator('table thead th') }
  emptyState()     { return this.page.locator('text=Nenhum contrato encontrado') }
  newButton()      { return this.page.locator('button', { hasText: 'Novo Contrato' }) }
  searchInput()    { return this.page.locator('input[placeholder*="número"]') }
  tabLista()       { return this.page.locator('button[role="tab"]', { hasText: 'Lista' }) }
  tabDashboard()   { return this.page.locator('button[role="tab"]', { hasText: 'Dashboard' }) }
  tabRenovacoes()  { return this.page.locator('button[role="tab"]', { hasText: 'Renovações' }) }
  tabAssinaturas() { return this.page.locator('button[role="tab"]', { hasText: 'Assinaturas' }) }
  tabDocumentos()  { return this.page.locator('button[role="tab"]', { hasText: 'Documentos' }) }
  tabMinutas()     { return this.page.locator('button[role="tab"]', { hasText: 'Minutas' }) }
}

export class ProposalsPage extends AppPage {
  async goto() { await super.goto('/proposals') }

  newButton()    { return this.page.locator('button', { hasText: 'Nova Proposta' }) }
  emptyState()   { return this.page.locator('text=Nenhuma proposta') }
  tabLista()     { return this.page.locator('button[role="tab"]', { hasText: 'Lista' }) }
  tabKanban()    { return this.page.locator('button[role="tab"]', { hasText: 'Kanban' }) }
  tabDashboard() { return this.page.locator('button[role="tab"]', { hasText: 'Dashboard' }) }
}

export class QuotesPage extends AppPage {
  async goto() { await super.goto('/quotes') }

  newButton()   { return this.page.locator('button', { hasText: 'Novo Orçamento' }).first() }
  searchInput() { return this.page.locator('input[placeholder*="título"], input[placeholder*="cliente"]').first() }
  table()       { return this.page.locator('table') }
}

export class ClientsPage extends AppPage {
  async goto() { await super.goto('/clients') }

  newButton()   { return this.page.locator('button', { hasText: 'Novo Cliente' }).first() }
  searchInput() { return this.page.locator('input[type="search"], input[placeholder*="pesquis"], input[placeholder*="nome"]').first() }
  table()       { return this.page.locator('table') }
}

export class LeadsPage extends AppPage {
  async goto() { await super.goto('/leads') }

  newButton()   { return this.page.locator('button', { hasText: 'Novo Lead' }).first() }
  searchInput() { return this.page.locator('input[type="search"], input[placeholder*="pesquis"]').first() }
}

export class ContactsPage extends AppPage {
  async goto() { await super.goto('/contacts') }

  newButton()   { return this.page.locator('button', { hasText: 'Novo Contacto' }).first() }
  searchInput() { return this.page.locator('input[type="search"], input[placeholder*="pesquis"]').first() }
}

export class OrganizationsPage extends AppPage {
  async goto() { await super.goto('/organizations') }
  heading()     { return this.page.locator('h1', { hasText: 'Organizações' }) }
  newButton()   { return this.page.locator('button', { hasText: 'Nova Organização' }).first() }
}

export class ProductsPage extends AppPage {
  async goto() { await super.goto('/products') }

  newButton()    { return this.page.locator('button', { hasText: 'Novo Produto' }).first() }
  searchInput()  { return this.page.locator('input[placeholder*="pesquis"], input[placeholder*="produto"]').first() }
  table()        { return this.page.locator('table') }
  importButton() { return this.page.locator('button', { hasText: 'Importar' }).first() }
}

export class DealsPage extends AppPage {
  async goto() { await super.goto('/deals') }
  newButton()   { return this.page.locator('button', { hasText: 'Novo Negócio' }).first() }
}

export class UsersPage extends AppPage {
  async goto() { await super.goto('/users') }
  table()       { return this.page.locator('table') }
  newButton()   { return this.page.locator('button', { hasText: 'Novo Utilizador' }).first() }
}

export class SettingsPage extends AppPage {
  async goto() { await super.goto('/settings') }
}

export class SchedulingPage extends AppPage {
  async goto() { await super.goto('/scheduling') }
}

export class NotificationsPage extends AppPage {
  async goto() { await super.goto('/notifications') }
}

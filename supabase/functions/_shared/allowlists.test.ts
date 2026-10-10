import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  classifyCompanyCamRequest,
  classifyHubSpotRequest,
  sanitizeCompanyCamParams,
  sanitizeHubSpotBatchRead,
} from './allowlists.ts'

const DEAL_PROPS = [
  'dealname', 'dealstage', 'closedate', 'createdate', 'amount',
  'total_surface_in_m2', 'type_of_service', 'expected_month_for_the_job',
  'expected_season_for_the_job', 'expected_year_for_the_job',
].join(',')

describe('hubspot allowlist matches app call sites', () => {
  const allowed: Array<[string, string, 'field' | 'office']> = [
    ['GET', '/crm/v3/pipelines/deals', 'office'],
    ['GET', '/crm/v3/objects/contacts?properties=hs_analytics_source,hubspot_owner_id,createdate&limit=100', 'office'],
    ['GET', '/crm/v3/objects/contacts?properties=hs_analytics_source,hubspot_owner_id,createdate&limit=100&after=abc123', 'office'],
    ['GET', '/crm/v3/objects/deals?properties=dealstage,closedate,hubspot_owner_id,amount,createdate&associations=contacts&limit=100', 'office'],
    ['GET', '/crm/v3/objects/contacts/123?properties=hubspot_owner_id', 'office'],
    ['GET', '/crm/v3/owners/32059962', 'office'],
    ['GET', `/crm/v3/objects/invoices/99?properties=${encodeURIComponent('hs_number')}`, 'office'],
    ['GET', '/crm/v3/objects/products?limit=100&properties=name,hs_sku,price,hs_status,hs_product_type', 'field'],
    ['GET', '/crm/v3/properties/deals/type_of_service', 'field'],
    ['POST', '/crm/v3/objects/deals/batch/read', 'field'],
    ['GET', '/crm/v3/objects/deals/55/associations/line_items', 'field'],
    ['GET', '/crm/v3/objects/quotes/55/associations/line_items', 'field'],
    ['GET', '/crm/v3/objects/invoices/55/associations/line_items', 'field'],
    ['POST', '/crm/v3/objects/line_items/batch/read', 'field'],
    ['GET', '/crm/v3/objects/contacts/55/associations/deals', 'field'],
    ['GET', '/crm/v3/objects/contacts/55/associations/quotes', 'field'],
    ['GET', '/crm/v3/objects/contacts/55/associations/invoices', 'field'],
    ['GET', `/crm/v3/objects/deals/55?properties=${DEAL_PROPS}`, 'field'],
    ['GET', '/crm/v3/objects/deals/55/associations/quotes', 'office'],
    ['POST', '/crm/v3/objects/quotes/batch/read', 'office'],
    ['GET', '/crm/v3/objects/contacts/55?properties=firstname,lastname,email,address,city,zip,state,country,createdate,hubspot_owner_id', 'office'],
    ['POST', '/crm/v3/objects/contacts/batch/read', 'office'],
    ['GET', '/crm/v3/objects/contacts/55?properties=createdate', 'field'],
    ['GET', '/crm/v3/objects/deals/55?properties=createdate,closedate', 'field'],
    ['GET', '/crm/v4/objects/contacts/55/associations/0-53', 'office'],
    ['GET', '/crm/v4/objects/contacts/55/associations/invoices', 'office'],
    ['POST', '/crm/v3/objects/invoices/search', 'office'],
    ['POST', '/crm/v3/objects/invoices/batch/read', 'office'],
    ['GET', '/crm/v3/objects/deals/55?properties=address,city,zip,state,country,job_address,job_site_address,chantier_address', 'field'],
  ]

  for (const [method, path, tier] of allowed) {
    it(`${method} ${path.split('?')[0]} is ${tier}`, () => {
      const decision = classifyHubSpotRequest(method, path)
      assert.ok(decision, `expected allow ${method} ${path}`)
      assert.equal(decision.tier, tier)
      assert.equal(decision.method, method)
    })
  }
})

describe('hubspot allowlist rejects open proxy', () => {
  const rejected = [
    ['DELETE', '/crm/v3/objects/contacts/1'],
    ['PATCH', '/crm/v3/objects/contacts/1'],
    ['PUT', '/crm/v3/objects/deals/1'],
    ['GET', '/crm/v3/objects/companies'],
    ['GET', '/crm/v3/objects/contacts/1/associations/companies'],
    ['POST', '/crm/v3/objects/contacts'],
    ['POST', '/crm/v3/objects/deals'],
    ['GET', '/crm/v3/owners'],
    ['GET', 'https://evil.example/crm/v3/pipelines/deals'],
    ['GET', '/crm/v3/pipelines/deals/../../account-info/v3/api-usage'],
    ['GET', '/crm/v3/objects/contacts/1%2fproperties'],
    ['GET', '//api.hubapi.com/crm/v3/objects/contacts'],
    ['GET', '/crm/v3/objects/contacts/abc'],
    ['POST', '/crm/v3/objects/deals/batch/read/extra'],
    ['GET', '/crm/v3/objects/deals/batch/read'],
    ['GET', '/integrations/v1/me'],
  ]

  for (const [method, path] of rejected) {
    it(`rejects ${method} ${path}`, () => {
      assert.equal(classifyHubSpotRequest(method, path), null)
    })
  }

  it('sanitizes batch/read and drops idProperty', () => {
    assert.deepEqual(
      sanitizeHubSpotBatchRead({
        properties: ['dealname', 'amount'],
        inputs: [{ id: '42' }],
      }),
      { properties: ['dealname', 'amount'], inputs: [{ id: '42' }] },
    )
    assert.equal(
      sanitizeHubSpotBatchRead({
        properties: ['dealname'],
        inputs: [{ id: '42' }],
        idProperty: 'email',
      }),
      null,
    )
    assert.equal(sanitizeHubSpotBatchRead({ properties: ['bad-name'], inputs: [{ id: '1' }] }), null)
  })
})

describe('companycam allowlist matches app call sites', () => {
  const allowed: Array<[string, string, 'field' | 'office']> = [
    ['GET', '/projects', 'field'],
    ['GET', 'projects', 'field'],
    ['GET', '/projects/9988', 'field'],
    ['GET', '/projects/9988/photos', 'field'],
    ['GET', '/projects/9988/labels', 'field'],
    ['POST', '/projects', 'office'],
    ['PUT', '/projects/9988', 'office'],
    ['DELETE', '/projects/9988', 'office'],
  ]

  for (const [method, endpoint, tier] of allowed) {
    it(`${method} ${endpoint} is ${tier}`, () => {
      const decision = classifyCompanyCamRequest(method, endpoint)
      assert.ok(decision)
      assert.equal(decision.tier, tier)
    })
  }

  it('rejects unused CompanyCam routes and traversal', () => {
    for (const [method, endpoint] of [
      ['GET', '/users'],
      ['GET', '/tags'],
      ['DELETE', '/photos/1'],
      ['POST', '/projects/1/photos'],
      ['PATCH', '/projects/1'],
      ['GET', '/projects/1/photos/../../users'],
      ['GET', '/projects/1?status=active'],
      ['DELETE', '/projects'],
    ]) {
      assert.equal(classifyCompanyCamRequest(method, endpoint), null, `${method} ${endpoint}`)
    }
  })

  it('allows only the query params the app sends', () => {
    assert.deepEqual(
      sanitizeCompanyCamParams({ page: 1, per_page: 25, status: 'active', query: 'Rue de la Loi' }),
      { page: '1', per_page: '25', status: 'active', query: 'Rue de la Loi' },
    )
    assert.equal(sanitizeCompanyCamParams({ page: 1, token: 'x' }), null)
    assert.deepEqual(sanitizeCompanyCamParams(null), {})
  })
})

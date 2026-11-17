import { fetchProductPage } from '@/catalog/catalog-api'
import { reindexSearchCatalog } from '@/catalog/admin-products-api'
import { fetchOlapAnalytics, syncOlapAnalytics } from '@/metrics/analytics-api'
import { backofficeApi, storefrontApi } from '@/services/api/clients'

describe('Module 4 OpenSearch & ClickHouse OLAP', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('reads OpenSearch engine and brand facets from /products metadata', async () => {
    jest.spyOn(storefrontApi, 'get').mockResolvedValueOnce({
      data: [],
      metadata: {
        total: 0,
        page: 1,
        pageCount: 1,
        limit: 20,
        searchEngine: 'opensearch',
        facets: { brands: [{ key: 'CommerceLab', count: 3 }] },
      },
    } as never)

    const page = await fetchProductPage({ q: 'backpack', page: 1, sort: 'newest', limit: 20 })
    expect(page.searchEngine).toBe('opensearch')
    expect(page.facets?.brands?.[0]).toEqual({ key: 'CommerceLab', count: 3 })
  })

  it('calls gateway /admin/search/reindex when reindexing catalog', async () => {
    const spy = jest.spyOn(storefrontApi, 'post').mockResolvedValueOnce({
      data: { indexedCount: 5, indexName: 'catalog_products' },
    } as never)

    const res = await reindexSearchCatalog()
    expect(res.indexedCount).toBe(5)
    expect(spy).toHaveBeenCalledWith('/admin/search/reindex', {}, { skipUnauthorizedHandler: true })
  })

  it('calls ClickHouse analytics & sync endpoints via backofficeApi without silent fallback', async () => {
    const getSpy = jest.spyOn(backofficeApi, 'get').mockResolvedValueOnce({
      data: {
        kpis: { totalOrders: 3 },
        byWarehouse: [],
        byStatus: [],
        metadata: { source: 'ClickHouse OLAP', lagSeconds: 10 },
      },
    } as never)
    const olap = await fetchOlapAnalytics('7D')
    expect(olap.metadata.source).toBe('ClickHouse OLAP')
    expect(getSpy).toHaveBeenCalledWith('/backoffice/analytics/olap', {
      params: { period: '7D' },
      skipUnauthorizedHandler: true,
    })

    const postSpy = jest.spyOn(backofficeApi, 'post').mockRejectedValueOnce(new Error('503'))
    await expect(syncOlapAnalytics()).rejects.toThrow('503')
    expect(postSpy).toHaveBeenCalledWith('/backoffice/analytics/sync', {}, { skipUnauthorizedHandler: true })
  })
})

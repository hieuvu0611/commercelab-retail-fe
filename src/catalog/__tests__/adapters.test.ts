import type { CategoryNode } from '@/types/catalog'
import {
  categoriesFromList,
  effectiveFromForApi,
  normalizeTree,
  slugify,
  toListItem,
  toPriceHistory,
  toProductDetail,
  toUploadUrl,
} from '../adapters'

const node = (over: Partial<CategoryNode>): CategoryNode => ({
  id: 'c1',
  parentId: null,
  name: 'Backpacks',
  slug: 'backpacks',
  path: '/backpacks',
  depth: 1,
  sortOrder: 0,
  isActive: true,
  children: [],
  ...over,
})

describe('catalogue adapters', () => {
  it('turns a name into a service slug', () => {
    expect(slugify('City  Backpack 20 L!')).toBe('city-backpack-20-l')
    expect(slugify('Balo Đựng Laptop')).toBe('balo-dung-laptop')
  })

  it('removes the leading slash of tree paths and fills parentId and isActive', () => {
    const tree = normalizeTree([
      {
        ...node({}),
        parentId: undefined,
        isActive: undefined,
        children: [node({ id: 'c2', path: '/backpacks/city' })],
      } as never,
    ])
    expect(tree[0]).toMatchObject({ path: 'backpacks', parentId: null, isActive: true })
    expect(tree[0].children[0]).toMatchObject({ path: 'backpacks/city', parentId: 'c1' })
  })

  it('builds the admin tree from the flat list, keeping inactive categories', () => {
    const tree = categoriesFromList([
      {
        id: 'c2',
        parentId: 'c1',
        name: 'City',
        slug: 'city',
        path: '/backpacks/city',
        depth: 2,
        sortOrder: 0,
        isActive: false,
      },
      {
        id: 'c1',
        parentId: '',
        name: 'Backpacks',
        slug: 'backpacks',
        path: '/backpacks',
        depth: 1,
        sortOrder: 0,
        isActive: true,
      },
    ])
    expect(tree).toHaveLength(1)
    expect(tree[0].children[0]).toMatchObject({
      id: 'c2',
      parentId: 'c1',
      isActive: false,
      path: 'backpacks/city',
    })
  })

  it('reads list options as attributes and a missing image as null', () => {
    const item = toListItem({ id: 'p', options: { color: ['Black'] } })
    expect(item.attributes).toEqual({ color: ['Black'] })
    expect(item.imageUrl).toBeNull()
  })

  it('drops SKUs without a price from the product page', () => {
    const detail = toProductDetail({
      skus: [
        { skuId: 'A', attributes: {}, unitPriceVnd: 300000 },
        { skuId: 'B', attributes: {}, unitPriceVnd: null },
      ],
    })
    expect(detail.skus.map((sku) => sku.skuId)).toEqual(['A'])
    expect(detail.skus[0].isActive).toBe(true)
  })

  it('reduces price history timestamps to dates', () => {
    const history = toPriceHistory({
      history: [{ unitPriceVnd: 1, effectiveFrom: '2026-12-01T00:00:00Z', effectiveTo: null }],
    })
    expect(history).toEqual([{ unitPriceVnd: 1, effectiveFrom: '2026-12-01', effectiveTo: null }])
  })

  it('sends a start date only when it is in the future', () => {
    expect(effectiveFromForApi('2026-11-15', '2026-11-15')).toBeUndefined()
    expect(effectiveFromForApi('2026-12-01', '2026-11-15')).toBe('2026-12-01T00:00:00+07:00')
  })

  it('names the upload key objectKey', () => {
    expect(toUploadUrl({ uploadUrl: '/u', key: 'k' }).objectKey).toBe('k')
  })
})

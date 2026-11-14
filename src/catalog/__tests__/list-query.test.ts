import { listStateToSearch, parseListState, toApiQuery } from '../list-query'

const parse = (search: string) => parseListState(new URLSearchParams(search))

describe('parseListState', () => {
  it('reads price range, attribute facets, sort and page', () => {
    expect(
      parse('minPrice=100000&maxPrice=500000&attr.color=Black,Navy&sort=price_asc&page=2')
    ).toEqual({
      minPrice: 100000,
      maxPrice: 500000,
      attrs: { color: ['Black', 'Navy'] },
      sort: 'price_asc',
      page: 2,
    })
  })

  it('falls back to defaults for invalid values', () => {
    expect(parse('minPrice=abc&sort=hax&page=-3')).toEqual({ attrs: {}, sort: 'newest', page: 1 })
  })
})

describe('listStateToSearch', () => {
  it('omits defaults and round-trips the state', () => {
    const state = parse('attr.color=Black&sort=price_desc&page=3&maxPrice=900000')
    const search = listStateToSearch(state, 'bag')
    expect(search.get('q')).toBe('bag')
    expect(parse(search.toString())).toEqual(state)
    expect(listStateToSearch(parse('')).toString()).toBe('')
  })
})

describe('toApiQuery', () => {
  it('maps the state to GET /products parameters', () => {
    expect(
      toApiQuery({
        category: 'backpacks/city',
        attrs: { color: ['Black', 'Navy'] },
        sort: 'newest',
        page: 2,
        limit: 12,
      })
    ).toEqual({
      category: 'backpacks/city',
      'attr.color': 'Black,Navy',
      sort: 'newest',
      page: 2,
      limit: 12,
    })
  })
})

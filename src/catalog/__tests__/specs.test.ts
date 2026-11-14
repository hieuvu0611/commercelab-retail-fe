import { axesFromText, specsFromText, specsToText } from '../specs'

describe('specs text', () => {
  it('round-trips name and value pairs and keeps colons inside values', () => {
    const specs = { Material: 'Recycled polyester', Ratio: '3:1' }
    expect(specsFromText(specsToText(specs))).toEqual(specs)
  })

  it('ignores blank and malformed lines', () => {
    expect(specsFromText('Weight: 1 kg\n\nnonsense\n: no name\nEmpty:  ')).toEqual({
      Weight: '1 kg',
    })
  })
})

describe('axesFromText', () => {
  it('trims, lower-cases and de-duplicates', () => {
    expect(axesFromText(' Color, capacity ,, COLOR')).toEqual(['color', 'capacity'])
    expect(axesFromText('')).toEqual([])
  })
})

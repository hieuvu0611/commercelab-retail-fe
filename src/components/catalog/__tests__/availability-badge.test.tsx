import { render, screen } from '@testing-library/react'
import { AvailabilityBadge } from '../availability-badge'

describe('AvailabilityBadge', () => {
  it('names the state in words so colour is not the only cue', () => {
    render(<AvailabilityBadge state="LOW" />)
    expect(screen.getByText('Low stock')).toBeVisible()
  })

  it('renders nothing for unknown', () => {
    const { container } = render(<AvailabilityBadge state="unknown" />)
    expect(container).toBeEmptyDOMElement()
  })
})

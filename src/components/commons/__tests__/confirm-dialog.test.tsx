import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from '../confirm-dialog'

function setup(isBusy = false) {
  const onConfirm = jest.fn()
  const onCancel = jest.fn()
  render(
    <>
      <button>opener</button>
      <ConfirmDialog
        title="Delete this?"
        confirmLabel="Delete it"
        isBusy={isBusy}
        onConfirm={onConfirm}
        onCancel={onCancel}
      >
        <p>Details</p>
      </ConfirmDialog>
    </>
  )
  return { onConfirm, onCancel }
}

describe('ConfirmDialog', () => {
  it('names itself, starts on the safe choice and confirms or cancels', async () => {
    const user = userEvent.setup()
    const { onConfirm, onCancel } = setup()
    expect(screen.getByRole('alertdialog', { name: 'Delete this?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Delete it' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('cancels on Escape and keeps Tab inside', async () => {
    const user = userEvent.setup()
    const { onCancel } = setup()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Delete it' })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('disables the confirm button while busy', () => {
    setup(true)
    expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled()
  })
})

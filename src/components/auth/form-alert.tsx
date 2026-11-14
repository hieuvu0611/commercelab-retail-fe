// A form-level message (for example "wrong password") announced to screen readers when it appears.
export function FormAlert({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p role="alert" className="border-l-4 border-error bg-paper-2 px-4 py-3 text-sm text-ink">
      {message}
    </p>
  )
}

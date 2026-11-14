import { forwardRef, useId, type InputHTMLAttributes } from 'react'
import { cn } from '@/utils/tw-merge'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  /** Validation message shown under the field; it also marks the field invalid for assistive technology. */
  error?: string
  hint?: string
}

// A labelled input in the storefront's editorial style. The label is always visible; the error and hint are
// tied to the input with aria-describedby so a screen reader announces them with the field.
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, className, id, ...props },
  ref
) {
  const generatedId = useId()
  const inputId = id ?? `field-${generatedId}`
  const errorId = `${inputId}-error`
  const hintId = `${inputId}-hint`
  const describedBy =
    [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="font-label text-sm text-ink">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'h-11 w-full rounded-control border border-rule-2 bg-paper px-3 text-base text-ink',
          'placeholder:text-muted disabled:cursor-not-allowed disabled:opacity-50',
          error && 'border-error',
          className
        )}
        {...props}
      />
      {hint && !error && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-error">
          {error}
        </p>
      )}
    </div>
  )
})

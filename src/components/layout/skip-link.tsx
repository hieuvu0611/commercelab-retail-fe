export const MAIN_CONTENT_ID = 'main-content'

// Off-screen until focused; the first Tab stop on every shell page.
export function SkipLink() {
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="font-label fixed left-4 top-2 z-(--z-skip-link) -translate-y-[200%] bg-ink px-4 py-2 text-sm text-paper focus-visible:translate-y-0"
    >
      Skip to content
    </a>
  )
}

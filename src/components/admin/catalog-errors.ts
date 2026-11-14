import { ApiError } from '@/services/api/api-error'

const GENERIC = 'We could not complete this change. Please try again.'

/** Plain-words message for a failed catalogue call. Field errors are shown next to their fields instead. */
export function catalogFailureMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return GENERIC
  switch (error.code) {
    case 'CATEGORY_NOT_EMPTY':
      return 'This category still has subcategories or products. Move or remove them first.'
    case 'CATEGORY_CYCLE':
      return 'A category cannot be moved under itself or one of its own subcategories.'
    case 'VERSION_CONFLICT':
      return 'Someone else changed this product while you were editing. Reload to see their changes, then apply yours again.'
  }
  if (error.status === 403) return 'You do not have permission to do this.'
  if (error.status === 404) return 'This item no longer exists. Reload the page.'
  if (error.kind === 'network' || error.kind === 'timeout' || error.status === 503)
    return 'This is temporarily unavailable. Please try again shortly.'
  return GENERIC
}

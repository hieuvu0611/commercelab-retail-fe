/** Roles that may read orders in the backoffice. A contract guess: the real list comes with P5-T10. */
export const ORDER_VIEW_ROLES = [
  'SUPPORT_AGENT',
  'SUPPORT_LEAD',
  'OPS_MGR',
  'WAREHOUSE_MGR',
] as const

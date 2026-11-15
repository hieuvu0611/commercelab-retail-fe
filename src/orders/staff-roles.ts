/** Roles that may read orders in the backoffice (GET /admin/orders). */
export const ORDER_VIEW_ROLES = [
  'SUPPORT_AGENT',
  'SUPPORT_LEAD',
  'OPS_MGR',
  'WAREHOUSE_MGR',
] as const

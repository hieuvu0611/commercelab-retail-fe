// The roles of the business blueprint (docs/01 section 3), as the identity service knows them (P1-T05).

export interface RoleOption {
  value: string
  label: string
  /** Grants of this role can be limited to one warehouse. */
  isWarehouseRole: boolean
}

export const ROLE_OPTIONS: readonly RoleOption[] = [
  { value: 'CUSTOMER', label: 'Customer', isWarehouseRole: false },
  { value: 'PRODUCT_STAFF', label: 'Product staff', isWarehouseRole: false },
  { value: 'MARKETING', label: 'Marketing', isWarehouseRole: false },
  { value: 'PROCUREMENT', label: 'Procurement', isWarehouseRole: false },
  { value: 'WAREHOUSE_STAFF', label: 'Warehouse staff', isWarehouseRole: true },
  { value: 'WAREHOUSE_MGR', label: 'Warehouse manager', isWarehouseRole: true },
  { value: 'DELIVERY_COORD', label: 'Delivery coordination', isWarehouseRole: false },
  { value: 'SUPPORT_AGENT', label: 'Support agent', isWarehouseRole: false },
  { value: 'SUPPORT_LEAD', label: 'Support lead', isWarehouseRole: false },
  { value: 'FINANCE', label: 'Finance', isWarehouseRole: false },
  { value: 'FINANCE_MGR', label: 'Finance manager', isWarehouseRole: false },
  { value: 'OPS_MGR', label: 'Operations manager', isWarehouseRole: false },
  { value: 'ACCESS_ADMIN', label: 'Access administrator', isWarehouseRole: false },
]

/** The warehouses of the first slice (docs/01); the list moves to the API when warehouses are managed. */
export const WAREHOUSES: readonly string[] = ['WH-HCM-01', 'WH-HN-01']

export const ACCESS_ADMIN_ROLE = 'ACCESS_ADMIN'

export function roleLabel(role: string): string {
  return ROLE_OPTIONS.find((option) => option.value === role)?.label ?? role
}

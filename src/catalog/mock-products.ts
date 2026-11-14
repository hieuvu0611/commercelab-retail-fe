import { COLOR_HEX } from './colors'
import type { Product, ProductImage, ProductStatus, Sku } from '@/types/catalog'

/** Seed products of the in-app mock backend: 25 published across the leaf categories, plus drafts for the backoffice. */

export function placeholderImage(label: string, color = 'Grey'): string {
  const fill = COLOR_HEX[color] ?? '#8a8d91'
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 600 600">` +
    `<rect width="600" height="600" fill="${fill}"/>` +
    `<text x="300" y="310" font-family="sans-serif" font-size="34" fill="#f4f1ea" text-anchor="middle">${label}</text></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

type Axes = Record<string, string[]>

interface SeedProduct {
  name: string
  brand: string
  /** Slug of the leaf category, resolved to cat-<slug>. */
  category: string
  axes: Axes
  /** Price in VND (without VAT) of the first variant; later variants add a step. */
  price: number
  status?: ProductStatus
  hasPrice?: boolean
  /** Fixed SKU code for the first variant (SC01 scenario). */
  firstSku?: string
  /** Variant combinations that do not exist (to exercise disabled options). */
  omit?: Array<Record<string, string>>
}

const BP = { color: ['Black', 'Navy', 'Grey'], capacity: ['20 L', '30 L'] }
const BOTTLE = { color: ['Black', 'Blue', 'Green'], capacity: ['500 ml', '750 ml'] }
const ACC = { color: ['Black', 'Red', 'Sand'], size: ['S', 'M'] }
const LOCK = { color: ['Black', 'Red'] }

const SEEDS: SeedProduct[] = [
  {
    name: 'City Backpack',
    brand: 'Urbanline',
    category: 'city',
    axes: { color: ['Black', 'Navy', 'Grey'], capacity: ['20 L', '25 L'] },
    price: 300000,
    firstSku: 'BP-CITY-BLK-20L',
    omit: [{ color: 'Navy', capacity: '20 L' }],
  },
  { name: 'Daily Commuter Pack', brand: 'Urbanline', category: 'city', axes: BP, price: 340000 },
  { name: 'Slim Laptop Pack 15', brand: 'Northgate', category: 'laptop', axes: BP, price: 520000 },
  {
    name: 'Studio Laptop Backpack',
    brand: 'Northgate',
    category: 'laptop',
    axes: BP,
    price: 610000,
  },
  {
    name: 'Weekender Travel Pack',
    brand: 'Wayfarer',
    category: 'travel',
    axes: { color: ['Black', 'Green'], capacity: ['40 L', '50 L'] },
    price: 780000,
  },
  {
    name: 'Carry-On Rolltop',
    brand: 'Wayfarer',
    category: 'travel',
    axes: { color: ['Black', 'Sand'], capacity: ['35 L', '45 L'] },
    price: 850000,
  },
  {
    name: 'Expedition Duffel Pack',
    brand: 'Wayfarer',
    category: 'travel',
    axes: BP,
    price: 920000,
  },
  {
    name: 'Trail Daypack',
    brand: 'Ridgeback',
    category: 'hiking',
    axes: { color: ['Green', 'Red', 'Blue'], capacity: ['18 L', '28 L'] },
    price: 450000,
  },
  {
    name: 'Summit 40 Pack',
    brand: 'Ridgeback',
    category: 'hiking',
    axes: { color: ['Green', 'Grey'], capacity: ['40 L', '55 L'] },
    price: 1290000,
  },
  {
    name: 'Ultralight Hydration Pack',
    brand: 'Ridgeback',
    category: 'hiking',
    axes: { color: ['Red', 'Blue'], capacity: ['8 L', '12 L'] },
    price: 690000,
  },
  {
    name: 'Insulated Bottle',
    brand: 'Hydra',
    category: 'insulated',
    axes: { color: ['Black', 'Blue', 'Green'], capacity: ['500 ml', '750 ml'] },
    price: 100000,
    firstSku: 'BTL-INS-BLK-500',
  },
  {
    name: 'Steel Flask Classic',
    brand: 'Hydra',
    category: 'insulated',
    axes: BOTTLE,
    price: 140000,
  },
  { name: 'Vacuum Tumbler', brand: 'Hydra', category: 'insulated', axes: BOTTLE, price: 170000 },
  { name: 'Sports Squeeze Bottle', brand: 'Hydra', category: 'sports', axes: BOTTLE, price: 60000 },
  {
    name: 'Runner Handheld Bottle',
    brand: 'Pacer',
    category: 'sports',
    axes: BOTTLE,
    price: 90000,
  },
  { name: 'Cycling Bottle', brand: 'Pacer', category: 'sports', axes: BOTTLE, price: 75000 },
  { name: 'Packing Cube Set', brand: 'Tidy', category: 'packing-cubes', axes: ACC, price: 180000 },
  { name: 'Compression Cube', brand: 'Tidy', category: 'packing-cubes', axes: ACC, price: 120000 },
  { name: 'Shoe Cube', brand: 'Tidy', category: 'packing-cubes', axes: ACC, price: 95000 },
  { name: 'TSA Cable Lock', brand: 'Securo', category: 'locks', axes: LOCK, price: 85000 },
  { name: 'Combination Padlock', brand: 'Securo', category: 'locks', axes: LOCK, price: 70000 },
  { name: 'Zipper Lock Pair', brand: 'Securo', category: 'locks', axes: LOCK, price: 45000 },
  { name: 'Passport Pouch', brand: 'Tidy', category: 'pouches', axes: ACC, price: 110000 },
  { name: 'Cable Organiser Pouch', brand: 'Tidy', category: 'pouches', axes: ACC, price: 130000 },
  { name: 'Toiletry Pouch', brand: 'Tidy', category: 'pouches', axes: ACC, price: 150000 },
  {
    name: 'Canvas Tote Draft',
    brand: 'Urbanline',
    category: 'city',
    axes: { color: ['Sand'], capacity: ['15 L'] },
    price: 200000,
    status: 'DRAFT',
    hasPrice: false,
  },
  {
    name: 'Rain Cover Review',
    brand: 'Ridgeback',
    category: 'hiking',
    axes: { color: ['Red'], size: ['M'] },
    price: 80000,
    status: 'IN_REVIEW',
  },
]

const SEED_START_MS = Date.parse('2026-10-01T09:00:00Z')
const DAY_MS = 86_400_000
const PRICE_STEP_VND = 20000

function combinations(axes: Axes): Array<Record<string, string>> {
  return Object.entries(axes).reduce<Array<Record<string, string>>>(
    (rows, [axis, values]) =>
      rows.flatMap((row) => values.map((value) => ({ ...row, [axis]: value }))),
    [{}]
  )
}

export function seedProducts(): Product[] {
  return SEEDS.map((seed, index): Product => {
    const base = slugify(seed.name)
    const skus: Sku[] = combinations(seed.axes)
      .filter(
        (attributes) =>
          !seed.omit?.some((gap) =>
            Object.entries(gap).every(([axis, value]) => attributes[axis] === value)
          )
      )
      .map((attributes, variant) => ({
        skuId:
          variant === 0 && seed.firstSku
            ? seed.firstSku
            : `${base}-${Object.values(attributes).join('-')}`
                .toUpperCase()
                .replace(/[^A-Z0-9]+/g, '-'),
        attributes,
        isActive: true,
        unitPriceVnd: seed.hasPrice === false ? null : seed.price + variant * PRICE_STEP_VND,
      }))
    const images: ProductImage[] = [
      {
        id: `img-${base}-1`,
        url: placeholderImage(seed.name, seed.axes.color?.[0]),
        alt: seed.name,
      },
    ]
    const createdAt = new Date(SEED_START_MS + index * DAY_MS).toISOString()
    return {
      id: `prod-${base}`,
      slug: base,
      name: seed.name,
      description: `${seed.name} by ${seed.brand}. Built for everyday use with durable materials.`,
      brand: seed.brand,
      primaryCategoryId: `cat-${seed.category}`,
      categoryIds: [`cat-${seed.category}`],
      variantAxes: Object.keys(seed.axes),
      specs: { Brand: seed.brand, Material: 'Recycled polyester', Warranty: '12 months' },
      images,
      status: seed.status ?? 'PUBLISHED',
      version: 1,
      skus,
      createdAt,
      updatedAt: createdAt,
    }
  })
}

'use client'

import { useQuery, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ADDRESSES_KEY, listAddresses } from '@/addresses/address-api'
import { useCart } from '@/cart/cart-context'
import { createQuote } from '@/checkout/checkout-api'
import {
  describeQuoteChange,
  isQuoteExpired,
  secondsLeft,
  voucherMessage,
} from '@/checkout/quote-state'
import { useNow } from '@/checkout/use-now'
import { forgetKey, keyForQuote } from '@/orders/idempotency'
import { placeOrderProblem, type PlaceOrderProblem } from '@/orders/order-state'
import { placeOrder } from '@/orders/order-api'
import { FormAlert } from '@/components/auth/form-alert'
import { ApiError } from '@/services/api/api-error'
import type { Address, Quote } from '@/types/checkout'
import { AddressPicker } from './address-picker'
import { QuoteSummary } from './quote-summary'
import { VoucherBox } from './voucher-box'

interface QuoteProblem {
  message: string
  /** The customer has to fix the cart rather than retry. */
  needsCart: boolean
}

function problemFrom(error: unknown): QuoteProblem {
  const code = error instanceof ApiError ? error.code : ''
  if (code === 'CART_EMPTY') return { message: 'Your cart is empty.', needsCart: true }
  if (code === 'SKU_NOT_ORDERABLE')
    return {
      message: 'An item in your cart can no longer be ordered. Please review your cart.',
      needsCart: true,
    }
  return { message: 'We could not price your order. Please try again.', needsCart: false }
}

/** Checkout review: address, voucher and a five-minute quote that has to be accepted again when anything changes. */
export function CheckoutView() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const { cart, isLoading: isCartLoading, isSignedIn } = useCart()
  // Wait for the session: a request sent before the access token is known would be a 401 and end the session.
  const addresses = useQuery({
    queryKey: ADDRESSES_KEY,
    queryFn: listAddresses,
    staleTime: 0,
    enabled: isSignedIn,
  })
  const [chosenId, setChosenId] = useState<string | null>(null)
  const [voucher, setVoucher] = useState<string | null>(null)
  const [voucherRefusal, setVoucherRefusal] = useState<string>()
  const [quote, setQuote] = useState<Quote | null>(null)
  const [problem, setProblem] = useState<QuoteProblem | null>(null)
  const [isPricing, setIsPricing] = useState(false)
  const [acceptedId, setAcceptedId] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isPlacing, setIsPlacing] = useState(false)
  const [orderProblem, setOrderProblem] = useState<PlaceOrderProblem | null>(null)
  const ticket = useRef(0)
  const latest = useRef({ quote: null as Quote | null, acceptedId: null as string | null })
  latest.current = { quote, acceptedId }

  const addressList = useMemo(() => addresses.data ?? [], [addresses.data])
  const addressId =
    addressList.find((address) => address.id === chosenId)?.id ??
    addressList.find((address) => address.isDefault)?.id ??
    addressList[0]?.id ??
    null
  const cartKey = cart.lines.map((line) => `${line.skuId}:${line.quantity}`).join(',')
  const isEmpty = !isCartLoading && cart.lines.length === 0
  const now = useNow(quote !== null)
  const remaining = quote ? secondsLeft(quote, now) : 0
  const isExpired = quote !== null && remaining === 0

  const requestQuote = useCallback(async () => {
    if (!addressId) return
    const mine = ++ticket.current
    setIsPricing(true)
    setProblem(null)
    try {
      const next = await createQuote({ addressId, voucherCode: voucher ?? undefined })
      if (mine !== ticket.current) return
      const { quote: previous, acceptedId: accepted } = latest.current
      const change = previous ? describeQuoteChange(previous, next) : null
      if (previous && isQuoteExpired(previous, Date.now())) {
        setNotice(
          `Your quote expired and was refreshed. ${change ?? 'Nothing else changed.'} Please accept it again.`
        )
      } else if (previous && accepted === previous.quoteId && change) {
        setNotice(`${change} Please accept it again.`)
      } else {
        setNotice(null)
      }
      setQuote(next)
      setAcceptedId(null)
    } catch (error) {
      if (mine !== ticket.current) return
      const code = error instanceof ApiError ? error.code : ''
      setQuote(null)
      if (code.startsWith('VOUCHER_')) {
        setVoucherRefusal(voucherMessage(code))
        setVoucher(null)
      } else if (code === 'ADDRESS_NOT_FOUND') {
        void queryClient.invalidateQueries({ queryKey: ADDRESSES_KEY })
        setProblem({
          message: 'That address is no longer available. Choose another one.',
          needsCart: false,
        })
      } else {
        setProblem(problemFrom(error))
      }
    } finally {
      if (mine === ticket.current) setIsPricing(false)
    }
  }, [addressId, voucher, queryClient])

  /** The key belongs to the quote, so every retry of this quote replays one order instead of creating another. */
  async function submitOrder(accepted: Quote) {
    setIsPlacing(true)
    setOrderProblem(null)
    try {
      const order = await placeOrder(accepted.quoteId, keyForQuote(accepted.quoteId))
      router.push(`/checkout/payment/${encodeURIComponent(order.orderId)}`)
    } catch (error) {
      setOrderProblem(placeOrderProblem(error))
      setIsPlacing(false)
    }
  }

  useEffect(() => {
    if (isCartLoading || !addressId || cart.lines.length === 0) return
    void requestQuote()
    // A new quote is priced whenever the address, the voucher or the cart lines change.
  }, [requestQuote, isCartLoading, addressId, cartKey, cart.lines.length])

  if (isCartLoading || addresses.isPending)
    return (
      <p role="status" className="mt-8 text-ink-2">
        Loading checkout…
      </p>
    )
  if (isEmpty)
    return (
      <div className="mt-6 max-w-[40rem] border-t border-rule-2 bg-paper-2 px-6 py-8">
        <p className="font-label text-lg text-ink">Your cart is empty</p>
        <p className="mt-2 text-ink-2">Add something to your cart before checking out.</p>
        <Link href="/" className="btn btn-primary mt-4">
          Continue shopping
        </Link>
      </div>
    )
  if (addresses.isError)
    return (
      <div className="mt-6">
        <FormAlert message="We could not load your addresses. Please reload the page." />
      </div>
    )

  const isAccepted = quote !== null && acceptedId === quote.quoteId && !isExpired

  return (
    <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="flex flex-col gap-10">
        <AddressPicker
          addresses={addressList}
          selectedId={addressId}
          onSelect={setChosenId}
          onCreated={(created: Address) => {
            setChosenId(created.id)
            void queryClient.invalidateQueries({ queryKey: ADDRESSES_KEY })
          }}
        />
        <VoucherBox
          applied={voucher}
          externalMessage={voucherRefusal}
          onApply={(code) => {
            setVoucherRefusal(undefined)
            setVoucher(code)
          }}
          onRemove={() => {
            setVoucherRefusal(undefined)
            setVoucher(null)
          }}
        />
        <p className="text-sm text-muted">
          <Link href="/cart" className="underline">
            Edit your cart
          </Link>
          . Nothing is reserved until you place the order.
        </p>
      </div>

      <div className="flex flex-col gap-4" aria-busy={isPricing}>
        {notice && (
          <p role="alert" className="border-l-4 border-error bg-paper-2 px-4 py-3 text-sm text-ink">
            {notice}
          </p>
        )}
        {problem && (
          <div>
            <FormAlert message={problem.message} />
            {problem.needsCart ? (
              <Link href="/cart" className="btn btn-secondary mt-3">
                Back to cart
              </Link>
            ) : (
              addressId && (
                <button
                  type="button"
                  onClick={() => void requestQuote()}
                  className="btn btn-secondary mt-3"
                >
                  Try again
                </button>
              )
            )}
          </div>
        )}
        {!addressId && !problem && (
          <p className="text-ink-2">Add a delivery address to see your quote.</p>
        )}
        {quote && <QuoteSummary quote={quote} secondsLeft={remaining} />}
        {quote && isExpired && (
          <div>
            <p
              role="alert"
              className="border-l-4 border-error bg-paper-2 px-4 py-3 text-sm text-ink"
            >
              This quote has expired. Prices and stock may have changed, so we need a new quote.
            </p>
            <button
              type="button"
              disabled={isPricing}
              onClick={() => void requestQuote()}
              className="btn btn-primary mt-3 w-full"
            >
              {isPricing ? 'Getting a new quote…' : 'Get a new quote'}
            </button>
          </div>
        )}
        {quote && !isExpired && !isAccepted && (
          <button
            type="button"
            disabled={isPricing}
            onClick={() => setAcceptedId(quote.quoteId)}
            className="btn btn-primary w-full"
          >
            Accept quote
          </button>
        )}
        {isAccepted && quote && (
          <div className="flex flex-col gap-3">
            <p
              role="status"
              className="border-l-4 border-success bg-paper-2 px-4 py-3 text-sm text-ink"
            >
              You accepted this quote. Nothing is charged until you pay on the next page.
            </p>
            {orderProblem && <FormAlert message={orderProblem.message} />}
            {orderProblem?.kind === 'new-quote' ? (
              <button
                type="button"
                onClick={() => {
                  forgetKey(quote.quoteId)
                  setOrderProblem(null)
                  void requestQuote()
                }}
                className="btn btn-primary w-full"
              >
                Get a new quote
              </button>
            ) : orderProblem?.kind === 'cart' ? (
              <Link href="/cart" className="btn btn-secondary">
                Back to cart
              </Link>
            ) : (
              <button
                type="button"
                disabled={isPlacing}
                onClick={() => void submitOrder(quote)}
                className="btn btn-primary w-full"
              >
                {isPlacing ? 'Placing your order…' : orderProblem ? 'Try again' : 'Place order'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

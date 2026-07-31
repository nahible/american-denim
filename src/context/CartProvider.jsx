import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../hooks/useAuth.js'
import { CartContext } from './cartContext.js'

const CART_STATUS = 'active'
const CART_CURRENCY = 'USD'
const GUEST_CART_KEY = 'americandrm.guest-cart'

function asText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeQuantity(value) {
  const quantity = Number(value)
  return Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0
}

function normalizeItem(item) {
  const productId = asText(item?.productId)
  const variantId = asText(item?.variantId)
  const price = Number(item?.price)

  if (!productId || !Number.isFinite(price) || price < 0) {
    return null
  }

  const quantity = normalizeQuantity(item?.quantity)
  if (!quantity) {
    return null
  }

  const rawStockQuantity = item?.stockQuantity
  const stockQuantity = rawStockQuantity === null || rawStockQuantity === undefined
    ? null
    : Number(rawStockQuantity)

  return {
    id: `${productId}:${variantId || 'default'}`,
    productId,
    variantId: variantId || null,
    name: asText(item?.name) || 'Product',
    detail: asText(item?.detail) || 'Standard option',
    price,
    currency: asText(item?.currency) || CART_CURRENCY,
    quantity,
    stockQuantity: Number.isFinite(stockQuantity) && stockQuantity >= 0 ? Math.floor(stockQuantity) : null,
  }
}

function readCartItems(metadata) {
  if (!metadata || typeof metadata !== 'object' || !Array.isArray(metadata.items)) {
    return []
  }

  return metadata.items.map(normalizeItem).filter(Boolean)
}

function makeCartMetadata(metadata, items) {
  const currentMetadata = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}

  return {
    ...currentMetadata,
    items,
  }
}

function readGuestCart() {
  try {
    const stored = window.localStorage.getItem(GUEST_CART_KEY)
    return stored ? readCartItems(JSON.parse(stored)) : []
  } catch {
    return []
  }
}

function writeGuestCart(items) {
  try {
    window.localStorage.setItem(GUEST_CART_KEY, JSON.stringify({ items }))
  } catch {
    // Local storage can be unavailable in privacy-restricted browsers.
  }
}

function clearGuestCart() {
  try {
    window.localStorage.removeItem(GUEST_CART_KEY)
  } catch {
    // Local storage can be unavailable in privacy-restricted browsers.
  }
}

function mergeCartItems(remoteItems, guestItems) {
  const merged = new Map(remoteItems.map((item) => [item.id, item]))

  for (const guestItem of guestItems) {
    const existing = merged.get(guestItem.id)
    merged.set(guestItem.id, existing
      ? { ...existing, quantity: existing.quantity + guestItem.quantity }
      : guestItem)
  }

  return Array.from(merged.values())
}

export function CartProvider({ children }) {
  const { user, loading: authLoading } = useAuth()
  const [items, setItems] = useState([])
  const [loadedUserId, setLoadedUserId] = useState(null)
  const [syncError, setSyncError] = useState(null)
  const itemsRef = useRef(items)
  const userRef = useRef(user)
  const cartIdRef = useRef(null)
  const cartMetadataRef = useRef({})
  const writeQueueRef = useRef(Promise.resolve())

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    userRef.current = user

    if (!user?.id) {
      queueMicrotask(() => {
        if (userRef.current?.id) {
          return
        }

        cartIdRef.current = null
        cartMetadataRef.current = {}
        const guestItems = readGuestCart()
        itemsRef.current = guestItems
        setItems(guestItems)
        setSyncError(null)
        setLoadedUserId(null)
      })
      return undefined
    }

    if (!supabase) {
      return undefined
    }

    let active = true

    const loadCart = async () => {
      const { data, error } = await supabase
        .from('cart')
        .select('id, metadata')
        .eq('user_id', user.id)
        .eq('status', CART_STATUS)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!active) {
        return
      }

      if (error) {
        setSyncError(error)
        setLoadedUserId(user.id)
        return
      }

      cartIdRef.current = data?.id ?? null
      cartMetadataRef.current = data?.metadata ?? {}
      const storedItems = readCartItems(data?.metadata)
      const guestItems = readGuestCart()
      const mergedItems = mergeCartItems(storedItems, guestItems)
      itemsRef.current = mergedItems
      setItems(mergedItems)
      setSyncError(null)
      setLoadedUserId(user.id)

      if (guestItems.length > 0) {
        persistItems(mergedItems, user.id)
      }
    }

    void loadCart()

    return () => {
      active = false
    }
  }, [user])

  function persistItems(nextItems, userId) {
    if (!supabase || !userId) {
      return
    }

    writeQueueRef.current = writeQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (userRef.current?.id !== userId) {
          return
        }

        const metadata = makeCartMetadata(cartMetadataRef.current, nextItems)
        const payload = {
          status: CART_STATUS,
          currency: CART_CURRENCY,
          metadata,
        }
        const response = cartIdRef.current
          ? await supabase.from('cart').update(payload).eq('id', cartIdRef.current).select('id, metadata').single()
          : await supabase
              .from('cart')
              .insert({ ...payload, user_id: userId })
              .select('id, metadata')
              .single()

        if (response.error) {
          setSyncError(response.error)
          return
        }

        cartIdRef.current = response.data.id
        cartMetadataRef.current = response.data.metadata ?? metadata
        clearGuestCart()
        setSyncError(null)
      })
  }

  const replaceItems = useCallback((nextItems) => {
    itemsRef.current = nextItems
    setItems(nextItems)
    if (userRef.current?.id) {
      persistItems(nextItems, userRef.current.id)
    } else {
      writeGuestCart(nextItems)
    }
  }, [])

  const addItem = useCallback((item) => {
    const normalizedItem = normalizeItem(item)
    if (!normalizedItem) {
      return false
    }

    const currentItems = itemsRef.current
    const matchingItem = currentItems.find((currentItem) => currentItem.id === normalizedItem.id)
    const requestedQuantity = matchingItem
      ? matchingItem.quantity + normalizedItem.quantity
      : normalizedItem.quantity
    const stockQuantity = normalizedItem.stockQuantity ?? matchingItem?.stockQuantity
    const nextQuantity = stockQuantity === null || stockQuantity === undefined
      ? requestedQuantity
      : Math.min(requestedQuantity, stockQuantity)

    if (nextQuantity <= 0) {
      return false
    }

    const nextItems = matchingItem
      ? currentItems.map((currentItem) =>
          currentItem.id === normalizedItem.id
            ? { ...currentItem, ...normalizedItem, quantity: nextQuantity, stockQuantity }
            : currentItem,
        )
      : [...currentItems, normalizedItem]

    replaceItems(nextItems)
    return true
  }, [replaceItems])

  const updateQuantity = useCallback((itemId, quantity) => {
    const normalizedQuantity = normalizeQuantity(quantity)
    const nextItems = itemsRef.current
      .map((item) => (item.id === itemId
        ? {
            ...item,
            quantity: item.stockQuantity === null || item.stockQuantity === undefined
              ? normalizedQuantity
              : Math.min(normalizedQuantity, item.stockQuantity),
          }
        : item))
      .filter((item) => item.quantity > 0)

    replaceItems(nextItems)
  }, [replaceItems])

  const removeItem = useCallback((itemId) => {
    replaceItems(itemsRef.current.filter((item) => item.id !== itemId))
  }, [replaceItems])

  const clearCart = useCallback(() => {
    replaceItems([])
  }, [replaceItems])

  const reconcileItems = useCallback((details) => {
    if (!details || typeof details !== 'object') {
      return
    }

    const variantId = typeof details.variantId === 'string' ? details.variantId : ''
    if (!variantId) {
      return
    }

    const nextItems = itemsRef.current
      .map((item) => {
        if (item.variantId !== variantId) {
          return item
        }

        if (details.remove) {
          return null
        }

        const availableQuantity = Number(details.availableQuantity)
        const nextQuantity = Number.isFinite(availableQuantity)
          ? Math.min(item.quantity, Math.max(0, Math.floor(availableQuantity)))
          : item.quantity
        const currentPrice = Number(details.currentPrice)

        return {
          ...item,
          quantity: nextQuantity,
          stockQuantity: Number.isFinite(availableQuantity) ? Math.max(0, Math.floor(availableQuantity)) : item.stockQuantity,
          price: Number.isFinite(currentPrice) && currentPrice >= 0 ? currentPrice : item.price,
        }
      })
      .filter((item) => item && item.quantity > 0)

    replaceItems(nextItems)
  }, [replaceItems])

  const subtotal = items.reduce((total, item) => total + item.price * item.quantity, 0)
  const itemCount = items.reduce((total, item) => total + item.quantity, 0)
  const loading = authLoading || Boolean(user?.id && loadedUserId !== user.id)

  const value = useMemo(() => ({
    items,
    subtotal,
    itemCount,
    loading,
    syncError,
    isAuthenticated: Boolean(user),
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    reconcileItems,
  }), [items, subtotal, itemCount, loading, syncError, user, addItem, updateQuantity, removeItem, clearCart, reconcileItems])

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminRoute } from '../components/AdminRoute.jsx'
import { useAuth } from '../hooks/useAuth.js'
import {
  adjustInventory,
  getAdminDashboard,
  getAdminOrder,
  getAdminProduct,
  invokeAdminFunction,
  listAdminOrders,
  listAdminProducts,
  listCustomers,
  listDiscounts,
  removeProductImage,
  saveProduct,
  saveVariant,
  updateFulfillment,
  uploadProductImage,
} from '../services/adminService.js'
import {
  FULFILLMENT_TRANSITIONS,
  inventoryAfterAdjustment,
  validateDiscount,
  validateProductForm,
  validateRefundAmount,
} from '../utils/adminValidation.js'

const ADMIN_LINKS = [
  ['admin', 'Dashboard'],
  ['admin-orders', 'Orders'],
  ['admin-products', 'Products'],
  ['admin-inventory', 'Inventory'],
  ['admin-customers', 'Customers'],
  ['admin-discounts', 'Discounts'],
  ['admin-analytics', 'Analytics'],
]

const money = (value, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(value || 0))
const dateTime = (value) => value ? new Date(value).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
const shortId = (value = '') => value.slice(0, 8).toUpperCase()
const messageFrom = (error, fallback = 'The request could not be completed.') => error?.message || fallback

function AdminState({ title, message, retry }) {
  return <div className="admin-card admin-state"><span className="eyebrow">Admin</span><h2>{title}</h2>{message && <p>{message}</p>}{retry && <button className="admin-button" type="button" onClick={retry}>Try again</button>}</div>
}

function StatusBadge({ children }) {
  return <span className={`admin-badge admin-badge--${String(children || '').replace(/_/g, '-')}`}>{String(children || 'unknown').replace(/_/g, ' ')}</span>
}

function AdminLayout({ page, children }) {
  return (
    <AdminRoute>
      <section className="admin-shell">
        <header className="admin-header">
          <div><span className="eyebrow">American Denim operations</span><h1>Admin panel</h1></div>
          <a className="admin-back" href="#shop">← Back to storefront</a>
        </header>
        <nav className="admin-nav" aria-label="Admin navigation">
          {ADMIN_LINKS.map(([route, label]) => <a key={route} href={`#${route}`} aria-current={page === route ? 'page' : undefined}>{label}</a>)}
        </nav>
        <div className="admin-content">{children}</div>
      </section>
    </AdminRoute>
  )
}

function useLoad(loader) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const reload = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }))
    const response = await loader()
    setState({ data: response.data, error: response.error, loading: false })
  }, [loader])
  useEffect(() => {
    let active = true
    void loader().then((response) => {
      if (active) setState({ data: response.data, error: response.error, loading: false })
    })
    return () => { active = false }
  }, [loader])
  return { ...state, reload, setState }
}

function Dashboard() {
  const { data, error, loading, reload } = useLoad(getAdminDashboard)
  if (loading) return <AdminState title="Loading dashboard…" />
  if (error || !data) return <AdminState title="Dashboard unavailable" message={messageFrom(error)} retry={reload} />
  const metrics = [
    ['Net paid revenue', money(data.net_paid_revenue ?? data.total_paid_revenue)], ['Gross paid orders', data.gross_paid_orders ?? data.paid_orders],
    ['Awaiting fulfillment', data.awaiting_fulfillment], ['Processing', data.processing_orders],
    ['Shipped', data.shipped_orders], ['Low stock', data.low_stock_variants], ['Out of stock', data.out_of_stock_variants],
  ]
  return <>
    <div className="admin-section-heading"><div><span className="eyebrow">Today at a glance</span><h2>Dashboard</h2></div><button className="admin-button admin-button--quiet" onClick={reload}>Refresh</button></div>
    <div className="admin-metrics">{metrics.map(([label, value]) => <article className="admin-metric" key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
    <div className="admin-grid admin-grid--two">
      <section className="admin-card"><h3>Recent orders</h3>{data.recent_orders?.length ? <div className="admin-list">{data.recent_orders.map((order) => <a href={`#admin-order?id=${order.id}`} key={order.id}><span><strong>#{shortId(order.id)}</strong><small>{order.customer_name || order.customer_email || 'Customer'} · {dateTime(order.created_at)}</small></span><span><StatusBadge>{order.fulfillment_status}</StatusBadge>{money(order.total, order.currency)}</span></a>)}</div> : <p>No orders yet.</p>}</section>
      <section className="admin-card"><h3>Best sellers</h3>{data.best_sellers?.length ? <div className="admin-list">{data.best_sellers.map((item, index) => <div key={`${item.product_name}-${item.variant_name}-${index}`}><span><strong>{item.product_name || 'Archived product'}</strong><small>{item.variant_name || 'Standard variant'}</small></span><span>{item.quantity_sold} sold</span></div>)}</div> : <p>No paid sales yet.</p>}</section>
    </div>
  </>
}

function Orders() {
  const { data = [], error, loading, reload } = useLoad(listAdminOrders)
  const [search, setSearch] = useState('')
  const [payment, setPayment] = useState('all')
  const [fulfillment, setFulfillment] = useState('all')
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(1)
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return [...(data || [])].filter((order) => (!needle || order.id.toLowerCase().includes(needle) || order.customer?.full_name?.toLowerCase().includes(needle) || order.customer?.email?.toLowerCase().includes(needle)) && (payment === 'all' || order.payment_status === payment) && (fulfillment === 'all' || order.fulfillment_status === fulfillment)).sort((a, b) => sort === 'oldest' ? new Date(a.created_at) - new Date(b.created_at) : sort === 'total' ? Number(b.total) - Number(a.total) : new Date(b.created_at) - new Date(a.created_at))
  }, [data, search, payment, fulfillment, sort])
  const pages = Math.max(1, Math.ceil(filtered.length / 25))
  const visible = filtered.slice((page - 1) * 25, page * 25)
  if (loading) return <AdminState title="Loading orders…" />
  if (error) return <AdminState title="Orders unavailable" message={messageFrom(error)} retry={reload} />
  return <>
    <div className="admin-section-heading"><div><span className="eyebrow">Operations</span><h2>Orders</h2></div><span>{filtered.length} result{filtered.length === 1 ? '' : 's'}</span></div>
    <div className="admin-filters">
      <label>Search<input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Order, name, or email" /></label>
      <label>Payment<select value={payment} onChange={(e) => { setPayment(e.target.value); setPage(1) }}><option value="all">All</option>{['pending','paid','partially_refunded','refunded','failed'].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Fulfillment<select value={fulfillment} onChange={(e) => { setFulfillment(e.target.value); setPage(1) }}><option value="all">All</option>{Object.keys(FULFILLMENT_TRANSITIONS).map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Sort<select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1) }}><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="total">Highest total</option></select></label>
    </div>
    {!visible.length ? <AdminState title="No matching orders" message="Try removing a filter." /> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Total</th><th>Payment</th><th>Fulfillment</th><th>Items</th></tr></thead><tbody>{visible.map((order) => <tr key={order.id}><td><a href={`#admin-order?id=${order.id}`}>#{shortId(order.id)}</a></td><td>{order.customer?.full_name || '—'}<small>{order.customer?.email || '—'}</small></td><td>{dateTime(order.created_at)}</td><td>{money(order.total, order.currency)}</td><td><StatusBadge>{order.payment_status}</StatusBadge></td><td><StatusBadge>{order.fulfillment_status}</StatusBadge></td><td>{order.item_count}</td></tr>)}</tbody></table></div>}
    <div className="admin-pagination"><button disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page} of {pages}</span><button disabled={page === pages} onClick={() => setPage((value) => value + 1)}>Next</button></div>
  </>
}

function Address({ value }) {
  const address = value?.address || value || {}
  const name = value?.name
  const lines = [name, address.line1, address.line2, [address.city, address.state, address.postal_code].filter(Boolean).join(', '), address.country].filter(Boolean)
  return lines.length ? <address>{lines.map((line) => <span key={line}>{line}</span>)}</address> : <p>Not stored.</p>
}

function OrderDetail({ id }) {
  const loadOrder = useCallback(() => getAdminOrder(id), [id])
  const { data: order, error, loading, reload } = useLoad(loadOrder)
  if (!id) return <AdminState title="Order ID missing" message="Open an order from the orders list." />
  if (loading) return <AdminState title="Loading order…" />
  if (error || !order) return <AdminState title="Order unavailable" message={messageFrom(error)} retry={reload} />
  return <OrderDetailContent key={order.updated_at} order={order} reload={reload} />
}

function OrderDetailContent({ order, reload }) {
  const [status, setStatus] = useState(order.fulfillment_status)
  const [carrier, setCarrier] = useState(order.carrier || '')
  const [tracking, setTracking] = useState(order.tracking_number || '')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [refundAmount, setRefundAmount] = useState((Math.max(0, Math.round(Number(order.total) * 100) - Number(order.refunded_amount_cents || 0)) / 100).toFixed(2))
  const [refundReason, setRefundReason] = useState('')
  const [restock, setRestock] = useState(false)
  const contact = order.metadata?.contact || {}
  const shipping = order.metadata?.shipping_address || {}
  const remainingCents = Math.round(Number(order.total) * 100) - Number(order.refunded_amount_cents || 0)
  const submitFulfillment = async (event) => {
    event.preventDefault(); setSaving(true); setNotice('')
    const response = await updateFulfillment(order.id, status, carrier, tracking)
    setSaving(false); setNotice(response.error ? messageFrom(response.error) : 'Fulfillment updated.'); if (!response.error) void reload()
  }
  const submitRefund = async (event) => {
    event.preventDefault(); setSaving(true); setNotice('')
    const cents = Math.round(Number(refundAmount) * 100)
    const validation = validateRefundAmount(cents, Math.round(Number(order.total) * 100), Number(order.refunded_amount_cents || 0))
    if (validation) { setSaving(false); setNotice(validation); return }
    const response = await invokeAdminFunction('create-refund', { orderId: order.id, amountCents: cents, reason: refundReason, restock, idempotencyKey: crypto.randomUUID() })
    setSaving(false); setNotice(response.error ? messageFrom(response.error) : 'Refund submitted. Stripe webhook confirmation is pending.'); if (!response.error) void reload()
  }
  return <>
    <div className="admin-section-heading"><div><span className="eyebrow">Order #{shortId(order.id)}</span><h2>Order detail</h2></div><a href="#admin-orders">← All orders</a></div>
    {notice && <p className="admin-notice" role="status">{notice}</p>}
    <div className="admin-grid admin-grid--two">
      <section className="admin-card"><h3>Order</h3><dl className="admin-details"><div><dt>Full ID</dt><dd>{order.id}</dd></div><div><dt>Created</dt><dd>{dateTime(order.created_at)}</dd></div><div><dt>Customer</dt><dd>{order.customer?.full_name || contact.name || '—'}<small>{order.customer?.email || contact.email || '—'}</small></dd></div><div><dt>Payment</dt><dd><StatusBadge>{order.payment_status}</StatusBadge></dd></div><div><dt>Fulfillment</dt><dd><StatusBadge>{order.fulfillment_status}</StatusBadge></dd></div><div><dt>Checkout session</dt><dd>{order.stripe_session_id || '—'}</dd></div><div><dt>Payment intent</dt><dd>{order.stripe_payment_intent || '—'}</dd></div></dl></section>
      <section className="admin-card"><h3>Addresses</h3><h4>Shipping</h4><Address value={shipping} /><h4>Billing</h4><Address value={order.metadata?.billing_address} /></section>
    </div>
    <section className="admin-card"><h3>Items</h3><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Product</th><th>Variant</th><th>Qty</th><th>Unit</th><th>Line total</th></tr></thead><tbody>{order.items.map((item) => <tr key={item.id}><td>{item.product_name || 'Archived product'}</td><td>{item.variant_name || 'Standard'}</td><td>{item.quantity}</td><td>{money(item.unit_price, item.currency)}</td><td>{money(Number(item.unit_price) * item.quantity, item.currency)}</td></tr>)}</tbody></table></div><dl className="admin-totals"><div><dt>Subtotal</dt><dd>{money(order.subtotal, order.currency)}</dd></div><div><dt>Shipping</dt><dd>{money(order.shipping_total, order.currency)}</dd></div><div><dt>Tax</dt><dd>{money(order.tax_total, order.currency)}</dd></div><div><dt>Discount</dt><dd>−{money(order.discount_total, order.currency)}</dd></div><div><dt>Total</dt><dd>{money(order.total, order.currency)}</dd></div></dl></section>
    <div className="admin-grid admin-grid--two">
      <form className="admin-card admin-form" onSubmit={submitFulfillment}><h3>Fulfillment</h3><label>Status<select value={status} onChange={(e) => setStatus(e.target.value)}><option value={order.fulfillment_status}>{order.fulfillment_status}</option>{FULFILLMENT_TRANSITIONS[order.fulfillment_status]?.map((value) => <option key={value}>{value}</option>)}</select></label><label>Carrier<input value={carrier} onChange={(e) => setCarrier(e.target.value)} maxLength="80" /></label><label>Tracking number<input value={tracking} onChange={(e) => setTracking(e.target.value)} maxLength="120" /></label><button className="admin-button" disabled={saving}>Save fulfillment</button><small>Processing: {dateTime(order.processing_at)} · Shipped: {dateTime(order.shipped_at)} · Delivered: {dateTime(order.delivered_at)}</small></form>
      <form className="admin-card admin-form" onSubmit={submitRefund}><h3>Refund</h3><p>{money(remainingCents / 100, order.currency)} remains refundable.</p><label>Amount<input type="number" min="0.01" step="0.01" max={(remainingCents / 100).toFixed(2)} value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} required /></label><label>Reason<textarea value={refundReason} onChange={(e) => setRefundReason(e.target.value)} maxLength="500" /></label><label className="admin-checkbox"><input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} /> Restock items (full original-order refund only)</label><button className="admin-button admin-button--danger" disabled={saving || remainingCents <= 0}>Submit test-mode refund</button>{order.refunds?.length > 0 && <div className="admin-list">{order.refunds.map((refund) => <div key={refund.id}><span>{money(refund.amount_cents / 100, refund.currency)} · {refund.reason || 'No reason'}</span><StatusBadge>{refund.status}</StatusBadge></div>)}</div>}</form>
    </div>
  </>
}

function Products() {
  const { data = [], error, loading, reload } = useLoad(listAdminProducts)
  const [search, setSearch] = useState(''); const [status, setStatus] = useState('all')
  const visible = (data || []).filter((product) => (!search || `${product.name} ${product.slug}`.toLowerCase().includes(search.toLowerCase())) && (status === 'all' || product.status === status))
  const archive = async (product) => { await saveProduct({ ...product, description: product.description || '', slug: product.slug || '', status: product.status === 'active' ? 'inactive' : 'active' }); void reload() }
  if (loading) return <AdminState title="Loading products…" />
  if (error) return <AdminState title="Products unavailable" message={messageFrom(error)} retry={reload} />
  return <><div className="admin-section-heading"><div><span className="eyebrow">Catalog</span><h2>Products</h2></div><a className="admin-button" href="#admin-product">Create product</a></div><div className="admin-filters"><label>Search<input value={search} onChange={(e) => setSearch(e.target.value)} /></label><label>Status<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">All</option><option>active</option><option>inactive</option></select></label></div>{!visible.length ? <AdminState title="No matching products" /> : <div className="admin-card-grid">{visible.map((product) => <article className="admin-card" key={product.id}><span className="eyebrow">{product.slug}</span><h3>{product.name}</h3><p>{product.product_variants?.length || 0} variants · {product.product_images?.length || 0} images</p><StatusBadge>{product.status}</StatusBadge><div className="admin-actions"><a className="admin-button" href={`#admin-product?id=${product.id}`}>Edit</a><button className="admin-button admin-button--quiet" onClick={() => archive(product)}>{product.status === 'active' ? 'Archive' : 'Activate'}</button></div></article>)}</div>}</>
}

const EMPTY_PRODUCT = { name: '', slug: '', description: '', status: 'inactive', featured: false }
const EMPTY_VARIANT = { sku: '', name: '', price: '', color: '', size: '', low_stock_threshold: 5, status: 'active' }

function ProductEditor({ id }) {
  const loadProduct = useCallback(() => id ? getAdminProduct(id) : Promise.resolve({ data: null, error: null }), [id])
  const { data, error, loading, reload } = useLoad(loadProduct)
  if (loading) return <AdminState title="Loading product editor…" />
  if (error) return <AdminState title="Product unavailable" message={messageFrom(error)} retry={reload} />
  return <ProductEditorContent key={data?.updated_at || 'new'} id={id} data={data} reload={reload} />
}

function ProductEditorContent({ id, data, reload }) {
  const { user } = useAuth()
  const [product, setProduct] = useState(data ? { ...EMPTY_PRODUCT, ...data } : EMPTY_PRODUCT); const [variant, setVariant] = useState(EMPTY_VARIANT)
  const [notice, setNotice] = useState(''); const [saving, setSaving] = useState(false)
  const update = (setter) => (event) => setter((current) => ({ ...current, [event.target.name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }))
  const submitProduct = async (event) => { event.preventDefault(); const errors = validateProductForm(product); if (Object.keys(errors).length) { setNotice(Object.values(errors)[0]); return } setSaving(true); const response = await saveProduct(product); setSaving(false); if (response.error) setNotice(messageFrom(response.error)); else { setNotice('Product saved.'); if (!id) window.location.hash = `#admin-product?id=${response.data.id}`; else void reload() } }
  const editVariant = (item) => setVariant({ ...EMPTY_VARIANT, ...item })
  const submitVariant = async (event) => { event.preventDefault(); if (!id) { setNotice('Save the product before adding variants.'); return } if (!Number.isFinite(Number(variant.price)) || Number(variant.price) < 0 || !Number.isSafeInteger(Number(variant.low_stock_threshold)) || Number(variant.low_stock_threshold) < 0) { setNotice('Variant price and low-stock threshold must be valid.'); return } setSaving(true); const response = await saveVariant({ ...variant, product_id: id }); setSaving(false); setNotice(response.error ? messageFrom(response.error) : 'Variant saved.'); if (!response.error) { setVariant(EMPTY_VARIANT); void reload() } }
  const upload = async (event) => { const file = event.target.files?.[0]; if (!file) return; if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) { setNotice('Choose an image no larger than 8 MB.'); return } setSaving(true); const response = await uploadProductImage(user.id, id, file); setSaving(false); setNotice(response.error ? messageFrom(response.error) : 'Image uploaded.'); if (!response.error) void reload(); event.target.value = '' }
  const removeImage = async (image) => { setSaving(true); const response = await removeProductImage(image); setSaving(false); setNotice(response.error ? messageFrom(response.error) : 'Image removed.'); if (!response.error) void reload() }
  return <><div className="admin-section-heading"><div><span className="eyebrow">Catalog</span><h2>{id ? 'Edit product' : 'Create product'}</h2></div><a href="#admin-products">← Products</a></div>{notice && <p className="admin-notice" role="status">{notice}</p>}<form className="admin-card admin-form" onSubmit={submitProduct}><div className="admin-grid admin-grid--two"><label>Name<input name="name" value={product.name} onChange={update(setProduct)} required /></label><label>Slug<input name="slug" value={product.slug || ''} onChange={update(setProduct)} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></label><label>Status<select name="status" value={product.status} onChange={update(setProduct)}><option>active</option><option>inactive</option></select></label><label className="admin-checkbox"><input name="featured" type="checkbox" checked={product.featured} onChange={update(setProduct)} /> Featured</label></div><label>Description<textarea name="description" value={product.description || ''} onChange={update(setProduct)} rows="5" /></label><button className="admin-button" disabled={saving}>{saving ? 'Saving…' : 'Save product'}</button></form>{id && <><section className="admin-card"><div className="admin-section-heading"><h3>Images</h3><label className="admin-button">Upload image<input className="sr-only" type="file" accept="image/*" onChange={upload} disabled={saving} /></label></div><div className="admin-images">{data?.product_images?.map((image) => <figure key={image.id}><img src={image.url} alt={image.alt_text || product.name} /><button onClick={() => removeImage(image)} disabled={saving}>Remove</button></figure>)}{!data?.product_images?.length && <p>No images uploaded.</p>}</div></section><div className="admin-grid admin-grid--two"><form className="admin-card admin-form" onSubmit={submitVariant}><h3>{variant.id ? 'Edit variant' : 'Add variant'}</h3>{[['sku','SKU'],['name','Name'],['color','Color'],['size','Size'],['price','Price (USD)'],['low_stock_threshold','Low-stock threshold']].map(([name,label]) => <label key={name}>{label}<input name={name} type={name === 'price' ? 'number' : name === 'low_stock_threshold' ? 'number' : 'text'} min="0" step={name === 'price' ? '0.01' : undefined} value={variant[name] ?? ''} onChange={update(setVariant)} required={['sku','price'].includes(name)} /></label>)}<label>Status<select name="status" value={variant.status} onChange={update(setVariant)}><option>active</option><option>inactive</option></select></label><div className="admin-actions"><button className="admin-button" disabled={saving}>Save variant</button>{variant.id && <button type="button" className="admin-button admin-button--quiet" onClick={() => setVariant(EMPTY_VARIANT)}>Cancel</button>}</div></form><section className="admin-card"><h3>Variants</h3><div className="admin-list">{data?.product_variants?.map((item) => <button type="button" onClick={() => editVariant(item)} key={item.id}><span><strong>{item.sku || 'No SKU'}</strong><small>{[item.color,item.size].filter(Boolean).join(' / ') || item.name || 'Standard'} · {money(item.price)}</small></span><span><StatusBadge>{item.status}</StatusBadge>{item.stock_quantity} in stock</span></button>)}</div></section></div></>}</>
}

function Inventory() {
  const { data = [], error, loading, reload } = useLoad(listAdminProducts)
  const [search, setSearch] = useState(''); const [state, setState] = useState('all'); const [editing, setEditing] = useState(null); const [form, setForm] = useState({ type: 'add', quantity: 1, reason: '' }); const [notice, setNotice] = useState('')
  const rows = (data || []).flatMap((product) => (product.product_variants || []).map((variant) => ({ ...variant, product_name: product.name }))).filter((row) => { const stockState = row.stock_quantity === 0 ? 'out' : row.stock_quantity <= row.low_stock_threshold ? 'low' : 'in'; return (!search || `${row.product_name} ${row.sku} ${row.name}`.toLowerCase().includes(search.toLowerCase())) && (state === 'all' || state === stockState) })
  const submit = async (event) => { event.preventDefault(); const quantity = Number(form.quantity); const after = inventoryAfterAdjustment(editing.stock_quantity, form.type, quantity); if (after === null) { setNotice('This adjustment would make inventory negative or is invalid.'); return } const response = await adjustInventory(editing.id, form.type, quantity, form.reason); setNotice(response.error ? messageFrom(response.error) : `Inventory updated to ${after}.`); if (!response.error) { setEditing(null); setForm({ type: 'add', quantity: 1, reason: '' }); void reload() } }
  if (loading) return <AdminState title="Loading inventory…" />
  if (error) return <AdminState title="Inventory unavailable" message={messageFrom(error)} retry={reload} />
  return <><div className="admin-section-heading"><div><span className="eyebrow">Stock control</span><h2>Inventory</h2></div></div><div className="admin-filters"><label>Search<input value={search} onChange={(e) => setSearch(e.target.value)} /></label><label>Stock state<select value={state} onChange={(e) => setState(e.target.value)}><option value="all">All</option><option value="in">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option></select></label></div>{notice && <p className="admin-notice">{notice}</p>}<div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Product</th><th>Variant</th><th>SKU</th><th>Stock</th><th>Threshold</th><th>State</th><th></th></tr></thead><tbody>{rows.map((row) => { const stockState = row.stock_quantity === 0 ? 'out of stock' : row.stock_quantity <= row.low_stock_threshold ? 'low stock' : 'in stock'; return <tr key={row.id}><td>{row.product_name}</td><td>{[row.color,row.size].filter(Boolean).join(' / ') || row.name || 'Standard'}</td><td>{row.sku || '—'}</td><td>{row.stock_quantity}</td><td>{row.low_stock_threshold}</td><td><StatusBadge>{stockState}</StatusBadge></td><td><button className="admin-button admin-button--quiet" onClick={() => setEditing(row)}>Adjust</button></td></tr>})}</tbody></table></div>{editing && <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="adjust-title"><form className="admin-card admin-form" onSubmit={submit}><h3 id="adjust-title">Adjust {editing.sku || editing.name}</h3><p>Current quantity: {editing.stock_quantity}</p><label>Adjustment<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="add">Add stock</option><option value="remove">Remove stock</option><option value="set">Set stock</option></select></label><label>Quantity<input type="number" min="0" step="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required /></label><label>Reason<textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} minLength="2" maxLength="500" required /></label><div className="admin-actions"><button className="admin-button">Apply</button><button type="button" className="admin-button admin-button--quiet" onClick={() => setEditing(null)}>Cancel</button></div></form></div>}</>
}

function Customers({ selectedId }) {
  const { data = [], error, loading, reload } = useLoad(listCustomers)
  const [search, setSearch] = useState('')
  if (loading) return <AdminState title="Loading customers…" />
  if (error) return <AdminState title="Customers unavailable" message={messageFrom(error)} retry={reload} />
  if (selectedId) {
    const customer = data?.find((item) => item.id === selectedId)
    if (!customer) return <AdminState title="Customer not found" />
    const addresses = customer.orders.map((order) => order.metadata?.shipping_address).filter((address) => address && Object.keys(address).length)
    return <><div className="admin-section-heading"><div><span className="eyebrow">Customer</span><h2>{customer.full_name || customer.email}</h2></div><a href="#admin-customers">← Customers</a></div><div className="admin-grid admin-grid--two"><section className="admin-card"><h3>Profile</h3><dl className="admin-details"><div><dt>Email</dt><dd>{customer.email}</dd></div><div><dt>Joined</dt><dd>{dateTime(customer.created_at)}</dd></div><div><dt>Paid spend</dt><dd>{money(customer.total_spend)}</dd></div><div><dt>Orders</dt><dd>{customer.order_count}</dd></div></dl></section><section className="admin-card"><h3>Stored shipping addresses</h3>{addresses.length ? addresses.map((address, i) => <Address key={i} value={address} />) : <p>No addresses stored on orders.</p>}</section></div><section className="admin-card"><h3>Order history and refunds</h3><div className="admin-list">{customer.orders.map((order) => <a key={order.id} href={`#admin-order?id=${order.id}`}><span><strong>#{shortId(order.id)}</strong><small>{dateTime(order.created_at)}{order.refunds?.length ? ` · ${order.refunds.length} refund record${order.refunds.length === 1 ? '' : 's'}` : ''}</small></span><span><StatusBadge>{order.payment_status}</StatusBadge>{money(order.total)}{Number(order.refunded_amount_cents || 0) > 0 && <small>{money(order.refunded_amount_cents / 100)} refunded</small>}</span></a>)}</div></section></>
  }
  const visible = data?.filter((customer) => !search || `${customer.full_name} ${customer.email}`.toLowerCase().includes(search.toLowerCase())) || []
  return <><div className="admin-section-heading"><div><span className="eyebrow">Accounts</span><h2>Customers</h2></div><span>{visible.length} customers</span></div><div className="admin-filters"><label>Search<input value={search} onChange={(e) => setSearch(e.target.value)} /></label></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Customer</th><th>Joined</th><th>Orders</th><th>Paid spend</th><th>Latest order</th></tr></thead><tbody>{visible.map((customer) => <tr key={customer.id}><td><a href={`#admin-customer?id=${customer.id}`}>{customer.full_name || 'Customer'}</a><small>{customer.email}</small></td><td>{dateTime(customer.created_at)}</td><td>{customer.order_count}</td><td>{money(customer.total_spend)}</td><td>{dateTime(customer.latest_order_at)}</td></tr>)}</tbody></table></div></>
}

function Discounts() {
  const { data = [], error, loading, reload } = useLoad(listDiscounts)
  const emptyForm = { id: '', code: '', discountType: 'percentage', value: '', expiresAt: '', maxRedemptions: '', minimumOrder: '' }
  const [form, setForm] = useState(emptyForm); const [notice, setNotice] = useState(''); const [saving, setSaving] = useState(false)
  const update = (event) => setForm({ ...form, [event.target.name]: event.target.value })
  const submit = async (event) => { event.preventDefault(); const validation = validateDiscount(form); if (validation) { setNotice(validation); return } setSaving(true); const response = await invokeAdminFunction('manage-discount', { action: 'create', replaceId: form.id || null, code: form.code, discountType: form.discountType, percentOff: form.discountType === 'percentage' ? Number(form.value) : null, amountOffCents: form.discountType === 'fixed_amount' ? Math.round(Number(form.value) * 100) : null, expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null, maxRedemptions: form.maxRedemptions || null, minimumOrderCents: form.minimumOrder ? Math.round(Number(form.minimumOrder) * 100) : null, idempotencyKey: crypto.randomUUID() }); setSaving(false); setNotice(response.error ? messageFrom(response.error) : `Discount ${form.id ? 'replaced' : 'created'} in Stripe test mode.`); if (!response.error) { setForm(emptyForm); void reload() } }
  const deactivate = async (id) => { setSaving(true); const response = await invokeAdminFunction('manage-discount', { action: 'deactivate', id }); setSaving(false); setNotice(response.error ? messageFrom(response.error) : 'Discount deactivated.'); if (!response.error) void reload() }
  const edit = (discount) => setForm({ id: discount.id, code: discount.code, discountType: discount.discount_type, value: discount.discount_type === 'percentage' ? String(discount.percent_off) : String(discount.amount_off_cents / 100), expiresAt: discount.expires_at ? new Date(discount.expires_at).toISOString().slice(0, 16) : '', maxRedemptions: discount.max_redemptions ?? '', minimumOrder: discount.minimum_order_cents == null ? '' : String(discount.minimum_order_cents / 100) })
  if (loading) return <AdminState title="Loading discounts…" />
  if (error) return <AdminState title="Discounts unavailable" message={messageFrom(error)} retry={reload} />
  return <><div className="admin-section-heading"><div><span className="eyebrow">Stripe test mode</span><h2>Discounts</h2></div></div>{notice && <p className="admin-notice">{notice}</p>}<div className="admin-grid admin-grid--two"><form className="admin-card admin-form" onSubmit={submit}><h3>{form.id ? 'Replace discount' : 'Create discount'}</h3>{form.id && <p>Stripe discount values are immutable. Saving deactivates the old promotion and creates a replacement through the secure admin function.</p>}<label>Code<input name="code" value={form.code} onChange={update} maxLength="32" required /></label><label>Type<select name="discountType" value={form.discountType} onChange={update}><option value="percentage">Percentage</option><option value="fixed_amount">Fixed amount</option></select></label><label>{form.discountType === 'percentage' ? 'Percent off' : 'Amount off (USD)'}<input name="value" type="number" min="0.01" max={form.discountType === 'percentage' ? '100' : undefined} step="0.01" value={form.value} onChange={update} required /></label><label>Expiration<input name="expiresAt" type="datetime-local" value={form.expiresAt} onChange={update} /></label><label>Maximum redemptions<input name="maxRedemptions" type="number" min="1" step="1" value={form.maxRedemptions} onChange={update} /></label><label>Minimum order (USD)<input name="minimumOrder" type="number" min="0" step="0.01" value={form.minimumOrder} onChange={update} /></label><div className="admin-actions"><button className="admin-button" disabled={saving}>{form.id ? 'Replace in Stripe' : 'Create in Stripe'}</button>{form.id && <button type="button" className="admin-button admin-button--quiet" onClick={() => setForm(emptyForm)}>Cancel</button>}</div></form><section className="admin-card"><h3>Codes</h3>{data?.length ? <div className="admin-list">{data.map((discount) => <div key={discount.id}><span><strong>{discount.code}</strong><small>{discount.discount_type === 'percentage' ? `${discount.percent_off}% off` : `${money(discount.amount_off_cents / 100)} off`} · {discount.times_redeemed} uses</small></span><span><StatusBadge>{discount.active ? 'active' : 'inactive'}</StatusBadge><button className="admin-button admin-button--quiet" onClick={() => edit(discount)}>Edit</button>{discount.active && <button className="admin-button admin-button--quiet" onClick={() => deactivate(discount.id)}>Deactivate</button>}</span></div>)}</div> : <p>No discounts created.</p>}</section></div></>
}

function Analytics() {
  const { data, error, loading, reload } = useLoad(getAdminDashboard)
  if (loading) return <AdminState title="Loading analytics…" />
  if (error || !data) return <AdminState title="Analytics unavailable" message={messageFrom(error)} retry={reload} />
  const max = Math.max(1, ...(data.revenue_by_day || []).map((row) => Number(row.revenue)))
  return <><div className="admin-section-heading"><div><span className="eyebrow">Last 30 days</span><h2>Analytics</h2></div></div><section className="admin-card"><h3>Revenue over time</h3>{data.revenue_by_day?.length ? <div className="admin-chart" aria-label="Daily revenue chart">{data.revenue_by_day.map((row) => <div key={row.day}><span style={{ height: `${Math.max(4, Number(row.revenue) / max * 100)}%` }} title={`${row.day}: ${money(row.revenue)}`} /><small>{new Date(`${row.day}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</small></div>)}</div> : <p>No paid revenue in this period.</p>}</section></>
}

export function AdminPage({ page, id }) {
  let content
  if (page === 'admin') content = <Dashboard />
  else if (page === 'admin-orders') content = <Orders />
  else if (page === 'admin-order') content = <OrderDetail id={id} />
  else if (page === 'admin-products') content = <Products />
  else if (page === 'admin-product') content = <ProductEditor id={id} />
  else if (page === 'admin-inventory') content = <Inventory />
  else if (page === 'admin-customers') content = <Customers />
  else if (page === 'admin-customer') content = <Customers selectedId={id} />
  else if (page === 'admin-discounts') content = <Discounts />
  else content = <Analytics />
  return <AdminLayout page={page}>{content}</AdminLayout>
}

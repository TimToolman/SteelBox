// ============================================================
// MVP Container Marketplace — Public storefront
// Route: /shop (public, no auth required)
// Design source: Marketplace.dc.html (Claude Design handoff)
// Composed from the component modules in this directory.
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Modal, Snackbar, BuildClipart } from '../../components/ui'
import { useContainers, useSnackbar, useAuth, useIsMobile, useLive } from '../../hooks'
import { LoginForm } from '../../lib/auth'
import { containers, orders, messages as messagesApi, customBuilds as customBuildsApi, depots as depotsApi, photoUrl, type Container, type ContainerGrade, type ContainerSize, type ContainerCondition, type CustomBuild, type Depot } from '../../lib/api'
import { GRADE_META } from '../../lib/specs'
import { SiteNav } from '../landing'
import { resolveTenant } from '../../tenant'
import { SIZE_OPTIONS, condOf, type Tab, type SortKey, type CartMode, type CartItem, type CheckoutDetails } from './shared'
import { QuoteDialog } from './QuoteDialog'
import { ContainerCard } from './ContainerCard'
import { DetailModal } from './DetailModal'
import { CartModal } from './CartModal'
import { OrderBuildModal } from './OrderBuildModal'
import { CustomerMessageModal } from './CustomerMessageModal'
import { BulkForm } from './BulkForm'
import { CustomerProfileModal, type ProfileTab } from './CustomerProfileModal'

// ── Main Marketplace Page ──────────────────────────────────

export default function MarketplacePage() {
  // Deep-link entry from the landing page's shop-by cards:
  // /shop?tab=rent&size=20ft-std,20ft-hc&grade=A,B&cond=used&zip=70112
  const qp = (k: string) => new URLSearchParams(window.location.search).get(k)
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const t = qp('tab')
    return t === 'rent' || t === 'custom' || t === 'bulk' ? t : 'buy'
  })
  const ALL_SIZES = SIZE_OPTIONS.map(([v]) => v)
  // Top-level gate: shoppers first pick New or Used ('all' = grouped view);
  // the remaining filters only appear once a condition is chosen.
  const [condFilter, setCondFilter] = useState<'all' | ContainerCondition>(() => {
    const c = qp('cond')
    return c === 'new' || c === 'used' ? c : 'all'
  })
  const [sizeFilters, setSizeFilters] = useState<Set<ContainerSize>>(() => {
    const wanted = (qp('size') ?? '').split(',').filter(s => (ALL_SIZES as string[]).includes(s)) as ContainerSize[]
    return new Set(wanted.length ? wanted : ALL_SIZES)
  })
  const [gradeFilters, setGradeFilters] = useState<Set<ContainerGrade>>(() => {
    const all: ContainerGrade[] = ['A', 'B', 'C', 'R', 'X']
    const wanted = (qp('grade') ?? '').split(',').filter(g => (all as string[]).includes(g)) as ContainerGrade[]
    return new Set(wanted.length ? wanted : all)
  })
  // null = no color restriction (all colors checked)
  const [colorSel, setColorSel] = useState<Set<string> | null>(null)
  // Depot filter — shoppers may only want stock at nearby yards. null = all depots.
  const [depotSel, setDepotSel] = useState<Set<string> | null>(null)
  const [depotList, setDepotList] = useState<Depot[]>([])
  useEffect(() => { depotsApi.list().then(setDepotList).catch(() => {}) }, [])
  // Compact combo-box: the depot list lives in a dropdown; closed state shows a summary.
  const [depotDdOpen, setDepotDdOpen] = useState(false)
  const depotDdRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (depotDdRef.current && !depotDdRef.current.contains(e.target as Node)) setDepotDdOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [sort, setSort] = useState<SortKey>('price-asc')
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null)
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [quotePurpose, setQuotePurpose] = useState<'quote' | 'contact' | 'rental'>('quote')
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  const [msgOpen, setMsgOpen] = useState(false)
  // ?profile=1 deep link: the landing pages' profile icon lands here with
  // the sign-in / profile sheet already open.
  const [profileOpen, setProfileOpen] = useState(() => qp('profile') === '1')
  const [accountOpen, setAccountOpen] = useState(false)
  const [accountTab, setAccountTab] = useState<ProfileTab>('account')
  const browseRef = useRef<HTMLDivElement>(null)
  const { toast, message, open: snackOpen, close: snackClose } = useSnackbar()
  const isMobile = useIsMobile()
  // Brand/contact config for the shared SiteNav header.
  const tenant = resolveTenant(window.location.hostname)
  // Phones: the filter sidebar collapses behind a toggle so inventory shows first.
  const [filtersOpen, setFiltersOpen] = useState(false)

  const { data: allContainers, loading, refetch: refetchContainers } = useContainers()
  const { user, logout } = useAuth()
  const customerEmail = user?.email.toLowerCase() ?? ''

  // Custom Builds catalog (admin-managed) + the order-a-build dialog.
  const [builds, setBuilds] = useState<CustomBuild[]>([])
  const [orderBuild, setOrderBuild] = useState<CustomBuild | null>(null)
  const loadBuilds = useCallback(() => customBuildsApi.list().then(setBuilds).catch(() => {}), [])
  useEffect(() => { loadBuilds() }, [loadBuilds])
  // Admin catalog edits (Settings → Custom Builds) show up live.
  useLive(['custombuilds'], loadBuilds)

  // Keep inventory fresh: re-pull whenever the shopper switches tabs
  // (Buy ⇄ Rent ⇄ …), opens the cart or detail views won't need it, and
  // whenever the window regains focus (e.g. after editing in the admin tab).
  useEffect(() => { refetchContainers(); if (activeTab === 'custom') loadBuilds() }, [activeTab]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onFocus = () => { if (document.visibilityState !== 'hidden') refetchContainers() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus) }
  }, [refetchContainers])

  // Unread replies addressed to this customer (requires a signed-in account).
  const [customerReplies, setCustomerReplies] = useState(0)
  const loadReplies = useCallback(() => {
    if (!user) { setCustomerReplies(0); return }
    messagesApi.list().then(ms => {
      setCustomerReplies(ms.filter(m => m.toRole === 'customer' && !m.read && !m.trashed
        && (m.toEmail || '').trim().toLowerCase() === customerEmail).length)
    }).catch(() => {})
  }, [user, customerEmail])
  useEffect(() => {
    loadReplies()
    const onFocus = () => { if (document.visibilityState !== 'hidden') loadReplies() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus) }
  }, [loadReplies])
  // Driver/dispatch replies pop the badge live.
  useLive(['messages'], loadReplies)
  // Admin draft-preview is on when signed in as admin, OR forced via ?admin=1
  // in the URL (handy for demos). Use ?admin=0 to force the customer view.
  const adminParam = new URLSearchParams(window.location.search).get('admin')
  const isAdmin = adminParam === '0' ? false : (adminParam !== null || user?.role === 'admin')

  // Only listed inventory is shown publicly. Drafts (awaiting photo
  // documentation), sold, and in-fulfilment units never reach the marketplace —
  // except admins, who additionally see draft units (badged "Draft") for preview.
  const listable = allContainers.filter(
    c => c.status === 'available' || c.status === 'sale_in_progress' || (isAdmin && c.status === 'draft')
  )

  // Respect each container's listingType for the active browse tab:
  // the Buy tab shows buy/both units; the Rent tab shows rent/both units
  // (and only those with a monthly rate).
  const lt = (c: Container) => c.listingType ?? 'both'
  const tabListable = listable.filter(c => {
    if (activeTab === 'rent') return (lt(c) === 'rent' || lt(c) === 'both') && c.rentMonthly != null
    if (activeTab === 'buy') return lt(c) === 'buy' || lt(c) === 'both'
    return true
  })

  // Colors present in the currently browsable new stock — drives the Color filter.
  const colorOptions = [...new Set(tabListable.filter(c => condOf(c) === 'new').map(c => c.color || 'Unspecified'))].sort()

  // Filter containers. On the Rent tab, "price" means the monthly rate.
  // Sub-filters are condition-scoped: grade applies when browsing Used,
  // color when browsing New (they're hidden otherwise, so they can't strand results).
  const priceOf = (c: Container) => activeTab === 'rent' ? (c.rentMonthly ?? c.buyPrice) : c.buyPrice
  const filtered = tabListable.filter(c => {
    if (condFilter !== 'all' && condOf(c) !== condFilter) return false
    if (depotSel && !depotSel.has(c.depotLocation)) return false
    if (!sizeFilters.has(c.size)) return false
    if (condFilter === 'used' && !gradeFilters.has(c.grade)) return false
    if (condFilter === 'new' && colorSel && !colorSel.has(c.color || 'Unspecified')) return false
    if (minPrice && priceOf(c) < Number(minPrice)) return false
    if (maxPrice && priceOf(c) > Number(maxPrice)) return false
    return true
  }).sort((a, b) => {
    if (sort === 'new-first') return (condOf(a) === condOf(b)) ? priceOf(a) - priceOf(b) : (condOf(a) === 'new' ? -1 : 1)
    if (sort === 'price-asc') return priceOf(a) - priceOf(b)
    if (sort === 'price-desc') return priceOf(b) - priceOf(a)
    if (sort === 'condition') return (b.conditionScore || 0) - (a.conditionScore || 0)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })

  const countBySize = (s: ContainerSize) => tabListable.filter(c => c.size === s && (condFilter === 'all' || condOf(c) === condFilter)).length
  const countByCond = (k: ContainerCondition) => tabListable.filter(c => condOf(c) === k).length

  const toggleColor = (col: string) => {
    setColorSel(prev => {
      const next = new Set(prev ?? colorOptions)
      next.has(col) ? next.delete(col) : next.add(col)
      return next
    })
  }

  // Depots with browsable stock in the current tab/condition scope, grouped by
  // the market they serve ("Atlanta, GA" → its two yards). Unknown/legacy
  // depotLocation strings fall under "Other locations".
  const countByDepot = (name: string) => tabListable.filter(c => c.depotLocation === name && (condFilter === 'all' || condOf(c) === condFilter)).length
  const stockedDepotNames = [...new Set(tabListable.map(c => c.depotLocation).filter(Boolean))].filter(n => countByDepot(n) > 0)
  const depotGroups = [...new Set(stockedDepotNames.map(n => depotList.find(d => d.name === n)?.destination || 'Other locations'))]
    .sort()
    .map(dest => ({ dest, names: stockedDepotNames.filter(n => (depotList.find(d => d.name === n)?.destination || 'Other locations') === dest).sort() }))

  const toggleDepot = (name: string) => {
    setDepotSel(prev => {
      const next = new Set(prev ?? stockedDepotNames)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const toggleGrade = (g: ContainerGrade) => {
    setGradeFilters(prev => {
      const next = new Set(prev)
      next.has(g) ? next.delete(g) : next.add(g)
      return next
    })
  }

  const toggleSize = (s: ContainerSize) => {
    setSizeFilters(prev => {
      const next = new Set(prev)
      next.has(s) ? next.delete(s) : next.add(s)
      return next
    })
  }

  const inCart = (id: string) => cart.some(i => i.container.id === id)

  const addToCart = (c: Container, mode: CartMode) => {
    if (inCart(c.id)) { setCartOpen(true); return }
    setCart(prev => [...prev, { container: c, mode, rentTerm: 6 }])
    setSelectedContainer(null)
    toast(`${c.sku} added to cart · ${mode === 'rent' ? 'Rental' : 'Purchase'}`)
  }

  const removeFromCart = (id: string) => setCart(prev => prev.filter(i => i.container.id !== id))
  const updateCartItem = (id: string, patch: Partial<CartItem>) =>
    setCart(prev => prev.map(i => i.container.id === id ? { ...i, ...patch } : i))
  // Rentals longer than 12 months are handled by sales — send them to a rental quote.
  const longTermInquiry = () => { setCartOpen(false); openQuote('rental') }

  // Finalize the order: reserve each container, write a real order row per item, refresh inventory.
  // Items that fail stay in the cart; the checkout modal surfaces the error.
  const placeOrder = async (details: CheckoutDetails) => {
    // Same "street, city, ST zip" shape used by orders.csv and schedule.csv addresses.
    const fullAddress = `${details.address.trim()}, ${details.city.trim()}, ${details.state.trim()} ${details.zip.trim()}`
    const results = await Promise.allSettled(cart.map(async i => {
      // Reserve is best-effort: a failed lock shouldn't lose the sale.
      await containers.reserve(i.container.id).catch(() => {})
      const isRent = i.mode === 'rent'
      const amount = isRent ? (i.container.rentMonthly || 0) * i.rentTerm : i.container.buyPrice
      await orders.create({
        containerId: i.container.id,
        containerSku: i.container.sku,
        customerName: `${details.firstName} ${details.lastName}`.trim(),
        customerEmail: details.email,
        customerPhone: details.phone,
        deliveryAddress: fullAddress,
        deliveryZip: details.zip,
        amount,
        status: 'sale_in_progress',
        saleType: i.mode,
        notifySms: details.notifySms,
        unitCost: i.container.purchaseCost || 0,
        deposit: isRent ? (i.container.rentMonthly || 0) : 0,
        driverHours: 0,           // set when a driver is scheduled
      })
    }))
    const failedIds = new Set(cart.filter((_, idx) => results[idx].status === 'rejected').map(i => i.container.id))
    setCart(prev => prev.filter(i => failedIds.has(i.container.id)))
    await refetchContainers()
    if (failedIds.size > 0) {
      throw new Error(failedIds.size === cart.length
        ? 'Your order could not be placed — please try again or call (504) 555-0190.'
        : `${cart.length - failedIds.size} of ${cart.length} items were ordered, but ${failedIds.size} failed and stayed in your cart. Please retry those.`)
    }
  }

  const openQuote = (purpose: 'quote' | 'contact' | 'rental') => {
    setQuotePurpose(purpose)
    setSelectedContainer(null)
    setQuoteOpen(true)
  }

  return (
    <div style={{ fontFamily: 'var(--sans)', background: 'var(--pg)', color: 'var(--ink)', minHeight: '100vh' }}>
      {/* ── Nav — the shared site-wide header (same one as the landing
             pages), with the marketplace's cart/profile in the right slot. */}
      <SiteNav
        tenant={tenant}
        active={activeTab}
        onSelect={t => { setActiveTab(t); setSelectedContainer(null) }}
        right={
          <>
            <button onClick={() => setCartOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: isMobile ? '7px 12px' : '7px 16px', borderRadius: 'var(--pill)', background: 'var(--cta)', color: '#fff', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M1 2h2.5l2 9h9l2-7H5" /><circle cx="8" cy="17.5" r="1.5" fill="#fff" stroke="none" /><circle cx="13" cy="17.5" r="1.5" fill="#fff" stroke="none" /></svg>
              {!isMobile && 'Cart '}<span style={{ background: 'rgba(255,255,255,.25)', padding: '0 6px', borderRadius: '99px', fontSize: '10px', marginLeft: '2px' }}>{cart.length}</span>
            </button>
            <button onClick={() => setProfileOpen(true)} title={customerReplies > 0 ? `${customerReplies} new message${customerReplies > 1 ? 's' : ''} from your driver` : user ? `${user.name} · Profile` : 'Sign in / Profile'} style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '38px', height: '38px', borderRadius: '50%', background: user ? 'var(--primary)' : 'transparent', border: user ? 'none' : '1.5px solid var(--div)', cursor: 'pointer', flexShrink: 0 }}>
              {user
                ? <span style={{ color: '#fff', fontSize: '13px', fontWeight: 700, letterSpacing: '0.3px' }}>{(user.name || user.email).trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()}</span>
                : <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="var(--primary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="6.5" r="3" /><path d="M3.5 17a6.5 6.5 0 0 1 13 0" /></svg>}
              {customerReplies > 0 && (
                <span style={{ position: 'absolute', top: '-4px', right: '-4px', minWidth: '16px', height: '16px', padding: '0 3px', borderRadius: '999px', background: 'var(--cta)', border: '2px solid var(--surf-w)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="9" height="9" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 5.5A1.5 1.5 0 0 1 4 4h12a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 16 16H4a1.5 1.5 0 0 1-1.5-1.5z" /><polyline points="3 5.5 10 11 17 5.5" /></svg>
                </span>
              )}
            </button>
          </>
        }
      />

      {/* ── Browse panel ── */}
      {(activeTab === 'buy' || activeTab === 'rent') && (
        <div ref={browseRef} style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', width: '100%' }}>
          {/* Mobile: filters live behind a toggle bar so inventory shows first */}
          {isMobile && (
            <button onClick={() => setFiltersOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '12px 16px', background: 'var(--surf-w)', border: 'none', borderBottom: '1px solid var(--div)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
                Filters &amp; Sort
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ transform: filtersOpen ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}><polyline points="6 9 12 15 18 9" /></svg>
            </button>
          )}
          {/* Sidebar */}
          <aside style={isMobile
            ? { display: filtersOpen ? 'block' : 'none', width: '100%', boxSizing: 'border-box', borderBottom: '1px solid var(--div)', padding: '14px 16px', background: 'var(--surf-w)' }
            : { width: 'var(--sb-w)', flexShrink: 0, borderRight: '1px solid var(--div)', padding: '14px 10px', position: 'sticky', top: 'var(--nav-h)', height: 'calc(100vh - var(--nav-h))', overflowY: 'auto', background: 'var(--surf-w)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.4px' }}>Filters</span>
              <button onClick={() => { setCondFilter('all'); setSizeFilters(new Set(ALL_SIZES)); setGradeFilters(new Set(['A','B','C','R','X'])); setColorSel(null); setDepotSel(null) }} style={{ background: 'none', border: 'none', fontSize: '11px', fontWeight: 600, color: 'var(--primary)', cursor: 'pointer' }}>Reset</button>
            </div>

            {/* Condition gate — pick New or Used first; sub-filters follow */}
            <div style={{ marginBottom: '10px' }}>
              <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', display: 'block', marginBottom: '5px' }}>Condition</span>
              <div style={{ display: 'flex', gap: '5px' }}>
                {([['all', 'All'], ['new', 'New'], ['used', 'Used']] as ['all' | ContainerCondition, string][]).map(([val, label]) => (
                  <button key={val} onClick={() => setCondFilter(val)} style={{
                    flex: 1, padding: '7px 4px', borderRadius: 'var(--r8)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--sans)',
                    border: `1.5px solid ${condFilter === val ? 'var(--primary)' : 'var(--div)'}`,
                    background: condFilter === val ? 'var(--primary)' : 'var(--surf-w)',
                    color: condFilter === val ? '#fff' : 'var(--ink2)',
                  }}>
                    {label}{val !== 'all' && <span style={{ fontSize: '10px', fontWeight: 600, opacity: 0.75 }}> {countByCond(val)}</span>}
                  </button>
                ))}
              </div>
              {condFilter === 'all' && (
                <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '6px', lineHeight: 1.45 }}>Choose New or Used to unlock size, {`condition & color`} filters.</div>
              )}
            </div>

            {/* Depot — location matters no matter New or Used, so it's not behind the gate.
                Rendered as a combo-box: closed shows a summary, open shows the grouped list. */}
            {depotGroups.length > 0 && (() => {
              const selCount = depotSel ? [...depotSel].filter(n => stockedDepotNames.includes(n)).length : stockedDepotNames.length
              const allOn = !depotSel || selCount === stockedDepotNames.length
              return (
                <div style={{ marginBottom: '10px' }}>
                  <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', display: 'block', marginBottom: '5px' }}>Depot</span>
                  <div ref={depotDdRef} style={{ position: 'relative' }}>
                    <button onClick={() => setDepotDdOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', width: '100%', padding: '8px 10px', borderRadius: 'var(--r8)', border: `1.5px solid ${allOn ? 'var(--div)' : 'var(--primary)'}`, background: 'var(--surf-w)', fontSize: '12px', fontWeight: allOn ? 400 : 600, color: allOn ? 'var(--ink2)' : 'var(--primary)', cursor: 'pointer', fontFamily: 'var(--sans)' }}>
                      <span>{allOn ? 'All depots' : `${selCount} of ${stockedDepotNames.length} depots`}</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" style={{ flexShrink: 0, transform: depotDdOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><polyline points="6 9 12 15 18 9" /></svg>
                    </button>
                    {depotDdOpen && (
                      <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 60, background: 'var(--surf-w)', border: '1px solid var(--div)', borderRadius: 'var(--r8)', boxShadow: 'var(--sh2)', maxHeight: '280px', overflowY: 'auto', padding: '6px 10px 8px' }}>
                        <button onClick={() => setDepotSel(null)} style={{ background: 'none', border: 'none', padding: '4px 0', fontSize: '11px', fontWeight: 600, color: 'var(--primary)', cursor: 'pointer', fontFamily: 'var(--sans)' }}>Select all</button>
                        {depotGroups.map(({ dest, names }) => (
                          <div key={dest}>
                            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink3)', padding: '5px 0 2px' }}>{dest}</div>
                            {names.map(name => {
                              const on = !depotSel || depotSel.has(name)
                              return (
                                <div key={name} onClick={() => toggleDepot(name)} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 0', borderBottom: '1px solid var(--div)', cursor: 'pointer' }}>
                                  <div style={{ width: '17px', height: '17px', borderRadius: 'var(--r4)', background: on ? 'var(--primary)' : 'var(--surf-w)', border: `1.5px solid ${on ? 'var(--primary)' : 'var(--div)'}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                                    {on && <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><polyline points="2,6 5,9 10,3" /></svg>}
                                  </div>
                                  <span style={{ fontSize: '12px', color: 'var(--ink2)', flex: 1, lineHeight: 1.3 }}>{name}</span>
                                  <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700, color: 'var(--ink3)' }}>{countByDepot(name)}</span>
                                </div>
                              )
                            })}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

            <hr style={{ border: 'none', borderTop: '1px solid var(--div)', margin: '8px 0' }} />

            {/* Sort */}
            <div style={{ marginBottom: '10px' }}>
              <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', display: 'block', marginBottom: '5px' }}>Sort By</span>
              <select value={sort} onChange={e => setSort(e.target.value as SortKey)} style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r8)', border: '1.5px solid var(--div)', background: 'var(--surf-w)', fontSize: '12px', cursor: 'pointer', outline: 'none', fontFamily: 'var(--sans)' }}>
                <option value="price-asc">Price: Low → High</option>
                <option value="price-desc">Price: High → Low</option>
                <option value="new-first">New → Used</option>
                <option value="condition">Best Condition First</option>
                <option value="newest">Newest Listed</option>
              </select>
            </div>

            {/* Sub-filters appear once the shopper has decided New vs Used */}
            {condFilter !== 'all' && (
              <>
                <hr style={{ border: 'none', borderTop: '1px solid var(--div)', margin: '8px 0' }} />

                {/* Size filters */}
                <div style={{ marginBottom: '10px' }}>
                  <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', display: 'block', marginBottom: '5px' }}>Size</span>
                  {SIZE_OPTIONS.filter(([val]) => countBySize(val) > 0).map(([val, label]) => (
                    <div key={val} onClick={() => toggleSize(val)} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 0', borderBottom: '1px solid var(--div)', cursor: 'pointer' }}>
                      <div style={{ width: '17px', height: '17px', borderRadius: 'var(--r4)', background: sizeFilters.has(val) ? 'var(--primary)' : 'var(--surf-w)', border: `1.5px solid ${sizeFilters.has(val) ? 'var(--primary)' : 'var(--div)'}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                        {sizeFilters.has(val) && <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><polyline points="2,6 5,9 10,3" /></svg>}
                      </div>
                      <span style={{ fontSize: '12px', color: 'var(--ink2)', flex: 1 }}>{label}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700, color: 'var(--ink3)' }}>{countBySize(val)}</span>
                    </div>
                  ))}
                </div>

                {/* Used stock varies by inspected grade; new stock is all one-trip */}
                {condFilter === 'used' && (
                  <>
                    <hr style={{ border: 'none', borderTop: '1px solid var(--div)', margin: '8px 0' }} />
                    <div style={{ marginBottom: '10px' }}>
                      <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', display: 'block', marginBottom: '5px' }}>Condition Grade</span>
                      {(['A','B','C','R','X'] as ContainerGrade[]).map(g => (
                        <div key={g} onClick={() => toggleGrade(g)} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 0', borderBottom: '1px solid var(--div)', cursor: 'pointer' }}>
                          <div style={{ width: '17px', height: '17px', borderRadius: 'var(--r4)', background: gradeFilters.has(g) ? 'var(--primary)' : 'var(--surf-w)', border: `1.5px solid ${gradeFilters.has(g) ? 'var(--primary)' : 'var(--div)'}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                            {gradeFilters.has(g) && <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><polyline points="2,6 5,9 10,3" /></svg>}
                          </div>
                          <span style={{ fontSize: '12px', color: 'var(--ink2)', flex: 1 }}>
                            <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: '3px', fontSize: '9px', fontWeight: 700, background: GRADE_META[g].color, color: '#fff', marginRight: '5px' }}>{g}</span>
                            {GRADE_META[g].label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* New stock comes in factory colors */}
                {condFilter === 'new' && colorOptions.length > 0 && (
                  <>
                    <hr style={{ border: 'none', borderTop: '1px solid var(--div)', margin: '8px 0' }} />
                    <div style={{ marginBottom: '10px' }}>
                      <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', display: 'block', marginBottom: '5px' }}>Color</span>
                      {colorOptions.map(col => {
                        const on = !colorSel || colorSel.has(col)
                        return (
                          <div key={col} onClick={() => toggleColor(col)} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 0', borderBottom: '1px solid var(--div)', cursor: 'pointer' }}>
                            <div style={{ width: '17px', height: '17px', borderRadius: 'var(--r4)', background: on ? 'var(--primary)' : 'var(--surf-w)', border: `1.5px solid ${on ? 'var(--primary)' : 'var(--div)'}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                              {on && <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round"><polyline points="2,6 5,9 10,3" /></svg>}
                            </div>
                            <span style={{ fontSize: '12px', color: 'var(--ink2)', flex: 1 }}>{col}</span>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: '10px', fontWeight: 700, color: 'var(--ink3)' }}>{tabListable.filter(c => condOf(c) === 'new' && (c.color || 'Unspecified') === col).length}</span>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}

                <hr style={{ border: 'none', borderTop: '1px solid var(--div)', margin: '8px 0' }} />

                {/* Price range */}
                <div style={{ marginBottom: '10px' }}>
                  <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', display: 'block', marginBottom: '5px' }}>Price Range</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <input value={minPrice} onChange={e => setMinPrice(e.target.value)} placeholder="Min $" type="number" style={{ padding: '7px 9px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontFamily: 'var(--mono)', fontSize: '12px', outline: 'none' }} />
                    <input value={maxPrice} onChange={e => setMaxPrice(e.target.value)} placeholder="Max $" type="number" style={{ padding: '7px 9px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontFamily: 'var(--mono)', fontSize: '12px', outline: 'none' }} />
                  </div>
                </div>
              </>
            )}
          </aside>

          {/* Grid area */}
          <div style={{ flex: 1, padding: '18px 18px 60px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '14px', fontWeight: 700 }}>{filtered.length} containers</span>
              <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>· Gulf Coast region</span>
            </div>

            {loading ? (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(auto-fill, minmax(220px, 1fr))' : 'repeat(4,1fr)', gap: '10px' }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} style={{ background: 'var(--surf-w)', borderRadius: 'var(--r16)', border: '1px solid var(--div)', height: '260px', animation: 'pulse 1.5s ease infinite' }} />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--ink3)' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>📦</div>
                <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>No containers match your filters</div>
                <div style={{ fontSize: '13px' }}>Try adjusting grade or price filters, or call us directly.</div>
              </div>
            ) : condFilter === 'all' ? (
              // No condition picked yet — group the results into New and Used sections.
              (['new', 'used'] as ContainerCondition[]).map(k => {
                const group = filtered.filter(c => condOf(c) === k)
                if (!group.length) return null
                return (
                  <div key={k} style={{ marginBottom: '26px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                      <span style={{ fontSize: '15px', fontWeight: 700 }}>{k === 'new' ? 'New Containers' : 'Used Containers'}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 700, color: 'var(--ink3)', background: 'var(--surf1)', border: '1px solid var(--div)', borderRadius: 'var(--pill)', padding: '1px 9px' }}>{group.length}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
                      {group.map(c => (
                        <ContainerCard key={c.id} container={c} onSelect={setSelectedContainer} mode={activeTab === 'rent' ? 'rent' : 'buy'} inCart={inCart(c.id)} onAddToCart={addToCart} />
                      ))}
                    </div>
                  </div>
                )
              })
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
                {filtered.map(c => (
                  <ContainerCard key={c.id} container={c} onSelect={setSelectedContainer} mode={activeTab === 'rent' ? 'rent' : 'buy'} inCart={inCart(c.id)} onAddToCart={addToCart} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Custom Builds panel ── */}
      {activeTab === 'custom' && (
        <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '32px 20px 80px' }}>
          <div style={{ marginBottom: '20px' }}>
            <h2 style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-0.3px', marginBottom: '4px' }}>Custom Container Builds</h2>
            <p style={{ fontSize: '13px', color: 'var(--ink3)' }}>Modified to your specs — roll-up doors, personnel doors, windows, electrics, and more. Built at our Houston depot and delivered ready to use.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '14px' }}>
            {builds.length === 0 && <div style={{ color: 'var(--ink3)', fontSize: '13px', padding: '30px 0' }}>No custom builds published yet — check back soon.</div>}
            {builds.map(cb => (
              <div key={cb.id} style={{ background: 'var(--surf-w)', borderRadius: 'var(--r16)', border: '1px solid var(--div)', boxShadow: 'var(--sh1)', overflow: 'hidden', transition: 'transform 0.2s, box-shadow 0.2s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)'; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--sh2)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--sh1)' }}
              >
                {/* Product photo, or clean clipart until one is uploaded */}
                <div style={{ width: '100%', aspectRatio: '16/9', background: 'linear-gradient(135deg,#1E293B,#0F2D4A)', overflow: 'hidden' }}>
                  {cb.photo
                    ? <img src={photoUrl(cb.photo)} alt={cb.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    : <BuildClipart name={cb.name} />}
                </div>
                <div style={{ padding: '14px 15px 16px' }}>
                  {cb.tag && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 9px', borderRadius: 'var(--r4)', fontSize: '10px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', background: 'var(--slate-cont)', color: 'var(--slate)', marginBottom: '8px' }}>{cb.tag}</span>}
                  <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>{cb.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--ink3)', lineHeight: 1.55, marginBottom: '12px' }}>{cb.description}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '14px' }}>
                    {cb.features.map(f => <span key={f} style={{ padding: '3px 9px', borderRadius: 'var(--r4)', background: 'var(--surf1)', color: 'var(--ink2)', fontSize: '11px' }}>{f}</span>)}
                  </div>
                  {/* Pricing is settled by the estimate — no list price shown */}
                  <button onClick={() => setOrderBuild(cb)} style={{ width: '100%', padding: '11px', borderRadius: 'var(--pill)', background: 'var(--cta)', color: '#fff', fontSize: '13px', fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 2px 8px rgba(230,81,0,.25)' }}>Request Estimate</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── B2B / Bulk panel ── */}
      {activeTab === 'bulk' && (
        <div style={{ maxWidth: '540px', margin: '0 auto', padding: '56px 20px 80px' }}>
          <h2 style={{ fontSize: '26px', fontWeight: 700, marginBottom: '8px' }}>Bulk & B2B Pricing</h2>
          <p style={{ fontSize: '14px', color: 'var(--ink3)', lineHeight: 1.65, marginBottom: '24px' }}>
            Purchasing 5+ units or need ongoing rental supply? We offer volume discounts, ACH payment terms, dedicated account management, and priority inventory access.
          </p>
          <BulkForm onSuccess={() => toast('Request submitted! We\'ll call you within 2 hours.')} />
        </div>
      )}

      {/* ── Trust bar ── */}
      <div style={{ background: 'var(--ink)', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '36px', flexWrap: 'wrap' }}>
        {[
          { icon: '🛡', text: 'Field-inspected every unit' },
          { icon: '🚚', text: '3–5 day delivery' },
          { icon: '📷', text: '12-photo documentation' },
          { icon: '📅', text: 'Flexible rental terms' },
          { icon: '✓', text: 'Lifetime warranty' },
        ].map(item => (
          <div key={item.text} style={{ display: 'flex', alignItems: 'center', gap: '9px', color: 'rgba(255,255,255,.65)', fontSize: '12px', fontWeight: 500 }}>
            <div style={{ width: '30px', height: '30px', borderRadius: 'var(--r8)', background: 'rgba(255,255,255,.07)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>{item.icon}</div>
            {item.text}
          </div>
        ))}
      </div>

      {/* ── Container detail modal ── */}
      <DetailModal
        container={selectedContainer}
        onClose={() => setSelectedContainer(null)}
        onAddToCart={addToCart}
        mode={activeTab === 'rent' ? 'rent' : 'buy'}
        inCart={selectedContainer ? inCart(selectedContainer.id) : false}
        index={selectedContainer ? filtered.findIndex(c => c.id === selectedContainer.id) : -1}
        total={filtered.length}
        onNavigate={dir => {
          const i = filtered.findIndex(c => c.id === selectedContainer?.id)
          const next = filtered[i + dir]
          if (next) setSelectedContainer(next)
        }}
      />

      {/* ── Cart / checkout ── */}
      <CartModal
        open={cartOpen}
        cart={cart}
        user={user}
        onClose={() => setCartOpen(false)}
        onRemove={removeFromCart}
        onUpdateItem={updateCartItem}
        onLongTermInquiry={longTermInquiry}
        onPlaceOrder={placeOrder}
      />

      {/* ── Quote dialog ── */}
      <QuoteDialog
        open={quoteOpen}
        onClose={() => setQuoteOpen(false)}
        title={quotePurpose === 'contact' ? 'Contact Us' : quotePurpose === 'rental' ? 'Get a Rental Quote' : 'Request a Quote'}
        subtitle={`Tell us about your project and we'll follow up within 2 hours — or call (504) 555-0190.`}
        defaultNeed={quotePurpose === 'rental' ? 'rent-short' : ''}
        onSuccess={() => toast('Request submitted! We\'ll be in touch within 2 hours.')}
      />

      {/* ── Profile menu — options only appear once signed in ── */}
      <Modal open={profileOpen} onClose={() => setProfileOpen(false)} maxWidth={380} closeLabel="Close">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
          <div style={{ width: '46px', height: '46px', borderRadius: '50%', background: 'var(--primary-cont)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="var(--primary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="6.5" r="3" /><path d="M3.5 17a6.5 6.5 0 0 1 13 0" /></svg>
          </div>
          <div>
            <div style={{ fontSize: '17px', fontWeight: 700 }}>{user ? user.name || 'Your Profile' : 'Your Profile'}</div>
            <div style={{ fontSize: '12px', color: 'var(--ink3)' }}>{user ? `Signed in · ${user.email}` : 'Sign in to manage your account & orders'}</div>
          </div>
        </div>
        {!user && (
          <LoginForm allowRegister subtitle="Sign in or create an account to see your profile, saved info, orders, and driver messages." />
        )}
        {user && ([
          { key: 'account', label: 'My Account', desc: 'Sign-in, billing & preferences', icon: <><circle cx="10" cy="6.5" r="3" /><path d="M3.5 17a6.5 6.5 0 0 1 13 0" /></> },
          { key: 'info', label: 'My Info', desc: 'Contact details & delivery addresses', icon: <><rect x="3" y="4" width="14" height="12" rx="2" /><line x1="6" y1="8" x2="14" y2="8" /><line x1="6" y1="11.5" x2="11" y2="11.5" /></> },
          { key: 'message', label: 'Message Driver', desc: 'Send a note to your delivery driver', icon: <><path d="M2.5 5.5A1.5 1.5 0 0 1 4 4h12a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 16 16H4a1.5 1.5 0 0 1-1.5-1.5z" /><polyline points="3 5.5 10 11 17 5.5" /></> },
        ] as const).map(item => (
          <button
            key={item.key}
            onClick={() => {
              setProfileOpen(false)
              // Messaging a driver also requires a signed-in account — route
              // signed-out visitors to the sign-in screen first.
              if (item.key === 'message' && user) setMsgOpen(true)
              else { setAccountTab(item.key === 'info' ? 'info' : 'account'); setAccountOpen(true) }
            }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', marginBottom: '8px', borderRadius: 'var(--r12)', border: '1.5px solid var(--div)', background: 'var(--surf-w)', cursor: 'pointer', textAlign: 'left' }}
          >
            <span style={{ width: '34px', height: '34px', borderRadius: 'var(--r8)', background: 'var(--surf1)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="var(--primary)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{item.icon}</svg>
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: '14px', fontWeight: 700 }}>{item.label}</span>
              <span style={{ display: 'block', fontSize: '11px', color: 'var(--ink3)' }}>{item.desc}</span>
            </span>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--ink3)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="8 4 14 10 8 16" /></svg>
          </button>
        ))}
        {user && (
          <button
            onClick={() => { logout(); setProfileOpen(false); toast('Signed out') }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', marginTop: '4px', borderRadius: 'var(--r12)', border: '1.5px solid var(--cta-cont)', background: 'var(--surf-w)', cursor: 'pointer', textAlign: 'left' }}
          >
            <span style={{ width: '34px', height: '34px', borderRadius: 'var(--r8)', background: 'var(--cta-cont)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--cta)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 17H4a1 1 0 01-1-1V4a1 1 0 011-1h4" /><polyline points="13,6 17,10 13,14" /><line x1="17" y1="10" x2="7" y2="10" /></svg>
            </span>
            <span style={{ flex: 1 }}>
              <span style={{ display: 'block', fontSize: '14px', fontWeight: 700, color: 'var(--cta)' }}>Sign Out</span>
              <span style={{ display: 'block', fontSize: '11px', color: 'var(--ink3)' }}>{user.email}</span>
            </span>
          </button>
        )}
      </Modal>

      {/* ── Account / My Info / Orders (requires a signed-in account) ── */}
      <CustomerProfileModal
        open={accountOpen}
        initialTab={accountTab}
        onClose={() => setAccountOpen(false)}
        onMessageDriver={() => { setAccountOpen(false); setMsgOpen(true) }}
        onSaved={() => { setAccountOpen(false); setProfileOpen(true) }}
        toast={toast}
      />

      <CustomerMessageModal open={msgOpen} onClose={() => setMsgOpen(false)} onSent={(m) => toast(m)} />

      {/* ── Order a custom build ── */}
      <OrderBuildModal
        build={orderBuild}
        user={user}
        onClose={() => setOrderBuild(null)}
        onPlaced={() => { refetchContainers() }}
        toast={toast}
      />

      <Snackbar message={message} open={snackOpen} onClose={snackClose} />
    </div>
  )
}

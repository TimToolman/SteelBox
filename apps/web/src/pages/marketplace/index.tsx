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
import { containers, orders, messages as messagesApi, customBuilds as customBuildsApi, depots as depotsApi, sellers as sellersApi, meetPoints as meetPointsApi, photoUrl, hasGrant, type MeetPoint, type Container, type ContainerGrade, type ContainerSize, type ContainerCondition, type CustomBuild, type Depot, type Seller } from '../../lib/api'
import { SupplierFleet } from './SupplierFleet'
import SupplierPortalPage from '../supplier'
import ShipperReviewPage from '../shipper'
import { GRADE_META } from '../../lib/specs'
import { sellerForZip, relayQuote, type RelayQuote } from '../../lib/territory'
import { SiteNav } from '../landing'
import { resolveTenant } from '../../tenant'
import { SIZE_OPTIONS, condOf, useFavorites, type Tab, type SortKey, type CartMode, type CartItem, type CheckoutDetails } from './shared'
import { Chip, ChipRow } from '../../components/filters'
import { depotsServingZip, type DepotInRange } from '../../lib/geo'
import { QuoteDialog } from './QuoteDialog'
import { ContainerCard } from './ContainerCard'
import { DetailModal } from './DetailModal'
import { CartModal } from './CartModal'
import { OrderBuildModal } from './OrderBuildModal'
import { CustomerMessageModal } from './CustomerMessageModal'
import { BulkForm } from './BulkForm'
import { CustomerProfileModal, type ProfileTab } from './CustomerProfileModal'
import { InsightsPanel } from './Insights'

// ── Demo photo fallback ────────────────────────────────────
// Only three units have real photo documentation so far. Until the rest
// are photographed, undocumented units borrow one of those three 8-shot
// sets. The files are bundled with the web app (public/demo-photos/), so
// this works against any API — including Railway, which has no photo
// files. DELETE this block and public/demo-photos/ once every unit has
// real photos.
const DEMO_PHOTO_SETS: string[][] = [
  ['CDI-20-0001-01-mre9t7ba.jpg', 'CDI-20-0001-02-mre9tgux.jpg', 'CDI-20-0001-03-mre9tsy3.jpg', 'CDI-20-0001-04-mre9u4if.jpg', 'CDI-20-0001-05-mre9ufqk.jpg', 'CDI-20-0001-06-mre9use7.jpg', 'CDI-20-0001-07-mre9uz12.jpg', 'CDI-20-0001-08-mre9v20t.jpg'],
  ['CDI-20-0002-01-mreab491.webp', 'CDI-20-0002-02-mreabfpg.webp', 'CDI-20-0002-03-mreac2cs.webp', 'CDI-20-0002-04-mreacgx1.webp', 'CDI-20-0002-05-mreacwmb.webp', 'CDI-20-0002-06-mreadfgd.jpg', 'CDI-20-0002-07-mreadsvk.webp', 'CDI-20-0002-08-mreae0mq.webp'],
  ['CDI-20-0003-01-mreakeao.webp', 'CDI-20-0003-02-mreakqe7.webp', 'CDI-20-0003-03-mreal5nc.webp', 'CDI-20-0003-04-mrealkqy.webp', 'CDI-20-0003-05-mrealvat.webp', 'CDI-20-0003-06-mreamd6n.jpg', 'CDI-20-0003-07-mreamnrk.webp', 'CDI-20-0003-08-mreamwv9.webp'],
].map(set => set.map(f =>
  // Absolute URLs pass through photoUrl() untouched; API-relative paths don't.
  new URL(`${import.meta.env.BASE_URL}demo-photos/${f}`, window.location.origin).href
))

// Color variety for the demo grid: a URL fragment tags each borrowed set
// with a tint. Browsers drop the fragment when fetching (same cached file),
// but CSS matches it — img[src*="#tint-red"] etc. in tokens.css recolors
// every rendering of the photo (card, gallery, cart) with no extra markup.
const DEMO_TINTS = ['', '#tint-red', '#tint-white']

function withDemoPhotos(c: Container): Container {
  if (c.photos?.filter(Boolean).length) return c
  // Deterministic picks so a unit keeps the same look across reloads.
  const h = [...c.id].reduce((n, ch) => n + ch.charCodeAt(0), 0)
  const set = DEMO_PHOTO_SETS[h % DEMO_PHOTO_SETS.length]
  const tint = DEMO_TINTS[Math.floor(h / 7) % DEMO_TINTS.length]
  return { ...c, photos: set.map(p => p + tint) }
}

// ── Main Marketplace Page ──────────────────────────────────

export default function MarketplacePage() {
  // Deep-link entry from the landing page's shop-by cards:
  // /shop?tab=rent&size=20ft-std,20ft-hc&grade=A,B&cond=used&zip=70112
  const qp = (k: string) => new URLSearchParams(window.location.search).get(k)
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const t = qp('tab')
    return t === 'rent' || t === 'custom' || t === 'bulk' || t === 'insights' ? t : 'buy'
  })
  const ALL_SIZES = SIZE_OPTIONS.map(([v]) => v)
  // Used-only launch: the marketplace sells pre-owned stock for now, so the
  // condition gate is pinned to 'used' and the New/All controls are hidden.
  // The plumbing for 'new'/'all' stays for when factory stock returns.
  const [condFilter, setCondFilter] = useState<'all' | ContainerCondition>('used')
  // Select-pill semantics (matches the supplier/shipper rails): an EMPTY
  // selection means "everything" — chips only narrow.
  const [sizeFilters, setSizeFilters] = useState<Set<ContainerSize>>(() => {
    const wanted = (qp('size') ?? '').split(',').filter(s => (ALL_SIZES as string[]).includes(s)) as ContainerSize[]
    return new Set(wanted)
  })
  const [gradeFilters, setGradeFilters] = useState<Set<ContainerGrade>>(() => {
    const all: ContainerGrade[] = ['A', 'B', 'C', 'R', 'D']
    const wanted = (qp('grade') ?? '').split(',').filter(g => (all as string[]).includes(g)) as ContainerGrade[]
    return new Set(wanted)
  })
  // null = no color restriction (all colors checked)
  const [colorSel, setColorSel] = useState<Set<string> | null>(null)
  // Delivery-area filter — the customer tells us WHERE they need the
  // container. A ZIP is geo-fenced against every depot's service circle
  // (yard ZIP + the radius the global admin granted it); only inventory
  // from depots whose circle covers the customer is shown. No ZIP = every area.
  // The shopper's delivery ZIP survives across pages and visits: URL param
  // first (hero deep-links), then the remembered ZIP (hero check, a past
  // checkout, or the profile's default delivery ZIP).
  const [areaZip, setAreaZip] = useState(() => {
    const remembered = (() => { try { return localStorage.getItem('sbx_zip') || '' } catch { return '' } })()
    return ((qp('zip') ?? remembered) || '').replace(/\D/g, '').slice(0, 5)
  })
  // First-visit nudge: no ZIP from anywhere → ask once per browser session.
  const [zipAskOpen, setZipAskOpen] = useState(false)
  const [zipAskInput, setZipAskInput] = useState('')
  const [geoHits, setGeoHits] = useState<DepotInRange[] | null>(null)   // depots covering the ZIP
  const [geoMiss, setGeoMiss] = useState(false)                          // 5-digit ZIP, nobody covers it
  const [depotList, setDepotList] = useState<Depot[]>([])
  useEffect(() => { depotsApi.list().then(setDepotList).catch(() => {}) }, [])
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [sort, setSort] = useState<SortKey>('price-asc')
  const [selectedContainer, setSelectedContainer] = useState<Container | null>(null)
  const [quoteOpen, setQuoteOpen] = useState(false)
  const [quotePurpose, setQuotePurpose] = useState<'quote' | 'contact' | 'rental'>('quote')
  const [cart, setCart] = useState<CartItem[]>([])
  const [cartOpen, setCartOpen] = useState(false)
  // Saved units (device-local) + the Favorites-only view toggle.
  const { favs, toggleFav } = useFavorites()
  const [favOnly, setFavOnly] = useState(false)
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
  // ── Portals behind the single marketplace login ───────────
  // Role grants (users.roles) decide which portal tabs this account gets:
  // supplier → My Containers + Damage Claims, shipper → Claims Review.
  // 'shop' is the regular marketplace; its state is kept (display:none)
  // while another portal is open so filters/cart survive the switch.
  const [portal, setPortal] = useState<'shop' | 'fleet' | 'supplier' | 'shipper'>('shop')
  // Signing out (or losing the grant) drops any open portal back to the shop.
  useEffect(() => {
    if (portal === 'shop') return
    const needed = portal === 'shipper' ? 'shipper' : 'supplier'
    if (!hasGrant(user, needed)) setPortal('shop')
  }, [user, portal])
  // Signing in from the profile sheet closes it and lands on the marketplace
  // (with any granted portal tabs now visible) instead of showing the
  // account menu.
  const prevUserRef = useRef(user)
  useEffect(() => {
    const signedIn = !prevUserRef.current && !!user
    prevUserRef.current = user
    if (signedIn && profileOpen) {
      setProfileOpen(false)
      const portals = ['supplier', 'shipper'].filter(g => hasGrant(user, g as 'supplier' | 'shipper'))
      toast(`Signed in as ${user!.name || user!.email}${portals.length ? ' — your portal tabs are below the menu' : ''}`)
    }
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps
  const customerEmail = user?.email.toLowerCase() ?? ''

  // Custom Builds catalog (admin-managed) + the order-a-build dialog.
  const [builds, setBuilds] = useState<CustomBuild[]>([])
  // Multi-tenant: seller directory (logos, contact, service agreements) —
  // containers carry sellerId/sellerName; this map fills in the rest.
  const [sellerList, setSellerList] = useState<Seller[]>([])
  useEffect(() => { sellersApi.list().then(setSellerList).catch(() => {}) }, [])
  const sellerById = new Map(sellerList.map(s => [s.id, s]))
  // SteelBox Co. meet points — price cross-territory relays at checkout.
  const [meetPointList, setMeetPointList] = useState<MeetPoint[]>([])
  useEffect(() => { meetPointsApi.list().then(setMeetPointList).catch(() => {}) }, [])

  // Territory verdict for a unit + delivery ZIP: whose turf is the ZIP, and
  // if it isn't the unit's seller's, quote the two-leg relay via the best
  // SteelBox Co. meet point.
  const relayInfo = useCallback((c: Container, zip: string): { owner: Seller | null; cross: boolean; quote: RelayQuote | null } | null => {
    if (!/^\d{5}$/.test(zip)) return null
    const owner = sellerForZip(zip, sellerList)
    const sellingId = c.sellerId || 'sel_mvp'
    if (!owner || owner.id === sellingId) return { owner, cross: false, quote: null }
    const depot = depotList.find(d => d.name === c.depotLocation)
    const quote = depot?.zip ? relayQuote(depot.zip, zip, meetPointList) : null
    return { owner, cross: true, quote }
  }, [sellerList, depotList, meetPointList])
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
  // Grade X (custom-build conversions) is off the storefront for launch,
  // matching the used-only lineup — the units stay in admin inventory.
  const listable = allContainers.map(withDemoPhotos).filter(
    c => (c.status === 'available' || c.status === 'sale_in_progress' || (isAdmin && c.status === 'draft')) && c.grade !== 'X'
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
  // Geo-fence the ZIP as soon as 5 digits are typed: which depots' service
  // circles cover this customer?
  useEffect(() => {
    if (areaZip.length === 5) {
      const hits = depotsServingZip(areaZip, depotList)
      setGeoHits(hits && hits.length > 0 ? hits : null)
      setGeoMiss(!hits || hits.length === 0)
      // Remember it — the next visit (and the landing page) starts here.
      try { localStorage.setItem('sbx_zip', areaZip) } catch { /* private mode */ }
    } else {
      setGeoHits(null)
      setGeoMiss(false)
    }
  }, [areaZip, depotList])

  // Ask for the ZIP up front when the shopper arrived without one — once per
  // browser session, dismissible with "Skip for now".
  useEffect(() => {
    let prompted = false
    try { prompted = sessionStorage.getItem('sbx_zip_prompted') === '1' } catch { /* private mode */ }
    if (!areaZip && !prompted) setZipAskOpen(true)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const closeZipAsk = (zip?: string) => {
    setZipAskOpen(false)
    try { sessionStorage.setItem('sbx_zip_prompted', '1') } catch { /* private mode */ }
    if (zip && zip.length === 5) setAreaZip(zip)
  }
  // Who services the customer — resellers owning the in-range yards.
  const geoDepotNames = geoHits ? new Set(geoHits.map(h => h.depot.name)) : null
  const areaSellers = [...new Set(
    (geoHits ? geoHits.map(h => h.depot) : [])
      .map(d => sellerById.get(d.sellerId || '')?.name).filter(Boolean)
  )] as string[]

  const priceOf = (c: Container) => activeTab === 'rent' ? (c.rentMonthly ?? c.buyPrice) : c.buyPrice
  const filtered = tabListable.filter(c => {
    if (favOnly && !favs.has(c.id)) return false
    if (condFilter !== 'all' && condOf(c) !== condFilter) return false
    if (geoDepotNames && !geoDepotNames.has(c.depotLocation)) return false
    if (sizeFilters.size > 0 && !sizeFilters.has(c.size)) return false
    if (condFilter === 'used' && gradeFilters.size > 0 && !gradeFilters.has(c.grade)) return false
    if (condFilter === 'new' && colorSel && colorSel.size > 0 && !colorSel.has(c.color || 'Unspecified')) return false
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
    // Pill semantics: null/empty = every color; chips only narrow.
    setColorSel(prev => {
      const next = new Set(prev ?? [])
      next.has(col) ? next.delete(col) : next.add(col)
      return next.size ? next : null
    })
  }

  // Depots with browsable stock in the current tab/condition scope, grouped by
  // the market they serve ("Atlanta, GA" → its two yards). Unknown/legacy
  // depotLocation strings fall under "Other locations".

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
      // Cross-territory: snapshot the relay quote (meet point + fee split)
      // on the order so dispatch and payouts see the same numbers the
      // buyer approved at checkout.
      const relay = relayInfo(i.container, details.zip.trim())
      const relayFields = relay?.cross && relay.quote ? {
        crossTerritory: true,
        sellerToId: relay.owner?.id || '', sellerToName: relay.owner?.name || '',
        meetPointId: relay.quote.meetPoint.id, meetPointName: relay.quote.meetPoint.name,
        relayFee: relay.quote.fee, relayLinehaul: relay.quote.linehaulShare,
        relayLastMile: relay.quote.lastMileShare, relayPlatform: relay.quote.platformShare,
        relayLinehaulMiles: relay.quote.linehaulMiles, relayLastMiles: relay.quote.lastMiles,
      } : {}
      await orders.create({
        ...relayFields,
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
    // The checkout ZIP becomes the shopper's remembered delivery ZIP.
    if (details.zip.length === 5) { setAreaZip(details.zip); try { localStorage.setItem('sbx_zip', details.zip) } catch { /* private mode */ } }
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
        // Reseller positioning: a delivery ZIP inside a reseller's territory
        // rebrands the nav to that reseller ("powered by Nationwide
        // SteelBox"); outside every territory the platform brand shows.
        brand={areaZip.length === 5 ? sellerForZip(areaZip, sellerList) ?? undefined : undefined}
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

      {/* ── Portal strip — one sign-in, every granted portal as a tab.
             Light-blue band so it reads as its own layer, not part of the
             page; text-only labels per the 2D-simple iconography rule. ── */}
      {(hasGrant(user, 'supplier') || hasGrant(user, 'shipper')) && (
        <div style={{ background: 'var(--primary-cont, #E3F0FF)', borderBottom: '2px solid var(--primary)', padding: '0 16px', display: 'flex', gap: '6px', overflowX: 'auto', position: 'sticky', top: 0, zIndex: 40 }}>
          {([
            { key: 'shop' as const, label: 'Marketplace', show: true },
            { key: 'fleet' as const, label: 'My Containers', show: hasGrant(user, 'supplier') },
            { key: 'supplier' as const, label: 'Damage Claims', show: hasGrant(user, 'supplier') },
            { key: 'shipper' as const, label: 'Claims Review', show: hasGrant(user, 'shipper') },
          ]).filter(t => t.show).map(t => (
            <button key={t.key} onClick={() => setPortal(t.key)} style={{
              padding: '11px 18px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 700, fontFamily: 'inherit',
              whiteSpace: 'nowrap', borderRadius: '10px 10px 0 0', marginTop: '6px',
              background: portal === t.key ? 'var(--surf-w)' : 'transparent',
              color: portal === t.key ? 'var(--primary)' : '#3D5A80',
              boxShadow: portal === t.key ? '0 -1px 4px rgba(0,40,90,.10)' : 'none',
            }}>{t.label}</button>
          ))}
        </div>
      )}

      {/* ── Supplier / shipper portals — embedded, same session ── */}
      {portal === 'fleet' && user && (
        <main style={{ maxWidth: '1080px', margin: '0 auto', padding: '22px 16px 80px' }}>
          <SupplierFleet user={user} onToast={toast} />
        </main>
      )}
      {portal === 'supplier' && <SupplierPortalPage embedded />}
      {portal === 'shipper' && <ShipperReviewPage embedded />}

      {/* ── The shop itself — kept mounted (hidden) while a portal is open,
             so filters, scroll and cart state survive tab switches ── */}
      <div style={{ display: portal === 'shop' ? undefined : 'none' }}>

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
              <button onClick={() => { setCondFilter('used'); setSizeFilters(new Set()); setGradeFilters(new Set()); setColorSel(null); setAreaZip(''); setGeoHits(null); setGeoMiss(false) }} style={{ background: 'none', border: 'none', fontSize: '11px', fontWeight: 600, color: 'var(--primary)', cursor: 'pointer' }}>Reset</button>
            </div>

            {/* Zip Destination — first and loudest: the delivery ZIP drives
                which reseller serves the shopper (nav branding), which yards'
                inventory shows, and the all-in delivered price. */}
            <div style={{ marginBottom: '12px', padding: '10px 10px 11px', borderRadius: 'var(--r8)', background: 'var(--primary-cont, #E3F0FF)', border: '1.5px solid var(--primary)', boxSizing: 'border-box' }}>
              <span style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--primary-dark, var(--primary))', display: 'block', marginBottom: '6px', whiteSpace: 'nowrap' }}>Zip Destination</span>
              <input
                value={areaZip}
                inputMode="numeric"
                maxLength={5}
                placeholder="Delivery ZIP"
                onChange={e => setAreaZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
                style={{ width: '100%', padding: '9px 11px', border: `1.5px solid ${geoHits ? 'var(--primary)' : 'var(--div)'}`, borderRadius: 'var(--r8)', fontSize: '14px', fontFamily: 'var(--mono)', letterSpacing: '2px', fontWeight: 700, outline: 'none', boxSizing: 'border-box', background: 'var(--surf-w)' }}
              />
              {geoHits && (
                <div style={{ fontSize: '11px', color: 'var(--green)', fontWeight: 600, marginTop: '6px', lineHeight: 1.5 }}>
                  ✓ Serviced by {areaSellers.join(' & ')}
                  {geoHits.map(h => (
                    <div key={h.depot.id} style={{ color: 'var(--ink3)', fontWeight: 400 }}>
                      {h.depot.name} · {h.miles} mi away
                    </div>
                  ))}
                </div>
              )}
              {geoMiss && (
                <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '6px', lineHeight: 1.45 }}>
                  Not covered yet — showing nationwide. Call us for a quote.
                </div>
              )}
              {/* Or skip the ZIP entirely: nationwide is the active state
                  whenever no ZIP is set; clicking it also forgets a
                  remembered ZIP so the choice sticks. */}
              <button
                onClick={() => {
                  setAreaZip(''); setGeoHits(null); setGeoMiss(false)
                  try { localStorage.removeItem('sbx_zip'); sessionStorage.setItem('sbx_zip_prompted', '1') } catch { /* private mode */ }
                }}
                style={{ display: 'flex', width: '100%', justifyContent: 'center', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', boxSizing: 'border-box', marginTop: '8px', padding: '7px 12px', borderRadius: 'var(--pill)', border: `1.5px solid ${!areaZip ? 'var(--primary)' : 'var(--div)'}`, background: !areaZip ? 'var(--primary)' : 'var(--surf-w)', color: !areaZip ? '#fff' : 'var(--ink2)', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" /></svg>
                Nationwide Search
              </button>
            </div>

            {/* Sort — next, per merchandising: order matters before narrowing */}
            <div style={{ marginBottom: '10px' }}>
              <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', display: 'block', marginBottom: '5px' }}>Sort By</span>
              <select value={sort} onChange={e => setSort(e.target.value as SortKey)} style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--r8)', border: '1.5px solid var(--div)', background: 'var(--surf-w)', fontSize: '12px', cursor: 'pointer', outline: 'none', fontFamily: 'var(--sans)' }}>
                <option value="price-asc">Price: Low → High</option>
                <option value="price-desc">Price: High → Low</option>
                <option value="condition">Best Condition First</option>
                <option value="newest">Newest Listed</option>
              </select>
            </div>

            {/* Sub-filters appear once the shopper has decided New vs Used */}
            {condFilter !== 'all' && (
              <>
                <hr style={{ border: 'none', borderTop: '1px solid var(--div)', margin: '8px 0' }} />

                {/* Size filters — select pills; none selected = every size */}
                <div style={{ marginBottom: '10px' }}>
                  <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', display: 'block', marginBottom: '6px' }}>Size</span>
                  <ChipRow>
                    {SIZE_OPTIONS.filter(([val]) => countBySize(val) > 0).map(([val, label]) => (
                      <Chip key={val} on={sizeFilters.has(val)} onClick={() => toggleSize(val)}>
                        {label} <span style={{ fontWeight: 400, opacity: 0.7 }}>{countBySize(val)}</span>
                      </Chip>
                    ))}
                  </ChipRow>
                </div>

                {/* Used stock varies by inspected grade; new stock is all one-trip */}
                {condFilter === 'used' && (
                  <>
                    <hr style={{ border: 'none', borderTop: '1px solid var(--div)', margin: '8px 0' }} />
                    <div style={{ marginBottom: '10px' }}>
                      <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', display: 'block', marginBottom: '6px' }}>Condition Grade</span>
                      <ChipRow>
                        {(['A','B','C','R','D'] as ContainerGrade[]).map(g => (
                          <Chip key={g} on={gradeFilters.has(g)} onClick={() => toggleGrade(g)}>
                            <span style={{ display: 'inline-block', width: '14px', height: '14px', lineHeight: '14px', textAlign: 'center', borderRadius: '3px', fontSize: '9px', background: GRADE_META[g].color, color: '#fff', marginRight: '5px', verticalAlign: '-2px' }}>{g}</span>
                            {GRADE_META[g].label}
                          </Chip>
                        ))}
                      </ChipRow>
                      <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '6px', lineHeight: 1.45 }}>
                        Grades are assigned by our AI/ML imaging models from each unit's 8-photo field inspection.
                      </div>
                    </div>
                  </>
                )}

                {/* New stock comes in factory colors */}
                {condFilter === 'new' && colorOptions.length > 0 && (
                  <>
                    <hr style={{ border: 'none', borderTop: '1px solid var(--div)', margin: '8px 0' }} />
                    <div style={{ marginBottom: '10px' }}>
                      <span style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--ink3)', display: 'block', marginBottom: '6px' }}>Color</span>
                      <ChipRow>
                        {colorOptions.map(col => (
                          <Chip key={col} on={!!colorSel?.has(col)} onClick={() => toggleColor(col)}>
                            {col} <span style={{ fontWeight: 400, opacity: 0.7 }}>{tabListable.filter(c => condOf(c) === 'new' && (c.color || 'Unspecified') === col).length}</span>
                          </Chip>
                        ))}
                      </ChipRow>
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

            {/* Footnote — industry term the grade filter leans on */}
            <div style={{ marginTop: '14px', paddingTop: '10px', borderTop: '1px solid var(--div)', fontSize: '10.5px', color: 'var(--ink3)', lineHeight: 1.55 }}>
              <strong style={{ color: 'var(--ink2)' }}>New / One-Trip</strong> — a brand-new container built overseas that has made a single cargo voyage from its factory country to the U.S. This is the industry's "new": it arrives essentially new inside and out.
            </div>
          </aside>

          {/* Grid area */}
          <div style={{ flex: 1, padding: '18px 18px 60px', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '14px', fontWeight: 700 }}>{filtered.length} containers</span>
              {/* Favorites view — hearts saved on this device */}
              <button onClick={() => setFavOnly(o => !o)}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: 'var(--pill)', border: `1.5px solid ${favOnly ? '#E0245E' : 'var(--div)'}`, background: favOnly ? '#FDE8EF' : 'var(--surf-w)', color: favOnly ? '#E0245E' : 'var(--ink2)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill={favs.size ? '#E0245E' : 'none'} stroke="#E0245E" strokeWidth="2.2" strokeLinejoin="round"><path d="M12 20.6S3.5 15.4 3.5 9.9c0-2.9 2.2-4.9 4.6-4.9 1.6 0 3 .8 3.9 2.1.9-1.3 2.3-2.1 3.9-2.1 2.4 0 4.6 2 4.6 4.9 0 5.5-8.5 10.7-8.5 10.7z" /></svg>
                Favorites{favs.size > 0 ? ` (${favs.size})` : ''}
              </button>
              <span style={{ fontSize: '13px', color: 'var(--ink3)' }}>· Gulf Coast region</span>
              <span
                title="Units marked with the AI badge had their condition grade scored by machine-learning imaging models from the 8-photo field inspection, then verified by our inspectors."
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 10px', borderRadius: 'var(--pill)', background: 'var(--primary-cont)', color: 'var(--primary-dark)', fontSize: '11px', fontWeight: 700, cursor: 'help' }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l1.9 5.8L20 9.7l-5 4 1.6 6.3L12 16.6 7.4 20l1.6-6.3-5-4 6.1-1.9z" /></svg>
                AI Graded Inventory
              </span>
            </div>

            {loading ? (
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(auto-fill, minmax(220px, 1fr))' : 'repeat(4,1fr)', gap: '10px' }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} style={{ background: 'var(--surf-w)', borderRadius: 'var(--r16)', border: '1px solid var(--div)', height: '260px', animation: 'pulse 1.5s ease infinite' }} />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--ink3)' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>{favOnly ? '🤍' : '📦'}</div>
                <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>{favOnly ? 'No favorites yet' : 'No containers match your filters'}</div>
                <div style={{ fontSize: '13px' }}>{favOnly ? 'Tap the heart on any container to save it here.' : 'Try adjusting grade or price filters, or call us directly.'}</div>
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
                        <ContainerCard key={c.id} container={c} onSelect={setSelectedContainer} mode={activeTab === 'rent' ? 'rent' : 'buy'} inCart={inCart(c.id)} onAddToCart={addToCart} seller={sellerById.get(c.sellerId)} fav={favs.has(c.id)} onToggleFav={u => toggleFav(u.id)} />
                      ))}
                    </div>
                  </div>
                )
              })
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px' }}>
                {filtered.map(c => (
                  <ContainerCard key={c.id} container={c} onSelect={setSelectedContainer} mode={activeTab === 'rent' ? 'rent' : 'buy'} inCart={inCart(c.id)} onAddToCart={addToCart} seller={sellerById.get(c.sellerId)} fav={favs.has(c.id)} onToggleFav={u => toggleFav(u.id)} />
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
              <div key={cb.id} style={{ background: 'var(--surf-w)', borderRadius: 'var(--r16)', border: '1px solid var(--div)', boxShadow: '0 5px 18px rgba(26,28,46,.10), 0 1px 3px rgba(26,28,46,.06)', overflow: 'hidden', transition: 'transform 0.2s, box-shadow 0.2s' }}
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

      {/* ── Insights panel — review queue + role-aware analytics ── */}
      {activeTab === 'insights' && (
        <InsightsPanel user={user} containers={allContainers} />
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

      </div>{/* end shop-content wrapper */}

      {/* ── First-visit ZIP prompt — sets branding + service-area filter ── */}
      <Modal open={zipAskOpen} onClose={() => closeZipAsk()} maxWidth={400}>
        <h2 style={{ fontSize: '19px', fontWeight: 700, marginBottom: '6px' }}>Where's your container headed?</h2>
        <p style={{ fontSize: '13px', color: 'var(--ink3)', lineHeight: 1.55, marginBottom: '14px' }}>
          What ZIP code would you like your container shipped to? We'll show the reseller
          serving your area, their local inventory, and all-in delivered pricing.
        </p>
        <form onSubmit={e => { e.preventDefault(); if (zipAskInput.length === 5) closeZipAsk(zipAskInput) }}>
          <input
            autoFocus inputMode="numeric" maxLength={5} placeholder="Delivery ZIP"
            value={zipAskInput}
            onChange={e => setZipAskInput(e.target.value.replace(/\D/g, '').slice(0, 5))}
            style={{ width: '100%', padding: '12px 14px', border: '1.5px solid var(--div)', borderRadius: 'var(--r8)', fontSize: '16px', fontFamily: 'var(--mono)', letterSpacing: '2px', outline: 'none', boxSizing: 'border-box', marginBottom: '12px' }}
          />
          <button type="submit" disabled={zipAskInput.length !== 5}
            style={{ width: '100%', padding: '12px', borderRadius: 'var(--pill)', border: 'none', background: zipAskInput.length === 5 ? 'var(--primary)' : 'var(--div)', color: zipAskInput.length === 5 ? '#fff' : 'var(--ink3)', fontSize: '14px', fontWeight: 700, cursor: zipAskInput.length === 5 ? 'pointer' : 'default' }}>
            Show containers for my area
          </button>
        </form>
        <button onClick={() => closeZipAsk()} style={{ width: '100%', marginTop: '8px', padding: '10px', borderRadius: 'var(--pill)', border: 'none', background: 'transparent', color: 'var(--ink3)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
          Skip for now
        </button>
      </Modal>

      {/* ── Container detail modal ── */}
      <DetailModal
        relayInfo={relayInfo}
        container={selectedContainer}
        onClose={() => setSelectedContainer(null)}
        onAddToCart={addToCart}
        mode={activeTab === 'rent' ? 'rent' : 'buy'}
        seller={selectedContainer ? sellerById.get(selectedContainer.sellerId) : undefined}
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
        relayInfo={relayInfo}
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
        onSaved={() => {
          setAccountOpen(false); setProfileOpen(true)
          // Apply a just-saved default delivery ZIP to the live view.
          try { const z = localStorage.getItem('sbx_zip') || ''; if (z.length === 5 && z !== areaZip) setAreaZip(z) } catch { /* private mode */ }
        }}
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

// ============================================================
// Claim workspace — its own full page, at /claim?id=…
//
// A claim is read, priced and sent; that is a desk job, not a
// side panel. It opens in a new tab with the whole window to work
// in, so the evidence can actually be looked at.
//
// Reachable by anyone allowed to work the claim: the supplier who
// owns it, an inspector carrying the claims grant, or an admin.
// ============================================================

import React, { useEffect, useState } from 'react'
import { useAuth } from '../../hooks'
import { useSnackbar } from '../../hooks'
import { Snackbar } from '../../components/ui'
import { claims as claimsApi, containers as containersApi, type DamageClaim, type Container } from '../../lib/api'
import { ClaimWorkspace } from '../field/ClaimWorkspace'

const INK = '#0D0E12', INK2 = '#44474F', INK3 = '#6B7280'

export default function ClaimPage() {
  const { user } = useAuth()
  const { toast, message, open: snackOpen, close: snackClose } = useSnackbar()
  const [claim, setClaim] = useState<DamageClaim | null>(null)
  const [unit, setUnit] = useState<Container | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'denied'>('loading')

  const id = new URLSearchParams(window.location.search).get('id') || ''

  useEffect(() => {
    if (!id) { setState('missing'); return }
    claimsApi.list()
      .then(all => {
        const found = all.find(c => c.id === id || c.claimNumber === id)
        if (!found) { setState('missing'); return }
        setClaim(found)
        setState('ready')
        // The unit carries the walk-around findings and its documentation set.
        containersApi.list()
          .then(cs => setUnit(cs.find(c => c.id === found.containerId || c.sku === found.containerSku) ?? null))
          .catch(() => {})
      })
      .catch(() => setState('denied'))
  }, [id])

  const shell = (children: React.ReactNode) => (
    <div style={{ minHeight: '100vh', background: '#F4F6FA', fontFamily: 'var(--sans)' }}>
      <div style={{ background: '#fff', borderBottom: '1px solid #E2E4E9', padding: '13px 20px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '15px', fontWeight: 800, color: INK }}>National <span style={{ color: '#E65100' }}>SteelBox</span></span>
        <span style={{ fontSize: '12px', color: INK3 }}>Damage claim workspace</span>
        {user && <span style={{ marginLeft: 'auto', fontSize: '12px', color: INK2 }}>{user.name}</span>}
      </div>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>{children}</div>
      <Snackbar message={message} open={snackOpen} onClose={snackClose} />
    </div>
  )

  const note = (title: string, detail: string) => shell(
    <div style={{ padding: '60px 20px', textAlign: 'center' }}>
      <div style={{ fontSize: '17px', fontWeight: 700, color: INK }}>{title}</div>
      <div style={{ fontSize: '13px', color: INK2, marginTop: '5px' }}>{detail}</div>
    </div>
  )

  if (state === 'loading') return note('Opening the claim…', 'One moment.')
  if (state === 'missing') return note('Claim not found', 'It may have been closed, or the link is wrong.')
  if (state === 'denied' || !claim) return note('No access to this claim', 'Sign in with an account that can work damage claims.')

  return shell(
    <ClaimWorkspace
      claim={claim}
      unit={unit}
      onClaim={setClaim}
      // Its own tab — closing it is the way back to wherever it was opened from.
      onClose={() => window.close()}
      toast={toast}
    />
  )
}

'use client'

import { useEffect, useState } from 'react'
import { useApp } from '@/lib/store'
import { apiPatch, apiPost } from '@/lib/api'
import { toast } from '@/hooks/use-toast'
import { isValidSAMobile, WHATSAPP_BANNER, DISCLAIMER_PRICES } from '@/lib/format'
import { TEST_LINK } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { LogOut, MessageCircle, ShieldCheck, QrCode, Info } from 'lucide-react'

export function ProfileView() {
  const user = useApp((s) => s.user)
  const setUser = useApp((s) => s.setUser)
  const logoutLocal = useApp((s) => s.logoutLocal)
  const [whatsapp, setWhatsapp] = useState(user?.whatsappNumber ?? '')
  const [optIn, setOptIn] = useState(user?.whatsappOptIn ?? false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setWhatsapp(user?.whatsappNumber ?? '')
    setOptIn(user?.whatsappOptIn ?? false)
  }, [user])

  const saveWhatsApp = async () => {
    setSaving(true)
    try {
      const data = await apiPatch<{ user: import('@/lib/store').SessionUser }>('/api/profile', {
        whatsappNumber: whatsapp.trim(),
        whatsappOptIn: whatsapp.trim() ? optIn : false,
      })
      setUser(data.user)
      toast({
        title: 'WhatsApp number saved ✅',
        description: 'You are ready for wish list alerts (in-app now, WhatsApp in a future update).',
      })
    } catch (e) {
      toast({ title: 'Could not save', description: (e as Error).message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const toggleOptIn = async (checked: boolean) => {
    setOptIn(checked)
    try {
      const data = await apiPatch<{ user: import('@/lib/store').SessionUser }>('/api/profile', { whatsappOptIn: checked })
      setUser(data.user)
    } catch {
      setOptIn(!checked)
    }
  }

  const signOut = async () => {
    // Sign out of Firebase Authentication too (if the user signed in with Google)
    try {
      const { getFirebaseAuth, signOut } = await import('@/firebase')
      await signOut(getFirebaseAuth())
    } catch {
      /* not signed in with Firebase — ignore */
    }
    await apiPost('/api/auth/session').catch(() => {})
    logoutLocal()
  }

  if (!user) return null

  return (
    <div className="px-4 pt-4 max-w-xl mx-auto pb-4">
      {/* Account card */}
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4 flex items-center gap-3.5">
        {user.image ? (
          <img src={user.image} alt={`${user.name} profile`} className="h-14 w-14 rounded-full border-2 border-sky-200" />
        ) : (
          <span className="h-14 w-14 rounded-full bg-blue-600 text-white flex items-center justify-center text-xl font-extrabold">
            {user.name.slice(0, 1)}
          </span>
        )}
        <div className="min-w-0">
          <p className="font-extrabold text-zinc-900 truncate">{user.name}</p>
          <p className="text-xs text-zinc-400 truncate">{user.email}</p>
          {user.isDemo && (
            <span className="inline-block mt-1 bg-sky-100 text-sky-700 text-[9px] font-bold rounded-full px-2 py-0.5">
              DEMO ACCOUNT — sample data
            </span>
          )}
        </div>
      </div>

      {/* WhatsApp preferences */}
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4 mt-3">
        <h2 className="font-bold text-sm text-zinc-900 flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-blue-600" /> WhatsApp Alerts
        </h2>
        <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">{WHATSAPP_BANNER}</p>
        <div className="mt-3 space-y-3">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wide text-zinc-400" htmlFor="whatsapp">
              WhatsApp number (SA mobile)
            </label>
            <Input
              id="whatsapp"
              type="tel"
              inputMode="tel"
              placeholder="082 123 4567"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              className="h-11 mt-1"
            />
            {whatsapp.trim() && !isValidSAMobile(whatsapp) && (
              <p className="text-[11px] text-red-500 mt-1">
                Enter a valid SA number: 06/07/08 followed by 8 digits, or +27 format.
              </p>
            )}
          </div>
          <div className="flex items-center justify-between rounded-xl bg-zinc-50 px-3 py-2.5">
            <div>
              <p className="text-sm font-semibold text-zinc-700">Opt in to WhatsApp alerts</p>
              <p className="text-[11px] text-zinc-400">Only used for wish list price-drop alerts.</p>
            </div>
            <Switch checked={optIn} onCheckedChange={toggleOptIn} disabled={!user.whatsappNumber} aria-label="WhatsApp opt-in" />
          </div>
          <Button
            onClick={saveWhatsApp}
            disabled={saving || Boolean(whatsapp.trim() && !isValidSAMobile(whatsapp))}
            className="w-full h-11 bg-blue-600 hover:bg-blue-700 font-semibold"
          >
            {saving ? 'Saving…' : 'Save WhatsApp preferences'}
          </Button>
          <p className="text-[10px] text-zinc-400 leading-relaxed">
            This version only collects and stores your number and opt-in choice — no WhatsApp messages
            are sent yet. In-app price-drop notifications are active now.
          </p>
        </div>
      </div>

      {/* Test link + QR info */}
      <div className="bg-white rounded-2xl border border-zinc-100 shadow-sm p-4 mt-3">
        <h2 className="font-bold text-sm text-zinc-900 flex items-center gap-2">
          <QrCode className="h-4 w-4 text-blue-600" /> Share the app
        </h2>
        <p className="text-xs text-zinc-500 mt-1.5 leading-relaxed">
          Test link: <span className="font-semibold text-zinc-700">{TEST_LINK}</span>
        </p>
        <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
          Scan the QR code provided with the app package, or open this link on your phone. Install it
          from your browser menu (“Add to Home Screen”) for a full-screen app experience.
        </p>
      </div>

      {/* Admin */}
      {user.role === 'admin' && (
        <button
          onClick={() => {
            window.location.hash = '#/admin'
            useApp.setState({ isAdminArea: true })
          }}
          className="w-full mt-3 bg-zinc-800 text-white rounded-2xl p-4 text-left flex items-center justify-between active:scale-[0.98] transition"
        >
          <span>
            <span className="block font-bold text-sm">Admin Dashboard</span>
            <span className="block text-xs text-zinc-400 mt-0.5">Users, promotions, uploads & analytics</span>
          </span>
          <ShieldCheck className="h-5 w-5" />
        </button>
      )}

      {/* Disclaimers */}
      <div className="bg-zinc-100 rounded-2xl p-4 mt-3">
        <h2 className="font-bold text-sm text-zinc-700 flex items-center gap-2">
          <Info className="h-4 w-4" /> Good to know
        </h2>
        <p className="text-[11px] text-zinc-500 mt-1.5 leading-relaxed">{DISCLAIMER_PRICES}</p>
        <p className="text-[11px] text-zinc-500 mt-1.5 leading-relaxed">
          Prices shown are estimates for planning your budget. The app is not yet connected to live
          retailer feeds — promotions are uploaded by the Grocery Hauls team.
        </p>
      </div>

      <Button
        variant="outline"
        onClick={signOut}
        className="w-full mt-3 h-12 border-red-200 text-red-600 hover:bg-red-50 font-semibold"
      >
        <LogOut className="h-4 w-4 mr-2" /> Sign out
      </Button>

      {/* App branding */}
      <div className="flex flex-col items-center mt-6 mb-2">
        <img
          src="/brand/logo-lockup.png"
          alt="GroceryHaulz-Pro za"
          className="w-36 opacity-95"
        />
        <p className="text-[10px] text-zinc-400 mt-2 font-medium">
          Super Intelligence Budget Shopping · v1.0
        </p>
      </div>
    </div>
  )
}

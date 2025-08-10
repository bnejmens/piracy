// src/components/MagicFX.js
'use client'

export default function MagicFX({ strength = 'fx-soft' }) {
  return (
    <div className={`fx-layer ${strength}`} aria-hidden>
      {/* Empilement de calques discrets */}
      <div className="fx-layer magic-wisps-blue" />
      <div className="fx-layer magic-wisps-gold" />
      <div className="fx-layer magic-sparks-blue" />
      <div className="fx-layer magic-sparks-gold" />
    </div>
  )
}

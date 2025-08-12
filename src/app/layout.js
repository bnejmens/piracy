// src/app/layout.js
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"

import AudioProvider from "@/components/audio/AudioProvider"
import SoundTrigger from "@/components/audio/SoundTrigger"
import SoundModal from "@/components/audio/SoundModal"
import FXGate from "@/components/FXGate" // FX visibles uniquement sur /auth et /dashboard

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] })

export const metadata = {
  title: "Apasonia",
  description: "Institut — RPG narratif",
}

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-950 text-slate-100 selection:bg-cyan-300/30`}>
        {/* Calque FX en fond (client only via FXGate) */}
        <FXGate />

        {/* Contenu au-dessus des FX */}
        <div className="relative z-10">
          <AudioProvider>
            {children}
            <SoundTrigger />
            <SoundModal />
          </AudioProvider>
        </div>
      </body>
    </html>
  )
}

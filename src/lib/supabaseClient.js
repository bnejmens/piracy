// src/lib/supabaseClient.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true, // Session conservée entre les visites (localStorage)
    autoRefreshToken: true, // Renouvellement automatique des jetons
    detectSessionInUrl: true, // Liens de confirmation / récupération de compte
  },
})

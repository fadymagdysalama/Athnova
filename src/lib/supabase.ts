import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Get the anon key from: https://supabase.com/dashboard → Project Settings → API
const SUPABASE_URL = 'https://pmfieyesclymxcvhulor.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtZmlleWVzY2x5bXhjdmh1bG9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4ODIxNzgsImV4cCI6MjA5MDQ1ODE3OH0.wo4pMp3W4fyPUHGTFo-8oXh-b8-GkIHCKdyv02tHDyA';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

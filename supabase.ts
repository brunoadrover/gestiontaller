import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kwbagwbgafuanoaslzxw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3YmFnd2JnYWZ1YW5vYXNsenh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyMjQwOTAsImV4cCI6MjA4NTgwMDA5MH0.99mDLhQHHXDyfYTeBb2W9qkriaPWeco0bgOJwnf--6s';

export const supabase = createClient(supabaseUrl, supabaseKey);

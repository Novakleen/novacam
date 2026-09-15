import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://ghgfeiwbjjfxozqyjyfb.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdoZ2ZlaXdiampmeG96cXlqeWZiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3NDI0ODYsImV4cCI6MjA4MzMxODQ4Nn0.UsnOxu_O0v1u7E-h-Np_OeZplF6OSTECfXAKw4fCJCI';

const customSupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

export default customSupabaseClient;

export { 
    customSupabaseClient,
    customSupabaseClient as supabase,
};

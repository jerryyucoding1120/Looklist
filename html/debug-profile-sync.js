// Profile Update Verification Script
// Run this in the browser console to check if profiles are syncing

import { sb } from './supabase-client.js';

async function checkProfileSync() {
    console.log('=== Profile Sync Verification ===');

    // Get current user
    const { data: { user }, error: authError } = await sb.auth.getUser();
    if (authError || !user) {
        console.error('Not authenticated:', authError);
        return;
    }

    console.log('Current User ID:', user.id);
    console.log('User Metadata:', user.user_metadata);

    // Check profiles table
    const { data: profile, error: profileError } = await sb
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

    if (profileError) {
        console.error('Error fetching profile:', profileError);
        console.error('Error details:', {
            message: profileError.message,
            details: profileError.details,
            hint: profileError.hint,
            code: profileError.code
        });
    } else {
        console.log('Profile Table Data:', profile);
    }

    // Compare
    console.log('\n=== Comparison ===');
    console.log('Auth full_name:', user.user_metadata?.full_name);
    console.log('Profile full_name:', profile?.full_name);
    console.log('Match:', user.user_metadata?.full_name === profile?.full_name);

    return { user, profile };
}

// Export for console use
window.checkProfileSync = checkProfileSync;

console.log('Profile sync checker loaded. Run: checkProfileSync()');

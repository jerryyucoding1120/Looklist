/**
 * Navigation Helper Module
 * Manages role-based navigation visibility, particularly for merchant-specific features
 */

import { sb } from './supabase-client.js';

/**
 * Get the current user's role from their session
 * @returns {Promise<string|null>} The user's role ('merchant', 'client', etc.) or null if not authenticated
 */
export async function getUserRole() {
    try {
        const { data: { session }, error } = await sb.auth.getSession();

        if (error || !session) {
            return null;
        }

        const user = session.user;

        // Check multiple sources for role, with fallback to 'client'
        const role = user.user_metadata?.role ||
            user.app_metadata?.role ||
            'client';

        return role;
    } catch (error) {
        console.error('[NavHelper] Error getting user role:', error);
        return null;
    }
}

/**
 * Setup merchant-specific navigation items
 * Shows/hides navigation items based on user role
 */
export async function setupMerchantNav() {
    const role = await getUserRole();
    const isMerchant = role === 'merchant';

    // Find all merchant-only navigation items
    const merchantNavItems = document.querySelectorAll('.merchant-only');

    merchantNavItems.forEach(item => {
        if (isMerchant) {
            item.style.display = '';
        } else {
            item.style.display = 'none';
        }
    });

    console.log(`[NavHelper] Merchant navigation ${isMerchant ? 'shown' : 'hidden'} for role: ${role}`);
}

/**
 * Initialize navigation based on auth state
 * Call this after authentication is complete
 */
export async function initNavigation() {
    await setupMerchantNav();

    // Listen for auth state changes and update navigation
    sb.auth.onAuthStateChange(async (event, session) => {
        console.log(`[NavHelper] Auth state changed: ${event}`);
        await setupMerchantNav();
    });
}

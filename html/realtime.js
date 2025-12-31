/**
 * LookList Realtime Utilities
 * Phase 3 Dev C - Realtime subscriptions for merchant dashboards
 */

import spLocal from './supabase-client.js';

/**
 * Active realtime channels registry
 * Allows cleanup on navigation/logout
 */
const activeChannels = new Set();

/**
 * Subscribe to merchant dashboard realtime updates
 * Receives listing and availability changes for the authenticated merchant
 * 
 * @param {string} merchantId - The merchant's UUID
 * @param {Object} handlers - Event handlers
 * @param {Function} handlers.onListingChange - Called with (eventType, listing, oldListing)
 * @param {Function} handlers.onAvailabilityChange - Called with (eventType, availability, oldAvailability)
 * @param {Function} [handlers.onError] - Called on subscription errors
 * @returns {Function} Cleanup function to unsubscribe
 */
export function subscribeMerchantDashboard(merchantId, handlers) {
  if (!merchantId) {
    console.error('[realtime] subscribeMerchantDashboard: merchantId is required');
    return () => {};
  }

  const { onListingChange, onAvailabilityChange, onError } = handlers;

  const channelName = `merchant:${merchantId}:dashboard`;
  console.log(`[realtime] Subscribing to ${channelName}`);

  const channel = spLocal
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'listings',
        filter: `merchant_id=eq.${merchantId}`,
      },
      (payload) => {
        console.log('[realtime] Listing change:', payload);
        const { eventType, new: newRecord, old: oldRecord } = payload;
        
        if (onListingChange) {
          try {
            onListingChange(eventType, newRecord, oldRecord);
          } catch (err) {
            console.error('[realtime] Error in onListingChange handler:', err);
            if (onError) onError(err);
          }
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'availability',
        filter: `merchant_id=eq.${merchantId}`,
      },
      (payload) => {
        console.log('[realtime] Availability change:', payload);
        const { eventType, new: newRecord, old: oldRecord } = payload;
        
        if (onAvailabilityChange) {
          try {
            onAvailabilityChange(eventType, newRecord, oldRecord);
          } catch (err) {
            console.error('[realtime] Error in onAvailabilityChange handler:', err);
            if (onError) onError(err);
          }
        }
      }
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log(`[realtime] Successfully subscribed to ${channelName}`);
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        console.warn(`[realtime] Channel ${channelName} status: ${status}`, err);
        if (onError) onError(err || new Error(`Channel status: ${status}`));
      }
    });

  activeChannels.add(channel);

  // Return cleanup function
  return () => {
    console.log(`[realtime] Unsubscribing from ${channelName}`);
    spLocal.removeChannel(channel);
    activeChannels.delete(channel);
  };
}

/**
 * Subscribe to availability updates for a specific listing (public view)
 * Only receives updates for published listings
 * 
 * @param {string} listingId - The listing UUID
 * @param {Function} onAvailabilityChange - Called with (eventType, availability, oldAvailability)
 * @param {Function} [onError] - Called on errors
 * @returns {Function} Cleanup function to unsubscribe
 */
export function subscribeListingAvailability(listingId, onAvailabilityChange, onError) {
  if (!listingId) {
    console.error('[realtime] subscribeListingAvailability: listingId is required');
    return () => {};
  }

  const channelName = `listing:${listingId}:availability`;
  console.log(`[realtime] Subscribing to ${channelName}`);

  const channel = spLocal
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'availability',
        filter: `listing_id=eq.${listingId}`,
      },
      (payload) => {
        console.log('[realtime] Public availability change:', payload);
        const { eventType, new: newRecord, old: oldRecord } = payload;
        
        try {
          onAvailabilityChange(eventType, newRecord, oldRecord);
        } catch (err) {
          console.error('[realtime] Error in onAvailabilityChange handler:', err);
          if (onError) onError(err);
        }
      }
    )
    .subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        console.log(`[realtime] Successfully subscribed to ${channelName}`);
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        console.warn(`[realtime] Channel ${channelName} status: ${status}`, err);
        if (onError) onError(err || new Error(`Channel status: ${status}`));
      }
    });

  activeChannels.add(channel);

  return () => {
    console.log(`[realtime] Unsubscribing from ${channelName}`);
    spLocal.removeChannel(channel);
    activeChannels.delete(channel);
  };
}

/**
 * Cleanup all active realtime subscriptions
 * Call this on logout or page unload
 */
export function cleanupAllSubscriptions() {
  console.log(`[realtime] Cleaning up ${activeChannels.size} active channels`);
  activeChannels.forEach(channel => {
    spLocal.removeChannel(channel);
  });
  activeChannels.clear();
}

/**
 * Monitor connection state and trigger reconnect/refetch logic
 * 
 * @param {Function} onReconnect - Called when connection is re-established
 * @returns {Function} Cleanup function
 */
export function monitorConnection(onReconnect) {
  let wasConnected = true;

  const interval = setInterval(() => {
    // Supabase realtime connection state check
    const isConnected = spLocal.realtime?.isConnected?.() ?? true;
    
    if (!wasConnected && isConnected) {
      console.log('[realtime] Connection re-established, triggering refetch');
      if (onReconnect) {
        try {
          onReconnect();
        } catch (err) {
          console.error('[realtime] Error in onReconnect handler:', err);
        }
      }
    }
    
    wasConnected = isConnected;
  }, 3000); // Check every 3 seconds

  return () => clearInterval(interval);
}

/**
 * Deduplicate events by tracking processed event IDs
 * Useful to prevent duplicate UI updates
 */
class EventDeduplicator {
  constructor(maxSize = 100) {
    this.seen = new Set();
    this.maxSize = maxSize;
  }

  /**
   * Check if we've already processed this event
   * @param {string} eventId - Unique event identifier
   * @returns {boolean} true if this is a duplicate
   */
  isDuplicate(eventId) {
    if (this.seen.has(eventId)) {
      return true;
    }
    
    this.seen.add(eventId);
    
    // Prevent memory leak by limiting size
    if (this.seen.size > this.maxSize) {
      const first = this.seen.values().next().value;
      this.seen.delete(first);
    }
    
    return false;
  }

  clear() {
    this.seen.clear();
  }
}

export const eventDeduplicator = new EventDeduplicator();

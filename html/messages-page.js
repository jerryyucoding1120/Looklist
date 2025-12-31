import { authInit, signOut } from './auth.js';
import { sp, getProfilesMany } from './api.js';

(async function () {
    const { user } = await authInit({ requireAuth: true });
    toggleHeaderLinks(user);

    // If auth failed, authInit handles redirect if requireAuth is true.

    // If auth failed, authInit handles redirect if requireAuth is true.
    // However, sp() might need clients ready, which authInit ensures.

    const FUNCTION_BASE = "https://rgzdgeczrncuxfkyuxf.supabase.co/functions/v1";

    const listEl = document.querySelector('.thread-list');
    const noteEl = document.querySelector('.content > .note');
    if (noteEl) noteEl.style.display = 'none';

    if (!listEl) return;

    function el(html) {
        const t = document.createElement('template');
        t.innerHTML = html.trim();
        return t.content.firstElementChild;
    }

    function timeAgo(d) {
        const now = new Date();
        const diff = (now - new Date(d)) / 1000;
        if (diff < 60) return 'just now';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        return new Date(d).toLocaleDateString();
    }

    async function fetchThreads() {
        const client = await sp();
        const q1 = client
            .from('threads')
            .select('*')
            .or(`customer_id.eq.${user.id},merchant_id.eq.${user.id}`)
            .order('created_at', { ascending: false });

        const { data: threads, error } = await q1;
        if (error) throw error;
        return threads || [];
    }

    async function fetchLatestMessage(thread_id) {
        const client = await sp();
        const { data, error } = await client
            .from('messages')
            .select('*')
            .eq('thread_id', thread_id)
            .order('created_at', { ascending: false })
            .limit(1);
        if (error) throw error;
        return (data && data[0]) || null;
    }

    async function fetchBooking(booking_id) {
        if (!booking_id) return null;
        const client = await sp();
        const { data, error } = await client
            .from('bookings')
            .select('*')
            .eq('id', booking_id)
            .single();
        if (error) return null;
        return data;
    }

    async function respondBooking(booking_id, action) {
        const client = await sp();
        const { data: { session } } = await client.auth.getSession();
        const token = session?.access_token;

        const res = await fetch(`${FUNCTION_BASE}/respond-booking`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'authorization': `Bearer ${token || ''}` },
            body: JSON.stringify({ booking_id, action, actor_id: user.id })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed');
        return data;
    }

    async function completeBooking(booking_id) {
        const client = await sp();
        const { data: { session } } = await client.auth.getSession();
        const token = session?.access_token;

        const res = await fetch(`${FUNCTION_BASE}/complete-booking`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'authorization': `Bearer ${token || ''}` },
            body: JSON.stringify({ booking_id, actor_id: user.id })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed');
        return data;
    }

    async function render() {
        listEl.innerHTML = '<div class="note">Loading conversations...</div>';

        try {
            const threads = await fetchThreads();
            if (!threads.length) {
                listEl.innerHTML = '<div class="note">No conversations yet.</div>';
                return;
            }

            // Collect all other user IDs to fetch profiles in batch
            const otherUserIds = threads.map(t => {
                return user.id === t.customer_id ? t.merchant_id : t.customer_id;
            }).filter(Boolean);

            // Fetch all profiles at once for better performance
            // Always fetch fresh data from database (no caching)
            const profiles = otherUserIds.length ? await getProfilesMany(otherUserIds) : [];
            const profileById = new Map(profiles.map(p => [p.id, p]));

            // For the current user, always use the latest data from auth
            // This ensures their own name is always up-to-date even if profiles table is stale
            if (user.user_metadata?.full_name) {
                profileById.set(user.id, {
                    id: user.id,
                    full_name: user.user_metadata.full_name,
                    phone: user.user_metadata.phone,
                    bio: user.user_metadata.bio
                });
            }

            listEl.innerHTML = '';
            for (const t of threads) {
                const latest = await fetchLatestMessage(t.id);
                const booking = latest?.booking_id ? await fetchBooking(latest.booking_id) : null;
                const otherId = user.id === t.customer_id ? t.merchant_id : t.customer_id;

                const summary = latest?.content || latest?.body || '—'; // Handle content or body
                const when = latest?.created_at || t.created_at;

                // Build the link to the MESSAGE THREAD page
                const threadUrl = `message-thread.html?id=${t.id}`;

                // Get user name from profiles, fallback to 'User'
                const profile = profileById.get(otherId);
                const displayName = profile?.full_name || profile?.name || 'User';

                // Note: We use a div with onclick instead of an anchor to allow nested buttons
                const node = el(`
                    <div class="thread" role="button" tabindex="0" style="cursor: pointer;">
                        <img class="avatar" src="assets/profile.png" alt="" aria-hidden="true"/>
                        <div>
                            <div class="thread-title">${displayName}</div>
                            <p class="thread-snippet">${summary}</p>
                        </div>
                        <div class="thread-meta">${timeAgo(when)}</div>
                    </div>
                `);

                // Add click handler for navigation
                node.onclick = (e) => {
                    // Don't navigate if clicking on something interactive inside
                    if (e.target.closest('button') || e.target.closest('a')) return;
                    window.location.href = threadUrl;
                };


                // Add booking actions if pending
                if (booking && booking.status === 'pending') {
                    const actions = document.createElement('div');
                    actions.style.marginLeft = 'auto';
                    actions.style.display = 'flex';
                    actions.style.gap = '8px';
                    // Prevent clicking the row link when clicking buttons
                    actions.onclick = (e) => e.preventDefault();

                    if (user.id === booking.merchant_id) {
                        const accept = el('<button class="home-link">Accept</button>');
                        const decline = el('<button class="home-link">Decline</button>');
                        accept.onclick = async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            accept.disabled = decline.disabled = true;
                            try { await respondBooking(booking.id, 'accept'); await render(); }
                            catch (err) { alert(err.message); accept.disabled = decline.disabled = false; }
                        };
                        decline.onclick = async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            accept.disabled = decline.disabled = true;
                            try { await respondBooking(booking.id, 'decline'); await render(); }
                            catch (err) { alert(err.message); accept.disabled = decline.disabled = false; }
                        };
                        actions.appendChild(accept);
                        actions.appendChild(decline);
                    } else if (user.id === booking.customer_id) {
                        const cancel = el('<button class="home-link">Cancel</button>');
                        cancel.onclick = async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            cancel.disabled = true;
                            try { await respondBooking(booking.id, 'cancel'); await render(); }
                            catch (err) { alert(err.message); cancel.disabled = false; }
                        };
                        actions.appendChild(cancel);
                    }
                    node.appendChild(actions);
                } else if (booking && booking.status === 'confirmed' && user.id === booking.customer_id) {
                    const start = new Date(booking.start_time);
                    if (Date.now() >= +start) {
                        const done = el('<button class="home-link">Mark complete</button>');
                        done.onclick = async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            done.disabled = true;
                            try { await completeBooking(booking.id); await render(); }
                            catch (err) { alert(err.message); done.disabled = false; }
                        };
                        // Prevent clicking row
                        done.style.marginLeft = "auto";
                        done.onclick = (e) => {
                            e.preventDefault(); e.stopPropagation();
                            // ... logic
                        };
                        // Re-attach logic properly
                        const realDone = el('<button class="home-link" style="margin-left: auto;">Mark complete</button>');
                        realDone.onclick = async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            realDone.disabled = true;
                            try { await completeBooking(booking.id); await render(); }
                            catch (err) { alert(err.message); realDone.disabled = false; }
                        };
                        node.appendChild(realDone);
                    }
                }

                listEl.appendChild(node);
            }
        } catch (err) {
            console.error(err);
            listEl.innerHTML = '<div class="note">Failed to load messages.</div>';
        }
    }

    function toggleHeaderLinks(user) {
        const links = document.querySelectorAll('[data-auth="signin"]');
        if (!links.length) return;

        links.forEach((el) => {
            if (user) {
                el.textContent = 'Sign Out';
                el.onclick = (event) => {
                    event.preventDefault();
                    signOut();
                };
                el.setAttribute('href', '#');
            } else {
                el.textContent = 'Sign in';
                el.onclick = null;
                el.setAttribute('href', 'signin.html');
            }
        });
    }


    render().catch(err => {
        console.error(err);
        listEl.innerHTML = '<div class="note">Failed to load messages.</div>';
    });
})();
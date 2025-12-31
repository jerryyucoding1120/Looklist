import { sp, getProfile } from './api.js';
import { authInit, signOut } from './auth.js';

// 1. Get the Thread ID from the browser URL (?id=...)
const urlParams = new URLSearchParams(window.location.search);
const currentThreadId = urlParams.get('id');

// 2. Main Initialization
document.addEventListener('DOMContentLoaded', async () => {
    // Check Auth using your existing auth system
    const { user } = await authInit({ requireAuth: true });
    toggleHeaderLinks(user);

    if (!user) {
        window.location.href = 'signin.html';
        return;
    }

    if (!currentThreadId) {
        console.error("No thread ID found in URL");
        return;
    }

    // Initial Load
    await loadThreadHeader(user.id);
    await loadMessages(user.id);

    // Start Realtime Subscription
    subscribeToMessages(user.id);

    // Cleanup on page unload (best effort)
    window.addEventListener('beforeunload', () => {
        if (messageSubscription) {
            messageSubscription.unsubscribe();
        }
    });
});

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


// 3. Thread Header Logic
async function loadThreadHeader(myId) {
    const client = await sp(); // USE YOUR API CLIENT

    // Fetch the thread
    const { data: thread, error } = await client
        .from('threads')
        .select('*')
        .eq('id', currentThreadId)
        .single();

    if (error || !thread) {
        console.error("Error fetching thread details:", error);
        return;
    }

    // Determine partner (the other person)
    const partnerId = (thread.customer_id === myId) ? thread.merchant_id : thread.customer_id;

    // Fetch partner's profile to get their name
    let partnerName = 'User';
    try {
        const partnerProfile = await getProfile(partnerId);
        partnerName = partnerProfile?.full_name || partnerProfile?.name || 'User';
    } catch (err) {
        console.log('Could not fetch partner profile, using default name');
    }

    // If the partner is actually the current user (edge case), use auth data
    const authClient = await sp();
    const { data: { user: currentUser } } = await authClient.auth.getUser();
    if (currentUser && partnerId === currentUser.id && currentUser.user_metadata?.full_name) {
        partnerName = currentUser.user_metadata.full_name;
    }

    // Update UI
    const nameEl = document.getElementById('chat-partner-name');
    const serviceEl = document.getElementById('ctx-service-name');
    const avatarEl = document.getElementById('partner-avatar');
    const detailsLink = document.getElementById('ctx-details-link');

    if (nameEl) nameEl.innerText = partnerName;
    if (serviceEl) serviceEl.innerText = thread.service_name || "Service";
    // Avatar will use default since we don't have avatar_url

    // Link "Details" button to the service listing
    if (detailsLink) {
        let listingId = null;

        // Priority 1: Check if thread has listing_id (from "Message Merchant")
        if (thread.listing_id) {
            listingId = thread.listing_id;
        }
        // Priority 2: Check if thread has booking, fetch listing from booking
        else if (thread.booking_id) {
            try {
                const { data: booking, error } = await client
                    .from('bookings')
                    .select('listing_id')
                    .eq('id', thread.booking_id)
                    .single();

                if (!error && booking?.listing_id) {
                    listingId = booking.listing_id;
                }
            } catch (err) {
                console.error('Error fetching booking:', err);
            }
        }

        // Set the link if we found a listing
        if (listingId) {
            detailsLink.href = `listing.html?id=${listingId}`;
            detailsLink.textContent = 'View Service';
            console.log('Details button set to:', detailsLink.href);
        } else {
            // No listing found - link to services page
            detailsLink.href = `services.html`;
            detailsLink.textContent = 'Browse Services';
            console.log('Details button set to services page');
        }
    }
}

// 4. Sending Logic
const chatForm = document.getElementById('chat-form');
if (chatForm) {
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('message-input');
        const content = input.value.trim();

        if (!content) return;

        // Disable button while processing
        const btn = document.getElementById('send-btn');
        if (btn) btn.disabled = true;

        const { user } = await authInit(); // Get user again
        const client = await sp(); // Get API client

        const messageData = {
            thread_id: currentThreadId,
            sender_id: user.id,
            body: content
        };

        const { data, error } = await client
            .from('messages')
            .insert([messageData])
            .select()
            .single();

        if (error) {
            console.error("Send error:", error.message);
            alert("Message failed to send.");
        } else {
            input.value = '';

            // Optimistic UI update - show message immediately
            if (data) {
                appendMessage(data, user.id);

                // Auto-scroll to bottom
                const list = document.getElementById('message-list');
                if (list) {
                    list.scrollTop = list.scrollHeight;
                }
            }
        }

        if (btn) btn.disabled = false;
    });
}

// 5. Load Messages Logic
async function loadMessages(myId) {
    const client = await sp();

    const { data: messages, error } = await client
        .from('messages')
        .select('*')
        .eq('thread_id', currentThreadId)
        .order('created_at', { ascending: true });

    if (error) return;

    const list = document.getElementById('message-list');
    if (!list) return;

    // Clear list to ensure source of truth
    list.innerHTML = '';

    messages.forEach(msg => {
        appendMessage(msg, myId);
    });

    // Auto-scroll to bottom on initial load
    list.scrollTop = list.scrollHeight;
}

// 6. Realtime Subscription Logic
let messageSubscription = null;

async function subscribeToMessages(myId) {
    if (messageSubscription) return; // Prevent duplicates

    const client = await sp();

    messageSubscription = client
        .channel(`thread:${currentThreadId}`)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `thread_id=eq.${currentThreadId}`
            },
            (payload) => {
                const newMsg = payload.new;
                // Append message instantly
                appendMessage(newMsg, myId);

                // Auto-scroll if close to bottom
                const list = document.getElementById('message-list');
                if (list) {
                    list.scrollTop = list.scrollHeight;
                }
            }
        )
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'messages',
                filter: `thread_id=eq.${currentThreadId}`
            },
            (payload) => {
                console.log('Received UPDATE event:', payload);
                const updatedMsg = payload.new;
                console.log('Updated message:', updatedMsg);
                console.log('Is deleted?', updatedMsg.deleted || updatedMsg.body === '[DELETED]');

                // Update existing message (for deletions)
                const existingMsgEl = document.querySelector(`[data-msg-id="${updatedMsg.id}"]`);
                console.log('Found message element:', existingMsgEl);

                if (existingMsgEl && (updatedMsg.deleted || updatedMsg.body === '[DELETED]')) {
                    console.log('Updating message to show as deleted');
                    existingMsgEl.innerHTML = '<em style="color: #999; font-style: italic;">This message was deleted</em>';
                    existingMsgEl.classList.add('msg-deleted');
                    existingMsgEl.classList.remove('selected');
                }
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('Realtime connected for thread:', currentThreadId);
            }
        });

    // Polling fallback: Check for deleted messages every 2 seconds
    setInterval(async () => {
        try {
            const client = await sp();
            const { data: messages, error } = await client
                .from('messages')
                .select('id, body')
                .eq('thread_id', currentThreadId);

            if (error) {
                console.error('[Poll] Error fetching messages:', error);
                return;
            }

            if (messages) {
                messages.forEach(msg => {
                    const existingMsgEl = document.querySelector(`[data-msg-id="${msg.id}"]`);
                    if (existingMsgEl && !existingMsgEl.classList.contains('msg-deleted')) {
                        // Check if message was deleted (body is 'DELETED_MESSAGE')
                        if (msg.body === 'DELETED_MESSAGE') {
                            console.log('🗑️ Syncing deleted message:', msg.id);
                            existingMsgEl.innerHTML = '<em style="color: #999; font-style: italic;">This message was deleted</em>';
                            existingMsgEl.classList.add('msg-deleted');
                            existingMsgEl.classList.remove('selected');
                        }
                    }
                });
            }
        } catch (error) {
            console.error('[Poll] Exception:', error);
        }
    }, 2000); // Check every 2 seconds
}

function appendMessage(msg, myId) {
    const list = document.getElementById('message-list');
    if (!list) return;

    // Deduplication check
    const existingMsg = document.querySelector(`[data-msg-id="${msg.id}"]`);
    if (existingMsg) {
        // Update existing message if it was deleted
        if (msg.deleted || msg.body === 'DELETED_MESSAGE') {
            existingMsg.innerHTML = '<em style="color: #999; font-style: italic;">This message was deleted</em>';
            existingMsg.classList.add('msg-deleted');
            existingMsg.classList.remove('selected');
        }
        return;
    }

    const isMe = msg.sender_id === myId;
    let msgClass = isMe ? 'msg-user' : 'msg-provider';

    // Check if message is deleted
    const isDeleted = msg.deleted || msg.body === 'DELETED_MESSAGE';

    let content;
    if (isDeleted) {
        content = '<em style="color: #999; font-style: italic;">This message was deleted</em>';
        msgClass += ' msg-deleted';
    } else {
        content = msg.body || msg.content || '';
    }

    const msgHtml = `
        <div class="message ${msgClass}" data-msg-id="${msg.id}" data-sender-id="${msg.sender_id}">
        ${content}
        </div >
    `;

    list.insertAdjacentHTML('beforeend', msgHtml);
}

// Handle message selection and deletion
document.addEventListener('click', async (e) => {
    const messageEl = e.target.closest('.message');

    console.log('Click detected:', e.target);
    console.log('Message element:', messageEl);

    // If clicking outside messages, deselect all
    if (!messageEl) {
        document.querySelectorAll('.message.selected').forEach(el => {
            el.classList.remove('selected');
            const deleteBtn = el.querySelector('.delete-btn');
            if (deleteBtn) deleteBtn.remove();
        });
        return;
    }

    // Don't allow selection of deleted messages
    if (messageEl.classList.contains('msg-deleted')) return;

    // If clicking delete button, handle deletion
    if (e.target.classList.contains('delete-btn')) {
        e.stopPropagation();
        await handleDeleteMessage(messageEl);
        return;
    }

    // Get current user
    const { user } = await authInit();
    if (!user) return;

    const senderId = messageEl.getAttribute('data-sender-id');
    const isMyMessage = senderId === user.id;

    console.log('Sender ID:', senderId);
    console.log('My ID:', user.id);
    console.log('Is my message:', isMyMessage);

    // Only allow selecting own messages
    if (!isMyMessage) {
        console.log('Not your message, cannot select');
        return;
    }

    // Toggle selection
    const wasSelected = messageEl.classList.contains('selected');

    // Deselect all other messages
    document.querySelectorAll('.message.selected').forEach(el => {
        el.classList.remove('selected');
        const deleteBtn = el.querySelector('.delete-btn');
        if (deleteBtn) deleteBtn.remove();
    });

    if (!wasSelected) {
        // Select this message and add delete button
        messageEl.classList.add('selected');
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn';
        deleteBtn.innerHTML = '🗑️';
        deleteBtn.title = 'Delete message';
        messageEl.appendChild(deleteBtn);
    }
});

async function handleDeleteMessage(messageEl) {
    const msgId = messageEl.getAttribute('data-msg-id');

    if (!confirm('Delete this message?')) return;

    try {
        const client = await sp();

        // Soft delete: update message body to DELETED_MESSAGE
        const { error } = await client
            .from('messages')
            .update({ body: 'DELETED_MESSAGE' })
            .eq('id', msgId);

        if (error) throw error;

        // Update UI immediately
        messageEl.innerHTML = '<em style="color: #999; font-style: italic;">This message was deleted</em>';
        messageEl.classList.add('msg-deleted');
        messageEl.classList.remove('selected');

        // Broadcast deletion to other clients via Supabase Realtime broadcast
        const channel = client.channel(`thread:${currentThreadId} `);
        await channel.send({
            type: 'broadcast',
            event: 'message_deleted',
            payload: { message_id: msgId }
        });

    } catch (error) {
        console.error('Error deleting message:', error);
        alert('Failed to delete message. Please try again.');
    }
}
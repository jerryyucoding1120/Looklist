import { supabase } from './supabase-client.js';

// 1. Get the Thread ID from the browser URL (?id=...)
const urlParams = new URLSearchParams(window.location.search);
const currentThreadId = urlParams.get('id');

// 2. Main Initialization
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
        console.error("Auth error:", authError);
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

    // Refresh messages every 3 seconds for "real-time" feel
    setInterval(() => loadMessages(user.id), 3000);
});

// 3. Thread Header Logic
async function loadThreadHeader(myId) {
    const { data: thread, error } = await supabase
        .from('threads')
        .select(`
            *,
            recipient:profiles!threads_recipient_id_fkey(full_name, avatar_url),
            sender:profiles!threads_sender_id_fkey(full_name, avatar_url)
        `)
        .eq('id', currentThreadId)
        .single();

    if (error || !thread) {
        console.error("Error fetching thread details:", error);
        return;
    }

    // Determine partner
    const partner = (thread.sender_id === myId) ? thread.recipient : thread.sender;

    // Update UI
    const nameEl = document.getElementById('chat-partner-name');
    const serviceEl = document.getElementById('ctx-service-name');
    const avatarEl = document.getElementById('partner-avatar');
    const detailsLink = document.getElementById('ctx-details-link');

    if (nameEl) nameEl.innerText = partner?.full_name || "User";
    if (serviceEl) serviceEl.innerText = thread.service_name || "Service";
    if (avatarEl && partner?.avatar_url) avatarEl.src = partner.avatar_url;

    // Link "Details" button to the booking
    if (detailsLink && thread.booking_id) {
        detailsLink.href = `booking-details.html?id=${thread.booking_id}`;
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
        if(btn) btn.disabled = true;

        const { data: { user } } = await supabase.auth.getUser();

        const { error } = await supabase
            .from('messages')
            .insert([{
                thread_id: currentThreadId,
                sender_id: user.id,
                content: content,
                type: 'user'
            }]);

        if (error) {
            console.error("Send error:", error.message);
            alert("Message failed to send.");
        } else {
            input.value = ''; 
            await loadMessages(user.id);
        }
        
        if(btn) btn.disabled = false;
    });
}

// 5. Load Messages Logic
async function loadMessages(myId) {
    const { data: messages, error } = await supabase
        .from('messages')
        .select('*')
        .eq('thread_id', currentThreadId)
        .order('created_at', { ascending: true });

    if (error) return;

    const list = document.getElementById('message-list');
    if (!list) return;

    list.innerHTML = messages.map(msg => {
        const isMe = msg.sender_id === myId;
        const msgClass = isMe ? 'msg-user' : 'msg-provider';
        
        return `
            <div class="message ${msgClass}">
                ${msg.content}
            </div>
        `;
    }).join('');

    // Auto-scroll to bottom
    list.scrollTop = list.scrollHeight;
}
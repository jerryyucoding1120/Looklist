import { getAuthClients } from './auth.js';

async function clients() {
  return getAuthClients();
}

export async function sp() {
  const { spLocal, spSession } = await clients();
  try {
    const [local, session] = await Promise.all([
      spLocal.auth.getSession(),
      spSession.auth.getSession(),
    ]);
    if (local?.data?.session) return spLocal;
    if (session?.data?.session) return spSession;
    return spLocal;
  } catch {
    return spLocal;
  }
}

export async function getCurrentUser() {
  const client = await sp();
  const { data, error } = await client.auth.getUser();
  if (error) throw new Error(error.message);
  return data.user ?? null;
}

export async function getUID(required = true) {
  const user = await getCurrentUser();
  if (!user && required) throw new Error('Not authenticated');
  return user?.id ?? null;
}

function handle({ data, error }) {
  if (error) throw new Error(error.message || 'Request failed');
  return data;
}

// BOOKINGS
export async function listMyBookings() {
  const client = await sp();
  const uid = await getUID();
  const q = client
    .from('bookings')
    .select('*')
    .or(`customer_id.eq.${uid},merchant_id.eq.${uid}`)
    .order('created_at', { ascending: false });
  return handle(await q);
}

// THREADS
export async function listMyThreads() {
  const client = await sp();
  const uid = await getUID();
  const q = client
    .from('threads')
    .select('*')
    .or(`customer_id.eq.${uid},merchant_id.eq.${uid}`)
    .order('created_at', { ascending: false });
  return handle(await q);
}

// MESSAGES
export async function listThreadMessages(threadId) {
  const client = await sp();
  const q = client
    .from('messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });
  return handle(await q);
}

export async function listLastMessagesForThreads(threadIds) {
  if (!threadIds?.length) return [];
  const client = await sp();
  const q = client
    .from('messages')
    .select('id, thread_id, body, sender_id, created_at')
    .in('thread_id', threadIds)
    .order('created_at', { ascending: false });
  return handle(await q);
}

export async function sendMessage(threadId, body) {
  const client = await sp();
  const uid = await getUID();
  const payload = { thread_id: threadId, sender_id: uid, body };
  const q = client.from('messages').insert(payload).select().single();
  return handle(await q);
}

export async function subscribeToThreadMessages(threadId, onInsert) {
  const { spLocal } = await clients();
  const channel = spLocal.channel(`messages-thread-${threadId}`);
  channel.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'messages', filter: `thread_id=eq.${threadId}` },
    (payload) => onInsert?.(payload.new)
  );
  channel.subscribe();
  return () => spLocal.removeChannel(channel);
}

// PROFILES
export async function getProfile(userId) {
  const client = await sp();
  const q = client.from('profiles').select('*').eq('id', userId).single();
  return handle(await q);
}

export async function getProfilesMany(ids) {
  if (!ids?.length) return [];
  const client = await sp();
  const q = client.from('profiles').select('*').in('id', ids);
  return handle(await q);
}

const api = Object.freeze({
  bookings: { listMyBookings },
  threads: { listMyThreads },
  messages: { listThreadMessages, listLastMessagesForThreads, sendMessage, subscribeToThreadMessages },
  profiles: { getOne: getProfile, getMany: getProfilesMany },
  auth: { sp, getCurrentUser, getUID },
});

window.api = api;

export default api;

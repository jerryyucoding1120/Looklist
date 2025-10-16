import { authInit, signOut } from './auth.js';
import {
  listMyThreads,
  listLastMessagesForThreads,
  getProfilesMany,
} from './api.js';

document.addEventListener('DOMContentLoaded', () => {
  loadMessages().catch((err) => console.error('[Messages] init', err));
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

const formatDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const snippet = (text, max = 90) => {
  if (!text) return '';
  const trimmed = String(text).trim().replace(/\s+/g, ' ');
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}...` : trimmed;
};

export async function loadMessages() {
  const listEl = document.querySelector('.thread-list');
  const noteEl = document.querySelector('.note');
  if (!listEl) return;

  const { user } = await authInit({ requireAuth: true });
  toggleHeaderLinks(user);
  if (!user) {
    if (noteEl) noteEl.textContent = 'Sign in to view and reply to your conversations.';
    return;
  }

  try {
    if (noteEl) noteEl.textContent = 'Loading your conversations...';

    const threads = await listMyThreads();
    const myId = user.id;

    const threadIds = threads.map((t) => t.id);
    const messages = threadIds.length
      ? await listLastMessagesForThreads(threadIds)
      : [];

    const lastByThread = new Map();
    for (const message of messages) {
      if (!lastByThread.has(message.thread_id)) {
        lastByThread.set(message.thread_id, message);
      }
    }

    const otherIds = Array.from(
      new Set(
        threads
          .map((t) => (t.customer_id === myId ? t.merchant_id : t.customer_id))
          .filter(Boolean),
      ),
    );
    const profiles = otherIds.length ? await getProfilesMany(otherIds) : [];
    const profileById = new Map(profiles.map((p) => [p.id, p]));

    listEl.innerHTML = '';
    if (noteEl) noteEl.textContent = '';

    if (!threads.length) {
      const empty = document.createElement('div');
      empty.className = 'note';
      empty.textContent = 'No conversations yet.';
      listEl.appendChild(empty);
      return;
    }

    for (const thread of threads) {
      const last = lastByThread.get(thread.id) || null;
      const otherId = thread.customer_id === myId ? thread.merchant_id : thread.customer_id;
      const other = profileById.get(otherId);
      const displayName =
        other?.full_name ||
        other?.name ||
        other?.username ||
        other?.display_name ||
        'Conversation';

      const anchor = document.createElement('a');
      anchor.href = '#';
      anchor.className = 'thread';
      anchor.setAttribute('role', 'listitem');
      anchor.setAttribute('aria-label', `Chat with ${displayName}`);

      const avatar = document.createElement('img');
      avatar.className = 'avatar';
      avatar.src = 'assets/profile.png';
      avatar.alt = '';
      avatar.setAttribute('aria-hidden', 'true');

      const textWrap = document.createElement('div');
      const title = document.createElement('p');
      title.className = 'thread-title';
      title.textContent = displayName;
      const body = document.createElement('p');
      body.className = 'thread-snippet';
      body.textContent = last ? snippet(last.body) : 'No messages yet.';
      textWrap.appendChild(title);
      textWrap.appendChild(body);

      const meta = document.createElement('div');
      meta.className = 'thread-meta';
      meta.textContent = last ? formatDate(last.created_at) : formatDate(thread.created_at);

      anchor.appendChild(avatar);
      anchor.appendChild(textWrap);
      anchor.appendChild(meta);

      anchor.addEventListener('click', (event) => {
        event.preventDefault();
        alert(`Open thread ${thread.id} (detail view not implemented yet).`);
      });

      listEl.appendChild(anchor);
    }
  } catch (error) {
    console.error('[Messages] load', error);
    if (noteEl) noteEl.textContent = 'Failed to load messages. Please try again.';
  }
}

import { getAuthClients } from './auth.js';

const searchParams = new URLSearchParams(window.location.search);
const listingId = searchParams.get('id');

const infoEl = document.getElementById('listingInfo');
const slotsEl = document.getElementById('slots');
const bookButton = document.getElementById('bookBtn');
const lldInput = document.getElementById('lld');
const lldValue = document.getElementById('lldValue');

const clientsPromise = getAuthClients();
let selectedSlotId = null;

function formatMoney(value) {
  const amount = Number(value);
  if (Number.isNaN(amount)) return 'N/A';
  return `GBP ${amount.toFixed(2)}`;
}

function escapeHTML(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function capitalise(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function renderListing(listing) {
  if (!infoEl) return;
  if (!listing) {
    infoEl.textContent = 'Listing not found.';
    return;
  }
  const rating = listing.rating ?? 'N/A';
  const city = listing.city || '';
  const priceFrom = listing.price_from ?? 'N/A';
  infoEl.innerHTML = `<article class="card">
    <div class="card__top">
      <h3>${escapeHTML(listing.name)}</h3>
      <div>Rating ${rating}</div>
    </div>
    <div class="card__meta">${capitalise(listing.category)} - ${escapeHTML(city)} - from ${formatMoney(priceFrom)}</div>
  </article>`;
}

function renderSlots(slots) {
  if (!slotsEl) return;
  if (!slots || !slots.length) {
    slotsEl.textContent = 'No available times yet.';
    return;
  }
  slotsEl.innerHTML = slots
    .map((slot) => {
      const label = slot.label ? ` - ${escapeHTML(slot.label)}` : '';
      const price = formatMoney(slot.price);
      return `<label class="slot">
        <input type="radio" name="slot" value="${slot.id}" data-price="${slot.price}">
        ${slot.date} ${slot.start_time} - ${slot.end_time} - ${price}${label}
      </label>`;
    })
    .join('');
  slotsEl.addEventListener('change', (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    selectedSlotId = event.target.value;
    if (bookButton) bookButton.disabled = !selectedSlotId;
  });
}

function setupLldField() {
  if (!lldInput || !lldValue) return;
  const update = () => {
    const redeemed = Math.max(0, parseInt(lldInput.value || '0', 10));
    lldValue.textContent = formatMoney(redeemed * 0.01);
  };
  lldInput.addEventListener('input', update);
  update();
}

async function getAuthToken() {
  const { spLocal, spSession } = await clientsPromise;
  const [local, session] = await Promise.all([
    spLocal.auth.getSession(),
    spSession.auth.getSession(),
  ]);
  return local.data.session?.access_token || session.data.session?.access_token || null;
}

async function handleBooking(listing) {
  if (!selectedSlotId) return;
  const token = await getAuthToken();
  if (!token) {
    alert('Please sign in first.');
    window.location.href = `signin.html?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    return;
  }

  const slotInput = document.querySelector('input[name="slot"]:checked');
  const slotPrice = Number(slotInput?.dataset?.price || 0);
  const lldSelected = Math.max(0, parseInt(lldInput?.value || '0', 10));
  const maxRedeemable = Math.min(lldSelected, Math.floor(slotPrice * 100));

  try {
    const response = await fetch('https://enkibawrpiqfnzhtifsf.supabase.co/functions/v1/create-checkout-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        listing_id: listing.id,
        availability_id: selectedSlotId,
        lld_to_redeem: maxRedeemable,
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'Failed to start checkout.');
    if (!body.url) throw new Error('No checkout URL returned.');
    window.location.href = body.url;
  } catch (error) {
    alert(error?.message || 'Unable to start checkout.');
  }
}

async function loadData() {
  if (!listingId) {
    if (infoEl) infoEl.textContent = 'Listing ID missing.';
    if (bookButton) bookButton.disabled = true;
    return;
  }

  const { spLocal } = await clientsPromise;
  const today = new Date().toISOString().slice(0, 10);
  const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  const [listingResult, availabilityResult] = await Promise.all([
    spLocal.from('listings').select('*').eq('id', listingId).single(),
    spLocal
      .from('availability')
      .select('*')
      .eq('listing_id', listingId)
      .gte('date', today)
      .lte('date', in14)
      .order('date'),
  ]);

  if (listingResult.error) {
    if (infoEl) infoEl.textContent = listingResult.error.message;
    return;
  }
  const listing = listingResult.data;
  renderListing(listing);

  if (availabilityResult.error) {
    if (slotsEl) slotsEl.textContent = availabilityResult.error.message;
  } else {
    renderSlots(availabilityResult.data);
  }

  if (bookButton) {
    bookButton.addEventListener('click', () => handleBooking(listing));
    bookButton.disabled = true;
  }
}

async function init() {
  setupLldField();
  await loadData();
}

init().catch((error) => {
  console.error('[Listing] init', error);
  if (infoEl) infoEl.textContent = error?.message || 'Failed to load listing.';
});

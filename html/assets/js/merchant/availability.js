import { sb } from '../supabase-client.js';
import { requireUser, signOut } from './auth.js';

const params = new URLSearchParams(location.search);
const listingId = params.get('listing');

const form = document.getElementById('slot-form');
const list = document.getElementById('slot-list');
const signoutBtn = document.getElementById('signout');

main();

async function main(){
  const user = await requireUser(); if (!user) return;
  if (signoutBtn) signoutBtn.onclick = signOut;
  
  // Early validation: ensure listing parameter is present
  if (!listingId) { 
    document.querySelector('main').innerHTML='<p style="color:#f44336;">Error: Missing ?listing=ID parameter. Please navigate to this page from your listings.</p>'; 
    return; 
  }

  // Validate listing exists and is owned by current user
  const { data: listing, error: listingError } = await sb
    .from('listings')
    .select('id, owner, name')
    .eq('id', listingId)
    .single();

  if (listingError || !listing) {
    document.querySelector('main').innerHTML=`<p style="color:#f44336;">Error: Listing not found or you do not have permission to manage its availability.</p>`;
    console.error('Listing validation error:', listingError);
    return;
  }

  if (listing.owner !== user.id) {
    document.querySelector('main').innerHTML=`<p style="color:#f44336;">Error: You do not own this listing. Only the owner can manage availability.</p>`;
    return;
  }

  // Show listing name for context
  const listingInfo = document.createElement('p');
  listingInfo.style.cssText = 'color: var(--silver); font-weight: 600; margin-bottom: 1rem;';
  listingInfo.textContent = `Managing availability for: ${listing.name}`;
  document.querySelector('main').insertBefore(listingInfo, document.querySelector('main').firstChild.nextSibling);

  await refreshSlots();
  if (form) form.addEventListener('submit', onSubmit);
}

async function onSubmit(e){
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form));
  
  // Validate required fields
  if (!data.date || !data.start_time || !data.end_time || !data.price) {
    alert('Please fill in all required fields: date, start time, end time, and price.');
    return;
  }

  // Validate start time is before end time
  if (data.start_time >= data.end_time) {
    alert('Start time must be before end time.');
    return;
  }

  // Validate price is positive
  const price = Number(data.price);
  if (isNaN(price) || price <= 0) {
    alert('Price must be a positive number.');
    return;
  }

  // Validate capacity is positive integer
  const capacity = Number(data.capacity || 1);
  if (isNaN(capacity) || capacity < 1 || !Number.isInteger(capacity)) {
    alert('Capacity must be a positive integer.');
    return;
  }

  const payload = {
    listing_id: listingId,
    label: data.label || null,
    date: data.date,
    start_time: data.start_time,
    end_time: data.end_time,
    price: price,
    capacity: capacity
  };

  const { error } = await sb.from('availability').insert(payload);
  if (error) { 
    // Show detailed error information for debugging
    let errorMsg = 'Failed to create availability slot:\n\n';
    errorMsg += `Message: ${error.message}\n`;
    if (error.details) errorMsg += `Details: ${error.details}\n`;
    if (error.hint) errorMsg += `Hint: ${error.hint}\n`;
    if (error.code) errorMsg += `Code: ${error.code}\n`;
    
    alert(errorMsg);
    console.error('Availability insert error:', error);
    return; 
  }
  
  form.reset();
  await refreshSlots();
}

async function refreshSlots(){
  if (list) list.innerHTML = 'Loading…';
  const { data, error } = await sb.from('availability').select('*').eq('listing_id', listingId).order('date');
  if (error) { list.textContent = error.message; return; }
  if (!data?.length) { list.textContent = 'No slots yet.'; return; }

  list.innerHTML = data.map(s => `
    <li>
      <div class="row">
        <b>${s.date}</b> ${s.start_time}–${s.end_time}
        <small>£${s.price}</small>
        <small>${escape(s.label||'')}</small>
        <small>Cap ${s.capacity} · Booked ${s.booked_count}</small>
      </div>
      <div class="row">
        <button onclick="del('${s.id}')" class="secondary">Delete</button>
      </div>
    </li>
  `).join('');
}

window.del = async function(id){
  if (!confirm('Delete this slot?')) return;
  const { error } = await sb.from('availability').delete().eq('id', id);
  if (error) { alert(error.message); return; }
  await refreshSlots();
}

function escape(s){ return String(s).replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m])); }
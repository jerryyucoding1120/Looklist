async function cancelBookingViaBackend(bookingId) {
  const { data } = await supabase.auth.getSession();
  const token = data.session.access_token;

  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/cancel-booking/${bookingId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }

  return await res.json();
}

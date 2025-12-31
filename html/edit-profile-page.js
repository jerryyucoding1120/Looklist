import { authInit, signOut } from './auth.js';
import { sb } from './supabase-client.js';

// Show/hide alerts
function showAlert(type, message) {
    const errorAlert = document.getElementById('error-alert');
    const successAlert = document.getElementById('success-alert');

    // Hide both alerts first
    errorAlert.classList.remove('show');
    successAlert.classList.remove('show');

    // Show the appropriate alert
    if (type === 'error') {
        errorAlert.textContent = message;
        errorAlert.classList.add('show');
    } else if (type === 'success') {
        successAlert.textContent = message;
        successAlert.classList.add('show');
    }

    // Scroll to top to show alert
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Validate phone number format (basic validation)
function validatePhone(phone) {
    if (!phone) return true; // Phone is optional
    // Allow various formats: +44 1234567890, (123) 456-7890, etc.
    const phoneRegex = /^[\d\s\-\+\(\)]+$/;
    return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
}

// Load current user data
async function loadUserData(user) {
    const fullNameInput = document.getElementById('full-name');
    const emailInput = document.getElementById('email');
    const phoneInput = document.getElementById('phone');
    const bioInput = document.getElementById('bio');

    // Populate form with current user data
    fullNameInput.value = user.user_metadata?.full_name || user.user_metadata?.name || '';
    emailInput.value = user.email || '';
    phoneInput.value = user.user_metadata?.phone || '';
    bioInput.value = user.user_metadata?.bio || '';
}

// Handle form submission
async function handleSubmit(event) {
    event.preventDefault();

    const saveBtn = document.getElementById('save-btn');
    const form = document.getElementById('edit-profile-form');

    // Get form data
    const formData = new FormData(form);
    const fullName = formData.get('full_name')?.trim();
    const phone = formData.get('phone')?.trim();
    const bio = formData.get('bio')?.trim();

    // Validate required fields
    if (!fullName) {
        showAlert('error', 'Full name is required');
        return;
    }

    // Validate phone if provided
    if (phone && !validatePhone(phone)) {
        showAlert('error', 'Please enter a valid phone number (at least 10 digits)');
        return;
    }

    // Disable button and show loading state
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    try {
        // Update user metadata using Supabase Auth
        const { data, error } = await sb.auth.updateUser({
            data: {
                full_name: fullName,
                phone: phone || null,
                bio: bio || null,
            }
        });

        if (error) throw error;

        // Also update the profiles table so messages show the updated name
        // This ensures consistency between auth.users.user_metadata and public.profiles
        // Note: profiles table has id, full_name, avatar_url, and role columns
        try {
            console.log('Updating profiles table for user:', data.user.id);
            console.log('User metadata:', data.user.user_metadata);
            console.log('App metadata:', data.user.app_metadata);

            // Get the user's role - check multiple sources and ensure it's never null
            const userRole = data.user.user_metadata?.role ||
                data.user.app_metadata?.role ||
                'client'; // Always default to 'client' if no role found

            console.log('Using role:', userRole);

            const { data: profileData, error: profileError } = await sb
                .from('profiles')
                .upsert(
                    {
                        id: data.user.id,
                        full_name: fullName,
                        role: userRole,
                        // Note: phone and bio are only stored in user_metadata, not in profiles table
                    },
                    { onConflict: 'id' }
                )
                .select();

            if (profileError) {
                console.error('Failed to update profiles table:', profileError);
                console.error('Error details:', {
                    message: profileError.message,
                    details: profileError.details,
                    hint: profileError.hint,
                    code: profileError.code
                });
                // Show warning to user but don't block
                showAlert('error', `Profile updated in auth, but failed to sync to database: ${profileError.message}. Your changes may not appear in messages until this is fixed.`);
                // Re-enable button so user can try again
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save Changes';
                return; // Don't redirect
            } else {
                console.log('Successfully updated profiles table:', profileData);
            }
        } catch (profileErr) {
            console.error('Exception updating profiles table:', profileErr);
            showAlert('error', `Profile updated in auth, but failed to sync to database: ${profileErr.message || profileErr}. Your changes may not appear in messages.`);
            // Re-enable button
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Changes';
            return; // Don't redirect
        }

        // Show success message only if both updates succeeded
        showAlert('success', 'Profile updated successfully!');

        // Redirect to profile page after a short delay
        setTimeout(() => {
            window.location.href = 'profile.html';
        }, 1500);

    } catch (error) {
        console.error('Error updating profile:', error);
        showAlert('error', error.message || 'Failed to update profile. Please try again.');

        // Re-enable button
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Changes';
    }
}

// Initialize page
async function init() {
    const box = document.getElementById('secret-box');
    const loader = document.getElementById('loading-screen');

    // Safety timer for mobile
    const safetyTimer = setTimeout(() => {
        if (loader && loader.style.display !== 'none') {
            console.log("Mobile loading stuck. Forcing update...");
            if (loader) loader.style.display = 'none';
            if (box) box.style.display = 'block';
        }
    }, 3500);

    try {
        // Check authentication
        const { user } = await authInit({ requireAuth: true });

        clearTimeout(safetyTimer);

        if (user) {
            // Show content
            if (loader) loader.style.display = 'none';
            if (box) box.style.display = 'block';

            // Load user data into form
            await loadUserData(user);

            // Setup form submission
            const form = document.getElementById('edit-profile-form');
            form.addEventListener('submit', handleSubmit);

            // Setup sign out buttons
            const signInLinks = document.querySelectorAll('[data-auth="signin"]');
            signInLinks.forEach((el) => {
                el.textContent = 'Sign Out';
                el.setAttribute('href', '#');
                el.addEventListener('click', async (e) => {
                    e.preventDefault();
                    await signOut();
                });
            });
        } else {
            window.location.href = 'signin.html';
        }
    } catch (error) {
        console.error('Error initializing page:', error);
        window.location.href = 'signin.html';
    }
}

// Run initialization
init();

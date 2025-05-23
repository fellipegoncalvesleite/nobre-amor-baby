# Codex Handoff: Auth/Email/Checkout Bug Fixes

**Project**: Nobre Amor Baby e Kids (`nobreamor.com`)
**Stack**: React 19 + Vite + Tailwind v4 + Supabase Auth (PKCE) + Vercel
**Date**: 2026-03-29

---

## Status: Code Changes Already Applied

The code fixes listed below have **already been implemented** in the working tree (unstaged). This handoff documents what was changed, why, and what **manual Supabase dashboard actions** remain. Codex should **verify** each code change is correct and **commit** when satisfied.

---

## Issue 1: Email Confirmation Broken After Signup

### Symptom
Users sign up, receive a confirmation email, click the link, but their account stays unconfirmed. The `AuthCallbackPage` never establishes a session. In Supabase DB: `confirmed_at` is NULL for all users; `confirmation_token` is populated but never consumed.

### Root Cause
`src/lib/supabaseClient.js` was configured with `flowType: 'implicit'`. With implicit flow, Supabase puts tokens in the URL **hash fragment** (`#access_token=...`). But `AuthCallbackPage.jsx` reads from **query parameters** (`searchParams.get('code')`), so the token was never extracted. Additionally, Supabase's newer PKCE flow is more secure and is the recommended default.

### Code Fix (ALREADY APPLIED)

**File: `src/lib/supabaseClient.js`**
```diff
 auth: {
   autoRefreshToken: true,
   persistSession: true,
   detectSessionInUrl: true,
-  flowType: 'implicit',
+  flowType: 'pkce',
 },
```

**Why this works**: With PKCE, Supabase redirects with `?code=<auth_code>` as a query parameter. `AuthCallbackPage.jsx` (line 66-73) already calls `supabase.auth.exchangeCodeForSession(code)` when it detects a `code` param. No changes needed to `AuthCallbackPage.jsx`.

### Supabase Dashboard Actions Required (MANUAL)

> These cannot be done in code. A human must log into the Supabase dashboard.

1. **Project Settings > Authentication > URL Configuration**:
   - **Site URL**: must be `https://www.nobreamor.com`
   - **Redirect URLs**: must include ALL of these:
     ```
     https://www.nobreamor.com/auth/callback
     https://nobreamor.com/auth/callback
     https://www.nobreamor.com/redefinir-senha
     https://nobreamor.com/redefinir-senha
     https://nobre-amor-baby-site.vercel.app/auth/callback
     https://nobre-amor-baby-site.vercel.app/redefinir-senha
     ```
   - Add `http://localhost:5173/auth/callback` and `http://localhost:5173/redefinir-senha` for local dev.

2. **Project Settings > Authentication > Email Templates**:
   - **Confirm signup** template must use `{{ .ConfirmationURL }}` (not a hardcoded URL).
   - **Reset password** template must use `{{ .ConfirmationURL }}`.
   - **Magic link** template must use `{{ .ConfirmationURL }}`.
   - Verify templates haven't been customized to point at wrong domains.

3. **Project Settings > Authentication > SMTP (Email Provider)**:
   - Check whether **custom SMTP** is enabled or if using Supabase's built-in mailer.
   - Supabase's built-in mailer has a rate limit of **~4 emails/hour** in free/Pro plans. If the site needs more, configure a custom SMTP provider (e.g., Resend, Postmark, SendGrid).
   - The `.env` file has `RESEND_API_KEY=` (empty). If Resend is the intended SMTP provider, this key needs to be set in both `.env` and Vercel environment variables, and Resend must be configured as the SMTP relay in Supabase dashboard.

---

## Issue 2: Checkout Flow Shows Login Tab Instead of Signup

### Symptom
Unauthenticated users browsing products, adding to cart, and clicking checkout get redirected to `/entrar` (login page). The page defaults to the "Entrar" (login) tab. First-time buyers — who don't have an account — must manually find and click the "Criar conta" (signup) tab. This creates unnecessary friction and drop-off.

### Root Cause
`LoginPage.jsx` hardcoded `useState('login')` as the default tab, regardless of where the user came from.

### Code Fix (ALREADY APPLIED)

**File: `src/pages/LoginPage.jsx`**
```diff
 const from = location.state?.from ?? '/';
+const buyIntent = ['/checkout', '/carrinho'].some((p) => from.startsWith(p));

-const [tab, setTab] = useState('login');
+const [tab, setTab] = useState(buyIntent ? 'signup' : 'login');
```

**How it works**: `ProtectedRoute.jsx` already passes `state.from` with the attempted path when redirecting to `/entrar`. This fix detects when the user came from `/checkout` or `/carrinho` (cart) and defaults to the signup tab, reducing friction for new customers.

### Additional UX Fix (ALREADY APPLIED)

**File: `src/pages/LoginPage.jsx`** — Primary action buttons

The main CTA buttons (login + signup submit) were changed from `bg-baby-accent` (#A49AAE, muted purple) to `bg-baby-text` (#373438, dark charcoal) for better contrast and visual hierarchy.

```diff
-bg-baby-accent text-white ... hover:bg-baby-accent/90
+bg-baby-text text-white ... hover:bg-baby-text/85
```

This applies to both the login submit button and the signup submit button.

---

## Issue 3: Password Reset Email Never Arrives / Reset Flow Broken

### Symptom
Users request a password reset, Supabase API returns 200 (success), `recovery_sent_at` is populated in the DB, but the email never arrives OR the user clicks the link and nothing happens.

### Root Causes (Two)

**A) Email delivery**: Same SMTP issue as Issue 1. If using Supabase's built-in mailer, rate limits may prevent delivery. See Supabase Dashboard Actions in Issue 1.

**B) PKCE flow incompatibility**: After switching to `flowType: 'pkce'`, the reset link from Supabase arrives with `?code=<auth_code>` in the URL. But `ResetPasswordPage.jsx` only listened for `onAuthStateChange('PASSWORD_RECOVERY')` — an event that fires in the **implicit** flow when Supabase detects recovery tokens in the URL hash. With PKCE, the page needs to explicitly exchange the `code` param.

### Code Fix (ALREADY APPLIED)

**File: `src/pages/ResetPasswordPage.jsx`**

Added `useSearchParams` import and a new `useEffect` for PKCE code exchange:

```jsx
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

// ... inside the component:

const [searchParams] = useSearchParams();

// Handle PKCE code exchange from password reset redirect
useEffect(() => {
  const code = searchParams.get('code');
  if (!code) return;
  supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
    if (error) {
      toast.error('Link expirado ou inválido. Solicite um novo.', { style: toastStyle });
    } else {
      setMode('update');
    }
  });
}, [searchParams]);
```

The existing `onAuthStateChange('PASSWORD_RECOVERY')` listener is kept as a fallback for edge cases but is no longer the primary mechanism.

---

## Issue 1b: Return Path Lost When Email Opens in New Tab

### Symptom
User is on `/checkout` > redirected to `/entrar` > signs up > clicks email confirmation link (opens in new tab/browser) > after confirmation, lands on `/` instead of `/checkout`.

### Root Cause
`src/lib/authReturn.js` used `sessionStorage` which is **per-tab**. When the email confirmation link opens in a new tab, `sessionStorage` is empty, so `getReturnPath()` returns `/`.

### Code Fix (ALREADY APPLIED)

**File: `src/lib/authReturn.js`**
```diff
 export function saveReturnPath(path) {
   if (!isValidReturnPath(path)) return;
-  try { sessionStorage.setItem(RETURN_PATH_KEY, path); } catch { /* ok */ }
+  try { localStorage.setItem(RETURN_PATH_KEY, path); } catch { /* ok */ }
 }

 export function getReturnPath() {
   try {
-    const saved = sessionStorage.getItem(RETURN_PATH_KEY);
+    const saved = localStorage.getItem(RETURN_PATH_KEY);
     return isValidReturnPath(saved) ? saved : '/';
   } catch {
     return '/';
   }
 }

 export function clearReturnPath() {
-  try { sessionStorage.removeItem(RETURN_PATH_KEY); } catch { /* ok */ }
+  try { localStorage.removeItem(RETURN_PATH_KEY); } catch { /* ok */ }
 }
```

**Security**: The `isValidReturnPath()` function already validates that paths are internal (starts with `/`, not `//`, no `://`, not in `BLOCKED` list), preventing open redirect attacks. Using `localStorage` is safe here.

---

## Files Changed (Summary)

| File | Change | Status |
|------|--------|--------|
| `src/lib/supabaseClient.js` | `flowType: 'implicit'` → `'pkce'` | Applied |
| `src/lib/authReturn.js` | `sessionStorage` → `localStorage` (3 occurrences) | Applied |
| `src/pages/LoginPage.jsx` | Buy intent detection + default tab + button contrast | Applied |
| `src/pages/ResetPasswordPage.jsx` | Added PKCE `code` exchange `useEffect` | Applied |
| `src/pages/AuthCallbackPage.jsx` | No changes needed (already handles PKCE) | N/A |
| `src/context/AuthContext.jsx` | No changes needed | N/A |
| `src/components/ProtectedRoute.jsx` | No changes needed | N/A |

---

## Validation Checklist

After deploying and configuring Supabase dashboard:

### Email Confirmation
- [ ] Sign up with a new email
- [ ] Confirmation email arrives within 1 minute
- [ ] Click confirmation link — lands on `/auth/callback`
- [ ] `AuthCallbackPage` shows "E-mail confirmado com sucesso!"
- [ ] Redirects to the return path (or `/` if none saved)
- [ ] In Supabase DB: `confirmed_at` is now populated

### Password Reset
- [ ] Go to `/redefinir-senha`, enter email, submit
- [ ] Reset email arrives within 1 minute
- [ ] Click reset link — lands on `/redefinir-senha` with new-password form
- [ ] Enter new password + confirm, submit
- [ ] Toast: "Senha atualizada!"
- [ ] Redirected to `/entrar`
- [ ] Can log in with the new password

### Checkout → Signup Flow
- [ ] As unauthenticated user, add product to cart
- [ ] Navigate to `/checkout` — redirected to `/entrar`
- [ ] Login page defaults to "Criar conta" (signup) tab
- [ ] Complete signup, confirm email
- [ ] After confirmation, redirected back to `/checkout` (not `/`)
- [ ] Cart contents are preserved (uses `localStorage` via zustand)

### Return Path Persistence
- [ ] Navigate to `/produtos/some-product` while logged out
- [ ] Click "Comprar" or navigate to checkout — redirected to `/entrar`
- [ ] Sign up → email opens in a **new tab**
- [ ] After confirmation in new tab, return path is `/checkout` or the original page

### Google OAuth
- [ ] Click "Entrar com Google" on login page
- [ ] Complete Google auth flow
- [ ] Redirected back to `/auth/callback` → success → return path

---

## Fallback Notes

- If Supabase's built-in mailer continues to be unreliable, set up **Resend** as custom SMTP:
  1. Create Resend account, verify `nobreamor.com` domain (add DNS records)
  2. Generate API key, set as `RESEND_API_KEY` in Vercel env vars
  3. In Supabase dashboard: Settings > Auth > SMTP Settings > Enable custom SMTP
  4. SMTP host: `smtp.resend.com`, port: `465`, user: `resend`, password: the API key
- The `onAuthStateChange('PASSWORD_RECOVERY')` listener in `ResetPasswordPage.jsx` is kept as a belt-and-suspenders fallback. It can be removed once PKCE flow is confirmed working in production.
- `AuthCallbackPage.jsx` also handles `token_hash` + `type` params (OTP verification). This path is unaffected by the PKCE change and continues to work for magic link flows.

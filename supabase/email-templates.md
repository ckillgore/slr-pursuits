# Supabase Custom Email Templates

Paste these into **Supabase Dashboard > Authentication > Email Templates**.

---

## 1. Invite Email

**Subject:** You're invited to SLR Pursuits

```html
<div style="max-width: 480px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #1A1F2B;">
  <div style="text-align: center; padding: 32px 0 16px;">
    <div style="display: inline-block; width: 48px; height: 48px; background: #1A1F2B; border-radius: 12px; line-height: 48px; text-align: center;">
      <span style="color: #fff; font-size: 20px; font-weight: bold;">S</span>
    </div>
    <h1 style="margin: 16px 0 4px; font-size: 22px; font-weight: 700;">SLR <span style="color: #7A8599; font-weight: 400;">Pursuits</span></h1>
  </div>
  <div style="background: #fff; border: 1px solid #E2E5EA; border-radius: 16px; padding: 32px; text-align: center;">
    <h2 style="margin: 0 0 8px; font-size: 18px; font-weight: 600;">You've Been Invited</h2>
    <p style="color: #7A8599; font-size: 14px; margin: 0 0 24px;">
      You've been invited to join the SLR Pursuits platform for multifamily development feasibility analysis.
    </p>
    <a href="{{ .ConfirmationURL }}"
       style="display: inline-block; padding: 12px 32px; background: #2563EB; color: #fff; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px;">
      Accept Invitation
    </a>
    <p style="color: #A0AABB; font-size: 12px; margin: 24px 0 0;">
      This link expires in 24 hours. If you didn't expect this invitation, you can ignore this email.
    </p>
  </div>
  <p style="text-align: center; color: #A0AABB; font-size: 11px; margin: 16px 0 0;">
    © {{ .Year }} Streetlight Residential
  </p>
</div>
```

---

## 2. Reset Password Email

**Subject:** Reset your SLR Pursuits password

```html
<div style="max-width: 480px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #1A1F2B;">
  <div style="text-align: center; padding: 32px 0 16px;">
    <div style="display: inline-block; width: 48px; height: 48px; background: #1A1F2B; border-radius: 12px; line-height: 48px; text-align: center;">
      <span style="color: #fff; font-size: 20px; font-weight: bold;">S</span>
    </div>
    <h1 style="margin: 16px 0 4px; font-size: 22px; font-weight: 700;">SLR <span style="color: #7A8599; font-weight: 400;">Pursuits</span></h1>
  </div>
  <div style="background: #fff; border: 1px solid #E2E5EA; border-radius: 16px; padding: 32px; text-align: center;">
    <h2 style="margin: 0 0 8px; font-size: 18px; font-weight: 600;">Reset Your Password</h2>
    <p style="color: #7A8599; font-size: 14px; margin: 0 0 24px;">
      We received a request to reset the password for your account. Click the button below to set a new password.
    </p>
    <a href="{{ .ConfirmationURL }}"
       style="display: inline-block; padding: 12px 32px; background: #2563EB; color: #fff; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px;">
      Reset Password
    </a>
    <p style="color: #A0AABB; font-size: 12px; margin: 24px 0 0;">
      If you didn't request a password reset, you can safely ignore this email.
    </p>
  </div>
  <p style="text-align: center; color: #A0AABB; font-size: 11px; margin: 16px 0 0;">
    © {{ .Year }} Streetlight Residential
  </p>
</div>
```

---

## 3. Confirm Signup Email (for email confirmation if enabled)

**Subject:** Confirm your SLR Pursuits account

```html
<div style="max-width: 480px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color: #1A1F2B;">
  <div style="text-align: center; padding: 32px 0 16px;">
    <div style="display: inline-block; width: 48px; height: 48px; background: #1A1F2B; border-radius: 12px; line-height: 48px; text-align: center;">
      <span style="color: #fff; font-size: 20px; font-weight: bold;">S</span>
    </div>
    <h1 style="margin: 16px 0 4px; font-size: 22px; font-weight: 700;">SLR <span style="color: #7A8599; font-weight: 400;">Pursuits</span></h1>
  </div>
  <div style="background: #fff; border: 1px solid #E2E5EA; border-radius: 16px; padding: 32px; text-align: center;">
    <h2 style="margin: 0 0 8px; font-size: 18px; font-weight: 600;">Confirm Your Email</h2>
    <p style="color: #7A8599; font-size: 14px; margin: 0 0 24px;">
      Click below to confirm your email address and activate your account.
    </p>
    <a href="{{ .ConfirmationURL }}"
       style="display: inline-block; padding: 12px 32px; background: #2563EB; color: #fff; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px;">
      Confirm Email
    </a>
  </div>
  <p style="text-align: center; color: #A0AABB; font-size: 11px; margin: 16px 0 0;">
    © {{ .Year }} Streetlight Residential
  </p>
</div>
```

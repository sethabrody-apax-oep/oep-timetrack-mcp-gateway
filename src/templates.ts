const SHARED_STYLES = `
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .card { background: white; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); padding: 2.5rem; width: 100%; max-width: 400px; }
    .logo { text-align: center; margin-bottom: 1.5rem; }
    .logo h1 { font-size: 1.25rem; font-weight: 600; color: #0f172a; }
    .logo p { font-size: 0.875rem; color: #64748b; margin-top: 0.25rem; }
    label { display: block; font-size: 0.875rem; font-weight: 500; color: #334155; margin-bottom: 0.375rem; }
    input[type="email"], input[type="password"], input[type="text"] {
      width: 100%; padding: 0.625rem 0.75rem; border: 1px solid #e2e8f0; border-radius: 8px;
      font-size: 0.875rem; outline: none; transition: border-color 0.15s;
    }
    input:focus { border-color: #10b981; box-shadow: 0 0 0 3px rgb(16 185 129 / 0.1); }
    .field { margin-bottom: 1rem; }
    button {
      width: 100%; padding: 0.625rem; background: #059669; color: white; border: none;
      border-radius: 8px; font-size: 0.875rem; font-weight: 500; cursor: pointer;
      transition: background 0.15s;
    }
    button:hover { background: #047857; }
    .error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 0.75rem; border-radius: 8px; font-size: 0.8125rem; margin-bottom: 1rem; }
    .info { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 0.75rem; border-radius: 8px; font-size: 0.8125rem; margin-bottom: 1rem; }
  </style>
`;

export function loginPage(params: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  error?: string;
}): string {
  const errorHtml = params.error
    ? `<div class="error">${escapeHtml(params.error)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Sign In — OEP TimeTrack</title>${SHARED_STYLES}</head>
<body>
  <div class="card">
    <div class="logo">
      <h1>OEP TimeTrack</h1>
      <p>Sign in to connect your account</p>
    </div>
    ${errorHtml}
    <form method="POST" action="/authorize">
      <input type="hidden" name="client_id" value="${escapeAttr(params.clientId)}" />
      <input type="hidden" name="redirect_uri" value="${escapeAttr(params.redirectUri)}" />
      <input type="hidden" name="state" value="${escapeAttr(params.state)}" />
      <input type="hidden" name="code_challenge" value="${escapeAttr(params.codeChallenge)}" />
      <input type="hidden" name="code_challenge_method" value="${escapeAttr(params.codeChallengeMethod)}" />
      <div class="field">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" required autocomplete="email" placeholder="you@apax.com" />
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required autocomplete="current-password" />
      </div>
      <button type="submit">Sign In</button>
    </form>
  </div>
</body>
</html>`;
}

export function mfaPage(params: {
  tempSessionId: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  error?: string;
}): string {
  const errorHtml = params.error
    ? `<div class="error">${escapeHtml(params.error)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>MFA Verification — OEP TimeTrack</title>${SHARED_STYLES}</head>
<body>
  <div class="card">
    <div class="logo">
      <h1>OEP TimeTrack</h1>
      <p>Enter your authenticator code</p>
    </div>
    ${errorHtml}
    <div class="info">A 6-digit code from your authenticator app is required.</div>
    <form method="POST" action="/authorize/mfa">
      <input type="hidden" name="temp_session_id" value="${escapeAttr(params.tempSessionId)}" />
      <input type="hidden" name="client_id" value="${escapeAttr(params.clientId)}" />
      <input type="hidden" name="redirect_uri" value="${escapeAttr(params.redirectUri)}" />
      <input type="hidden" name="state" value="${escapeAttr(params.state)}" />
      <input type="hidden" name="code_challenge" value="${escapeAttr(params.codeChallenge)}" />
      <input type="hidden" name="code_challenge_method" value="${escapeAttr(params.codeChallengeMethod)}" />
      <div class="field">
        <label for="totp_code">Verification Code</label>
        <input type="text" id="totp_code" name="totp_code" required autocomplete="one-time-code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="000000" />
      </div>
      <button type="submit">Verify</button>
    </form>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

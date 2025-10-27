// main.js
let auth0 = null;

// !!! Zamijeni sa svojim Auth0 domenom i kljucevima !!!
const AUTH0_DOMAIN = 'dev-t0otca5qe7ut4ist.us.auth0.com';
const AUTH0_CLIENT_ID = 'XZ4nyq9Q3sn8pWZdHlZBmqxU7rk76gN2';
const AUTH0_AUDIENCE = 'https://best-loto-api';

// Debug helper function
function debugLog(message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, message, data };
    console.log(message, data);
    
    // Save to localStorage for persistence across refreshes
    const logs = JSON.parse(localStorage.getItem('auth0-debug-logs') || '[]');
    logs.push(logEntry);
    if (logs.length > 50) logs.shift(); // Keep only last 50 logs
    localStorage.setItem('auth0-debug-logs', JSON.stringify(logs));
}

// Initialize Auth0
async function configureClient() {
    debugLog('Creating Auth0 client...');
    auth0 = await window.auth0.createAuth0Client({
        domain: AUTH0_DOMAIN,
        clientId: AUTH0_CLIENT_ID,
        authorizationParams: {
            redirect_uri: window.location.origin + '/callback',
            audience: AUTH0_AUDIENCE
        },
        useRefreshTokens: true,
        cacheLocation: 'localstorage'
    });
    debugLog('Auth0 client created:', auth0);
}

function updateUI() {
  if (!auth0) {
    debugLog('Auth0 client not initialized');
    return;
  }
  auth0.isAuthenticated().then(loggedIn => {
    debugLog('User authenticated:', loggedIn);
    document.getElementById('login-btn').style.display = loggedIn ? 'none' : 'inline-block';
    document.getElementById('logout-btn').style.display = loggedIn ? 'inline-block' : 'none';
    if (loggedIn) {
      auth0.getUser().then(u => {
        debugLog('User data:', u);
        document.getElementById('user-info').textContent = 'Prijavljeni ste kao: ' + (u.nickname || u.name || u.email);
      });
    } else {
      document.getElementById('user-info').textContent = 'Niste prijavljeni.';
    }
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  debugLog('DOM loaded, configuring Auth0...');
  debugLog('Current URL:', window.location.href);
  debugLog('Pathname:', window.location.pathname);
  debugLog('Search params:', window.location.search);
  await configureClient();
  debugLog('Auth0 configured');

  // Handle Auth0 redirect
  if (window.location.pathname === '/callback') {
    debugLog('Handling callback...');
    debugLog('Callback URL params:', window.location.search);
    try {
      await auth0.handleRedirectCallback();
      debugLog('Callback handled successfully, redirecting...');
      window.location.replace('/');
      return;
    } catch (error) {
      debugLog('Callback handling failed:', error);
    }
  }

  debugLog('Updating UI...');
  updateUI();
  document.getElementById('login-btn').onclick = () => auth0.loginWithRedirect();
  document.getElementById('logout-btn').onclick = () => auth0.logout({ returnTo: window.location.origin });

  // --- ostatak koda ---
  loadStatus();
  document.getElementById('form-uplata').onsubmit = async (e) => {
      e.preventDefault();
      document.getElementById('msg').textContent = '';
      document.getElementById('qr-result').innerHTML = '';
      // Derive owner id from authenticated user (fallback to 'anonymous')
      let user = null;
      try { user = await auth0.getUser(); } catch (_) {}
      const ownerRaw = (user && (user.sub || user.email || user.nickname)) ? (user.sub || user.email || user.nickname) : 'anonymous';
      // Fit into VARCHAR(20) backend validation
      const person_id = ownerRaw.slice(0, 20);
      let numbers = document.getElementById('numbers').value.split(',').map(x => parseInt(x.trim())).filter(x => !isNaN(x));
      const res = await fetch('/api/pay-slip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ person_id, numbers })
      });
      const data = await res.json();
      if (!res.ok) {
          document.getElementById('msg').textContent = data.error || (data.errors ? data.errors.map(e=>e.msg).join('; ') : 'Došlo je do pogreške.');
      } else {
          document.getElementById('msg').textContent = 'Uplata uspješna!';
          document.getElementById('qr-result').innerHTML = `<b>Vaš QR kod (skener otvara listić):</b><br><img src='${data.qrCode}' alt='QR' /><br>ID: <code>${data.id}</code>`;
          document.getElementById('form-uplata').reset();
          loadStatus();
      }
  };
});

async function loadStatus() {
    const r = await fetch('/api/status');
    const data = await r.json();
    const s = document.getElementById('status');
    if (!data.activeRound) {
        s.textContent = 'Nema aktivnog kola.';
        document.getElementById('uplata').classList.add('hidden');
        return;
    }
    s.textContent = `Aktivno kolo #${data.activeRound.id}, uplaćenih listića: ${data.ticketCount}`;
    if (data.drawnNumbers) {
        document.getElementById('drawn').innerHTML = `Izvučeni brojevi: <b>${data.drawnNumbers.join(', ')}</b>`;
    } else {
        document.getElementById('drawn').textContent = '';
    }
    if (data.activeRound.is_active) {
        document.getElementById('uplata').classList.remove('hidden');
    } else {
        document.getElementById('uplata').classList.add('hidden');
    }
}

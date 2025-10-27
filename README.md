Loto 6/45 Web App (Node.js + Express + PostgreSQL + Auth0)

Jednostavna web-aplikacija koja simulira uplatu loto listića (6/45), upravljanje kolima i prikaz izvučenih brojeva.
- Backend: Node.js/Express
- Baza: PostgreSQL
- Frontend: čisti HTML/CSS/JS
- Autentikacija: Auth0 (OIDC SPA)
- Admin autorizacija: Auth0 (OAuth2 Client Credentials – M2M)

1) Pokretanje lokalno
- Prereq: Node 18+, PostgreSQL
- Instalacija: `npm install`
- .env (primjer):
  - `DATABASE_URL=postgres://user:pass@host:5432/dbname`
  - `PGSSL=true` (false za lokalnu bazu)
  - `AUTH0_DOMAIN=dev-xxxx.us.auth0.com`
  - `API_AUDIENCE=https://best-loto-api`
- Start: `node index.js` → http://localhost:3000

2) Inicijalizacija baze
- Pokrenuti `db.sql` (sadrži `round`, `ticket`, `drawn_numbers` i `CREATE EXTENSION pgcrypto`)

3) Auth0 konfiguracija
- SPA aplikacija (Applications → SPA):
  - Callback: `http://localhost:3000/callback`
  - Logout: `http://localhost:3000`
  - Web Origins: `http://localhost:3000`
  - Token Endpoint Auth Method: None
- API (APIs): Identifier/audience = `https://best-loto-api`, RS256
- M2M aplikacija: autoriziraj je na API, zapiši `client_id` i `client_secret`

4) Testiranje admin endpointova
PowerShell primjer dohvata tokena i poziva:
```
$domain = 'dev-xxxx.us.auth0.com'
$audience = 'https://best-loto-api'
$client_id = '<M2M_CLIENT_ID>'
$client_secret = '<M2M_CLIENT_SECRET>'

$body = @{ client_id=$client_id; client_secret=$client_secret; audience=$audience; grant_type='client_credentials' } | ConvertTo-Json
$tokenResponse = Invoke-RestMethod -Method Post -Uri "https://$domain/oauth/token" -ContentType 'application/json' -Body $body
$token = $tokenResponse.access_token

curl.exe -i -X POST http://localhost:3000/api/new-round -H "Authorization: Bearer $token"
curl.exe -i -X POST http://localhost:3000/api/close -H "Authorization: Bearer $token"
curl.exe -i -X POST http://localhost:3000/api/store-results -H "Authorization: Bearer $token" -H "Content-Type: application/json" --data '{"numbers":[1,2,3,4,5,6]}'
```

5) Deployment na Render
- Web Service iz Git repozitorija
- Build: `npm ci` (ili `npm install`), Start: `node index.js`
- Env vars: `DATABASE_URL`, `PGSSL=true`, `AUTH0_DOMAIN`, `API_AUDIENCE`
- Render Postgres: kreiraj bazu i pokreni `db.sql`
- U Auth0 dodaj Render domenu u Callback/Logout/Web Origins

6) API sažetak
- `GET /api/status` – status kola, broj listića, izvučeni brojevi
- `POST /api/pay-slip` – uplata listića, validacija i QR kod
- `GET /api/ticket/:id` – detalji listića
- Admin (M2M): `POST /api/new-round`, `POST /api/close`, `POST /api/store-results`

Napomena
- SPA koristi `cacheLocation: 'localstorage'` i `useRefreshTokens: true` za bolji UX; za produkciju postavi strogi CSP i pazi na XSS.
- `person_id` se puni iz Auth0 profila (sub/email/nickname, skraćeno na 20 znakova) radi demonstracije.

Deliverables
- Git repo URL, URL aplikacije (Render), test korisnički račun, M2M podaci: auth server `https://<AUTH0_DOMAIN>/oauth/token`, audience `https://best-loto-api`, `client_id`, `client_secret`.



# Primul apel cu Pam

Fluxul implementat este **Twilio Programmable Voice → SIP OpenAI Realtime → dashboard Pam.ai**. Audio circulă între furnizori; serverul Node controlează conversația prin WebSocket și salvează datele în PostgreSQL. Acest increment răspunde în română din program, servicii și FAQ-uri, cere confirmarea datelor de contact și salvează solicitarea și transcrierea. Programările și transferul către o persoană urmează.

**Validare:** teste locale cu PostgreSQL, webhook-uri semnate, SDK-uri reale și un WebSocket simulat. Apelul prin rețeaua telefonică și accesul conturilor la model rămân de verificat după configurarea credențialelor. Nu există încă un apel live validat.

## 1. Conturile și numărul

Folosește un număr Twilio cu capacitate **Voice**. În `.env.local` setează:

```dotenv
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+...
OPENAI_API_KEY=...
OPENAI_PROJECT_ID=proj_...
OPENAI_REALTIME_MODEL=gpt-realtime-2.1
OPENAI_VOICE=marin
```

Numărul trebuie să fie în format internațional, exact ca în Twilio. Disponibilitatea numerelor românești, documentele și restricțiile contului se verifică în contul tău; poți folosi și un alt număr Voice pentru test. Nu cumpărăm și nu provisionăm automat numere.

Creează cheia API într-un proiect OpenAI cu facturare și acces la modelul ales. Copiază Project ID din setările proiectului. Cheia, webhook-ul și Project ID trebuie să aparțină aceluiași proiect. Poți schimba modelul înainte de activare dacă proiectul are acces la alt model Realtime compatibil. Apelurile reale folosesc serviciile plătite ale furnizorilor. Cheile se păstrează local, fără a le trimite în chat.

## 2. Server și tunel HTTPS

```sh
npm run services:up
npm run db:migrate
npm run dev
```

Dashboard-ul și autentificarea funcționează și fără configurarea vocii. `npm run dev` și `npm start` folosesc serverul Node persistent. Nu înlocui aceste comenzi cu `next dev`/`next start` pentru apeluri și nu folosi un runtime serverless.

Expune portul 3000 prin HTTPS. Dacă ai instalat `cloudflared`, poți folosi un tunel temporar pentru test:

```sh
cloudflared tunnel --url http://localhost:3000
```

Pune originea HTTPS afișată în `.env.local`:

```dotenv
VOICE_PUBLIC_URL=https://adresa-tunelului.example
```

Nu adăuga o cale sau query string. Dacă adresa tunelului se schimbă, actualizează variabila și webhook-urile din ambele console. Pentru dashboard local păstrează `AUTH_URL=http://localhost:3000` și folosește această origine în browser. Un deployment remote necesită HTTPS pentru `AUTH_URL`, SMTP și ingress-ul descris în README. Un container poate seta `HOSTNAME_BIND=0.0.0.0`.

## 3. Webhook OpenAI

În setările proiectului OpenAI adaugă endpoint-ul:

```text
https://ADRESA-TUNELULUI/api/voice/openai
```

Abonează-l la `realtime.call.incoming`. Copiază **secretul de semnare al webhook-ului**, distinct de cheia API:

```dotenv
OPENAI_WEBHOOK_SECRET=whsec_...
```

Pam verifică semnătura și timestamp-ul pe corpul original. Apelurile SIP fără tokenul temporar generat din webhook-ul Twilio verificat sunt respinse. Nu configura un Elastic SIP Trunk direct pentru această versiune: integrarea folosește `<Dial><Sip>` cu headerele necesare corelării apelului.

## 4. Webhook-uri Twilio

La numărul ales, în configurarea Voice, setează **A call comes in → Webhook → HTTP POST**:

```text
https://ADRESA-TUNELULUI/api/telephony/twilio/voice
```

Pentru notificările de status ale apelului setează **HTTP POST**:

```text
https://ADRESA-TUNELULUI/api/telephony/twilio/status
```

TwiML generat include separat `/api/telephony/twilio/dial-ended` pentru rezultatul legăturii SIP și adresa `sip:PROJECT_ID@sip.api.openai.com;transport=tls`. Nu trebuie să introduci manual adresa SIP. Verificarea semnăturii folosește exact originea din `VOICE_PUBLIC_URL`; proxy-ul nu trebuie să schimbe calea sau să adauge query parameters.

## 5. Configurarea firmei

```sh
npm run voice:check
```

Comanda afișează variabilele lipsă sau URL-urile webhook-urilor. Nu verifică disponibilitatea conturilor prin API și nu inițiază apeluri. Repornește serverul după modificarea `.env.local`.

Înregistrează-te, verifică email-ul în Mailpit și creează firma. Din dashboard deschide **Configurează recepția**. Completează salutul, zilele și orele de lucru, serviciul și până la trei FAQ-uri reale. Bifează **Activează Pam pentru numărul de test** și salvează. Poți salva informațiile și fără chei, cu recepția inactivă.

Această versiune conectează un singur număr definit pe server, care nu poate fi asociat simultan cu două firme. Citirile din dashboard verifică apartenența utilizatorului; telefonia verifică semnăturile și ruta către firmă.

## 6. Apelul de test

1. Sună numărul din `TWILIO_PHONE_NUMBER`.
2. Verifică salutul în română și mențiunea că Pam este un asistent AI și că discuția este transcrisă.
3. Întreabă despre program sau un FAQ configurat; răspunsul trebuie să corespundă firmei.
4. Spune numele, numărul de contact și motivul apelului. Confirmă datele recitite.
5. Închide apelul, reîncarcă dashboard-ul și deschide apelul pentru status, durată, solicitare, rezumat și transcriere.

Folosește datele proprii de test. Nu se înregistrează audio. Transcrierea automată poate conține erori; textul unei intervenții întrerupte nu dovedește că apelantul a auzit-o integral. Rezumatul folosește solicitarea confirmată.

## Verificări și operare

```sh
npm run lint
npm run typecheck
npm run voice:test
npm run db:test
npm run auth:test
npm run intake:test
npm run build
npm run auth:e2e
```

`voice:test` utilizează numai baza locală `voice_ai_saas`, propriile fixture-uri, semnături SDK și un WebSocket local. Nu sună numere și nu cere chei reale. Verifică deduplicarea, izolarea firmelor, confirmarea datelor, închiderea apelului și erorile furnizorului. Testul din browser verifică și salvarea configurației și transcrierea unui apel simulat în baza de date.

Implicit, serverul acceptă maximum trei conversații simultane și limitează apelul la zece minute. `VOICE_MAX_CALLS` și `VOICE_MAX_SECONDS` ajustează limitele. Un lock PostgreSQL permite unui singur runtime să dețină contul Twilio. La restart încearcă să reatașeze sesiunile persistate; dacă recuperarea eșuează, închide apelul și păstrează eroarea. Shutdown-ul închide sesiunile, iar apelurile fără sesiune sunt curățate după un minut.

La erori verifică Twilio Debugger și log-urile serverului. Log-urile Pam afișează identificatorul intern al apelului și tipul erorii, fără tokenuri sau conversații. Lipsa transcrierii, audio unilateral sau respingerea SIP necesită verificare într-un apel live. Retenția/ștergerea transcrierilor, monitorizarea completă și transferul rămân în roadmap-ul pentru pilot.

Protocol: [OpenAI Telephony and SIP](https://developers.openai.com/api/docs/guides/voice-sip), [OpenAI webhooks](https://developers.openai.com/api/docs/guides/webhooks), [Twilio SIP TwiML](https://www.twilio.com/docs/voice/twiml/sip), [Twilio request validation](https://www.twilio.com/docs/usage/security). Tunel de test: [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).

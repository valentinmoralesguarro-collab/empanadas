/* Empanadas Convi — Copyright (c) 2026 Felipe. Todos los derechos reservados. */
/* Cliente del backend Apps Script: login Google (GIS), pedidos a prueba de fallas, sondeo de versión.
   Reglas (ver references/04-gas-backend.md): el idToken dura ~1 h y no se renueva solo; los pedidos de
   Apps Script fallan de forma intermitente (3-15 %) → pedidos paralelos escalonados; las escrituras llevan
   requestId para que un reintento no duplique; el sondeo pregunta getVersion (barato), nunca getData.
   MODO PRUEBA: mientras BACKEND_URL no esté configurada (o con ?demo en la URL) todo corre contra demo.js,
   con datos guardados solo en este dispositivo. */
(function () {
  'use strict';
  const CLIENT_ID = '232073004228-rnm7gkq005vbj8plgsc4vci5pivtirg5.apps.googleusercontent.com';   // OAuth Client ID (Google Cloud, cuenta dueña)
  const BACKEND_URL = 'https://script.google.com/macros/s/AKfycbwtbqzAhKHt7OgZaoF5I3P_dsrZJewz-k2fdjKvBeNV8C4M3epsPWPGm_Iz0VusoXbkjQ/exec';                               // URL /exec del Web App
  const BACKEND_ESPEJO = '';                                          // opcional: 2º proyecto de solo lectura
  const MS_SONDEO = 20000;
  const DEMO = /^PEGAR/.test(BACKEND_URL) || /[?&]demo\b/.test(location.search);

  const $ = (id) => document.getElementById(id);
  let idToken = null, versionVista = null, timerSondeo = null, rechazos = 0, ultimoFallo = '';

  /* ---------- pedidos ---------- */
  const LECTURAS = { getData: 1, getVersion: 1 };
  const PLAN_LECTURA   = { escalones: [0, 4000, 8000, 13000, 20000], max: 5, porIntento: 25000, tope: 50000 };
  const PLAN_SONDEO    = { escalones: [0, 5000], max: 2, porIntento: 15000, tope: 22000 };
  const PLAN_ESCRITURA = { escalones: [0, 12000, 24000], max: 3, porIntento: 30000, tope: 55000 };

  function nuevoRequestId() {
    const b = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2);
    return b.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  }

  function llamar(action, extra) {
    if (DEMO) return window.DemoBackend.llamar(action, extra || {});
    const lectura = !!LECTURAS[action];
    const plan = action === 'getVersion' ? PLAN_SONDEO : lectura ? PLAN_LECTURA : PLAN_ESCRITURA;
    const cuerpo = Object.assign({ action, idToken }, extra || {});
    if (!lectura) cuerpo.requestId = nuevoRequestId();
    const texto = JSON.stringify(cuerpo);          // sin Content-Type: pedido "simple", sin preflight CORS
    const t0 = Date.now();
    return new Promise((resolve, reject) => {
      let fin = false, lanzados = 0, activos = 0, ultimoError = null;
      const controles = [], relojes = [];
      const cerrar = (f, v) => { if (fin) return; fin = true; relojes.forEach(clearTimeout); controles.forEach((c) => c.abort()); f(v); };
      function lanzar() {
        if (fin || lanzados >= plan.max) return;
        const n = ++lanzados; activos++;
        const corte = new AbortController(); controles.push(corte);
        const enEspejo = lectura && BACKEND_ESPEJO && n % 2 === 0;
        const base = enEspejo ? BACKEND_ESPEJO : BACKEND_URL;
        const url = n <= 2 ? base : base + '?r=' + Date.now() + '_' + n;   // parámetro distinto = pedido nuevo
        const reloj = setTimeout(() => corte.abort(), plan.porIntento);
        fetch(url, { method: 'POST', body: texto, signal: corte.signal })
          .then((r) => r.text())
          .then((txt) => { try { return JSON.parse(txt); } catch (e) { const er = new Error('no es JSON'); er.name = 'RespuestaInvalida'; throw er; } })
          .then((j) => cerrar(resolve, j))
          .catch((err) => { if (!fin) { ultimoError = err; ultimoFallo = action + ' · ' + (err.name || 'error') + ' a los ' + Math.round((Date.now() - t0) / 1000) + ' s (intento ' + n + ')'; } })
          .finally(() => {
            clearTimeout(reloj); activos--;
            if (fin) return;
            if (lanzados < plan.max) lanzar();
            else if (activos === 0) cerrar(reject, ultimoError || new Error('sin respuesta'));
          });
      }
      plan.escalones.slice(1).forEach((ms) => relojes.push(setTimeout(lanzar, ms)));
      relojes.push(setTimeout(() => cerrar(reject, ultimoError || Object.assign(new Error('tiempo agotado'), { name: 'AbortError' })), plan.tope));
      lanzar();
    });
  }

  /* ---------- sesión ---------- */
  function exp(token) { try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).exp * 1000; } catch (e) { return 0; } }

  function cartel(msg) {
    let b = $('bannerSesion');
    if (!b) { b = document.createElement('div'); b.id = 'bannerSesion'; b.className = 'banner'; document.body.prepend(b); }
    b.textContent = msg;
  }

  function sesionVencida() {
    clearInterval(timerSondeo); timerSondeo = null;
    cartel('La sesión venció. Recargá la página para volver a entrar.');
  }

  function alIniciarSesion(resp) {
    idToken = resp.credential; rechazos = 0;
    setTimeout(sesionVencida, Math.max(5000, exp(idToken) - Date.now() - 30000));
    mensajeLogin('Entrando…');
    cargar(true);
  }

  function mensajeLogin(t) { $('loginMsg').hidden = !t; $('loginMsg').textContent = t || ''; }

  async function cargar(primera) {
    try {
      const r = await llamar('getData');
      if (!r.ok) {
        if (r.error === 'auth_failed') return mensajeLogin('No pudimos validar tu cuenta de Google. Probá entrar de nuevo.');
        if (r.error === 'no_miembro') return mensajeLogin('Tu cuenta (' + r.email + ') todavía no está en la lista. Pasale ese mail a quien organiza para que te agregue.');
        throw new Error(r.error);
      }
      $('login').hidden = true; $('app').hidden = false;
      versionVista = r.version; App.setData(r);
      if (primera && !DEMO) arrancarSondeo();
    } catch (e) {
      if (primera) mensajeLogin('No se pudo conectar. Revisá la señal y probá de nuevo. ' + ultimoFallo);
      else App.toast('No se pudo actualizar. Revisá la señal.');
    }
  }

  /* ---------- sincronización entre usuarios ---------- */
  async function chequear() {
    if (document.visibilityState !== 'visible' || !idToken) return;
    try {
      const r = await llamar('getVersion');
      if (!r.ok) { if (r.error === 'auth_failed' && ++rechazos >= 2) sesionVencida(); return; }
      rechazos = 0;
      if (r.version !== versionVista) cargar(false);
    } catch (e) { /* red caída: se reintenta en el próximo ciclo */ }
  }
  function arrancarSondeo() {
    if (timerSondeo) return;
    timerSondeo = setInterval(chequear, MS_SONDEO);
    document.addEventListener('visibilitychange', chequear);
    window.addEventListener('focus', chequear);
  }

  function iniciarGIS() {
    if (!(window.google && google.accounts && google.accounts.id)) return setTimeout(iniciarGIS, 200);
    google.accounts.id.initialize({ client_id: CLIENT_ID, callback: alIniciarSesion, auto_select: true });
    google.accounts.id.renderButton($('gsiButton'), { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill' });
    google.accounts.id.prompt();
  }

  function salir() {
    if (DEMO) { window.DemoBackend.reiniciar(); location.reload(); return; }
    try { google.accounts.id.disableAutoSelect(); } catch (e) { /* GIS no cargó: igual recargamos */ }
    location.reload();
  }

  window.addEventListener('load', () => { if (DEMO) cargar(true); else iniciarGIS(); });

  // Tras una escritura el backend devuelve todo fresco con su versión: así quien guardó no recarga dos veces.
  function marcarVersion(v) { if (v) versionVista = v; }

  window.Backend = { llamar, recargar: () => cargar(false), salir, marcarVersion, demo: DEMO };
})();

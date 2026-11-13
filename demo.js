/* Empanadas Convi — Copyright (c) 2026 Felipe. Todos los derechos reservados. */
/* Backend de mentira para el MODO PRUEBA: misma forma de respuesta que Code.gs, datos solo en este dispositivo.
   Sirve para probar la app antes de tener el Apps Script publicado. */
(function () {
  'use strict';
  const KEY = 'empanadas:demo:v2';
  const YO = { email: 'vos@ejemplo.com', nombre: 'Vos', admin: true };

  function hoy(d) { const f = new Date(Date.now() - (d || 0) * 864e5); return f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0') + '-' + String(f.getDate()).padStart(2, '0'); }
  let n = 0;
  function mov(dias, tipo, quien, cantidad, monto, extra) {
    return Object.assign({ id: 'd' + (++n), fecha: hoy(dias), tipo, quien, cantidad: cantidad || 0, monto: monto || 0, pago: '', detalle: '', cargo: 'Vos', creado: Date.now() - dias * 864e5 + n * 1000, mio: true }, extra || {});
  }
  function semilla() {
    return {
      version: 1,
      config: { nombre: 'Convivencia de verano', docena: 15000 },
      miembros: [YO, { email: 'ana@ejemplo.com', nombre: 'Ana', admin: false }, { email: 'tomi@ejemplo.com', nombre: 'Tomi', admin: false }],
      movs: [
        mov(6, 'gasto', 'Ana', 0, 48000, { pago: 'bolsillo', detalle: '6 kg de carne picada' }),
        mov(6, 'gasto', 'Tomi', 0, 21500, { pago: 'bolsillo', detalle: 'Tapas, cebolla y huevos' }),
        mov(5, 'tanda', '', 120, 0, { detalle: 'Carne, en lo de Ana' }),
        mov(5, 'retiro', 'Tomi', 36),
        mov(5, 'retiro', 'Ana', 24),
        mov(4, 'retiro', 'Vos', 24),
        mov(3, 'rendicion', 'Ana', 24, 30000),
        mov(2, 'rendicion', 'Tomi', 24, 30000),
        mov(2, 'reintegro', 'Ana', 0, 30000, { detalle: 'Primera parte' }),
        mov(1, 'devolucion', 'Tomi', 4, 0, { detalle: 'Le sobraron' })
      ]
    };
  }
  function leer() { try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.movs) return d; } catch (e) { /* sin storage: semilla */ } return semilla(); }
  function guardar(d) { d.version++; try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* modo privado: queda en memoria */ } }
  let db = leer();

  function todo(extra) {
    return Object.assign({ ok: true, version: String(db.version), yo: YO, config: db.config, miembros: db.miembros, movs: db.movs.filter((m) => !m.borrado) }, extra || {});
  }
  const espera = (x) => new Promise((r) => setTimeout(() => r(x), 250));

  function llamar(action, p) {
    switch (action) {
      case 'getData': return espera(todo());
      case 'getVersion': return espera({ ok: true, version: String(db.version) });
      case 'addMov': {
        const m = p.mov || {};
        const id = 'd' + Date.now().toString(36);
        db.movs.push({ id, fecha: m.fecha || hoy(), tipo: m.tipo, quien: (m.quien || '').trim(), cantidad: Number(m.cantidad) || 0, monto: Number(m.monto) || 0,
          pago: m.tipo === 'gasto' ? (m.pago === 'caja' ? 'caja' : 'bolsillo') : '', detalle: m.detalle || '', cargo: YO.nombre, creado: Date.now(), mio: true });
        guardar(db); return espera(todo({ id }));
      }
      case 'borrarMov': case 'restaurarMov': {
        const m = db.movs.find((x) => x.id === p.id); if (!m) return espera({ ok: false, error: 'no_existe' });
        m.borrado = action === 'borrarMov'; guardar(db); return espera(todo());
      }
      case 'setConfig': db.config = { nombre: p.nombre, docena: Number(p.docena) || 0 }; guardar(db); return espera(todo());
      case 'addMiembro': {
        const email = String(p.email).toLowerCase(); const ya = db.miembros.find((x) => x.email === email);
        if (ya) Object.assign(ya, { nombre: p.nombre, admin: !!p.admin }); else db.miembros.push({ email, nombre: p.nombre, admin: !!p.admin });
        guardar(db); return espera(todo());
      }
      case 'quitarMiembro': {
        if (p.email === YO.email) return espera({ ok: false, error: 'no_te_podes_quitar' });
        db.miembros = db.miembros.filter((x) => x.email !== p.email); guardar(db); return espera(todo());
      }
      default: return espera({ ok: false, error: 'unknown_action' });
    }
  }
  function reiniciar() { try { localStorage.removeItem(KEY); } catch (e) { /* nada que borrar */ } db = semilla(); }

  window.DemoBackend = { llamar, reiniciar };
})();

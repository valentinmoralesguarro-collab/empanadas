/* Empanadas Convi — Copyright (c) 2026 Felipe. Todos los derechos reservados. */
/* Pantallas y cuentas. El backend guarda movimientos crudos; acá se calcula todo lo demás:
   - depósito = tandas − retiros + devoluciones
   - cada persona "tiene" = retiró − devolvió − rindió (cantidad)
   - juntado (ganancia) = rendiciones − gastos ; caja = rendiciones − gastos pagados con la caja − reintegros
   - a devolverle a alguien = lo que puso de su bolsillo − lo que ya le devolvimos */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const KEY = 'empanadas:v1';

  /* ---------- utilidades ---------- */
  const fmtNum = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
  const plata = (n) => (n < 0 ? '−$ ' : '$ ') + fmtNum.format(Math.abs(Math.round(n)));
  const num = (s) => { const d = String(s || '').replace(/[^\d]/g, ''); return d ? Number(d) : 0; };
  const clave = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const hoyISO = () => { const f = new Date(); return f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0') + '-' + String(f.getDate()).padStart(2, '0'); };
  const plural = (n, uno, varios) => fmtNum.format(n) + ' ' + (n === 1 ? uno : varios);
  function fechaLarga(iso) {
    const [a, m, d] = iso.split('-').map(Number); const f = new Date(a, m - 1, d);
    const dif = Math.round((new Date(hoyISO() + 'T00:00') - f) / 864e5);
    if (dif === 0) return 'Hoy'; if (dif === 1) return 'Ayer';
    const t = f.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function el(tag, props, hijos) {
    const e = document.createElement(tag);
    if (props) Object.keys(props).forEach((k) => {
      if (k === 'class') e.className = props[k]; else if (k === 'text') e.textContent = props[k];
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), props[k]); else e.setAttribute(k, props[k]);
    });
    (hijos || []).forEach((h) => h != null && e.appendChild(typeof h === 'string' ? document.createTextNode(h) : h));
    return e;
  }

  // El precio se fija por DOCENA; la unidad sale de dividir por 12.
  const unidad = () => (Number(D.config.docena) || 0) / 12;
  function pintarUnidad() {
    const d = num($('cDocena').value);
    $('cUnidad').textContent = d ? 'Cada empanada sale ' + plata(d / 12) + ' · media docena ' + plata(d / 2) : '';
  }

  /* ---------- tema ---------- */
  const pref = {
    get(k) { try { return localStorage.getItem(KEY + ':' + k); } catch (e) { return null; } },
    set(k, v) { try { if (v) localStorage.setItem(KEY + ':' + k, v); else localStorage.removeItem(KEY + ':' + k); } catch (e) { /* sin storage */ } }
  };
  function aplicarTema() {
    const t = pref.get('tema');
    if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    document.querySelectorAll('#segTema button').forEach((b) => b.classList.toggle('on', b.dataset.tema === (t || '')));
  }
  aplicarTema();

  /* ---------- aviso ---------- */
  let tToast;
  function toast(msg, accion, fn) {
    $('toastMsg').textContent = msg; const b = $('toastBtn');
    b.hidden = !accion; b.textContent = accion || ''; b.onclick = () => { $('toast').classList.remove('on'); fn && fn(); };
    $('toast').classList.add('on'); clearTimeout(tToast); tToast = setTimeout(() => $('toast').classList.remove('on'), accion ? 6000 : 2500);
  }

  const ERRORES = {
    falta_quien: 'Falta decir quién.', falta_cantidad: 'Poné cuántas empanadas.', falta_monto: 'Poné el monto.',
    numero_invalido: 'Revisá los números.', solo_quien_lo_cargo: 'Solo lo puede borrar quien lo cargó (o un admin).',
    solo_admin: 'Eso lo puede hacer solo un admin.', email_invalido: 'Ese mail no parece válido.', falta_nombre: 'Falta el nombre.',
    no_te_podes_quitar: 'No te podés quitar a vos mismo.', no_se_puede_quitar_al_dueno: 'Al organizador no se lo puede quitar.',
    ocupado: 'Hay mucha gente cargando a la vez. Probá de nuevo en un ratito.', datos_invalidos: 'Revisá los datos.'
  };
  const msgError = (r) => ERRORES[r && r.error] || 'No se pudo guardar (' + ((r && r.error) || 'error') + ').';

  /* ---------- estado ---------- */
  let D = { yo: { nombre: '', admin: false }, config: { nombre: '', docena: 0 }, miembros: [], movs: [] };
  let C = null;              // cuentas calculadas
  let tab = pref.get('tab') || 'inicio', filtro = 'todo';

  function calcular() {
    const per = new Map();
    const P = (nombre) => {
      const k = clave(nombre); if (!k) return null;
      if (!per.has(k)) per.set(k, { nombre: nombre.trim(), retiro: 0, devolucion: 0, vendidas: 0, rendido: 0, puso: 0, devuelto: 0, gastoCaja: 0, movs: [] });
      return per.get(k);
    };
    const c = { producidas: 0, retiradas: 0, devueltas: 0, vendidas: 0, ingresos: 0, gastos: 0, gastosCaja: 0, reintegros: 0 };
    D.movs.forEach((m) => {
      const p = m.tipo === 'tanda' ? null : P(m.quien);
      if (p) p.movs.push(m);
      switch (m.tipo) {
        case 'tanda': c.producidas += m.cantidad; break;
        case 'retiro': c.retiradas += m.cantidad; p.retiro += m.cantidad; break;
        case 'devolucion': c.devueltas += m.cantidad; p.devolucion += m.cantidad; break;
        case 'rendicion': c.vendidas += m.cantidad; c.ingresos += m.monto; p.vendidas += m.cantidad; p.rendido += m.monto; break;
        case 'gasto': c.gastos += m.monto; if (m.pago === 'caja') { c.gastosCaja += m.monto; p.gastoCaja += m.monto; } else p.puso += m.monto; break;
        case 'reintegro': c.reintegros += m.monto; p.devuelto += m.monto; break;
      }
    });
    c.personas = [...per.values()].map((p) => Object.assign(p, { tiene: p.retiro - p.devolucion - p.vendidas, aDevolver: p.puso - p.devuelto }));
    c.deposito = c.producidas - c.retiradas + c.devueltas;
    c.enLaCalle = c.personas.reduce((s, p) => s + Math.max(0, p.tiene), 0);
    c.ganancia = c.ingresos - c.gastos;
    c.caja = c.ingresos - c.gastosCaja - c.reintegros;
    c.deuda = c.personas.reduce((s, p) => s + Math.max(0, p.aDevolver), 0);
    c.costoUnidad = c.producidas ? c.gastos / c.producidas : 0;
    return c;
  }

  function setData(r) {
    D = { yo: r.yo || D.yo, config: r.config || D.config, miembros: r.miembros || [], movs: (r.movs || []).slice() };
    D.movs.sort((a, b) => (b.fecha.localeCompare(a.fecha)) || (b.creado - a.creado));
    if (r.version) Backend.marcarVersion(r.version);
    C = calcular();
    pintar();
  }

  /* ---------- pintar ---------- */
  function pintar() {
    $('tituloApp').textContent = 'Empanadas';
    $('subApp').textContent = D.config.nombre || '';
    pintarInicio(); pintarMovs(); pintarPersonas(); pintarNombres();
    if (!$('hojaAjustes').hidden) pintarAjustes();
    mostrarTab(tab);
  }

  function pintarInicio() {
    $('hGanancia').textContent = plata(C.ganancia);
    $('hGanancia').classList.toggle('neg', C.ganancia < 0);
    const partes = ['Entró ' + plata(C.ingresos), 'se gastó ' + plata(C.gastos)];
    if (C.costoUnidad) partes.push('cada una nos cuesta ' + plata(C.costoUnidad));
    $('hDetalle').textContent = partes.join(' · ');

    $('sCaja').textContent = plata(C.caja);
    $('sVendidas').textContent = fmtNum.format(C.vendidas);
    $('sDeposito').textContent = fmtNum.format(C.deposito);
    $('sCalle').textContent = fmtNum.format(C.enLaCalle);

    const tienen = C.personas.filter((p) => p.tiene > 0).sort((a, b) => b.tiene - a.tiene);
    const ul = $('lTienen'); ul.textContent = '';
    tienen.forEach((p) => ul.appendChild(el('li', { class: 'fila tocable', onclick: () => abrirPersona(p.nombre) }, [
      el('span', { class: 'grow' }, [el('strong', { text: p.nombre })]),
      el('span', { class: 'der' }, [el('strong', { text: plural(p.tiene, 'empanada', 'empanadas') }), el('span', { class: 'muted chico', text: '≈ ' + plata(p.tiene * unidad()) })])
    ])));
    $('vTienen').hidden = tienen.length > 0;

    const deben = C.personas.filter((p) => p.aDevolver > 0).sort((a, b) => b.aDevolver - a.aDevolver);
    const ul2 = $('lDevolver'); ul2.textContent = '';
    deben.forEach((p) => ul2.appendChild(el('li', { class: 'fila' }, [
      el('span', { class: 'grow' }, [el('strong', { text: p.nombre }), el('span', { class: 'muted chico', text: 'Puso ' + plata(p.puso) + (p.devuelto ? ' · ya le dimos ' + plata(p.devuelto) : '') })]),
      el('strong', { class: 'der', text: plata(p.aDevolver) }),
      el('button', { class: 'btn mini', text: 'Devolver', onclick: () => abrirForm('reintegro', { quien: p.nombre, monto: p.aDevolver }) })
    ])));
    $('vDevolver').hidden = deben.length > 0;
  }

  const TIPOS = {
    retiro:     { nombre: 'Se llevó', grupo: 'empanadas', titulo: (m) => m.quien + ' se llevó ' + plural(m.cantidad, 'empanada', 'empanadas') },
    devolucion: { nombre: 'Devolvió', grupo: 'empanadas', titulo: (m) => m.quien + ' devolvió ' + plural(m.cantidad, 'empanada', 'empanadas') },
    rendicion:  { nombre: 'Rindió plata', grupo: 'plata', titulo: (m) => m.quien + ' rindió' + (m.cantidad ? ' ' + plural(m.cantidad, 'vendida', 'vendidas') : ' plata') },
    gasto:      { nombre: 'Gasto', grupo: 'plata', titulo: (m) => (m.detalle || 'Gasto') },
    reintegro:  { nombre: 'Le devolvimos', grupo: 'plata', titulo: (m) => 'Le devolvimos plata a ' + m.quien },
    tanda:      { nombre: 'Tanda', grupo: 'empanadas', titulo: (m) => 'Tanda de ' + plural(m.cantidad, 'empanada', 'empanadas') }
  };
  const ICONOS = {
    retiro: 'M6 8h12l-1 12H7zM9 8a3 3 0 0 1 6 0', devolucion: 'M9 14l-4-4 4-4M5 10h9a5 5 0 0 1 0 10h-3',
    rendicion: 'M3 6h18v12H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5', gasto: 'M3 4h2.5l2.2 11h10.6L20.5 7H6.4',
    reintegro: 'M15 14l4-4-4-4M19 10h-9a5 5 0 0 0 0 10h3', tanda: 'M3 16c1.5-7 16.5-7 18 0zM7 12.5l1.5 1.5 1.5-1.5 1.5 1.5 1.5-1.5 1.5 1.5 1.5-1.5'
  };
  function icono(tipo) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', ICONOS[tipo]); s.appendChild(p);
    return el('span', { class: 'ic t-' + tipo }, [s]);
  }
  function montoDe(m) {
    if (m.tipo === 'gasto' || m.tipo === 'reintegro') return { txt: plata(-m.monto), cls: 'neg' };
    if (m.tipo === 'rendicion') return { txt: '+' + plata(m.monto), cls: 'pos' };
    if (m.tipo === 'tanda') return { txt: '+' + fmtNum.format(m.cantidad), cls: '' };
    return { txt: (m.tipo === 'retiro' ? '−' : '+') + fmtNum.format(m.cantidad), cls: '' };
  }
  function subtitulo(m) {
    const p = [];
    if (m.tipo === 'gasto') p.push((m.quien ? 'Pagó ' + m.quien : '') + (m.pago === 'caja' ? ' · de la caja' : ' · de su bolsillo'));
    else if (m.detalle) p.push(m.detalle);
    if (m.cargo) p.push('cargó ' + m.cargo);
    return p.join(' · ');
  }
  function filaMov(m) {
    const mo = montoDe(m);
    return el('li', { class: 'fila tocable', onclick: () => abrirMov(m) }, [
      icono(m.tipo),
      el('span', { class: 'grow' }, [el('strong', { text: TIPOS[m.tipo].titulo(m) }), el('span', { class: 'muted chico', text: subtitulo(m) })]),
      el('strong', { class: 'der ' + mo.cls, text: mo.txt })
    ]);
  }

  function pintarMovs() {
    document.querySelectorAll('#filtros .chip').forEach((b) => b.classList.toggle('on', b.dataset.f === filtro));
    const lista = D.movs.filter((m) => filtro === 'todo' || TIPOS[m.tipo].grupo === filtro);
    const cont = $('lMovs'); cont.textContent = '';
    let fecha = null, ul = null;
    lista.forEach((m) => {
      if (m.fecha !== fecha) {
        fecha = m.fecha; ul = el('ul', { class: 'list' });
        cont.appendChild(el('section', { class: 'card grupo' }, [el('h3', { text: fechaLarga(fecha) }), ul]));
      }
      ul.appendChild(filaMov(m));
    });
    $('vMovs').hidden = lista.length > 0;
  }

  function pintarPersonas() {
    const cont = $('lPersonas'); cont.textContent = '';
    const ps = C.personas.slice().sort((a, b) => b.tiene - a.tiene || b.vendidas - a.vendidas || a.nombre.localeCompare(b.nombre));
    ps.forEach((p) => {
      const datos = [];
      if (p.retiro) datos.push(['Tiene', plural(Math.max(0, p.tiene), 'empanada', 'empanadas'), p.tiene > 0 ? 'warn' : '']);
      if (p.vendidas || p.rendido) datos.push(['Vendió', fmtNum.format(p.vendidas) + ' · ' + plata(p.rendido), 'pos']);
      if (p.puso) datos.push(['Puso de su bolsillo', plata(p.puso), '']);
      if (p.aDevolver > 0) datos.push(['Le debemos', plata(p.aDevolver), 'neg']);
      cont.appendChild(el('button', { class: 'card persona', onclick: () => abrirPersona(p.nombre) }, [
        el('strong', { class: 'nombre', text: p.nombre }),
        el('dl', null, datos.flatMap(([k, v, cls]) => [el('dt', { text: k }), el('dd', { class: cls, text: v })]))
      ]));
    });
    $('vPersonas').hidden = ps.length > 0;
  }

  function pintarNombres() {
    const set = new Map();
    D.miembros.forEach((m) => m.nombre && set.set(clave(m.nombre), m.nombre));
    C.personas.forEach((p) => set.set(clave(p.nombre), p.nombre));
    const dl = $('dlNombres'); dl.textContent = '';
    [...set.values()].sort((a, b) => a.localeCompare(b)).forEach((n) => dl.appendChild(el('option', { value: n })));
  }

  /* ---------- pestañas ---------- */
  function mostrarTab(t) {
    tab = t; pref.set('tab', t);
    ['inicio', 'movs', 'personas'].forEach((x) => { $('v-' + x).hidden = x !== t; });
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  }
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => { mostrarTab(b.dataset.tab); scrollTo(0, 0); }));
  document.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.filtro) { filtro = b.dataset.filtro; pintarMovs(); }
    mostrarTab(b.dataset.ir); scrollTo(0, 0);
  }));
  document.querySelectorAll('#filtros .chip').forEach((b) => b.addEventListener('click', () => { filtro = b.dataset.f; pintarMovs(); }));

  /* ---------- hojas (modales) ---------- */
  let hojaAbierta = null;
  function abrirHoja(id) {
    if (hojaAbierta) cerrarHoja(true);
    const h = $(id); hojaAbierta = h; $('velo').hidden = false; h.hidden = false;
    requestAnimationFrame(() => { if (hojaAbierta !== h) return; $('velo').classList.add('on'); h.classList.add('on'); });
    document.body.classList.add('con-hoja');
  }
  function cerrarHoja(rapido) {
    if (!hojaAbierta) return;
    const h = hojaAbierta; hojaAbierta = null;
    h.classList.remove('on'); $('velo').classList.remove('on'); document.body.classList.remove('con-hoja');
    const fin = () => { if (!h.classList.contains('on')) h.hidden = true; if (!hojaAbierta) $('velo').hidden = true; };
    if (rapido) fin(); else setTimeout(fin, 280);
  }
  $('velo').addEventListener('click', () => cerrarHoja());
  document.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', () => cerrarHoja()));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarHoja(); });

  /* ---------- formulario de carga ---------- */
  const FORM = {
    retiro:     { titulo: 'Se llevó empanadas', quien: '¿Quién se las llevó?', cantidad: '¿Cuántas se llevó?', monto: null, ayuda: 'Para saber quién tiene empanadas encima.', detalle: 'Ej: para vender en el trabajo' },
    devolucion: { titulo: 'Devolvió empanadas', quien: '¿Quién las devolvió?', cantidad: '¿Cuántas devolvió?', monto: null, ayuda: 'Empanadas que no vendió y vuelven al depósito.', detalle: 'Ej: le sobraron' },
    rendicion:  { titulo: 'Rindió plata', quien: '¿Quién rinde?', cantidad: '¿Cuántas vendió?', monto: '¿Cuánta plata entregó?', ayuda: 'Plata de las empanadas vendidas que entra a la caja.', detalle: 'Ej: transferencia a la cuenta del grupo' },
    gasto:      { titulo: 'Cargar un gasto', quien: '¿Quién pagó?', cantidad: null, monto: '¿Cuánto salió?', ayuda: 'Carne, tapas, verdura, gas… Si lo pagó de su bolsillo, queda anotado que hay que devolvérselo.', detalle: 'Ej: 5 kg de carne en la carnicería' },
    tanda:      { titulo: 'Hicimos una tanda', quien: null, cantidad: '¿Cuántas salieron?', monto: null, ayuda: 'Empanadas listas que entran al depósito.', detalle: 'Ej: de carne, en lo de Ana' },
    reintegro:  { titulo: 'Le devolvimos plata', quien: '¿A quién?', cantidad: null, monto: '¿Cuánto le devolvimos?', ayuda: 'Plata de la caja que le devolvemos a alguien que puso de su bolsillo.', detalle: 'Ej: por transferencia' }
  };
  let fTipo = 'retiro', fPago = 'bolsillo', montoTocado = false, guardando = false;

  function ponerTipo(t) {
    fTipo = t; const f = FORM[t];
    document.querySelectorAll('#tipos button').forEach((b) => b.classList.toggle('on', b.dataset.tipo === t));
    $('hmTitulo').textContent = f.titulo; $('fAyuda').textContent = f.ayuda;
    $('cQuien').hidden = !f.quien; if (f.quien) $('lQuien').textContent = f.quien;
    $('cCantidad').hidden = !f.cantidad; if (f.cantidad) $('lCantidad').textContent = f.cantidad;
    $('cMonto').hidden = !f.monto; if (f.monto) $('lMonto').textContent = f.monto;
    $('cPago').hidden = t !== 'gasto';
    $('fDetalle').placeholder = f.detalle;
    $('fError').hidden = true;
    sugerirMonto();
  }
  function sugerirMonto() {
    if (fTipo === 'rendicion' && !montoTocado) {
      const n = num($('fCantidad').value);
      $('fMonto').value = n && unidad() ? fmtNum.format(Math.round(n * unidad())) : '';
    }
  }
  function abrirForm(tipo, pre) {
    pre = pre || {};
    $('formMov').reset(); montoTocado = !!pre.monto; guardando = false; $('fGuardar').disabled = false;
    $('fQuien').value = pre.quien != null ? pre.quien : (tipo === 'retiro' || tipo === 'rendicion' || tipo === 'gasto' ? D.yo.nombre : '');
    $('fCantidad').value = pre.cantidad ? String(pre.cantidad) : '';
    $('fMonto').value = pre.monto ? fmtNum.format(pre.monto) : '';
    $('fFecha').value = hoyISO();
    fPago = 'bolsillo'; document.querySelectorAll('#segPago button').forEach((b) => b.classList.toggle('on', b.dataset.pago === fPago));
    ponerTipo(tipo || 'retiro');
    abrirHoja('hojaMov');
  }
  document.querySelectorAll('#tipos button').forEach((b) => b.addEventListener('click', () => ponerTipo(b.dataset.tipo)));
  document.querySelectorAll('[data-nuevo]').forEach((b) => b.addEventListener('click', () => abrirForm(b.dataset.nuevo)));
  $('fab').addEventListener('click', () => abrirForm(tab === 'movs' && filtro === 'plata' ? 'gasto' : 'retiro'));
  document.querySelectorAll('#segPago button').forEach((b) => b.addEventListener('click', () => {
    fPago = b.dataset.pago; document.querySelectorAll('#segPago button').forEach((x) => x.classList.toggle('on', x === b));
  }));
  document.querySelectorAll('[data-paso]').forEach((b) => b.addEventListener('click', () => {
    $('fCantidad').value = String(Math.max(0, num($('fCantidad').value) + Number(b.dataset.paso))); sugerirMonto();
  }));
  document.querySelectorAll('[data-n]').forEach((b) => b.addEventListener('click', () => { $('fCantidad').value = b.dataset.n; sugerirMonto(); }));
  $('fCantidad').addEventListener('input', () => { $('fCantidad').value = $('fCantidad').value.replace(/[^\d]/g, ''); sugerirMonto(); });
  function formatearPesos(inp) { inp.addEventListener('input', () => { const n = num(inp.value); inp.value = n ? fmtNum.format(n) : ''; }); }
  ['fMonto', 'cDocena'].forEach((id) => formatearPesos($(id)));
  $('cDocena').addEventListener('input', pintarUnidad);
  $('fMonto').addEventListener('input', () => { montoTocado = true; });

  function errorForm(t) { $('fError').textContent = t; $('fError').hidden = false; }
  $('formMov').addEventListener('submit', async (e) => {
    e.preventDefault(); if (guardando) return;
    const f = FORM[fTipo];
    const mov = { tipo: fTipo, quien: f.quien ? $('fQuien').value.trim() : '', cantidad: f.cantidad ? num($('fCantidad').value) : 0,
      monto: f.monto ? num($('fMonto').value) : 0, pago: fPago, detalle: $('fDetalle').value.trim(), fecha: $('fFecha').value || hoyISO() };
    if (f.quien && !mov.quien) return errorForm('Falta decir quién.');
    if (fTipo !== 'gasto' && fTipo !== 'reintegro' && fTipo !== 'rendicion' && mov.cantidad < 1) return errorForm('Poné cuántas empanadas.');
    if ((fTipo === 'gasto' || fTipo === 'reintegro') && mov.monto < 1) return errorForm('Poné el monto.');
    if (fTipo === 'rendicion' && mov.monto < 1 && mov.cantidad < 1) return errorForm('Poné cuántas vendió o cuánta plata entregó.');
    if (fTipo === 'retiro' && mov.cantidad > C.deposito && C.producidas > 0 &&
        !confirm('En el depósito figuran ' + C.deposito + ' empanadas y estás cargando ' + mov.cantidad + '. ¿Guardar igual?')) return;
    if (fTipo === 'devolucion' || fTipo === 'rendicion') {
      const p = C.personas.find((x) => clave(x.nombre) === clave(mov.quien));
      const tiene = p ? p.tiene : 0;
      if (mov.cantidad > tiene && !confirm(mov.quien + ' figura con ' + plural(Math.max(0, tiene), 'empanada', 'empanadas') + '. ¿Guardar igual?')) return;
    }
    guardando = true; $('fGuardar').disabled = true; $('fGuardar').textContent = 'Guardando…';
    try {
      const r = await Backend.llamar('addMov', { mov });
      if (!r.ok) { errorForm(msgError(r)); return; }
      setData(r); cerrarHoja();
      toast('Guardado', 'Deshacer', () => borrar(r.id, true));
    } catch (err) {
      errorForm('No hay conexión con el servidor. Revisá la señal y tocá Guardar de nuevo (no se va a duplicar).');
    } finally { guardando = false; $('fGuardar').disabled = false; $('fGuardar').textContent = 'Guardar'; }
  });

  /* ---------- detalle de un movimiento ---------- */
  function abrirMov(m) {
    $('hdTitulo').textContent = TIPOS[m.tipo].nombre;
    const filas = [['Qué', TIPOS[m.tipo].titulo(m)], ['Fecha', fechaLarga(m.fecha)]];
    if (m.quien) filas.push([m.tipo === 'gasto' ? 'Pagó' : 'Quién', m.quien]);
    if (m.cantidad) filas.push(['Empanadas', fmtNum.format(m.cantidad)]);
    if (m.monto) filas.push(['Plata', plata(m.monto)]);
    if (m.tipo === 'gasto') filas.push(['Con qué plata', m.pago === 'caja' ? 'De la caja' : 'De su bolsillo (hay que devolvérselo)']);
    if (m.detalle) filas.push(['Detalle', m.detalle]);
    if (m.cargo) filas.push(['Lo cargó', m.cargo]);
    const cuerpo = $('hdCuerpo'); cuerpo.textContent = '';
    cuerpo.appendChild(el('dl', { class: 'detalle' }, filas.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })])));
    if (m.mio || D.yo.admin) {
      cuerpo.appendChild(el('button', { class: 'btn danger ancho', text: 'Borrar este movimiento', onclick: () => { cerrarHoja(); borrar(m.id); } }));
    } else {
      cuerpo.appendChild(el('p', { class: 'muted', text: 'Si está mal, pedile a ' + (m.cargo || 'quien lo cargó') + ' o a un admin que lo borre.' }));
    }
    abrirHoja('hojaDet');
  }

  async function borrar(id, esDeshacer) {
    try {
      const r = await Backend.llamar('borrarMov', { id });
      if (!r.ok) return toast(msgError(r));
      setData(r);
      if (esDeshacer) toast('Listo, no se guardó.');
      else toast('Borrado', 'Deshacer', () => restaurar(id));
    } catch (e) { toast('Sin conexión. Probá de nuevo.'); }
  }
  async function restaurar(id) {
    try {
      const r = await Backend.llamar('restaurarMov', { id });
      if (!r.ok) return toast(msgError(r));
      setData(r); toast('Recuperado');
    } catch (e) { toast('Sin conexión. Probá de nuevo.'); }
  }

  /* ---------- detalle de una persona ---------- */
  function abrirPersona(nombre) {
    const p = C.personas.find((x) => clave(x.nombre) === clave(nombre)); if (!p) return;
    $('hdTitulo').textContent = p.nombre;
    const cuerpo = $('hdCuerpo'); cuerpo.textContent = '';
    const datos = [['Se llevó', fmtNum.format(p.retiro)], ['Devolvió', fmtNum.format(p.devolucion)], ['Vendió', fmtNum.format(p.vendidas)],
      ['Tiene ahora', plural(Math.max(0, p.tiene), 'empanada', 'empanadas')], ['Rindió', plata(p.rendido)]];
    if (p.puso || p.devuelto) datos.push(['Puso de su bolsillo', plata(p.puso)], ['Ya le devolvimos', plata(p.devuelto)], ['Le debemos', plata(Math.max(0, p.aDevolver))]);
    cuerpo.appendChild(el('dl', { class: 'detalle' }, datos.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })])));
    const acc = el('div', { class: 'botonera' });
    if (p.tiene > 0) {
      acc.appendChild(el('button', { class: 'btn', text: 'Rindió plata', onclick: () => abrirForm('rendicion', { quien: p.nombre, cantidad: p.tiene }) }));
      acc.appendChild(el('button', { class: 'btn sec', text: 'Devolvió', onclick: () => abrirForm('devolucion', { quien: p.nombre, cantidad: p.tiene }) }));
    } else acc.appendChild(el('button', { class: 'btn', text: 'Se llevó empanadas', onclick: () => abrirForm('retiro', { quien: p.nombre }) }));
    if (p.aDevolver > 0) acc.appendChild(el('button', { class: 'btn sec', text: 'Devolverle ' + plata(p.aDevolver), onclick: () => abrirForm('reintegro', { quien: p.nombre, monto: p.aDevolver }) }));
    cuerpo.appendChild(acc);
    cuerpo.appendChild(el('h3', { text: 'Movimientos' }));
    const ul = el('ul', { class: 'list' }); p.movs.forEach((m) => ul.appendChild(filaMov(m))); cuerpo.appendChild(ul);
    abrirHoja('hojaDet');
  }

  /* ---------- resumen para WhatsApp ---------- */
  function resumen() {
    const L = ['*Empanadas · ' + (D.config.nombre || 'Convi') + '*', ''];
    L.push('Llevamos juntado: ' + plata(C.ganancia));
    L.push('Entró ' + plata(C.ingresos) + ' · se gastó ' + plata(C.gastos));
    L.push('En caja: ' + plata(C.caja));
    L.push('Vendidas: ' + fmtNum.format(C.vendidas) + ' · en el depósito: ' + fmtNum.format(C.deposito));
    const tienen = C.personas.filter((p) => p.tiene > 0).sort((a, b) => b.tiene - a.tiene);
    if (tienen.length) { L.push('', '*Tienen empanadas para vender:*'); tienen.forEach((p) => L.push('• ' + p.nombre + ': ' + p.tiene)); }
    const deben = C.personas.filter((p) => p.aDevolver > 0);
    if (deben.length) { L.push('', '*Hay que devolverle plata a:*'); deben.forEach((p) => L.push('• ' + p.nombre + ': ' + plata(p.aDevolver))); }
    return L.join('\n');
  }
  $('btnWhatsapp').addEventListener('click', async () => {
    const t = resumen();
    try { await navigator.clipboard.writeText(t); toast('Copiado. Pegalo en el grupo.'); }
    catch (e) { if (navigator.share) navigator.share({ text: t }).catch(() => {}); else prompt('Copiá este texto:', t); }
  });

  /* ---------- ajustes ---------- */
  function pintarAjustes() {
    $('aYo').textContent = 'Entraste como ' + D.yo.nombre + (D.yo.admin ? ' (admin)' : '') + (Backend.demo ? ' · modo prueba' : '');
    $('cNombre').value = D.config.nombre || ''; $('cDocena').value = D.config.docena ? fmtNum.format(D.config.docena) : '';
    pintarUnidad();
    ['cNombre', 'cDocena'].forEach((id) => { $(id).disabled = !D.yo.admin; });
    $('cGuardar').hidden = !D.yo.admin;
    const ul = $('lMiembros'); ul.textContent = '';
    D.miembros.forEach((m) => ul.appendChild(el('li', { class: 'fila' }, [
      el('span', { class: 'grow' }, [el('strong', { text: m.nombre || '—' }), m.email ? el('span', { class: 'muted chico', text: m.email + (m.admin ? ' · admin' : '') }) : null]),
      D.yo.admin && m.email && m.email !== D.yo.email ? el('button', { class: 'btn mini sec', text: 'Quitar', onclick: () => quitarMiembro(m) }) : null
    ])));
    $('formMiembro').hidden = !D.yo.admin;
  }
  $('btnAjustes').addEventListener('click', () => { pintarAjustes(); abrirHoja('hojaAjustes'); });
  $('formConfig').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = $('cNombre').value.trim(); if (!nombre) return toast('Poné para qué juntamos.');
    try {
      const r = await Backend.llamar('setConfig', { nombre, docena: num($('cDocena').value) });
      if (!r.ok) return toast(msgError(r));
      setData(r); toast('Ajustes guardados');
    } catch (err) { toast('Sin conexión. Probá de nuevo.'); }
  });
  $('formMiembro').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = $('mNombre').value.trim(), email = $('mEmail').value.trim();
    if (!nombre || !email) return toast('Completá nombre y mail.');
    try {
      const r = await Backend.llamar('addMiembro', { nombre, email, admin: $('mAdmin').checked });
      if (!r.ok) return toast(msgError(r));
      $('formMiembro').reset(); setData(r); toast(nombre + ' ya puede entrar');
    } catch (err) { toast('Sin conexión. Probá de nuevo.'); }
  });
  async function quitarMiembro(m) {
    if (!confirm('¿Quitar a ' + m.nombre + '? Ya no va a poder entrar (lo que cargó queda).')) return;
    try {
      const r = await Backend.llamar('quitarMiembro', { email: m.email });
      if (!r.ok) return toast(msgError(r));
      setData(r); toast(m.nombre + ' quitado');
    } catch (err) { toast('Sin conexión. Probá de nuevo.'); }
  }
  document.querySelectorAll('#segTema button').forEach((b) => b.addEventListener('click', () => { pref.set('tema', b.dataset.tema); aplicarTema(); }));
  $('btnSalir').addEventListener('click', () => Backend.salir());
  $('btnRefrescar').addEventListener('click', async () => {
    $('btnRefrescar').classList.add('girando'); await Backend.recargar(); $('btnRefrescar').classList.remove('girando');
  });

  /* ---------- arranque ---------- */
  window.App = { setData, toast, resumen, cuentas: () => C };
  if (Backend.demo) document.body.prepend(el('div', { class: 'banner demo', text: 'Modo prueba: los datos quedan solo en este dispositivo. Para reiniciar, Ajustes → Cerrar sesión.' }));
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();

/* Sky core: location picker + night calculations.
   Shared by the home-page "Tonight" widget and sky-calendar.html.
   Needs Astronomy Engine (global `Astronomy`) loaded first. Everything runs in the browser. */
(function (w, d) {
  'use strict';
  var A = w.Astronomy, B = A.Body;
  var KEY = 'skyLoc';
  var CITIES = [['Prayagraj', 25.435, 81.846], ['Delhi', 28.614, 77.209], ['Mumbai', 19.076, 72.878],
    ['Bengaluru', 12.972, 77.594], ['Chennai', 13.083, 80.271], ['Kolkata', 22.573, 88.364],
    ['Hyderabad', 17.385, 78.487], ['Pune', 18.520, 73.857], ['Ahmedabad', 23.023, 72.571],
    ['Jaipur', 26.912, 75.787], ['Lucknow', 26.847, 80.947], ['Varanasi', 25.318, 82.974],
    ['Bhopal', 23.260, 77.413], ['Guwahati', 26.144, 91.736], ['Thiruvananthapuram', 8.524, 76.937],
    ['Leh', 34.153, 77.578]];
  var SURR = [['City centre', 8], ['Suburb / town', 6], ['Village / rural', 4], ['Remote dark site', 2]];
  var NAK = ['Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra', 'Punarvasu', 'Pushya',
    'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni', 'Hasta', 'Chitra', 'Swati', 'Vishakha',
    'Anuradha', 'Jyeshtha', 'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta',
    'Shatabhisha', 'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati'];
  var RASI = ['Mesha', 'Vrishabha', 'Mithuna', 'Karka', 'Simha', 'Kanya', 'Tula', 'Vrischika',
    'Dhanu', 'Makara', 'Kumbha', 'Meena'];
  var PLANETS = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
  var DARK_SITES = [
    ['Hanle Dark Sky Reserve, Ladakh', 32.78, 78.96, "India's first dark sky reserve, notified Dec 2022"],
    ['Pench Tiger Reserve, Maharashtra', 21.70, 79.25, "India's first DarkSky-certified Dark Sky Park (Jan 2024)"],
    ['Spiti Valley (Kaza), Himachal Pradesh', 32.23, 78.07, 'High, dry and very dark'],
    ['Rann of Kutch (Dhordo), Gujarat', 23.83, 69.65, 'Flat salt desert with wide horizons'],
    ['Kolli Hills, Tamil Nadu', 11.25, 78.34, "Tamil Nadu's first dark sky park (2026)"]];
  var SEE = [[9, 'Moon, planets, the ~50 brightest stars, Orion’s belt, Saptarishi (Big Dipper), Pleiades (barely)'],
    [7, '+ Pleiades clearly, Orion Nebula and Andromeda Galaxy in binoculars'],
    [5, '+ Milky Way faintly overhead, Andromeda Galaxy with the naked eye, Beehive cluster'],
    [3, '+ Milky Way with visible structure, zodiacal light, hundreds of deep-sky objects']];

  /* ---------- helpers ---------- */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function norm(x) { x %= 360; return x < 0 ? x + 360 : x; }
  function ayanamsa(date) { return 23.853 + 0.013972 * (date.getUTCFullYear() + date.getUTCMonth() / 12 - 2000); }
  function at(day, h, m) { var x = new Date(day); x.setHours(h, m || 0, 0, 0); return x; }
  function hm(t, day) {
    if (!t) return '—';
    var s = t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return day && t.getDate() !== day.getDate() ? s + ' (next day)' : s;
  }
  function tm(x) { return x ? x.date : null; }
  function obs(l) { return new A.Observer(l.lat, l.lon, 0); }
  function compass(az) { return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(az / 45) % 8]; }
  function altaz(body, date, o) {
    var eq = A.Equator(body, date, o, true, true);
    return A.Horizon(date, o, eq.ra, eq.dec, 'normal');
  }
  function km(a, b, c, e) {
    var r = Math.PI / 180, dl = (c - a) * r, dn = (e - b) * r;
    var h = Math.pow(Math.sin(dl / 2), 2) + Math.cos(a * r) * Math.cos(c * r) * Math.pow(Math.sin(dn / 2), 2);
    return 12742 * Math.asin(Math.sqrt(h));
  }
  function fmtLat(l) {
    return Math.abs(l.lat).toFixed(2) + '°' + (l.lat >= 0 ? 'N' : 'S') + ', ' +
      Math.abs(l.lon).toFixed(2) + '°' + (l.lon >= 0 ? 'E' : 'W');
  }

  /* ---------- astronomy ---------- */
  function nakshatra(date) {
    return NAK[Math.floor(norm(A.EclipticGeoMoon(date).lon - ayanamsa(date)) / (360 / 27)) % 27];
  }
  function sunRasi(date) { return Math.floor(norm(A.SunPosition(date).elon - ayanamsa(date)) / 30) % 12; }
  function phaseName(p) {
    if (p < 10 || p >= 350) return 'New Moon';
    if (p < 80) return 'Waxing crescent';
    if (p < 100) return 'First quarter';
    if (p < 170) return 'Waxing gibbous';
    if (p < 190) return 'Full Moon';
    if (p < 260) return 'Waning gibbous';
    if (p < 280) return 'Last quarter';
    return 'Waning crescent';
  }

  /* Rise/set, twilight and Moon facts for the night that begins on local calendar `day`. */
  function night(l, day) {
    var o = obs(l), mid = at(day, 0), noon = at(day, 12), eve = at(day, 21);
    var r = {
      sunrise: tm(A.SearchRiseSet(B.Sun, o, +1, mid, 1)),
      sunset: tm(A.SearchRiseSet(B.Sun, o, -1, noon, 1)),
      dusk: tm(A.SearchAltitude(B.Sun, o, -1, noon, 1, -18)),
      moonrise: tm(A.SearchRiseSet(B.Moon, o, +1, mid, 1)),
      moonset: tm(A.SearchRiseSet(B.Moon, o, -1, mid, 1))
    };
    r.dawn = tm(A.SearchAltitude(B.Sun, o, +1, r.dusk || noon, 1, -18));
    if (!r.moonset || (r.moonrise && r.moonset < r.moonrise)) {  // Moon sets after midnight: show that one
      var ms = tm(A.SearchRiseSet(B.Moon, o, -1, r.moonrise || mid, 1));
      if (ms) r.moonset = ms;
    }
    var ph = A.MoonPhase(eve);
    r.illum = A.Illumination(B.Moon, eve).phase_fraction;
    r.phase = phaseName(ph);
    r.paksha = ph < 180 ? 'Shukla paksha (waxing)' : 'Krishna paksha (waning)';
    r.nak = nakshatra(eve);
    return r;
  }

  /* Longest stretch between astronomical dusk and dawn with no bright Moon up (5-min sampling). */
  function darkWindow(l, n) {
    if (!n.dusk || !n.dawn) return null;
    var o = obs(l), step = 5 * 60000, best = null, cur = null, t, up;
    for (t = n.dusk.getTime(); t <= n.dawn.getTime(); t += step) {
      var dt = new Date(t);
      up = A.Illumination(B.Moon, dt).phase_fraction > 0.3 && altaz(B.Moon, dt, o).altitude > 0;
      if (!up) { if (!cur) cur = { a: t, b: t }; else cur.b = t; }
      if (up || t + step > n.dawn.getTime()) {
        if (cur && (!best || cur.b - cur.a > best.b - best.a)) best = cur;
        if (up) cur = null;
      }
    }
    if (!best || best.b - best.a < 30 * 60000) return { none: true };
    return { from: new Date(best.a), to: new Date(Math.min(best.b + step, n.dawn.getTime())),
      afterMoon: best.a > n.dusk.getTime() + step, untilMoon: best.b + step < n.dawn.getTime() };
  }

  function planetsUp(l, n, day) {
    var o = obs(l), t1 = n.sunset ? new Date(n.sunset.getTime() + 90 * 60000) : at(day, 20), t2 = at(day, 24);
    var out = [];
    PLANETS.forEach(function (p) {
      var h1 = altaz(B[p], t1, o), h2 = altaz(B[p], t2, o);
      if (h1.altitude > 10 || h2.altitude > 10) {
        var f = function (h) { return h.altitude > 10 ? Math.round(h.altitude) + '° ' + compass(h.azimuth) : 'low / set'; };
        out.push({ name: p, mag: A.Illumination(B[p], t1).mag, eve: f(h1), mid: f(h2) });
      }
    });
    return out;
  }

  /* ---------- location ---------- */
  function loadLoc() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s && isFinite(s.lat) && isFinite(s.lon)) return s;
    } catch (e) { /* storage blocked: use default */ }
    return { name: 'Prayagraj', lat: 25.435, lon: 81.846, surr: 8, bortle: 8 };
  }
  function saveLoc(l) { try { localStorage.setItem(KEY, JSON.stringify(l)); } catch (e) { /* ignore */ } }

  /* Renders the location panel into `el`; calls onChange(loc) now and after every change. */
  function mountLocation(el, onChange) {
    var loc = loadLoc(), uid = 'sl' + Math.random().toString(36).slice(2, 7);
    function id(s) { return uid + s; }
    el.innerHTML =
      '<p class="sky-loc-line" id="' + id('line') + '" aria-live="polite"></p>' +
      '<div class="sky-loc-row">' +
      '<button type="button" class="btn" id="' + id('geo') + '">📍 Use my location</button>' +
      '<label>City <select id="' + id('city') + '">' + CITIES.map(function (c, i) {
        return '<option value="' + i + '">' + c[0] + '</option>'; }).join('') +
      '<option value="custom">Custom…</option></select></label>' +
      '<span class="sky-custom" id="' + id('cust') + '" hidden>' +
      '<label>Latitude <input type="number" id="' + id('lat') + '" min="-90" max="90" step="0.001"></label>' +
      '<label>Longitude <input type="number" id="' + id('lon') + '" min="-180" max="180" step="0.001"></label>' +
      '<button type="button" class="chip" id="' + id('apply') + '">Apply</button></span>' +
      '<label>Your surroundings <select id="' + id('surr') + '">' + SURR.map(function (s) {
        return '<option value="' + s[1] + '">' + s[0] + '</option>'; }).join('') + '</select></label>' +
      '<label>I know my Bortle class <input type="number" id="' + id('bortle') + '" min="1" max="9" step="1" placeholder="1–9"></label>' +
      '</div><p class="sky-msg" id="' + id('msg') + '" role="status"></p>' +
      '<p class="sky-lpm"><a id="' + id('lpm') + '" target="_blank" rel="noopener">Check your exact light pollution ↗</a></p>';
    var $ = function (s) { return d.getElementById(id(s)); };
    var city = $('city'), cust = $('cust'), surr = $('surr'), bortle = $('bortle'), msg = $('msg');

    function sync() {
      var ci = -1;
      CITIES.forEach(function (c, i) { if (c[0] === loc.name) ci = i; });
      city.value = ci >= 0 ? String(ci) : 'custom';
      cust.hidden = ci >= 0;
      $('lat').value = loc.lat; $('lon').value = loc.lon;
      surr.value = String(loc.surr || 8);
      bortle.value = loc.own || '';
      $('line').innerHTML = 'Showing sky for <strong>' + esc(loc.name) + '</strong> (' + fmtLat(loc) +
        ') · Bortle ≈ ' + loc.bortle;
      $('lpm').href = 'https://www.lightpollutionmap.info/#zoom=9&lat=' + loc.lat.toFixed(3) + '&lon=' + loc.lon.toFixed(3);
    }
    function commit() {
      var own = parseInt(bortle.value, 10);
      loc.own = own >= 1 && own <= 9 ? own : null;
      loc.surr = parseInt(surr.value, 10);
      loc.bortle = loc.own || loc.surr;
      saveLoc(loc); sync(); onChange(loc);
    }
    city.addEventListener('change', function () {
      if (city.value === 'custom') { cust.hidden = false; $('lat').focus(); return; }
      var c = CITIES[+city.value];
      loc.name = c[0]; loc.lat = c[1]; loc.lon = c[2]; msg.textContent = ''; commit();
    });
    $('apply').addEventListener('click', function () {
      var la = parseFloat($('lat').value), lo = parseFloat($('lon').value);
      if (!(la >= -90 && la <= 90 && lo >= -180 && lo <= 180)) { msg.textContent = 'Enter a latitude (−90 to 90) and longitude (−180 to 180).'; return; }
      loc.name = 'Custom location'; loc.lat = la; loc.lon = lo; msg.textContent = ''; commit();
    });
    surr.addEventListener('change', commit);
    bortle.addEventListener('change', commit);
    $('geo').addEventListener('click', function () {
      if (!navigator.geolocation) { msg.textContent = 'Location is not available in this browser; pick a city instead.'; return; }
      msg.textContent = 'Finding your location…';
      navigator.geolocation.getCurrentPosition(function (p) {
        loc.name = 'Your location';
        loc.lat = Math.round(p.coords.latitude * 1000) / 1000;
        loc.lon = Math.round(p.coords.longitude * 1000) / 1000;
        msg.textContent = 'Location found. It stays in this browser only.'; commit();
      }, function () {
        msg.textContent = 'Could not get your location; pick a city or enter coordinates instead.';
      }, { timeout: 10000, maximumAge: 600000 });
    });
    sync(); onChange(loc);
  }

  /* ---------- "Tonight" rendering ---------- */
  function renderTonight(el, l, full) {
    var today = at(new Date(), 0), n = night(l, today), dw = darkWindow(l, n), pl = planetsUp(l, n, today);
    var dark = !dw ? 'The Sun never gets 18° below the horizon tonight, so the sky stays in twilight.'
      : dw.none ? 'Moon-bright night: good for the Moon and planets, poor for faint objects.'
      : 'Best dark sky: <strong>' + hm(dw.from) + ' – ' + hm(dw.to) + '</strong>' +
        (dw.afterMoon ? ' (after moonset)' : dw.untilMoon ? ' (until moonrise)' : '');
    var see = SEE.filter(function (r) { return l.bortle <= r[0]; }).map(function (r) { return '<li>' + r[1] + '</li>'; }).join('');
    var h = '<div class="plan-grid"><div>' +
      '<h3>🌑 Darkness</h3><p>' + dark + '</p>' +
      '<p class="sky-small">Sunset ' + hm(n.sunset) + ' · Astronomical dusk ' + hm(n.dusk) +
      ' · Dawn ' + hm(n.dawn) + '</p>' +
      '<h3>🌙 Moon</h3><p>' + n.phase + ', ' + Math.round(n.illum * 100) + '% lit · ' + n.paksha +
      '<br>Rise ' + hm(n.moonrise, today) + ' · Set ' + hm(n.moonset, today) +
      '<br>Nakshatra tonight: <a href="indian-astronomy.html">' + n.nak + '</a></p></div><div>' +
      '<h3>🪐 Planets up</h3>' + (pl.length ? '<ul class="sky-list">' + pl.map(function (p) {
        return '<li><strong>' + p.name + '</strong> (mag ' + p.mag.toFixed(1) + ') · evening: ' + p.eve +
          ' · midnight: ' + p.mid + '</li>'; }).join('') + '</ul>'
        : '<p>No bright planets higher than 10° this evening.</p>') +
      '<h3>🔭 What your sky can show (Bortle ' + l.bortle + ')</h3><ul class="sky-list">' + see + '</ul></div></div>';
    if (full) {
      var tip = l.bortle >= 7 ? 'Face away from the city’s light dome and use a wall or building to block street lights.'
        : l.bortle >= 4 ? 'On moonless nights use averted vision: look slightly beside a faint object to see it better.'
        : 'Your sky is dark: sweep the Milky Way with binoculars and look for zodiacal light after dusk or before dawn.';
      var sites = DARK_SITES.map(function (s) { return { s: s, k: km(l.lat, l.lon, s[1], s[2]) }; })
        .sort(function (a, b) { return a.k - b.k; }).slice(0, 2);
      h += '<div class="plan-grid"><div><h3>💡 Three tips</h3><ol class="sky-list">' +
        '<li>' + tip + '</li><li>Give your eyes 20 minutes to adapt and use a red torch. <a href="beginners-guide.html">Field Guide</a></li>' +
        '<li>Start from a bright star and hop to fainter ones. <a href="star-hopping.html">Star-hopping tricks</a></li></ol></div>' +
        '<div><h3>🏞️ Nearest dark-sky sites</h3><ul class="sky-list">' + sites.map(function (x) {
          return '<li><strong>' + x.s[0] + '</strong>, ~' + Math.round(x.k / 10) * 10 + ' km · ' + x.s[3] + '</li>'; }).join('') +
        '</ul></div></div>';
    }
    el.innerHTML = h;
  }

  /* Home-page widget: location panel + compact plan. */
  function widget(root) {
    var locEl = root.querySelector('.sky-loc'), out = root.querySelector('.sky-tonight');
    mountLocation(locEl, function (l) { renderTonight(out, l, false); });
  }

  w.SkyCore = { night: night, renderTonight: renderTonight, mountLocation: mountLocation, widget: widget,
    sunRasi: sunRasi, RASI: RASI, obs: obs, altaz: altaz, at: at, hm: hm, esc: esc };
})(window, document);

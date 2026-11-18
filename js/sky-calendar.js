/* Sky Calendar page: month grid, day panel, upcoming list, tonight's plan.
   Needs astronomy.browser.min.js and sky-core.js loaded first. */
(function (w, d) {
  'use strict';
  var A = w.Astronomy, S = w.SkyCore, B = A.Body, DAY = 86400000;
  var TEMPLES = {
    'suryanar-kovil': ['Suryanar Kovil', 'Surya'], thingalur: ['Thingalur', 'Chandra'],
    'vaitheeswaran-koil': ['Vaitheeswaran Koil', 'Mangala'], thiruvenkadu: ['Thiruvenkadu', 'Budha'],
    alangudi: ['Alangudi', 'Guru'], kanjanur: ['Kanjanur', 'Shukra'], thirunallar: ['Thirunallar', 'Shani'],
    thirunageswaram: ['Thirunageswaram', 'Rahu'], keezhaperumpallam: ['Keezhaperumpallam', 'Ketu'],
    konark: ['Konark', 'Surya'], modhera: ['Modhera', 'Surya'],
    'gavi-gangadhareshwara': ['Gavi Gangadhareshwara', 'Makar Sankranti'],
    sringeri: ['Sringeri', 'Rāśi pillars'], 'prayagraj-sangam': ['Prayagraj Sangam', 'Kumbh']
  };
  var PT = { Mars: ['vaitheeswaran-koil'], Mercury: ['thiruvenkadu'], Jupiter: ['alangudi'],
    Venus: ['kanjanur'], Saturn: ['thirunallar'] };
  var ECL = ['thirunageswaram', 'keezhaperumpallam'];
  var SHOWERS = [['Quadrantids', 0, 3], ['Lyrids', 3, 22], ['Eta Aquariids', 4, 6], ['Perseids', 7, 12],
    ['Orionids', 9, 21], ['Leonids', 10, 17], ['Geminids', 11, 14]];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
    'October', 'November', 'December'];
  var loc, view, selected, monthEvents = {};

  function key(t) { return t.getFullYear() + '-' + (t.getMonth() + 1) + '-' + t.getDate(); }
  function dayOf(t) { return S.at(t, 0); }
  function fmtDay(t, long) {
    return t.toLocaleDateString('en-GB', long ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
      : { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function ev(date, type, title, icon, temples) { return { date: date, type: type, title: title, icon: icon, templeIds: temples || [] }; }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  /* All events with start <= date < end, for the current location. */
  function events(start, end) {
    var out = [], o = S.obs(loc), y, t, e, g;
    // Moon quarters
    var Q = [['New Moon (Amavasya)', '🌑'], ['First Quarter', '🌓'],
      ['Full Moon (Purnima)', '🌕'], ['Last Quarter', '🌗']];
    for (var mq = A.SearchMoonQuarter(start); mq.time.date < end; mq = A.NextMoonQuarter(mq)) {
      out.push(ev(mq.time.date, 'moon', Q[mq.quarter][0] + ' at ' + S.hm(mq.time.date), Q[mq.quarter][1],
        mq.quarter % 2 === 0 ? ['thingalur'] : []));
    }
    // Equinoxes & solstices
    for (y = start.getFullYear(); y <= end.getFullYear(); y++) {
      var s = A.Seasons(y), eq = ['modhera', 'konark', 'suryanar-kovil'], so = ['konark', 'suryanar-kovil'];
      [[s.mar_equinox, 'March Equinox', eq], [s.jun_solstice, 'June Solstice', so],
        [s.sep_equinox, 'September Equinox', eq], [s.dec_solstice, 'December Solstice', so]].forEach(function (x) {
        if (x[0].date >= start && x[0].date < end) out.push(ev(x[0].date, 'season', x[1] + ' at ' + S.hm(x[0].date), '☀️', x[2]));
      });
    }
    // Lunar eclipses (penumbral included)
    for (e = A.SearchLunarEclipse(start); e.peak.date < end; e = A.NextLunarEclipse(e.peak)) {
      var up = S.altaz(B.Moon, e.peak.date, o).altitude > 0;
      out.push(ev(e.peak.date, 'eclipse', cap(e.kind) + ' lunar eclipse, peak ' + S.hm(e.peak.date) +
        (up ? ' (Moon above your horizon)' : ' (Moon below your horizon at peak)'), '🌘', ECL));
    }
    // Solar eclipses: global list, checked against the local circumstances
    for (g = A.SearchGlobalSolarEclipse(start); g.peak.date < end; g = A.NextGlobalSolarEclipse(g.peak)) {
      var l = A.SearchLocalSolarEclipse(new Date(g.peak.date.getTime() - DAY), o);
      var vis = Math.abs(l.peak.time.date - g.peak.date) < DAY;
      out.push(ev(vis ? l.peak.time.date : g.peak.date, 'eclipse', vis
        ? cap(l.kind) + ' solar eclipse visible from your location, peak ' + S.hm(l.peak.time.date) +
          ' (' + Math.round(l.obscuration * 100) + '% of the Sun covered). Never look at the Sun without certified eclipse glasses.'
        : cap(g.kind) + ' solar eclipse — not visible from your location', '🌒', ECL.concat(['suryanar-kovil'])));
    }
    // Oppositions of the outer planets (relative longitude 0)
    ['Mars', 'Jupiter', 'Saturn'].forEach(function (p) {
      var at = A.SearchRelativeLongitude(B[p], 0, start);
      if (at.date < end) out.push(ev(at.date, 'planet', p + ' at opposition: best all year', '🪐', PT[p]));
    });
    // Greatest elongations of Mercury & Venus
    ['Mercury', 'Venus'].forEach(function (p) {
      for (var x = A.SearchMaxElongation(B[p], start); x.time.date < end; x = A.SearchMaxElongation(B[p], x.time.AddDays(1))) {
        out.push(ev(x.time.date, 'planet', p + ': greatest ' + (x.visibility === 'evening' ? 'evening' : 'morning') +
          ' elongation (' + Math.round(x.elongation) + '° from the Sun)', '✨', PT[p]));
      }
    });
    // Meteor shower peaks (fixed approximate dates)
    for (y = start.getFullYear(); y <= end.getFullYear(); y++) {
      SHOWERS.forEach(function (m) {
        t = new Date(y, m[1], m[2], 23, 0);
        if (t >= start && t < end) {
          out.push(ev(t, 'meteor', m[0] + ' peak (approx.) · Moon ' +
            Math.round(A.Illumination(B.Moon, t).phase_fraction * 100) + '% lit', '☄️', []));
        }
      });
    }
    // Sankranti: sidereal Sun changes rāśi during the local day
    var prev = S.sunRasi(dayOf(start));
    for (t = dayOf(start); t < end; t = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1)) {
      var next = S.sunRasi(new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1));
      if (next !== prev) {
        var name = S.RASI[next];
        out.push(ev(t, 'sankranti', next === 9 ? 'Makar Sankranti (Sun enters Makara)'
          : name + ' Sankranti (Sun enters ' + name + ')', '🕉️',
          next === 9 ? ['gavi-gangadhareshwara', 'prayagraj-sangam', 'sringeri', 'suryanar-kovil'] : ['sringeri', 'suryanar-kovil']));
      }
      prev = next;
    }
    return out.sort(function (a, b) { return a.date - b.date; });
  }

  function chips(ids) {
    return ids.map(function (id) {
      var t = TEMPLES[id];
      return '<a class="chip" href="celestial-temples.html#' + id + '">🛍 ' + t[0] + ' (' + t[1] + ')</a>';
    }).join(' ');
  }

  /* ---------- month grid ---------- */
  function renderMonth() {
    var first = new Date(view.getFullYear(), view.getMonth(), 1);
    var next = new Date(view.getFullYear(), view.getMonth() + 1, 1);
    var gStart = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
    var cells = Math.ceil((first.getDay() + (next - first) / DAY) / 7) * 7;
    var gEnd = new Date(gStart.getFullYear(), gStart.getMonth(), gStart.getDate() + cells);
    monthEvents = {};
    events(gStart, gEnd).forEach(function (e) { (monthEvents[key(e.date)] = monthEvents[key(e.date)] || []).push(e); });
    d.getElementById('calTitle').textContent = MONTHS[view.getMonth()] + ' ' + view.getFullYear();
    var todayK = key(new Date()), h = '';
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(function (x) { h += '<div class="cal-wd" aria-hidden="true">' + x + '</div>'; });
    for (var i = 0; i < cells; i++) {
      var t = new Date(gStart.getFullYear(), gStart.getMonth(), gStart.getDate() + i), k = key(t), es = monthEvents[k] || [];
      var cls = 'cal-day' + (t.getMonth() !== view.getMonth() ? ' muted' : '') + (k === todayK ? ' today' : '') +
        (selected && k === key(selected) ? ' selected' : '');
      var label = fmtDay(t, true) + (k === todayK ? ', today' : '') + (es.length ? ': ' + es.map(function (e) { return e.title; }).join('; ') : '');
      h += '<button type="button" class="' + cls + '" data-k="' + k + '" data-i="' + i + '" aria-label="' + S.esc(label) + '"' +
        (selected && k === key(selected) ? ' aria-pressed="true"' : ' aria-pressed="false"') + '>' +
        '<span class="cal-n">' + t.getDate() + '</span>' +
        (es.length ? '<span class="cal-ev" aria-hidden="true">' + es.slice(0, 2).map(function (e) { return e.icon; }).join('') +
          (es.length > 2 ? '<small>+' + (es.length - 2) + '</small>' : '') + '</span><span class="cal-dot" aria-hidden="true"></span>' : '') +
        '</button>';
    }
    var grid = d.getElementById('calGrid');
    grid.innerHTML = h;
    grid.dataset.start = gStart.getTime();
  }

  function selectDay(t, focus) {
    selected = dayOf(t);
    if (selected.getMonth() !== view.getMonth() || selected.getFullYear() !== view.getFullYear()) {
      view = new Date(selected.getFullYear(), selected.getMonth(), 1); renderMonth();
    } else {
      [].forEach.call(d.querySelectorAll('.cal-day'), function (b) {
        var on = b.dataset.k === key(selected);
        b.classList.toggle('selected', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    renderDay();
    if (focus) { var b = d.querySelector('.cal-day[data-k="' + key(selected) + '"]'); if (b) b.focus(); }
  }

  function renderDay() {
    var n = S.night(loc, selected), es = monthEvents[key(selected)] || [];
    d.getElementById('dayPanel').innerHTML = '<h3>' + fmtDay(selected, true) + '</h3>' +
      '<div class="plan-grid"><div><p>☀️ Sunrise ' + S.hm(n.sunrise) + ' · Sunset ' + S.hm(n.sunset) +
      '<br>🌌 Astronomical dusk ' + S.hm(n.dusk) + ' · dawn ' + S.hm(n.dawn) + '</p>' +
      '<p>🌙 Moonrise ' + S.hm(n.moonrise, selected) + ' · Moonset ' + S.hm(n.moonset, selected) +
      '<br>' + n.phase + ', ' + Math.round(n.illum * 100) + '% lit · ' + n.paksha +
      '<br>Moon’s Nakshatra (21:00): <a href="indian-astronomy.html">' + n.nak + '</a></p></div><div>' +
      (es.length ? '<ul class="sky-list">' + es.map(function (e) {
        return '<li><span aria-hidden="true">' + e.icon + '</span> ' + S.esc(e.title) +
          (e.templeIds.length ? '<br><span class="chips">' + chips(e.templeIds) + '</span>' : '') + '</li>'; }).join('') + '</ul>'
        : '<p>No special events on this day: a good night for the <a href="seasons.html">seasonal constellations</a>.</p>') +
      '</div></div>';
  }

  function renderUpcoming() {
    var now = new Date(), list = events(now, new Date(now.getTime() + 60 * DAY)).slice(0, 8);
    d.getElementById('upcomingList').innerHTML = list.map(function (e) {
      return '<li><time datetime="' + e.date.toISOString() + '">' + fmtDay(e.date) + '</time> <span aria-hidden="true">' +
        e.icon + '</span> ' + S.esc(e.title) + '</li>'; }).join('') || '<li>No major events found.</li>';
  }

  function all() {
    S.renderTonight(d.getElementById('tonightPlan'), loc, true);
    renderMonth(); renderDay(); renderUpcoming();
  }

  function init() {
    var now = new Date();
    view = new Date(now.getFullYear(), now.getMonth(), 1);
    selected = dayOf(now);
    d.getElementById('calPrev').addEventListener('click', function () { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); renderMonth(); });
    d.getElementById('calNext').addEventListener('click', function () { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); renderMonth(); });
    d.getElementById('calToday').addEventListener('click', function () { selectDay(new Date(), true); });
    var grid = d.getElementById('calGrid');
    grid.addEventListener('click', function (e) {
      var b = e.target.closest('.cal-day');
      if (!b) return;
      var g0 = new Date(+grid.dataset.start);
      selectDay(new Date(g0.getFullYear(), g0.getMonth(), g0.getDate() + +b.dataset.i), true);
    });
    grid.addEventListener('keydown', function (e) {
      var mv = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
      if (!mv || !selected) return;
      e.preventDefault();
      selectDay(new Date(selected.getFullYear(), selected.getMonth(), selected.getDate() + mv), true);
    });
    S.mountLocation(d.getElementById('skyLoc'), function (l) { loc = l; all(); });
    d.getElementById('skyApp').hidden = false;
    var ld = d.getElementById('skyLoading'); if (ld) ld.hidden = true;
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init); else init();
})(window, document);

// globe-analytics.js — Analitik sayfasindaki donen dunya.
//
// Kaynak bilesen React + shadcn + TypeScript icin yazilmisti; bu projede
// React, TypeScript ve build adimi YOK (dogrudan HTML + CDN Tailwind). O
// yuzden ayni gorsel vanilya JS olarak kuruldu: WebGL kuresi cobe'dan
// (bkz. cobe-bundle.js), geri kalan her sey burada.
//
// Kaynak bilesenden BILEREK ayrilan iki nokta:
//  1. Etiket konumu: orijinal CSS Anchor Positioning kullaniyordu
//     (position-anchor / anchor(top)) — bu yalnizca yeni Chromium'da var,
//     Safari/Firefox'ta etiketler hic gorunmezdi. Burada isaretcinin ekran
//     konumu lat/lon + o anki phi/theta'dan hesaplaniyor, her yerde calisir.
//  2. Sayilar UYDURULMUYOR. Orijinal demo her 3 saniyede Math.random ile
//     sayilari oynatip "canli" gorunum veriyordu. Buradaki rakamlar deals
//     tablosundan gelen gercek deal sayilari.
window.NCGlobe = (function () {
  'use strict';

  // Ulke -> [enlem, boylam]. Ilk 80 giris deals.raw->>Country_Name'de
  // GERCEKTEN gecen degerlerden (canli veriden cikarildi); geri kalanlar
  // ileride gelebilecek makul varyantlar. Listede olmayan bir ulke gelirse
  // kureye konmaz ve "haritada yok" olarak raporlanir (bkz. admin.html).
  var COORDS = {
    'Italy': [41.87, 12.56], 'United Kingdom': [55.38, -3.44], 'United States': [39.83, -98.58],
    'Spain': [40.46, -3.75], 'France': [46.23, 2.21], 'Turkey': [38.96, 35.24],
    'Canada': [56.13, -106.35], 'Australia': [-25.27, 133.78], 'Belgium': [50.50, 4.47],
    'Germany': [51.17, 10.45], 'Switzerland': [46.82, 8.23], 'Morocco': [31.79, -7.09],
    'Netherlands': [52.13, 5.29], 'Saudi Arabia': [23.89, 45.08], 'Ireland': [53.41, -8.24],
    'Norway': [60.47, 8.47], 'Denmark': [56.26, 9.50], 'Sweden': [60.13, 18.64],
    'Nigeria': [9.08, 8.68], 'Czech Republic': [49.82, 15.47], 'Israel': [31.05, 34.85],
    'Austria': [47.52, 14.55], 'United Arab Emirates': [23.42, 53.85], 'Malta': [35.94, 14.38],
    'Portugal': [39.40, -8.22], 'New Zealand': [-40.90, 174.89], 'Pakistan': [30.38, 69.35],
    'Slovakia': [48.67, 19.70], 'Luxembourg': [49.82, 6.13], 'Kuwait': [29.31, 47.48],
    'Finland': [61.92, 25.75], 'Indonesia': [-0.79, 113.92], 'Romania': [45.94, 24.97],
    'India': [20.59, 78.96], 'Mali': [17.57, -4.00], 'South Africa': [-30.56, 22.94],
    'Zambia': [-13.13, 27.85], 'Bulgaria': [42.73, 25.49], 'Somalia': [5.15, 46.20],
    'Ukraine': [48.38, 31.17], 'Oman': [21.51, 55.92], 'Belarus': [53.71, 27.95],
    'Latvia': [56.88, 24.60], 'Poland': [51.92, 19.15], 'Togo': [8.62, 0.82],
    'Iceland': [64.96, -19.02], 'Philippines': [12.88, 121.77], 'Mauritius': [-20.35, 57.55],
    'Guinea': [9.95, -9.70], 'Afghanistan': [33.94, 67.71], 'Thailand': [15.87, 100.99],
    'Egypt': [26.82, 30.80], 'Costa Rica': [9.75, -83.75], 'American Samoa': [-14.27, -170.13],
    'Montenegro': [42.71, 19.37], "Cote d'Ivoire": [7.54, -5.55], 'Greece': [39.07, 21.82],
    'Equatorial Guinea': [1.65, 10.27], 'Lithuania': [55.17, 23.88], 'Croatia': [45.10, 15.20],
    'Ghana': [7.95, -1.02], 'Democratic Republic of the Congo': [-4.04, 21.76],
    'Senegal': [14.50, -14.45], 'Myanmar': [21.91, 95.96], 'China': [35.86, 104.20],
    'Dominican Republic': [18.74, -70.16], 'Algeria': [28.03, 1.66], 'Jordan': [30.59, 36.24],
    'Japan': [36.20, 138.25], 'Tunisia': [33.89, 9.54], 'Cyprus': [35.13, 33.43],
    'French Guiana': [3.93, -53.13], 'British Virgin Islands': [18.42, -64.64],
    'Bangladesh': [23.68, 90.36], 'Armenia': [40.07, 45.04], 'Cuba': [21.52, -77.78],
    'Sri Lanka': [7.87, 80.77], 'Brazil': [-14.24, -51.93], 'Lebanon': [33.85, 35.86],
    'Hungary': [47.16, 19.50],
    // Ileride gelebilecek makul varyantlar
    'USA': [39.83, -98.58], 'UK': [55.38, -3.44], 'Russia': [61.52, 105.32],
    'Qatar': [25.35, 51.18], 'Bahrain': [25.93, 50.64], 'Iraq': [33.22, 43.68],
    'Iran': [32.43, 53.69], 'Libya': [26.34, 17.23], 'Kenya': [-0.02, 37.91],
    'Sudan': [12.86, 30.22], 'Syria': [34.80, 39.00], 'Yemen': [15.55, 48.52],
    'Malaysia': [4.21, 101.98], 'Singapore': [1.35, 103.82], 'Mexico': [23.63, -102.55],
    'Argentina': [-38.42, -63.62], 'Chile': [-35.68, -71.54], 'Colombia': [4.57, -74.30],
    'Serbia': [44.02, 21.01], 'Slovenia': [46.15, 14.99], 'Estonia': [58.60, 25.01],
    'Albania': [41.15, 20.17], 'Bosnia and Herzegovina': [43.92, 17.68],
    'North Macedonia': [41.61, 21.75], 'Moldova': [47.41, 28.37], 'Georgia': [42.32, 43.36],
    'Azerbaijan': [40.14, 47.58], 'Kazakhstan': [48.02, 66.92], 'Uzbekistan': [41.38, 64.59],
    'South Korea': [35.91, 127.77], 'Vietnam': [14.06, 108.28], 'Cameroon': [7.37, 12.35],
    'Ethiopia': [9.15, 40.49], 'Tanzania': [-6.37, 34.89], 'Uganda': [1.37, 32.29],
    'Ivory Coast': [7.54, -5.55], 'Angola': [-11.20, 17.87], 'Gambia': [13.44, -15.31],
    'Sierra Leone': [8.46, -11.78], 'Liberia': [6.43, -9.43], 'Burkina Faso': [12.24, -1.56],
    'Niger': [17.61, 8.08], 'Chad': [15.45, 18.73], 'Mauritania': [21.01, -10.94],
    'Benin': [9.31, 2.32], 'Gabon': [-0.80, 11.61], 'Zimbabwe': [-19.02, 29.15],
    'Botswana': [-22.33, 24.68], 'Namibia': [-22.96, 18.49], 'Mozambique': [-18.67, 35.53],
    'Madagascar': [-18.77, 46.87], 'Rwanda': [-1.94, 29.87], 'Nepal': [28.39, 84.12],
    'Taiwan': [23.70, 120.96], 'Hong Kong': [22.32, 114.17], 'Peru': [-9.19, -75.02],
    'Ecuador': [-1.83, -78.18], 'Venezuela': [6.42, -66.59], 'Uruguay': [-32.52, -55.77],
    'Panama': [8.54, -80.78], 'Guatemala': [15.78, -90.23], 'Jamaica': [18.11, -77.30],
    'Trinidad and Tobago': [10.69, -61.22], 'Barbados': [13.19, -59.54],
    'Bahamas': [25.03, -77.40], 'Puerto Rico': [18.22, -66.59]
  };

  // Kita maskesi: 256x128 esdikdortgen (equirectangular), 1-bit, 1.1 KB.
  // cobe kendi WebGL dokusu icin ayni gomulu PNG'i kullaniyor (MIT) —
  // 2D yedekte de AYNI veriyi kullaniyoruz ki WebGL'i olmayan makinede
  // kitalar kaybolmasin, yalnizca cizim yontemi degissin.
  var MAP_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAACAAQAAAADMzoqnAAAAAXNSR0IArs4c6QAABA5JREFUeNrV179uHEUAx/Hf3JpbF+E2VASBsmVKTBcpKJs3SMEDcDwBiVJAAewYEBUivIHT0uUBIt0YCovKD0CRjUC4QfHYh8hYXu+P25vZ2Zm9c66gMd/GJ/tz82d3bk8GN4SrByYF2366FNTACIAkivVAAazQdnf3MvAlbNUQfOPAdQDvSAimMWhwy4I2g4SU+Kp04ISLpPBAKLxPyic3O/CCi+Y7rUJbiodcpDOFY7CgxCEXmdYD2EYK2s5lApOx5pEDDYCUwM1XdJUwBV11QQMg59kePSCaPAASQMEL2hwo6TJFgxpg+TgC2ymXPbuvc40awr3D1QCFfbH9kcoqAOkZozpQo0aqAGQRKCog/+tjkgbNFEtg2FffBvBGlSxHoAaAa1u6X4PBAwDiR8FFsrQgeUhfJTSALaB9jy5NCybJPn1SVFiWk7ywN+KzhH1aKAuydhGkbEF4lWohLXDXavlyFgHY7LBnLRdlAP6BS5Cc8RfVDXbkwN/oIvmY+6obbNeBP0JwTuMGu9gTzy1Q4RS/cWpfzszeYwd+CAFrtBW/Hur0gLbJGlD+/OjVwe/drfBxkbbg63dndEDfiEBlAd7ac0BPe1D6Jd8dfbLH+RI0OzseFB5s01/M+gMdAeluLOCAuaUA9Lezo/vSgXoCX9rtEiXnp7Q1W/CNyWcd8DXoS6jH/YZ5vAJEWY2dXFQe2TUgaFaNejCzJ98g6HnlVrsE58sDcYqg+9XY75fPqdoh/kRQWiXKg8MWlJQxUFMPjqnyujhFBE7UxIMjyszk0QwQlFsezImsyvUYYYVED2pk6m0Tg8T04Fwjk2kdAwSACqlM6gRRt3vQYAFGX0Ah7Ebx1H+MDRI5ui0QldH4j7FGcm90XdxD2Jg1AOEAVAKhEFXSn4cKUELurIAKwJ3MArypPscQaLhJFICJ0ohjDySAdH8AhDtCiTuMycH8CXzhH9jUACAO5uMhoAwA5i+T6WAKmmAqnLy80wxHqIPFYpqCwxGaYLt4Dyievg5kEoVEUAhs6pqKgFtDQYOuaXypaWKQfIuwwoGSZgfLsu/XAtI8cGN+h7Cc1A5oLOMhwlIPXuhu48AIvsSBkvtV9wsJRKCyYLfq5lTrQMFd1a262oqBck9K1V0YjQg0iEYYgpS1A9GlXQV5cykwm4A7BzVsxQqo7E+zCegO7Ma7yKgsuOcfKbMBwLC8wvVNYDsANYalEpOAa6zpWjTeMKGwEwC1CiQewJc5EKfgy7GmRAZA4vUVGwE2dPM/g0xuAInE/yG5aZ8ISxWGfYigUVbdyBElTHh2uCwGdfCkOLGgQVBh3Ewp+/QK4CDlR5Ws/Zf7yhCf8pH7vinWAvoVCQ6zz0NX5V/6GkAVV+2/5qsJ/gU8bsxpM8IeAQAAAABJRU5ErkJggg==';

  var LOWER = {};
  for (var k in COORDS) LOWER[k.toLowerCase()] = COORDS[k];

  function coordsFor(name) {
    if (!name) return null;
    var key = String(name).replace(/\s+/g, ' ').trim();
    return COORDS[key] || LOWER[key.toLowerCase()] || null;
  }

  // lat/lon -> ekran ofseti. cobe'da phi kürenin dikey eksen etrafındaki
  // dönüşü, theta eğim. phi=0 iken 0. boylam ekranın ortasında.
  function project(lat, lon, phi, theta, r) {
    var la = lat * Math.PI / 180;
    var lo = lon * Math.PI / 180 - phi + Math.PI;
    var x = Math.cos(la) * Math.sin(lo);
    var y0 = Math.sin(la);
    var z0 = Math.cos(la) * Math.cos(lo);
    var y = y0 * Math.cos(theta) - z0 * Math.sin(theta);
    var z = y0 * Math.sin(theta) + z0 * Math.cos(theta);
    return { x: x * r, y: -y * r, facing: z };
  }

  // ── Kita maskesini bir kez coz: [{lat,lon}] listesi ─────────────────
  // Her karede maske pikseli okumak pahali; kara noktalari bir kez cikarilip
  // saklaniyor, sonra yalnizca izdusum + cizim yapiliyor.
  // Kita maskesini bir kez yukle. Nokta listesi cikarmiyoruz: 2D yedek artik
  // DUZ HARITA ciziyor ve maskeyi dogrudan drawImage ile olcekliyor.
  //
  // Onceki deneme kureyi 2D'de nokta nokta yeniden ciziyordu. Sonuc
  // olculdu ve ekran goruntusuyle bakildi: kutuplarda es merkezli halkalar,
  // limbde sikisma, ortada bosluk — cografya yerine gurultu gibi duruyordu
  // (esdikdortgen izgaranin izdusum kusuru; cos ile duzeltmek yetmedi).
  // Duz harita hem gercek kitalari kusursuz verir hem de izdusum kusuru
  // barindirmaz; ustelik donmedigi icin rAF'a hic ihtiyaci yok — arka plan
  // sekmesinde/dusuk guc modunda rAF kisilsa bile bos kalmaz.
  // #rrggbb -> [r,g,b]
  function hexRGB(h) {
    var n = parseInt(String(h).replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  var _landImgPromise = null;
  function loadLandImage() {
    if (_landImgPromise) return _landImgPromise;
    _landImgPromise = new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = MAP_URI;
    });
    return _landImgPromise;
  }
  var _webglOk = null;
  function webglOk() {
    // Sonuc onbellege alinir: her mount'ta bir deneme baglami acip kapatmak
    // gereksiz, bazi surucularde de maliyetli.
    if (_webglOk !== null) return _webglOk;
    _webglOk = _probeWebgl();
    return _webglOk;
  }
  function _probeWebgl() {
    try {
      var c = document.createElement('canvas');
      var gl = c.getContext('webgl', { failIfMajorPerformanceCaveat: false }) ||
               c.getContext('experimental-webgl');
      if (!gl) return false;
      // Shader derleyebiliyor mu? Baglam var ama derleme yoksa cobe patlar.
      var sh = gl.createShader(gl.FRAGMENT_SHADER);
      if (!sh) return false;
      gl.shaderSource(sh, 'void main(){gl_FragColor=vec4(1.0);}');
      gl.compileShader(sh);
      var ok = !!gl.getShaderParameter(sh, gl.COMPILE_STATUS);
      var lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      return ok;
    } catch (e) { return false; }
  }

  // markers: [{ label, value, location:[lat,lon] }] — degere gore SIRALI gelmeli
  function mount(host, opts) {
    opts = opts || {};
    if (!host) return null;
    var fail = function (msg) {
      host.innerHTML = '<div class="ng-fallback"></div>';
      host.firstChild.textContent = msg;
      return null;
    };
    // createGlobe yoksa BURADA HATA VERILMEZ: 2D yedek devreye giriyor
    // (bkz. init2D). Eskiden burada "yuklenemedi" yaziyordu.
    var markers = (opts.markers || []).filter(function (m) { return m.location; });
    if (!markers.length) return fail(opts.emptyText || 'Ülke verisi yok.');

    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    host.innerHTML = '<canvas class="ng-canvas"></canvas><div class="ng-labels"></div>';
    var canvas = host.querySelector('.ng-canvas');
    var labelHost = host.querySelector('.ng-labels');

    // Etiket yalnizca en buyuk N ulke icin — 80 etiket kureyi okunamaz yapar
    var labelled = markers.slice(0, opts.labelCount || 6);
    labelled.forEach(function (m) {
      var el = document.createElement('div');
      el.className = 'ng-label';
      var a = document.createElement('span'); a.className = 'ng-label-name'; a.textContent = m.label;
      var b = document.createElement('span'); b.className = 'ng-label-val'; b.textContent = m.value;
      el.appendChild(a); el.appendChild(b);
      labelHost.appendChild(el);
      m._el = el;
    });

    var globe = null, ro = null, destroyed = false, size = 0;
    var spin = 0, theta0 = 0.22;
    var dragPhi = 0, dragTheta = 0, basePhi = 0, baseTheta = 0;
    var pointer = null, paused = false;
    var speed = opts.speed != null ? opts.speed : 0.0025;
    var maxV = markers[0].value || 1;

    var mode = '';        // 'gl' | '2d'
    var raf2d = 0, frames = 0, landCount = -1;
    var _draw = null, _ro2 = null;   // init2D icindeki draw2D'e mount kapsamindan erisim

    function init() {
      var width = canvas.offsetWidth;
      if (!width || globe || mode === '2d' || destroyed) return;
      size = width;
      // WebGL yok/bozuksa hic denemeden 2D'ye gec — hata mesaji yerine
      // calisan bir kure. (Bazi kullanicilarda WebGL hic acilmiyor.)
      if (typeof window.createGlobe !== 'function' || !webglOk()) return init2D();
      try {
        globe = window.createGlobe(canvas, {
          devicePixelRatio: Math.min(window.devicePixelRatio || 1, 2),
          width: width, height: width,
          phi: 0, theta: theta0,
          // cobe KENDI render dongusunu surer ve her karede onRender'i cagirir;
          // durum nesnesi degistirilerek donus verilir. Kaynak React bileseni
          // `globe.update({phi, theta})` cagiriyordu — cobe 0.6.3'te boyle bir
          // metot YOK (donen nesne Phenomenon: yalnizca destroy). Oyle
          // birakilsa kure hic donmezdi; olculdu:
          // "globe.update is not a function".
          onRender: function (state) {
            if (destroyed) return;
            frames++;
            if (!paused) spin += speed;
            var p = spin + basePhi + dragPhi;
            var t = theta0 + baseTheta + dragTheta;
            state.phi = p;
            state.theta = t;
            // Kap yeniden boyutlanirsa (pencere/duzen) olcuyu tasi
            state.width = size;
            state.height = size;
            positionLabels(p, t);
          },
          dark: dark ? 1 : 0,
          diffuse: dark ? 1.2 : 1.5,
          mapSamples: 16000,
          mapBrightness: dark ? 5 : 9,
          baseColor: dark ? [0.24, 0.28, 0.36] : [1, 1, 1],
          markerColor: [0.05, 0.75, 0.68],
          glowColor: dark ? [0.15, 0.19, 0.27] : [0.87, 0.92, 0.96],
          markerElevation: 0,
          opacity: 0.92,
          markers: markers.map(function (m) {
            // Karekok ile olcek: dogrusal olsa Italy (351) digerlerini ezip
            // nokta yerine leke oluyordu.
            var rel = Math.sqrt(m.value / maxV);
            return { location: m.location, size: 0.016 + rel * 0.042 };
          })
        });
      } catch (e) {
        // cobe/phenomenon patladi (surucu, shader, bellek). Yine 2D'ye gec.
        globe = null;
        return init2D();
      }
      mode = 'gl';
      // Baglam sonradan da kaybolabiliyor (surucu resetleri, sekme uyandirma).
      // O anda ekranda donmus bir kure kalirdi; 2D'ye devrediyoruz.
      canvas.addEventListener('webglcontextlost', function (ev) {
        ev.preventDefault();
        if (destroyed || mode !== 'gl') return;
        if (globe) { try { globe.destroy(); } catch (e2) {} globe = null; }
        mode = '';
        init2D();
      }, { once: true });
      requestAnimationFrame(function () { canvas.style.opacity = '1'; });
    }

    // ── 2D YEDEK ────────────────────────────────────────────────────────
    // WebGL yoksa kullaniciya hata yazmak yerine ayni kureyi canvas 2D ile
    // ciziyoruz: AYNI kita maskesi (cobe'un gomulu PNG'si), ayni isaretciler,
    // ayni surukle-dondur, ayni etiketler. Gorunum biraz daha yalin ama
    // sayfa herkeste calisiyor ve veri okunabiliyor.
    // ── 2D YEDEK: DUZ DUNYA HARITASI ────────────────────────────────────
    // WebGL yoksa kullaniciya hata yazmak YERINE ayni veriyi calisan bir
    // gorunumle veriyoruz: cobe'un gomulu kita maskesi olceklenip ciziliyor,
    // isaretciler ayni deal sayilariyla ayni yerlere konuyor.
    // Donmuyor: donme WebGL kuresinin marifeti, burada okunurluk daha onemli.
    function init2D() {
      if (destroyed || mode === '2d') return;
      mode = '2d';
      // Bir canvas'a IKI TUR baglam alinamaz: uzerinde WebGL kullanildiysa
      // getContext('2d') null doner. WebGL'den 2D'ye dusuldugunde (baglam
      // kaybi ya da cobe hatasi) bu yuzden hata yazisi cikiyordu — olculdu.
      // Cozum: canvas dugumunu TAZESIYLE degistir.
      var fresh = document.createElement('canvas');
      fresh.className = canvas.className;
      fresh.style.cssText = canvas.style.cssText;
      canvas.parentNode.replaceChild(fresh, canvas);
      canvas = fresh;                    // kapanislar bu degiskeni okuyor
      var ctx = canvas.getContext('2d');
      if (!ctx) return fail(opts.errorText || 'Dünya görünümü yüklenemedi.');
      host.classList.add('ng-flat');          // en-boy 2:1'e gecer (CSS)
      canvas.style.cursor = 'default';         // suruklenecek bir sey yok
      var landImg = null;
      loadLandImage().then(function (img) {
        landImg = img;
        landCount = img ? 1 : 0;
        draw2D();                              // goruntu gelince HEMEN ciz
      });

      var C = dark
        ? { sea: '#1d2637', land: '#8fb0d6', marker: '#2dd4bf', ring: 'rgba(45,212,191,0.28)', grid: 'rgba(255,255,255,0.05)' }
        : { sea: '#e9f0fa', land: '#5b7ea8', marker: '#0d9488', ring: 'rgba(13,148,136,0.22)', grid: 'rgba(23,43,99,0.05)' };

      // Maskeyi tek renge boya. Maske 1-bit GRI TONLAMA: kara beyaz, deniz
      // siyah ve ALFA KANALI YOK.
      // DIKKAT: burada 'source-in' KULLANILAMAZ — o mevcut icerigin ALFA'sina
      // bakiyor, alfa da her yerde 255 oldugu icin tum dikdortgen kara rengine
      // boyaniyordu (olculdu: ekran goruntusunde deniz hic gorunmedi).
      // Dogrusu: alfayi PARLAKLIKTAN uretmek.
      var tinted = null;
      function tintedMask() {
        if (tinted || !landImg) return tinted;
        var t = document.createElement('canvas');
        t.width = landImg.width; t.height = landImg.height;
        var tc = t.getContext('2d');
        tc.drawImage(landImg, 0, 0);
        var id, rgb = hexRGB(C.land);
        try { id = tc.getImageData(0, 0, t.width, t.height); } catch (e) { return null; }
        var d = id.data;
        for (var i = 0; i < d.length; i += 4) {
          var isLand = d[i] > 100;               // beyaz = kara
          d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2];
          d[i + 3] = isLand ? 255 : 0;
        }
        tc.putImageData(id, 0, 0);
        tinted = t;
        return tinted;
      }

      _draw = draw2D;
      function draw2D() {
        if (destroyed || mode !== '2d') return;
        var w = canvas.offsetWidth;
        if (!w) return;
        frames++;
        size = w;
        var h = Math.round(w / 2);
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);

        // Deniz
        ctx.fillStyle = C.sea;
        ctx.fillRect(0, 0, w, h);

        // Ekvator + baslangic meridyeni: haritanin yonunu belli eder
        ctx.strokeStyle = C.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2);
        ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h);
        ctx.stroke();

        // Kitalar — nearest-neighbour: 256x128 maske buyutulurken bulaniklasip
        // kiyilar erimesin diye yumusatma KAPALI.
        var tm = tintedMask();
        if (tm) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(tm, 0, 0, w, h);
          ctx.imageSmoothingEnabled = true;
        }

        // Isaretciler: kucukten buyuge, buyukler ustte kalsin
        for (var j = markers.length - 1; j >= 0; j--) {
          var m = markers[j];
          var xy = flatXY(m.location[0], m.location[1], w, h);
          var rel = Math.sqrt(m.value / maxV);
          var rad = Math.max(2.5, (0.05 + rel * 0.16) * (h / 6));
          ctx.beginPath(); ctx.arc(xy.x, xy.y, rad * 2.1, 0, Math.PI * 2);
          ctx.fillStyle = C.ring; ctx.fill();
          ctx.beginPath(); ctx.arc(xy.x, xy.y, rad, 0, Math.PI * 2);
          ctx.fillStyle = C.marker; ctx.fill();
        }
        positionLabelsFlat(w, h);
      }
      draw2D();
      // Kap yeniden boyutlandiginda tekrar ciz (donme yok, dolayisiyla dongu yok)
      if (typeof ResizeObserver === 'function') {
        var ro2 = new ResizeObserver(function () { draw2D(); });
        ro2.observe(canvas);
        _ro2 = ro2;
      }
      requestAnimationFrame(function () { canvas.style.opacity = '1'; });
    }

    // KURE (WebGL) modunda etiket konumu: isaretcinin gercek ekran yeri,
    // arka yuze gecince soluyor. Orijinal bilesen bunu CSS Anchor
    // Positioning ile yapiyordu (Safari/Firefox'ta hic gorunmezdi).
    function positionLabels(p, t) {
      var w = canvas.offsetWidth;
      if (!w) return;
      var r = w / 2;
      for (var i = 0; i < labelled.length; i++) {
        var m = labelled[i];
        var pr = project(m.location[0], m.location[1], p, t, r * 0.9);
        var vis = pr.facing <= 0.14 ? 0 : Math.min(1, (pr.facing - 0.14) / 0.28);
        var el = m._el;
        el.style.transform = 'translate(' + (r + pr.x).toFixed(1) + 'px,' +
          (r + pr.y).toFixed(1) + 'px) translate(-50%,-150%)';
        el.style.opacity = vis.toFixed(3);
        el.style.filter = vis > 0.98 ? 'none' : 'blur(' + ((1 - vis) * 5).toFixed(2) + 'px)';
      }
    }

    // Duz haritada enlem/boylam -> piksel
    function flatXY(lat, lon, w, h) {
      return { x: (lon + 180) / 360 * w, y: (90 - lat) / 180 * h };
    }

    // Duz haritada etiketler: hepsi gorunur, arka yuz kavrami yok
    function positionLabelsFlat(w, h) {
      for (var i = 0; i < labelled.length; i++) {
        var m = labelled[i];
        var xy = flatXY(m.location[0], m.location[1], w, h);
        var el = m._el;
        // Ardisik etiketleri dikeyde kaydir — Avrupa'da 3-4 ulke yan yana
        // dusunce ustuste biniyor ve isimler okunmuyordu.
        var lift = (i % 2 === 0) ? -150 : 40;
        el.style.transform = 'translate(' + xy.x.toFixed(1) + 'px,' + xy.y.toFixed(1) +
          'px) translate(-50%,' + lift + '%)';
        el.style.opacity = '1';
        el.style.filter = 'none';
      }
    }

    canvas.addEventListener('pointerdown', function (e) {
      pointer = { x: e.clientX, y: e.clientY };
      canvas.style.cursor = 'grabbing';
      paused = true;
    });
    function onMove(e) {
      if (!pointer) return;
      dragPhi = (e.clientX - pointer.x) / 300;
      dragTheta = (e.clientY - pointer.y) / 1000;
    }
    function onUp() {
      if (pointer) { basePhi += dragPhi; baseTheta += dragTheta; dragPhi = 0; dragTheta = 0; }
      pointer = null;
      canvas.style.cursor = 'grab';
      paused = false;
    }
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });

    if (canvas.offsetWidth > 0) init();
    else {
      ro = new ResizeObserver(function (es) {
        if (es[0] && es[0].contentRect.width > 0) { ro.disconnect(); ro = null; init(); }
      });
      ro.observe(canvas);
    }

    return {
      // Kure GERCEKTEN kuruldu mu? Cagiran, veri imzasi ayni diye yeniden
      // kurmayi atlarken buna bakmali: gorunum gizliyken (offsetWidth 0)
      // mount edilirse ResizeObserver yoluna dusuyor ve o an calismiyor.
      isRunning: function () { return !destroyed && (!!globe || mode === '2d'); },
      mode: function () { return mode; },
      // Disaridan tek kare cizdirmek icin (2D yolunda; gl yolunda cobe surer)
      redraw: function () { if (mode === '2d' && _draw) _draw(); },
      // Destek icin: "bende gorunmuyor" durumunda hangi yolun secildigi,
      // kac kare cizildigi ve kita maskesinin cozulup cozulmedigi.
      debug: function () {
        return { mode: mode, frames: frames, landLoaded: landCount === 1,
                 webgl: webglOk(), cobe: typeof window.createGlobe === 'function' };
      },
      destroy: function () {
        destroyed = true;
        if (raf2d) cancelAnimationFrame(raf2d);
        if (_ro2) { _ro2.disconnect(); _ro2 = null; }
        if (ro) ro.disconnect();
        if (globe) { try { globe.destroy(); } catch (e) {} }
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      }
    };
  }

  return { mount: mount, coordsFor: coordsFor, COORDS: COORDS };
})();

# Liquid Glass — birebir kopya promptu (renk + hareket + bileşenler)

Bu dosyanın tamamını bir AI asistanına kopyala-yapıştır.

Önceki sürüm sadece "tasarım hissini" anlatıyordu ve bu yetersiz kaldı —
bir AI, "menü geçişi" veya "takvim açılımı" gibi ifadeleri kendi yorumuyla
dolduruyor ve sonuç bizimkinden farklı çıkıyor. Bu sürüm gerçek çalışan
kodun **davranışını adım adım** anlatıyor: hangi öğe neyi dinliyor, ne
zaman hangi animasyon oynuyor, gösterge nasıl hesaplanıyor. Renk kodları
da uydurma değil — çalışan sistemden.

---

## PROMPT BAŞLANGICI — buradan aşağısını kopyala

Projemin arayüzünü, aşağıda tarif ettiğim "Liquid Glass" sistemine **birebir**
taşımanı istiyorum. Bu bir ilham metni değil — bir davranış ve değer
şartnamesi. Her sayı, her geçiş süresi, her mekanizma burada olduğu gibi
uygulanmalı. Kendi yorumunla "benzer bir şey" yapma; burada yazılanın
dışına çıkma.

### MUTLAK KURAL: yalnızca görünüm

- **HİÇBİR** veri akışına, iş mantığına, API çağrısına, state yönetimine,
  hesaplamaya, fonksiyon davranışına dokunma.
- HTML yapısını değiştirme: eleman ekleme/çıkarma/taşıma, class veya id
  değiştirme, event bağlarını elleme — hiçbiri yok. (Aşağıdaki bazı
  bileşenler — kayan gösterge, özel açılır liste, takvim — küçük yeni DOM
  elemanları JS ile kendi kendine ekliyor; bu istisna, çünkü mevcut hiçbir
  şeyi bozmuyor, sadece üstüne ekliyor.)
- Metin içeriğini değiştirme, çeviri yapma, etiket adlarını "düzeltme".
- Mevcut temayı **silme**. Yeni görünüm bir tema niteliğinin altına yazılsın,
  kullanıcı eski haline dönebilmeli.
- Bir şeyi düzeltmek için mantığa dokunmak gerekiyorsa **dokunma, bana söyle**.

### Mimari

Üç ayrı dosya:

1. **`liquid-glass.css`** — açık tema, tüm kurallar `html[data-theme="light"]`
   ile başlar.
2. **`liquid-glass-dark.css`** — koyu tema, tüm kurallar
   `html[data-theme="dark"]` ile başlar.
3. **`liquid-ui.js`** — saf JavaScript, framework yok. Üç şey yapar:
   (a) native `<select>` elemanlarını özel açılır listelere sarar,
   (b) sekme/menü gruplarına kayan bir "gösterge" (indicator) ekler,
   (c) ikisini de yeni DOM'a otomatik uygular (MutationObserver ile).

`<head>` içine, **mevcut stil dosyalarından SONRA**:

```html
<link rel="stylesheet" href="liquid-glass.css">
<link rel="stylesheet" href="liquid-glass-dark.css">
<script>
  // Tema İLK BOYAMADAN ÖNCE uygulanmalı, yoksa yanlış temada bir kare
  // görünüp gözle fark edilen bir "flaş" oluşuyor.
  (function () {
    var saved = localStorage.getItem('app_theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
  })();
</script>
<script src="liquid-ui.js"></script>
```

Varsayılan **açık** tema.

---

## 1. Zemin

Cam ancak arkasında kıracak renk varsa cam gibi durur. Zemin canlı bir
"mesh gradient": ekran boyutunda, uçları tamamen saydamlaşarak eriyen
dairesel lekeler, birbirine karışacak kadar büyük.

```css
html[data-theme="light"] { background: #cfdcfa; }
html[data-theme="light"] body {
  background:
    radial-gradient(1250px 900px at 6%   0%,  rgba(37, 99, 235, 0.55),  transparent 62%),
    radial-gradient(1050px 820px at 97%  4%,  rgba(139, 92, 246, 0.52), transparent 60%),
    radial-gradient(1150px 900px at 92% 70%,  rgba(13, 148, 136, 0.48), transparent 62%),
    radial-gradient(980px  820px at 2%   72%, rgba(79, 70, 229, 0.44),  transparent 60%),
    radial-gradient(900px  760px at 44%  36%, rgba(56, 189, 248, 0.34), transparent 64%),
    radial-gradient(760px  640px at 62%  98%, rgba(236, 72, 153, 0.18), transparent 62%),
    linear-gradient(158deg, #d3e1fb 0%, #d6d9fa 46%, #cfe9f2 100%) !important;
  background-repeat: no-repeat !important;
  background-size: 100% 100% !important;
  color: var(--ink);
}
html[data-theme="dark"] { background: #070b14; }
html[data-theme="dark"] body {
  background:
    radial-gradient(1250px 900px at 6%   0%,  rgba(37, 99, 235, 0.30),  transparent 60%),
    radial-gradient(1050px 820px at 97%  4%,  rgba(139, 92, 246, 0.26), transparent 58%),
    radial-gradient(1150px 900px at 92% 70%,  rgba(13, 148, 136, 0.24), transparent 60%),
    radial-gradient(980px  820px at 2%   72%, rgba(79, 70, 229, 0.22),  transparent 58%),
    radial-gradient(900px  760px at 44%  36%, rgba(56, 189, 248, 0.14), transparent 62%),
    linear-gradient(158deg, #0a1020 0%, #080d1a 46%, #0a0f1e 100%) !important;
  background-repeat: no-repeat !important;
  background-size: 100% 100% !important;
  color: var(--d-ink);
}
```

**`background-attachment: fixed` KULLANMA** — çok katmanlı gradient bazı
motorlarda onunla hiç boyanmıyor, zemin beyaz kalıyor, efekt ölüyor.

---

## 2. Tasarım değişkenleri

```css
html[data-theme="light"] {
  --g-1: rgba(255, 255, 255, 0.40);   /* ana paneller */
  --g-2: rgba(255, 255, 255, 0.26);   /* iç/ikincil yüzeyler */
  --g-3: rgba(255, 255, 255, 0.58);   /* input, öne çıkan yüzey */
  --g-hover: rgba(255, 255, 255, 0.62);

  --edge: rgba(255, 255, 255, 0.55);
  --edge-soft: rgba(255, 255, 255, 0.32);

  --sheen: inset 0 1px 0 0 rgba(255, 255, 255, 0.85),
           inset 0 0 0 1px rgba(255, 255, 255, 0.20),
           inset 0 -1px 0 0 rgba(255, 255, 255, 0.12);

  --sh-1: 0 2px 8px  rgba(23, 43, 99, 0.06), 0 8px  28px       rgba(23, 43, 99, 0.10);
  --sh-2: 0 4px 14px rgba(23, 43, 99, 0.08), 0 18px 50px -10px rgba(23, 43, 99, 0.18);
  --sh-3: 0 8px 24px rgba(23, 43, 99, 0.12), 0 32px 80px -16px rgba(23, 43, 99, 0.30);

  --blur: 30px;
  --sat: 190%;

  --ink:   #12141a;
  --ink-2: #4b5364;
  --ink-3: #7c8496;

  --accent:   #0d9488;
  --accent-2: #2563eb;

  --r-lg: 26px;  --r-md: 20px;  --r-sm: 14px;

  --ease:   cubic-bezier(.22, 1, .36, 1);
  --spring: cubic-bezier(.34, 1.4, .56, 1);
}
html[data-theme="dark"] {
  --d-1: rgba(255, 255, 255, 0.062);
  --d-2: rgba(255, 255, 255, 0.038);
  --d-3: rgba(255, 255, 255, 0.085);
  --d-hover: rgba(255, 255, 255, 0.13);
  --d-strong: rgba(20, 26, 42, 0.78);

  --d-edge: rgba(255, 255, 255, 0.16);
  --d-edge-soft: rgba(255, 255, 255, 0.09);

  --d-sheen: inset 0 1px 0 0 rgba(255, 255, 255, 0.14),
             inset 0 0 0 1px rgba(255, 255, 255, 0.04);

  --d-sh-1: 0 2px  10px rgba(0, 0, 0, 0.40), 0 10px 32px       rgba(0, 0, 0, 0.32);
  --d-sh-2: 0 6px  18px rgba(0, 0, 0, 0.46), 0 20px 56px -12px rgba(0, 0, 0, 0.55);
  --d-sh-3: 0 10px 28px rgba(0, 0, 0, 0.52), 0 36px 88px -18px rgba(0, 0, 0, 0.70);

  --d-blur: 30px;
  --d-sat: 175%;

  --d-ink:   #f2f5fa;
  --d-ink-2: #a9b4c8;
  --d-ink-3: #78849c;
  --d-sel: rgba(255, 255, 255, 0.155);

  --d-r-lg: 26px;  --d-r-md: 20px;  --d-r-sm: 14px;
  --d-ease:   cubic-bezier(.22, 1, .36, 1);
  --d-spring: cubic-bezier(.34, 1.4, .56, 1);
}
```

Koyu tema formülü tersine döner: açıkta beyazın saydamı, koyuda karanlığın
üstüne serilmiş çok ince bir ışık tabakası. Koyu temada mevcut renk dilini
(varsa) yeniden eşlemeye çalışma — sadece zeminleri camlaştır.

---

## 3. Panel / kart / modal — temel reçete

```css
html[data-theme="light"] .panel {
  background: var(--g-1);
  -webkit-backdrop-filter: blur(var(--blur)) saturate(var(--sat));
  backdrop-filter: blur(var(--blur)) saturate(var(--sat));
  border: 1px solid var(--edge-soft);
  border-radius: var(--r-lg);
  box-shadow: var(--sh-1), var(--sheen);
}
/* İç yüzeyler (kart içindeki kart) daha az opak — "cam üstünde cam" hissi */
html[data-theme="light"] .inner-card {
  background: var(--g-2);
  border: 1px solid var(--edge-soft);
  border-radius: var(--r-sm);
  box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.6);
}
```

**Kartların hover davranışı** (liste/kanban kartları): yukarı kalkma +
hafif büyüme + gölge artışı, yay eğrisiyle:

```css
html[data-theme="light"] .kart {
  transition: transform .28s var(--spring), background .25s var(--ease), box-shadow .25s var(--ease);
}
html[data-theme="light"] .kart:hover {
  background: var(--g-hover);
  transform: translateY(-3px) scale(1.012);
  box-shadow: var(--sh-2);
  border-color: var(--edge);
}
```

### Modal

```css
html[data-theme="light"] .modal-bg {
  background: rgba(18, 26, 48, 0.22);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
  backdrop-filter: blur(14px) saturate(140%);
}
html[data-theme="light"] .modal-box {
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.52);
  -webkit-backdrop-filter: blur(44px) saturate(200%);
  backdrop-filter: blur(44px) saturate(200%);
  box-shadow: var(--sh-3), var(--sheen);
  animation: lgModalIn .46s var(--spring);
}
@keyframes lgModalIn {
  from { opacity: 0; transform: translateY(16px) scale(.94); }
  to   { opacity: 1; transform: none; }
}
```

Modal her açıldığında bu animasyon oynar (element her seferinde yeniden
oluşturulduğu/görünür yapıldığı için). Arka plan perdesi de bulanık: altta
kalan içerik net görünmemeli.

---

## 4. Sayfa/görünüm geçişi — "kameradan netleşerek gelme"

Bir sekme/görünüm değiştiğinde (örn. "Deals" görünümünden "Analytics"
görünümüne geçiş), o görünümün kök konteyneri şu animasyonu oynatır:

```css
html[data-theme="light"] main > div[id^="view-"] { animation: lgViewIn .62s var(--spring); }
@keyframes lgViewIn {
  0%   { opacity: 0; transform: translateY(18px) scale(.972); filter: blur(10px) saturate(140%); }
  50%  { opacity: 1; }
  100% { opacity: 1; transform: none; filter: none; }
}
```

His: iPhone kamera filtre şeridi gibi — buzlu camdan netleşerek ve hafifçe
yaklaşarak gelir. **Önemli kısıtlama:** bu animasyon SADECE en dıştaki
görünüm kabına uygulanır, içindeki alt bloklara (kademeli/stagger) UYGULANMAZ.
Sebep: içerideki tablo/liste sarmalayıcılarının görünürlüğü her veri
yenilemesinde değişir (filtre, canlı güncelleme, sayfalama); eğer animasyon
onlara da bağlı olsaydı her veri değişiminde yeniden tetiklenir ve içerik
sürekli bulanıklaşıp geri gelirdi. Geçiş yalnızca "kullanıcı başka bir sekmeye
tıkladı" olayına bağlı kalmalı.

---

## 5. Menü / sekme geçişleri — KAYAN GÖSTERGE (en kritik bölüm)

Bu, "menüdeki geçişler" dediğin şeyin gerçek mekanizması. Aktif sekmenin
**kendi arka planı şeffaftır**; koyu/vurgu rengindeki zemin aslında ayrı,
mutlak konumlandırılmış tek bir `<span>` elemanıdır ve seçim değiştiğinde bu
eleman bir sekmeden diğerine **kayarak** gider (opacity/scale değişimi değil,
gerçek pozisyon animasyonu).

### JavaScript mantığı

```js
function Segment(container, itemSelector, activeFn) {
  if (container.__seg) return;         // aynı konteynere iki kez uygulanmasın
  container.__seg = this;
  this.el = container;
  this.itemSel = itemSelector;
  // activeFn: bir öğenin "aktif" olup olmadığını nasıl anlarız — varsayılan
  // .active class'ı, ama bazı gruplarda aktiflik inline style ile de işaretlenebilir.
  this.activeFn = activeFn || (el => el.classList.contains('active'));
  container.classList.add('seg-container');

  const indicator = document.createElement('span');
  indicator.className = 'seg-indicator';
  container.insertBefore(indicator, container.firstChild);
  this.ind = indicator;

  // Aktif öğe class/style değiştiğinde (kullanıcı başka bir sekmeye
  // tıkladığında) göstergeyi yeniden konumlandır.
  new MutationObserver(() => this.update())
    .observe(container, { attributes: true, attributeFilter: ['class', 'style'], subtree: true });

  // Konteyner boyutu değiştiğinde de (responsive, sidebar aç/kapa) yeniden ölç.
  new ResizeObserver(() => this.update(true)).observe(container);
  window.addEventListener('resize', () => this.update(true));

  // İlk ölçüm ERKEN yapılırsa web fontları henüz yüklenmemiş olabilir ve
  // öğe genişlikleri sonradan değişir — gösterge yanlış öğenin üstünde
  // kalır. Bu yüzden fontlar hazır olduğunda VE birkaç gecikmeli
  // zamanlayıcıyla (120ms, 400ms, 1200ms) tekrar tekrar ölçülüyor.
  if (document.fonts?.ready) document.fonts.ready.then(() => this.update(true));
  window.addEventListener('load', () => this.update(true));
  [120, 400, 1200].forEach(ms => setTimeout(() => this.update(true), ms));

  this.update(true);   // instant=true: ilk konumlanma ANİMASYONSUZ olsun
}

Segment.prototype.update = function (instant) {
  let active = null;
  for (const el of this.el.querySelectorAll(this.itemSel)) {
    if (this.activeFn(el)) { active = el; break; }
  }
  // Aktif öğe yoksa veya görünmüyorsa (offsetParent null — gizli sekme)
  // gösterge kaybolsun, yanlış yerde durup kalmasın.
  if (!active || active.offsetParent === null) { this.ind.style.opacity = '0'; return; }

  if (instant) this.ind.style.transition = 'none';
  this.ind.style.opacity = '1';
  this.ind.style.width  = active.offsetWidth  + 'px';
  this.ind.style.height = active.offsetHeight + 'px';
  this.ind.style.transform = `translate(${active.offsetLeft}px,${active.offsetTop}px)`;
  if (instant) {
    void this.ind.offsetWidth;      // reflow'u zorla
    this.ind.style.transition = '';  // sonra geçişi geri aç
  }
};
```

Bunu her sekme/pill/menü grubuna otomatik uygulayan bir tarama fonksiyonu
yaz (DOM yüklendiğinde ve yeni içerik geldiğinde çalışsın — MutationObserver
ile `document.body`'i izleyip yeni gruplar bulduğunda `new Segment(...)`
çağır).

### CSS tarafı

```css
/* Konteyner: gösterge mutlak konumlanacağı için relative olmalı. Bu kural
   TEMADAN BAĞIMSIZ olmalı — bir tema katmanı bunu atlarsa gösterge normal
   bir flex çocuğu gibi akışa girer ve diğer düğmeleri yana iter. */
.seg-container { position: relative; }
.seg-indicator { position: absolute; top: 0; left: 0; pointer-events: none; z-index: 0; }

html[data-theme="light"] .seg-indicator {
  border-radius: 999px;
  background: rgba(18, 22, 34, 0.62);         /* koyu cam — vurgu rengi DEĞİL */
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  backdrop-filter: blur(16px) saturate(150%);
  box-shadow: 0 6px 20px -6px rgba(12, 16, 30, 0.55),
              inset 0 1px 0 rgba(255, 255, 255, 0.22);
  transition: transform .52s var(--spring), width .42s var(--spring),
              height .42s var(--spring), opacity .25s var(--ease);
  pointer-events: none;
  z-index: 0;
  will-change: transform, width;
}
/* Sekmeler ÜSTTE görünmeli, gösterge onların ALTINDA (arka plan gibi) */
.tab-item, .nav-item { position: relative; z-index: 1; }
.tab-item:not(.active) { color: var(--ink-2); }
/* Aktif öğenin KENDİ zemini şeffaf — göstergeyi görebilelim */
.tab-item.active { background: transparent; color: #fff; box-shadow: none; }
/* Bazı menü tipinde (yan menü gibi) köşe pill değil yumuşak kare olabilir */
#sidebar .seg-indicator { border-radius: 12px; }
```

**Neden bu kadar karmaşık:** basit bir `background-color` geçişi "sekme
değişti" hissini VERMEZ — göz, rengin solup diğer yerde belirmesini fark
eder ve kopuk hisseder. Fiziksel bir nesnenin bir konumdan diğerine
KAYMASI, iOS'un segment kontrolünün imzasıdır ve bu his ancak gerçek
`transform: translate()` animasyonuyla elde edilir.

**Hover ve tıklama:** aktif olmayan sekmeler hover'da koyu cam kazanır
(vurgu rengi değil):

```css
html[data-theme="light"] .tab-item:not(.active):hover {
  background: rgba(18, 22, 34, 0.09);
  color: var(--ink);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
}
html[data-theme="light"] .tab-item:active { transform: scale(.955); }
```

---

## 6. Özel açılır liste (native `<select>` yerine)

Native `<select>` cam yapılamaz (tarayıcı/OS çiziyor). Bunun yerine JS,
her `<select>`'i bulup DOM'da bırakır (değer kaynağı odur, gizlenir) ve
yanına tıklanabilir bir "trigger" + gövdeye eklenmiş `position: fixed` bir
panel oluşturur.

### Davranış

- Trigger'a tıklanınca panel açılır, seçenekler listelenir, arama kutusu
  varsa (uzun listelerde) odaklanır.
- Panel `position: fixed` ve `document.body`'e eklenir — herhangi bir
  `overflow: hidden` kapsayıcının içinde açılsa bile kırpılmaz. Açılışta
  trigger'ın altına/üstüne konumlanır (ekranın altına taşıyorsa yukarı
  açılır — "flip").
- **Kapatma mantığı:** `document` üzerinde `mousedown` (click değil) olayı
  **capture fazında** dinlenir. Sebep: bazı diğer özel kontroller (takvim
  gibi) kendi tıklama olayını durdurabiliyor; bubble fazında dinlenen bir
  `click` bu yüzden hiç tetiklenmeyebilir. Capture + mousedown, hangi
  kontrol açıksa diğerinin de güvenilir şekilde kapanmasını sağlar.
- Aynı anda yalnızca BİR panel açık olabilir — biri açılınca öncekiler kapanır.
- `Escape` tuşu açık paneli kapatır.
- Pencere `resize`/`scroll` olayında açık panelin konumu yeniden hesaplanır.

### CSS — açılış animasyonu

```css
.lq-panel {
  position: fixed;
  z-index: 10050;
  display: none;
  overflow: hidden auto;
  padding: 7px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.80);   /* panel biraz DAHA opak — altındaki
                                               satır metinleri sızıp okunmaz olmasın */
  -webkit-backdrop-filter: blur(44px) saturate(200%);
  backdrop-filter: blur(44px) saturate(200%);
  border: 1px solid rgba(255, 255, 255, 0.38);
  box-shadow: 0 8px 24px rgba(23, 43, 99, 0.14),
              0 32px 80px -16px rgba(23, 43, 99, 0.32),
              inset 0 1px 0 rgba(255, 255, 255, 0.85);
  transform-origin: top center;   /* aşağı açılırken */
}
.lq-panel.lq-flip { transform-origin: bottom center; }  /* yukarı açılırken */
.lq-panel.lq-open { display: block; animation: lqPanelIn .42s cubic-bezier(.34, 1.4, .56, 1); }
@keyframes lqPanelIn {
  0%  { opacity: 0; transform: translateY(-10px) scale(.92); filter: blur(6px); }
  55% { opacity: 1; filter: blur(0); }
  100% { transform: none; }
}
/* Her seçenek satırı, listeye kademeli (stagger) girer — panel açıldığında
   satırlar sırayla belirir, hepsi birden değil. */
.lq-panel .lq-opt {
  animation: lqOptIn .34s cubic-bezier(.22, 1, .36, 1) backwards;
}
@keyframes lqOptIn { from { opacity: 0; transform: translateX(-4px); } to { opacity: 1; transform: none; } }
/* JS her satıra artan bir animation-delay veriyor (örn. i * 18ms), CSS'te
   değil — satır sayısı dinamik olduğu için. */
```

Trigger (kapalı haldeki görünüm):

```css
.lq-trigger {
  width: 100%; display: flex; align-items: center; gap: 8px;
  padding: 7px 11px; font-size: 12px; font-weight: 500;
  background: var(--g-3);
  border: 1px solid var(--edge-soft);
  border-radius: 12px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7), inset 0 -1px 2px rgba(23, 43, 99, 0.04);
  -webkit-backdrop-filter: blur(12px) saturate(160%);
  backdrop-filter: blur(12px) saturate(160%);
  cursor: pointer;
  transition: background .22s var(--ease), border-color .2s var(--ease),
              box-shadow .25s var(--ease), transform .3s var(--spring);
}
.lq-trigger:hover { background: rgba(255, 255, 255, 0.74); }
.lq-trigger:active { transform: scale(.985); }
.lq-trigger.lq-active {   /* panel açıkken */
  border-color: rgba(13, 148, 136, 0.7);
  box-shadow: 0 0 0 4px rgba(13, 148, 136, 0.14);
  background: rgba(255, 255, 255, 0.84);
}
/* Ok ikonu panel açıldığında 180° döner */
.lq-trigger-chev { transition: transform .38s var(--spring); }
.lq-trigger.lq-active .lq-trigger-chev { transform: rotate(180deg); color: var(--accent); }
```

---

## 7. Takvim (tarih seçici) — "filtre açılımı" bunun bir örneği

Native `<input type="date">` de aynı sebeple (OS çiziyor) sarmalanır.
Mantık açılır listeyle çok benzer ama kendi bileşeni:

### Davranış

- Input gizlenir, yerine tıklanabilir bir "trigger" (takvim ikonu + biçimli
  tarih metni, seçim yoksa gri placeholder `gg.aa.yyyy`) konur.
- Trigger'a tıklanınca input'un yanına bir `<div class="cal-popup">`
  eklenir (fixed değil, DOM'da yerinde — açıldığı yerin bağlamına göre
  konumlanıyor). Aynı `document mousedown + capture` kapatma mantığı,
  açılır listeyle **paylaşılıyor**: hangisi açıksa, diğerine tıklanınca
  ya da dışarı tıklanınca güvenilir şekilde kapanıyor.
- **Üç görünüm** arasında geçiş: gün ızgarası (varsayılan) → ay başlığına
  tıkla → ay seçim ızgarası → yıl başlığına tıkla → 12 yıllık blok
  (decade) seçim ızgarası. Her görünüm değişimi popup'ın içeriğini
  TAMAMEN yeniden render eder (yeni `innerHTML`), popup'ın kendisi
  kapanıp açılmaz — sadece içi değişir.
- Gün ızgarasında: önceki/sonraki aydan taşan günler soluk (muted) ve
  tıklanabilir (o aya atlar). Bugün ayrı bir işaretle vurgulanır. Seçili
  gün dolgun vurgu rengiyle işaretlenir.
- Alt satırda "Bugün" ve "Temizle" hızlı eylem düğmeleri.
- Ay/yıl başlıkları tıklanabilir düğmelerdir (üst görünüme geçiş kapısı).

### CSS — açılış animasyonu (açılır listeden FARKLI: yukarıdan kayarak)

```css
.cal-popup {
  background: rgba(255, 255, 255, 0.86);   /* açılır panelden bile daha opak
                                               — genelde bir TABLONUN üzerinde
                                               açılıyor, tablo satırları
                                               camdan sızıp günleri okunmaz
                                               yapabilir */
  -webkit-backdrop-filter: blur(46px) saturate(200%);
  backdrop-filter: blur(46px) saturate(200%);
  box-shadow: var(--sh-2), var(--sheen);
  animation: calIn .34s var(--spring);
}
@keyframes calIn {
  from { opacity: 0; transform: translateY(-10px) scale(.95); }
  to   { opacity: 1; transform: none; }
}
.cal-day:hover { background: rgba(13, 148, 136, 0.14); color: #0f766e; }
.cal-day.muted { opacity: .45; }
.cal-day.selected {
  background: linear-gradient(150deg, #14b8a6, #0d9488);
  color: #fff;
  box-shadow: 0 4px 14px -3px rgba(13, 148, 136, 0.6);
}
.cal-nav-btn:hover { background: linear-gradient(150deg, #14b8a6, #0d9488); color: #fff; }
.cal-day:active { transform: scale(.955); }
```

Trigger, input alanlarıyla AYNI görsel dilde (bkz. bölüm 8), sadece içine
tıklanabilir takvim ikonu ve biçimli metin koyulmuş hali:

```css
.date-trigger {
  background: var(--g-3);
  -webkit-backdrop-filter: blur(12px) saturate(160%);
  backdrop-filter: blur(12px) saturate(160%);
  border: 1px solid var(--edge-soft);
  border-radius: 12px;
  transition: border-color .2s var(--ease), box-shadow .25s var(--ease), background .2s var(--ease);
}
.date-trigger:hover { background: rgba(255, 255, 255, 0.72); }
.date-trigger.active {   /* takvim açıkken — açılır listenin .lq-active'iyle AYNI dil */
  border-color: rgba(13, 148, 136, 0.7);
  box-shadow: 0 0 0 4px rgba(13, 148, 136, 0.14);
  background: rgba(255, 255, 255, 0.82);
}
```

---

## 8. Normal girdiler (metin, arama, textarea)

```css
html[data-theme="light"] input, select, textarea {
  background: var(--g-3);
  -webkit-backdrop-filter: blur(12px) saturate(160%);
  backdrop-filter: blur(12px) saturate(160%);
  border: 1px solid var(--edge-soft);
  border-radius: 12px;
  color: var(--ink);
  box-shadow: inset 0 1px 2px rgba(23, 43, 99, 0.05);
  transition: border-color .2s var(--ease), box-shadow .25s var(--ease), background .2s var(--ease);
}
html[data-theme="light"] input:hover { background: rgba(255, 255, 255, 0.72); }
html[data-theme="light"] input:focus {
  border-color: rgba(13, 148, 136, 0.7);
  box-shadow: 0 0 0 4px rgba(13, 148, 136, 0.14);
  background: rgba(255, 255, 255, 0.82);
}
```

Odak halkası (`0 0 0 4px`, teal, düşük opaklık) her odaklanabilir öğede
AYNI değer — açılır liste, takvim tetikleyicisi, metin girdisi, hepsi bu
tek "odak dili"ni paylaşır. Bu tutarlılık kasıtlı: kullanıcı neye
odaklandığını hep aynı görsel işaretle anlar.

---

## 9. Butonlar

```css
html[data-theme="light"] button {
  border-radius: 12px;
  transition: background .22s var(--ease), color .22s var(--ease),
              transform .3s var(--spring), box-shadow .25s var(--ease);
}
html[data-theme="light"] button:hover {
  background: rgba(18, 22, 34, 0.09);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
}
html[data-theme="light"] button:active { transform: scale(.955); }
```

Küçük metrik/rozet pilleri (sayı gösteren küçük kartlar) hover'da hafifçe
büyür ve yukarı kalkar:

```css
.metric-pill {
  transition: transform .3s var(--spring), box-shadow .2s var(--ease);
}
.metric-pill:hover { transform: translateY(-2px) scale(1.03); box-shadow: 0 8px 20px -4px rgba(23, 43, 99, 0.22); }
```

---

## 10. Tablolar

```css
html[data-theme="light"] table { border-collapse: separate; border-spacing: 0; }
html[data-theme="light"] thead th {
  position: sticky; top: 0;
  background: rgba(244, 247, 255, 0.96);   /* yapışkan başlık OPAK-ish olmalı,
                                               yoksa altından satırlar geçer */
  -webkit-backdrop-filter: blur(18px) saturate(180%);
  backdrop-filter: blur(18px) saturate(180%);
  border-bottom: 1px solid var(--edge);
}
html[data-theme="light"] tbody td { border-bottom: 1px solid rgba(23, 43, 99, 0.038); }
html[data-theme="light"] tbody tr:nth-child(even) td { background: rgba(23, 43, 99, 0.018); }
html[data-theme="light"] tbody tr:hover td { background: rgba(13, 148, 136, 0.085); }
```

Sayılar `font-variant-numeric: tabular-nums`.

---

## 11. Tipografi

- Başlıklar: 700–800 ağırlık, `letter-spacing: -0.015em`.
- Küçük etiketler: 8,5–10px, `font-weight: 800`, `text-transform: uppercase`,
  `letter-spacing: .06em`. İri sayı + minik büyük harf etiket kontrastı
  tasarımın imzası.

---

## 12. Kaydırma çubukları

```css
html[data-theme="light"] ::-webkit-scrollbar-track { background: transparent; }
html[data-theme="light"] ::-webkit-scrollbar-thumb { background: rgba(23, 43, 99, 0.20); border-radius: 99px; }
html[data-theme="light"] ::-webkit-scrollbar-thumb:hover { background: rgba(23, 43, 99, 0.34); }
```

---

## TUZAKLAR — hepsi gerçek bir projede tek tek ölçülerek bulundu

1. **Yüzey opaklığını yükseltme.** `0.40` camdır, `0.9` beyaz karttır.
   "Az okunuyor" hissi gelirse opaklığı değil **metin kontrastını** artır.

2. **`backdrop-filter` yeni bir yığın bağlamı (stacking context) yaratır.**
   Cam bir eleman `z-index` taşıyan kardeşinin altında kalabiliyor. Bir
   panelin üstündeki özet şeridi tablonun ALTINA boyandı; çözüm şeride
   `position: relative; z-index: 2` vermekti.

3. **Satır içi `style` ile stylesheet kuralı aynı şey değil.** Mevcut bir
   uygulamayı camlaştırırken `[style*="color:#f1f5f9" i]` gibi eşlemeler
   yazmak işe yarar — ama bunlar yalnızca `style` **niteliğini** görür, bir
   `<style>` bloğundaki kuralı asla göremez.

4. **Kayan gösterge tek ölçümle yetinirse yanlış öğenin üstünde durur.**
   Web fontları yüklenmeden önce ölçülen genişlik/yükseklik, font
   yüklendikten sonra değişir. `document.fonts.ready` + birkaç gecikmeli
   yeniden ölçüm (120/400/1200ms) gerekli — bir tanesi atlanırsa bazı
   kullanıcılarda gösterge kalıcı olarak kayık kalır.

5. **Açılır panel/takvim `click` ile kapanmaya çalışırsa bazen kapanmaz.**
   Bir kontrol kendi `click` olayını durdurursa (stopPropagation), bubble
   fazındaki dış dinleyici hiç tetiklenmez. `mousedown` + capture fazı bu
   sorunu tamamen ortadan kaldırır ve iki farklı özel kontrolü (açılır
   liste + takvim) birbiriyle tutarlı hale getirir.

6. **Görünüm geçiş animasyonunu iç bloklara da uygulama.** İçerik her veri
   yenilemesinde (filtre, canlı güncelleme, sayfalama) görünürlük
   değiştiriyorsa ve animasyon ona bağlıysa, ekran sürekli bulanıklaşıp
   geri gelir. Geçiş SADECE dış görünüm kabına ve SADECE sekme değişiminde
   bağlı olmalı.

7. **Donuk gri metin camda okunmaz.** Üçüncül gri tonu gözle değil ölçerek
   seç; bir projede 2,73:1 çıktı ve tablo başlıkları okunmuyordu.

8. **Geometri temadan bağımsız olmalı.** `margin`, `padding`, `border-radius`,
   `position: relative` (gösterge konteynerinde) gibi kuralları tema
   bloklarının içine YAZMA — ortak bir bölüme koy. Yoksa bir tema onu
   unutur ve o temada gösterge akışı bozar.

9. **Tema ilk boyamadan önce uygulanmalı**, yoksa flaş oluşur.

10. **`backdrop-filter` pahalıdır.** Yüzlerce elemana (her tablo satırı, her
    liste kartı) verme — kapsayıcı panele ver.

### Teslim ederken

- Her iki temada **ve** her ana ekranda kontrol et. Ekran görüntüsü al ve
  gerçekten **bak**.
- Kayan göstergeyi gerçekten test et: bir sekmeden diğerine tıkla, göstergenin
  KAYARAK gittiğini (aniden ışınlanmadığını) doğrula. Sayfayı yenile, ilk
  yüklemede göstergenin doğru öğenin üstünde ANİMASYONSUZ belirdiğini
  doğrula (instant=true yolu).
- Açılır listeyi ve takvimi aç, birini açıkken diğerine tıkla — öncekinin
  kapandığını doğrula.
- CSS süslü parantez dengesini doğrula.
- Veriye ve mantığa dokunmadığını açıkça belirt.

## PROMPT SONU

# Liquid Glass tema — başka bir projeye uygulama promptu

Bu dosyanın tamamını bir AI asistanına kopyala-yapıştır.

İçindeki değerler uydurma değil — çalışan sistemden alındı. Hepsi görünümle
ilgili (renk, yarıçap, gölge, bulanıklık); hiçbir gizli bilgi, anahtar veya
proje verisi içermez. "Tuzaklar" bölümü bu projede tek tek ölçerek bulunmuş
gerçek hatalar; onları atlarsan aynı hataları baştan yaşarsın.

---

## PROMPT BAŞLANGICI — buradan aşağısını kopyala

Projemin arayüzünü Apple'ın "Liquid Glass" diline (macOS Sequoia / iOS 18)
taşımanı istiyorum. Aşağıdaki tarifi uygula.

### MUTLAK KURAL: yalnızca görünüm

- **HİÇBİR** veri akışına, iş mantığına, API çağrısına, state yönetimine,
  hesaplamaya, fonksiyon davranışına dokunma.
- HTML yapısını değiştirme: eleman ekleme/çıkarma/taşıma, class veya id
  değiştirme, event bağlarını elleme — hiçbiri yok.
- Metin içeriğini değiştirme, çeviri yapma, etiket adlarını "düzeltme".
- Yaptığın her şey CSS olsun. Tek istisna: temayı ilk boyamadan önce uygulayan
  küçük bir script ve (yoksa) bir tema değiştirme düğmesi.
- Mevcut temayı **silme**. Yeni görünüm bir tema niteliğinin altına yazılsın,
  kullanıcı eski haline dönebilmeli.
- Bir şeyi düzeltmek için mantığa dokunmak gerekiyorsa **dokunma, bana söyle**.

### Temel fikir

Arayüz, renkli bir zeminin üzerinde yüzen **buzlu cam levhalar** gibi
görünmeli. Her panel arkasındakini bulanık ve renkli biçimde geçiriyor; üst
kenarında ışık birikiyor; altına yumuşak, geniş bir gölge düşüyor.

### Mimari

İki ayrı dosya oluştur, her biri yalnızca kendi temasının altında çalışsın:

- `liquid-glass.css` → tüm kurallar `html[data-theme="light"]` ile başlar
- `liquid-glass-dark.css` → tüm kurallar `html[data-theme="dark"]` ile başlar

Böylece iki tema birbirine hiç karışmaz, biri bozulunca diğeri ayakta kalır ve
"hangi kural hangi temada" sorusu okurken bellidir.

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
```

Toggle:

```js
function toggleTheme() {
  var cur  = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  var next = cur === 'dark' ? 'light' : 'dark';
  localStorage.setItem('app_theme', next);
  document.documentElement.setAttribute('data-theme', next);
}
```

Varsayılan **açık** tema olsun.

### 1. Zemin — efektin ön şartı

**Cam, ancak arkasında kıracak renk varsa cam gibi durur.** Zemin beyaz olursa
paneller de beyaz görünür ve efekt tamamen kaybolur. Zemin bu yüzden düz renk
değil, birbirine karışan büyük ve yumuşak renk bulutlarından oluşan bir "mesh
gradient": köşelere ve merkeze yerleşmiş, ekran boyutunda, uçları tamamen
saydamlaşarak eriyen dairesel lekeler. Lekeler birbirine karışacak kadar büyük
olmalı; ayrı balonlar gibi seçiliyorsa fazla küçükler.

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
```

Koyu temada aynı yerleşim ve aynı renkler, yoğunluk yarıya iner, taban gece
lacivertine kaçan bir siyaha oturur. Renkler **kısık ama var** — düz siyah
zeminde cam efekti yine ölür.

```css
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

**`background-attachment: fixed` KULLANMA.** Çok katmanlı gradient bazı
motorlarda onunla hiç boyanmıyor (ekran görüntüsü ve yazdırma dahil), zemin
beyaz kalıyor ve efekt ölüyor. Sabit zemin gerekiyorsa `position: fixed` bir
katman kullan.

### 2. Tasarım değişkenleri

Açık tema:

```css
html[data-theme="light"] {
  /* Cam yüzeyler — DÜŞÜK opaklık kritik, yoksa "beyaz kart" olur */
  --g-1: rgba(255, 255, 255, 0.40);   /* ana paneller */
  --g-2: rgba(255, 255, 255, 0.26);   /* iç/ikincil yüzeyler */
  --g-3: rgba(255, 255, 255, 0.58);   /* input, öne çıkan yüzey */
  --g-hover: rgba(255, 255, 255, 0.62);

  /* Saç teli kenar — kalın veya koyu kenar YOK, cam levhanın kenarı incedir */
  --edge: rgba(255, 255, 255, 0.55);
  --edge-soft: rgba(255, 255, 255, 0.32);

  /* Sheen — Apple'ın imzası: üst kenarda toplanan ışık + soluk iç çerçeve.
     Atlanırsa yüzey "yapışkan bant" gibi düz görünür, kalınlık hissi gitmez. */
  --sheen: inset 0 1px 0 0 rgba(255, 255, 255, 0.85),
           inset 0 0 0 1px rgba(255, 255, 255, 0.20),
           inset 0 -1px 0 0 rgba(255, 255, 255, 0.12);

  /* Gölgeler HER ZAMAN iki katman: biri yakın ve sıkı, biri uzak ve yayvan.
     Sert, tek, koyu gölge yok. */
  --sh-1: 0 2px 8px  rgba(23, 43, 99, 0.06), 0 8px  28px       rgba(23, 43, 99, 0.10);
  --sh-2: 0 4px 14px rgba(23, 43, 99, 0.08), 0 18px 50px -10px rgba(23, 43, 99, 0.18);
  --sh-3: 0 8px 24px rgba(23, 43, 99, 0.12), 0 32px 80px -16px rgba(23, 43, 99, 0.30);

  --blur: 30px;
  --sat: 190%;   /* doygunluk ŞART: blur rengi soldurur, bu geri verir */

  /* Metin — YÜKSEK kontrast (donuk gri metin camda okunmaz) */
  --ink:   #12141a;
  --ink-2: #4b5364;
  --ink-3: #7c8496;

  --accent:   #0d9488;   /* turkuaz — aktif durum, odak, birincil buton */
  --accent-2: #2563eb;

  /* Üç kademe yarıçap; aynı sayfada rastgele değerler dolaşmasın */
  --r-lg: 26px;   /* kenar çubuğu, modal */
  --r-md: 20px;   /* kartlar */
  --r-sm: 14px;   /* küçük öğeler */

  --ease:   cubic-bezier(.22, 1, .36, 1);    /* yavaşlayarak duran */
  --spring: cubic-bezier(.34, 1.4, .56, 1);  /* hafif yaylanan */
}
```

Koyu tema — **formül tersine döner**: açıkta beyazın saydamı, koyuda karanlığın
üstüne serilmiş çok ince bir ışık tabakası.

```css
html[data-theme="dark"] {
  --d-1: rgba(255, 255, 255, 0.062);
  --d-2: rgba(255, 255, 255, 0.038);
  --d-3: rgba(255, 255, 255, 0.085);
  --d-hover: rgba(255, 255, 255, 0.13);
  --d-strong: rgba(20, 26, 42, 0.78);   /* menü/popover — opak tarafta */

  --d-edge: rgba(255, 255, 255, 0.16);
  --d-edge-soft: rgba(255, 255, 255, 0.09);

  --d-sheen: inset 0 1px 0 0 rgba(255, 255, 255, 0.14),
             inset 0 0 0 1px rgba(255, 255, 255, 0.04);

  /* Koyuda gölgeler daha derin ve daha yayvan */
  --d-sh-1: 0 2px  10px rgba(0, 0, 0, 0.40), 0 10px 32px       rgba(0, 0, 0, 0.32);
  --d-sh-2: 0 6px  18px rgba(0, 0, 0, 0.46), 0 20px 56px -12px rgba(0, 0, 0, 0.55);
  --d-sh-3: 0 10px 28px rgba(0, 0, 0, 0.52), 0 36px 88px -18px rgba(0, 0, 0, 0.70);

  --d-blur: 30px;
  --d-sat: 175%;

  --d-ink:   #f2f5fa;
  --d-ink-2: #a9b4c8;
  --d-ink-3: #78849c;

  --d-sel: rgba(255, 255, 255, 0.155);   /* seçim/aktif göstergesi */

  --d-r-lg: 26px;  --d-r-md: 20px;  --d-r-sm: 14px;
  --d-ease:   cubic-bezier(.22, 1, .36, 1);
  --d-spring: cubic-bezier(.34, 1.4, .56, 1);
}
```

### 3. Temel cam reçetesi

Her panel, kart, modal, açılır menü ve tablo kabı dört parçayı taşır: yarı
saydam yüzey + bulanıklık&doygunluk + saç teli kenar + sheen.

```css
html[data-theme="light"] .panel {
  background: var(--g-1);
  -webkit-backdrop-filter: blur(var(--blur)) saturate(var(--sat));
  backdrop-filter: blur(var(--blur)) saturate(var(--sat));
  border: 1px solid var(--edge-soft);
  border-radius: var(--r-lg);
  box-shadow: var(--sh-2), var(--sheen);
}
html[data-theme="dark"] .panel {
  background: var(--d-1);
  -webkit-backdrop-filter: blur(var(--d-blur)) saturate(var(--d-sat));
  backdrop-filter: blur(var(--d-blur)) saturate(var(--d-sat));
  border: 1px solid var(--d-edge-soft);
  border-radius: var(--d-r-lg);
  box-shadow: var(--d-sh-2), var(--d-sheen);
}
```

Kenar çubuğu varsa ekrana yapışmasın — her yanından boşluk bırakıp **yüzen bir
cam panel** olsun: `margin: 10px`, `height: calc(100vh - 20px)`, en büyük
yarıçap.

### 4. Girdi alanları

Girdiler panellerden **daha opak** olmalı; dokunulabilir yüzey hissi versin.
İçlerine çok hafif bir iç gölge koy, yüzeye gömülmüş gibi dursunlar.

```css
html[data-theme="light"] input,
html[data-theme="light"] select,
html[data-theme="light"] textarea {
  background: var(--g-3);
  -webkit-backdrop-filter: blur(12px) saturate(160%);
  backdrop-filter: blur(12px) saturate(160%);
  border: 1px solid var(--edge-soft);
  border-radius: 12px;
  color: var(--ink);
  box-shadow: inset 0 1px 2px rgba(23, 43, 99, 0.05);
}
html[data-theme="light"] input:hover { background: rgba(255, 255, 255, 0.72); }
html[data-theme="light"] input:focus {
  border-color: rgba(13, 148, 136, 0.7);
  box-shadow: 0 0 0 4px rgba(13, 148, 136, 0.14);   /* odak halkası */
  background: rgba(255, 255, 255, 0.82);
}
```

Tarayıcının varsayılan outline'ını kaldırıyorsan yerine **mutlaka** görünür bir
odak koy. `<option>` elemanları cam olamaz (işletim sistemi çiziyor) — onlara
düz beyaz zemin ve okunur metin ver.

### 5. Tablolar

Ayırıcılar **çizgi değil yüzey farkıyla** olsun; yapışkan başlık satırı yarı
saydam **olamaz**, altından satırlar geçer ve okunmaz.

```css
html[data-theme="light"] table { border-collapse: separate; border-spacing: 0; }
html[data-theme="light"] thead th {
  position: sticky; top: 0;
  background: rgba(244, 247, 255, 0.96);   /* opak-ish — şart */
  -webkit-backdrop-filter: blur(18px) saturate(180%);
  backdrop-filter: blur(18px) saturate(180%);
  border-bottom: 1px solid var(--edge);
}
html[data-theme="light"] tbody td { border-bottom: 1px solid rgba(23, 43, 99, 0.038); }
html[data-theme="light"] tbody tr:nth-child(even) td { background: rgba(23, 43, 99, 0.018); }
html[data-theme="light"] tbody tr:hover td { background: rgba(13, 148, 136, 0.085); }
```

Sayılar `font-variant-numeric: tabular-nums` kullansın, yoksa değer
değiştikçe zıplarlar.

### 6. Tipografi

- Başlıklar kalın (700–800) ve `letter-spacing: -0.015em` — sıkı, modern duruş.
- Küçük etiketler: 8,5–10px, `font-weight: 800`, `text-transform: uppercase`,
  `letter-spacing: .06em`. İri sayı + minik büyük harf etiket kontrastı bu
  tasarımın karakteristik dokusu.

### 7. Hareket

- Geçişler 0,15–0,25 sn, `var(--ease)`.
- Hover'da eleman 1–2 px yukarı kalkar, gölgesi bir kademe büyür; tıklamada
  yerine oturur.
- Kartlarda ve rozetlerde `var(--spring)` kullan; panellerde kullanma,
  ciddiyeti bozar.
- `prefers-reduced-motion: reduce` altında animasyon ve geçişleri kapat.

### 8. Kaydırma çubukları

```css
html[data-theme="light"] ::-webkit-scrollbar-track { background: transparent !important; }
html[data-theme="light"] ::-webkit-scrollbar-thumb {
  background: rgba(23, 43, 99, 0.20) !important;
  border-radius: 99px;
}
html[data-theme="light"] ::-webkit-scrollbar-thumb:hover { background: rgba(23, 43, 99, 0.34) !important; }
```

---

## TUZAKLAR — hepsi gerçek projede tek tek ölçülerek bulundu

1. **Yüzey opaklığını yükseltme.** `0.40` camdır, `0.9` beyaz karttır. "Az
   okunuyor" hissi gelirse opaklığı değil **metin kontrastını** artır.

2. **`backdrop-filter` yeni bir yığın bağlamı (stacking context) yaratır.**
   Cam bir eleman, `z-index` taşıyan kardeşinin altında kalabiliyor. Bu projede
   tablonun üstündeki özet şeridi tablonun ALTINA boyandı ve iki bileşen iç içe
   girmiş gibi göründü; çözüm şeride `position: relative; z-index: 2` vermekti.
   Cam elemanlar üst üste geliyorsa sıralamayı açıkça yaz.

3. **Satır içi `style` ile stylesheet kuralı aynı şey değil.** Mevcut bir
   uygulamayı camlaştırırken `[style*="color:#f1f5f9"]` gibi eşlemeler yazmak
   işe yarar — ama bunlar yalnızca `style` **niteliğini** görür, bir `<style>`
   bloğundaki kuralı asla göremez. Bu projede bir not kutusu açık temada siyah
   kaldı, sebebi tam olarak buydu. Stylesheet'te tanımlı elemanlar için sınıf
   bazlı kural yaz.

4. **Satır içi koyu kenarlıklar açık temada siyah ızgara çıkarır.**
   `border-bottom: 1px solid #0f172a` gibi inline değerler camda felaket
   görünür; tema katmanından ez.

5. **Koyu temada mevcut renk dilini yeniden eşlemeye çalışma.** Uygulamanın
   satır içi renkleri zaten koyu tema için yazılmışsa koyuda **sadece
   zeminleri camlaştır**, renklere dokunma. Açık temada ise parlak renkleri
   koyulaştırmak zorundasın. İki temanın işi simetrik değil.

6. **Donuk gri metin camda okunmaz.** Bu projede üçüncül gri ton cam üzerinde
   **2,73:1** ölçüldü ve tablo başlıkları okunmuyordu; bir kademe koyulaştırmak
   gerekti. Gözle karar verme, kontrastı ölç.

7. **Özgüllük eşitliğinde dosya sırası kazanır.** Bir tema kuralını ezmek
   gerektiğinde sınıfı iki kez yazmak temiz bir hile: `.tbl.tbl td { ... }`.

8. **Geometri temadan bağımsız olmalı.** `margin`, `padding`, `border-radius`,
   `flex`, `grid` ölçülerini tema bloklarına DEĞİL ortak bir bölüme yaz. Yoksa
   iki tema birbirinden ayrı düşer ve biri düzeltilirken diğeri bozulur.

9. **Tema ilk boyamadan önce uygulanmalı**, yoksa yanlış temada bir kare
   görünüp gözle fark edilen bir flaş oluşur.

10. **`backdrop-filter` pahalıdır.** Yüzlerce elemana (her tablo satırına,
    listedeki her karta) verme — kapsayıcı panele ver, içerik düz kalsın.
    Aksi halde kaydırma tutuklaşır.

### Teslim ederken

- Her iki temada **ve** her ana ekranda kontrol et. Ekran görüntüsü al ve
  gerçekten **bak** — cam efekti hataları ölçümle değil gözle yakalanır.
- CSS süslü parantez dengesini doğrula.
- Veriye ve mantığa dokunmadığını açıkça belirt. Bir şeyi düzeltmek için
  dokunmak gerekiyorsa yapma, bana sor.

## PROMPT SONU

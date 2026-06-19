# Proje Adı: Natural Clinic - Past Data CRM (2025-2026)
### Supabase Proje Adı: natural-clinic-past-data-crm
### Geliştirme Metodolojisi: Vibe Coding / Codex (Vanilla HTML, CSS, JS)

---

## 1. GENEL BAKIŞ VE AMAC

Bu mini-CRM sistemi, **Natural Clinic** bünyesinde çalışan **150 Satış Danışmanı (Agent)** ve **12 Takım Lideri (TL)** ile **Sistem Adminleri** için özel olarak tasarlanmıştır. 

Sistemin ana amacı; excel (CSV) dosyalarında biriken ve takibi zor olan **2025-2026 yılları arasındaki geçmiş hasta/deal datalarını** kurallı, kilit mekanizmalı ve rol tabanlı bir arayüz üzerinden eritmek, arama sonuçlarını (Result Codes) ve detaylı danışman notlarını merkezi bir veri tabanında (Supabase) güvenli bir şekilde depolamaktır.

---

## 2. TEKNOLOJİ YIĞINI (TECH STACK)

Geliştirme sürecinin hızı, taşınabilirliği ve bilgisayarda herhangi bir terminal komutu çalıştırmadan (NPM/Node bağımlılığı olmadan) sadece `index.html` dosyasına çift tıklayarak çalışabilmesi için şu mimari seçilmiştir:

- **Frontend (Arayüz):** Tek sayfa mimarisi (SPA) veya birbiriyle ilişkili temiz `index.html` (Login), `agent.html`, `team-leader.html`, `admin.html` sayfaları.
- **Tasarım / Stil:** Tailwind CSS (CDN bağlantısı ile: `<script src="https://cdn.tailwindcss.com"></script>`)
- **Backend / Veritabanı:** Supabase (Supabase JS Client CDN ile entegre edilecektir). Supabase Auth (Giriş), Supabase Database (PostgreSQL) ve Realtime (Anlık İzin İstekleri).

---

## 3. ROL TABANLI ERİŞİM VE LOGİN SİSTEMİ (RBAC)

Sistemde 3 temel giriş rolü olacaktır. Her rolün göreceği datalar ve yetkileri kesin çizgilerle ayrılmıştır:

### A. Agent (Satış Danışmanı - 150 Kişi)
- Sadece kendine atanmış (`owner_id`) veya kendi takımına (`team_id`) tahsis edilmiş 2025-2026 geçmiş datalarını listeler halinde görür.
- Başka takımların veya diğer agentların datalarına hiçbir şekilde erişemez.
- Arama yaptıktan sonra hastaya ait arama durumunu (Result Code) ve detaylı görüşme notunu girer.
- Kaydedilen hasta kartı anında kilitlenir. Kilitli kartı tekrar açmak için Takım Liderinden izin isteme butonunu kullanır.

### B. Takım Lideri (TL - 12 Kişi)
- Sadece kendi takımına bağlı olan agentların listesini, bu agentların yaptığı aramaları, girdikleri kodları ve yazdıkları notları görür.
- Gelişmiş filtreleme paneline sahiptir (Agent adına göre, Result Code'a göre, tarihe göre filtreleme).
- Kendi takımındaki agentlardan gelen **"Kilit Açma İzin Taleplerini"** anlık olarak listeler ve onaylayarak kartın kilidini kaldırabilir.

### C. Admin
- Sistemdeki tüm takımları, tüm agentları ve tüm geçmiş dataları görebilir.
- CSV'den gelen ham dataları sisteme yükleme/yönetme yetkisine sahiptir.
- Sistem genelindeki tüm logları görür ve tüm kilit açma taleplerini (hangi takım olduğu fark etmeksizin) onaylayabilir.

---

## 4. ZOHO CRM ENTEGRASYONU VE ID GİZLEME MANTIĞI

CSV dosyasında iki tip ID bulunmaktadır:
1. `db.DealID`: Hastanın genel/görünür ID'si (Örn: `1124-38442`).
2. `db.Deal Id`: Hastanın Zoho CRM üzerindeki benzersiz sistem ID'si (Örn: `645008000120817578`).

### Arayüz Uygulama Kuralı:
- Ekranda karmaşıklık yaratmaması adına ekstra bir "Zoho'ya Git" veya "CRM Butonu" **bulunmayacaktır**.
- Tabloda yer alan **Hasta ID** (`db.DealID` değeri, örn: `#1124-38442`) alanı mavi renkli, kalın ve altı çizili bir köprü metni (Link) olacaktır.
- Agent bu ID'ye tıkladığında, arka planda gizli tutulan `db.Deal Id` (Zoho dahili ID'si) kullanılarak otomatik olarak şu link oluşturulacak ve **yeni sekmede (`target="_blank"`)** açılacaktır:
  `https://crm.zoho.eu/crm/org20093728832/tab/Potentials/[db.Deal_Id]`
- Bu sayede danışman, ekranda gereksiz kod kalabalığı görmeden tek tıkla hastanın Zoho CRM dashboard'una uçacaktır.

---

## 5. POPUP (MODAL) MANTIĞI, NOT ZORUNLULUĞU VE KİLİTLENME AKIŞI

Agent, listedeki açık bir hastanın yanındaki **"Sonuç Gir"** butonuna bastığında bir Popup penceresi açılır.

### Popup İçeriği ve Kuralları:
1. **Result Code Seçimi (Dropdown):** Aşağıdaki sabit kodlardan biri seçilmek zorundadır:
   - `BUSY` : Meşgul / Ulaşılamadı
   - `NO_ANSWER` : Cevap Vermiyor
   - `WRONG_NUMBER` : Yanlış / Geçersiz Numara
   - `NOT_INTERESTED` : İlgilenmiyor / Reddedildi
   - `POTENTIAL_HOT` : Çok Olumlu / Sıcak Data
   - `BOOKED` : Rezervasyon Yapıldı / Geliyor
   - `FOLLOW_UP` : Takip Edilecek (İleri Tarihli)
   - `PRICE_HIGH` : Fiyat Yüksek Bulundu
2. **Görüşme Notu (Textarea):** "Hasta ile ne konuşuldu?" başlığı altında geniş bir metin kutusudur. Boş bırakılamaz. En az 5-10 karakter giriş zorunluluğu konulmalıdır (Örn: *"Hasta fiyatı yüksek buldu, haftaya saç ekimi için tekrar aranmak istiyor"*).

### Onay ve Kilitleme Mekanizması:
- Agent "Kaydet ve Kapat" butonuna bastığında sistem hemen kaydetmez. Tarayıcıda bir onay penceresi (`confirm popup`) tetiklenir:
  > **"Son kararınız mı? Bu işlem geri alınamaz ve bu hasta kartı kilitlenecektir!"**
- Agent **"İptal"** derse popup'a geri döner.
- Agent **"Evet"** derse:
  1. Bilgiler veri tabanına yazılır.
  2. Hastanın satır durumu `status = 'locked'` haline gelir.
  3. Tablodaki satırın yanında **"✓ Bilgi Alındı"** ibaresi belirir, satır hafif grileşir.
  4. **Kritik Kural:** Agent o saatten sonra o karttaki "Sonuç Gir" butonunu göremez, kilitli karta tıklayamaz, veriyi değiştiremez.

### Kilit Açma İzin İsteme Akışı:
- Kilitlenen satırda sadece **"Kilit Açma İzni İste"** butonu belirir.
- Agent buna basarsa Supabase üzerinde `lock_approval_requested = true` olur.
- Takım liderinin ekranında anlık bildirim düşer. Takım lideri panelden "Onayla" dediği an, ilgili hastanın durumu yeniden `status = 'pending'`, `result_code = null` ve `lock_approval_requested = false` konumuna geri çekilir. Kart agent için tekrar düzenlenebilir hale gelir.

---

## 6. VERİTABANI ŞEMASI (SUPABASE / POSTGRESQL)

Codex'in Supabase üzerinde oluşturacağı SQL tabloları ve ilişkileri şu şekildedir:

### Tablo: `profiles` (Kullanıcılar)
- `id` (uuid, primary key -> auth.users.id)
- `username` (text, benzersiz kullanıcı adı)
- `role` (text -> 'admin', 'tl', 'agent')
- `team_id` (uuid, foreign key -> teams.id, nullable)
- `created_at` (timestamp)

### Tablo: `teams` (Takımlar)
- `id` (uuid, primary key)
- `team_name` (text, örn: 'Team Alpha', 'Team Bülent')
- `leader_id` (uuid, foreign key -> profiles.id)
- `created_at` (timestamp)

### Tablo: `deals` (Müşteri / Hasta Verileri)
- `id` (uuid, primary key)
- `deal_id_zoho` (text, CSV'deki `db.Deal Id` - Gizli URL ID'si)
- `custom_id` (text, CSV'deki `db.DealID` - Ekranda görünen tıklanabilir ID)
- `deal_name` (text, Hasta Adı)
- `created_time` (text/timestamp)
- `arrival_date` (text, Geliş Tarihi 2025-2026)
- `region` (text, Bölge)
- `language` (text, Dil)
- `stage` (text, Mevcut Aşama)
- `payment_status` (text)
- `owner_id` (uuid, foreign key -> profiles.id, Atanan Agent)
- `team_id` (uuid, foreign key -> teams.id, Atanan Takım)
- `status` (text, default: 'pending' -> 'pending' veya 'locked')
- `result_code` (text, nullable -> Seçilen arama kodu)
- `agent_note` (text, nullable -> Girilen zorunlu görüşme notu)
- `lock_approval_requested` (boolean, default: false)

### Tablo: `logs` (Sistem İşlem Geçmişi)
- `id` (uuid, primary key)
- `deal_id` (uuid, foreign key -> deals.id)
- `user_id` (uuid, foreign key -> profiles.id)
- `action_type` (text -> 'RESULT_ENTERED', 'UNLOCK_REQUESTED', 'UNLOCK_APPROVED')
- `details` (text, yapılan işlemin metin özeti veya girilen not)
- `created_at` (timestamp, default: now())

---

## 7. CODEX / COPILOT İÇİN GELİŞTİRME TALİMATLARI

1. **Arayüz Temizliği:** Tasarımda karmaşık grafikler yerine, tamamen veriye odaklanan, Tailwind CSS'in koyu gri, indigo ve beyaz tonlarından oluşan kurumsal bir tablo yapısı kur.
2. **CDN Entegrasyonu:** Projeyi tek klasörde topla. `index.html`, `agent.html`, `tl.html`, `admin.html` ve supabase bağlantılarını yürütecek olan tek bir `supabase-config.js` veya her sayfanın kendi `<script>` tagleri içinde temiz JavaScript (ES6+) kullan.
3. **Güvenlik Kontrolü:** Sayfa açıldığında yerel hafızadan (`localStorage`) kullanıcının rolünü kontrol et. Eğer `agent.html` sayfasına bir admin veya TL dışı biri sızmaya çalışırsa login sayfasına geri postala.
4. **Veri Performansı:** CSV'den 1000'lerce satır gelebileceği için tablonun altına basit bir sayfalama (Pagination - Sayfa 1, 2, 3...) mekanizması kur ki tarayıcı kasmasın.
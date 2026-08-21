# Clinic Planning & Appointment Alarm Management — Yol Haritası

**Kaynak talep:** `Clinic_Planning_Appointment_Alarm_Management_Jira_Request.md` (JIRA spec)
**Bu doküman:** Spec'in gerçek Zoho/Supabase verisiyle eşleştirilmiş, uygulanabilir hale getirilmiş versiyonu.
**Durum:** Planlama tamamlandı, geliştirme başlamadı.

---

## 1. Neden Bu Doküman Var

JIRA spec, Clinic Planning sürecini soyut kavramlarla tarif ediyor (Hotel Required, WhatsApp Group Status, Interpreter, Doctor, vb.). Bu doküman o kavramları **gerçek Zoho `deals.raw` alanlarına** ve **gerçek `zoho_users` rollerine** eşleştiriyor, hangi kısmın zaten hazır olduğunu, hangisinin eksik olduğunu ve hangi sırayla yapılacağını netleştiriyor.

Canlı veri üzerinde (3432 aktif deal, 1000 örnek) doğrulandı — spekülasyon değil.

---

## 2. Büyük Bulgu: Stage Workflow Zaten Var

JIRA spec'in beklediği "Appointment Process Stage" akışı **zaten Zoho'da yaşıyor** ve mevcut `alarm-engine.js` bunu zaten aktif kabul ediyor (`ACTIVE_STAGES`):

```
Waiting hotel confirmation → Waiting appointment → Appointment confirmed
    → Check in completed → Waiting next visit
```

Yani stage state machine'ini sıfırdan kurmaya gerek yok. Yapılması gereken: bu stage'lerdeki dealler için **eksik-alan kontrolü (alarm)** eklemek.

---

## 3. Zoho Alan Eşleştirmesi (Ground Truth)

| JIRA Kavramı | Gerçek Zoho Alanı (`deals.raw`) | Örnek/Gözlemlenen Değerler |
|---|---|---|
| Appointment Process Stage | `Stage` | Waiting hotel confirmation, Waiting appointment, Appointment confirmed, Check in completed, Waiting next visit, Won, Cancelled |
| Sales TL Approval | `Teamleader_Approved` (bool), `Approval` | true/false, "Approved" |
| Clinic Planning Started | `Sent_to_Planning` (bool) | true/false |
| Planning Responsible | `Planning_Owner` | isim |
| Hotel Required | `Hotel` | Yes / No |
| Hotel Name | `Hotel_Name` | {id, name} |
| Hotel Confirmation Status | `Hotel_Status` | Reserved / Pending / (boş) |
| WhatsApp Group | `WA_Group` + `WA_Status` | "Team X (Habiba)" / "Group opened" / "No WA" |
| Interpreter / Translator | `Translator` + `Translation_Group` | {id, name} |
| Examination / Consultation Date | `Consultation_Date` + `Consultation_Planned` | tarih / bool |
| Consultant (clinic) | `Profclinic_User` | {id, name} |
| Service Category | `Service_Category2` | Dental, Hair Transplant, Aesthetics, Bariatric... |
| Next Visit Date(leri) | `Visit_Date`, `Visit_Date1`, `Visit_Date2`, `Visit_Count` | tarih |
| Deal Won | `Stage = "Won"` | — |

### Zoho Users — Clinic/Translator Rolleri (gözlemlenen)
- `Translators Manager - Mehmet Demircan`, `Translators Manager - Sameh`
- `Profclinic`, `Profclinic Supervisor` (rol) + `Profclinic_User` (deal alanı, danışman ataması)
- `Planning`, `Data Entry`

---

## 4. Eksik / Ertelenen Alanlar (Hatırlatma Listesi)

Bunlar Faz 1 kapsamı **dışında** — kullanıcı onayıyla ertelendi, veri geldiğinde eklenecek:

- 🔔 **Doctor** — `Doctor` alanı 1000 kayıtta da tamamen boş. Zoho'da başka bir yerde tutuluyor ama Supabase'e henüz çekilmemiş. **Kullanıcı bunu Supabase'e çekecek, sonra Doctor Missing alarmı eklenecek.**
- 🔔 **Implant tespiti** — `deals.raw`'da yapısal bir "Implant: Yes/No" alanı yok (yalnızca 14 deal'de serbest metin `Description` içinde geçiyor). Ayrı bir Zoho Products/line-items modülünde olabilir, bu repoda senkronize edilmiyor. **Kullanıcı bu modülü Supabase'e çekecek.** O zamana kadar "Dental Won → otomatik Waiting Next Visit" geçiş kuralı **kurulmuyor**.
- ℹ️ **Deals senkronu** bu repo içinde değil — `deals` tablosu başka bir yerden (kullanıcının kontrolündeki bir süreçten) doluyor. Yeni alan ihtiyacı çıkarsa kullanıcı çekip haber verecek.

---

## 4b. Durum (2026-08-21)

Tümü `clinic-planning` dalında; **`main`'e alınmadı** — canlıda takım
liderleri hâlâ eski sürümü kullanıyor.

| Faz | Durum | Not |
|---|---|---|
| Faz 1 — Yeni alarm kontrolleri | ✅ | 7 tip canlıda üretiyor: hotel 36, whatsapp 137, interpreter 148, exam 27, consultant 20, must_be_won 1, next_visit 2 |
| Faz 2 — Eskalasyon | ✅ | `escalation_level` kolonu kurulu, eşikler `app_settings`'te (24,48,72). 359 alarm seviye 1'de; henüz 48 saati aşan alarm yok, seviye 2/3'ün boş olması beklenen davranış |
| Faz 3 — Sohbet | ✅ | `clinic_messages` kurulu, 4 pencereden erişiliyor (alarm, deal, Won, İptal) |
| Faz 3 — Görev atama | ⏳ | Kod hazır; **`clinic_assignments.sql` çalıştırılmayı bekliyor** |
| Faz 4 / 5 / 6 | ⛔ | Başlanmadı |

**Bilinen boşluk:** Klinik tarafı henüz mesajları okuyamıyor — `clinic-staff.html`
(Faz 6) yok. WhatsApp üzerinden iletim ölçüldü ve elendi: 12 klinik
muhatabının yalnızca 1'inin telefonu kayıtlı (%8). Görevleri "Tamamlandı"ya
çeken taraf da o panel olacak.

---

## 5. Faz Planı

### FAZ 1 — Alarm Motoruna Yeni Kontroller
**Dosya:** `alarm-engine.js` (mevcut `computeAlarms()` fonksiyonuna ekleme)
**Risk:** Düşük — yeni tablo yok, mevcut dedup/auto-close mimarisi (`dedup_key`, `insertAlarms`, `closeStale*`) aynen kullanılıyor.
**Canlı veride doğrulanan etki (3432 aktif deal üzerinde):**

| Yeni Alarm Tipi | Kural | Etkilenen Deal (şu an) |
|---|---|---|
| `hotel_missing` | Stage=Waiting hotel confirmation AND Hotel=Yes AND (Hotel_Status≠Confirmed veya Hotel_Name boş) | 37 |
| `whatsapp_missing` | Gelişe ≤15 gün AND WA_Status≠"Group opened" | 202 |
| `interpreter_missing` | Gelişe ≤15 gün AND Translator boş | 222 |
| `exam_date_missing` | Gelişe ≤15 gün AND Consultation_Date boş | 37 |
| `consultant_missing_after_arrival` | Stage=Check in completed AND Profclinic_User boş | 20 |
| `must_be_won` | Stage=Check in completed AND Total_Paid_Amount≥Amount AND Stage≠Won AND Service_Category2≠Dental | 1 |
| `next_visit_date_missing` | Stage=Waiting next visit AND Visit_Date/1/2 hepsi boş | 2 |

Her alarm tipi: alan doldurulunca otomatik kapanır (mevcut `closeStaleArrivalMissing` deseniyle), duplicate önleme aynı `dedup_key` mantığıyla.

**Kapsam dışı (Faz 1'de yok):** Doctor Missing, Dental+Implant→Next Visit otomatik geçişi (bkz. Bölüm 4).

---

### FAZ 2 — Reminder / Escalation
**Dosya:** `alarm-engine.js` + `alarm_logs` + `app_settings`
Açık kalan clinic alarmları için zaman bazlı eskalasyon:
```
Open > 24 saat  → Reminder
Open > 48 saat  → Team Leader Escalation
Open > 72 saat  → Management Escalation
```
SLA süreleri `app_settings` üzerinden alarm tipine göre configurable olacak (mevcut `alarm_thresholds` deseni gibi).

---

### FAZ 3 — Deal Bazlı Chat + Assignment (İlk konuşulan ihtiyaç)
**Yeni tablolar:**
```sql
clinic_messages (id, deal_id, sent_from_id, sent_from_name, sent_to_id, sent_to_role,
                  message_text, related_alarm_id, created_at, read_at, read_by)

clinic_assignments (id, deal_id, assigned_by_id, assigned_to_id, assigned_to_role,
                     action_type, description, priority, due_date, related_alarm_id,
                     status, created_at, resolved_at, resolved_by)
```
**Akış:** Takım lideri deal içinde "Clinic'e Bildir" butonuna basıyor → tercümana/clinic TL'ye mesaj gidiyor → clinic tarafı okuyor, aksiyon alıyor veya "yapamadım" diyor → tüm geçmiş deal üzerinde audit olarak kalıyor (kim ne zaman ne yaptı/yapmadı görünür).

**Not:** Otomatik çeviri (Arabic→English, JIRA spec Bölüm 21) bu fazda opsiyonel — ilk versiyonda kapsam dışı bırakılabilir, sonradan eklenir.

---

### FAZ 4 — Clinic Team Leader Operasyon Dashboard
Sekmeli görünüm (mevcut admin.html/team-leader.html panel desenleri üzerine):
```
All · Planning Required · Waiting Hotel · Waiting Appointment · Appointment Confirmed
Arriving Soon · Check-in Completed · Must Be Won · Waiting Next Visit
Critical Alarms · Resolved
```

---

### FAZ 5 — Sales Team Leader Clinic İzleme Ekranı
Takım liderinin kendi ekibinin deal'larının clinic sürecini gördüğü yeni sekme. Filtreler: Region/Team (mevcut "Lider Takibi" sayfasında az önce eklediğimiz desenle aynı), Days to Arrival, Service Category, Missing WhatsApp/Interpreter/Doctor, Check-in & Not Won, Waiting Next Visit.

---

### FAZ 6 — Clinic Staff (Danışman/Tercüman) Paneli
Yeni panel: `clinic-staff.html`. Danışmanlar/tercümanlar kendi kullanıcı adlarıyla giriş yapıyor, kendilerine atanan görevleri/mesajları görüyor, "Tamamlandı" işaretleyebiliyorlar. RLS ile sadece kendi atanmış deal'larını görürler.

---

## 6. Önerilen Uygulama Sırası

1. **Faz 1** — en düşük risk, en somut fayda, mevcut motora ekleme (yeni tablo yok)
2. **Faz 3** — kullanıcının ilk konuştuğu asıl ihtiyaç (clinic'e mesaj/hesap verebilirlik)
3. **Faz 4 / Faz 5** — görselleştirme (Faz 1+3 verisi olmadan bu ekranların anlamı yok)
4. **Faz 2** — eskalasyon (Faz 1 alarmları stabilize olduktan sonra)
5. **Faz 6** — clinic staff'a doğrudan erişim (en çok organizasyonel hazırlık gerektiren, en son)

---

## 7. Açık Kalan Kararlar

- [ ] Doctor verisi Supabase'e çekildiğinde → Doctor Missing alarmı eklenecek
- [ ] Implant/Products modülü Supabase'e çekildiğinde → Dental+Implant Next Visit otomatik geçiş kuralı eklenecek
- [ ] Faz 3'te otomatik çeviri (Arabic→English) ilk versiyona dahil mi, sonraya mı bırakılıyor — karar bekleniyor
- [ ] Clinic Team Leader'ın deal'a atanması hangi kural ile olacak (region bazlı mı, Profclinic_User'dan mı türetilecek) — netleştirilmeli

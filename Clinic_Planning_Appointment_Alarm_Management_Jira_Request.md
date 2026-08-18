# Clinic Planning & Appointment Process Alarm Management

## 1. Doküman Bilgileri

**Talep Adı:** Clinic Planning & Appointment Process Alarm Management  
**Talep Tipi:** Epic / Ana Geliştirme Talebi  
**Kapsam:** Clinic Planning, Appointment, Check-in, Won, Dental Next Visit, Alarm Yönetimi, Sales TL–Clinic TL İletişimi  
**Öncelik:** High  
**Talep Sahibi:** Mertay  
**İlgili Ekipler:** Sales, Clinic, Planning, CRM/Development, Operations  
**Planlama Süreci Kaynağı:** Clinic planlama alanları, zorunlu bilgiler ve operasyon kuralları Mehmet Demircan'dan alınarak nihai hale getirilmelidir.

---

# 2. Talebin Amacı

Clinic operasyonlarında müşterinin satış sonrasından tedavi ve takip sürecine kadar ilerlediği tüm kritik adımların sistem tarafından takip edilmesi amaçlanmaktadır.

Sistem yalnızca bir Deal'ın hangi statüde olduğunu göstermemeli; bulunduğu statünün gerektirdiği bilgilerin ve işlemlerin gerçekten tamamlanıp tamamlanmadığını da kontrol etmelidir.

Bu yapı ile;

- Yaklaşan müşterilerin planlama süreçlerinin gecikmesi,
- Otel bilgilerinin hazırlanmaması,
- WhatsApp grubunun açılmaması,
- Tercüman atamasının yapılmaması,
- Doktor veya muayene tarihinin girilmemesi,
- Check-in Completed olmasına rağmen Deal'ın Won'a alınmaması,
- Dental implant müşterilerinde sonraki ziyaret tarihinin girilmemesi,
- Sales ve Clinic ekipleri arasındaki iletişimin Deal dışında kalması,
- Aynı hata için tekrar tekrar duplicate alarm oluşması

gibi operasyonel problemlerin sistem tarafından otomatik tespit edilmesi hedeflenmektedir.

---

# 3. Beklenen Ana İş Akışı

Ana süreç aşağıdaki şekilde çalışmalıdır:

```text
Sales Team Leader Deal Approval
        |
        v
Clinic Planning Started
        |
        v
Waiting Hotel Confirmation
        |
        v
Waiting Appointment
        |
        v
Appointment Confirmed
        |
        v
Patient Arrival
        |
        v
Consultant Assigned
        |
        v
Check-in Completed
        |
        v
Payment / Treatment Control
        |
        +-----------------------------+
        |                             |
        | Non-Dental                  | Dental + Implant
        v                             v
Deal Won                       Deal Won
                                      |
                                      v
                              Waiting Next Visit
                                      |
                                      v
                              Next Visit Planned
```

Sistem her aşamada eksik veri, gecikme veya yanlış statü kullanımını kontrol etmelidir.

---

# 4. Genel İş Kuralları

## 4.1 Deal Bazlı Süreç Takibi

Her Clinic müşterisinin planlama süreci ilgili Deal üzerinden takip edilmelidir.

Deal aşağıdaki bilgileri merkezi olarak taşımalıdır:

- Patient / Customer
- Deal ID
- Sales Agent
- Sales Team Leader
- Clinic Team Leader
- Planning Responsible
- Service Category
- Product / Treatment Details
- Estimated Arrival Date
- Arrival Date
- Hotel Information
- Hotel Confirmation Status
- Doctor
- Examination Date
- Appointment Date
- Interpreter Requirement
- Interpreter
- WhatsApp Group
- Consultant
- Check-in Date
- Payment Status
- Deal Won Status
- Next Visit Requirement
- Next Visit Date
- Planning Status
- Appointment Status
- Open Alarm Count
- Last Action
- Last Update

---

# 5. Clinic Planning Sürecinin Başlatılması

## 5.1 Başlangıç Trigger'ı

Sales Team Leader ilgili Deal'ı satış açısından onayladıktan sonra Clinic Planning süreci başlatılmalıdır.

Önerilen trigger:

```text
Sales TL Approval = Approved
```

Sonrasında:

```text
Clinic Planning Status = Not Started
```

olan kayıt Planning kuyruğuna düşmelidir.

Planning ekibi işlemi aldığında:

```text
Clinic Planning Status = In Planning
```

olmalıdır.

---

# 6. Waiting Hotel Confirmation Süreci

## 6.1 Amaç

Müşterinin Clinic ziyareti öncesinde gerekli otel bilgisinin hazırlanması ve doğrulanması.

## 6.2 Beklenen Alanlar

- Hotel Required
- Hotel Name
- Hotel Check-in Date
- Hotel Check-out Date
- Hotel Confirmation Status
- Hotel Confirmation Date
- Hotel Notes

## 6.3 Statü

Otel planlaması gerekiyorsa ve otel henüz tamamlanmadıysa:

```text
Appointment Process Stage = Waiting Hotel Confirmation
```

## 6.4 Alarm Koşulları

Aşağıdaki durumlardan biri varsa alarm oluşmalıdır:

```text
Estimated Arrival Date <= 15 gün
AND
Hotel Required = Yes
AND
Hotel Confirmation Status != Confirmed
```

veya

```text
Hotel Required = Yes
AND
Hotel Name = Empty
```

## 6.5 Alarm

**Alarm Type:** Hotel Planning Missing  
**Responsible Team:** Planning / Clinic  
**Priority:** Arrival date'e kalan güne göre dinamik

---

# 7. Waiting Appointment Süreci

## 7.1 Amaç

Otel sürecinden sonra müşterinin Clinic randevu bilgilerinin hazırlanması.

## 7.2 Zorunlu Bilgiler

Minimum:

- Estimated Arrival Date
- Doctor
- Examination Date / Appointment Date
- Clinic / Location
- Interpreter Status
- WhatsApp Group Status
- Planning Responsible

## 7.3 Statü

Gerekli randevu bilgileri henüz tamamlanmadıysa:

```text
Appointment Process Stage = Waiting Appointment
```

## 7.4 Geçiş Kuralı

Aşağıdaki kritik bilgiler tamamlanmadan Deal doğrudan `Appointment Confirmed` statüsüne geçirilememelidir:

```text
Estimated Arrival Date != Empty
Doctor != Empty
Examination Date != Empty
Clinic Planning Status != Not Started
```

İlave zorunlu alanlar Mehmet Demircan ile yapılacak planlama süreci analizi sonrasında kesinleştirilmelidir.

---

# 8. Appointment Confirmed Süreci

## 8.1 Tanım

Planning ekibi müşterinin geliş ve Clinic planlamasını tamamladığında Deal:

```text
Appointment Process Stage = Appointment Confirmed
```

olmalıdır.

## 8.2 Minimum Tamamlanma Kriterleri

- Estimated Arrival Date girilmiş
- Doctor atanmış
- Examination Date / Appointment Date girilmiş
- Clinic bilgisi hazır
- Planning sorumlusu belli
- Tercüman gerekiyorsa atanmış
- WhatsApp Group oluşturulmuş veya oluşturulması için aktif aksiyon bulunuyor
- Gerekli otel bilgisi tamamlanmış

## 8.3 Kontrol Mantığı

Sistem sadece kullanıcı tarafından statü değiştirilmesine güvenmemelidir.

Örneğin:

```text
IF Appointment Process Stage = Appointment Confirmed
AND Doctor = Empty
THEN Alarm = Doctor Missing
```

Bu yaklaşım bütün kritik alanlarda uygulanmalıdır.

---

# 9. 15 Gün Kala Otomatik Clinic Readiness Kontrolü

## 9.1 Trigger

Her Deal için:

```text
Days to Arrival = Estimated Arrival Date - Today
```

hesaplanmalıdır.

```text
IF Days to Arrival <= 15
THEN Run Clinic Planning Readiness Check
```

## 9.2 Kontrol Edilecek Minimum Alanlar

- WhatsApp Group
- Interpreter
- Hotel
- Doctor
- Examination Date
- Clinic Planning Status
- Clinic Team Leader
- Planning Responsible

## 9.3 Readiness Mantığı

Önerilen bir skor üretilebilir:

```text
Clinic Planning Readiness = Completed Items / Required Items
```

Örnek:

```text
4 / 7 Completed
```

veya:

```text
57% Ready
```

## 9.4 Kritik Seviyeler

Örnek:

- 15–11 gün: Warning
- 10–6 gün: High
- 5–0 gün: Critical

Bu süreler yapılandırılabilir olmalıdır.

---

# 10. WhatsApp Group Yönetimi

## 10.1 İş Kuralı

Clinic sürecine girecek her uygun Deal için WhatsApp grubu takip edilmelidir.

## 10.2 Alanlar

- WhatsApp Group Required
- WhatsApp Group Status
- WhatsApp Group Link
- WhatsApp Group Created Date
- WhatsApp Group Created By

## 10.3 Alarm

```text
IF Days to Arrival <= 15
AND WhatsApp Group Required = Yes
AND WhatsApp Group Status != Created
THEN Create Alarm
```

**Alarm Type:** WhatsApp Group Missing

## 10.4 Kapanma Koşulu

```text
WhatsApp Group Status = Created
AND WhatsApp Group Link != Empty
```

olduğunda alarm otomatik kapanabilmelidir.

---

# 11. Interpreter / Translator Yönetimi

## 11.1 Alanlar

- Interpreter Required
- Interpreter
- Interpreter Language
- Interpreter Status
- Interpreter Assigned Date
- Interpreter Assigned By

## 11.2 Alarm Koşulu

```text
IF Days to Arrival <= 15
AND Interpreter Required = Yes
AND Interpreter = Empty
THEN Create Alarm
```

**Alarm Type:** Interpreter Missing

## 11.3 Kapanma Koşulu

```text
Interpreter != Empty
AND Interpreter Status IN (Assigned, Confirmed)
```

---

# 12. Doctor ve Examination Date Kontrolleri

## 12.1 Doctor Missing

```text
IF Appointment Process Stage IN (
    Waiting Appointment,
    Appointment Confirmed
)
AND Days to Arrival <= 15
AND Doctor = Empty
THEN Create Alarm
```

**Alarm Type:** Doctor Missing

## 12.2 Examination Date Missing

```text
IF Days to Arrival <= 15
AND Examination Date = Empty
THEN Create Alarm
```

**Alarm Type:** Examination Date Missing

## 12.3 Appointment Confirmed Tutarsızlığı

```text
IF Appointment Process Stage = Appointment Confirmed
AND Examination Date = Empty
THEN Create Critical Alarm
```

Bu durum statü-data uyumsuzluğu olarak ayrıca raporlanmalıdır.

---

# 13. Patient Arrival ve Check-in Completed Süreci

## 13.1 Tanım

Hasta fiziksel olarak Clinic'e geldiğinde ve ilgili danışmanı atandığında:

```text
Appointment Process Stage = Check-in Completed
```

olmalıdır.

## 13.2 Minimum Kontroller

- Patient Arrived = Yes
- Consultant != Empty
- Check-in Date != Empty
- Clinic Responsible != Empty

## 13.3 Eksik Danışman Alarmı

```text
IF Patient Arrived = Yes
AND Consultant = Empty
THEN Create Alarm
```

**Alarm Type:** Consultant Missing After Arrival

---

# 14. Check-in Completed Fakat Won Olmayan Deal Alarmı

## 14.1 İş Kuralı

Hasta Clinic'e gelmiş, ödeme süreci tamamlanmış ve Deal dental değilse, ilgili Deal'ın artık Won'a alınması beklenmelidir.

## 14.2 Trigger

```text
Appointment Process Stage = Check-in Completed
AND Payment Status = Completed
AND Deal Status != Won
AND Service Category != Dental
```

## 14.3 Sistem Aksiyonu

Clinic Team Leader'a otomatik alarm oluşturulmalıdır.

**Alarm Type:** Deal Must Be Moved to Won  
**Responsible Team:** Clinic  
**Responsible Role:** Clinic Team Leader

## 14.4 Alarm Açıklaması

```text
Patient check-in and payment processes have been completed.
The Deal has not been moved to Won.
Please review and complete the Deal status.
```

## 14.5 Kapanma Koşulu

```text
Deal Status = Won
```

olduğunda alarm otomatik kapanmalıdır.

---

# 15. Dental Deal İstisnası

Dental Deal'lar standart Clinic Deal'larından ayrı ele alınmalıdır.

Özellikle Treatment / Product içerisinde implant varsa müşteri ilk ziyaret sonrasında tekrar gelecektir.

Bu nedenle:

```text
Service Category = Dental
AND Product/Treatment contains Implant
AND Deal Status = Won
```

olduğunda süreç tamamen kapanmamalıdır.

---

# 16. Dental + Implant → Waiting Next Visit

## 16.1 Trigger

```text
Service Category = Dental
AND Implant = Yes
AND Deal Status = Won
```

## 16.2 Beklenen Sistem Davranışı

```text
Appointment Process Stage = Waiting Next Visit
Next Visit Required = Yes
```

olmalıdır.

## 16.3 Next Visit Alanları

- Next Visit Required
- Next Visit Date
- Next Visit Doctor
- Next Visit Clinic
- Next Visit Interpreter
- Next Visit Hotel Requirement
- Next Visit Notes
- Next Visit Status
- Next Visit Created Date

---

# 17. Next Visit Date Missing Alarmı

## 17.1 Trigger

```text
Appointment Process Stage = Waiting Next Visit
AND Next Visit Required = Yes
AND Next Visit Date = Empty
```

## 17.2 Alarm

**Alarm Type:** Next Visit Date Missing  
**Responsible Team:** Clinic  
**Responsible Role:** Clinic Team Leader

## 17.3 Kapanma Koşulu

```text
Next Visit Date != Empty
```

olduğunda alarm otomatik kapanmalıdır.

## 17.4 İleri Seviye Kontrol

Next Visit Date girildikten sonra ikinci ziyaret için de yeniden planning readiness süreci çalışmalıdır.

Örneğin:

```text
Next Visit Date - Today <= 15
```

olduğunda ikinci ziyaret için;

- Hotel
- Interpreter
- Doctor
- Appointment
- WhatsApp iletişimi

yeniden kontrol edilebilir.

---

# 18. Sales Team Leader Clinic Planning Takip Ekranı

## 18.1 Amaç

Sales Team Leader'ın kendi ekibinin yaptığı satışların Clinic operasyonlarını görünür şekilde takip edebilmesi.

## 18.2 Yetki

Sales TL sadece kendi ekibindeki agent'lara ait Deal'ları görmelidir.

```text
Deal Sales Agent.Team Leader = Logged-in Sales TL
```

## 18.3 Görüntülenecek Alanlar

| Alan | Açıklama |
|---|---|
| Patient | Müşteri |
| Deal ID | Deal ID |
| Sales Agent | Satışı yapan kullanıcı |
| Sales TL | Sales Team Leader |
| Service Category | Dental / Hair / Other |
| Estimated Arrival | Tahmini geliş tarihi |
| Days to Arrival | Gelişe kalan gün |
| Hotel Status | Missing / Pending / Confirmed |
| WhatsApp Group | Missing / Created |
| Interpreter | Missing / Assigned / Confirmed |
| Doctor | Atanmış doktor |
| Examination Date | Muayene tarihi |
| Appointment Stage | Mevcut appointment aşaması |
| Planning Status | Planlama durumu |
| Consultant | Clinic danışmanı |
| Check-in | Pending / Completed |
| Payment Status | Ödeme durumu |
| Deal Status | Won / Not Won |
| Next Visit | Required / Planned / Missing |
| Clinic TL | Sorumlu Clinic TL |
| Open Alarm Count | Açık alarm sayısı |
| Highest Alarm Priority | En kritik alarm |
| Last Action | Son işlem |
| Last Update | Son güncelleme |

## 18.4 Filtreler

Minimum:

- Arrival Date
- Days to Arrival
- Sales Agent
- Sales Team Leader
- Clinic Team Leader
- Service Category
- Planning Status
- Appointment Stage
- Missing WhatsApp Group
- Missing Interpreter
- Missing Doctor
- Missing Examination Date
- Check-in Completed & Not Won
- Waiting Next Visit
- Next Visit Date Missing
- Alarm Priority

---

# 19. Clinic Team Leader Operasyon Ekranı

Clinic Team Leader kendi sorumluluğundaki açık aksiyonları tek ekranda görebilmelidir.

Önerilen sekmeler:

```text
All
Planning Required
Waiting Hotel
Waiting Appointment
Appointment Confirmed
Arriving Soon
Check-in Completed
Must Be Won
Waiting Next Visit
Critical Alarms
Resolved
```

---

# 20. Deal Bazlı Sales TL ↔ Clinic TL Chat Sistemi

## 20.1 Amaç

Sales ve Clinic Team Leader'ların ilgili müşteri hakkında farklı iletişim kanallarına gitmeden Deal içerisinde iletişim kurabilmesi.

## 20.2 Chat Özellikleri

Her Deal'a özel chat alanı bulunmalıdır.

Minimum:

- Sender
- Receiver / Assigned Team
- Message
- Original Language
- Translated Message
- Created Date
- Read Status
- Related Alarm
- Attachment support ihtiyacı ayrıca değerlendirilebilir

## 20.3 Örnek

Alarm:

```text
Deal Must Be Moved to Won
```

Sales TL:

```text
The patient completed the clinic process.
Could you please check why the Deal is still not Won?
```

Clinic TL aynı Deal üzerinden cevap verebilmelidir.

---

# 21. Otomatik Mesaj Çevirisi

## 21.1 İş Kuralı

Farklı dillerde çalışan Team Leader'ların iletişimi için chat mesajlarının otomatik çevirisi desteklenmelidir.

Özellikle:

```text
Arabic -> English
```

desteklenmelidir.

## 21.2 Veri Saklama

Orijinal mesaj silinmemelidir.

Önerilen yapı:

```text
Original Language: Arabic
Original Message: ...
Translated Language: English
Translated Message: ...
```

Kullanıcı:

```text
Show Original
```

aksiyonu ile orijinal mesajı görüntüleyebilmelidir.

---

# 22. Deal Bazlı Atama Sistemi

Sales TL ve Clinic TL ilgili Deal içerisinden birbirlerine aksiyon atayabilmelidir.

## 22.1 Atama Alanları

- Assigned By
- Assigned To
- Assigned Team
- Action Type
- Description
- Priority
- Due Date
- Related Deal
- Related Alarm
- Status
- Created Date
- Completed Date

## 22.2 Statüler

```text
Open
In Progress
Waiting Information
Resolved
Cancelled
```

---

# 23. Merkezi Alarm Motoru

Bütün Clinic alarm kuralları merkezi bir alarm motoru üzerinden yönetilmelidir.

Her alarm aşağıdaki ortak yapıyı kullanmalıdır.

## 23.1 Alarm Alanları

- Alarm ID
- Deal ID
- Patient
- Alarm Type
- Alarm Category
- Alarm Description
- Priority
- Responsible Team
- Responsible User
- Created Date
- Due Date
- SLA
- Status
- Related Field
- Related Appointment Stage
- Resolved Date
- Resolved By
- Resolution Note
- Auto Closed
- Last Reminder Date

---

# 24. Alarm Öncelik Seviyeleri

Önerilen yapı:

## LOW

Bilgi eksik ancak operasyon henüz kritik seviyede değil.

## MEDIUM

Yaklaşan müşteri için eksik planlama bilgisi mevcut.

## HIGH

Müşteri gelişine kısa süre kalmış ve kritik alan eksik.

## CRITICAL

Müşteri gelmiş veya operasyon tamamlanmış olmasına rağmen Deal süreci ilerletilmemiş.

Örnek Critical:

```text
Check-in Completed
Payment Completed
Deal Not Won
```

---

# 25. Duplicate Alarm Engelleme

Aynı Deal + aynı Alarm Type için aktif alarm varken yeni alarm oluşturulmamalıdır.

Örnek:

```text
Deal ID = 12345
Alarm Type = Next Visit Date Missing
Status = Open
```

ise ertesi gün aynı alarm tekrar oluşturulmamalıdır.

Sistem mevcut alarmı güncellemelidir.

Önerilen unique kontrol:

```text
Deal ID + Alarm Type + Related Process Instance
```

---

# 26. Alarm Otomatik Kapanma Mantığı

Alarmı oluşturan problem ortadan kalktığında alarm otomatik kapanabilmelidir.

Örnekler:

### WhatsApp Group Missing

```text
WhatsApp Group Status = Created
-> Resolve Alarm
```

### Interpreter Missing

```text
Interpreter != Empty
-> Resolve Alarm
```

### Doctor Missing

```text
Doctor != Empty
-> Resolve Alarm
```

### Examination Date Missing

```text
Examination Date != Empty
-> Resolve Alarm
```

### Deal Must Be Moved to Won

```text
Deal Status = Won
-> Resolve Alarm
```

### Next Visit Date Missing

```text
Next Visit Date != Empty
-> Resolve Alarm
```

---

# 27. Reminder / Escalation Mantığı

Alarm açık kalırsa ilgili kullanıcılara tekrar hatırlatma yapılmalıdır.

Örnek:

```text
Open > 24 Hours -> Reminder
Open > 48 Hours -> Team Leader Escalation
Open > 72 Hours -> Management Escalation
```

SLA değerleri alarm tipine göre configurable olmalıdır.

---

# 28. Audit Log / History

Tüm kritik işlemler saklanmalıdır.

Minimum:

- Statü değişikliği
- Planning Status değişikliği
- Appointment Stage değişikliği
- Doctor değişikliği
- Examination Date değişikliği
- Interpreter değişikliği
- WhatsApp Group eklenmesi
- Consultant ataması
- Check-in işlemi
- Won işlemi
- Next Visit Date değişikliği
- Alarm oluşturulması
- Alarm kapanması
- Assignment
- Chat mesajı

Her işlem için:

```text
Changed By
Old Value
New Value
Changed Date
```

saklanmalıdır.

---

# 29. Roller ve Yetkiler

## Sales Agent

- Kendi Deal bilgilerini görüntüleyebilir
- Kendisine izin verilen planning alanlarını görebilir
- Team Leader yetkisi gerektiren aksiyonları yapamaz

## Sales Team Leader

- Kendi ekibinin Deal'larını görür
- Clinic Planning durumunu takip eder
- Clinic TL'ye aksiyon atar
- Deal chat kullanır
- Açık Clinic alarmlarını görür

## Planning / Clinic User

- Kendisine atanmış planlama kayıtlarını yönetir
- İzin verilen planning alanlarını günceller

## Clinic Team Leader

- Clinic Planning kayıtlarını yönetir
- Alarm ve assignment yönetir
- Check-in sonrası gerekli Deal aksiyonlarını takip eder
- Gerekli koşullarda Deal'ın Won sürecini tamamlar
- Dental Next Visit sürecini takip eder

## Admin / Management

- Tüm kayıtları görebilir
- Alarm raporlarını inceleyebilir
- SLA ve süreç performansını takip edebilir

---

# 30. Alt Görevler / Jira Sub-Tasks

## SUB-TASK 01 — Clinic Planning Workflow Analysis

**Amaç:** Mehmet Demircan ile mevcut planlama sürecinin analiz edilmesi.

**Çıktılar:**
- Zorunlu alan listesi
- Planlama sorumluları
- Statü geçişleri
- Hotel workflow
- Appointment workflow
- Doctor assignment workflow
- Examination workflow
- Interpreter workflow
- WhatsApp Group workflow
- Tamamlanma kriterleri
- SLA beklentileri

---

## SUB-TASK 02 — Create Clinic Planning Deal Fields

Clinic Planning için gerekli CRM/Deal alanlarının oluşturulması.

---

## SUB-TASK 03 — Implement Appointment Stage Workflow

Aşağıdaki statülerin oluşturulması ve geçiş kurallarının uygulanması:

- Waiting Hotel Confirmation
- Waiting Appointment
- Appointment Confirmed
- Check-in Completed
- Waiting Next Visit

---

## SUB-TASK 04 — Implement 15-Day Clinic Readiness Engine

Arrival Date'e 15 gün kala Clinic readiness kontrolünün otomatik çalıştırılması.

---

## SUB-TASK 05 — Implement Hotel Planning Alarm

Eksik veya onaylanmamış otel bilgileri için alarm.

---

## SUB-TASK 06 — Implement WhatsApp Group Missing Alarm

Eksik WhatsApp Group için otomatik alarm.

---

## SUB-TASK 07 — Implement Interpreter Missing Alarm

Eksik tercüman ataması için otomatik alarm.

---

## SUB-TASK 08 — Implement Doctor Missing Alarm

Yaklaşan müşterilerde doktor ataması yapılmadıysa alarm.

---

## SUB-TASK 09 — Implement Examination Date Missing Alarm

Muayene / appointment tarihi eksikse alarm.

---

## SUB-TASK 10 — Implement Consultant Missing After Arrival Alarm

Hasta geldiği halde danışman atanmadıysa alarm.

---

## SUB-TASK 11 — Implement Check-in Completed / Not Won Alarm

Non-Dental müşterilerde:

```text
Check-in Completed
+ Payment Completed
+ Deal Not Won
```

durumunda Clinic TL'ye alarm.

---

## SUB-TASK 12 — Implement Dental Implant Next Visit Workflow

Dental + Implant + Won Deal'larının `Waiting Next Visit` sürecine alınması.

---

## SUB-TASK 13 — Implement Next Visit Date Missing Alarm

Waiting Next Visit kayıtlarında Next Visit Date eksikse alarm.

---

## SUB-TASK 14 — Implement Repeat Planning for Next Visit

İkinci ziyaret yaklaşırken yeni 15 günlük planlama kontrolünün çalıştırılması.

---

## SUB-TASK 15 — Create Sales TL Clinic Monitoring Screen

Sales TL'nin kendi ekibine ait Clinic süreçlerini takip edebileceği ekran.

---

## SUB-TASK 16 — Create Clinic TL Action Dashboard

Clinic TL'nin tüm açık planning ve alarm aksiyonlarını takip edebileceği ekran.

---

## SUB-TASK 17 — Implement Deal-Level Chat

Sales TL ve Clinic TL arasında Deal bazlı chat.

---

## SUB-TASK 18 — Implement Automatic Chat Translation

Özellikle Arabic -> English otomatik çeviri.

---

## SUB-TASK 19 — Implement Deal-Level Assignment

Team Leader'ların birbirlerine Deal bazlı aksiyon ataması.

---

## SUB-TASK 20 — Implement Central Clinic Alarm Engine

Tüm alarm kurallarının ortak bir yapıdan yönetilmesi.

---

## SUB-TASK 21 — Implement Duplicate Alarm Prevention

Aynı problem için tekrar tekrar alarm oluşmasının engellenmesi.

---

## SUB-TASK 22 — Implement Auto Resolution Rules

Eksik veri tamamlanınca alarmın otomatik kapanması.

---

## SUB-TASK 23 — Implement Reminder & Escalation Rules

Açık kalan alarm ve aksiyonlar için reminder ve escalation.

---

## SUB-TASK 24 — Implement Audit Log

Clinic Planning ve alarm süreçlerindeki tüm değişikliklerin kaydedilmesi.

---

# 31. Kabul Kriterleri

1. Sales TL Deal'ı onayladıktan sonra Clinic Planning süreci başlatılabilmelidir.
2. Clinic Planning statüsü Deal bazında takip edilebilmelidir.
3. Waiting Hotel Confirmation süreci desteklenmelidir.
4. Waiting Appointment süreci desteklenmelidir.
5. Appointment Confirmed için gerekli zorunlu bilgiler kontrol edilmelidir.
6. Arrival Date'e 15 gün kala otomatik readiness kontrolü yapılmalıdır.
7. WhatsApp Group eksikse alarm oluşmalıdır.
8. Interpreter gerekli ancak atanmadıysa alarm oluşmalıdır.
9. Doctor eksikse alarm oluşmalıdır.
10. Examination Date eksikse alarm oluşmalıdır.
11. Hasta geldiğinde ve consultant atandığında Check-in Completed süreci desteklenmelidir.
12. Check-in Completed + Payment Completed + Non-Dental + Not Won durumunda Clinic TL'ye alarm gitmelidir.
13. Dental + Implant Deal'ları Won sonrasında Waiting Next Visit durumuna geçmelidir.
14. Waiting Next Visit aşamasında Next Visit Date eksikse alarm oluşmalıdır.
15. Next Visit Date girildiğinde ilgili alarm kapanmalıdır.
16. Sales TL sadece kendi ekibinin Clinic Planning süreçlerini görüntüleyebilmelidir.
17. Clinic TL kendi sorumluluğundaki alarmları ve aksiyonları yönetebilmelidir.
18. Sales TL ve Clinic TL Deal bazlı mesajlaşabilmelidir.
19. Arapça mesajların İngilizce çevirisi gösterilebilmelidir.
20. Orijinal mesaj saklanmalıdır.
21. Team Leader'lar birbirlerine Deal bazlı aksiyon atayabilmelidir.
22. Aynı alarm tekrar tekrar oluşturulmamalıdır.
23. Alarmı oluşturan problem giderildiğinde alarm otomatik kapanabilmelidir.
24. Tüm kritik hareketler audit log'da tutulmalıdır.
25. Alarm ve planning geçmişi Deal kapansa dahi görüntülenebilmelidir.

---

# 32. Test Senaryoları

## Test 01 — Normal Planning

**Given**
- Sales TL Deal'ı onayladı.
- Planning başladı.
- Hotel tamamlandı.
- Doctor atandı.
- Examination Date girildi.
- Interpreter atandı.
- WhatsApp Group oluşturuldu.

**When**
Planning tamamlanır.

**Then**
```text
Appointment Process Stage = Appointment Confirmed
```

olmalı ve açık planning alarmı bulunmamalıdır.

---

## Test 02 — Hotel Eksik

**Given**
- Arrival Date'e 10 gün kaldı.
- Hotel Required = Yes.
- Hotel Confirmation boş.

**Then**
`Hotel Planning Missing` alarmı oluşmalıdır.

---

## Test 03 — WhatsApp Group Eksik

**Given**
- Arrival Date'e 15 gün kaldı.
- WhatsApp Group Status = Not Created.

**Then**
`WhatsApp Group Missing` alarmı oluşmalıdır.

---

## Test 04 — Interpreter Eksik

**Given**
- Interpreter Required = Yes.
- Interpreter boş.
- Arrival Date'e 12 gün kaldı.

**Then**
`Interpreter Missing` alarmı oluşmalıdır.

---

## Test 05 — Doctor Eksik

**Given**
- Appointment süreci devam ediyor.
- Arrival Date'e 8 gün kaldı.
- Doctor boş.

**Then**
`Doctor Missing` alarmı oluşmalıdır.

---

## Test 06 — Examination Date Eksik

**Given**
- Arrival Date'e 7 gün kaldı.
- Doctor atanmış.
- Examination Date boş.

**Then**
`Examination Date Missing` alarmı oluşmalıdır.

---

## Test 07 — Appointment Confirmed Tutarsızlığı

**Given**
- Appointment Stage = Appointment Confirmed.
- Examination Date boş.

**Then**
Sistem kritik data consistency alarmı oluşturmalıdır.

---

## Test 08 — Hasta Geldi, Consultant Yok

**Given**
- Patient Arrived = Yes.
- Consultant boş.

**Then**
`Consultant Missing After Arrival` alarmı oluşmalıdır.

---

## Test 09 — Check-in Completed Fakat Won Değil

**Given**
- Stage = Check-in Completed.
- Payment Status = Completed.
- Service Category = Hair Transplant.
- Deal Status != Won.

**Then**
`Deal Must Be Moved to Won` alarmı Clinic TL'ye gitmelidir.

---

## Test 10 — Alarm Won Sonrası Kapanır

**Given**
- `Deal Must Be Moved to Won` alarmı açık.

**When**
Deal Won yapılır.

**Then**
Alarm otomatik Resolved olmalıdır.

---

## Test 11 — Dental Implant

**Given**
- Service Category = Dental.
- Implant = Yes.
- Deal Status = Won.

**Then**
```text
Appointment Process Stage = Waiting Next Visit
Next Visit Required = Yes
```

olmalıdır.

---

## Test 12 — Next Visit Date Eksik

**Given**
- Stage = Waiting Next Visit.
- Next Visit Date boş.

**Then**
`Next Visit Date Missing` alarmı oluşmalıdır.

---

## Test 13 — Next Visit Date Girildi

**Given**
- `Next Visit Date Missing` alarmı açık.

**When**
Next Visit Date girilir.

**Then**
Alarm otomatik kapanmalıdır.

---

## Test 14 — Duplicate Alarm

**Given**
Aynı Deal'da `Next Visit Date Missing` alarmı zaten Open.

**When**
Alarm motoru tekrar çalışır.

**Then**
Yeni alarm oluşturmamalı, mevcut alarmı korumalıdır.

---

## Test 15 — Sales TL Yetki Kontrolü

**Given**
Sales TL sisteme giriş yapar.

**Then**
Sadece kendi ekibindeki Sales Agent'ların Deal'larını görmelidir.

---

## Test 16 — Deal Chat

**Given**
Bir Deal'da açık Clinic alarmı vardır.

**When**
Sales TL Clinic TL'ye mesaj gönderir.

**Then**
Mesaj ilgili Deal ve alarm ile ilişkili saklanmalıdır.

---

## Test 17 — Arabic Translation

**Given**
Clinic TL Arapça mesaj gönderir.

**Then**
Sales TL İngilizce çeviriyi görebilmeli ve `Show Original` ile Arapça mesajı açabilmelidir.

---

## Test 18 — Audit Log

**When**
Doctor, Examination Date veya Next Visit Date değiştirilir.

**Then**
Old Value, New Value, Changed By ve Changed Date saklanmalıdır.

---

# 33. Raporlama ve KPI Önerileri

Sistem devreye alındıktan sonra aşağıdaki KPI'lar izlenebilir:

- 15 gün kala planning completion rate
- WhatsApp Group completion rate
- Interpreter assignment rate
- Appointment readiness rate
- Arrival öncesi eksik planning sayısı
- Check-in Completed -> Won ortalama süresi
- Check-in Completed fakat Not Won Deal sayısı
- Waiting Next Visit Deal sayısı
- Next Visit Date Missing Deal sayısı
- Alarm başına ortalama çözüm süresi
- Clinic TL bazlı açık alarm sayısı
- Sales Team bazlı Clinic readiness oranı
- SLA içinde kapanan alarm oranı
- Duplicate alarm prevention count

---

# 34. Kapsam Dışı

İlk fazda aşağıdaki konular kapsam dışında tutulabilir:

- WhatsApp grubunun doğrudan API üzerinden otomatik oluşturulması
- Otel rezervasyonunun dış rezervasyon sistemine otomatik gönderilmesi
- Doktor takviminin dış sistemler ile çift yönlü senkronizasyonu
- Interpreter vardiya optimizasyonu
- Transfer operasyon otomasyonu

Ancak veri modeli ileride bu entegrasyonlara uygun tasarlanmalıdır.

---

# 35. Development Öncesi Açık Konular

Aşağıdaki noktalar development başlamadan netleştirilmelidir:

1. Sales TL Deal Approval hangi mevcut field/status üzerinden anlaşılacak?
2. Planning ekibinin mevcut statüleri nelerdir?
3. `Waiting Hotel Confirmation`, `Waiting Appointment`, `Appointment Confirmed` mevcut stage alanının parçası mı olacak, ayrı Clinic stage mi tutulacak?
4. Appointment Confirmed için kesin zorunlu alanlar nelerdir?
5. Hotel bilgisi her müşteri için zorunlu mu?
6. WhatsApp Group hangi Deal tiplerinde zorunlu?
7. Interpreter Required hangi kurala göre belirlenecek?
8. Payment Completed hangi alan/status üzerinden kontrol edilecek?
9. Dental Service Category'nin sistemdeki kesin değeri nedir?
10. Implant işlemi hangi Product / Service alanından tespit edilecek?
11. Dental + Implant Deal Won olduğunda otomatik `Waiting Next Visit` geçişi mümkün mü?
12. Next Visit Date için maksimum giriş süresi / SLA nedir?
13. Clinic Team Leader ilgili Deal'a hangi mapping ile atanacak?
14. Planning sorumlusu ve Clinic TL aynı kişi olabilir mi?
15. Alarm escalation hiyerarşisi kimlerden oluşacak?
16. Clinic planlama zorunlu alanları ve mevcut operasyon akışı Mehmet Demircan'dan alınarak son haline getirilmelidir.

---

# 36. Beklenen Fayda

Bu geliştirme ile;

- Yaklaşan hastaların planlama problemleri erken tespit edilir.
- Sales tarafı kendi müşterisinin Clinic sürecini görünür şekilde takip eder.
- Clinic Team Leader hangi Deal'da aksiyon gerektiğini tek ekranda görür.
- Hasta gelmiş fakat Won yapılmamış işlemler kaybolmaz.
- Dental ikinci ziyaret süreçleri sistematik hale gelir.
- WhatsApp Group, interpreter, doctor ve appointment eksikleri manuel kontrole bağımlı kalmaz.
- Sales ve Clinic ekiplerinin iletişimi Deal'a bağlanır.
- Operasyonel sorumluluk ve gecikmeler ölçülebilir hale gelir.
- Yönetim Clinic Planning performansını KPI bazında takip edebilir.
- Aynı müşteri için farklı ekiplerin ayrı ayrı Excel, Slack veya manuel listeler tutma ihtiyacı azaltılır.

---

# 37. Özet

Bu talep yalnızca bir alarm ekranı geliştirmesi değildir.

Hedef; **Sales sonrası Clinic Planning sürecini, Appointment statülerini, hasta gelişini, Check-in sürecini, Deal Won kontrolünü ve Dental Next Visit takibini tek bir Deal-centric operasyon modeli altında birleştirmektir.**

Sistem her Deal için şu sorulara otomatik cevap verebilmelidir:

- Bu hasta ne zaman geliyor?
- Planlama başladı mı?
- Oteli hazır mı?
- WhatsApp grubu açıldı mı?
- Tercümanı atandı mı?
- Doktoru belli mi?
- Muayene tarihi belli mi?
- Appointment Confirmed mı?
- Hasta geldi mi?
- Danışmanı atandı mı?
- Ödemesi tamamlandı mı?
- Deal Won oldu mu?
- Dental implant ise ikinci ziyaret planlandı mı?
- Şu anda kim aksiyon almalı?
- Açık alarm var mı?
- Sales TL bu süreci görebiliyor mu?
- Clinic TL gerekli aksiyonu aldı mı?

Bu soruların tamamı Deal üzerinden izlenebilir, raporlanabilir ve alarm üretilebilir hale getirilmelidir.

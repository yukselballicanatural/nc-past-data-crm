// export-util.js — Natural Clinic CRM ortak "Export" (CSV/XLSX/PDF/HTML) modülü
// Tüm panellerde (team-leader, admin) ortak kullanılır. Sayfa başına bir
// "Export" butonu + açılır menü (CSV/XLSX/PDF/HTML), tıklanınca ilgili
// sayfanın o anki (filtrelenmiş) verisini header+row listesi olarak alır.
window.NCExport = (function () {
  'use strict';

  function _escHtml(v) {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _downloadBlob(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // Aktif dile göre çevirir (I18N yüklenmemişse veya dil tr ise metin aynen kalır) —
  // export'un dili her zaman o an ekranda seçili dille (TR/EN) eşleşsin diye.
  function _t(s) {
    return (typeof I18N !== 'undefined' && I18N.t) ? I18N.t(s) : s;
  }

  // headers: string[] (Türkçe kanonik başlıklar — DICT'te karşılığı varsa
  // EN modda otomatik çevrilir); rows: array of arrays (aynı sırada, header
  // sayısı kadar hücre); filenameBase: indirilen dosyanın adı (sabit, dilden
  // etkilenmez); titleKey: PDF/HTML içindeki başlık için Türkçe kanonik metin
  // (verilmezse filenameBase'den türetilir).
  function download(format, headers, rows, filenameBase, titleKey) {
    const ts = new Date().toISOString().slice(0, 10);
    const filename = `${filenameBase}_${ts}`;
    const trHeaders = headers.map(h => _t(h));
    const title = _t(titleKey || filenameBase.replace(/_/g, ' '));
    const safeRows = rows.map(r => headers.map((h, i) => r[i] ?? ''));

    if (format === 'csv') {
      const csvRows = [trHeaders, ...safeRows].map(r =>
        r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')
      );
      // BOM — Excel'de Türkçe karakterlerin bozuk görünmesini engeller
      _downloadBlob('﻿' + csvRows.join('\r\n'), `${filename}.csv`, 'text/csv;charset=utf-8;');
      return;
    }

    if (format === 'xlsx') {
      if (typeof XLSX === 'undefined') { alert('XLSX kütüphanesi yüklenemedi. İnternet bağlantınızı kontrol edin.'); return; }
      const ws = XLSX.utils.aoa_to_sheet([trHeaders, ...safeRows]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
      XLSX.writeFile(wb, `${filename}.xlsx`);
      return;
    }

    if (format === 'pdf') {
      if (typeof jspdf === 'undefined') { alert('PDF kütüphanesi yüklenemedi. İnternet bağlantınızı kontrol edin.'); return; }
      const doc = new jspdf.jsPDF({ orientation: headers.length > 6 ? 'landscape' : 'portrait', unit: 'pt' });
      doc.setFontSize(11);
      doc.text(title, 24, 24);
      doc.autoTable({
        head: [trHeaders],
        body: safeRows,
        startY: 34,
        styles: { fontSize: 7, cellPadding: 3 },
        headStyles: { fillColor: [13, 148, 136] },
        margin: { left: 20, right: 20 },
      });
      doc.save(`${filename}.pdf`);
      return;
    }

    if (format === 'html') {
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${_escHtml(title)}</title>
        <style>body{font-family:Arial,sans-serif;padding:20px;background:#fff;color:#111}
        table{border-collapse:collapse;width:100%;font-size:12px}
        th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}
        th{background:#0d9488;color:#fff}
        tr:nth-child(even){background:#f4f4f4}</style></head><body>
        <h2>${_escHtml(title)}</h2>
        <table><thead><tr>${trHeaders.map(h => `<th>${_escHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${safeRows.map(r => `<tr>${r.map(c => `<td>${_escHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></body></html>`;
      _downloadBlob(html, `${filename}.html`, 'text/html;charset=utf-8;');
      return;
    }
  }

  // ── Açılır menü (dropdown) yönetimi ──────────────────────────────
  let _openMenuId = null;
  function toggleMenu(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const willOpen = el.style.display !== 'block';
    closeAllMenus();
    if (willOpen) { el.style.display = 'block'; _openMenuId = id; }
  }
  function closeAllMenus() {
    document.querySelectorAll('.nc-export-menu').forEach(m => { m.style.display = 'none'; });
    _openMenuId = null;
  }
  document.addEventListener('click', function (e) {
    if (!_openMenuId) return;
    const wrap = e.target.closest('.nc-export-wrap');
    if (!wrap) closeAllMenus();
  });

  // Ortak "Export" butonu + menü HTML'i — her sayfa kendi menuId'sini ve
  // export fonksiyon adını verir (fnName('csv'|'xlsx'|'pdf'|'html') şeklinde çağrılır).
  function renderButton(menuId, fnName) {
    return `<div class="nc-export-wrap" style="position:relative;display:inline-block">
      <button onclick="NCExport.toggleMenu('${menuId}')" style="padding:8px 14px;background:#1e293b;border:1px solid #334155;border-radius:10px;color:#94a3b8;font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:6px;transition:all 0.15s" onmouseover="this.style.background='#1e3a5f';this.style.borderColor='#1e40af';this.style.color='#60a5fa'" onmouseout="this.style.background='#1e293b';this.style.borderColor='#334155';this.style.color='#94a3b8'">
        <svg style="width:13px;height:13px" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"/></svg>
        ${_t('Export')}
        <svg style="width:10px;height:10px" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/></svg>
      </button>
      <div id="${menuId}" class="nc-export-menu" style="display:none;position:absolute;top:calc(100% + 4px);right:0;z-index:500;background:#0f172a;border:1px solid #334155;border-radius:10px;padding:6px;min-width:120px;box-shadow:0 12px 30px rgba(0,0,0,0.5)">
        <button onclick="NCExport.closeAllMenus();${fnName}('csv')" style="width:100%;text-align:left;padding:8px 10px;background:none;border:none;border-radius:7px;color:#cbd5e1;font-size:11.5px;font-weight:600;cursor:pointer" onmouseover="this.style.background='#1e293b'" onmouseout="this.style.background='none'">CSV</button>
        <button onclick="NCExport.closeAllMenus();${fnName}('xlsx')" style="width:100%;text-align:left;padding:8px 10px;background:none;border:none;border-radius:7px;color:#cbd5e1;font-size:11.5px;font-weight:600;cursor:pointer" onmouseover="this.style.background='#1e293b'" onmouseout="this.style.background='none'">XLSX</button>
        <button onclick="NCExport.closeAllMenus();${fnName}('pdf')" style="width:100%;text-align:left;padding:8px 10px;background:none;border:none;border-radius:7px;color:#cbd5e1;font-size:11.5px;font-weight:600;cursor:pointer" onmouseover="this.style.background='#1e293b'" onmouseout="this.style.background='none'">PDF</button>
        <button onclick="NCExport.closeAllMenus();${fnName}('html')" style="width:100%;text-align:left;padding:8px 10px;background:none;border:none;border-radius:7px;color:#cbd5e1;font-size:11.5px;font-weight:600;cursor:pointer" onmouseover="this.style.background='#1e293b'" onmouseout="this.style.background='none'">HTML</button>
      </div>
    </div>`;
  }

  return { download, toggleMenu, closeAllMenus, renderButton };
})();

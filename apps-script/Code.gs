/**************************************************************
 * FS INSPECTION — Google Apps Script Web App
 * ------------------------------------------------------------
 * Menulis hasil inspeksi unit Mesin & Irrigator ke sheet
 * "Data Inspeksi" pada spreadsheet Update ZPAS637.
 *
 * CARA PASANG (sekali saja):
 * 1. Buka spreadsheet tujuan →
 *    Extensions ▸ Apps Script.
 * 2. Hapus isi Code.gs, tempel seluruh file ini, lalu Save.
 * 3. Jalankan fungsi `setup` sekali (Run ▸ setup) dan izinkan akses.
 *    (opsional: hanya menyiapkan sheet + header yang rapi)
 * 4. Deploy ▸ New deployment ▸ Web app
 *      Description  : FS Inspection API
 *      Execute as   : Me
 *      Who has access: Anyone
 *    Salin URL yang berakhiran /exec.
 * 5. Tempel URL tersebut di dashboard ▸ Pengaturan ▸ Endpoint.
 *
 * Setiap perubahan kode WAJIB: Deploy ▸ Manage deployments ▸ Edit ▸
 * Version: New version, agar URL /exec memakai kode terbaru.
 **************************************************************/

/* ====================== KONFIGURASI ====================== */
var SPREADSHEET_ID = '1mhXxr7cfdnS-A_gJ6E4aixGRSzINdGP94orr-2lL45o'; // Update ZPAS637
var SHEET_NAME = 'Data Inspeksi';

/* Daftar komponen — HARUS sama dengan dashboard.
   Boleh juga dibiarkan: script akan menambah kolom baru otomatis
   bila ada komponen yang belum ada di header. */
var KOMPONEN_MESIN = [
  'Accu', 'Kabel Accu', 'Klem Accu', 'Kunci Kontak Batery', 'Kunci Kontak Starter',
  'Dinamo Start', 'Dinamo Charge', 'V Belt Altenator', 'Kabel Intalasi', 'Tombol Emergency Stop',
  'Amper Meter', 'Hour Meter', 'Oil Presure Meter', 'RPM Meter', 'Water Temp Meter',
  'Amper Charge', 'Temp Air',
  'Feed Pump', 'Injeksi Pump', 'Filter Solar', 'Tangki Solar', 'Selang Nozle',
  'Pengukur Volum Solar', 'Stik Oil', 'Tutup Oil', 'Air Cleaner',
  'Radiator', 'Hose radiator Atas', 'Hose radiator Bawah', 'Kipas Radiator',
  'Tutup Radiator', 'V Belt Radiator', 'Water Pump', 'Oil Cooler', 'Knalpot',
  'Mesin', 'Prodo', 'Perpak clynder head', 'Perpak oil Pan', 'Turbo Charger',
  'Coupling Assy', 'Joint Couple', 'Selenoid Transmisi',
  'Chasis', 'Ban', 'Pintu', 'Category'
];

var KOMPONEN_IRRIGATOR = [
  'Turbin', 'As Turbin', 'V belt Turbin ( Bauer )', 'Pulley Turbin ( Bauer )',
  'Rantai Besar ( Bauer )', 'Rantai Kecil', 'Sproket Wheel', 'Assembly Bearing',
  'Bearing Molen', 'Gear Box / Transmisi', 'Pengatur Kecepatan',
  'Fleksible Hose 3"', 'Fleksible Hose 5"', 'Hose Drum', 'Seal Hose Drum',
  'Mekanik Seal', 'Bearing Hose Drum',
  'Nozle Gun', 'Roda trolley Gun', 'Stoper/Putaran Gun', 'Bandul Pada Troli',
  'Gandengan / Drawbar',
  'Jack / Kaki  Depan', 'Jack / Kaki  Belakang', 'Ban Irigator',
  'Hydrolik', 'Pressure Gauge',
  'PE', 'Helically', 'Category'
];

/* Kolom identitas (urutan tetap di sheet) */
var META_HEADERS = [
  'ID Inspeksi', 'Tanggal', 'Timestamp', 'Tipe Aset', 'Kode Unit', 'Wilayah',
  'Jenis Unit', 'Spesifikasi', 'Status Unit', 'Petugas', 'A', 'B', 'C',
  'Total', 'Skor', 'Kondisi'
];
var TAIL_HEADERS = ['Catatan'];

/* ====================== ENTRY POINT ====================== */

function doGet(e) {
  var out = { ok: true, service: 'FS Inspection API', sheet: SHEET_NAME, version: '1.0.0' };
  try {
    out.records = countRecords_();
  } catch (err) {
    out.error = String(err && err.message ? err.message : err);
  }
  return json_(out);
}

function doPost(e) {
  try {
    var body = parseBody_(e);
    var action = body.action || 'ping';

    if (action === 'ping') {
      return json_({ ok: true, sheet: SHEET_NAME, records: countRecords_(), ts: new Date().toISOString() });
    }
    if (action === 'history') {
      return json_({ ok: true, records: readHistory_() });
    }
    if (action === 'submit') {
      var rec = writeInspection_(body.payload || {});
      return json_({ ok: true, record: rec });
    }
    if (action === 'setup') {
      var sh = ensureSheet_(true);
      return json_({ ok: true, sheet: sh.getName(), columns: sh.getLastColumn() });
    }
    return json_({ ok: false, error: 'Aksi tidak dikenal: ' + action });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/* ====================== SETUP ====================== */

/** Jalankan sekali dari editor untuk menyiapkan sheet + header rapi. */
function setup() {
  var sh = ensureSheet_(true);
  sh.getRange(1, 1, 1, sh.getLastColumn())
    .setFontWeight('bold')
    .setBackground('#0b3d5c')
    .setFontColor('#ffffff')
    .setVerticalAlignment('middle');
  sh.setFrozenRows(1);
  sh.setFrozenColumns(5);
  if (sh.getMaxColumns() > sh.getLastColumn()) {
    sh.deleteColumns(sh.getLastColumn() + 1, sh.getMaxColumns() - sh.getLastColumn());
  }
  // lebar kolom identitas
  var widths = [130, 90, 150, 90, 100, 70, 70, 190, 90, 120, 40, 40, 40, 50, 50, 110];
  for (var i = 0; i < widths.length; i++) sh.setColumnWidth(i + 1, widths[i]);
  SpreadsheetApp.getActiveSpreadsheet().toast('Sheet "Data Inspeksi" siap digunakan.', 'FS Inspection', 5);
}

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('FS Inspection')
      .addItem('Siapkan / perbaiki tabel Data Inspeksi', 'setup')
      .addToUi();
  } catch (e) { /* diabaikan bila bukan container-bound */ }
}

/* ====================== INTI ====================== */

function ss_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function buildHeader_() {
  var header = META_HEADERS.slice();
  var seen = {};
  var i;
  for (i = 0; i < header.length; i++) seen[String(header[i]).toLowerCase()] = true;
  for (i = 0; i < KOMPONEN_MESIN.length; i++) {
    var name = KOMPONEN_MESIN[i];
    var key = String(name).toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    header.push(name);
  }
  for (i = 0; i < KOMPONEN_IRRIGATOR.length; i++) {
    var n2 = KOMPONEN_IRRIGATOR[i];
    var k2 = String(n2).toLowerCase();
    if (seen[k2]) { header.push(n2 + ' (Irr)'); continue; } // hindari duplikat nama
    seen[k2] = true;
    header.push(n2);
  }
  return header.concat(TAIL_HEADERS);
}

/** Pastikan sheet + header ada. Mengembalikan sheet. */
function ensureSheet_(withFormatting) {
  var ss = ss_();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);

  var header = buildHeader_();
  var current = sh.getLastColumn() > 0
    ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String)
    : [];

  var needsHeader = current.length === 0 || current.join('|') !== header.join('|');
  if (needsHeader) {
    // kalau sheet sudah punya data, jangan timpa paksa — hanya tambah kolom baru
    if (sh.getLastRow() > 1) {
      var existing = {};
      for (var c = 0; c < current.length; c++) existing[current[c]] = c + 1;
      for (var h = 0; h < header.length; h++) {
        if (!existing[header[h]]) sh.getRange(1, sh.getLastColumn() + 1).setValue(header[h]);
      }
    } else {
      if (sh.getMaxColumns() < header.length) {
        sh.insertColumnsAfter(sh.getMaxColumns(), header.length - sh.getMaxColumns());
      }
      sh.getRange(1, 1, 1, header.length).setValues([header]);
    }
  }
  if (withFormatting) {
    sh.getRange(1, 1, 1, sh.getLastColumn()).setFontWeight('bold').setBackground('#0b3d5c').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  return sh;
}

function headerMap_(sh) {
  var last = sh.getLastColumn();
  if (last === 0) return {};
  var row = sh.getRange(1, 1, 1, last).getValues()[0];
  var map = {};
  for (var i = 0; i < row.length; i++) {
    var key = String(row[i]).trim();
    if (key) map[key] = i + 1;
  }
  return map;
}

/** Komponen mana (milik tipe apa) untuk tiap label kolom */
function componentIndex_() {
  var idx = {};
  var seen = {};
  function add(list, tipe) {
    for (var i = 0; i < list.length; i++) {
      var name = list[i];
      var k = String(name).toLowerCase();
      if (seen[k]) {
        if (tipe === 'Irrigator') idx[name + ' (Irr)'] = { name: name, tipe: tipe };
        continue;
      }
      seen[k] = true;
      idx[name] = { name: name, tipe: tipe };
    }
  }
  add(KOMPONEN_MESIN, 'Mesin');
  add(KOMPONEN_IRRIGATOR, 'Irrigator');
  return idx;
}

function formatDate_(d) {
  var dt = d ? new Date(d) : new Date();
  if (isNaN(dt.getTime())) dt = new Date();
  return Utilities.formatDate(dt, 'Asia/Jakarta', 'yyyy-MM-dd');
}
function formatTs_(d) {
  return Utilities.formatDate(new Date(d), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss');
}

function writeInspection_(p) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = ensureSheet_(false);
    var map = headerMap_(sh);
    var compIdx = componentIndex_();
    var cols = sh.getLastColumn();
    var row = new Array(cols);

    var now = new Date();
    var tanggal = p.tanggal || formatDate_(now);
    var ts = now.toISOString();

    var values = {
      'ID Inspeksi': p.clientId || ('FSI-' + now.getTime()),
      'Tanggal': tanggal,
      'Timestamp': formatTs_(now),
      'Tipe Aset': p.tipe || '',
      'Kode Unit': p.kode || '',
      'Wilayah': p.wilayah || '',
      'Jenis Unit': p.unitJenis || '',
      'Spesifikasi': p.spec || '',
      'Status Unit': p.statusUnit || '',
      'Petugas': p.inspector || '',
      'A': num_(p.a),
      'B': num_(p.b),
      'C': num_(p.c),
      'Total': num_(p.total),
      'Skor': num_(p.skor),
      'Kondisi': p.kondisi || '',
      'Catatan': p.catatan || ''
    };

    // isi kolom identitas + catatan
    for (var key in values) {
      if (key === 'Catatan') continue;
      if (map[key]) row[map[key] - 1] = values[key];
    }
    if (map['Catatan']) row[map['Catatan'] - 1] = values['Catatan'];

    // isi kolom komponen
    var komponen = p.komponen || {};
    for (var label in compIdx) {
      var meta = compIdx[label];
      if (meta.tipe !== (p.tipe || '')) continue; // hanya kolom tipe yang sesuai
      var col = map[label];
      if (!col) continue;
      var val = komponen[meta.name];
      if (!val && label.indexOf(' (Irr)') > -1) val = komponen[meta.name];
      row[col - 1] = val || '';
    }

    for (var i = 0; i < cols; i++) if (row[i] === undefined) row[i] = '';

    sh.appendRow(row);
    var rowIndex = sh.getLastRow();

    return {
      id: values['ID Inspeksi'],
      timestamp: ts,
      tanggal: tanggal,
      tipe: values['Tipe Aset'],
      kode: values['Kode Unit'],
      wilayah: values['Wilayah'],
      unitJenis: values['Jenis Unit'],
      spec: values['Spesifikasi'],
      statusUnit: values['Status Unit'],
      inspector: values['Petugas'],
      a: num_(p.a),
      b: num_(p.b),
      c: num_(p.c),
      total: num_(p.total),
      skor: num_(p.skor),
      kondisi: values['Kondisi'],
      catatan: values['Catatan'],
      komponen: p.tipe === 'Irrigator' ? pick_(komponen, KOMPONEN_IRRIGATOR) : pick_(komponen, KOMPONEN_MESIN),
      row: rowIndex
    };
  } finally {
    lock.releaseLock();
  }
}

function readHistory_() {
  var sh = ensureSheet_(false);
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  var lastCol = sh.getLastColumn();
  var values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
  var header = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var compIdx = componentIndex_();
  var out = [];

  for (var r = 0; r < values.length; r++) {
    var row = values[r];
    var obj = { komponen: {} };
    if (!row[0] && !row[4]) continue; // kosong

    for (var c = 0; c < header.length; c++) {
      var h = header[c];
      var v = row[c];
      if (!h) continue;
      if (compIdx[h]) {
        var g = normalizeGrade_(v);
        if (g) obj.komponen[compIdx[h].name] = g;
        continue;
      }
      switch (h) {
        case 'ID Inspeksi': obj.id = String(v || ''); break;
        case 'Tanggal': obj.tanggal = v instanceof Date ? formatDate_(v) : String(v || ''); break;
        case 'Timestamp': obj.timestamp = v instanceof Date ? v.toISOString() : String(v || ''); break;
        case 'Tipe Aset': obj.tipe = String(v || ''); break;
        case 'Kode Unit': obj.kode = String(v || ''); break;
        case 'Wilayah': obj.wilayah = String(v || ''); break;
        case 'Jenis Unit': obj.unitJenis = String(v || ''); break;
        case 'Spesifikasi': obj.spec = String(v || ''); break;
        case 'Status Unit': obj.statusUnit = String(v || ''); break;
        case 'Petugas': obj.inspector = String(v || ''); break;
        case 'A': obj.a = num_(v); break;
        case 'B': obj.b = num_(v); break;
        case 'C': obj.c = num_(v); break;
        case 'Total': obj.total = num_(v); break;
        case 'Skor': obj.skor = num_(v); break;
        case 'Kondisi': obj.kondisi = String(v || ''); break;
        case 'Catatan': obj.catatan = String(v || ''); break;
      }
    }
    if (!obj.id) obj.id = 'ROW-' + (r + 2);
    if (!obj.timestamp && obj.tanggal) obj.timestamp = obj.tanggal;
    out.push(obj);
  }
  return out.reverse(); // terbaru di atas
}

function countRecords_() {
  var sh = ensureSheet_(false);
  return Math.max(0, sh.getLastRow() - 1);
}

/* ====================== UTIL ====================== */
function num_(v) {
  var n = Number(v);
  return isNaN(n) ? 0 : n;
}
function normalizeGrade_(v) {
  var s = String(v == null ? '' : v).trim().toUpperCase();
  return (s === 'A' || s === 'B' || s === 'C') ? s : '';
}
function pick_(obj, list) {
  var out = {};
  for (var i = 0; i < list.length; i++) {
    var v = obj[list[i]];
    if (v) out[list[i]] = v;
  }
  return out;
}
function parseBody_(e) {
  if (!e) return {};
  var raw = e.postData && e.postData.contents ? e.postData.contents : '{}';
  try {
    return JSON.parse(raw);
  } catch (err) {
    // fallback: form-encoded
    if (e.parameter && e.parameter.payload) {
      try { return { action: e.parameter.action || 'ping', payload: JSON.parse(e.parameter.payload) }; } catch (x) { return {}; }
    }
    return {};
  }
}
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

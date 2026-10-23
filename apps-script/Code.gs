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
var SPREADSHEET_ID = '1mhXxr7cfdnS-A_gJ6E4aixGRSzINdGP94orr-2lL45o'; // Update ZPAS637 (tujuan)
var SHEET_NAME = 'Data Inspeksi';
var SCRIPT_VERSION = '1.2.0'; // naikkan setiap kali kode berubah besar

/* ---- spreadsheet MASTER aset (Draft Dashboard) ---- */
var SOURCE_SPREADSHEET_ID = '1WbGTDqC0Anh6O54twsJfiBiWcTri7FHyQjXIFrOoLz4';
var MASTER = {
  Mesin:      { sheet: 'Mesin',     kode: 'Kode Unit', wilayah: 'Asal Mesin', spec: 'Spec',  jenis: 'Jenis', status: 'Status' },
  Irrigator:  { sheet: 'Irrigator', kode: 'KODE UNIT', wilayah: 'WILAYAH',     spec: 'Nozzle', jenis: 'Unit',  status: 'Status' }
};

/* Tanggal default untuk inspeksi awal hasil tarikan master */
var TANGGAL_INSPEKSI_AWAL = '2026-03-05';
var PETUGAS_INSPEKSI_AWAL = 'Inspeksi Awal (Master)';

/* Kolom ringkasan yang ditulis balik ke sheet Mesin & Irrigator */
/* Tulis juga nilai A/B/C terbaru ke kolom komponen master (Accu, Klem Accu, …) */
var TULIS_KOMPONEN_KE_MASTER = true;

var MASTER_SUMMARY_HEADERS = [
  'TGL INSPEKSI TERAKHIR', 'JAM', 'SKOR', 'KONDISI',
  'A', 'B', 'C', 'PETUGAS', 'TEMUAN (B/C)'
];

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
  var out = { ok: true, service: 'FS Inspection API', sheet: SHEET_NAME, version: SCRIPT_VERSION };
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
      return json_({ ok: true, sheet: SHEET_NAME, records: countRecords_(), version: SCRIPT_VERSION, ts: new Date().toISOString() });
    }
    if (action === 'history') {
      return json_({ ok: true, records: readHistory_() });
    }
    if (action === 'submit') {
      var rec = writeInspection_(body.payload || {});
      return json_({ ok: true, record: rec });
    }
    if (action === 'syncmaster') {
      return json_({ ok: true, result: syncLatestToMaster() });
    }
    if (action === 'backfill') {
      return json_({ ok: true, result: backfillDariMaster((body.payload || {}).tanggal) });
    }
    if (action === 'setup') {
      var sh = ensureSheet_(true);
      return json_({ ok: true, sheet: sh.getName(), columns: sh.getLastColumn() });
    }
    return json_({
      ok: false,
      version: SCRIPT_VERSION,
      error: 'Aksi tidak dikenal: "' + action + '". Deployment Web App masih versi lama — buka Apps Script ▸ ' +
             'Deploy ▸ Manage deployments ▸ ✏️ ▸ Version: New version ▸ Deploy, lalu coba lagi.'
    });
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
      .addItem('1. Siapkan / perbaiki tabel Data Inspeksi', 'setup')
      .addSeparator()
      .addItem('2. Isi inspeksi awal dari master (5 Mar 2026)', 'backfillDariMaster')
      .addItem('3. Sinkronkan hasil terakhir ke sheet Mesin & Irrigator', 'syncLatestToMaster')
      .addSeparator()
      .addItem('Cek status sheet (diagnostik)', 'cekStatus')
      .addSeparator()
      .addItem('Pasang jadwal otomatis harian', 'installTriggers')
      .addItem('Hapus jadwal otomatis', 'removeTriggers')
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
      'Kondisi': kondisiDari_(num_(p.skor), p.statusUnit) || p.kondisi || '',
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

/**
 * DIAGNOSTIK — jalankan kalau sheet "Data Inspeksi" terlihat kosong.
 * Hasilnya muncul di Execution log (View ▸ Logs).
 */
function cekStatus() {
  var out = [];
  var sh = ensureSheet_(false);
  out.push('Sheet tujuan      : "' + sh.getName() + '"');
  out.push('Jumlah kolom      : ' + sh.getLastColumn());
  out.push('Baris data        : ' + Math.max(0, sh.getLastRow() - 1));
  if (sh.getLastRow() > 1) {
    var last = sh.getRange(sh.getLastRow(), 1, 1, Math.min(6, sh.getLastColumn())).getValues()[0];
    out.push('Baris terakhir    : ' + last.join(' | '));
  }
  try {
    var src = SpreadsheetApp.openById(SOURCE_SPREADSHEET_ID);
    out.push('Master Mesin      : ' + (src.getSheetByName('Mesin') ? src.getSheetByName('Mesin').getLastRow() - 1 + ' unit' : 'TIDAK ADA'));
    out.push('Master Irrigator  : ' + (src.getSheetByName('Irrigator') ? src.getSheetByName('Irrigator').getLastRow() - 1 + ' unit' : 'TIDAK ADA'));
  } catch (err) {
    out.push('Gagal buka master : ' + err);
  }
  Logger.log(out.join('\n'));
  try { SpreadsheetApp.getActiveSpreadsheet().toast('Lihat Execution log (View ▸ Logs)', 'FS Inspection', 6); } catch (e) {}
  return out.join(' | ');
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

/* ==================================================================
 *  INSpeksi AWAL DARI MASTER  +  SINKRON BALIK KE SHEET MASTER
 * ================================================================== */

/**
 * MENGISI sheet "Data Inspeksi" dengan kondisi terkini tb_mesin &
 * tb_irrigator sebagai inspeksi awal (default tanggal 5 Maret 2026).
 *
 * - Aman dijalankan berulang: baris dengan ID yang sama akan dilewati.
 * - Nilai komponen A/B/C diambil apa adanya dari sheet master.
 *
 * @param {string} [tanggal] format yyyy-MM-dd, default 2026-03-05
 * @return {Object} {inserted, skipped, tanggal}
 */
function backfillDariMaster(tanggal) {
  var tgl = tanggal || TANGGAL_INSPEKSI_AWAL;
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = ensureSheet_(false);
    var map = headerMap_(sh);
    var cols = sh.getLastColumn();
    var compIdx = componentIndex_();

    /* kumpulkan ID yang sudah ada supaya tidak duplikat */
    var existing = {};
    var lastRow = sh.getLastRow();
    if (lastRow > 1) {
      var idCol = map['ID Inspeksi'] || 1;
      var ids = sh.getRange(2, idCol, lastRow - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) existing[String(ids[i][0])] = true;
    }

    var rows = [];
    var inserted = 0;
    var skipped = 0;
    var list = [
      { tipe: 'Mesin', komponen: KOMPONEN_MESIN },
      { tipe: 'Irrigator', komponen: KOMPONEN_IRRIGATOR }
    ];

    for (var t = 0; t < list.length; t++) {
      var tipe = list[t].tipe;
      var assets = readMasterAsset_(tipe);

      for (var n = 0; n < assets.length; n++) {
        var a = assets[n];
        if (!a.kode) continue;
        var id = 'FSI-INIT-' + tipe + '-' + a.kode;
        if (existing[id]) { skipped++; continue; }

        var rekap = rekap_(a.components, tipe === 'Mesin' ? KOMPONEN_MESIN : KOMPONEN_IRRIGATOR, a.status);
        var jam = 7 + Math.floor((n % 8));
        var menit = (n * 7) % 60;

        var meta = {
          'ID Inspeksi': id,
          'Tanggal': tgl,
          'Timestamp': tgl + ' ' + pad2_(jam) + ':' + pad2_(menit) + ':00',
          'Tipe Aset': tipe,
          'Kode Unit': a.kode,
          'Wilayah': a.wilayah,
          'Jenis Unit': a.jenis,
          'Spesifikasi': a.spec,
          'Status Unit': a.status,
          'Petugas': PETUGAS_INSPEKSI_AWAL,
          'A': rekap.a,
          'B': rekap.b,
          'C': rekap.c,
          'Total': rekap.total,
          'Skor': rekap.skor,
          'Kondisi': rekap.kondisi,
          'Catatan': 'Inspeksi awal — hasil tarikan kondisi master per ' + tgl +
            (String(a.status || '').toLowerCase() === 'rusak' ? ' · status unit RUSAK (otomatis Kritis)' : '')
        };

        rows.push(composeRow_(map, compIdx, cols, meta, a.components));
        inserted++;
      }
    }

    if (rows.length) {
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, cols).setValues(rows);
    }

    var msg = inserted + ' baris inspeksi awal ditambahkan (' + tgl + '). ' +
              (skipped ? skipped + ' baris dilewati karena sudah ada.' : '');
    try { SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'FS Inspection', 8); } catch (e) {}
    Logger.log(msg);
    return { inserted: inserted, skipped: skipped, tanggal: tgl };
  } finally {
    lock.releaseLock();
  }
}

/**
 * MENULIS HASIL INSPEKSI TERAKHIR dari sheet "Data Inspeksi" ke sheet
 * master "Mesin" & "Irrigator" (kolom ringkasan di sisi kanan tabel).
 *
 * Kolom yang ditambahkan otomatis:
 *   TGL INSPEKSI TERAKHIR | JAM | SKOR | KONDISI | A | B | C | PETUGAS | TEMUAN (B/C)
 *
 * Kolom master yang sudah ada TIDAK diubah.
 */
function syncLatestToMaster() {
  var histories = readHistory_();           // terbaru di atas
  var latest = {};
  for (var i = 0; i < histories.length; i++) {
    var h = histories[i];
    if (!h.kode) continue;
    var key = String(h.tipe) + '|' + String(h.kode);
    var prev = latest[key];
    if (!prev || String(h.timestamp) >= String(prev.timestamp)) latest[key] = h;
  }

  var src = SpreadsheetApp.openById(SOURCE_SPREADSHEET_ID);
  var hasil = [];

  for (var tipe in MASTER) {
    var cfg = MASTER[tipe];
    var sh = src.getSheetByName(cfg.sheet);
    if (!sh) { hasil.push(tipe + ': sheet tidak ditemukan'); continue; }

    var lastRow = sh.getLastRow();
    var lastCol = sh.getLastColumn();
    if (lastRow < 2) { hasil.push(tipe + ': sheet kosong'); continue; }

    var header = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(function (v) { return String(v).trim(); });
    var kodeCol = indexOfHeader_(header, cfg.kode);
    if (kodeCol < 1) { hasil.push(tipe + ': kolom "' + cfg.kode + '" tidak ada'); continue; }

    /* pastikan kolom ringkasan tersedia (tambahkan bila belum) */
    var lastHeaderCol = 0;
    for (var hh = 0; hh < header.length; hh++) if (header[hh] !== '') lastHeaderCol = hh + 1;
    var startCol = Math.max(lastCol, lastHeaderCol) + 1;
    var existingIdx = [];
    var missing = [];
    for (var m = 0; m < MASTER_SUMMARY_HEADERS.length; m++) {
      var idx = indexOfHeader_(header, MASTER_SUMMARY_HEADERS[m]);
      existingIdx.push(idx);
      if (idx < 1) missing.push(MASTER_SUMMARY_HEADERS[m]);
    }
    if (missing.length) {
      sh.getRange(1, startCol, 1, missing.length).setValues([missing])
        .setFontWeight('bold').setBackground('#0b3d5c').setFontColor('#ffffff');
      // posisi akhir tiap header ringkasan
      var cursor = startCol;
      for (var j = 0; j < MASTER_SUMMARY_HEADERS.length; j++) {
        if (existingIdx[j] < 1) { existingIdx[j] = cursor; cursor++; }
      }
    }
    var sumStart = Math.min.apply(null, existingIdx);
    var sumEnd = Math.max.apply(null, existingIdx);
    var sumCount = sumEnd - sumStart + 1;
    sumCount = Math.max(sumCount, MASTER_SUMMARY_HEADERS.length);

    /* baca kolom kode */
    var kodeVals = sh.getRange(2, kodeCol, lastRow - 1, 1).getValues();
    var statusCol = indexOfHeader_(header, cfg.status);
    var statusVals = statusCol > 0 ? sh.getRange(2, statusCol, lastRow - 1, 1).getValues() : [];
    var out = [];
    var terisi = 0;

    for (var r = 0; r < kodeVals.length; r++) {
      var kode = String(kodeVals[r][0]).trim();
      var rec = kode ? latest[tipe + '|' + kode] : null;
      var rowVals = [];
      for (var c = 0; c < sumCount; c++) rowVals.push('');
      if (rec) {
        terisi++;
        var statusUnit = statusVals[r] ? String(statusVals[r][0] || '').trim() : '';
        var kondisiFinal = kondisiDari_(rec.skor || 0, statusUnit);
        var temuan = listTemuan_(rec.komponen, tipe === 'Mesin' ? KOMPONEN_MESIN : KOMPONEN_IRRIGATOR);
        var values = {
          'TGL INSPEKSI TERAKHIR': rec.tanggal || '',
          'JAM': (rec.timestamp && String(rec.timestamp).indexOf('T') > -1)
            ? Utilities.formatDate(new Date(rec.timestamp), 'Asia/Jakarta', 'HH:mm')
            : (String(rec.timestamp || '').split(' ')[1] || '').slice(0, 5),
          'SKOR': rec.skor || 0,
          'KONDISI': kondisiFinal,
          'A': rec.a || 0,
          'B': rec.b || 0,
          'C': rec.c || 0,
          'PETUGAS': rec.inspector || '',
          'TEMUAN (B/C)': temuan
        };
        for (var k = 0; k < MASTER_SUMMARY_HEADERS.length; k++) {
          var hName = MASTER_SUMMARY_HEADERS[k];
          var colPos = existingIdx[k] - sumStart;
          if (colPos >= 0 && colPos < sumCount) rowVals[colPos] = values[hName];
        }
      }
      out.push(rowVals);
    }

    /* ---------- tulis nilai A/B/C terbaru ke kolom komponen master ---------- */
    var selKomponen = 0;
    if (TULIS_KOMPONEN_KE_MASTER) {
      var komponenList = tipe === 'Mesin' ? KOMPONEN_MESIN : KOMPONEN_IRRIGATOR;
      var compCols = {};
      var minCol = 0, maxCol = 0;
      for (var ci = 0; ci < komponenList.length; ci++) {
        var cCol = indexOfHeader_(header, komponenList[ci]);
        if (cCol < 1) continue;
        compCols[komponenList[ci]] = cCol;
        if (!minCol || cCol < minCol) minCol = cCol;
        if (cCol > maxCol) maxCol = cCol;
      }
      if (minCol && maxCol) {
        var width = maxCol - minCol + 1;
        var blok = sh.getRange(2, minCol, kodeVals.length, width).getValues();
        for (var rk = 0; rk < kodeVals.length; rk++) {
          var kodeK = String(kodeVals[rk][0]).trim();
          var recK = kodeK ? latest[tipe + '|' + kodeK] : null;
          if (!recK || !recK.komponen) continue;
          for (var nama in compCols) {
            var nilai = recK.komponen[nama];
            if (!nilai) continue;
            var pos = compCols[nama] - minCol;
            if (pos >= 0 && pos < width) {
              blok[rk][pos] = nilai;
              selKomponen++;
            }
          }
        }
        sh.getRange(2, minCol, blok.length, width).setValues(blok);
      }
    }

    if (out.length) {
      sh.getRange(2, sumStart, out.length, sumCount).setValues(out);
      /* warna kolom KONDISI + format tanggal */
      var kondisiPos = existingIdx[3] - sumStart + 1;
      var tglPos = existingIdx[0] - sumStart + 1;
      var skorPos = existingIdx[2] - sumStart + 1;
      var kondisiVals = sh.getRange(2, sumStart + kondisiPos - 1, out.length, 1).getValues();
      for (var q = 0; q < kondisiVals.length; q++) {
        var cell = sh.getRange(2 + q, sumStart + kondisiPos - 1);
        var v = String(kondisiVals[q][0] || '');
        if (v === 'Baik') cell.setBackground('#d9ead3').setFontColor('#1e4620');
        else if (v === 'Perlu Perhatian') cell.setBackground('#fce8b2').setFontColor('#6b4c00');
        else if (v === 'Kritis') cell.setBackground('#f4c7c3').setFontColor('#7a1f1f');
        else cell.setBackground(null).setFontColor(null);
      }
      sh.getRange(2, sumStart + skorPos - 1, out.length, 1).setNumberFormat('0.0');
      if (terisi) sh.getRange(2, sumStart, out.length, sumCount).setFontSize(10);
    }

    hasil.push(tipe + ': ' + terisi + '/' + kodeVals.length + ' unit diperbarui' +
      (selKomponen ? ', ' + selKomponen + ' sel komponen terisi' : ''));
  }

  var msg = hasil.join(' · ');
  try { SpreadsheetApp.getActiveSpreadsheet().toast(msg, 'FS Inspection · Sinkron master', 8); } catch (e) {}
  Logger.log(msg);
  return hasil;
}

/** Pasang trigger harian (01.00–02.00 WIB) untuk syncLatestToMaster */
function installTriggers() {
  removeTriggers();
  ScriptApp.newTrigger('syncLatestToMaster').timeBased().atHour(1).everyDays(1).create();
  try { SpreadsheetApp.getActiveSpreadsheet().toast('Jadwal sinkron harian dipasang.', 'FS Inspection', 6); } catch (e) {}
}

/** Hapus semua trigger syncLatestToMaster */
function removeTriggers() {
  var trigs = ScriptApp.getProjectTriggers();
  for (var i = 0; i < trigs.length; i++) {
    if (trigs[i].getHandlerFunction() === 'syncLatestToMaster') ScriptApp.deleteTrigger(trigs[i]);
  }
}

/* ====================== PENDUKUNG ====================== */

/** Baca aset dari sheet master → [{kode, wilayah, spec, jenis, status, components}] */
function readMasterAsset_(tipe) {
  var cfg = MASTER[tipe];
  var ss = SpreadsheetApp.openById(SOURCE_SPREADSHEET_ID);
  var sh = ss.getSheetByName(cfg.sheet);
  if (!sh) throw new Error('Sheet master "' + cfg.sheet + '" tidak ditemukan');

  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2) return [];
  var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  var header = values[0].map(function (v) { return String(v).trim(); });
  var lower = header.map(function (h) { return h.toLowerCase().replace(/\u00a0/g, ' '); });

  var colKode = indexOfHeader_(header, cfg.kode);
  var colWilayah = indexOfHeader_(header, cfg.wilayah);
  var colSpec = indexOfHeader_(header, cfg.spec);
  var colJenis = indexOfHeader_(header, cfg.jenis);
  var colStatus = indexOfHeader_(header, cfg.status);
  if (colKode < 1) throw new Error('Kolom "' + cfg.kode + '" tidak ada di sheet ' + cfg.sheet);

  var komponenList = tipe === 'Mesin' ? KOMPONEN_MESIN : KOMPONEN_IRRIGATOR;
  var colKomponen = {};
  for (var i = 0; i < komponenList.length; i++) {
    var pos = indexOfHeader_(header, komponenList[i]);
    if (pos > 0) colKomponen[komponenList[i]] = pos;
  }

  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var kode = String(row[colKode - 1] || '').trim();
    if (!kode) continue;

    var comps = {};
    for (var name in colKomponen) {
      var g = normalizeGrade_(row[colKomponen[name] - 1]);
      if (g) comps[name] = g;
    }
    out.push({
      kode: kode,
      wilayah: colWilayah > 0 ? String(row[colWilayah - 1] || '').trim() : '',
      spec: colSpec > 0 ? String(row[colSpec - 1] || '').trim() : '',
      jenis: colJenis > 0 ? String(row[colJenis - 1] || '').trim() : '',
      status: colStatus > 0 ? String(row[colStatus - 1] || '').trim() : '',
      components: comps
    });
  }
  return out;
}

/** Susun satu baris lengkap sesuai urutan header sheet Data Inspeksi */
function composeRow_(map, compIdx, cols, meta, komponen) {
  var row = [];
  for (var i = 0; i < cols; i++) row.push('');
  for (var key in meta) {
    if (map[key]) row[map[key] - 1] = meta[key];
  }
  var tipe = meta['Tipe Aset'];
  for (var label in compIdx) {
    var meta2 = compIdx[label];
    if (meta2.tipe !== tipe) continue;
    var col = map[label];
    if (!col) continue;
    var val = komponen ? komponen[meta2.name] : '';
    if (val) row[col - 1] = val;
  }
  return row;
}

/**
 * Kondisi unit. ATURAN: status "Rusak" selalu → "Kritis",
 * berapa pun skor komponennya.
 */
function kondisiDari_(skor, status) {
  if (String(status || '').trim().toLowerCase() === 'rusak') return 'Kritis';
  return skor >= 90 ? 'Baik' : skor >= 70 ? 'Perlu Perhatian' : 'Kritis';
}

/** Rekap A/B/C → skor & kondisi */
function rekap_(komponen, list, status) {
  var a = 0, b = 0, c = 0;
  for (var i = 0; i < list.length; i++) {
    var v = komponen[list[i]];
    if (v === 'A') a++; else if (v === 'B') b++; else if (v === 'C') c++;
  }
  var total = a + b + c;
  var skor = total ? Math.round(((a * 100 + b * 60) / total) * 10) / 10 : 0;
  var kondisi = kondisiDari_(skor, status);
  return { a: a, b: b, c: c, total: total, skor: skor, kondisi: kondisi };
}

/** Daftar komponen bernilai B/C → "Radiator:B · Mesin:C" */
function listTemuan_(komponen, list) {
  if (!komponen) return '';
  var parts = [];
  for (var i = 0; i < list.length; i++) {
    var v = komponen[list[i]];
    if (v === 'B' || v === 'C') parts.push(list[i] + ':' + v);
  }
  return parts.join(' · ');
}

function indexOfHeader_(header, name) {
  var target = String(name || '').trim().toLowerCase().replace(/\u00a0/g, ' ');
  for (var i = 0; i < header.length; i++) {
    if (String(header[i]).trim().toLowerCase().replace(/\u00a0/g, ' ') === target) return i + 1;
  }
  return -1;
}

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

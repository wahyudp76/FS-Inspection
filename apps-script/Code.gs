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
var SCRIPT_VERSION = '1.6.0'; // naikkan setiap kali kode berubah besar

/* ---- spreadsheet MASTER aset (Draft Dashboard) ---- */
var SOURCE_SPREADSHEET_ID = '1WbGTDqC0Anh6O54twsJfiBiWcTri7FHyQjXIFrOoLz4';
var MASTER = {
  Mesin:      { sheet: 'Mesin',     kode: 'Kode Unit', wilayah: 'Asal Mesin', spec: 'Spec',  jenis: 'Jenis', status: 'Status' },
  Irrigator:  { sheet: 'Irrigator', kode: 'KODE UNIT', wilayah: 'WILAYAH',     spec: 'Nozzle', jenis: 'Unit',  status: 'Status' }
};

/* ==================== SERVICE ENGINE (perawatan) ====================
   Pencatatan service ditulis ke sheet "Monitor Kasie FS" (tabel tb_service2,
   kolom A:H). Sheet "Data Service Engine" (tb_service1) menghitung sendiri
   service terakhir, HM, jadwal berikutnya, dan warning date dari tabel itu. */
var SERVICE = {
  logSheet: 'Monitor Kasie FS',      // tb_service2 → tempat MENULIS
  evalSheet: 'Data Service Engine',  // tb_service1 → hasil rumus (dibaca balik)
  headers: ['Posisi', 'No', 'Tanggal', 'Month', 'Bulan Service', 'Minggu Service', 'Kode Mesin', 'HM Service'],
  intervalHm: 250
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
  'Chasis', 'Ban', 'Pintu'
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
  'PE', 'Helically'
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
      return json_({ ok: true, sheet: SHEET_NAME, records: countRecords_(), version: SCRIPT_VERSION, rev: revisiSaatIni_(ensureSheet_(false)), ts: new Date().toISOString() });
    }
    if (action === 'history') {
      var payloadH = body.payload || {};
      var shH = ensureSheet_(false);
      var rev = revisiSaatIni_(shH);
      /* Klien sudah punya versi ini → balas sangat kecil (ratusan byte, bukan ~300 KB) */
      if (payloadH.rev && String(payloadH.rev) === rev) {
        return json_({ ok: true, unchanged: true, rev: rev, count: Math.max(0, shH.getLastRow() - 1) });
      }
      var records = readHistory_();
      if (payloadH.plain) {
        return json_({ ok: true, records: records, rev: rev, count: records.length, version: SCRIPT_VERSION, compressed: false });
      }
      var pack = kompresiKomponen_(records);
      return json_({
        ok: true, records: pack.records, kmap: pack.kmap, rev: rev,
        count: records.length, version: SCRIPT_VERSION, compressed: true
      });
    }
    if (action === 'submit') {
      var rec = writeInspection_(body.payload || {});
      return json_({ ok: true, record: rec });
    }
    if (action === 'update') {
      var recU = updateInspection_(body.payload || {});
      return json_({ ok: true, record: recU });
    }
    if (action === 'delete') {
      var resD = deleteInspection_(body.payload || {});
      return json_({ ok: true, result: resD });
    }
    if (action === 'syncmaster') {
      return json_({ ok: true, result: syncLatestToMaster() });
    }
    if (action === 'backfill') {
      return json_({ ok: true, result: backfillDariMaster((body.payload || {}).tanggal) });
    }
    if (action === 'svcread') {
      return json_({ ok: true, result: serviceRead_(), version: SCRIPT_VERSION });
    }
    if (action === 'svcrecord') {
      return json_({ ok: true, result: serviceRecord_(body.payload || {}) });
    }
    if (action === 'svcping') {
      var info = serviceInfo_();
      return json_({ ok: true, result: info, version: SCRIPT_VERSION });
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

/**
 * Hapus kolom "Category" / "Category (Irr)" yang sudah tidak dipakai
 * dari sheet "Data Inspeksi" (sisa struktur lama). Jalankan sekali setelah
 * kolom Category dihapus dari sheet Mesin & Irrigator.
 */
function hapusKolomCategory() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var sh = ensureSheet_(false);
    var last = sh.getLastColumn();
    if (!last) return 'Sheet "' + SHEET_NAME + '" masih kosong.';
    var header = sh.getRange(1, 1, 1, last).getValues()[0].map(function (v) { return String(v).trim(); });
    var target = [];
    for (var i = header.length - 1; i >= 0; i--) {   // kanan → kiri agar indeks tidak bergeser
      if (/^category(\s*\(irr\))?$/i.test(header[i])) target.push(i + 1);
    }
    if (!target.length) return 'Tidak ada kolom Category di sheet "' + SHEET_NAME + '".';
    for (var t = 0; t < target.length; t++) sh.deleteColumn(target[t]);
    return 'Dihapus ' + target.length + ' kolom Category dari "' + SHEET_NAME + '". Sekarang ' +
      (last - target.length) + ' kolom.';
  } finally {
    lock.releaseLock();
  }
}

function onOpen() {
  try {
    SpreadsheetApp.getUi()
      .createMenu('FS Inspection')
      .addItem('1. Siapkan / perbaiki tabel Data Inspeksi', 'setup')
      .addSeparator()
      .addItem('2. Isi inspeksi awal dari master (5 Mar 2026)', 'backfillDariMaster')
      .addItem('3. Sinkronkan hasil terakhir ke sheet Mesin & Irrigator', 'syncLatestToMaster')
      .addItem('4. Bersihkan kolom Category lama (Data Inspeksi)', 'hapusKolomCategory')
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
  for (i = 0; i < header.length; i++) seen[normKey_(header[i])] = true;
  for (i = 0; i < KOMPONEN_MESIN.length; i++) {
    var name = KOMPONEN_MESIN[i];
    var key = normKey_(name);
    if (seen[key]) continue;
    seen[key] = true;
    header.push(name);
  }
  for (i = 0; i < KOMPONEN_IRRIGATOR.length; i++) {
    var n2 = KOMPONEN_IRRIGATOR[i];
    var k2 = normKey_(n2);
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
      var k = normKey_(name);
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

    /* ---- IDEMPOTEN: clientId yang sama tidak boleh menambah baris kedua ---- */
    var clientId = String(p.clientId || '').trim();
    if (clientId && map['ID Inspeksi']) {
      var sudah = cariBaris_(sh, map['ID Inspeksi'], clientId);
      if (sudah) {
        var lama = bacaBaris_(sh, map, sudah);
        lama.duplicate = true;
        return lama;
      }
    }

    var now = new Date();
    var tanggal = p.tanggal || formatDate_(now);
    var ts = now.toISOString();

    var values = {
      'ID Inspeksi': clientId || ('FSI-' + now.getTime() + '-' + Math.random().toString(36).slice(2, 8)),
      'Tanggal': tanggal,
      'Timestamp': formatIso_(now),
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

    bumpRev_();
    return {
      id: values['ID Inspeksi'],
      clientId: clientId,
      timestamp: formatIso_(now),
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

/**
 * Ubah SATU baris sheet menjadi objek record. Dipakai bersama oleh
 * readHistory_() dan bacaBaris_() agar bentuk data selalu identik
 * (dulu submit mengembalikan ISO sementara history mengembalikan teks lokal
 * sehingga urutan "terbaru" di layar bisa salah).
 */
function rowToRecord_(header, row, rowIndex, compIdx) {
  var obj = { komponen: {} };
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
      case 'Timestamp':
        /* sel Date → ISO; teks lokal lama "2026-03-05 7:00:00" → ISO +07:00 */
        obj.timestamp = (v instanceof Date) ? formatIso_(v) : isoDariTeks_(v);
        break;
      case 'Tipe Aset': if (v) obj.tipe = String(v); break;
      case 'Kode Unit': if (v) obj.kode = String(v); break;
      case 'Wilayah': if (v) obj.wilayah = String(v); break;
      case 'Jenis Unit': if (v) obj.unitJenis = String(v); break;
      case 'Spesifikasi': if (v) obj.spec = String(v); break;
      case 'Status Unit': if (v) obj.statusUnit = String(v); break;
      case 'Petugas': if (v) obj.inspector = String(v); break;
      case 'A': obj.a = num_(v); break;
      case 'B': obj.b = num_(v); break;
      case 'C': obj.c = num_(v); break;
      case 'Total': obj.total = num_(v); break;
      case 'Skor': obj.skor = num_(v); break;
      case 'Kondisi': if (v) obj.kondisi = String(v); break;
      case 'Catatan': if (v) obj.catatan = String(v); break;
    }
  }
  if (!obj.id) obj.id = 'ROW-' + rowIndex;
  if (!obj.timestamp && obj.tanggal) obj.timestamp = obj.tanggal;
  return obj;
}

/** "2026-03-05 7:00:00" / "2026-03-05T07:00:00" / "2026-03-05" → ISO +07:00 */
function isoDariTeks_(v) {
  var s = String(v == null ? '' : v).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:?\d{2})$/.test(s)) return s; // sudah ISO berzona
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    var z = function (n) { return ('0' + n).slice(-2); };
    return m[1] + '-' + z(m[2]) + '-' + z(m[3]) + 'T' + z(m[4] || 0) + ':' + z(m[5] || 0) + ':' + z(m[6] || 0) + '+07:00';
  }
  var d = new Date(s);
  return isNaN(d.getTime()) ? s : formatIso_(d);
}

/**
 * Revisi isi sheet. Cukup murah (tanpa membaca 92 kolom penuh) dan berubah
 * setiap kali baris ditambah / sel diubah.
 */
function revisiSaatIni_(sh) {
  var segel = 0;
  try {
    segel = DriveApp.getFileById(ss_().getId()).getLastUpdated().getTime();
  } catch (e) {
    segel = 0;
  }
  return String(sh.getLastRow()) + ':' + String(sh.getLastColumn()) + ':' + String(segel);
}

function bumpRev_() {
  try { CacheService.getScriptCache().remove('fsi:rev'); } catch (e) {}
}

/**
 * UBAH satu baris inspeksi (berdasarkan kolom "ID Inspeksi").
 * Nilai A/B/C ditulis ulang ke kolom komponen tipe terkait dan ringkasan
 * (A/B/C/Total/Skor/Kondisi) dihitung ulang di server agar konsisten.
 */
function updateInspection_(p) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var id = String(p.id || '').trim();
    if (!id) throw new Error('ID inspeksi kosong.');
    var sh = ensureSheet_(false);
    var map = headerMap_(sh);
    if (!map['ID Inspeksi']) throw new Error('Kolom "ID Inspeksi" tidak ditemukan di sheet.');
    var rowIndex = cariBaris_(sh, map['ID Inspeksi'], id);
    if (!rowIndex) throw new Error('Baris dengan ID ' + id + ' tidak ditemukan (mungkin sudah dihapus / diubah di sheet).');

    var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
    var row = sh.getRange(rowIndex, 1, 1, header.length).getValues()[0];
    var rec = rowToRecord_(header, row, rowIndex, componentIndex_());

    var tipe = String(p.tipe || rec.tipe || '');
    var komponen = p.komponen || rec.komponen || {};
    var set = function (name, value) {
      if (map[name]) row[map[name] - 1] = value;
    };

    if (p.tanggal) set('Tanggal', String(p.tanggal));
    if (p.inspector !== undefined) set('Petugas', String(p.inspector || ''));
    if (p.catatan !== undefined) set('Catatan', String(p.catatan || ''));
    if (p.statusUnit !== undefined) set('Status Unit', String(p.statusUnit || ''));
    if (p.wilayah !== undefined) set('Wilayah', String(p.wilayah || ''));
    if (p.unitJenis !== undefined) set('Jenis Unit', String(p.unitJenis || ''));
    if (p.spec !== undefined) set('Spesifikasi', String(p.spec || ''));

    /* ---- nilai komponen: hanya kolom milik tipe baris ini ---- */
    var compIdx = componentIndex_();
    var a = 0, b = 0, c = 0;
    for (var label in compIdx) {
      if (compIdx[label].tipe !== tipe) continue;
      var col = map[label];
      if (!col) continue;
      var g = normalizeGrade_(komponen[compIdx[label].name]);
      row[col - 1] = g;
      if (g === 'A') a++; else if (g === 'B') b++; else if (g === 'C') c++;
    }
    var total = a + b + c;
    var skor = total ? Math.round(((a * 100 + b * 60) / total) * 10) / 10 : 0;
    set('A', a); set('B', b); set('C', c); set('Total', total); set('Skor', skor);
    set('Kondisi', kondisiDari_(skor, String(p.statusUnit || rec.statusUnit || '')));

    sh.getRange(rowIndex, 1, 1, header.length).setValues([row]);
    bumpRev_();

    var hasil = rowToRecord_(header, row, rowIndex, compIdx);
    hasil.skor = skor;
    return hasil;
  } finally {
    lock.releaseLock();
  }
}

/** HAPUS satu baris inspeksi (berdasarkan ID Inspeksi). */
function deleteInspection_(p) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var id = String(p.id || '').trim();
    if (!id) throw new Error('ID inspeksi kosong.');
    var sh = ensureSheet_(false);
    var map = headerMap_(sh);
    if (!map['ID Inspeksi']) throw new Error('Kolom "ID Inspeksi" tidak ditemukan di sheet.');
    var rowIndex = cariBaris_(sh, map['ID Inspeksi'], id);
    if (!rowIndex) throw new Error('Baris dengan ID ' + id + ' tidak ditemukan (mungkin sudah dihapus).');
    var info = sh.getRange(rowIndex, 1, 1, Math.min(6, sh.getLastColumn())).getValues()[0];
    sh.deleteRow(rowIndex);
    bumpRev_();
    return { id: id, deleted: true, row: rowIndex, info: info };
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
    if (!row[0] && !row[4]) continue; // kosong
    var obj = rowToRecord_(header, row, r + 2, compIdx);
    /* payload ramping: buang komponen kosong supaya transfer lebih kecil */
    if (!obj.komponen || Object.keys(obj.komponen).length === 0) delete obj.komponen;
    out.push(obj);
  }
  /* urutkan memakai waktu, bukan urutan baris sheet (baris bisa disisipkan manual) */
  out.sort(function (x, y) {
    var a = new Date(x.timestamp || x.tanggal || 0).getTime() || 0;
    var b = new Date(y.timestamp || y.tanggal || 0).getTime() || 0;
    if (a !== b) return b - a;
    return String(y.id).localeCompare(String(x.id));
  });
  return out;
}

function countRecords_() {
  var sh = ensureSheet_(false);
  return Math.max(0, sh.getLastRow() - 1);
}

/**
 * Kompresi kolom komponen untuk transfer.
 * Nilai A/B/C/kosong per unit dipadatkan jadi satu string sepanjang daftar
 * komponen tipe tersebut ("AAB-A..."). Ini memotong ~45% ukuran respon tanpa
 * kehilangan data: nama kolom cukup dikirim sekali lewat `kmap`.
 */
function kompresiKomponen_(records) {
  var kmap = { Mesin: KOMPONEN_MESIN, Irrigator: KOMPONEN_IRRIGATOR };
  var out = [];
  for (var i = 0; i < records.length; i++) {
    var rec = records[i];
    var komp = rec.komponen || null;
    delete rec.komponen;
    if (!komp) { out.push(rec); continue; }
    var list = rec.tipe === 'Irrigator' ? KOMPONEN_IRRIGATOR : KOMPONEN_MESIN;
    var s = '';
    var sisa = {};
    for (var j = 0; j < list.length; j++) {
      var g = komp[list[j]];
      s += (g === 'A' || g === 'B' || g === 'C') ? g : '-';
    }
    for (var name in komp) {
      if (list.indexOf(name) === -1) sisa[name] = komp[name];
    }
    rec.k = s;
    if (Object.keys(sisa).length) rec.kx = sisa;
    out.push(rec);
  }
  return { records: out, kmap: kmap };
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

/*********************** SERVICE ENGINE ***********************/

/** Sheet "Monitor Kasie FS" (tb_service2). */
function serviceLogSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(SERVICE.logSheet);
  if (!sh) throw new Error('Sheet "' + SERVICE.logSheet + '" tidak ditemukan di spreadsheet tujuan.');
  return sh;
}

/** Cari baris header tb_service2 berdasarkan teks "Kode Mesin" di kolom G. */
function serviceHeaderRow_(sh) {
  var max = Math.min(8, sh.getLastRow());
  for (var r = 1; r <= max; r++) {
    var v = String(sh.getRange(r, 7).getValue()).trim().toLowerCase();
    if (v === 'kode mesin') return r;
  }
  return 1;
}

/** "2026-10-25" / "25/10/2026" / Date → Date (jam 12 siang, aman dari zona waktu). */
function parseTanggal_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  var s = String(v == null ? '' : v).trim();
  var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0);
  m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], 12, 0, 0);
  return null;
}

/** Posisi unit (FM3/FM4/PG2/OP2) dari sheet "Data Service Engine". */
function petaEvaluasi_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(SERVICE.evalSheet);
  if (!sh) return {};
  var last = sh.getLastRow();
  if (last < 2) return {};
  var vals = sh.getRange(2, 1, last - 1, 10).getValues(); // A..J
  var out = {};
  for (var i = 0; i < vals.length; i++) {
    var kode = String(vals[i][1] || '').trim().toUpperCase();
    if (!kode || kode === 'KODE UNIT') continue;
    out[kode] = {
      baris: i + 2,
      kode: kode,
      posisi: String(vals[i][3] || '').trim().toUpperCase(),
      terakhir: vals[i][4],
      hm: vals[i][5],
      rerata: vals[i][6],
      nextTgl: vals[i][7],
      nextHm: vals[i][8],
      warning: vals[i][9]
    };
  }
  return out;
}

/** Baris header sheet "Data Service Engine" (dicari dari kolom B = KODE UNIT). */
function serviceEvalHeaderRow_(sh) {
  var max = Math.min(8, sh.getLastRow());
  for (var r = 1; r <= max; r++) {
    if (String(sh.getRange(r, 2).getValue()).trim().toUpperCase() === 'KODE UNIT') return r;
  }
  return 1;
}

/** Date → "yyyy-MM-dd" (teks) supaya mudah di-parse browser; nilai lain apa adanya. */
function isoRow_(row) {
  return row.map(function (v) {
    if (v instanceof Date && !isNaN(v.getTime())) return Utilities.formatDate(v, 'Asia/Jakarta', 'yyyy-MM-dd');
    return v;
  });
}

/**
 * BACA data service untuk dashboard:
 *   eval* = sheet "Data Service Engine" (tb_service1, hasil rumus)
 *   log*  = sheet "Monitor Kasie FS"    (tb_service2, input kasie)
 * Dikirim sebagai header + baris mentah supaya parse-nya satu tempat di web.
 */
function serviceRead_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var out = { ts: new Date().toISOString(), intervalHm: SERVICE.intervalHm };

  var evalSh = ss.getSheetByName(SERVICE.evalSheet);
  if (evalSh) {
    var hr = serviceEvalHeaderRow_(evalSh);
    var last = evalSh.getLastRow();
    var cols = Math.max(10, Math.min(23, evalSh.getLastColumn()));
    out.evalHeader = evalSh.getRange(hr, 1, 1, cols).getValues()[0].map(function (v) { return String(v); });
    out.evalRows = last > hr ? evalSh.getRange(hr + 1, 1, last - hr, cols).getValues().map(isoRow_) : [];
  } else {
    out.evalHeader = [];
    out.evalRows = [];
  }

  var logSh = serviceLogSheet_();
  var lhr = serviceHeaderRow_(logSh);
  var llast = logSh.getLastRow();
  out.logHeader = logSh.getRange(lhr, 1, 1, 8).getValues()[0].map(function (v) { return String(v); });
  out.logRows = llast > lhr ? logSh.getRange(lhr + 1, 1, llast - lhr, 8).getValues().map(isoRow_) : [];

  return out;
}

/** Info ringkas untuk pengujian koneksi modul service. */
function serviceInfo_() {
  var sh = serviceLogSheet_();
  var headerRow = serviceHeaderRow_(sh);
  return {
    sheet: SERVICE.logSheet,
    evalSheet: SERVICE.evalSheet,
    headerRow: headerRow,
    lastRow: sh.getLastRow(),
    barisData: Math.max(0, sh.getLastRow() - headerRow),
    intervalHm: SERVICE.intervalHm,
    versi: SCRIPT_VERSION
  };
}

/**
 * CATAT satu service → tambah satu baris di akhir tb_service2.
 * Idempoten: kode + tanggal + HM yang sama tidak ditulis dua kali.
 */
function serviceRecord_(p) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var kode = String(p.kode || p.kodeMesin || '').trim().toUpperCase();
    if (!kode) throw new Error('Kode mesin wajib diisi.');
    var tgl = parseTanggal_(p.tanggal);
    if (!tgl) throw new Error('Tanggal service tidak valid.');
    var hm = Number(String(p.hm == null ? '' : p.hm).replace(/[^\d.-]/g, ''));
    if (!isFinite(hm) || hm <= 0) throw new Error('HM service harus berupa angka lebih dari 0.');

    var sh = serviceLogSheet_();
    var headerRow = serviceHeaderRow_(sh);
    var lastRow = sh.getLastRow();
    var jumlahBaris = Math.max(0, lastRow - headerRow);
    var data = jumlahBaris ? sh.getRange(headerRow + 1, 1, jumlahBaris, 8).getValues() : [];

    var barisTerakhirData = 0;
    var noTerbesar = 0;
    var isoBaru = Utilities.formatDate(tgl, 'Asia/Jakarta', 'yyyy-MM-dd');
    for (var i = 0; i < data.length; i++) {
      var k = String(data[i][6] || '').trim();
      var no = Number(data[i][1]);
      if (k) barisTerakhirData = i + 1;
      if (isFinite(no) && no > noTerbesar) noTerbesar = no;
      /* sudah ada baris yang sama? jangan dobel */
      if (k.toUpperCase() === kode) {
        var tglLama = data[i][2] instanceof Date ? Utilities.formatDate(data[i][2], 'Asia/Jakarta', 'yyyy-MM-dd') : String(data[i][2] || '');
        var hmLama = Number(data[i][7]);
        if (String(tglLama).indexOf(isoBaru) === 0 && isFinite(hmLama) && hmLama === hm) {
          return { baris: headerRow + i + 1, no: no, kode: kode, hm: hm, tanggal: isoBaru, duplikat: true, verified: true, evaluasi: ringkasEvaluasi_(kode) };
        }
      }
    }

    var target = headerRow + barisTerakhirData + 1;
    var posisi = String(p.posisi || '').trim().toUpperCase();
    if (!posisi) {
      var peta = petaEvaluasi_();
      posisi = peta[kode] ? peta[kode].posisi : '';
    }
    var noBaru = noTerbesar + 1;

    sh.getRange(target, 1, 1, 8).setValues([[
      posisi,
      noBaru,
      tgl,
      '=MONTH(C' + target + ')',
      '=TEXT(D' + target + '*29,"mmmm")',
      '=ROUNDUP(DAY(C' + target + ')/7,0)',
      kode,
      hm
    ]]);
    SpreadsheetApp.flush();

    /* ---- pastikan rumus tb_service1 sudah membaca baris baru ---- */
    var ev = ringkasEvaluasi_(kode);
    var verified = !!(ev && (ev.hm == null || Number(ev.hm) >= hm));

    return {
      baris: target,
      no: noBaru,
      posisi: posisi,
      kode: kode,
      tanggal: isoBaru,
      hm: hm,
      verified: verified,
      evaluasi: ev
    };
  } finally {
    lock.releaseLock();
  }
}

/** Ringkasan jadwal satu unit dari sheet "Data Service Engine" (hasil rumus). */
function ringkasEvaluasi_(kode) {
  try {
    var peta = petaEvaluasi_();
    var row = peta[String(kode).trim().toUpperCase()];
    if (!row) return null;
    var fmt = function (v) {
      if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Jakarta', 'yyyy-MM-dd');
      return v == null ? '' : String(v);
    };
    return {
      terakhir: fmt(row.terakhir),
      hm: row.hm === '' ? null : Number(row.hm),
      nextService: fmt(row.nextTgl),
      nextHm: row.nextHm === '' ? null : Number(row.nextHm),
      warning: row.warning === '' ? null : Number(row.warning)
    };
  } catch (err) {
    return null;
  }
}

/* ====================== UTIL ====================== */
/** ISO 8601 dengan offset WIB — bisa di-parse semua browser (termasuk Safari). */
function formatIso_(d) {
  var dt = d ? new Date(d) : new Date();
  if (isNaN(dt.getTime())) dt = new Date();
  return Utilities.formatDate(dt, 'Asia/Jakarta', "yyyy-MM-dd'T'HH:mm:ss'+07:00'");
}

/** Cari baris yang kolom ke-`col` nilainya sama dengan `value` (mulai baris 2). */
function cariBaris_(sh, col, value) {
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return 0;
  var vals = sh.getRange(2, col, lastRow - 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === value) return i + 2;
  }
  return 0;
}

/** Baca satu baris sheet → objek record (bentuk sama dengan readHistory_). */
function bacaBaris_(sh, map, rowIndex) {
  var header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  var row = sh.getRange(rowIndex, 1, 1, header.length).getValues()[0];
  return rowToRecord_(header, row, rowIndex, componentIndex_());
}

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

/** Kunci pembanding header: nbsp → spasi, spasi ganda dirapatkan, huruf kecil */
function normKey_(s) {
  return String(s == null ? '' : s)
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function indexOfHeader_(header, name) {
  var target = normKey_(name);
  for (var i = 0; i < header.length; i++) {
    if (normKey_(header[i]) === target) return i + 1;
  }
  return -1;
}

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

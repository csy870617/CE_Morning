/**
 * 스프레드시트 읽기/쓰기 (설정, 로테이션 명단, 예외).
 */

var CE_TAB = {
  SETTINGS: '설정',
  ROTATION: '로테이션',
  CALENDAR: '달력(예외자)',
  STORE: '_달력저장',
  LOG: '_기록'
};

/** 예전에 쓰던 탭 이름. 열어 보고 있으면 새 이름으로 바꿔 줍니다. */
var CE_LEGACY_TAB_NAMES = [
  { from: '달력', to: '달력(예외자)' }
];

/** 화면에 보이는 탭 순서 (월별 표는 이 앞에 옵니다). */
var CE_TAB_ORDER = ['달력(예외자)', '로테이션', '설정'];

function ceRenameLegacyTabs() {
  var ss = ceSS();
  var renamed = [];
  for (var i = 0; i < CE_LEGACY_TAB_NAMES.length; i++) {
    var pair = CE_LEGACY_TAB_NAMES[i];
    var old = ss.getSheetByName(pair.from);
    if (old && !ss.getSheetByName(pair.to)) {
      old.setName(pair.to);
      renamed.push(pair.from + ' → ' + pair.to);
    }
  }
  return renamed;
}

/** 월별 표 시트인지 ('2026-09' 모양) */
function ceIsMonthSheetName(name) {
  return /^\d{4}-\d{2}$/.test(String(name));
}

/**
 * 탭 순서를 맞춥니다.
 *   방금 만든 표 → 나머지 월별 표(최근 달 먼저) → 달력(예외자) → 로테이션 → 설정
 * 숨긴 탭은 건드리지 않습니다.
 */
function ceOrderTabs(frontSheetName) {
  var ss = ceSS();
  var names = [];

  if (frontSheetName && ss.getSheetByName(frontSheetName)) names.push(frontSheetName);

  var months = [];
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    var n = sheets[i].getName();
    if (ceIsMonthSheetName(n) && n !== frontSheetName) months.push(n);
  }
  months.sort();
  months.reverse();
  names = names.concat(months);

  for (var t = 0; t < CE_TAB_ORDER.length; t++) {
    if (ss.getSheetByName(CE_TAB_ORDER[t])) names.push(CE_TAB_ORDER[t]);
  }

  var pos = 1;
  for (var k = 0; k < names.length; k++) {
    var sh = ss.getSheetByName(names[k]);
    if (!sh || sh.isSheetHidden()) continue;
    ss.setActiveSheet(sh);
    ss.moveActiveSheet(pos);
    pos++;
  }
  return names;
}

var CE_COLOR = {
  TITLE_BG: '#434343',
  HEAD_BG: '#588fad',
  BAND_BG: '#efefef',
  WARN_BG: '#f4cccc',
  HOLIDAY_BG: '#fff2cc',
  OUT_OF_MONTH: '#999999',
  BORDER: '#b7b7b7'
};

function ceSS() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function ceTz() {
  return ceSS().getSpreadsheetTimeZone();
}

/** 시트를 가져오고, 없으면 만듭니다. */
function ceSheet(name, createIfMissing) {
  var ss = ceSS();
  var sh = ss.getSheetByName(name);
  if (!sh && createIfMissing) sh = ss.insertSheet(name);
  return sh;
}

/** 셀 값이 날짜든 문자열이든 'YYYY-MM-DD' 로 바꿉니다. */
function ceCellToIso(v) {
  if (v == null || v === '') return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, ceTz(), 'yyyy-MM-dd');
  }
  var s = String(v).trim();
  var m = s.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!m) return '';
  var mm = Number(m[2]);
  var dd = Number(m[3]);
  return m[1] + '-' + (mm < 10 ? '0' + mm : mm) + '-' + (dd < 10 ? '0' + dd : dd);
}

/* ------------------------------------------------------------------ */
/* 설정                                                                */
/* ------------------------------------------------------------------ */

function ceReadConfig() {
  var sh = ceSheet(CE_TAB.SETTINGS, false);
  if (!sh) throw new Error('"' + CE_TAB.SETTINGS + '" 탭이 없습니다. 메뉴에서 [초기 설정 만들기] 를 먼저 눌러 주세요.');

  var values = sh.getRange(1, 1, sh.getLastRow(), 2).getValues();
  var map = {};
  for (var i = 0; i < values.length; i++) {
    var key = String(values[i][0]).trim();
    if (key) map[key] = values[i][1];
  }

  var anchor = ceCellToIso(map['로테이션 시작일']);
  if (!anchor) throw new Error('"' + CE_TAB.SETTINGS + '" 탭의 [로테이션 시작일] 을 YYYY-MM-DD 형식으로 채워 주세요.');

  function pick(keys, fallback) {
    for (var k = 0; k < keys.length; k++) {
      var v = map[keys[k]];
      if (v !== undefined && String(v).trim() !== '') return v;
    }
    return fallback;
  }

  return {
    anchor: anchor,
    dawnDows: ceParseDowList(pick(['새벽예배 요일'], '월,화,수,목,금,토')),
    satDows: ceParseDowList(pick(['토요 별도 요일', '토요별도 요일'], '토')),
    // '수요저녁 요일' 은 예전 이름입니다. 이미 쓰고 계신 시트를 위해 같이 받습니다.
    doorDows: ceParseDowList(pick(['수요현관 요일', '수요저녁 요일'], '수')),
    praiseDows: ceParseDowList(pick(['토요찬양 요일'], '토'))
  };
}

/* ------------------------------------------------------------------ */
/* 로테이션 명단                                                       */
/* ------------------------------------------------------------------ */

/**
 * 명단 열 정의. 열 위치가 아니라 1행 머리글 이름으로 찾습니다.
 * 그래야 열 순서를 바꾸거나 중간에 열을 끼워 넣어도 어긋나지 않습니다.
 */
var CE_ROTATION_COLUMNS = [
  { key: 'sermon', header: '설교' },
  { key: 'broadcast', header: '방송' },
  { key: 'satSermon', header: '토요설교' },
  { key: 'satBroadcast', header: '토요방송' },
  { key: 'door', header: '수요현관' },
  { key: 'praise', header: '토요찬양' }
];

function ceNormalizeHeader(v) {
  return String(v == null ? '' : v).replace(/\s+/g, '');
}

/**
 * 머리글 한 칸이 어느 명단인지 알아냅니다.
 * '토요 설교', '토요설교자', '방송실' 처럼 조금 달라도 알아보도록 낱말로 찾습니다.
 * 안내 문구가 머리글로 오인되지 않게 짧은 글만 봅니다.
 */
function ceMatchRotationKey(header) {
  var h = ceNormalizeHeader(header);
  if (!h || h.length > 8) return '';
  if (/[.,!?()]/.test(h)) return '';

  var sat = h.indexOf('토') >= 0;
  if (h.indexOf('찬양') >= 0) return 'praise';
  if (h.indexOf('현관') >= 0) return 'door';
  if (h.indexOf('설교') >= 0) return sat ? 'satSermon' : 'sermon';
  if (h.indexOf('방송') >= 0) return sat ? 'satBroadcast' : 'broadcast';
  return '';
}

/** 머리글 이름 -> 열 번호(1부터). 못 찾은 명단은 빠집니다. */
function ceRotationColumnMap(sh) {
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var found = {};
  for (var c = 0; c < headers.length; c++) {
    var key = ceMatchRotationKey(headers[c]);
    if (key && !found[key]) found[key] = c + 1;
  }
  return found;
}

/** 1 -> 'A', 27 -> 'AA' */
function ceColumnLetter(col) {
  var out = '';
  var n = col;
  while (n > 0) {
    var rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function ceEmptyRotations() {
  var rot = {};
  for (var i = 0; i < CE_ROTATION_COLUMNS.length; i++) rot[CE_ROTATION_COLUMNS[i].key] = [];
  return rot;
}

function ceReadRotations() {
  var sh = ceSheet(CE_TAB.ROTATION, false);
  if (!sh) throw new Error('"' + CE_TAB.ROTATION + '" 탭이 없습니다. 메뉴에서 [초기 설정 만들기] 를 먼저 눌러 주세요.');

  var rot = ceEmptyRotations();
  var colMap = ceRotationColumnMap(sh);
  rot._columns = colMap;

  var lastRow = sh.getLastRow();
  if (lastRow < 2) return rot;

  var lastCol = Math.max(sh.getLastColumn(), 1);
  var values = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();

  for (var key in colMap) {
    if (!Object.prototype.hasOwnProperty.call(colMap, key)) continue;
    var col = colMap[key] - 1;
    for (var r = 0; r < values.length; r++) {
      var name = String(values[r][col] == null ? '' : values[r][col]).trim();
      if (name) rot[key].push(name);
    }
  }
  return rot;
}

/* ------------------------------------------------------------------ */
/* 예외 - 달력 탭에 적어 둔 휴가·휴일                                   */
/* ------------------------------------------------------------------ */

/** 숨김 시트에 쌓아 둔 하루짜리 예외를 읽습니다. */
function ceReadStoredExceptions() {
  var sh = ceSheet(CE_TAB.STORE, false);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var iso = ceCellToIso(values[i][0]);
    var name = String(values[i][1] == null ? '' : values[i][1]).trim();
    if (!iso || !name) continue;
    out.push({ name: name, start: iso, end: iso, role: ceNormalizeRole(values[i][2]) });
  }
  return out;
}

/** 숨김 시트를 통째로 다시 씁니다. */
function ceWriteStoredExceptions(entries) {
  var sh = ceSheet(CE_TAB.STORE, true);
  sh.clear();
  sh.getRange(1, 1, 1, 3).setValues([['날짜', '이름', '역할']]).setFontWeight('bold');
  if (entries.length) {
    var rows = entries.map(function (e) { return [e.start, e.name, ceRoleLabel(e.role)]; });
    rows.sort(function (a, b) { return a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0); });
    sh.getRange(2, 1, rows.length, 3).setValues(rows);
  }
  sh.hideSheet();
}

function ceRoleLabel(role) {
  if (role === CE_ROLE.SERMON) return '설교';
  if (role === CE_ROLE.BROADCAST) return '방송';
  if (role === CE_ROLE.DOOR) return '수요현관';
  if (role === CE_ROLE.PRAISE) return '토요찬양';
  return '전체';
}

/** 예외(휴가·휴일)는 전부 달력 탭에서 옵니다. */
function ceReadAllExceptions() {
  return ceReadStoredExceptions();
}

/**
 * 스프레드시트 읽기/쓰기 (설정, 로테이션 명단, 예외).
 */

var CE_TAB = {
  SETTINGS: '설정',
  ROTATION: '로테이션',
  CALENDAR: '달력',
  LEAVE: '장기예외',
  STORE: '_달력저장'
};

var CE_COLOR = {
  TITLE_BG: '#434343',
  HEAD_BG: '#588fad',
  BAND_BG: '#efefef',
  WARN_BG: '#f4cccc',
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

  return {
    anchor: anchor,
    dawnDows: ceParseDowList(map['새벽예배 요일'] || '월,화,수,목,금,토'),
    doorDows: ceParseDowList(map['수요저녁 요일'] || '수')
  };
}

/* ------------------------------------------------------------------ */
/* 로테이션 명단                                                       */
/* ------------------------------------------------------------------ */

function ceReadRotations() {
  var sh = ceSheet(CE_TAB.ROTATION, false);
  if (!sh) throw new Error('"' + CE_TAB.ROTATION + '" 탭이 없습니다. 메뉴에서 [초기 설정 만들기] 를 먼저 눌러 주세요.');

  var lastRow = sh.getLastRow();
  var rot = { sermon: [], broadcast: [], door: [] };
  if (lastRow < 2) return rot;

  var values = sh.getRange(2, 1, lastRow - 1, 3).getValues();
  var cols = ['sermon', 'broadcast', 'door'];
  for (var r = 0; r < values.length; r++) {
    for (var c = 0; c < 3; c++) {
      var name = String(values[r][c] == null ? '' : values[r][c]).trim();
      if (name) rot[cols[c]].push(name);
    }
  }
  return rot;
}

/* ------------------------------------------------------------------ */
/* 예외 - 달력 그리드 저장분 + 장기예외 표                              */
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
  return '전체';
}

/** 장기예외 표를 읽습니다. */
function ceReadLeaveTable() {
  var sh = ceSheet(CE_TAB.LEAVE, false);
  if (!sh || sh.getLastRow() < 2) return [];
  var values = sh.getRange(2, 1, sh.getLastRow() - 1, 5).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var name = String(values[i][0] == null ? '' : values[i][0]).trim();
    var start = ceCellToIso(values[i][1]);
    if (!name || !start) continue;
    var end = ceCellToIso(values[i][2]) || start;
    if (end < start) { var t = end; end = start; start = t; }
    out.push({ name: name, start: start, end: end, role: ceNormalizeRole(values[i][3]) });
  }
  return out;
}

/** 달력 + 장기예외를 합친 전체 예외 목록. */
function ceReadAllExceptions() {
  return ceReadStoredExceptions().concat(ceReadLeaveTable());
}

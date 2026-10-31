/**
 * 스프레드시트 읽기/쓰기 (설정, 로테이션 명단, 예외).
 */

var CE_TAB = {
  SETTINGS: '설정',
  ROTATION: '로테이션',
  CALENDAR: '달력(예외자)',
  STORE: '_달력저장'
};

/** 생명의 삶(두란노 QT) 묵상 달력 주소 */
var CE_QT_URL = 'https://www.duranno.com/qt/view/calendar.asp';

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
  HOLIDAY_BG: '#f4cccc',        // 휴일 - 연한 빨강
  WARN_BG: '#ea9999',           // 채우지 못한 칸 - 좀 더 진한 빨강
  PICK_SERMON_BG: '#ffe599',    // 이름 체크: 설교자 줄 - 노랑
  PICK_OTHER_BG: '#d9ead3',     // 이름 체크: 그 밖의 줄 - 연한 초록
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
    // '수요현관 요일'·'수요저녁 요일'·'토요찬양 요일' 은 예전 이름입니다.
    // 이미 쓰고 계신 시트를 위해 같이 받습니다.
    doorDows: ceParseDowList(pick(['수요백업 요일', '수요현관 요일', '수요저녁 요일'], '수')),
    praiseDows: ceParseDowList(pick(['토요백업 요일', '토요찬양 요일'], '토'))
  };
}

/* ------------------------------------------------------------------ */
/* 로테이션 명단                                                       */
/* ------------------------------------------------------------------ */

/**
 * 명단 열 정의. 열 위치가 아니라 1행 머리글 이름으로 찾습니다.
 * 그래야 열 순서를 바꾸거나 중간에 열을 끼워 넣어도 어긋나지 않습니다.
 */
/**
 * 명단 열 정의.
 *  header     1행에 넣을 이름
 *  note       머리글에 붙일 메모 (초기 설정을 다시 누르면 최신 내용으로 갱신됩니다)
 *  renameFrom 예전에 쓰던 머리글. 이 이름이 적혀 있으면 header 로 바꿔 줍니다.
 *             (뜻이 달라진 이름만 적습니다. '설교자'·'방송실' 처럼 그냥 다르게
 *              쓰신 이름은 그대로 두고 알아보기만 합니다.)
 */
var CE_ROTATION_COLUMNS = [
  { key: 'sermon', header: '설교',
    note: '평일 새벽 설교자 명단' },
  { key: 'broadcast', header: '방송',
    note: '평일 새벽 방송실(백업) 명단' },
  { key: 'satSermon', header: '토요설교',
    note: '토요일 설교자 명단. 비워 두면 [설교] 명단으로 그냥 이어서 돕니다.' },
  { key: 'satBroadcast', header: '토요방송',
    note: '토요일 방송실 명단. 비워 두면 [방송] 명단으로 그냥 이어서 돕니다.' },
  { key: 'door', header: '수요백업',
    note: '수요저녁 백업 명단. 표 넷째 줄 [수요/토요] 의 수요일 칸에 들어갑니다. ' +
      '그날 설교자·방송실과 겹쳐도 바꾸지 않고 순서대로 돕니다.',
    renameFrom: ['수요현관', '수요저녁 현관', '현관'] },
  { key: 'praise', header: '토요백업',
    note: '토요일 백업 명단. 같은 넷째 줄의 토요일 칸에 들어갑니다. ' +
      '그날 설교자·방송실과 겹쳐도 바꾸지 않고 순서대로 돕니다.',
    renameFrom: ['토요찬양', '찬양'] },
  { key: 'holidaySermon', header: '휴일(설교)',
    note: '달력(예외자)에 [휴일] 로 적은 날의 설교자 명단. 평일·토요 순번과 따로 돕니다. ' +
      '비워 두면 그 칸은 빈 칸으로 남습니다 (직접 입력).' },
  { key: 'holidayBroadcast', header: '휴일(백업)',
    note: '달력(예외자)에 [휴일] 로 적은 날의 방송실 명단. 평일·토요 순번과 따로 돕니다. ' +
      '비워 두면 그 칸은 빈 칸으로 남습니다 (직접 입력).' },
  { key: 'usher', header: '현관안내',
    note: '현관안내 명단. 수요일이 든 주마다 세 명씩, 표 오른쪽 I열에 들어갑니다. ' +
      "그냥 [휴일] 로는 비우지 않고 [휴일(현관안내)] 라고 적은 주만 비웁니다." }
];

function ceNormalizeHeader(v) {
  return String(v == null ? '' : v).replace(/\s+/g, '');
}

/**
 * 머리글 한 칸이 어느 명단인지 알아냅니다.
 * '설교자', '토요 설교', '방송실', '수요현관' 처럼 조금 달라도 낱말로 찾습니다.
 * 안내 문구가 머리글로 오인되지 않게 짧은 글만 봅니다.
 */
function ceMatchRotationKey(header) {
  var h = ceNormalizeHeader(header);
  if (!h || h.length > 10) return '';
  if (/[.,!?]/.test(h)) return '';

  // '현관안내' 가 '현관'(수요백업) 으로 읽히지 않도록 먼저 봅니다.
  if (h.indexOf('안내') >= 0) return 'usher';

  if (h.indexOf('휴일') >= 0) {
    if (h.indexOf('설교') >= 0) return 'holidaySermon';
    if (h.indexOf('백업') >= 0 || h.indexOf('방송') >= 0) return 'holidayBroadcast';
    return '';
  }

  var sat = h.indexOf('토') >= 0;
  var wed = h.indexOf('수') >= 0;

  if (h.indexOf('찬양') >= 0) return 'praise';          // 예전 이름: 토요찬양
  if (h.indexOf('현관') >= 0) return 'door';            // 예전 이름: 수요현관
  if (h.indexOf('백업') >= 0) {
    if (sat) return 'praise';
    if (wed) return 'door';
    return '';
  }
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

function ceRoleLabel(role) {
  if (role === CE_ROLE.SERMON) return '설교';
  if (role === CE_ROLE.BROADCAST) return '방송';
  if (role === CE_ROLE.DOOR) return '수요현관';
  if (role === CE_ROLE.PRAISE) return '토요찬양';
  return '전체';
}

/* ------------------------------------------------------------------ */
/* 달력 저장소 (_달력저장 숨김 탭)                                      */
/*                                                                     */
/* 달력은 한 번에 한 달만 보여 주므로, 달을 옮길 때 지금 화면 내용을     */
/* 여기에 넣어 두고 새 달 내용을 꺼내 옵니다.                           */
/* ------------------------------------------------------------------ */

var CE_STORE = { SHOWN_LABEL_COL: 5, SHOWN_VALUE_COL: 6 };

function ceStoreSheet() {
  var sh = ceSheet(CE_TAB.STORE, true);
  if (String(sh.getRange(1, 1).getValue()).trim() !== '날짜') {
    sh.getRange(1, 1, 1, 3).setValues([['날짜', '이름', '역할']]).setFontWeight('bold');
    sh.getRange(1, CE_STORE.SHOWN_LABEL_COL).setValue('표시중인달').setFontWeight('bold');
  }
  sh.hideSheet();
  return sh;
}

/** 달력이 지금 어느 달을 그려 놓고 있는지 (B1 값이 아니라, 마지막으로 그린 달) */
function ceStoreGetShownMonth() {
  var sh = ceSheet(CE_TAB.STORE, false);
  if (!sh) return null;
  return ceParseYearMonth(sh.getRange(1, CE_STORE.SHOWN_VALUE_COL).getValue());
}

function ceStoreSetShownMonth(year, month) {
  var sh = ceStoreSheet();
  sh.getRange(1, CE_STORE.SHOWN_VALUE_COL).setNumberFormat('@').setValue(ceFormatYearMonth(year, month));
}

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

function ceWriteStoredExceptions(entries) {
  var sh = ceStoreSheet();
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, 3).clearContent();
  if (!entries.length) return;

  var rows = entries.map(function (e) { return [e.start, e.name, ceRoleLabel(e.role)]; });
  rows.sort(function (a, b) { return a[0] < b[0] ? -1 : (a[0] > b[0] ? 1 : 0); });
  sh.getRange(2, 1, rows.length, 3).setValues(rows);
}

/** 예외(휴가·휴일)는 달마다 저장해 둔 것을 전부 모아 씁니다. */
function ceReadAllExceptions() {
  return ceReadStoredExceptions();
}

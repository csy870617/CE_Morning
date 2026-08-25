/* 자동 생성 파일입니다. src/*.gs 를 고친 뒤 node tools/build.js 로 다시 만드세요. */

/* ===== Rotation.gs ===== */

/**
 * 새벽예배 담당자 로테이션 엔진 (순수 로직).
 *
 * 이 파일은 스프레드시트 API를 전혀 쓰지 않습니다. 입력(설정/명단/예외)만 받아
 * 배정 결과를 돌려주므로 Node 에서 그대로 테스트할 수 있습니다.
 */

/** 0=일 ... 6=토 */
var CE_DOW_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

/** 예외의 적용 범위 */
var CE_ROLE = {
  ALL: 'ALL',
  SERMON: 'SERMON',
  BROADCAST: 'BROADCAST',
  DOOR: 'DOOR',
  PRAISE: 'PRAISE'
};

/**
 * 달력에 이 말을 적으면 그날은 배정에서 통째로 빠집니다.
 * 시트 칸은 비워 두어 손으로 직접 적으실 수 있게 합니다.
 */
var CE_HOLIDAY_NAMES = ['휴일', '휴무', '없음', '직접입력'];

var CE_ROLE_LABELS = {
  '전체': CE_ROLE.ALL,
  '모두': CE_ROLE.ALL,
  '': CE_ROLE.ALL,
  '설교': CE_ROLE.SERMON,
  '설교자': CE_ROLE.SERMON,
  '방송': CE_ROLE.BROADCAST,
  '방송실': CE_ROLE.BROADCAST,
  '수요현관': CE_ROLE.DOOR,
  '현관': CE_ROLE.DOOR,
  '수요저녁 현관': CE_ROLE.DOOR,
  '토요찬양': CE_ROLE.PRAISE,
  '찬양': CE_ROLE.PRAISE
};

/* ------------------------------------------------------------------ */
/* 날짜 유틸 - 표준시 문제를 피하려고 전부 UTC 기준으로만 다룹니다.      */
/* ------------------------------------------------------------------ */

function ceParseIso(iso) {
  var parts = String(iso).trim().split('-');
  return new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
}

function ceIso(d) {
  var y = d.getUTCFullYear();
  var m = d.getUTCMonth() + 1;
  var day = d.getUTCDate();
  return y + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
}

function ceAddDays(d, n) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
}

function ceMakeDate(y, m, day) {
  return new Date(Date.UTC(y, m - 1, day));
}

/** 요일 이름('월')이나 숫자를 0~6 으로 정규화 */
function ceNormalizeDow(v) {
  if (typeof v === 'number') return v;
  var s = String(v).trim();
  var idx = CE_DOW_NAMES.indexOf(s.replace('요일', ''));
  if (idx >= 0) return idx;
  var n = Number(s);
  return isNaN(n) ? -1 : n;
}

function ceParseDowList(v) {
  if (v == null) return [];
  var raw = Array.isArray(v) ? v : String(v).split(/[,\s]+/);
  var out = [];
  for (var i = 0; i < raw.length; i++) {
    if (String(raw[i]).trim() === '') continue;
    var d = ceNormalizeDow(raw[i]);
    if (d >= 0 && d <= 6 && out.indexOf(d) < 0) out.push(d);
  }
  return out;
}

function ceNormalizeRole(v) {
  var key = String(v == null ? '' : v).trim();
  var r = CE_ROLE_LABELS[key];
  return r || CE_ROLE.ALL;
}

/* ------------------------------------------------------------------ */
/* 예외(휴가) 판정                                                     */
/* ------------------------------------------------------------------ */

function ceIsHolidayName(name) {
  return CE_HOLIDAY_NAMES.indexOf(String(name == null ? '' : name).trim()) >= 0;
}

/**
 * 그날 그 역할이 '휴일' 로 잡혀 있는지.
 * 휴일인 날은 아무도 배정하지 않고, 로테이션 순번도 그대로 둡니다.
 */
function ceIsHoliday(iso, role, exceptions) {
  for (var i = 0; i < exceptions.length; i++) {
    var ex = exceptions[i];
    if (!ceIsHolidayName(ex.name)) continue;
    if (ex.role !== CE_ROLE.ALL && ex.role !== role) continue;
    var end = ex.end || ex.start;
    if (iso >= ex.start && iso <= end) return true;
  }
  return false;
}

/**
 * exceptions: [{ name, start:'YYYY-MM-DD', end:'YYYY-MM-DD', role }]
 * end 가 비어 있으면 하루짜리로 봅니다.
 */
function ceIsAvailable(name, iso, role, exceptions) {
  if (!name) return false;
  var target = String(name).trim();
  for (var i = 0; i < exceptions.length; i++) {
    var ex = exceptions[i];
    if (String(ex.name).trim() !== target) continue;
    if (ex.role !== CE_ROLE.ALL && ex.role !== role) continue;
    var start = ex.start;
    var end = ex.end || ex.start;
    if (iso >= start && iso <= end) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* 로테이션                                                            */
/* ------------------------------------------------------------------ */

/**
 * ptr 위치부터 돌면서 그날 가능한 첫 사람을 뽑습니다.
 * 휴가인 사람은 건너뛰고, 건너뛴 사람의 차례는 소진되지 않습니다
 * (다음 바퀴에 다시 돌아옵니다).
 */
function cePickNext(list, ptr, iso, role, exceptions) {
  if (!list || list.length === 0) return { name: '', ptr: ptr, skipped: [] };
  var skipped = [];
  for (var k = 0; k < list.length; k++) {
    var idx = (ptr + k) % list.length;
    var name = list[idx];
    if (ceIsAvailable(name, iso, role, exceptions)) {
      return { name: name, ptr: (idx + 1) % list.length, skipped: skipped };
    }
    skipped.push(name);
  }
  // 전원 예외 - 빈칸으로 두고 포인터는 그대로 둡니다.
  return { name: '', ptr: ptr, skipped: skipped };
}

/**
 * 같은 날 설교자와 방송실이 같은 사람이면 방송실을 다음날과 맞바꿉니다.
 * 맞바꾼 결과가 또 겹치거나 휴가와 부딪히면 그 다음날로 밀어서 찾습니다.
 */
function ceResolveConflicts(days, exceptions) {
  for (var i = 0; i < days.length; i++) {
    var a = days[i];
    if (!a.preacher || !a.broadcast) continue;
    if (a.preacher !== a.broadcast) continue;

    var done = false;
    for (var j = i + 1; j < days.length; j++) {
      var b = days[j];
      if (!b.broadcast) continue;
      // 평일과 토요일은 방송 명단이 다르므로 서로 맞바꾸지 않습니다.
      if ((b.bcGroup || '') !== (a.bcGroup || '')) continue;
      if (b.broadcast === a.preacher) continue;                 // 바꿔도 i 일이 그대로 겹침
      if (a.broadcast === b.preacher) continue;                 // j 일에 새 충돌이 생김
      if (!ceIsAvailable(b.broadcast, a.iso, CE_ROLE.BROADCAST, exceptions)) continue;
      if (!ceIsAvailable(a.broadcast, b.iso, CE_ROLE.BROADCAST, exceptions)) continue;

      var tmp = a.broadcast;
      a.broadcast = b.broadcast;
      b.broadcast = tmp;
      a.swapNote = b.iso + ' 과 교대';
      b.swapNote = a.iso + ' 과 교대';
      done = true;
      break;
    }
    if (!done) a.warning = '설교자와 방송실이 겹치는데 같은 명단 안에서 바꿀 상대를 찾지 못했습니다';
  }
  return days;
}

/** 그날 새벽예배 설교자나 방송실로 이미 서는 사람인지. */
function ceClashesWithDawn(name, dawn) {
  if (!name || !dawn) return false;
  return dawn.preacher === name || dawn.broadcast === name;
}

/**
 * 수요현관·토요찬양이 그날 설교자나 방송실과 겹치면 다음 주와 맞바꿉니다.
 * (이 담당은 일주일에 한 번뿐이라 '다음 순번' 이 곧 다음 주입니다.)
 * 맞바꾼 결과가 또 겹치거나 상대가 그날 예외면 그 다음 주로 밀어서 찾습니다.
 */
function ceResolveSpecialConflicts(days, field, role, dawnByIso, exceptions, label) {
  for (var i = 0; i < days.length; i++) {
    var a = days[i];
    if (!a[field]) continue;
    if (!ceClashesWithDawn(a[field], dawnByIso[a.iso])) continue;

    var done = false;
    for (var j = i + 1; j < days.length; j++) {
      var b = days[j];
      if (!b[field]) continue;
      if (ceClashesWithDawn(b[field], dawnByIso[a.iso])) continue;   // 바꿔도 이쪽이 그대로 겹침
      if (ceClashesWithDawn(a[field], dawnByIso[b.iso])) continue;   // 저쪽에 새 충돌이 생김
      if (!ceIsAvailable(b[field], a.iso, role, exceptions)) continue;
      if (!ceIsAvailable(a[field], b.iso, role, exceptions)) continue;

      var tmp = a[field];
      a[field] = b[field];
      b[field] = tmp;
      a.swapNote = b.iso + ' 과 교대';
      b.swapNote = a.iso + ' 과 교대';
      done = true;
      break;
    }
    if (!done) a.warning = label + ' 담당이 그날 설교자·방송실과 겹치는데 바꿀 상대를 찾지 못했습니다';
  }
  return days;
}

/* ------------------------------------------------------------------ */
/* 전체 배정                                                           */
/* ------------------------------------------------------------------ */

/**
 * 기준일(anchor)부터 endIso 까지 하루도 빠짐없이 걸어가며 배정합니다.
 * 저장된 포인터를 쓰지 않으므로 몇 번을 다시 돌려도 결과가 같습니다.
 *
 * cfg        : { anchor, dawnDows, doorDows }
 * rotations  : { sermon: [], broadcast: [], door: [] }
 * exceptions : [{ name, start, end, role }]
 *
 * 반환: { byIso: { 'YYYY-MM-DD': {...} }, dawnDays: [...], doorDays: [...] }
 */
function ceBuildSchedule(cfg, rotations, exceptions, endIso) {
  var anchor = ceParseIso(cfg.anchor);
  var ex = exceptions || [];
  var rot = rotations || {};

  var dawnDows = cfg.dawnDows && cfg.dawnDows.length ? cfg.dawnDows : [1, 2, 3, 4, 5, 6];
  var satDows = cfg.satDows && cfg.satDows.length ? cfg.satDows : [6];
  var doorDows = cfg.doorDows && cfg.doorDows.length ? cfg.doorDows : [3];
  var praiseDows = cfg.praiseDows && cfg.praiseDows.length ? cfg.praiseDows : [6];

  var dawnDays = [];
  var doorDays = [];
  var praiseDays = [];

  // 명단마다 자기 순번을 따로 갖습니다.
  var ptr = { sermon: 0, broadcast: 0, satSermon: 0, satBroadcast: 0, door: 0, praise: 0 };

  function has(key) {
    return rot[key] && rot[key].length > 0;
  }

  /** 그날 이 역할에 쓸 명단 이름을 고릅니다. 토요 명단이 비어 있으면 평일 명단을 그대로 씁니다. */
  function groupFor(dow, weekdayKey, satKey) {
    return (satDows.indexOf(dow) >= 0 && has(satKey)) ? satKey : weekdayKey;
  }

  function take(key, iso, role) {
    var picked = cePickNext(rot[key] || [], ptr[key], iso, role, ex);
    ptr[key] = picked.ptr;
    return picked.name;
  }

  for (var d = anchor; ceIso(d) <= endIso; d = ceAddDays(d, 1)) {
    var iso = ceIso(d);
    var dow = d.getUTCDay();

    if (dawnDows.indexOf(dow) >= 0) {
      var sermonKey = groupFor(dow, 'sermon', 'satSermon');
      var broadcastKey = groupFor(dow, 'broadcast', 'satBroadcast');

      var offSermon = ceIsHoliday(iso, CE_ROLE.SERMON, ex);
      var offBroadcast = ceIsHoliday(iso, CE_ROLE.BROADCAST, ex);

      var preacher = offSermon ? '' : take(sermonKey, iso, CE_ROLE.SERMON);
      var broadcast = offBroadcast ? '' : take(broadcastKey, iso, CE_ROLE.BROADCAST);

      dawnDays.push({
        iso: iso,
        dow: dow,
        preacher: preacher,
        broadcast: broadcast,
        offSermon: offSermon,
        offBroadcast: offBroadcast,
        // 명단 자체가 비어 있으면 빈칸이 당연하므로 알리지 않습니다.
        // 명단은 있는데 전원 예외라 못 채운 경우만 표시합니다.
        gapSermon: !offSermon && !preacher && has(sermonKey),
        gapBroadcast: !offBroadcast && !broadcast && has(broadcastKey),
        smGroup: sermonKey,
        bcGroup: broadcastKey
      });
    }

    if (doorDows.indexOf(dow) >= 0) {
      var offDoor = ceIsHoliday(iso, CE_ROLE.DOOR, ex);
      var doorName = offDoor ? '' : take('door', iso, CE_ROLE.DOOR);
      doorDays.push({
        iso: iso, dow: dow, door: doorName, offDoor: offDoor,
        gapDoor: !offDoor && !doorName && has('door')
      });
    }

    if (praiseDows.indexOf(dow) >= 0) {
      var offPraise = ceIsHoliday(iso, CE_ROLE.PRAISE, ex);
      var praiseName = offPraise ? '' : take('praise', iso, CE_ROLE.PRAISE);
      praiseDays.push({
        iso: iso, dow: dow, praise: praiseName, offPraise: offPraise,
        gapPraise: !offPraise && !praiseName && has('praise')
      });
    }
  }

  ceResolveConflicts(dawnDays, ex);

  // 설교·방송이 확정된 뒤에 수요현관·토요찬양의 겹침을 풉니다.
  var dawnByIso = {};
  for (var k = 0; k < dawnDays.length; k++) dawnByIso[dawnDays[k].iso] = dawnDays[k];
  ceResolveSpecialConflicts(doorDays, 'door', CE_ROLE.DOOR, dawnByIso, ex, '수요현관');
  ceResolveSpecialConflicts(praiseDays, 'praise', CE_ROLE.PRAISE, dawnByIso, ex, '토요찬양');

  var byIso = {};
  function slot(iso) {
    if (!byIso[iso]) {
      byIso[iso] = {
        iso: iso, preacher: '', broadcast: '', door: '', praise: '',
        offSermon: false, offBroadcast: false, offDoor: false, offPraise: false,
        gapSermon: false, gapBroadcast: false, gapDoor: false, gapPraise: false,
        swapNote: '', warning: '',
        specialSwapNote: '', specialWarning: ''
      };
    }
    return byIso[iso];
  }

  var i;
  for (i = 0; i < dawnDays.length; i++) {
    var day = dawnDays[i];
    var cell = slot(day.iso);
    cell.preacher = day.preacher;
    cell.broadcast = day.broadcast;
    cell.offSermon = !!day.offSermon;
    cell.offBroadcast = !!day.offBroadcast;
    cell.gapSermon = !!day.gapSermon;
    cell.gapBroadcast = !!day.gapBroadcast;
    cell.swapNote = day.swapNote || '';
    cell.warning = day.warning || '';
  }
  for (i = 0; i < doorDays.length; i++) {
    var wd = doorDays[i];
    var dc = slot(wd.iso);
    dc.door = wd.door;
    dc.offDoor = !!wd.offDoor;
    dc.gapDoor = !!wd.gapDoor;
    dc.specialSwapNote = wd.swapNote || '';
    dc.specialWarning = wd.warning || '';
  }
  for (i = 0; i < praiseDays.length; i++) {
    var pd = praiseDays[i];
    var pc = slot(pd.iso);
    pc.praise = pd.praise;
    pc.offPraise = !!pd.offPraise;
    pc.gapPraise = !!pd.gapPraise;
    if (pd.swapNote) pc.specialSwapNote = pd.swapNote;
    if (pd.warning) pc.specialWarning = pd.warning;
  }

  return { byIso: byIso, dawnDays: dawnDays, doorDays: doorDays, praiseDays: praiseDays };
}

/* ------------------------------------------------------------------ */
/* 월별 표 격자                                                        */
/* ------------------------------------------------------------------ */

/**
 * 시트에 그릴 격자를 만듭니다. 월요일에 시작해 토요일에 끝나는 주 단위이고,
 * 첫 주와 마지막 주에는 앞뒤 달의 날짜가 섞여 들어옵니다(원래 표와 같은 모양).
 */
function ceMonthGrid(year, month) {
  var first = ceMakeDate(year, month, 1);
  var last = ceMakeDate(year, month + 1, 0);

  var start = first;
  while (start.getUTCDay() !== 1) start = ceAddDays(start, -1);   // 그 주 월요일까지 뒤로
  var end = last;
  while (end.getUTCDay() !== 6) end = ceAddDays(end, 1);          // 그 주 토요일까지 앞으로

  var weeks = [];
  var cursor = start;
  while (ceIso(cursor) <= ceIso(end)) {
    var week = [];
    for (var i = 0; i < 6; i++) {                                 // 월~토 6칸
      var d = ceAddDays(cursor, i);
      week.push({
        iso: ceIso(d),
        day: d.getUTCDate(),
        dow: d.getUTCDay(),
        inMonth: d.getUTCMonth() === month - 1 && d.getUTCFullYear() === year
      });
    }
    weeks.push(week);
    cursor = ceAddDays(cursor, 7);
  }
  return { weeks: weeks, startIso: ceIso(start), endIso: ceIso(end) };
}

if (typeof module !== 'undefined') {
  module.exports = {
    CE_ROLE: CE_ROLE,
    CE_DOW_NAMES: CE_DOW_NAMES,
    ceParseIso: ceParseIso,
    ceIso: ceIso,
    ceAddDays: ceAddDays,
    ceParseDowList: ceParseDowList,
    ceNormalizeRole: ceNormalizeRole,
    CE_HOLIDAY_NAMES: CE_HOLIDAY_NAMES,
    ceIsHolidayName: ceIsHolidayName,
    ceIsHoliday: ceIsHoliday,
    ceIsAvailable: ceIsAvailable,
    cePickNext: cePickNext,
    ceResolveConflicts: ceResolveConflicts,
    ceResolveSpecialConflicts: ceResolveSpecialConflicts,
    ceClashesWithDawn: ceClashesWithDawn,
    ceBuildSchedule: ceBuildSchedule,
    ceMonthGrid: ceMonthGrid
  };
}

/* ===== Sheets.gs ===== */

/**
 * 스프레드시트 읽기/쓰기 (설정, 로테이션 명단, 예외).
 */

var CE_TAB = {
  SETTINGS: '설정',
  ROTATION: '로테이션',
  CALENDAR: '달력',
  STORE: '_달력저장'
};

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

/* ===== Calendar.gs ===== */

/**
 * "달력" 탭 - 한 달치 달력 그리드에 그날 빠지는 사람 이름을 적어 두는 곳.
 *
 * 화면에 보이는 건 한 달이지만, 적어 넣은 내용은 숨김 시트에 계속 쌓여서
 * 달을 바꿔도 지워지지 않습니다.
 *
 * 이름 칸 적는 법:  홍길동, 김집사(방송)
 *   - 그냥 이름만 쓰면 그날 전부(설교/방송/수요현관)에서 빠집니다.
 *   - 괄호로 역할을 적으면 그 역할에서만 빠집니다. (설교 / 방송 / 수요현관)
 *   - 이름 대신 '휴일' 을 적으면 그날은 아무도 배정하지 않고 표의 칸을 비웁니다.
 *     (로테이션 순번도 소모되지 않습니다. '휴일(방송)' 처럼 역할만 지정할 수도 있습니다.)
 */

var CE_CAL = {
  YM_ROW: 1,
  YM_COL: 2,
  HEAD_ROW: 3,
  FIRST_WEEK_ROW: 4,
  COLS: 7
};

/** 일요일 시작 7칸짜리 보통 달력. */
function ceCalendarWeeks(year, month) {
  var first = ceMakeDate(year, month, 1);
  var last = ceMakeDate(year, month + 1, 0);
  var start = first;
  while (start.getUTCDay() !== 0) start = ceAddDays(start, -1);
  var end = last;
  while (end.getUTCDay() !== 6) end = ceAddDays(end, 1);

  var weeks = [];
  var cursor = start;
  while (ceIso(cursor) <= ceIso(end)) {
    var week = [];
    for (var i = 0; i < CE_CAL.COLS; i++) {
      var d = ceAddDays(cursor, i);
      week.push({
        iso: ceIso(d),
        day: d.getUTCDate(),
        inMonth: d.getUTCMonth() === month - 1 && d.getUTCFullYear() === year
      });
    }
    weeks.push(week);
    cursor = ceAddDays(cursor, 7);
  }
  return weeks;
}

/** 'YYYY-MM' 또는 '2026년 9월' 을 {year, month} 로. */
function ceParseYearMonth(v) {
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return { year: v.getFullYear(), month: v.getMonth() + 1 };
  }
  var s = String(v == null ? '' : v).trim();
  var m = s.match(/^(\d{4})\D+(\d{1,2})/);
  if (!m) return null;
  var month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return { year: Number(m[1]), month: month };
}

function ceFormatYearMonth(year, month) {
  return year + '-' + (month < 10 ? '0' + month : month);
}

/** 이름 칸 한 줄을 [{name, role}] 로 풉니다. */
function ceParseNameCell(text) {
  var s = String(text == null ? '' : text).trim();
  if (!s) return [];
  var tokens = s.split(/[,\n;\/]+/);
  var out = [];
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i].trim();
    if (!t) continue;
    var role = CE_ROLE.ALL;
    var m = t.match(/^(.*?)[(（]\s*([^)）]*)\s*[)）]\s*$/);
    if (m) {
      t = m[1].trim();
      role = ceNormalizeRole(m[2]);
    }
    if (t) out.push({ name: t, role: role });
  }
  return out;
}

function ceFormatNameCell(entries) {
  return entries.map(function (e) {
    return e.role === CE_ROLE.ALL ? e.name : e.name + '(' + ceRoleLabel(e.role) + ')';
  }).join(', ');
}

/**
 * 지금 화면에 떠 있는 달력의 내용을 숨김 시트에 저장합니다.
 * 다른 달의 기록은 건드리지 않습니다.
 */
function ceSaveCalendar() {
  var sh = ceSheet(CE_TAB.CALENDAR, false);
  if (!sh) return 0;
  var ym = ceParseYearMonth(sh.getRange(CE_CAL.YM_ROW, CE_CAL.YM_COL).getValue());
  if (!ym) return 0;

  var weeks = ceCalendarWeeks(ym.year, ym.month);
  var visible = {};
  var fresh = [];

  for (var w = 0; w < weeks.length; w++) {
    var nameRow = CE_CAL.FIRST_WEEK_ROW + w * 2 + 1;
    var row = sh.getRange(nameRow, 1, 1, CE_CAL.COLS).getValues()[0];
    for (var c = 0; c < CE_CAL.COLS; c++) {
      var cell = weeks[w][c];
      if (!cell.inMonth) continue;
      visible[cell.iso] = true;
      var entries = ceParseNameCell(row[c]);
      for (var i = 0; i < entries.length; i++) {
        fresh.push({ name: entries[i].name, start: cell.iso, end: cell.iso, role: entries[i].role });
      }
    }
  }

  // 이 달에 해당하는 기존 기록은 방금 읽은 것으로 통째로 갈아 끼웁니다.
  var kept = ceReadStoredExceptions().filter(function (e) { return !visible[e.start]; });
  ceWriteStoredExceptions(kept.concat(fresh));
  return fresh.length;
}

/**
 * 달력을 해당 연월로 다시 그립니다. 그리기 전에 지금 내용을 먼저 저장합니다.
 */
function ceRenderCalendar(year, month) {
  ceSaveCalendar();

  var sh = ceSheet(CE_TAB.CALENDAR, true);
  var stored = ceReadStoredExceptions();
  var byIso = {};
  for (var i = 0; i < stored.length; i++) {
    if (!byIso[stored[i].start]) byIso[stored[i].start] = [];
    byIso[stored[i].start].push({ name: stored[i].name, role: stored[i].role });
  }

  var weeks = ceCalendarWeeks(year, month);
  sh.clear();
  sh.clearNotes();
  // 달마다 주 수가 5주/6주로 달라지므로 지난번 병합을 먼저 풉니다.
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();

  sh.getRange(CE_CAL.YM_ROW, 1).setValue('연월').setFontWeight('bold');
  sh.getRange(CE_CAL.YM_ROW, CE_CAL.YM_COL).setValue(ceFormatYearMonth(year, month))
    .setNumberFormat('@').setFontWeight('bold').setBackground('#fff2cc');
  sh.getRange(CE_CAL.YM_ROW, 3, 1, 5).merge()
    .setValue('연월을 바꾼 뒤 메뉴에서 [달력 다시 그리기] 를 누르세요. 적은 내용은 저장됩니다.')
    .setFontColor('#666666');

  sh.setRowHeight(2, 34);
  sh.getRange(2, 1, 1, CE_CAL.COLS).merge()
    .setValue('날짜 아래 칸에 그날 빠지는 사람 이름을 적으세요.  예)  홍길동,  김집사(방송)   — 역할을 안 적으면 그날 전부 제외\n' +
      '그날 배정을 아예 하지 않고 직접 적으실 거면  휴일  이라고 적으세요. 표의 그 날 칸이 비워집니다.  방송실만 비우려면  휴일(방송)')
    .setFontColor('#666666').setWrap(true);

  var headers = [['일', '월', '화', '수', '목', '금', '토']];
  sh.getRange(CE_CAL.HEAD_ROW, 1, 1, CE_CAL.COLS).setValues(headers)
    .setBackground(CE_COLOR.HEAD_BG).setFontColor('#ffffff')
    .setFontWeight('bold').setHorizontalAlignment('center');

  for (var w = 0; w < weeks.length; w++) {
    var dateRow = CE_CAL.FIRST_WEEK_ROW + w * 2;
    var nameRow = dateRow + 1;
    var dates = [];
    var names = [];
    var colors = [];
    for (var c = 0; c < CE_CAL.COLS; c++) {
      var cell = weeks[w][c];
      dates.push(cell.inMonth ? cell.day : '');
      names.push(cell.inMonth ? ceFormatNameCell(byIso[cell.iso] || []) : '');
      colors.push(cell.inMonth ? null : CE_COLOR.BAND_BG);
    }
    sh.getRange(dateRow, 1, 1, CE_CAL.COLS).setValues([dates])
      .setFontWeight('bold').setHorizontalAlignment('left').setBackground('#f3f3f3');
    sh.getRange(nameRow, 1, 1, CE_CAL.COLS).setValues([names]).setWrap(true);
    for (var k = 0; k < CE_CAL.COLS; k++) {
      if (colors[k]) {
        sh.getRange(dateRow, k + 1, 2, 1).setBackground(colors[k]);
      }
    }
    sh.setRowHeight(nameRow, 44);
  }

  var lastRow = CE_CAL.FIRST_WEEK_ROW + weeks.length * 2 - 1;
  sh.getRange(CE_CAL.HEAD_ROW, 1, lastRow - CE_CAL.HEAD_ROW + 1, CE_CAL.COLS)
    .setBorder(true, true, true, true, true, true, CE_COLOR.BORDER, SpreadsheetApp.BorderStyle.SOLID);
  for (var col = 1; col <= CE_CAL.COLS; col++) sh.setColumnWidth(col, 120);
  sh.setFrozenRows(CE_CAL.HEAD_ROW);
  return sh;
}

/* ===== Render.gs ===== */

/**
 * 월별 배정 표를 그립니다. (원래 쓰시던 표와 같은 모양)
 *
 *   A열 = 항목 이름,  B~G열 = 월~토
 *   한 주마다 Date / 설교자 / 방송실 / 수요·토요 네 줄
 */

var CE_OUT = {
  TITLE_ROW: 1,
  DOW_ROW: 2,
  FIRST_BLOCK_ROW: 3,
  COLS: 6,          // 월~토
  FIRST_COL: 2      // B열
};

var CE_ROW_LABELS = ['Date', '설교자', '방송실', '수요/토요'];

/**
 * 넷째 줄은 요일에 따라 내용이 바뀝니다.
 * 수요일에는 수요현관 담당, 토요일에는 토요찬양 담당이 들어갑니다.
 */
function ceSpecialSlot(dow, info, cfg) {
  var doorDows = cfg.doorDows && cfg.doorDows.length ? cfg.doorDows : [3];
  var praiseDows = cfg.praiseDows && cfg.praiseDows.length ? cfg.praiseDows : [6];
  if (doorDows.indexOf(dow) >= 0) {
    return {
      name: info.door || '', off: !!info.offDoor, gap: !!info.gapDoor, label: '수요현관',
      swapNote: info.specialSwapNote || '', warning: info.specialWarning || ''
    };
  }
  if (praiseDows.indexOf(dow) >= 0) {
    return {
      name: info.praise || '', off: !!info.offPraise, gap: !!info.gapPraise, label: '토요찬양',
      swapNote: info.specialSwapNote || '', warning: info.specialWarning || ''
    };
  }
  return { name: '', off: false, gap: false, label: '', swapNote: '', warning: '' };
}

function ceMonthSheetName(year, month) {
  return ceFormatYearMonth(year, month);
}

/**
 * 배정을 계산해서 'YYYY-MM' 시트에 씁니다. 시트가 있으면 덮어씁니다.
 * 저장된 순번 없이 기준일부터 매번 새로 계산하므로, 몇 번을 돌려도 결과가 같습니다.
 */
function ceGenerateMonth(year, month) {
  ceSaveCalendar();               // 달력에 적어만 두고 저장 안 한 내용까지 반영

  var cfg = ceReadConfig();
  var rot = ceReadRotations();
  if (!rot.sermon.length) throw new Error('"' + CE_TAB.ROTATION + '" 탭의 [설교] 명단이 비어 있습니다.');

  var ex = ceReadAllExceptions();
  var grid = ceMonthGrid(year, month);

  if (grid.endIso < cfg.anchor) {
    throw new Error('로테이션 시작일(' + cfg.anchor + ') 보다 앞선 달입니다. 시작일을 앞으로 당겨 주세요.');
  }

  var sched = ceBuildSchedule(cfg, rot, ex, grid.endIso);
  ceWriteMonthSheet(year, month, grid, sched, cfg, rot);

  var notes = ceFallbackNotes(rot, cfg);
  return {
    sheetName: ceMonthSheetName(year, month),
    warnings: ceCollectWarnings(grid, sched, cfg),
    notes: notes
  };
}

/**
 * 명단이 왜 안 쓰이고 있는지 알려 줍니다.
 * 열 자체를 못 찾은 것과, 열은 있는데 이름이 안 적힌 것을 구분합니다.
 */
function ceFallbackNotes(rot, cfg) {
  var cols = rot._columns || {};
  var notes = [];

  // 토요일이 새벽예배 요일에 없으면 토요일 칸은 아예 비어 있게 됩니다.
  var satMissing = [];
  for (var d = 0; d < cfg.satDows.length; d++) {
    if (cfg.dawnDows.indexOf(cfg.satDows[d]) < 0) satMissing.push(CE_DOW_NAMES[cfg.satDows[d]]);
  }
  if (satMissing.length) {
    notes.push('[설정] 탭의 [새벽예배 요일] 에 ' + satMissing.join('·') + '요일이 없습니다. ' +
      '그래서 그 요일은 설교자·방송실을 아예 배정하지 않습니다.');
  }
  var praiseMissing = [];
  for (var q = 0; q < cfg.praiseDows.length; q++) {
    if (cfg.dawnDows.indexOf(cfg.praiseDows[q]) < 0) praiseMissing.push(CE_DOW_NAMES[cfg.praiseDows[q]]);
  }
  void praiseMissing;   // 토요찬양은 새벽예배와 무관하므로 알리지 않습니다.

  function check(key, header, whenEmpty) {
    if (!cols[key]) {
      notes.push('[' + header + '] 열을 "' + CE_TAB.ROTATION + '" 탭에서 찾지 못했습니다. ' +
        '[① 초기 설정 만들기] 를 한 번 더 눌러 주세요.');
      return;
    }
    if (!(rot[key] || []).length) {
      notes.push('[' + header + '] 열(' + ceColumnLetter(cols[key]) + '열)에 이름이 없습니다. ' + whenEmpty);
    }
  }

  check('satSermon', '토요설교', '토요일도 [설교] 명단으로 이어서 돌았습니다.');
  check('satBroadcast', '토요방송', '토요일도 [방송] 명단으로 이어서 돌았습니다.');
  check('door', '수요현관', '수요일 넷째 줄은 비워 두었습니다.');
  check('praise', '토요찬양', '토요일 넷째 줄은 비워 두었습니다.');
  return notes;
}

function ceCollectWarnings(grid, sched, cfg) {
  var out = [];
  var labels = [
    { gap: 'gapSermon', label: '설교자' },
    { gap: 'gapBroadcast', label: '방송실' },
    { gap: 'gapDoor', label: '수요현관' },
    { gap: 'gapPraise', label: '토요찬양' }
  ];
  for (var w = 0; w < grid.weeks.length; w++) {
    for (var c = 0; c < CE_OUT.COLS; c++) {
      var cell = grid.weeks[w][c];
      var a = sched.byIso[cell.iso];
      if (!a || cell.iso < grid.startIso) continue;
      if (a.warning) out.push(cell.iso + ' : ' + a.warning);
      if (a.specialWarning) out.push(cell.iso + ' : ' + a.specialWarning);
      for (var i = 0; i < labels.length; i++) {
        if (a[labels[i].gap]) {
          out.push(cell.iso + ' : ' + labels[i].label + ' 를 채우지 못했습니다 (전원 예외)');
        }
      }
    }
  }
  return out;
}

/** 휴일 칸: 비운 채로 표시만 해 둡니다. 그대로 손으로 적으시면 됩니다. */
function ceMarkHoliday(sh, row, col) {
  sh.getRange(row, col).setBackground(CE_COLOR.HOLIDAY_BG).setNote('휴일 — 직접 입력하세요');
}

/** 명단은 있는데 그날 전원이 예외라 못 채운 칸. */
function ceMarkGap(sh, row, col) {
  sh.getRange(row, col).setBackground(CE_COLOR.WARN_BG).setNote('배정할 사람이 없습니다 (전원 예외)');
}

/** '설교 4명 / 방송 3명 / ...' 처럼 채워진 명단만 적습니다. */
function ceRotationSummary(rot) {
  var parts = [];
  for (var i = 0; i < CE_ROTATION_COLUMNS.length; i++) {
    var def = CE_ROTATION_COLUMNS[i];
    var list = rot[def.key] || [];
    if (list.length) parts.push(def.header + ' ' + list.length + '명');
  }
  return parts.length ? parts.join(' / ') : '명단 없음';
}

function ceWriteMonthSheet(year, month, grid, sched, cfg, rot) {
  var sh = ceSheet(ceMonthSheetName(year, month), true);
  sh.clear();
  sh.clearNotes();
  // 지난번에 그린 병합을 먼저 풉니다. 주 수가 5주/6주로 달라지면
  // 예전 병합이 엉뚱한 자리에 남습니다.
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();

  var totalCols = CE_OUT.FIRST_COL + CE_OUT.COLS - 1;   // G열

  // 제목
  sh.getRange(CE_OUT.TITLE_ROW, 1, 1, totalCols).merge()
    .setValue(year + '년 ' + month + '월 새벽 설교자 및 백업')
    .setBackground(CE_COLOR.TITLE_BG).setFontColor('#ffffff')
    .setFontSize(12).setFontWeight('bold').setHorizontalAlignment('center');

  // 요일 머리줄
  sh.getRange(CE_OUT.DOW_ROW, CE_OUT.FIRST_COL, 1, CE_OUT.COLS)
    .setValues([['월', '화', '수', '목', '금', '토']])
    .setBackground(CE_COLOR.HEAD_BG).setFontColor('#ffffff')
    .setFontWeight('bold').setHorizontalAlignment('center');

  for (var w = 0; w < grid.weeks.length; w++) {
    var base = CE_OUT.FIRST_BLOCK_ROW + w * 4;
    var week = grid.weeks[w];

    var dates = [];
    var preachers = [];
    var broadcasts = [];
    var specials = [];

    for (var c = 0; c < CE_OUT.COLS; c++) {
      var cell = week[c];
      var a = sched.byIso[cell.iso] || {
        preacher: '', broadcast: '', door: '', praise: '',
        offSermon: false, offBroadcast: false, offDoor: false, offPraise: false,
        gapSermon: false, gapBroadcast: false, gapDoor: false, gapPraise: false,
        swapNote: '', warning: '', specialSwapNote: '', specialWarning: ''
      };
      dates.push(cell.day);
      preachers.push(a.preacher || '');
      broadcasts.push(a.broadcast || '');
      specials.push(ceSpecialSlot(cell.dow, a, cfg).name);
    }

    sh.getRange(base, 1, 4, 1).setValues([[CE_ROW_LABELS[0]], [CE_ROW_LABELS[1]], [CE_ROW_LABELS[2]], [CE_ROW_LABELS[3]]])
      .setFontWeight('bold').setFontSize(9).setWrap(true);

    sh.getRange(base, CE_OUT.FIRST_COL, 1, CE_OUT.COLS).setValues([dates]);
    sh.getRange(base + 1, CE_OUT.FIRST_COL, 1, CE_OUT.COLS).setValues([preachers]);
    sh.getRange(base + 2, CE_OUT.FIRST_COL, 1, CE_OUT.COLS).setValues([broadcasts]);
    sh.getRange(base + 3, CE_OUT.FIRST_COL, 1, CE_OUT.COLS).setValues([specials]);

    sh.getRange(base, 1, 1, totalCols)
      .setBackground(CE_COLOR.HEAD_BG).setFontColor('#ffffff').setFontWeight('bold');
    sh.getRange(base + 1, 1, 1, totalCols).setBackground(CE_COLOR.BAND_BG);
    sh.getRange(base, CE_OUT.FIRST_COL, 4, CE_OUT.COLS).setHorizontalAlignment('center');

    // 이번 달이 아닌 칸은 흐리게 (앞뒤 달 시트와 이름은 서로 같습니다)
    for (var k = 0; k < CE_OUT.COLS; k++) {
      var cellInfo = week[k];
      var col = CE_OUT.FIRST_COL + k;
      if (!cellInfo.inMonth) {
        sh.getRange(base, col, 4, 1).setFontColor(CE_COLOR.OUT_OF_MONTH);
      }
      var info = sched.byIso[cellInfo.iso];
      if (!info) continue;

      var special = ceSpecialSlot(cellInfo.dow, info, cfg);

      // 휴일로 잡은 칸은 비운 채로 노랗게 두어 손으로 적으실 수 있게 합니다.
      if (info.offSermon) ceMarkHoliday(sh, base + 1, col);
      if (info.offBroadcast) ceMarkHoliday(sh, base + 2, col);
      if (special.off) ceMarkHoliday(sh, base + 3, col);
      if (info.offSermon && info.offBroadcast) {
        sh.getRange(base, col).setNote('휴일');
      }

      if (info.swapNote) {
        sh.getRange(base + 2, col).setNote('설교자와 겹쳐서 ' + info.swapNote);
      }
      if (info.warning) {
        sh.getRange(base + 2, col).setBackground(CE_COLOR.WARN_BG).setNote(info.warning);
      }
      if (special.swapNote) {
        sh.getRange(base + 3, col).setNote('설교자·방송실과 겹쳐서 ' + special.swapNote);
      }
      if (special.warning) {
        sh.getRange(base + 3, col).setBackground(CE_COLOR.WARN_BG).setNote(special.warning);
      }
      if (info.gapSermon) ceMarkGap(sh, base + 1, col);
      if (info.gapBroadcast) ceMarkGap(sh, base + 2, col);
      if (special.gap) ceMarkGap(sh, base + 3, col);
    }
  }

  var lastRow = CE_OUT.FIRST_BLOCK_ROW + grid.weeks.length * 4 - 1;
  sh.getRange(CE_OUT.DOW_ROW, 1, lastRow - CE_OUT.DOW_ROW + 1, totalCols)
    .setBorder(true, true, true, true, true, true, CE_COLOR.BORDER, SpreadsheetApp.BorderStyle.SOLID);

  var footRow = lastRow + 2;
  sh.getRange(footRow, 1, 1, totalCols).merge()
    .setValue('자동 생성 · 기준일 ' + cfg.anchor + ' · ' + ceRotationSummary(rot) +
      ' · ' + Utilities.formatDate(new Date(), ceTz(), 'yyyy-MM-dd HH:mm'))
    .setFontSize(9).setFontColor('#666666');

  sh.setColumnWidth(1, 90);
  for (var col2 = CE_OUT.FIRST_COL; col2 <= totalCols; col2++) sh.setColumnWidth(col2, 100);
  // 열 고정은 쓰지 않습니다. 제목 줄과 맨 아래 설명 줄이 A~G로 병합되어 있어서
  // 1열만 고정하면 병합된 칸이 갈라져 구글 시트가 막습니다. 표가 7열뿐이라
  // 가로로 밀 일도 없으므로, 대신 위쪽 두 줄을 고정합니다.
  sh.setFrozenRows(CE_OUT.DOW_ROW);
  return sh;
}

/* ===== Setup.gs ===== */

/**
 * 처음 한 번 실행해서 필요한 탭을 만들어 두는 코드.
 * 이미 있는 탭은 건드리지 않습니다.
 */

/** 설정 탭에 있어야 할 항목들. 없으면 채워 넣습니다. */
var CE_SETTING_ROWS = [
  ['로테이션 시작일', null,
    '이 날짜에 각 명단의 첫 번째 사람이 섭니다. 한 번 정하면 웬만하면 바꾸지 마세요.'],
  ['새벽예배 요일', '월,화,수,목,금,토',
    '설교자와 방송실을 배정할 요일'],
  ['토요 별도 요일', '토',
    '이 요일은 [토요설교]·[토요방송] 명단으로 따로 돌립니다. 두 명단을 비워 두면 평일 명단으로 그냥 이어서 돕니다.'],
  ['수요현관 요일', '수',
    '수요현관 담당을 배정할 요일. 넷째 줄에 들어갑니다.'],
  ['토요찬양 요일', '토',
    '토요찬양 담당을 배정할 요일. 같은 넷째 줄에 들어갑니다.']
];

function ceSetupAll() {
  var created = [];
  var updated = [];

  if (ceSetupSettings()) created.push(CE_TAB.SETTINGS);
  else if (ceUpgradeSettings().length) updated.push(CE_TAB.SETTINGS);

  if (ceSetupRotation()) created.push(CE_TAB.ROTATION);
  else {
    var added = ceUpgradeRotation();
    if (added.length) updated.push(CE_TAB.ROTATION + ' (' + added.join(', ') + ' 추가)');
  }

  if (!ceSheet(CE_TAB.CALENDAR, false)) {
    var today = new Date();
    ceRenderCalendar(today.getFullYear(), today.getMonth() + 1);
    created.push(CE_TAB.CALENDAR);
  }
  return { created: created, updated: updated };
}

/** 이미 있는 설정 탭에 빠진 항목만 아래에 덧붙입니다. */
function ceUpgradeSettings() {
  var sh = ceSheet(CE_TAB.SETTINGS, false);
  if (!sh) return [];

  var lastRow = Math.max(sh.getLastRow(), 1);
  var existing = {};
  var values = sh.getRange(1, 1, lastRow, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    var key = String(values[i][0]).trim();
    if (key) existing[key] = true;
  }
  // '수요저녁 요일' 은 예전 이름이라 그대로 두고 새 이름을 또 만들지 않습니다.
  if (existing['수요저녁 요일']) existing['수요현관 요일'] = true;

  var added = [];
  for (var r = 0; r < CE_SETTING_ROWS.length; r++) {
    var row = CE_SETTING_ROWS[r];
    if (existing[row[0]]) continue;
    lastRow++;
    sh.getRange(lastRow, 1, 1, 3)
      .setValues([[row[0], row[1] == null ? ceDefaultAnchor() : row[1], row[2]]]);
    sh.getRange(lastRow, 1).setFontWeight('bold');
    sh.getRange(lastRow, 2).setBackground('#fff2cc').setNumberFormat('@');
    sh.getRange(lastRow, 3).setWrap(true);
    added.push(row[0]);
  }
  return added;
}

/**
 * 이미 있는 로테이션 탭에 빠진 명단 열을 채워 넣습니다.
 * 안내 문구 뒤 멀찍이 붙으면 못 보고 지나치기 쉬우므로,
 * 기존 명단 열 바로 다음 자리에 끼워 넣습니다.
 */
function ceUpgradeRotation() {
  var sh = ceSheet(CE_TAB.ROTATION, false);
  if (!sh) return [];

  var found = ceRotationColumnMap(sh);
  var lastNameCol = 0;
  for (var key in found) {
    if (Object.prototype.hasOwnProperty.call(found, key)) {
      lastNameCol = Math.max(lastNameCol, found[key]);
    }
  }

  var added = [];
  var col = lastNameCol + 1;
  for (var i = 0; i < CE_ROTATION_COLUMNS.length; i++) {
    var def = CE_ROTATION_COLUMNS[i];
    if (found[def.key]) continue;

    // 그 자리에 뭔가 적혀 있으면(안내 문구 등) 열을 새로 끼워 넣어 밀어냅니다.
    if (ceColumnHasContent(sh, col)) sh.insertColumnBefore(col);

    sh.getRange(1, col).setValue(def.header)
      .setBackground(CE_COLOR.HEAD_BG).setFontColor('#ffffff')
      .setFontWeight('bold').setHorizontalAlignment('center');
    sh.setColumnWidth(col, 130);
    added.push(def.header);
    col++;
  }
  return added;
}

function ceColumnHasContent(sh, col) {
  var lastRow = sh.getLastRow();
  if (lastRow < 1 || col > sh.getMaxColumns()) return false;
  var values = sh.getRange(1, col, lastRow, 1).getValues();
  for (var r = 0; r < values.length; r++) {
    if (String(values[r][0] == null ? '' : values[r][0]).trim() !== '') return true;
  }
  return false;
}

/** 이번 주(또는 다음 달 1일이 속한 주)의 월요일 - 기준일 기본값으로 씁니다. */
function ceDefaultAnchor() {
  var now = new Date();
  var d = ceMakeDate(now.getFullYear(), now.getMonth() + 1, 1);
  while (d.getUTCDay() !== 1) d = ceAddDays(d, -1);
  return ceIso(d);
}

function ceSetupSettings() {
  if (ceSheet(CE_TAB.SETTINGS, false)) return false;
  var sh = ceSheet(CE_TAB.SETTINGS, true);

  var rows = [['항목', '값', '설명']];
  for (var i = 0; i < CE_SETTING_ROWS.length; i++) {
    var r = CE_SETTING_ROWS[i];
    rows.push([r[0], r[1] == null ? ceDefaultAnchor() : r[1], r[2]]);
  }

  sh.getRange(1, 1, rows.length, 3).setValues(rows);
  sh.getRange(1, 1, 1, 3).setBackground(CE_COLOR.HEAD_BG).setFontColor('#ffffff').setFontWeight('bold');
  sh.getRange(2, 2, rows.length - 1, 1).setNumberFormat('@').setBackground('#fff2cc');
  sh.getRange(2, 1, rows.length - 1, 1).setFontWeight('bold');
  sh.setColumnWidth(1, 140);
  sh.setColumnWidth(2, 170);
  sh.setColumnWidth(3, 520);
  sh.getRange(1, 3, rows.length, 1).setWrap(true);
  return true;
}

function ceSetupRotation() {
  if (ceSheet(CE_TAB.ROTATION, false)) return false;
  var sh = ceSheet(CE_TAB.ROTATION, true);

  var headers = CE_ROTATION_COLUMNS.map(function (d) { return d.header; });
  var n = headers.length;
  sh.getRange(1, 1, 1, n).setValues([headers])
    .setBackground(CE_COLOR.HEAD_BG).setFontColor('#ffffff').setFontWeight('bold')
    .setHorizontalAlignment('center');

  sh.getRange(1, 1).setNote('평일 새벽 설교자 명단');
  sh.getRange(1, 2).setNote('평일 새벽 방송실 명단');
  sh.getRange(1, 3).setNote('토요일 설교자 명단. 비워 두면 [설교] 명단으로 그냥 이어서 돕니다.');
  sh.getRange(1, 4).setNote('토요일 방송실 명단. 비워 두면 [방송] 명단으로 그냥 이어서 돕니다.');
  sh.getRange(1, 5).setNote('수요일 현관 담당 명단');
  sh.getRange(1, 6).setNote('토요일 찬양 담당 명단');

  // 안내 문구는 명단 열 바깥에 둡니다. 명단 열에 있으면 사람 이름으로 읽혀 버립니다.
  var guide = n + 2;
  sh.getRange(1, guide).setValue('2행부터 한 줄에 한 명씩, 설 순서대로 적으세요.')
    .setFontColor('#666666').setFontWeight('bold');
  sh.getRange(2, guide).setValue('위에서 아래로 돌아갑니다. 중간에 이름을 끼워 넣거나 빼면 그 뒤 순서가 밀립니다.')
    .setFontColor('#666666');
  sh.getRange(3, guide).setValue('명단마다 인원 수는 서로 달라도 됩니다. 빈 칸은 알아서 건너뜁니다.')
    .setFontColor('#666666');
  sh.getRange(4, guide).setValue('머리글 이름으로 찾으므로 열 순서는 바꾸셔도 됩니다.')
    .setFontColor('#666666');

  for (var c = 1; c <= n; c++) sh.setColumnWidth(c, 130);
  sh.setColumnWidth(guide, 420);
  sh.setFrozenRows(1);
  return true;
}

/* ===== Menu.gs ===== */

/**
 * 시트 상단 메뉴.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('새벽예배 배정')
    .addItem('① 초기 설정 만들기', 'ceMenuSetup')
    .addSeparator()
    .addItem('② 달력 다시 그리기 (달 바꾸기)', 'ceMenuRenderCalendar')
    .addItem('③ 이번 달 배정하기', 'ceMenuGenerateThisMonth')
    .addItem('④ 다른 달 배정하기…', 'ceMenuGeneratePickMonth')
    .addSeparator()
    .addItem('명단·예외 점검', 'ceMenuCheck')
    .addToUi();
}

function ceMenuSetup() {
  var ui = SpreadsheetApp.getUi();
  try {
    var res = ceSetupAll();
    var msg = [];
    if (res.created.length) msg.push('만든 탭: ' + res.created.join(', '));
    if (res.updated.length) msg.push('보완한 탭: ' + res.updated.join(', '));
    if (!msg.length) msg.push('필요한 탭이 이미 모두 있습니다.');
    msg.push('');
    msg.push('[로테이션] 탭에 이름을 넣고, [설정] 탭의 로테이션 시작일을 확인한 뒤');
    msg.push('[③ 이번 달 배정하기] 를 눌러 주세요.');
    ui.alert(msg.join('\n'));
  } catch (e) {
    ui.alert('오류: ' + e.message);
  }
}

function ceMenuRenderCalendar() {
  var ui = SpreadsheetApp.getUi();
  try {
    var sh = ceSheet(CE_TAB.CALENDAR, false);
    var current = sh ? ceParseYearMonth(sh.getRange(CE_CAL.YM_ROW, CE_CAL.YM_COL).getValue()) : null;
    if (!current) {
      var now = new Date();
      current = { year: now.getFullYear(), month: now.getMonth() + 1 };
    }
    var res = ui.prompt('달력 다시 그리기',
      '어느 달을 보시겠습니까?  (예: ' + ceFormatYearMonth(current.year, current.month) + ')',
      ui.ButtonSet.OK_CANCEL);
    if (res.getSelectedButton() !== ui.Button.OK) return;
    var ym = ceParseYearMonth(res.getResponseText());
    if (!ym) { ui.alert('YYYY-MM 형식으로 적어 주세요. 예) 2026-09'); return; }

    var out = ceRenderCalendar(ym.year, ym.month);
    ceSS().setActiveSheet(out);
  } catch (e) {
    ui.alert('오류: ' + e.message);
  }
}

function ceMenuGenerateThisMonth() {
  var now = new Date();
  ceRunGenerate(now.getFullYear(), now.getMonth() + 1);
}

function ceMenuGeneratePickMonth() {
  var ui = SpreadsheetApp.getUi();
  var now = new Date();
  var res = ui.prompt('다른 달 배정하기',
    '어느 달을 배정할까요?  (예: ' + ceFormatYearMonth(now.getFullYear(), now.getMonth() + 1) + ')',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  var ym = ceParseYearMonth(res.getResponseText());
  if (!ym) { ui.alert('YYYY-MM 형식으로 적어 주세요. 예) 2026-09'); return; }
  ceRunGenerate(ym.year, ym.month);
}

function ceRunGenerate(year, month) {
  var ui = SpreadsheetApp.getUi();
  try {
    var out = ceGenerateMonth(year, month);
    var sh = ceSheet(out.sheetName, false);
    if (sh) ceSS().setActiveSheet(sh);

    var msg = ['[' + out.sheetName + '] 배정을 마쳤습니다.'];
    if (out.notes.length) {
      msg.push('');
      msg.push(out.notes.join('\n'));
    }
    if (out.warnings.length) {
      msg.push('');
      msg.push('확인이 필요한 날:');
      msg.push(out.warnings.join('\n'));
    }
    ui.alert(msg.join('\n'));
  } catch (e) {
    ui.alert('오류: ' + e.message);
  }
}

function ceMenuCheck() {
  var ui = SpreadsheetApp.getUi();
  try {
    ceSaveCalendar();
    var cfg = ceReadConfig();
    var rot = ceReadRotations();
    var ex = ceReadAllExceptions();

    var lines = [];
    function dows(list) {
      return list.map(function (d) { return CE_DOW_NAMES[d]; }).join(',');
    }
    lines.push('로테이션 시작일 : ' + cfg.anchor);
    lines.push('새벽예배 요일 : ' + dows(cfg.dawnDows));
    lines.push('토요 별도 요일 : ' + dows(cfg.satDows));
    lines.push('수요현관 요일 : ' + dows(cfg.doorDows));
    lines.push('토요찬양 요일 : ' + dows(cfg.praiseDows));
    lines.push('');
    var cols = rot._columns || {};
    for (var ci = 0; ci < CE_ROTATION_COLUMNS.length; ci++) {
      var def = CE_ROTATION_COLUMNS[ci];
      var list = rot[def.key] || [];
      var where = cols[def.key] ? ceColumnLetter(cols[def.key]) + '열' : '열을 못 찾음';
      lines.push(def.header + ' [' + where + '] ' + list.length + '명 : ' + (list.join(', ') || '(비어 있음)'));
    }

    var missing = [];
    for (var mi = 0; mi < CE_ROTATION_COLUMNS.length; mi++) {
      if (!cols[CE_ROTATION_COLUMNS[mi].key]) missing.push(CE_ROTATION_COLUMNS[mi].header);
    }
    if (missing.length) {
      lines.push('');
      lines.push('※ 열을 못 찾은 명단: ' + missing.join(', '));
      lines.push('   [① 초기 설정 만들기] 를 한 번 더 누르면 열을 만들어 드립니다.');
    }
    if (!rot.satSermon.length || !rot.satBroadcast.length) {
      lines.push('');
      lines.push('※ 토요 명단이 비어 있는 쪽은 평일 명단으로 그냥 이어서 돕니다.');
    }

    lines.push('');
    lines.push('[' + CE_TAB.ROTATION + '] 탭 1행에 적힌 그대로: ' + ceRotationHeaderRow());
    lines.push('');
    var holidayCount = 0;
    ex.forEach(function (e) { if (ceIsHolidayName(e.name)) holidayCount++; });
    lines.push('등록된 예외 ' + (ex.length - holidayCount) + '건, 휴일 ' + holidayCount + '건');

    var leftover = ceSS().getSheetByName('장기예외');
    if (leftover) {
      lines.push('');
      lines.push('※ [장기예외] 탭은 이제 쓰지 않습니다. 거기 적으신 내용은 배정에 반영되지 않으니');
      lines.push('   [달력] 탭으로 옮기신 뒤 탭을 지워 주세요.');
    }

    var unknown = ceUnknownNames(rot, ex);
    if (unknown.length) {
      lines.push('');
      lines.push('※ 명단에 없는 이름이 예외에 들어 있습니다: ' + unknown.join(', '));
    }
    ui.alert('점검 결과', lines.join('\n'), ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('오류: ' + e.message);
  }
}

/** 로테이션 탭 1행을 있는 그대로 보여 줍니다. 머리글 오타를 찾을 때 씁니다. */
function ceRotationHeaderRow() {
  var sh = ceSheet(CE_TAB.ROTATION, false);
  if (!sh) return '(탭 없음)';
  var lastCol = Math.max(sh.getLastColumn(), 1);
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var parts = [];
  for (var c = 0; c < headers.length; c++) {
    var text = String(headers[c] == null ? '' : headers[c]).trim();
    if (text.length > 12) text = text.slice(0, 12) + '…';
    parts.push(ceColumnLetter(c + 1) + '=' + (text || '(빈칸)'));
  }
  return parts.join('  ');
}

function ceUnknownNames(rot, exceptions) {
  var known = {};
  CE_ROTATION_COLUMNS.forEach(function (def) {
    (rot[def.key] || []).forEach(function (n) { known[n] = true; });
  });
  var seen = {};
  var out = [];
  exceptions.forEach(function (e) {
    if (ceIsHolidayName(e.name)) return;          // '휴일' 은 사람 이름이 아닙니다
    if (!known[e.name] && !seen[e.name]) { seen[e.name] = true; out.push(e.name); }
  });
  return out;
}

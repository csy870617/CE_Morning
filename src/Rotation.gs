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
  DOOR: 'DOOR'
};

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
  '수요저녁 현관': CE_ROLE.DOOR
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
    if (!done) a.warning = '설교자와 방송실이 겹치는데 바꿀 상대를 찾지 못했습니다';
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

  var dawnDows = cfg.dawnDows && cfg.dawnDows.length ? cfg.dawnDows : [1, 2, 3, 4, 5, 6];
  var doorDows = cfg.doorDows && cfg.doorDows.length ? cfg.doorDows : [3];

  var dawnDays = [];
  var doorDays = [];
  var sermonPtr = 0;
  var broadcastPtr = 0;
  var doorPtr = 0;

  for (var d = anchor; ceIso(d) <= endIso; d = ceAddDays(d, 1)) {
    var iso = ceIso(d);
    var dow = d.getUTCDay();

    if (dawnDows.indexOf(dow) >= 0) {
      var s = cePickNext(rotations.sermon, sermonPtr, iso, CE_ROLE.SERMON, ex);
      sermonPtr = s.ptr;
      var b = cePickNext(rotations.broadcast, broadcastPtr, iso, CE_ROLE.BROADCAST, ex);
      broadcastPtr = b.ptr;
      dawnDays.push({ iso: iso, dow: dow, preacher: s.name, broadcast: b.name });
    }

    if (doorDows.indexOf(dow) >= 0) {
      var w = cePickNext(rotations.door, doorPtr, iso, CE_ROLE.DOOR, ex);
      doorPtr = w.ptr;
      doorDays.push({ iso: iso, dow: dow, door: w.name });
    }
  }

  ceResolveConflicts(dawnDays, ex);

  var byIso = {};
  var i;
  for (i = 0; i < dawnDays.length; i++) {
    var day = dawnDays[i];
    byIso[day.iso] = {
      iso: day.iso,
      preacher: day.preacher,
      broadcast: day.broadcast,
      door: '',
      swapNote: day.swapNote || '',
      warning: day.warning || ''
    };
  }
  for (i = 0; i < doorDays.length; i++) {
    var wd = doorDays[i];
    if (!byIso[wd.iso]) {
      byIso[wd.iso] = { iso: wd.iso, preacher: '', broadcast: '', door: '', swapNote: '', warning: '' };
    }
    byIso[wd.iso].door = wd.door;
  }

  return { byIso: byIso, dawnDays: dawnDays, doorDays: doorDays };
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
    ceIsAvailable: ceIsAvailable,
    cePickNext: cePickNext,
    ceResolveConflicts: ceResolveConflicts,
    ceBuildSchedule: ceBuildSchedule,
    ceMonthGrid: ceMonthGrid
  };
}

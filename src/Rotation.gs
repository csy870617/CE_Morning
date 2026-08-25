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
      a.swapNote = b.iso + ' 과 맞바꿈';
      b.swapNote = a.iso + ' 과 맞바꿈';
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
      a.swapNote = b.iso + ' 과 맞바꿈';
      b.swapNote = a.iso + ' 과 맞바꿈';
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

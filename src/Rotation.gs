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
  PRAISE: 'PRAISE',
  USHER: 'USHER'
};

/** 주마다 세우는 현관안내 인원 */
var CE_USHER_PER_WEEK = 3;

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
  '수요백업': CE_ROLE.DOOR,
  '수요현관': CE_ROLE.DOOR,
  '현관': CE_ROLE.DOOR,
  '수요저녁 현관': CE_ROLE.DOOR,
  '토요백업': CE_ROLE.PRAISE,
  '토요찬양': CE_ROLE.PRAISE,
  '찬양': CE_ROLE.PRAISE,
  '현관안내': CE_ROLE.USHER,
  '안내': CE_ROLE.USHER
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
 * 그 역할을 콕 집어 '휴일(현관안내)' 로 적은 경우만 봅니다.
 * 현관안내는 수요일과 토요일을 함께 맡는 주 단위 담당이라, 수요일 하루가
 * 휴일이라고 그 주 안내를 통째로 비우면 토요일이 빈손이 됩니다.
 */
function ceIsHolidayForRoleOnly(iso, role, exceptions) {
  for (var i = 0; i < exceptions.length; i++) {
    var ex = exceptions[i];
    if (!ceIsHolidayName(ex.name)) continue;
    if (ex.role !== role) continue;
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
function cePickNext(list, ptr, iso, role, exceptions, blocked) {
  if (!list || list.length === 0) return { name: '', ptr: ptr, skipped: [] };
  var skipped = [];
  for (var k = 0; k < list.length; k++) {
    var idx = (ptr + k) % list.length;
    var name = list[idx];
    var free = !blocked || blocked.indexOf(name) < 0;
    if (free && ceIsAvailable(name, iso, role, exceptions)) {
      return { name: name, ptr: (idx + 1) % list.length, skipped: skipped };
    }
    skipped.push(name);
  }
  // 전원 예외 - 빈칸으로 두고 포인터는 그대로 둡니다.
  return { name: '', ptr: ptr, skipped: skipped };
}

/**
 * 그 날짜가 든 주의 시작(월요일) 을 돌려줍니다.
 * 표가 월~토 한 묶음이라 '같은 주' 를 이 기준으로 봅니다.
 */
function ceWeekStart(iso) {
  var d = ceParseIso(iso);
  var dow = d.getUTCDay();
  return ceIso(ceAddDays(d, -(dow === 0 ? 6 : dow - 1)));
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
      // 평일끼리, 토요일끼리만 맞바꿉니다.
      // 금요일에 겹치면 토요일을 건너뛰고 다음 월요일과 바뀝니다.
      if ((b.swapGroup || '') !== (a.swapGroup || '')) continue;
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
    if (!done) {
      a.warning = a.swapGroup === 'sat'
        ? '설교자와 방송실이 겹치는데 맞바꿀 토요일을 찾지 못했습니다'
        : '설교자와 방송실이 겹치는데 맞바꿀 평일을 찾지 못했습니다';
    }
  }
  return days;
}

/**
 * 월요일 담당이 한 달에 두 번 걸리면 뒤따르는 평일과 순서를 바꿉니다.
 * 설교와 방송실에 각각 따로 적용합니다. 휴일은 다른 명단이라 셈에서 뺍니다.
 */
function ceEnforceMondayLimit(days, field, role, exceptions, label) {
  var seen = {};
  var what = label || (field === 'preacher' ? '설교' : '방송실');
  /* 메모는 표의 줄마다 따로 붙여야 하므로 역할별로도 담아 둡니다.
     mondayNote·mondayWarning 은 둘을 합친 것으로, 배정 끝 안내 문구에 씁니다. */
  var noteKey = field === 'preacher' ? 'mondayNoteSermon' : 'mondayNoteBroadcast';
  var warnKey = field === 'preacher' ? 'mondayWarnSermon' : 'mondayWarnBroadcast';

  function addNote(day, text) {
    day[noteKey] = text;
    day.mondayNote = (day.mondayNote ? day.mondayNote + ' / ' : '') + what + ' ' + text;
  }
  for (var i = 0; i < days.length; i++) {
    var a = days[i];
    if (a.dow !== 1 || !a[field] || a.swapGroup === 'holiday') continue;

    var month = a.iso.slice(0, 7);
    if (!seen[month]) seen[month] = {};
    if (!seen[month][a[field]]) {
      seen[month][a[field]] = true;
      continue;
    }

    // 그 달 월요일에 이미 선 사람입니다.
    // 먼저 뒤쪽(다음 날부터)에서 상대를 찾고, 뒤쪽 사람이 모두 이미 월요일에
    // 걸려 있으면 앞쪽(지난 주 금요일부터 거슬러)에서도 찾아 봅니다.
    var b = ceFindMondaySwap(days, i, 1, month, seen, field, role, exceptions) ||
            ceFindMondaySwap(days, i, -1, month, seen, field, role, exceptions);
    if (b) {
      var tmp = a[field];
      a[field] = b[field];
      b[field] = tmp;
      addNote(a, b.iso + ' 과 순서 바꿈 (월요일 중복)');
      addNote(b, a.iso + ' 과 순서 바꿈 (월요일 중복)');
    }

    seen[month][a[field]] = true;
    if (!b) {
      var text = what + ' 담당이 그 달 월요일에 두 번 걸립니다 (바꿀 상대를 찾지 못했습니다)';
      a[warnKey] = text;
      a.mondayWarning = (a.mondayWarning ? a.mondayWarning + ' / ' : '') + text;
    }
  }
  return days;
}

/**
 * 월요일 중복을 풀어 줄 상대를 한 방향으로 찾습니다.
 *   step  1 = 다음 날부터 뒤로,  -1 = 지난 날부터 앞으로
 * 같은 달 안에서만, 월요일이 아닌 날 중에서, 같은 요일 묶음(평일·토요)끼리만 찾습니다.
 * 그 달 월요일에 이미 선 사람은 데려와도 또 중복이 되므로 건너뜁니다.
 */
function ceFindMondaySwap(days, from, step, month, seen, field, role, exceptions) {
  var a = days[from];
  for (var j = from + step; j >= 0 && j < days.length; j += step) {
    var b = days[j];
    if (b.iso.slice(0, 7) !== month) break;       // 달을 넘기면서까지 찾지는 않습니다
    if (b.dow === 1) continue;                    // 월요일끼리 바꾸면 뜻이 없습니다
    if (b.swapGroup !== a.swapGroup) continue;    // 평일·토요 명단을 섞지 않습니다
    if (!b[field] || seen[month][b[field]]) continue;
    if (!ceMondaySwapOk(a, b, field, role, exceptions)) continue;
    return b;
  }
  return null;
}

function ceMondaySwapOk(a, b, field, role, exceptions) {
  var other = field === 'preacher' ? 'broadcast' : 'preacher';
  if (b[field] === a[other]) return false;          // 바꾸면 그 날 설교·방송이 겹칩니다
  if (a[field] === b[other]) return false;
  if (!ceIsAvailable(b[field], a.iso, role, exceptions)) return false;
  if (!ceIsAvailable(a[field], b.iso, role, exceptions)) return false;
  return true;
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
  var usherWeeks = [];

  // 명단마다 자기 순번을 따로 갖습니다.
  var ptr = {
    sermon: 0, broadcast: 0, satSermon: 0, satBroadcast: 0, door: 0, praise: 0,
    holidaySermon: 0, holidayBroadcast: 0, usher: 0
  };

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

  /**
   * 현관안내는 한 주에 여러 명을 세웁니다.
   * busy 에 든 사람(그 주 수요백업·토요백업)과 이미 뽑은 사람은 건너뜁니다.
   * 건너뛴 사람의 차례는 소모되지 않아 다음 주에 그대로 돌아옵니다.
   */
  function takeUshers(iso, count, busy) {
    var out = [];
    var blocked = (busy || []).slice();
    for (var t = 0; t < count; t++) {
      var picked = cePickNext(rot.usher, ptr.usher, iso, CE_ROLE.USHER, ex, blocked);
      if (!picked.name) break;
      ptr.usher = picked.ptr;
      out.push(picked.name);
      blocked.push(picked.name);
    }
    return out;
  }

  for (var d = anchor; ceIso(d) <= endIso; d = ceAddDays(d, 1)) {
    var iso = ceIso(d);
    var dow = d.getUTCDay();

    if (dawnDows.indexOf(dow) >= 0) {
      var sermonKey = groupFor(dow, 'sermon', 'satSermon');
      var broadcastKey = groupFor(dow, 'broadcast', 'satBroadcast');

      var offSermon = ceIsHoliday(iso, CE_ROLE.SERMON, ex);
      var offBroadcast = ceIsHoliday(iso, CE_ROLE.BROADCAST, ex);

      // 휴일로 잡은 날은 휴일 명단으로 돕니다. 그 명단이 비어 있으면 빈칸으로 둡니다.
      if (offSermon) sermonKey = 'holidaySermon';
      if (offBroadcast) broadcastKey = 'holidayBroadcast';

      var preacher = (offSermon && !has('holidaySermon')) ? '' : take(sermonKey, iso, CE_ROLE.SERMON);
      var broadcast = (offBroadcast && !has('holidayBroadcast')) ? '' : take(broadcastKey, iso, CE_ROLE.BROADCAST);

      dawnDays.push({
        iso: iso,
        dow: dow,
        preacher: preacher,
        broadcast: broadcast,
        offSermon: offSermon,
        offBroadcast: offBroadcast,
        // 명단 자체가 비어 있으면 빈칸이 당연하므로 알리지 않습니다.
        // 명단은 있는데 전원 예외라 못 채운 경우만 표시합니다.
        gapSermon: !preacher && has(sermonKey),
        gapBroadcast: !broadcast && has(broadcastKey),
        smGroup: sermonKey,
        bcGroup: broadcastKey,
        // 맞바꾸기는 휴일·토요일·평일을 갈라서 봅니다. 서로 다른 명단이기 때문입니다.
        // 토요 명단을 비워 둬 평일 명단으로 돌더라도 토요일은 토요일끼리만 바꿉니다.
        swapGroup: (offSermon || offBroadcast) ? 'holiday'
          : (satDows.indexOf(dow) >= 0 ? 'sat' : 'week')
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

    if (doorDows.indexOf(dow) >= 0) {
      // 현관안내는 그 주의 수요일을 기준으로 한 번, 세 명씩 세웁니다.
      // 그 주 수요백업·토요백업과 겹치면 안 되므로, 자리만 잡아 두고
      // 그 주 배정이 다 끝난 뒤에 아래에서 한꺼번에 뽑습니다.
      usherWeeks.push({
        iso: iso, dow: dow, ushers: [],
        offUsher: ceIsHolidayForRoleOnly(iso, CE_ROLE.USHER, ex),
        gapUsher: false
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

  /* 현관안내는 수요일과 토요일 현관을 함께 맡으므로, 그 주 수요백업·토요백업으로
     이미 선 사람은 세울 수 없습니다. 토요일이 수요일보다 뒤에 오기 때문에
     그 주 배정이 다 끝난 지금 뽑습니다. 현관안내 순번은 주 단위로만 돌아가므로
     나중에 뽑아도 결과는 늘 같습니다. */
  var busyInWeek = {};
  function markBusy(iso2, name) {
    if (!name) return;
    var wk = ceWeekStart(iso2);
    if (!busyInWeek[wk]) busyInWeek[wk] = [];
    if (busyInWeek[wk].indexOf(name) < 0) busyInWeek[wk].push(name);
  }
  var bi;
  for (bi = 0; bi < doorDays.length; bi++) markBusy(doorDays[bi].iso, doorDays[bi].door);
  for (bi = 0; bi < praiseDays.length; bi++) markBusy(praiseDays[bi].iso, praiseDays[bi].praise);

  for (bi = 0; bi < usherWeeks.length; bi++) {
    var uw = usherWeeks[bi];
    uw.busy = busyInWeek[ceWeekStart(uw.iso)] || [];
    uw.ushers = uw.offUsher ? [] : takeUshers(uw.iso, CE_USHER_PER_WEEK, uw.busy);
    uw.gapUsher = !uw.offUsher && has('usher') && uw.ushers.length < CE_USHER_PER_WEEK;
  }

  ceResolveConflicts(dawnDays, ex);
  // 수요백업·토요백업은 그날 설교자·방송실과 겹쳐도 그대로 둡니다. 명단 순서가 우선입니다.

  // 겹침을 푼 뒤에 월요일 중복을 정리합니다. 순서를 바꿀 때 겹침이 다시 생기지 않는지 봅니다.
  ceEnforceMondayLimit(dawnDays, 'preacher', CE_ROLE.SERMON, ex, '설교');
  ceEnforceMondayLimit(dawnDays, 'broadcast', CE_ROLE.BROADCAST, ex, '방송실');

  var byIso = {};
  function slot(iso) {
    if (!byIso[iso]) {
      byIso[iso] = {
        iso: iso, preacher: '', broadcast: '', door: '', praise: '', ushers: [],
        offSermon: false, offBroadcast: false, offDoor: false, offPraise: false, offUsher: false,
        gapSermon: false, gapBroadcast: false, gapDoor: false, gapPraise: false, gapUsher: false,
        swapNote: '', warning: '',
        mondayNote: '', mondayWarning: '',
        mondayNoteSermon: '', mondayNoteBroadcast: '',
        mondayWarnSermon: '', mondayWarnBroadcast: ''
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
    cell.mondayNote = day.mondayNote || '';
    cell.mondayWarning = day.mondayWarning || '';
    cell.mondayNoteSermon = day.mondayNoteSermon || '';
    cell.mondayNoteBroadcast = day.mondayNoteBroadcast || '';
    cell.mondayWarnSermon = day.mondayWarnSermon || '';
    cell.mondayWarnBroadcast = day.mondayWarnBroadcast || '';
  }
  for (i = 0; i < doorDays.length; i++) {
    var wd = doorDays[i];
    var dc = slot(wd.iso);
    dc.door = wd.door;
    dc.offDoor = !!wd.offDoor;
    dc.gapDoor = !!wd.gapDoor;
  }
  for (i = 0; i < praiseDays.length; i++) {
    var pd = praiseDays[i];
    var pc = slot(pd.iso);
    pc.praise = pd.praise;
    pc.offPraise = !!pd.offPraise;
    pc.gapPraise = !!pd.gapPraise;
  }
  for (i = 0; i < usherWeeks.length; i++) {
    var uw = usherWeeks[i];
    var uc = slot(uw.iso);
    uc.ushers = uw.ushers;
    uc.offUsher = !!uw.offUsher;
    uc.gapUsher = !!uw.gapUsher;
  }

  return {
    byIso: byIso, dawnDays: dawnDays, doorDays: doorDays,
    praiseDays: praiseDays, usherWeeks: usherWeeks
  };
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
    ceIsHolidayForRoleOnly: ceIsHolidayForRoleOnly,
    ceIsAvailable: ceIsAvailable,
    cePickNext: cePickNext,
    ceResolveConflicts: ceResolveConflicts,
    ceWeekStart: ceWeekStart,
    ceEnforceMondayLimit: ceEnforceMondayLimit,
    ceFindMondaySwap: ceFindMondaySwap,
    CE_USHER_PER_WEEK: CE_USHER_PER_WEEK,
    ceBuildSchedule: ceBuildSchedule,
    ceMonthGrid: ceMonthGrid
  };
}

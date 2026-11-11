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

/* 맞바꿀 상대를 찾는 범위. 계산 구간 끝에 닿지 않도록 날짜로 못박아 둡니다.
   이 범위 안에서만 찾으므로 어느 달에서 계산해도 결과가 같습니다. */
var CE_SWAP_MAX_DAYS = 14;

/** 두 날짜 사이 날수 */
function ceDayGap(isoA, isoB) {
  return Math.round((ceParseIso(isoB).getTime() - ceParseIso(isoA).getTime()) / 86400000);
}

/**
 * 같은 날 설교자와 방송실이 같은 사람이면 방송실을 다음날과 맞바꿉니다.
 * 맞바꾼 결과가 또 겹치거나 휴가와 부딪히면 그 다음날로 밀어서 찾습니다.
 * 2주 안에서 찾고, 못 찾으면 그대로 두고 경고를 남깁니다.
 */
function ceResolveConflicts(days, exceptions) {
  for (var i = 0; i < days.length; i++) {
    var a = days[i];
    if (!a.preacher || !a.broadcast) continue;
    if (a.preacher !== a.broadcast) continue;

    var done = false;
    for (var j = i + 1; j < days.length; j++) {
      var b = days[j];
      if (ceDayGap(a.iso, b.iso) > CE_SWAP_MAX_DAYS) break;      // 2주 넘게 찾지 않습니다
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


/* ------------------------------------------------------------------ */
/* 전체 배정                                                           */
/* 한 사람이 그 달 같은 요일 설교에 설 수 있는 횟수 */
var CE_SAME_DOW_MAX = 2;

/**
 * 같은 사람이 그 달 같은 요일 설교에 세 번 이상 걸리면,
 * 세 번째부터 다른 요일의 설교자와 순서를 바꿉니다.
 *
 * 평일(월~금)끼리만 봅니다. 토요일은 설교 명단이 따로 돌고 그 묶음 안에는
 * 토요일밖에 없어서, 순서를 어떻게 바꿔도 요일이 달라지지 않습니다.
 * 휴일 명단으로 채운 날도 건드리지 않습니다.
 */
function ceEnforceSameDowLimit(days, exceptions) {
  /* tally: 지금 배정 기준으로 '달-요일-사람' 이 몇 번인지. 맞바꿀 때마다 고칩니다.
     used:  앞에서부터 세며 이미 남겨 둔 횟수. 세 번째 자리를 가려냅니다. */
  var tally = {};
  var used = {};
  function at(box, iso, dow, name) {
    var m = iso.slice(0, 7);
    return (box[m] && box[m][dow] && box[m][dow][name]) || 0;
  }
  function bump(box, iso, dow, name, by) {
    var m = iso.slice(0, 7);
    if (!box[m]) box[m] = {};
    if (!box[m][dow]) box[m][dow] = {};
    box[m][dow][name] = (box[m][dow][name] || 0) + by;
  }
  function counts(d) {
    return d.preacher && d.swapGroup === 'week';
  }

  var i;
  for (i = 0; i < days.length; i++) {
    if (counts(days[i])) bump(tally, days[i].iso, days[i].dow, days[i].preacher, 1);
  }

  for (i = 0; i < days.length; i++) {
    var a = days[i];
    if (!counts(a)) continue;

    if (at(used, a.iso, a.dow, a.preacher) < CE_SAME_DOW_MAX) {
      bump(used, a.iso, a.dow, a.preacher, 1);
      continue;
    }

    var b = ceFindSameDowSwap(days, i, 1, tally, exceptions) ||
            ceFindSameDowSwap(days, i, -1, tally, exceptions);
    if (b) {
      bump(tally, a.iso, a.dow, a.preacher, -1);
      bump(tally, b.iso, b.dow, b.preacher, -1);
      var tmp = a.preacher;
      a.preacher = b.preacher;
      b.preacher = tmp;
      bump(tally, a.iso, a.dow, a.preacher, 1);
      bump(tally, b.iso, b.dow, b.preacher, 1);

      var day = CE_DOW_NAMES[a.dow] + '요일';
      a.dowNote = day + ' 설교가 세 번째라 ' + b.iso + ' 과 순서 바꿈';
      b.dowNote = a.iso + ' 과 순서 바꿈 (' + day + ' 설교 세 번째)';
    } else {
      a.dowWarning = CE_DOW_NAMES[a.dow] + '요일 설교가 그 달에 세 번 이상입니다 ' +
        '(바꿀 상대를 찾지 못했습니다)';
    }
    bump(used, a.iso, a.dow, a.preacher, 1);
  }
  return days;
}

/**
 * 같은 요일 세 번째 설교를 풀어 줄 상대를 한 방향으로 찾습니다.
 *   step  1 = 다음 날부터 뒤로,  -1 = 지난 날부터 앞으로
 * 같은 달 안에서, 요일이 다른 평일 중에서 찾습니다.
 * 맞바꾼 뒤 어느 쪽도 같은 요일 두 번을 넘지 않아야 하고,
 * 그날 설교자와 방송실이 겹치게 되거나 휴가와 부딪히면 넘어갑니다.
 */
function ceFindSameDowSwap(days, from, step, tally, exceptions) {
  var a = days[from];
  var month = a.iso.slice(0, 7);
  function count(iso, dow, name) {
    var m = iso.slice(0, 7);
    return (tally[m] && tally[m][dow] && tally[m][dow][name]) || 0;
  }
  for (var j = from + step; j >= 0 && j < days.length; j += step) {
    var b = days[j];
    if (b.iso.slice(0, 7) !== month) break;        // 달을 넘기면서까지 찾지는 않습니다
    if (b.swapGroup !== 'week' || !b.preacher) continue;
    if (b.dow === a.dow) continue;                 // 같은 요일끼리 바꾸면 뜻이 없습니다
    if (count(a.iso, a.dow, b.preacher) + 1 > CE_SAME_DOW_MAX) continue;
    if (count(b.iso, b.dow, a.preacher) + 1 > CE_SAME_DOW_MAX) continue;
    if (b.preacher === a.broadcast || a.preacher === b.broadcast) continue;
    if (!ceIsAvailable(b.preacher, a.iso, CE_ROLE.SERMON, exceptions)) continue;
    if (!ceIsAvailable(a.preacher, b.iso, CE_ROLE.SERMON, exceptions)) continue;
    return b;
  }
  return null;
}

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

  // 겹침을 푼 뒤에 같은 요일 설교 횟수를 정리합니다.
  ceEnforceSameDowLimit(dawnDays, ex);

  var byIso = {};
  function slot(iso) {
    if (!byIso[iso]) {
      byIso[iso] = {
        iso: iso, preacher: '', broadcast: '', door: '', praise: '', ushers: [],
        offSermon: false, offBroadcast: false, offDoor: false, offPraise: false, offUsher: false,
        gapSermon: false, gapBroadcast: false, gapDoor: false, gapPraise: false, gapUsher: false,
        swapNote: '', warning: '', dowNote: '', dowWarning: ''
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
    cell.dowNote = day.dowNote || '';
    cell.dowWarning = day.dowWarning || '';
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
  /* 계산은 격자보다 한 달 더 멀리까지 돕니다.
     격자 끝에서 계산을 멈추면, 마지막 주에 생긴 겹침이 '구간 밖' 의 다음 평일을
     못 보고 못 푼 것으로 남습니다. 그러면 같은 날짜가 다음 달 시트에서는 풀려 있어
     두 시트가 어긋납니다. 끝을 그 달과 상관없는 자리(다음 달 말일)로 밀어 두면
     어느 달에서 계산해도 같은 결과가 나옵니다. */
  return {
    weeks: weeks,
    startIso: ceIso(start),
    endIso: ceIso(end),
    buildEndIso: ceIso(ceMakeDate(year, month + 2, 0))
  };
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
    ceEnforceSameDowLimit: ceEnforceSameDowLimit,
    CE_SAME_DOW_MAX: CE_SAME_DOW_MAX,
    ceWeekStart: ceWeekStart,
    ceDayGap: ceDayGap,
    CE_SWAP_MAX_DAYS: CE_SWAP_MAX_DAYS,
    CE_USHER_PER_WEEK: CE_USHER_PER_WEEK,
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

  /**
   * 요일 설정을 읽습니다.
   *  - 비어 있으면 기본값을 씁니다
   *  - 적혀 있는데 하나도 못 알아보면 알려 줍니다. 그냥 넘기면 그 요일이 하나도
   *    없는 셈이 되어, 아무 설명도 없이 빈 표가 나옵니다
   *  - 표는 월~토만 보여 주므로 주일(일)은 뺍니다. 넣어 두면 그날 배정이
   *    보이지도 않으면서 로테이션 순번만 소모됩니다
   */
  function dows(keys, fallback, label) {
    var raw = pick(keys, fallback);
    var txt = String(raw == null ? '' : raw).trim();
    var list = ceParseDowList(txt === '' ? fallback : raw);
    if (!list.length) {
      throw new Error('"' + CE_TAB.SETTINGS + '" 탭의 [' + label + '] 을 알아볼 수 없습니다. ' +
        '월,화,수,목,금,토 처럼 적어 주세요. (지금 적힌 값: ' + txt + ')');
    }
    var weekOnly = [];
    for (var i = 0; i < list.length; i++) {
      if (list[i] >= 1 && list[i] <= 6) weekOnly.push(list[i]);
    }
    if (!weekOnly.length) {
      throw new Error('"' + CE_TAB.SETTINGS + '" 탭의 [' + label + '] 에 월~토 중 하나는 있어야 합니다. ' +
        '표는 월요일부터 토요일까지만 보여 줍니다. (지금 적힌 값: ' + txt + ')');
    }
    return weekOnly;
  }

  return {
    anchor: anchor,
    dawnDows: dows(['새벽예배 요일'], '월,화,수,목,금,토', '새벽예배 요일'),
    satDows: dows(['토요 별도 요일', '토요별도 요일'], '토', '토요 별도 요일'),
    // '수요현관 요일'·'수요저녁 요일'·'토요찬양 요일' 은 예전 이름입니다.
    // 이미 쓰고 계신 시트를 위해 같이 받습니다.
    doorDows: dows(['수요백업 요일', '수요현관 요일', '수요저녁 요일'], '수', '수요백업 요일'),
    praiseDows: dows(['토요백업 요일', '토요찬양 요일'], '토', '토요백업 요일')
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
    note: '수요저녁 백업 명단. 표 넷째 줄 [수요/토요 서브] 의 수요일 칸에 들어갑니다. ' +
      '그날 설교자·방송실과 겹쳐도 바꾸지 않고 순서대로 돕니다.',
    renameFrom: ['수요현관', '수요저녁 현관', '현관'] },
  { key: 'praise', header: '토요백업',
    note: '토요일 백업 명단. 같은 넷째 줄 [수요/토요 서브] 의 토요일 칸에 들어갑니다. ' +
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

/**
 * 역할을 달력·저장소에 적을 글자로 바꿉니다.
 * 여기 빠진 역할이 있으면 '전체' 로 적혀 역할 범위가 날아가므로,
 * CE_ROLE 에 역할을 더할 때 이 함수도 같이 손봐야 합니다.
 */
function ceRoleLabel(role) {
  if (role === CE_ROLE.SERMON) return '설교';
  if (role === CE_ROLE.BROADCAST) return '방송';
  if (role === CE_ROLE.DOOR) return '수요백업';
  if (role === CE_ROLE.PRAISE) return '토요백업';
  if (role === CE_ROLE.USHER) return '현관안내';
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

/* ===== Calendar.gs ===== */

/**
 * "달력(예외자)" 탭 - 한 달치 달력에 그날 빠지는 사람 이름을 적어 두는 곳.
 *
 * 화면에는 한 달만 보이지만, 달을 옮길 때 지금 내용을 숨김 탭(_달력저장)에 넣어 두고
 * 새 달에 적어 둔 내용을 꺼내 옵니다. 적은 적 없는 달은 이름 칸이 비어 있습니다.
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

/**
 * B1 드롭다운에 넣을 연월 목록.
 * 맨 위가 이번 달, 그 다음이 다음 달들(+6), 그 뒤가 지난 달들(-6) 입니다.
 * 자주 고르는 달이 위쪽에 오도록 한 것입니다.
 */
function ceMonthChoices() {
  var now = new Date();
  function at(offset) {
    var d = new Date(Date.UTC(now.getFullYear(), now.getMonth() + offset, 1));
    return ceFormatYearMonth(d.getUTCFullYear(), d.getUTCMonth() + 1);
  }
  var list = [at(0)];
  var i;
  for (i = 1; i <= 6; i++) list.push(at(i));
  for (i = 1; i <= 6; i++) list.push(at(-i));
  return list;
}

/**
 * 연월 칸(B1)에 달 고르는 목록을 붙입니다.
 * 달력을 다시 그리지 않아도 목록이 살아 있도록, 시트를 열 때마다 한 번 걸어 둡니다.
 */
function ceEnsureCalendarDropdown() {
  var sh = ceSheet(CE_TAB.CALENDAR, false);
  if (!sh) return false;
  sh.getRange(CE_CAL.YM_ROW, CE_CAL.YM_COL).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInList(ceMonthChoices(), true)
      .setAllowInvalid(true)
      .build());
  return true;
}

/** [{name, role}] 을 이름 칸 한 줄로 씁니다. */
function ceFormatNameCell(entries) {
  return entries.map(function (e) {
    return e.role === CE_ROLE.ALL ? e.name : e.name + '(' + ceRoleLabel(e.role) + ')';
  }).join(', ');
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

/** 달력이 지금 어느 달을 보여 주고 있는지. 없으면 null. */
function ceCalendarYearMonth() {
  var sh = ceSheet(CE_TAB.CALENDAR, false);
  if (!sh) return null;
  return ceParseYearMonth(sh.getRange(CE_CAL.YM_ROW, CE_CAL.YM_COL).getValue());
}

/**
 * 화면에 그려져 있는 격자를 읽어 예외 목록을 만듭니다.
 * ym 은 그 격자가 어느 달의 것인지입니다. (B1 값이 아니라 마지막으로 그린 달)
 */
function ceReadCalendarExceptions(ym) {
  var sh = ceSheet(CE_TAB.CALENDAR, false);
  if (!sh) return [];
  if (!ym) ym = ceStoreGetShownMonth() || ceCalendarYearMonth();
  if (!ym) return [];

  var weeks = ceCalendarWeeks(ym.year, ym.month);
  var out = [];
  for (var w = 0; w < weeks.length; w++) {
    var nameRow = CE_CAL.FIRST_WEEK_ROW + w * 2 + 1;
    var row = sh.getRange(nameRow, 1, 1, CE_CAL.COLS).getValues()[0];
    for (var c = 0; c < CE_CAL.COLS; c++) {
      var cell = weeks[w][c];
      if (!cell.inMonth) continue;
      var entries = ceParseNameCell(row[c]);
      for (var i = 0; i < entries.length; i++) {
        out.push({ name: entries[i].name, start: cell.iso, end: cell.iso, role: entries[i].role });
      }
    }
  }
  return out;
}

/**
 * 지금 그려져 있는 달의 내용을 저장소에 넣습니다.
 * 그 달의 기존 기록은 갈아 끼우고, 다른 달은 그대로 둡니다.
 */
function ceSaveCalendar() {
  var shown = ceStoreGetShownMonth();
  if (!shown) return 0;

  var fresh = ceReadCalendarExceptions(shown);
  var weeks = ceCalendarWeeks(shown.year, shown.month);
  var mine = {};
  for (var w = 0; w < weeks.length; w++) {
    for (var c = 0; c < CE_CAL.COLS; c++) {
      if (weeks[w][c].inMonth) mine[weeks[w][c].iso] = true;
    }
  }

  var kept = ceReadStoredExceptions().filter(function (e) { return !mine[e.start]; });
  ceWriteStoredExceptions(kept.concat(fresh));
  return fresh.length;
}

/**
 * 달력을 해당 연월로 다시 그립니다.
 * 날짜만 새로 채우고 이름 칸은 비워 둡니다. 이전에 적어 둔 내용은 남지 않습니다.
 */
function ceRenderCalendar(year, month) {
  ceSaveCalendar();               // 보고 있던 달의 내용을 먼저 넣어 둡니다

  var sh = ceSheet(CE_TAB.CALENDAR, true);
  var weeks = ceCalendarWeeks(year, month);

  var byIso = {};
  var stored = ceReadStoredExceptions();
  for (var si = 0; si < stored.length; si++) {
    if (!byIso[stored[si].start]) byIso[stored[si].start] = [];
    byIso[stored[si].start].push({ name: stored[si].name, role: stored[si].role });
  }
  sh.clear();
  sh.clearNotes();
  // 달마다 주 수가 5주/6주로 달라지므로 지난번 병합을 먼저 풉니다.
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();

  sh.getRange(CE_CAL.YM_ROW, 1).setValue('연월').setFontWeight('bold');

  var ymCell = sh.getRange(CE_CAL.YM_ROW, CE_CAL.YM_COL);
  ymCell.setNumberFormat('@');
  ymCell.setValue(ceFormatYearMonth(year, month))
    .setFontWeight('bold').setBackground('#fff2cc').setHorizontalAlignment('center');
  ceEnsureCalendarDropdown();

  sh.getRange(CE_CAL.YM_ROW, 3, 1, 5).merge()
    .setValue('◀ 이 칸을 눌러 달을 고르세요. 고르는 즉시 그 달 달력이 나옵니다. 적어 두신 내용은 달마다 남습니다.')
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
  ceStoreSetShownMonth(year, month);
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
  FIRST_COL: 2,     // B열
  USHER_COL: 9      // I열 - 현관안내(수,토). H열은 표와 떼어 놓는 빈 열입니다.
};

var CE_USHER_HEADER = '현관안내(수,토)';
var CE_USHER_GAP_NOTE = '현관안내를 세 명 다 채우지 못했습니다. ' +
  '그 주 수요백업·토요백업으로 선 사람과 그 주 예외자는 세우지 않습니다.';

var CE_ROW_LABELS = ['Date', '설교자', '방송실', '수요/토요 서브'];

/**
 * 넷째 줄은 요일에 따라 내용이 바뀝니다.
 * 수요일에는 수요현관 담당, 토요일에는 토요찬양 담당이 들어갑니다.
 * 이 줄은 그날 설교자·방송실과 겹쳐도 손대지 않고 명단 순서대로 갑니다.
 */
function ceSpecialSlot(dow, info, cfg) {
  var doorDows = cfg.doorDows && cfg.doorDows.length ? cfg.doorDows : [3];
  var praiseDows = cfg.praiseDows && cfg.praiseDows.length ? cfg.praiseDows : [6];
  if (doorDows.indexOf(dow) >= 0) {
    return { name: info.door || '', off: !!info.offDoor, gap: !!info.gapDoor, label: '수요현관' };
  }
  if (praiseDows.indexOf(dow) >= 0) {
    return { name: info.praise || '', off: !!info.offPraise, gap: !!info.gapPraise, label: '토요찬양' };
  }
  return { name: '', off: false, gap: false, label: '' };
}

function ceMonthSheetName(year, month) {
  return ceFormatYearMonth(year, month);
}

/**
 * 배정을 계산해서 'YYYY-MM' 시트에 씁니다. 시트가 있으면 덮어씁니다.
 * 저장된 순번 없이 기준일부터 매번 새로 계산하므로, 몇 번을 돌려도 결과가 같습니다.
 */
function ceGenerateMonth(year, month) {
  ceRenameLegacyTabs();           // 예전 이름의 탭이 있으면 먼저 바꿔 둡니다
  ceRemoveQtTab();                // 예전 '생명의 삶' 탭이 남아 있으면 지웁니다
  try {
    ceRemoveQtTrigger();          // 이제 쓰지 않는 편집 트리거를 걷어냅니다
  } catch (err) {
    // 못 지워도 배정은 그대로 됩니다.
  }
  ceSaveCalendar();               // 달력에 적어만 두고 아직 안 넘긴 내용까지 반영

  var cfg = ceReadConfig();
  var rot = ceReadRotations();
  if (!rot.sermon.length) throw new Error('"' + CE_TAB.ROTATION + '" 탭의 [설교] 명단이 비어 있습니다.');

  var ex = ceReadAllExceptions();
  var grid = ceMonthGrid(year, month);

  // 격자가 아니라 '그 달' 을 기준으로 봅니다. 격자에는 다음 달 날짜가 조금 섞여 있어서,
  // 격자로 보면 통째로 기준일 앞인 달도 통과해 거의 빈 표가 만들어집니다.
  if (ceIso(ceMakeDate(year, month + 1, 0)) < cfg.anchor) {
    throw new Error('로테이션 시작일(' + cfg.anchor + ') 보다 앞선 달입니다. 시작일을 앞으로 당겨 주세요.');
  }

  // 격자보다 한 달 더 계산합니다. 마지막 주 겹침이 구간 밖을 못 봐서
  // 같은 날짜가 달마다 달라지는 일을 막습니다. 그리는 것은 격자 범위만입니다.
  var sched = ceBuildSchedule(cfg, rot, ex, grid.buildEndIso || grid.endIso);
  ceWriteMonthSheet(year, month, grid, sched, cfg, rot);

  var sheetName = ceMonthSheetName(year, month);
  ceOrderTabs(sheetName);

  return {
    sheetName: sheetName,
    warnings: ceCollectWarnings(grid, sched, cfg),
    notes: ceFallbackNotes(rot, cfg)
      .concat(ceHolidayListNotes(rot, sched, grid))
      .concat(ceSameDowHintNotes(sched, grid))
      .concat(ceUnknownNameNotes(rot, ex, grid))
      .concat(ceSwapSummaryNotes(sched, grid))
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
        '[초기 설정 만들기] 를 한 번 더 눌러 주세요.');
      return;
    }
    if (!(rot[key] || []).length) {
      notes.push('[' + header + '] 열(' + ceColumnLetter(cols[key]) + '열)에 이름이 없습니다. ' + whenEmpty);
    }
  }

  check('satSermon', '토요설교', '토요일도 [설교] 명단으로 이어서 돌았습니다.');
  check('satBroadcast', '토요방송', '토요일도 [방송] 명단으로 이어서 돌았습니다.');
  check('door', '수요백업', '수요일 넷째 줄은 비워 두었습니다.');
  check('praise', '토요백업', '토요일 넷째 줄은 비워 두었습니다.');
  check('usher', '현관안내', '현관안내 칸은 비워 두었습니다.');
  return notes;
}

/** 그 달에 휴일이 있는데 휴일 명단이 비어 있으면 알려 줍니다. */
function ceHolidayListNotes(rot, sched, grid) {
  var hasHoliday = false;
  for (var iso in sched.byIso) {
    if (!Object.prototype.hasOwnProperty.call(sched.byIso, iso)) continue;
    if (iso < grid.startIso || iso > grid.endIso) continue;
    var a = sched.byIso[iso];
    if (a.offSermon || a.offBroadcast) { hasHoliday = true; break; }
  }
  if (!hasHoliday) return [];

  var notes = [];
  if (!(rot.holidaySermon || []).length) {
    notes.push('[휴일(설교)] 명단이 비어 있어 휴일 설교자 칸을 비워 두었습니다.');
  }
  if (!(rot.holidayBroadcast || []).length) {
    notes.push('[휴일(백업)] 명단이 비어 있어 휴일 방송실 칸을 비워 두었습니다.');
  }
  return notes;
}

/** 'M/D' 로 짧게. 안내 문구에서 날짜를 여럿 늘어놓을 때 씁니다. */
function ceShortDay(iso) {
  return Number(iso.slice(5, 7)) + '/' + Number(iso.slice(8, 10));
}

/**
 * 순서를 바꾼 자리가 어디인지 배정 직후에 알려 줍니다.
 * 바뀐 칸에는 메모가 붙지만 검은 삼각형이 작아 못 보고 지나치기 쉽습니다.
 */
function ceSwapSummaryNotes(sched, grid) {
  var swapped = [];
  var moved = [];
  for (var i = 0; i < sched.dawnDays.length; i++) {
    var d = sched.dawnDays[i];
    if (d.iso < grid.startIso || d.iso > grid.endIso) continue;
    // 맞바꾼 두 날 모두 메모가 붙으므로, 옮긴 쪽만 셉니다.
    if (d.swapNote && d.swapNote.split(' ')[0] > d.iso) {
      swapped.push(ceShortDay(d.iso));
    }
    if (d.dowNote && d.dowNote.indexOf('세 번째라') > 0) {
      moved.push(ceShortDay(d.iso) + '(' + CE_DOW_NAMES[d.dow] + ')');
    }
  }

  var notes = [];
  if (swapped.length) {
    notes.push('설교자와 겹쳐서 방송실을 맞바꾼 날: ' + swapped.join(', '));
  }
  if (moved.length) {
    notes.push('같은 요일 설교가 세 번째라 순서를 바꾼 날: ' + moved.join(', '));
  }
  if (notes.length) {
    notes.push('바뀐 칸에 메모가 붙어 있습니다. 칸 오른쪽 위 검은 삼각형에 마우스를 올리면 보입니다.');
  }
  return notes;
}


/** 같은 요일 설교 횟수를 못 맞춘 경우, 왜 그런지 한 번만 덧붙입니다. */
function ceSameDowHintNotes(sched, grid) {
  for (var iso in sched.byIso) {
    if (!Object.prototype.hasOwnProperty.call(sched.byIso, iso)) continue;
    if (iso < grid.startIso || iso > grid.endIso) continue;
    if (sched.byIso[iso].dowWarning) {
      return ['같은 요일 설교가 세 번 이상 남았습니다. 평일이 주 5일이라 ' +
        '[설교] 명단 인원이 5의 약수(1·5명)면 같은 요일에 같은 사람이 되풀이됩니다. ' +
        '명단 인원을 늘리거나 줄이면 풀립니다.'];
    }
  }
  return [];
}

/**
 * 달력에 적힌 이름이 명단에 없으면 알려 줍니다.
 * '김목사' 를 '김목사님' 이라고 적으면 프로그램은 다른 사람으로 보고 그냥 넘어가므로,
 * 그 사람은 빠지지 않고 그대로 표에 들어갑니다. 오타는 이렇게만 잡힙니다.
 */
function ceUnknownNameNotes(rot, exceptions, grid) {
  var known = {};
  for (var i = 0; i < CE_ROTATION_COLUMNS.length; i++) {
    var list = rot[CE_ROTATION_COLUMNS[i].key] || [];
    for (var n = 0; n < list.length; n++) known[list[n]] = true;
  }

  var seen = {};
  var unknown = [];
  for (var e = 0; e < exceptions.length; e++) {
    var ex = exceptions[e];
    if (ex.start < grid.startIso || ex.start > grid.endIso) continue;   // 이번 달 것만 봅니다
    if (ceIsHolidayName(ex.name)) continue;                             // '휴일' 은 사람이 아닙니다
    if (known[ex.name] || seen[ex.name]) continue;
    seen[ex.name] = true;
    unknown.push(ex.name + ' (' + ex.start + ')');
  }

  if (!unknown.length) return [];
  return ['[' + CE_TAB.CALENDAR + '] 에 적힌 ' + unknown.join(', ') + ' 은(는) 명단에 없는 이름입니다. ' +
    '이름이 다르면 그 사람은 빠지지 않고 그대로 배정됩니다. 오타가 아닌지 확인해 주세요.'];
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
      if (a.dowWarning) out.push(cell.iso + ' : ' + a.dowWarning);
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
/**
 * 한 칸에 붙일 메모를 모아 한 번에 씁니다.
 * 한 칸에 사연이 둘 이상일 수 있어서, 따로따로 쓰면
 * 뒤에 쓴 것이 앞의 것을 덮어 버립니다.
 */
function ceWriteNote(sh, row, col, lines) {
  var kept = [];
  for (var i = 0; i < lines.length; i++) {
    if (lines[i]) kept.push(lines[i]);
  }
  if (kept.length) sh.getRange(row, col).setNote(kept.join('\n'));
}

function ceMarkHoliday(sh, row, col) {
  sh.getRange(row, col).setBackground(CE_COLOR.HOLIDAY_BG).setNote('휴일 — 직접 입력하세요');
}

/** 명단은 있는데 그날 전원이 예외라 못 채운 칸. */
function ceMarkGap(sh, row, col) {
  sh.getRange(row, col).setBackground(CE_COLOR.WARN_BG).setNote('배정할 사람이 없습니다 (전원 예외)');
}

/**
 * 한 주 블록의 현관안내 칸(I열)을 채웁니다.
 *   맨 윗칸 - 그 주 수요일·토요일 날짜, 예) (7,10)
 *   아래 세 칸 - 현관안내 명단 순서대로 세 명
 * 칸 색은 왼쪽 표의 같은 줄과 똑같이 맞춥니다.
 */
function ceWriteUsherBlock(sh, base, week, sched, cfg) {
  var doorDows = cfg.doorDows && cfg.doorDows.length ? cfg.doorDows : [3];
  var praiseDows = cfg.praiseDows && cfg.praiseDows.length ? cfg.praiseDows : [6];

  var wed = null;
  var sat = null;
  for (var c = 0; c < CE_OUT.COLS; c++) {
    var cell = week[c];
    if (!wed && doorDows.indexOf(cell.dow) >= 0) wed = cell;
    if (!sat && praiseDows.indexOf(cell.dow) >= 0) sat = cell;
  }

  var label = '(' + (wed ? wed.day : '') + ',' + (sat ? sat.day : '') + ')';
  sh.getRange(base, CE_OUT.USHER_COL).setValue(label)
    .setBackground(CE_COLOR.HEAD_BG).setFontColor('#ffffff')
    .setFontWeight('bold').setHorizontalAlignment('center');

  var info = (wed && sched.byIso[wed.iso]) || {};
  var names = info.ushers || [];
  for (var k = 0; k < CE_USHER_PER_WEEK; k++) {
    var cellRange = sh.getRange(base + 1 + k, CE_OUT.USHER_COL);
    cellRange.setValue(names[k] || '').setHorizontalAlignment('center');
    // 왼쪽 표의 같은 줄과 같은 바탕색
    cellRange.setBackground(k === 0 ? CE_COLOR.BAND_BG : null);
    // 못 채운 자리를 표시합니다. 채운 자리는 멀쩡하므로 빈 자리만 칠합니다.
    if (info.gapUsher && !names[k]) {
      cellRange.setBackground(CE_COLOR.WARN_BG).setNote(CE_USHER_GAP_NOTE);
    }
  }
}

/** 이 달 표에 실제로 들어간 사람 이름을 모읍니다. (가나다 순) */
function ceNamesInMonth(grid, sched, cfg) {
  var seen = {};
  var out = [];
  for (var w = 0; w < grid.weeks.length; w++) {
    for (var c = 0; c < CE_OUT.COLS; c++) {
      var cell = grid.weeks[w][c];
      var a = sched.byIso[cell.iso];
      if (!a) continue;
      var names = [a.preacher, a.broadcast, ceSpecialSlot(cell.dow, a, cfg).name]
        .concat(a.ushers || []);
      for (var i = 0; i < names.length; i++) {
        var n = String(names[i] || '').trim();
        if (!n || seen[n]) continue;
        seen[n] = true;
        out.push(n);
      }
    }
  }
  out.sort();
  return out;
}

/**
 * 표 아래에 이름 목록을 깔고 그 밑에 체크박스를 붙입니다.
 * 체크하면 그 사람 칸이 보입니다. 색칠은 조건부 서식이 하므로 누르는 즉시 반응합니다.
 * 한 사람씩만 체크되게 하는 것은 onEdit(ceOnNamePick) 이 맡습니다.
 *
 * 반환값은 이 구역이 끝나는 줄 번호입니다.
 */
function ceWriteNamePicker(sh, startRow, totalCols, grid, sched, cfg) {
  sh.setConditionalFormatRules([]);

  var names = ceNamesInMonth(grid, sched, cfg);
  if (!names.length) return startRow - 1;

  sh.getRange(startRow, 1, 1, totalCols).merge()
    .setValue('이름을 체크하면 그 사람 칸이 표시됩니다 — 설교는 노랑, 방송·수요/토요 서브·현관안내는 연한 초록.')
    .setFontSize(9).setFontColor('#666666');

  var perLine = CE_OUT.COLS;                 // 표 너비에 맞춰 한 줄에 6명씩
  var row = startRow + 1;
  var pairs = [];                            // [{nameRow, checkRow, count}]

  for (var i = 0; i < names.length; i += perLine) {
    var chunk = names.slice(i, i + perLine);
    var nameRow = row;
    var checkRow = row + 1;

    sh.getRange(nameRow, CE_OUT.FIRST_COL, 1, chunk.length).setValues([chunk])
      .setBackground('#efefef').setFontWeight('bold')
      .setHorizontalAlignment('center').setFontSize(10);
    sh.getRange(checkRow, CE_OUT.FIRST_COL, 1, chunk.length)
      .insertCheckboxes().setHorizontalAlignment('center');

    pairs.push({ nameRow: nameRow, checkRow: checkRow, count: chunk.length });
    row += 2;
  }

  var lastPickerRow = row - 1;
  sh.getRange(startRow + 1, 1, lastPickerRow - startRow, totalCols)
    .setBorder(true, true, true, true, true, true, CE_COLOR.BORDER, SpreadsheetApp.BorderStyle.SOLID);

  ceApplyHighlightRule(sh, pairs, grid.weeks.length);
  return lastPickerRow;
}

/**
 * 체크한 이름과 같은 칸을 칠하는 조건부 서식.
 * 설교자 줄은 노랑, 방송실과 수요/토요 서브 줄은 연한 초록으로 갈라 놓습니다.
 *
 * 규칙 하나가 여러 자리에 걸리므로, 조건식이 자리에 휘둘리지 않도록
 * INDIRECT(ADDRESS(ROW(),COLUMN())) 로 '지금 이 칸' 을 가리킵니다.
 */
function ceApplyHighlightRule(sh, pairs, weekCount) {
  var here = 'INDIRECT(ADDRESS(ROW(),COLUMN()))';

  var terms = pairs.map(function (p) {
    var from = ceColumnLetter(CE_OUT.FIRST_COL);
    var to = ceColumnLetter(CE_OUT.FIRST_COL + p.count - 1);
    return 'COUNTIFS($' + from + '$' + p.nameRow + ':$' + to + '$' + p.nameRow + ',' + here +
      ',$' + from + '$' + p.checkRow + ':$' + to + '$' + p.checkRow + ',TRUE)';
  });
  var formula = '=AND(' + here + '<>"",(' + terms.join('+') + ')>0)';

  var sermonRanges = [];
  var otherRanges = [];
  for (var w = 0; w < weekCount; w++) {
    var base = CE_OUT.FIRST_BLOCK_ROW + w * 4;
    sermonRanges.push(sh.getRange(base + 1, CE_OUT.FIRST_COL, 1, CE_OUT.COLS));
    otherRanges.push(sh.getRange(base + 2, CE_OUT.FIRST_COL, 2, CE_OUT.COLS));
    otherRanges.push(sh.getRange(base + 1, CE_OUT.USHER_COL, CE_USHER_PER_WEEK, 1));
  }
  // 체크한 이름 칸도 함께 물듭니다. 설교자와 같은 색으로 둡니다.
  for (var i = 0; i < pairs.length; i++) {
    sermonRanges.push(sh.getRange(pairs[i].nameRow, CE_OUT.FIRST_COL, 1, pairs[i].count));
  }

  sh.setConditionalFormatRules([
    ceHighlightRule(formula, CE_COLOR.PICK_SERMON_BG, sermonRanges),
    ceHighlightRule(formula, CE_COLOR.PICK_OTHER_BG, otherRanges)
  ]);
}

function ceHighlightRule(formula, background, ranges) {
  return SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(formula)
    .setBackground(background)
    .setRanges(ranges)
    .build();
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
  // clear() 는 내용과 서식만 지웁니다. 병합과 데이터 확인(체크박스) 규칙은 남아서,
  // 지난번 체크박스 자리에 이번에 글자가 들어가면 시트가 규칙 위반이라고 합니다.
  // 그리는 자리마다 어긋나지 않도록 둘 다 먼저 걷어냅니다.
  var whole = sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns());
  whole.breakApart();
  whole.clearDataValidations();

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
        swapNote: '', warning: ''
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

    ceWriteUsherBlock(sh, base, week, sched, cfg);
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

      // 설교자 줄 메모 (같은 요일 설교 두 번까지 규칙)
      ceWriteNote(sh, base + 1, col, [info.dowNote, info.dowWarning]);
      if (info.dowWarning) {
        sh.getRange(base + 1, col).setBackground(CE_COLOR.WARN_BG);
      }

      // 방송실 줄 메모 (설교자와 겹쳐서 맞바꾼 자리)
      ceWriteNote(sh, base + 2, col, [
        info.swapNote ? '설교자와 겹쳐서 ' + info.swapNote : '',
        info.warning
      ]);
      if (info.warning) {
        sh.getRange(base + 2, col).setBackground(CE_COLOR.WARN_BG);
      }
      if (info.gapSermon) ceMarkGap(sh, base + 1, col);
      if (info.gapBroadcast) ceMarkGap(sh, base + 2, col);
      if (special.gap) ceMarkGap(sh, base + 3, col);
    }
  }

  var lastRow = CE_OUT.FIRST_BLOCK_ROW + grid.weeks.length * 4 - 1;
  sh.getRange(CE_OUT.DOW_ROW, 1, lastRow - CE_OUT.DOW_ROW + 1, totalCols)
    .setBorder(true, true, true, true, true, true, CE_COLOR.BORDER, SpreadsheetApp.BorderStyle.SOLID);

  // 현관안내 열 머리글과 테두리. 표와 같은 모양으로 맞춥니다.
  sh.getRange(CE_OUT.DOW_ROW, CE_OUT.USHER_COL).setValue(CE_USHER_HEADER)
    .setBackground(CE_COLOR.HEAD_BG).setFontColor('#ffffff')
    .setFontWeight('bold').setFontSize(9).setHorizontalAlignment('center').setWrap(true);
  sh.getRange(CE_OUT.DOW_ROW, CE_OUT.USHER_COL, lastRow - CE_OUT.DOW_ROW + 1, 1)
    .setBorder(true, true, true, true, true, true, CE_COLOR.BORDER, SpreadsheetApp.BorderStyle.SOLID);

  var pickerEnd = ceWriteNamePicker(sh, lastRow + 2, totalCols, grid, sched, cfg);
  var qtRow = ceWriteQtLink(sh, pickerEnd + 2, totalCols);

  var footRow = qtRow + 2;
  sh.getRange(footRow, 1, 1, totalCols).merge()
    .setValue('자동 생성 · 기준일 ' + cfg.anchor + ' · ' + ceRotationSummary(rot) +
      ' · ' + Utilities.formatDate(new Date(), ceTz(), 'yyyy-MM-dd HH:mm'))
    .setFontSize(9).setFontColor('#666666');

  sh.setColumnWidth(1, 105);        // 줄 이름이 접히지 않을 만큼
  for (var col2 = CE_OUT.FIRST_COL; col2 <= totalCols; col2++) sh.setColumnWidth(col2, 100);
  sh.setColumnWidth(totalCols + 1, 24);                 // H열 - 표와 떼어 놓는 빈 열
  sh.setColumnWidth(CE_OUT.USHER_COL, 110);
  // 열 고정은 쓰지 않습니다. 제목 줄과 맨 아래 설명 줄이 A~G로 병합되어 있어서
  // 1열만 고정하면 병합된 칸이 갈라져 구글 시트가 막습니다. 표가 7열뿐이라
  // 가로로 밀 일도 없으므로, 대신 위쪽 두 줄을 고정합니다.
  sh.setFrozenRows(CE_OUT.DOW_ROW);
  return sh;
}

/* ===== Qt.gs ===== */

/**
 * 생명의 삶(두란노 QT) 묵상 달력.
 *
 * 배정표 맨 아래에 링크를 두고, 누르면 브라우저 새 탭에서 열립니다.
 *
 * 시트 위에 창으로 띄우는 방식도 만들어 봤지만 잘 열리지 않아 걷어냈습니다.
 * 셀은 그냥 눌러도 스크립트가 실행되지 않아 체크박스를 써야 했고, 게다가
 * 편집 트리거에서는 창을 띄우는 것이 막히는 경우가 있습니다.
 *
 * 아이디와 비밀번호는 넣지 않습니다. 브라우저에 로그인해 두시면 그 세션을 씁니다.
 */

var CE_QT_LABEL = '생명의 삶 묵상달력 열기  ▶';

/** 배정표 맨 아래에 묵상 달력 링크를 놓습니다. */
function ceWriteQtLink(sh, row, totalCols) {
  sh.getRange(row, 1, 1, totalCols).merge()
    .setFormula('=HYPERLINK("' + CE_QT_URL + '","' + CE_QT_LABEL + '")')
    .setBackground('#588fad').setFontColor('#ffffff')
    .setFontSize(11).setFontWeight('bold')
    .setHorizontalAlignment('center').setVerticalAlignment('middle');
  sh.setRowHeight(row, 34);
  return row;
}

/**
 * 예전에 만들던 '생명의 삶' 탭이 남아 있으면 지웁니다.
 * 우리가 만든 그 탭이 맞는지 제목으로 확인하고 지웁니다.
 */
function ceRemoveQtTab() {
  var ss = ceSS();
  var sh = ss.getSheetByName('생명의 삶');
  if (!sh) return false;
  if (String(sh.getRange(1, 1).getValue()).indexOf('생명의 삶') !== 0) return false;
  ss.deleteSheet(sh);
  return true;
}

/**
 * 체크박스로 창을 띄우던 시절에 걸어 둔 설치형 트리거를 지웁니다.
 * 함수가 없어졌으므로 그냥 두면 시트를 고칠 때마다 오류가 납니다.
 */
function ceRemoveQtTrigger() {
  var triggers = ScriptApp.getUserTriggers(ceSS());
  var removed = 0;
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'ceOnQtCheckbox') {
      ScriptApp.deleteTrigger(triggers[i]);
      removed++;
    }
  }
  return removed;
}

/* ===== Setup.gs ===== */

/**
 * 처음 한 번 실행해서 필요한 탭을 만들어 두는 코드.
 * 이미 있는 탭은 건드리지 않습니다.
 */

/**
 * 설정 탭에 있어야 할 항목들.  [이름, 기본값, 설명, 예전에 쓰던 이름들]
 * 없으면 채워 넣고, 예전 이름으로 적혀 있으면 새 이름으로 바꿔 줍니다.
 * 설명은 초기 설정을 다시 누를 때마다 최신 내용으로 맞춥니다 (값은 건드리지 않습니다).
 */
var CE_SETTING_ROWS = [
  ['로테이션 시작일', null,
    '이 날짜에 각 명단의 첫 번째 사람이 섭니다. 배정은 늘 이 날짜부터 다시 계산하므로, ' +
    '바꾸면 그 뒤 모든 달의 순서가 함께 밀립니다. 한 번 정하면 웬만하면 바꾸지 마세요.',
    []],
  ['새벽예배 요일', '월,화,수,목,금,토',
    '설교자와 방송실을 배정할 요일. 여기서 뺀 요일은 표에서 빈 칸으로 남습니다. ' +
    '주일(일)은 넣지 마세요.',
    []],
  ['토요 별도 요일', '토',
    '이 요일은 [토요설교]·[토요방송] 명단으로 따로 돌립니다. ' +
    '두 명단을 비워 두면 평일 명단으로 그냥 이어서 돕니다. ' +
    '방송실 교대도 토요일끼리만 일어납니다.',
    ['토요별도 요일']],
  ['수요백업 요일', '수',
    '[수요백업] 담당을 배정할 요일. 표 넷째 줄 [수요/토요 서브] 의 이 요일 칸에 들어갑니다. ' +
    '[현관안내] 날짜도 이 요일로 잡습니다.',
    ['수요현관 요일', '수요저녁 요일']],
  ['토요백업 요일', '토',
    '[토요백업] 담당을 배정할 요일. 같은 넷째 줄의 이 요일 칸에 들어갑니다.',
    ['토요찬양 요일']]
];

function ceSetupAll() {
  var created = [];
  var updated = [];
  var renamed = ceRenameLegacyTabs();
  ceRemoveQtTab();                // 예전 '생명의 삶' 탭은 이제 쓰지 않습니다
  try {
    ceRemoveQtTrigger();          // 체크박스로 창을 띄우던 트리거도 걷어냅니다
  } catch (err) {
    // 못 지워도 나머지는 그대로 됩니다.
  }

  if (ceSetupSettings()) created.push(CE_TAB.SETTINGS);
  else ceDescribeUpgrade(CE_TAB.SETTINGS, ceUpgradeSettings(), '항목', updated);

  if (ceSetupRotation()) created.push(CE_TAB.ROTATION);
  else ceDescribeUpgrade(CE_TAB.ROTATION, ceUpgradeRotation(), '명단', updated);

  if (!ceSheet(CE_TAB.CALENDAR, false)) {
    var today = new Date();
    ceRenderCalendar(today.getFullYear(), today.getMonth() + 1);
    created.push(CE_TAB.CALENDAR);
  }
  ceOrderTabs(null);

  return { created: created, updated: updated, renamed: renamed };
}

/** 보완한 내용을 사람이 읽을 한 줄씩으로 옮겨 담습니다. */
function ceDescribeUpgrade(tab, up, what, out) {
  if (up.added.length) {
    out.push(tab + ': ' + what + ' ' + up.added.join(', ') + ' 추가');
  }
  if (up.renamed.length) {
    out.push(tab + ': 이름 변경 ' + up.renamed.join(', '));
  }
  if (up.refreshed.length) {
    out.push(tab + ': 설명 ' + up.refreshed.length + '개를 최신 내용으로 맞춤');
  }
  return out;
}

/**
 * 이미 있는 설정 탭을 손봅니다.
 *  - 빠진 항목은 아래에 덧붙입니다
 *  - 예전 이름으로 적힌 항목은 새 이름으로 바꿉니다
 *  - 설명은 늘 최신 내용으로 맞춥니다
 * 적어 두신 [값] 은 어느 경우에도 건드리지 않습니다.
 */
function ceUpgradeSettings() {
  var sh = ceSheet(CE_TAB.SETTINGS, false);
  if (!sh) return { added: [], renamed: [], refreshed: [] };

  var lastRow = Math.max(sh.getLastRow(), 1);
  var rowOf = {};
  var values = sh.getRange(1, 1, lastRow, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    var key = String(values[i][0] == null ? '' : values[i][0]).trim();
    if (key && !rowOf[key]) rowOf[key] = i + 1;
  }

  var added = [];
  var renamed = [];
  var refreshed = [];
  for (var r = 0; r < CE_SETTING_ROWS.length; r++) {
    var def = CE_SETTING_ROWS[r];
    var name = def[0], note = def[2], aliases = def[3] || [];

    var at = rowOf[name] || 0;
    var oldName = '';
    for (var a = 0; a < aliases.length && !at; a++) {
      if (rowOf[aliases[a]]) { at = rowOf[aliases[a]]; oldName = aliases[a]; }
    }

    if (!at) {
      lastRow++;
      sh.getRange(lastRow, 1, 1, 3)
        .setValues([[name, def[1] == null ? ceDefaultAnchor() : def[1], note]]);
      sh.getRange(lastRow, 1).setFontWeight('bold');
      sh.getRange(lastRow, 2).setBackground('#fff2cc').setNumberFormat('@');
      sh.getRange(lastRow, 3).setWrap(true);
      added.push(name);
      continue;
    }

    if (oldName) {
      sh.getRange(at, 1).setValue(name).setFontWeight('bold');
      renamed.push(oldName + ' → ' + name);
    }
    if (String(sh.getRange(at, 3).getValue() || '').trim() !== note) {
      sh.getRange(at, 3).setValue(note).setWrap(true);
      refreshed.push(name);
    }
  }

  // 설명이 길어졌으니 읽을 수 있게 폭을 맞춰 둡니다.
  if (added.length || renamed.length || refreshed.length) {
    sh.setColumnWidth(1, 140);
    sh.setColumnWidth(3, 520);
  }
  return { added: added, renamed: renamed, refreshed: refreshed };
}

/**
 * 이미 있는 로테이션 탭을 손봅니다.
 *  - 빠진 명단 열을 채워 넣습니다. 안내 문구 뒤 멀찍이 붙으면 못 보고 지나치기
 *    쉬우므로 기존 명단 열 바로 다음 자리에 끼워 넣습니다
 *  - 뜻이 달라진 예전 머리글(수요현관·토요찬양)은 새 이름으로 바꿉니다
 *  - 머리글 메모는 늘 최신 내용으로 맞춥니다
 * 적어 두신 이름은 어느 경우에도 건드리지 않습니다.
 */
function ceUpgradeRotation() {
  var sh = ceSheet(CE_TAB.ROTATION, false);
  if (!sh) return { added: [], renamed: [], refreshed: [] };

  var found = ceRotationColumnMap(sh);
  var fresh = ceRefreshRotationHeaders(sh, found);
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
    sh.getRange(1, col).setNote(def.note || '');
    sh.setColumnWidth(col, 130);
    added.push(def.header);
    col++;
  }
  return { added: added, renamed: fresh.renamed, refreshed: fresh.refreshed };
}

/**
 * 이미 있는 머리글의 이름과 메모를 최신으로 맞춥니다.
 * '설교자'·'방송실' 처럼 그냥 다르게 쓰신 이름은 그대로 두고,
 * 뜻이 달라진 예전 이름(수요현관·토요찬양)만 바꿉니다.
 */
function ceRefreshRotationHeaders(sh, found) {
  var renamed = [];
  var refreshed = [];
  for (var i = 0; i < CE_ROTATION_COLUMNS.length; i++) {
    var def = CE_ROTATION_COLUMNS[i];
    var col = found[def.key];
    if (!col) continue;

    var now = ceNormalizeHeader(sh.getRange(1, col).getValue());
    var olds = def.renameFrom || [];
    for (var o = 0; o < olds.length; o++) {
      if (now !== ceNormalizeHeader(olds[o])) continue;
      sh.getRange(1, col).setValue(def.header);
      renamed.push(olds[o] + ' → ' + def.header);
      break;
    }
    var note = def.note || '';
    if (String(sh.getRange(1, col).getNote() || '').trim() !== note) {
      sh.getRange(1, col).setNote(note);
      refreshed.push(def.header);
    }
  }
  return { renamed: renamed, refreshed: refreshed };
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

  for (var i = 0; i < n; i++) {
    sh.getRange(1, i + 1).setNote(CE_ROTATION_COLUMNS[i].note || '');
  }

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
    .addItem('새벽설교 배정표 만들기', 'ceMenuGenerate')
    .addSeparator()
    .addItem('초기 설정 만들기', 'ceMenuSetup')
    .addToUi();

  // 달력 연월 칸의 목록은 시트를 열 때마다 다시 걸어 둡니다.
  // (달력을 다시 그리지 않아도 목록이 뜨도록)
  try {
    ceEnsureCalendarDropdown();
  } catch (err) {
    // 목록을 못 걸어도 메뉴는 떠야 하므로 넘어갑니다.
  }
}

/**
 * 칸을 고칠 때마다 불립니다. 두 가지를 봅니다.
 *  - 달력 탭의 연월 칸(B1)  -> 그 달 달력을 다시 그립니다
 *  - 월별 표의 이름 체크박스 -> 한 사람만 체크되게 다른 체크를 풉니다
 */
function onEdit(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet();
  if (sh.getName() === CE_TAB.CALENDAR) {
    ceOnCalendarMonthPick(e);
    return;
  }
  ceOnNamePick(e, sh);
}

/** 달력 탭의 연월 칸을 고치면 그 달로 다시 그립니다. */
function ceOnCalendarMonthPick(e) {
  if (e.range.getRow() !== CE_CAL.YM_ROW || e.range.getColumn() !== CE_CAL.YM_COL) return;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ym = ceParseYearMonth(e.range.getValue());
  if (!ym) {
    ss.toast('연월을 알아볼 수 없습니다. 2026-09 형식으로 골라 주세요.', '달력', 5);
    return;
  }
  try {
    ceRenderCalendar(ym.year, ym.month);
    ss.toast(ceFormatYearMonth(ym.year, ym.month) + ' 달력을 불러왔습니다.', '달력', 5);
  } catch (err) {
    ss.toast('달력을 그리지 못했습니다: ' + err.message, '달력', 8);
  }
}

/**
 * 이름 체크는 한 사람씩만 되게 합니다.
 * 새로 체크하면 그 표에 켜져 있던 다른 체크를 모두 풉니다.
 *
 * 체크박스 칸만 값이 참·거짓(boolean)이고 표의 다른 칸은 글자나 숫자이므로,
 * 켜진 체크박스는 '값이 true 인 칸' 으로 찾습니다.
 * 스크립트가 고친 칸은 onEdit 을 다시 부르지 않으므로 서로 물리지 않습니다.
 */
function ceOnNamePick(e, sh) {
  if (!ceIsMonthSheetName(sh.getName())) return;
  if (e.range.getNumRows() !== 1 || e.range.getNumColumns() !== 1) return;
  if (e.range.getValue() !== true) return;     // 체크를 풀 때는 할 일이 없습니다

  var row = e.range.getRow();
  var col = e.range.getColumn();
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return;

  var values = sh.getRange(1, 1, lastRow, lastCol).getValues();
  for (var r = 0; r < values.length; r++) {
    for (var c = 0; c < values[r].length; c++) {
      if (r === row - 1 && c === col - 1) continue;
      if (values[r][c] === true) sh.getRange(r + 1, c + 1).setValue(false);
    }
  }
}

function ceMenuSetup() {
  var ui = SpreadsheetApp.getUi();
  try {
    var res = ceSetupAll();
    var msg = [];
    if (res.renamed.length) msg.push('이름을 바꾼 탭: ' + res.renamed.join(', '));
    if (res.created.length) msg.push('만든 탭: ' + res.created.join(', '));
    if (res.updated.length) {
      msg.push('보완한 내용');
      for (var u = 0; u < res.updated.length; u++) msg.push('  · ' + res.updated[u]);
    }
    if (!msg.length) msg.push('필요한 탭이 이미 모두 있고, 설명도 최신입니다.');
    var stale = [];
    if (ceSS().getSheetByName('장기예외')) stale.push('장기예외');
    if (ceSS().getSheetByName('_기록')) stale.push('_기록');
    if (stale.length) {
      msg.push('');
      msg.push('※ 이제 쓰지 않는 탭이 남아 있습니다: ' + stale.join(', '));
      msg.push('   지우셔도 배정에는 아무 영향이 없습니다.');
    }

    msg.push('');
    msg.push('[로테이션] 탭에 이름을 넣고, [설정] 탭의 로테이션 시작일을 확인한 뒤');
    msg.push('[새벽설교 배정표 만들기] 를 눌러 주세요.');
    ui.alert(msg.join('\n'));
  } catch (e) {
    ui.alert('오류: ' + e.message);
  }
}

function ceMenuGenerate() {
  var ui = SpreadsheetApp.getUi();
  var now = new Date();
  var suggested = ceFormatYearMonth(now.getFullYear(), now.getMonth() + 1);

  // 달력이 보고 있는 달을 먼저 권합니다.
  var shown = ceStoreGetShownMonth() || ceCalendarYearMonth();
  if (shown) suggested = ceFormatYearMonth(shown.year, shown.month);

  var res = ui.prompt('새벽설교 배정표 만들기',
    '어느 달을 배정할까요?\n\n비워 두고 [확인] 을 누르면 ' + suggested + ' 로 배정합니다.',
    ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;

  var typed = String(res.getResponseText() || '').trim();
  var ym = typed ? ceParseYearMonth(typed) : ceParseYearMonth(suggested);
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

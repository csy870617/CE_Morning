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
var CE_USHER_PER_WEEK = 2;

/* 표 넷째 줄 [수요/토요 서브] 에 한 칸마다 몇 명을 세울지 */
var CE_SPECIAL_PER_DAY = 2;

/* 한 칸에 여러 이름을 적을 때 쓰는 구분자 */
var CE_NAME_JOIN = ', ';

/**
 * 달력에 이 말을 적으면 그날은 배정에서 통째로 빠집니다.
 * 시트 칸은 비워 두어 손으로 직접 적으실 수 있게 합니다.
 */
/* 달력에 적으면 그날 그 역할을 보통 순번에서 빼는 말들.
   휴일  -> [휴일(설교)]·[휴일(백업)] 명단에서 채웁니다
   빈칸  -> 아무도 세우지 않고 칸을 비웁니다 (손으로 적으시라는 뜻) */
var CE_HOLIDAY_NAMES = ['휴일', '휴무'];
var CE_BLANK_NAMES = ['빈칸', '없음', '직접입력'];

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

function ceIsBlankName(name) {
  return CE_BLANK_NAMES.indexOf(String(name == null ? '' : name).trim()) >= 0;
}

/** 휴일이든 빈칸이든 '사람 이름이 아닌 말' */
function ceIsOffName(name) {
  return ceIsHolidayName(name) || ceIsBlankName(name);
}

/** 그 역할에 걸린 예외 중 keep(name) 인 것이 그날에 해당하는지 */
function ceHasMark(iso, role, exceptions, keep, roleOnly) {
  for (var i = 0; i < exceptions.length; i++) {
    var ex = exceptions[i];
    if (!keep(ex.name)) continue;
    if (roleOnly ? ex.role !== role : (ex.role !== CE_ROLE.ALL && ex.role !== role)) continue;
    var end = ex.end || ex.start;
    if (iso >= ex.start && iso <= end) return true;
  }
  return false;
}

/**
 * 그날 그 역할이 '휴일' 로 잡혀 있는지.
 * 휴일인 날은 아무도 배정하지 않고, 로테이션 순번도 그대로 둡니다.
 */
function ceIsHoliday(iso, role, exceptions) {
  return ceHasMark(iso, role, exceptions, ceIsHolidayName, false);
}

/**
 * 그날 그 역할이 '빈칸' 으로 잡혀 있는지.
 * 아무도 배정하지 않고 칸을 비웁니다. 로테이션 순번도 그대로 둡니다.
 */
function ceIsBlank(iso, role, exceptions) {
  return ceHasMark(iso, role, exceptions, ceIsBlankName, false);
}

/**
 * 그 역할을 콕 집어 '휴일(현관안내)' 로 적은 경우만 봅니다.
 * 현관안내는 수요일과 토요일을 함께 맡는 주 단위 담당이라, 수요일 하루가
 * 휴일이라고 그 주 안내를 통째로 비우면 토요일이 빈손이 됩니다.
 */
function ceIsHolidayForRoleOnly(iso, role, exceptions) {
  return ceHasMark(iso, role, exceptions, ceIsOffName, true);
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
/* 한 사람이 그 달 같은 요일에 설 수 있는 횟수 (설교·방송실 각각) */
var CE_SAME_DOW_MAX = 2;

/* 메모는 표의 줄마다 따로 붙여야 하므로 역할별로 담아 둡니다. */
var CE_SAME_DOW_FIELDS = {
  preacher: { note: 'dowNoteSermon', warn: 'dowWarnSermon', label: '설교', is: '가' },
  broadcast: { note: 'dowNoteBroadcast', warn: 'dowWarnBroadcast', label: '방송실', is: '이' }
};

/**
 * 같은 사람이 그 달 같은 요일에 세 번 이상 걸리면,
 * 세 번째부터 다른 요일 담당자와 순서를 바꿉니다. 설교와 방송실에 따로 겁니다.
 *
 * 평일(월~금)끼리만 봅니다. 토요일은 명단이 따로 돌고 그 묶음 안에는
 * 토요일밖에 없어서, 순서를 어떻게 바꿔도 요일이 달라지지 않습니다.
 * 휴일 명단으로 채운 날도 건드리지 않습니다.
 */
function ceEnforceSameDowLimit(days, field, role, exceptions) {
  var spec = CE_SAME_DOW_FIELDS[field];
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
    return d[field] && d.swapGroup === 'week';
  }

  var i;
  for (i = 0; i < days.length; i++) {
    if (counts(days[i])) bump(tally, days[i].iso, days[i].dow, days[i][field], 1);
  }

  for (i = 0; i < days.length; i++) {
    var a = days[i];
    if (!counts(a)) continue;

    if (at(used, a.iso, a.dow, a[field]) < CE_SAME_DOW_MAX) {
      bump(used, a.iso, a.dow, a[field], 1);
      continue;
    }

    var b = ceFindSameDowSwap(days, i, 1, tally, field, role, exceptions) ||
            ceFindSameDowSwap(days, i, -1, tally, field, role, exceptions);
    if (b) {
      bump(tally, a.iso, a.dow, a[field], -1);
      bump(tally, b.iso, b.dow, b[field], -1);
      var tmp = a[field];
      a[field] = b[field];
      b[field] = tmp;
      bump(tally, a.iso, a.dow, a[field], 1);
      bump(tally, b.iso, b.dow, b[field], 1);

      var day = CE_DOW_NAMES[a.dow] + '요일';
      a[spec.note] = day + ' ' + spec.label + spec.is + ' 세 번째라 ' + b.iso + ' 과 순서 바꿈';
      b[spec.note] = a.iso + ' 과 순서 바꿈 (' + day + ' ' + spec.label + ' 세 번째)';
    } else {
      a[spec.warn] = CE_DOW_NAMES[a.dow] + '요일 ' + spec.label + spec.is +
        ' 그 달에 세 번 이상입니다 (바꿀 상대를 찾지 못했습니다)';
    }
    bump(used, a.iso, a.dow, a[field], 1);
  }
  return days;
}

/**
 * 같은 요일 세 번째 자리를 풀어 줄 상대를 한 방향으로 찾습니다.
 *   step  1 = 다음 날부터 뒤로,  -1 = 지난 날부터 앞으로
 * 같은 달 안에서, 요일이 다른 평일 중에서 찾습니다.
 * 맞바꾼 뒤 어느 쪽도 같은 요일 두 번을 넘지 않아야 하고,
 * 그날 설교자와 방송실이 겹치게 되거나 휴가와 부딪히면 넘어갑니다.
 */
function ceFindSameDowSwap(days, from, step, tally, field, role, exceptions) {
  var a = days[from];
  var other = field === 'preacher' ? 'broadcast' : 'preacher';
  var month = a.iso.slice(0, 7);
  function count(iso, dow, name) {
    var m = iso.slice(0, 7);
    return (tally[m] && tally[m][dow] && tally[m][dow][name]) || 0;
  }
  for (var j = from + step; j >= 0 && j < days.length; j += step) {
    var b = days[j];
    if (b.iso.slice(0, 7) !== month) break;        // 달을 넘기면서까지 찾지는 않습니다
    if (b.swapGroup !== 'week' || !b[field]) continue;
    if (b.dow === a.dow) continue;                 // 같은 요일끼리 바꾸면 뜻이 없습니다
    if (count(a.iso, a.dow, b[field]) + 1 > CE_SAME_DOW_MAX) continue;
    if (count(b.iso, b.dow, a[field]) + 1 > CE_SAME_DOW_MAX) continue;
    if (b[field] === a[other] || a[field] === b[other]) continue;
    if (!ceIsAvailable(b[field], a.iso, role, exceptions)) continue;
    if (!ceIsAvailable(a[field], b.iso, role, exceptions)) continue;
    return b;
  }
  return null;
}

/* ------------------------------------------------------------------ */

/**
 * 달이 시작할 때 저장해 둔 자리를 '지금 명단' 에 맞춰 풉니다.
 *
 *   saved = { idx: 다음 차례 자리, last: 그 앞에 선 사람 }
 *
 * 명단이 그대로면 저장된 자리를 그대로 씁니다. 중간에서 누가 빠지거나
 * 끼어들어 자리가 밀렸으면, 마지막에 선 사람을 찾아 그 다음부터 잇습니다.
 *
 * 마지막에 선 사람이 명단에서 아예 빠졌으면 한 칸 앞에서 잇습니다.
 * 그 사람이 빠지면서 뒷사람들이 한 칸씩 당겨 왔기 때문에, 원래 다음 차례였던
 * 사람이 바로 그 자리에 올라와 있습니다.
 */
function ceResolveStart(list, saved) {
  if (!list || !list.length) return 0;
  var n = list.length;
  var idx = Math.max(0, Math.min(Number(saved && saved.idx) || 0, n)) % n;
  var last = (saved && saved.last) || '';
  if (!last) return idx;

  var before = (idx - 1 + n) % n;
  if (list[before] === last) return idx;          // 그 자리 그대로

  // 같은 이름이 여럿일 수 있으니 원래 자리에서 가장 가까운 것을 씁니다
  var best = -1;
  var bestGap = n + 1;
  for (var i = 0; i < n; i++) {
    if (list[i] !== last) continue;
    var gap = Math.abs(i - before);
    if (gap < bestGap) { bestGap = gap; best = i; }
  }
  if (best >= 0) return (best + 1) % n;
  return (idx - 1 + n) % n;                        // 명단에서 빠진 사람
}

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
function ceBuildSchedule(cfg, rotations, exceptions, endIso, monthPtr) {
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

  /* 달이 바뀔 때마다 그 순간의 자리를 적어 둡니다.
     이미 적어 둔 달을 만나면 그 자리로 되돌려, 지난달 표가 지금 명단 때문에
     흔들리지 않게 합니다. */
  var lastUsed = {};
  var monthStart = {};
  var seenMonth = '';
  function crossMonth(iso) {
    var ym = iso.slice(0, 7);
    if (ym === seenMonth) return;
    seenMonth = ym;
    var saved = monthPtr && monthPtr[ym];
    var k;
    if (saved) {
      for (k in ptr) {
        if (Object.prototype.hasOwnProperty.call(ptr, k) && saved[k] !== undefined) {
          ptr[k] = saved[k];
        }
      }
    }
    var snap = {};
    for (k in ptr) {
      if (!Object.prototype.hasOwnProperty.call(ptr, k)) continue;
      snap[k] = { idx: ptr[k], last: lastUsed[k] || '' };
    }
    monthStart[ym] = snap;
  }

  /** 그날 이 역할에 쓸 명단 이름을 고릅니다. 토요 명단이 비어 있으면 평일 명단을 그대로 씁니다. */
  function groupFor(dow, weekdayKey, satKey) {
    return (satDows.indexOf(dow) >= 0 && has(satKey)) ? satKey : weekdayKey;
  }

  function take(key, iso, role) {
    var picked = cePickNext(rot[key] || [], ptr[key], iso, role, ex);
    ptr[key] = picked.ptr;
    if (picked.name) lastUsed[key] = picked.name;
    return picked.name;
  }

  /**
   * 현관안내는 한 주에 여러 명을 세웁니다.
   * busy 에 든 사람(그 주 수요백업·토요백업)과 이미 뽑은 사람은 건너뜁니다.
   * 건너뛴 사람의 차례는 소모되지 않아 다음 주에 그대로 돌아옵니다.
   */
  function takeMany(key, iso, role, count, busy) {
    var out = [];
    var blocked = (busy || []).slice();
    for (var t = 0; t < count; t++) {
      var picked = cePickNext(rot[key] || [], ptr[key], iso, role, ex, blocked);
      if (!picked.name) break;
      ptr[key] = picked.ptr;
      if (picked.name) lastUsed[key] = picked.name;
      out.push(picked.name);
      blocked.push(picked.name);
    }
    return out;
  }

  for (var d = anchor; ceIso(d) <= endIso; d = ceAddDays(d, 1)) {
    var iso = ceIso(d);
    var dow = d.getUTCDay();
    crossMonth(iso);

    if (dawnDows.indexOf(dow) >= 0) {
      var sermonKey = groupFor(dow, 'sermon', 'satSermon');
      var broadcastKey = groupFor(dow, 'broadcast', 'satBroadcast');

      var holSermon = ceIsHoliday(iso, CE_ROLE.SERMON, ex);
      var holBroadcast = ceIsHoliday(iso, CE_ROLE.BROADCAST, ex);
      var blankSermon = ceIsBlank(iso, CE_ROLE.SERMON, ex);
      var blankBroadcast = ceIsBlank(iso, CE_ROLE.BROADCAST, ex);
      var offSermon = holSermon || blankSermon;
      var offBroadcast = holBroadcast || blankBroadcast;

      // 휴일로 잡은 날은 휴일 명단으로 돕니다. 그 명단이 비어 있으면 빈칸으로 둡니다.
      // '빈칸' 으로 잡은 날은 휴일 명단도 쓰지 않고 그냥 비웁니다.
      if (holSermon) sermonKey = 'holidaySermon';
      if (holBroadcast) broadcastKey = 'holidayBroadcast';

      var preacher = (blankSermon || (holSermon && !has('holidaySermon')))
        ? '' : take(sermonKey, iso, CE_ROLE.SERMON);
      var broadcast = (blankBroadcast || (holBroadcast && !has('holidayBroadcast')))
        ? '' : take(broadcastKey, iso, CE_ROLE.BROADCAST);

      dawnDays.push({
        iso: iso,
        dow: dow,
        preacher: preacher,
        broadcast: broadcast,
        offSermon: offSermon,
        offBroadcast: offBroadcast,
        blankSermon: blankSermon,
        blankBroadcast: blankBroadcast,
        // 명단 자체가 비어 있으면 빈칸이 당연하므로 알리지 않습니다.
        // '빈칸' 으로 잡은 날도 비어 있는 것이 맞으므로 알리지 않습니다.
        // 명단은 있는데 전원 예외라 못 채운 경우만 표시합니다.
        gapSermon: !blankSermon && !preacher && has(sermonKey),
        gapBroadcast: !blankBroadcast && !broadcast && has(broadcastKey),
        smGroup: sermonKey,
        bcGroup: broadcastKey,
        // 맞바꾸기는 휴일·토요일·평일을 갈라서 봅니다. 서로 다른 명단이기 때문입니다.
        // 토요 명단을 비워 둬 평일 명단으로 돌더라도 토요일은 토요일끼리만 바꿉니다.
        swapGroup: (offSermon || offBroadcast) ? 'holiday'
          : (satDows.indexOf(dow) >= 0 ? 'sat' : 'week')
      });
    }

    if (doorDows.indexOf(dow) >= 0) {
      var blankDoor = ceIsBlank(iso, CE_ROLE.DOOR, ex);
      var offDoor = blankDoor || ceIsHoliday(iso, CE_ROLE.DOOR, ex);
      var doorNames = offDoor ? [] : takeMany('door', iso, CE_ROLE.DOOR, CE_SPECIAL_PER_DAY);
      doorDays.push({
        iso: iso, dow: dow,
        doors: doorNames, door: doorNames.join(CE_NAME_JOIN),
        offDoor: offDoor, blankDoor: blankDoor,
        gapDoor: !offDoor && has('door') && doorNames.length < CE_SPECIAL_PER_DAY
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
      var blankPraise = ceIsBlank(iso, CE_ROLE.PRAISE, ex);
      var offPraise = blankPraise || ceIsHoliday(iso, CE_ROLE.PRAISE, ex);
      var praiseNames = offPraise ? [] : takeMany('praise', iso, CE_ROLE.PRAISE, CE_SPECIAL_PER_DAY);
      praiseDays.push({
        iso: iso, dow: dow,
        praises: praiseNames, praise: praiseNames.join(CE_NAME_JOIN),
        offPraise: offPraise, blankPraise: blankPraise,
        gapPraise: !offPraise && has('praise') && praiseNames.length < CE_SPECIAL_PER_DAY
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
  function markAll(iso2, names) {
    for (var q = 0; q < names.length; q++) markBusy(iso2, names[q]);
  }
  for (bi = 0; bi < doorDays.length; bi++) markAll(doorDays[bi].iso, doorDays[bi].doors);
  for (bi = 0; bi < praiseDays.length; bi++) markAll(praiseDays[bi].iso, praiseDays[bi].praises);

  for (bi = 0; bi < usherWeeks.length; bi++) {
    var uw = usherWeeks[bi];
    uw.busy = busyInWeek[ceWeekStart(uw.iso)] || [];
    uw.ushers = uw.offUsher ? [] : takeMany('usher', uw.iso, CE_ROLE.USHER, CE_USHER_PER_WEEK, uw.busy);
    uw.gapUsher = !uw.offUsher && has('usher') && uw.ushers.length < CE_USHER_PER_WEEK;
  }

  ceResolveConflicts(dawnDays, ex);
  // 수요백업·토요백업은 그날 설교자·방송실과 겹쳐도 그대로 둡니다. 명단 순서가 우선입니다.

  // 겹침을 푼 뒤에 같은 요일 횟수를 설교·방송실 각각 정리합니다.
  ceEnforceSameDowLimit(dawnDays, 'preacher', CE_ROLE.SERMON, ex);
  ceEnforceSameDowLimit(dawnDays, 'broadcast', CE_ROLE.BROADCAST, ex);

  var byIso = {};
  function slot(iso) {
    if (!byIso[iso]) {
      byIso[iso] = {
        iso: iso, preacher: '', broadcast: '', door: '', praise: '',
        doors: [], praises: [], ushers: [],
        offSermon: false, offBroadcast: false, offDoor: false, offPraise: false, offUsher: false,
        blankSermon: false, blankBroadcast: false, blankDoor: false, blankPraise: false,
        gapSermon: false, gapBroadcast: false, gapDoor: false, gapPraise: false, gapUsher: false,
        swapNote: '', warning: '',
        dowNoteSermon: '', dowNoteBroadcast: '',
        dowWarnSermon: '', dowWarnBroadcast: ''
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
    cell.blankSermon = !!day.blankSermon;
    cell.blankBroadcast = !!day.blankBroadcast;
    cell.gapSermon = !!day.gapSermon;
    cell.gapBroadcast = !!day.gapBroadcast;
    cell.swapNote = day.swapNote || '';
    cell.warning = day.warning || '';
    cell.dowNoteSermon = day.dowNoteSermon || '';
    cell.dowNoteBroadcast = day.dowNoteBroadcast || '';
    cell.dowWarnSermon = day.dowWarnSermon || '';
    cell.dowWarnBroadcast = day.dowWarnBroadcast || '';
  }
  for (i = 0; i < doorDays.length; i++) {
    var wd = doorDays[i];
    var dc = slot(wd.iso);
    dc.door = wd.door;
    dc.doors = wd.doors;
    dc.offDoor = !!wd.offDoor;
    dc.blankDoor = !!wd.blankDoor;
    dc.gapDoor = !!wd.gapDoor;
  }
  for (i = 0; i < praiseDays.length; i++) {
    var pd = praiseDays[i];
    var pc = slot(pd.iso);
    pc.praise = pd.praise;
    pc.praises = pd.praises;
    pc.offPraise = !!pd.offPraise;
    pc.blankPraise = !!pd.blankPraise;
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
    praiseDays: praiseDays, usherWeeks: usherWeeks,
    monthStart: monthStart
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
    CE_BLANK_NAMES: CE_BLANK_NAMES,
    ceIsHolidayName: ceIsHolidayName,
    ceIsBlankName: ceIsBlankName,
    ceIsOffName: ceIsOffName,
    ceIsBlank: ceIsBlank,
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
    CE_SPECIAL_PER_DAY: CE_SPECIAL_PER_DAY,
    CE_NAME_JOIN: CE_NAME_JOIN,
    ceResolveStart: ceResolveStart,
    ceBuildSchedule: ceBuildSchedule,
    ceMonthGrid: ceMonthGrid
  };
}

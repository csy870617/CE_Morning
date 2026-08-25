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

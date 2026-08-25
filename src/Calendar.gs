/**
 * "달력(예외자)" 탭 - 한 달치 달력에 그날 빠지는 사람 이름을 적어 두는 곳.
 *
 * 여기 적힌 내용이 곧 예외 목록입니다. 따로 저장해 두는 곳은 없습니다.
 * 달을 바꿔 다시 그리면 날짜만 새로 나오고 이름 칸은 비워집니다.
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

/** 달력이 지금 어느 달을 보여 주고 있는지. 없으면 null. */
function ceCalendarYearMonth() {
  var sh = ceSheet(CE_TAB.CALENDAR, false);
  if (!sh) return null;
  return ceParseYearMonth(sh.getRange(CE_CAL.YM_ROW, CE_CAL.YM_COL).getValue());
}

/**
 * 지금 화면에 떠 있는 달력을 그대로 읽어 예외 목록을 만듭니다.
 * 이 탭에 적힌 것이 전부입니다.
 */
function ceReadCalendarExceptions() {
  var sh = ceSheet(CE_TAB.CALENDAR, false);
  if (!sh) return [];
  var ym = ceCalendarYearMonth();
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
 * 달력을 해당 연월로 다시 그립니다.
 * 날짜만 새로 채우고 이름 칸은 비워 둡니다. 이전에 적어 둔 내용은 남지 않습니다.
 */
function ceRenderCalendar(year, month) {
  var sh = ceSheet(CE_TAB.CALENDAR, true);
  var weeks = ceCalendarWeeks(year, month);
  sh.clear();
  sh.clearNotes();
  // 달마다 주 수가 5주/6주로 달라지므로 지난번 병합을 먼저 풉니다.
  sh.getRange(1, 1, sh.getMaxRows(), sh.getMaxColumns()).breakApart();

  sh.getRange(CE_CAL.YM_ROW, 1).setValue('연월').setFontWeight('bold');
  sh.getRange(CE_CAL.YM_ROW, CE_CAL.YM_COL).setValue(ceFormatYearMonth(year, month))
    .setNumberFormat('@').setFontWeight('bold').setBackground('#fff2cc');
  sh.getRange(CE_CAL.YM_ROW, 3, 1, 5).merge()
    .setValue('메뉴에서 [달력 다시 그리기] 로 달을 바꾸면 날짜만 새로 나오고 이름 칸은 비워집니다.')
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
      names.push('');
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
